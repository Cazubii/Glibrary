import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import treeKill from 'tree-kill';
import type { LogLine, ToolEntry, ToolInstallRun, ToolStatus } from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from './library-store';

const LOG_BUFFER_LIMIT = 2000;
const TOOL_LOGS_KEPT = 200;
const COMMAND_TIMEOUT_MS = 5000;
const STOP_GRACE_MS = 5000;

export type ToolEmitFn = (channel: string, payload: unknown) => void;

export interface ToolSpawnOptions {
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  windowsHide?: boolean;
}

export type ToolSpawnFn = (command: string, options: ToolSpawnOptions) => ChildProcess;
export type ToolKillFn = (pid: number, signal: string) => void;

function spawnToolCommand(command: string, options: ToolSpawnOptions): ChildProcess {
  const { args = [], ...spawnOptions } = options;
  return spawn(command, args, spawnOptions);
}

export interface ToolRunHooks {
  onOut?: (data: Buffer) => void;
  onErr?: (data: Buffer) => void;
  onExit?: (code: number | null, signal: string | null) => void;
  onError?: (error: Error) => void;
}

interface RunEntry {
  proc: ChildProcess;
  run: ToolInstallRun;
  hooks: ToolRunHooks;
  pending: { out: string; err: string };
  writeQueue: Promise<void>;
  done: Promise<void>;
  resolveDone: () => void;
  stopRequested: boolean;
  finalized: boolean;
}

export function getToolSlug(gitUrl: string): string {
  const lastSegment = new URL(gitUrl).pathname.split('/').filter(Boolean).at(-1) ?? '';
  return lastSegment.replace(/\.git$/i, '');
}

export function buildToolPrompt(tool: ToolEntry, targetDir: string): string {
  if (tool.id === 'builtin-omniroute') {
    return 'Install OmniRoute globally by running exactly: npm install -g omniroute. Verify that the command is available and report its version.';
  }
  return `Install ${tool.name} from ${tool.gitUrl}. Clone the repository into the directory ${targetDir}, then run npm install from that directory. Do not modify any other folders.`;
}

export function buildToolInstallCommand(prompt: string): string {
  return `opencode run "${prompt.replace(/"/g, '\\"')}"`;
}

export function buildHabblaudInstallScript(gitUrl: string, toolsRoot: string, targetDir: string): string {
  return `
const { spawnSync } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const gitUrl = ${JSON.stringify(gitUrl)};
const toolsRoot = ${JSON.stringify(toolsRoot)};
const targetDir = ${JSON.stringify(targetDir)};
const [major, minor] = process.versions.node.split('.').map(Number);

if (major < 22 || (major === 22 && minor < 12)) {
  console.error('O Habblaud exige Node.js 22.12 ou superior; encontrada: ' + process.versions.node);
  process.exit(1);
}

const hasGitMetadata = existsSync(join(targetDir, '.git'));
const hasPackage = existsSync(join(targetDir, 'package.json'));
if (!hasGitMetadata && !hasPackage) {
  if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
    console.error('A pasta de instalação já existe e não parece ser um clone do Habblaud: ' + targetDir);
    process.exit(1);
  }
  console.log('Clonando Habblaud…');
  const clone = spawnSync('git', ['clone', gitUrl, targetDir], {
    cwd: toolsRoot,
    stdio: 'inherit',
    windowsHide: true
  });
  if (clone.error) {
    console.error('Não foi possível executar o Git: ' + clone.error.message);
    process.exit(1);
  }
  if (clone.status !== 0) process.exit(clone.status ?? 1);
}

console.log('Instalando as dependências do Habblaud…');
const npm = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : 'npm';
const npmArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm install'] : ['install'];
const install = spawnSync(npm, npmArgs, {
  cwd: targetDir,
  stdio: 'inherit',
  windowsHide: true
});
if (install.error) {
  console.error('Não foi possível executar npm install: ' + install.error.message);
  process.exit(1);
}
process.exit(install.status ?? 1);
`;
}

export class ToolManager {
  private readonly active = new Map<string, RunEntry>();
  private readonly starting = new Set<string>();
  private readonly buffers = new Map<string, LogLine[]>();

  constructor(
    private readonly store: LibraryStore,
    private readonly toolsRoot: string,
    private readonly logsRoot: string,
    private readonly emit: ToolEmitFn,
    private readonly spawnFn: ToolSpawnFn = spawnToolCommand,
    private readonly killFn: ToolKillFn = (pid, signal) => { treeKill(pid, signal); }
  ) {}

  list(): ToolEntry[] {
    return this.store.listTools();
  }

  async getInstalledDirectory(toolId: string): Promise<string> {
    const tool = this.findTool(toolId);
    if (tool.id === 'builtin-omniroute') {
      throw new Error('OmniRoute foi instalado globalmente e não possui uma pasta local para abrir');
    }
    if (await this.detectOne(tool) !== 'installed') {
      throw new Error('Instale a ferramenta antes de abri-la');
    }
    return join(this.toolsRoot, getToolSlug(tool.gitUrl));
  }

  add(url: string): Promise<ToolEntry> {
    return this.store.addTool(url);
  }

  remove(id: string): Promise<void> {
    if (this.isBusy(id)) throw new Error('Pare a instalação ativa antes de remover esta ferramenta');
    return this.store.removeTool(id);
  }

  isBusy(toolId: string): boolean {
    if (this.starting.has(toolId)) return true;
    for (const entry of this.active.values()) {
      if (entry.run.toolId === toolId) return true;
    }
    return false;
  }

  hasActiveRunsForTool(toolId: string): boolean {
    return this.isBusy(toolId);
  }

  getLogs(runId: string): LogLine[] {
    return [...(this.buffers.get(runId) ?? [])];
  }

  /** Hooks do processo ativo, usados para observar saída e encerramento nos testes. */
  getActiveHooks(runId: string): ToolRunHooks | undefined {
    return [...this.active.values()].find((entry) => entry.run.id === runId)?.hooks;
  }

  async detect(toolId: string): Promise<ToolStatus>;
  async detect(): Promise<Record<string, ToolStatus>>;
  async detect(toolId?: string): Promise<ToolStatus | Record<string, ToolStatus>> {
    if (toolId != null) {
      const tool = this.findTool(toolId);
      return this.detectOne(tool);
    }

    const statuses: Record<string, ToolStatus> = {};
    await Promise.all(this.list().map(async (tool) => {
      statuses[tool.id] = await this.detectOne(tool);
    }));
    return statuses;
  }

  async install(toolId: string): Promise<ToolInstallRun> {
    const tool = this.findTool(toolId);
    if (this.isBusy(toolId)) throw new Error('Esta ferramenta já está sendo instalada');
    this.starting.add(toolId);
    try {
      await fs.mkdir(this.toolsRoot, { recursive: true });
      const openCodeAvailable = await this.checkCommand('opencode --version', COMMAND_TIMEOUT_MS);
      const directHabblaudInstall = tool.id === 'builtin-habblaud' && !openCodeAvailable;
      if (!openCodeAvailable && !directHabblaudInstall) {
        throw new Error('OpenCode não encontrado no PATH');
      }

      if (directHabblaudInstall) {
        if (!(await this.checkCommand('git --version', COMMAND_TIMEOUT_MS))) {
          throw new Error('Git não encontrado no PATH; instale o Git antes de instalar o Habblaud');
        }
        if (!(await this.checkCommand('node --version', COMMAND_TIMEOUT_MS)) ||
            !(await this.checkCommand('npm --version', COMMAND_TIMEOUT_MS))) {
          throw new Error('Node.js e npm são necessários para instalar o Habblaud');
        }
      }

      const targetDir = join(this.toolsRoot, getToolSlug(tool.gitUrl));
      const prompt = buildToolPrompt(tool, targetDir);
      const command = directHabblaudInstall
        ? `git clone ${tool.gitUrl} "${targetDir}" && npm install`
        : buildToolInstallCommand(prompt);
      const runId = randomUUID();
      const logFile = join(this.logsRoot, `${tool.id}-${runId}.log`);
      const startedAt = new Date().toISOString();
      const run: ToolInstallRun = {
        id: runId,
        toolId: tool.id,
        toolName: tool.name,
        command,
        status: 'running',
        startedAt,
        logFile,
        prompt
      };

      await fs.mkdir(this.logsRoot, { recursive: true });
      await fs.writeFile(logFile, `${startedAt} ${tool.name}: ${command}\n`, 'utf8');
      await this.pruneLogs();

      let resolveDone = (): void => undefined;
      const done = new Promise<void>((resolve) => { resolveDone = resolve; });
      const hooks: ToolRunHooks = {};
      const proc = directHabblaudInstall
        ? this.spawnFn('node', {
          args: ['-e', buildHabblaudInstallScript(tool.gitUrl, this.toolsRoot, targetDir)],
          cwd: this.toolsRoot,
          windowsHide: true
        })
        : this.spawnFn(command, { cwd: this.toolsRoot, shell: true, windowsHide: true });
      const entry: RunEntry = {
        proc,
        run,
        hooks,
        pending: { out: '', err: '' },
        writeQueue: Promise.resolve(),
        done,
        resolveDone,
        stopRequested: false,
        finalized: false
      };
      this.active.set(run.id, entry);
      this.starting.delete(toolId);

      hooks.onOut = (data) => this.capture(entry, 'out', data);
      hooks.onErr = (data) => this.capture(entry, 'err', data);
      hooks.onExit = (code) => { void this.finish(entry, code); };
      hooks.onError = (error) => {
        this.appendLine(entry, 'err', error.message);
        void this.finish(entry, 1);
      };
      proc.stdout?.on('data', hooks.onOut);
      proc.stderr?.on('data', hooks.onErr);
      proc.on('exit', hooks.onExit);
      proc.on('error', hooks.onError);
      this.emit(IpcChannels.toolRunsChanged, run);
      return run;
    } catch (error) {
      this.starting.delete(toolId);
      throw error;
    }
  }

  async stop(runId: string): Promise<void> {
    const entry = this.active.get(runId);
    if (entry == null) return;
    entry.stopRequested = true;
    if (entry.proc.pid != null) this.killFn(entry.proc.pid, 'SIGTERM');
    else entry.proc.kill('SIGTERM');

    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, STOP_GRACE_MS);
      void entry.done.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });
    if (!entry.finalized) await this.finish(entry, null);
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.active.keys()].map((runId) => this.stop(runId)));
  }

  private findTool(toolId: string): ToolEntry {
    const tool = this.store.listTools().find((entry) => entry.id === toolId);
    if (tool == null) throw new Error('Ferramenta não encontrada');
    return tool;
  }

  private async detectOne(tool: ToolEntry): Promise<ToolStatus> {
    if (this.isBusy(tool.id)) return 'installing';
    if (tool.id === 'builtin-omniroute') {
      return (await this.checkCommand('omniroute --version', COMMAND_TIMEOUT_MS)) ? 'installed' : 'not_installed';
    }
    const toolDirectory = join(this.toolsRoot, getToolSlug(tool.gitUrl));
    try {
      await fs.access(join(toolDirectory, '.git'));
      return 'installed';
    } catch {
      // Repositórios sem package.json também são instalações válidas.
    }
    try {
      const packageFile = join(toolDirectory, 'package.json');
      const info = await fs.stat(packageFile);
      return info.isFile() ? 'installed' : 'not_installed';
    } catch {
      return 'not_installed';
    }
  }

  private checkCommand(command: string, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      let proc: ChildProcess | null;
      try { proc = this.spawnFn(command, { cwd: this.toolsRoot, shell: true, windowsHide: true }); }
      catch { proc = null; }
      if (proc == null) {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { proc.kill('SIGTERM'); } catch { /* o processo pode já ter encerrado */ }
        resolve(false);
      }, timeoutMs);
      const finish = (available: boolean): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(available);
      };
      proc.on('error', () => finish(false));
      proc.on('exit', (code) => finish(code === 0));
    });
  }

  private capture(entry: RunEntry, stream: 'out' | 'err', data: Buffer): void {
    if (entry.finalized) return;
    const combined = entry.pending[stream] + data.toString('utf8');
    const lines = combined.split(/\r?\n/);
    entry.pending[stream] = lines.pop() ?? '';
    for (const line of lines) this.appendLine(entry, stream, line);
  }

  private flushPending(entry: RunEntry): void {
    for (const stream of ['out', 'err'] as const) {
      const pending = entry.pending[stream];
      if (pending !== '') {
        entry.pending[stream] = '';
        this.appendLine(entry, stream, pending);
      }
    }
  }

  private appendLine(entry: RunEntry, stream: 'out' | 'err', text: string): void {
    const line: LogLine = { ts: new Date().toISOString(), stream, text };
    const buffer = this.buffers.get(entry.run.id) ?? [];
    buffer.push(line);
    if (buffer.length > LOG_BUFFER_LIMIT) buffer.splice(0, buffer.length - LOG_BUFFER_LIMIT);
    this.buffers.set(entry.run.id, buffer);
    const serialized = `${line.ts} [${stream}] ${line.text}\n`;
    entry.writeQueue = entry.writeQueue
      .then(() => fs.appendFile(entry.run.logFile, serialized, 'utf8'))
      .catch(() => undefined);
    this.emit(IpcChannels.toolRunsLog, { id: entry.run.id, line });
  }

  private async finish(entry: RunEntry, code: number | null): Promise<void> {
    if (entry.finalized) return;
    entry.finalized = true;
    this.flushPending(entry);
    await entry.writeQueue;
    const status: ToolInstallRun['status'] = entry.stopRequested
      ? 'stopped'
      : code === 0 ? 'done' : 'error';
    const run: ToolInstallRun = {
      ...entry.run,
      status,
      finishedAt: new Date().toISOString(),
      ...(code != null ? { exitCode: code } : {})
    };
    entry.run = run;
    this.active.delete(run.id);
    this.emit(IpcChannels.toolRunsChanged, run);
    entry.resolveDone();
  }

  private async pruneLogs(): Promise<void> {
    const files = await fs.readdir(this.logsRoot, { withFileTypes: true });
    const logFiles = await Promise.all(files
      .filter((file) => file.isFile() && file.name.endsWith('.log'))
      .map(async (file) => {
        const path = join(this.logsRoot, file.name);
        const stat = await fs.stat(path);
        return { path, mtimeMs: stat.mtimeMs };
      }));
    logFiles.sort((left, right) => left.mtimeMs - right.mtimeMs);
    const excess = logFiles.length - TOOL_LOGS_KEPT;
    await Promise.all(logFiles.slice(0, Math.max(0, excess)).map(({ path }) => fs.rm(path, { force: true })));
  }
}
