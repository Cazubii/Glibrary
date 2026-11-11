import { spawn, type ChildProcess } from 'child_process';
import { createWriteStream, promises as fs, type WriteStream } from 'fs';
import { randomUUID } from 'crypto';
import { join } from 'path';
import treeKill from 'tree-kill';
import type { AgentProfile, AgentRun, LogLine } from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from './library-store';
import type { AgentRunStore } from './agent-run-store';

const BUFFER_LIMIT = 5000;
const KILL_GRACE_MS = 5000;
const STDERR_TAIL = 20;
const AGENT_LOGS_KEPT = 200;

export type AgentEmitFn = (channel: string, payload: unknown) => void;

export interface AgentSpawnOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
}

export type SpawnFn = (command: string, options: AgentSpawnOptions) => ChildProcess;
export type KillFn = (pid: number, signal: string) => void;

interface RunHooks {
  onOut?: (d: Buffer) => void;
  onErr?: (d: Buffer) => void;
  onExit?: (code: number | null, signal: string | null) => void;
}

interface RunEntry {
  proc: ChildProcess;
  run: AgentRun;
  logStream: WriteStream | null;
  stderrTail: string[];
  stopRequested: boolean;
  hooks: RunHooks;
}

/** Monta a linha de comando do agente: command + args + prompt citado como último argumento. */
export function buildAgentCommand(profile: AgentProfile, prompt?: string): string {
  const parts = [profile.command, ...profile.args];
  if (prompt != null && prompt.trim() !== '') {
    parts.push(`"${prompt.replace(/"/g, '\\"')}"`);
  }
  return parts.join(' ');
}

export class AgentRunManager {
  private readonly active = new Map<string, RunEntry>();
  private readonly buffers = new Map<string, LogLine[]>();

  constructor(
    private readonly store: LibraryStore,
    private readonly runStore: AgentRunStore,
    private readonly logsRoot: string,
    private readonly emit: AgentEmitFn,
    private readonly spawnFn: SpawnFn = spawn,
    private readonly killFn: KillFn = (pid, signal) => treeKill(pid, signal),
  ) {}

  listProfiles(): AgentProfile[] {
    return this.store.listAgentProfiles();
  }

  listRuns(): AgentRun[] {
    return this.runStore.list();
  }

  hasActiveRunsForProfile(profileId: string): boolean {
    for (const entry of this.active.values()) {
      if (entry.run.profileId === profileId) return true;
    }
    return false;
  }

  getLogs(runId: string): LogLine[] {
    return this.buffers.get(runId) ?? [];
  }

  /** Hooks do processo ativo (usado pelos testes para simular saída/erro). */
  getActiveHooks(runId: string): RunHooks | undefined {
    return this.active.get(runId)?.hooks;
  }

  async start(profileId: string, prompt?: string): Promise<AgentRun> {
    const profile = this.store.listAgentProfiles().find((p) => p.id === profileId);
    if (profile == null) throw new Error('Perfil não encontrado');
    const repo = this.store.getRepo(profile.repoId);
    if (repo == null) throw new Error('Repositório não encontrado');
    if (repo.localPath == null || repo.localPath === '') throw new Error('Repositório sem pasta local');

    const command = buildAgentCommand(profile, prompt);
    const run: AgentRun = {
      id: randomUUID(),
      profileId: profile.id,
      profileName: profile.name,
      repoId: repo.id,
      repoName: repo.name,
      command,
      ...(prompt != null && prompt.trim() !== '' ? { prompt } : {}),
      status: 'running',
      startedAt: new Date().toISOString(),
      logFile: ''
    };

    const logFile = await this.openLogFile(run.id, repo.name);
    run.logFile = logFile?.path ?? '';

    const proc = this.spawnFn(command, {
      cwd: repo.localPath,
      env: { ...process.env, FORCE_COLOR: '1' },
      shell: true
    });

    const entry: RunEntry = {
      proc, run,
      logStream: logFile?.stream ?? null,
      stderrTail: [],
      stopRequested: false,
      hooks: {}
    };
    this.active.set(run.id, entry);
    this.buffers.set(run.id, []);

    // Handlers ficam no entry.hooks para que o processo e os testes os acionem pela mesma via.
    const hooks = entry.hooks;
    hooks.onOut = (data: Buffer) => this.onData(entry, 'out', data);
    hooks.onErr = (data: Buffer) => this.onData(entry, 'err', data);
    hooks.onExit = (code: number | null, signal: string | null) => {
      const exitCode = code ?? (signal != null ? 1 : 0);
      this.finish(entry, exitCode).catch(() => undefined);
    };

    proc.stdout?.on('data', (data: Buffer) => { hooks.onOut?.(data); });
    proc.stderr?.on('data', (data: Buffer) => { hooks.onErr?.(data); });
    proc.on('error', (err: Error) => this.pushLine(entry, { stream: 'err', text: err.message }));
    proc.on('exit', (code: number | null, signal: string | null) => { hooks.onExit?.(code, signal); });

    this.pushLine(entry, { stream: 'sys', text: `> ${command}` });
    await this.runStore.upsert({ ...entry.run });
    await this.store.updateAgentProfile(profile.id, { lastRunAt: new Date().toISOString() });
    this.emitChanged({ ...entry.run });
    return { ...entry.run };
  }

  async stop(runId: string): Promise<void> {
    const entry = this.active.get(runId);
    if (entry == null) return;
    entry.stopRequested = true;
    const pid = entry.proc.pid;
    if (pid == null) {
      entry.proc.kill('SIGTERM');
      return;
    }
    this.killFn(pid, 'SIGTERM');
    entry.proc.kill('SIGTERM');
    setTimeout(() => {
      if (this.active.get(runId) === entry && entry.proc.exitCode == null) {
        this.killFn(pid, 'SIGKILL');
      }
    }, KILL_GRACE_MS);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.active.keys()].map((id) => this.stop(id)));
    const deadline = Date.now() + KILL_GRACE_MS + 2000;
    while (this.active.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    for (const [id, entry] of this.active) {
      const pid = entry.proc.pid;
      if (pid != null) this.killFn(pid, 'SIGKILL');
      this.active.delete(id);
    }
  }

  private onData(entry: RunEntry, stream: 'out' | 'err', data: Buffer): void {
    for (const line of data.toString('utf-8').split(/\r?\n/)) {
      if (line === '') continue;
      if (stream === 'err') {
        entry.stderrTail.push(line);
        if (entry.stderrTail.length > STDERR_TAIL) entry.stderrTail.shift();
      }
      this.pushLine(entry, { stream, text: line });
    }
  }

  private pushLine(entry: RunEntry, partial: Omit<LogLine, 'ts'>): void {
    const line: LogLine = { ts: new Date().toISOString(), ...partial };
    const buffer = this.buffers.get(entry.run.id);
    if (buffer != null) {
      buffer.push(line);
      if (buffer.length > BUFFER_LIMIT) buffer.splice(0, buffer.length - BUFFER_LIMIT);
    }
    entry.logStream?.write(`[${line.ts}] ${line.text}\n`);
    this.emit(IpcChannels.agentRunsLog, { id: entry.run.id, line });
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
      const run: AgentRun = { ...entry.run };
      run.exitCode = code;
      run.finishedAt = new Date().toISOString();
      run.durationMs = Math.max(0, Date.now() - Date.parse(run.startedAt));
      if (entry.stopRequested) run.status = 'stopped';
      else if (code === 0) run.status = 'done';
      else {
        run.status = 'error';
        const tail = entry.stderrTail.join('\n');
        if (tail !== '') run.lastError = tail;
      }
      entry.run = run;
      await this.runStore.upsert(run);
      this.emitChanged(run);
    } finally {
      this.active.delete(entry.run.id);
    }
  }

  private emitChanged(run: AgentRun): void {
    this.emit(IpcChannels.agentRunsChanged, run);
  }

  private async openLogFile(runId: string, repoName: string): Promise<{ path: string; stream: WriteStream } | null> {
    try {
      await fs.mkdir(this.logsRoot, { recursive: true });
      const filePath = join(this.logsRoot, `${runId}.log`);
      const stream = createWriteStream(filePath, { flags: 'a' });
      stream.write(`# ${repoName} — agente — ${new Date().toISOString()}\n`);
      await this.pruneLogs();
      return { path: filePath, stream };
    } catch {
      return null;
    }
  }

  private async pruneLogs(): Promise<void> {
    try {
      const names = (await fs.readdir(this.logsRoot)).filter((n) => n.endsWith('.log'));
      if (names.length <= AGENT_LOGS_KEPT) return;
      const stats = await Promise.all(names.map(async (n) => {
        const full = join(this.logsRoot, n);
        return { full, at: (await fs.stat(full)).mtimeMs };
      }));
      stats.sort((a, b) => a.at - b.at);
      await Promise.all(stats.slice(0, stats.length - AGENT_LOGS_KEPT).map((s) => fs.unlink(s.full).catch(() => undefined)));
    } catch {
      // melhor esforço
    }
  }
}
