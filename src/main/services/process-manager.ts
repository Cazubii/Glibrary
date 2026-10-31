import { spawn, type ChildProcess } from 'child_process';
import { createWriteStream, promises as fs, type WriteStream } from 'fs';
import { join } from 'path';
import treeKill from 'tree-kill';
import type {
  CommandSpec,
  LogLine,
  ProcessKind,
  Repo,
  RunHandle
} from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from './library-store';

const BUFFER_LIMIT = 5000;
const LOG_FILES_KEPT = 10;
const KILL_GRACE_MS = 5000;
const URL_PATTERN = /https?:\/\/(?:localhost|127\.0\.0\.1):\d+(?:\/\S*)?/;

export type EmitFn = (channel: string, payload: unknown) => void;

interface RunEntry {
  proc: ChildProcess;
  kind: ProcessKind;
  repoId: string;
  logStream: WriteStream | null;
  stderrTail: string[];
  stopRequested: boolean;
  urlDetected: boolean;
}

export class ProcessManager {
  private readonly active = new Map<string, RunEntry>();
  private readonly buffers = new Map<string, LogLine[]>();

  constructor(
    private readonly store: LibraryStore,
    private readonly logsRoot: string,
    private readonly emit: EmitFn,
  ) {}

  isRunning(repoId: string): boolean {
    return this.active.has(repoId);
  }

  runningRepoIds(): string[] {
    return [...this.active.keys()];
  }

  getLogs(repoId: string): LogLine[] {
    return this.buffers.get(repoId) ?? [];
  }

  async run(repoId: string, kind: ProcessKind, spec: CommandSpec): Promise<RunHandle> {
    if (this.active.has(repoId)) {
      throw new Error('Já existe um processo rodando para este repositório');
    }
    const repo = this.store.getRepo(repoId);
    if (repo == null) throw new Error('Repositório não encontrado');

    const cwd = this.resolveCwd(repo, spec);
    const logFile = await this.openLogFile(repoId, kind, repo.name);

    const proc = spawn(spec.command, {
      cwd,
      env: { ...process.env, ...(spec.env ?? {}), FORCE_COLOR: '1' },
      shell: true
    });

    const entry: RunEntry = {
      proc,
      kind,
      repoId,
      logStream: logFile?.stream ?? null,
      stderrTail: [],
      stopRequested: false,
      urlDetected: false
    };
    this.active.set(repoId, entry);

    void this.store.updateRepo(repoId, {
      status: kind === 'install' ? 'installing' : kind === 'start' ? 'running' : repo.status,
      lastRunAt: new Date().toISOString()
    });
    if (kind === 'install' || kind === 'start') {
      this.emit(IpcChannels.repoStatusChanged, {
        id: repoId,
        status: kind === 'install' ? 'installing' : 'running'
      });
    }

    this.pushLine(entry, { stream: 'sys', text: `> ${spec.command}` });

    proc.stdout?.on('data', (data: Buffer) => this.onData(entry, 'out', data));
    proc.stderr?.on('data', (data: Buffer) => this.onData(entry, 'err', data));

    proc.on('error', (err) => {
      this.pushLine(entry, { stream: 'err', text: err.message });
    });

    proc.on('exit', (code, signal) => {
      const exitCode = code ?? (signal != null ? 1 : 0);
      this.pushLine(entry, {
        stream: 'sys',
        text: `processo finalizado (código ${exitCode})`
      });
      this.finish(entry, exitCode).catch(() => undefined);
    });

    return {
      pid: proc.pid ?? -1,
      logFile: logFile?.path ?? null
    };
  }

  async stop(repoId: string): Promise<void> {
    const entry = this.active.get(repoId);
    if (entry == null) return;
    entry.stopRequested = true;
    const pid = entry.proc.pid;
    if (pid == null) {
      entry.proc.kill('SIGTERM');
      return;
    }
    treeKill(pid, 'SIGTERM');
    setTimeout(() => {
      if (this.active.get(repoId) === entry && entry.proc.exitCode == null) {
        treeKill(pid, 'SIGKILL');
      }
    }, KILL_GRACE_MS);
  }

  async stopAll(): Promise<void> {
    await Promise.all(this.runningRepoIds().map((id) => this.stop(id)));
    const deadline = Date.now() + KILL_GRACE_MS + 2000;
    while (this.active.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (const [id, entry] of this.active) {
      const pid = entry.proc.pid;
      if (pid != null) treeKill(pid, 'SIGKILL');
      this.active.delete(id);
    }
  }

  private resolveCwd(repo: Repo, spec: CommandSpec): string {
    const base = repo.localPath ?? process.cwd();
    return spec.cwd != null && spec.cwd !== '' && spec.cwd !== '.'
      ? join(base, spec.cwd)
      : base;
  }

  private async openLogFile(
    repoId: string,
    kind: ProcessKind,
    repoName: string,
  ): Promise<{ path: string; stream: WriteStream } | null> {
    try {
      const dir = join(this.logsRoot, repoId);
      await fs.mkdir(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filePath = join(dir, `${stamp}-${kind}.log`);
      const stream = createWriteStream(filePath, { flags: 'a' });
      stream.write(`# ${repoName} — ${kind} — ${new Date().toISOString()}\n`);
      await this.pruneLogs(dir);
      return { path: filePath, stream };
    } catch {
      return null;
    }
  }

  private async pruneLogs(dir: string): Promise<void> {
    try {
      const names = (await fs.readdir(dir)).filter((n) => n.endsWith('.log')).sort().reverse();
      await Promise.all(names.slice(LOG_FILES_KEPT).map((n) => fs.unlink(join(dir, n)).catch(() => undefined)));
    } catch {
      // melhor esforço
    }
  }

  private onData(entry: RunEntry, stream: 'out' | 'err', data: Buffer): void {
    const text = data.toString('utf-8');
    for (const line of text.split(/\r?\n/)) {
      if (line === '') continue;
      if (stream === 'err') {
        entry.stderrTail.push(line);
        if (entry.stderrTail.length > 20) entry.stderrTail.shift();
      }
      this.pushLine(entry, { stream, text: line });
      this.detectUrl(entry, line);
    }
  }

  private detectUrl(entry: RunEntry, line: string): void {
    if (entry.urlDetected) return;
    const match = URL_PATTERN.exec(line);
    if (match == null) return;
    entry.urlDetected = true;
    const openUrl = match[0].replace(/[.,;)]*$/, '');
    void this.store.updateRepo(entry.repoId, { openUrl });
    this.pushLine(entry, { stream: 'sys', text: `URL detectada: ${openUrl}` });
  }

  private pushLine(entry: RunEntry, partial: Omit<LogLine, 'ts'>): void {
    const line: LogLine = { ts: new Date().toISOString(), ...partial };
    let buffer = this.buffers.get(entry.repoId);
    if (buffer == null) {
      buffer = [];
      this.buffers.set(entry.repoId, buffer);
    }
    buffer.push(line);
    if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT);
    entry.logStream?.write(`[${line.ts}] ${line.text}\n`);
    this.emit(IpcChannels.processLog, { id: entry.repoId, line });
  }

  private async finish(entry: RunEntry, code: number): Promise<void> {
    try {
      const logStream = entry.logStream;
      if (logStream != null) {
        logStream.end();
        if (!logStream.closed) {
          await new Promise<void>((resolve) => logStream.once('close', resolve));
        }
      }

      const repo = this.store.getRepo(entry.repoId);
      if (repo == null) return;

      const patch: Partial<Repo> = {};
      if (entry.kind === 'install') {
        if (code === 0) {
          patch.status = 'installed';
          patch.installedAt = new Date().toISOString();
        } else {
          patch.status = 'error';
          patch.lastError = entry.stderrTail.join('\n');
        }
      } else if (entry.kind === 'start') {
        if (entry.stopRequested || code === 0) {
          patch.status = 'installed';
        } else {
          patch.status = 'error';
          patch.lastError = entry.stderrTail.join('\n');
        }
      } else if (code !== 0) {
        patch.lastError = entry.stderrTail.join('\n');
      }

      if (Object.keys(patch).length > 0) {
        await this.store.updateRepo(entry.repoId, patch);
        if (patch.status != null) {
          this.emit(IpcChannels.repoStatusChanged, { id: entry.repoId, status: patch.status });
        }
      }
      this.emit(IpcChannels.processExit, { id: entry.repoId, code });
    } finally {
      this.active.delete(entry.repoId);
    }
  }
}
