import { spawn, type ChildProcess } from 'child_process';
import { createWriteStream, promises as fs, type WriteStream } from 'fs';
import { randomUUID } from 'crypto';
import { isAbsolute, join, resolve } from 'path';
import treeKill from 'tree-kill';
import type { AgentActivity, AgentChangesResolution, AgentProfile, AgentProvider, AgentRun, AgentSubagent, AgentTokenUsage, GitChangePreview, LogLine } from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from './library-store';
import type { AgentRunStore } from './agent-run-store';
import { GitService } from './git-service';
import { evaluateAgentBudget } from './git-protection';
import { startClaudeTelemetryReceiver, type AgentTelemetryUpdate, type ClaudeTelemetryReceiver } from './agent-telemetry';

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
  monitor?: ClaudeTelemetryReceiver;
  outputPending: string;
  baselinePaths: Set<string> | null;
}

/** Monta a linha de comando do agente: command + args + prompt citado como último argumento. */
export function buildAgentCommand(profile: AgentProfile, prompt?: string, provider: AgentProvider = 'generic'): string {
  const parts = [profile.command, ...profile.args];
  if (provider === 'opencode') {
    const formatArg = parts.findIndex((part) => part === '--format');
    const inlineFormatArg = parts.findIndex((part) => part.startsWith('--format='));
    if (formatArg >= 0) parts[formatArg + 1] = 'json';
    else if (inlineFormatArg >= 0) parts[inlineFormatArg] = '--format=json';
    else parts.push('--format', 'json');
  }
  if (prompt != null && prompt.trim() !== '') {
    parts.push(`"${prompt.replace(/"/g, '\\"')}"`);
  }
  return parts.join(' ');
}

function resolveProvider(profile: AgentProfile): AgentProvider {
  const choice = profile.monitorProvider ?? 'auto';
  if (choice !== 'auto') return choice;
  const command = profile.command.trim().split(/\s+/)[0]?.split(/[\\/]/).at(-1)?.replace(/\.exe$/i, '').toLowerCase() ?? '';
  if (command === 'claude') return 'claude-code';
  if (command === 'opencode') return 'opencode';
  return 'generic';
}

function safeName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const result = value.replace(/[\r\n\t]/g, ' ').trim().slice(0, 100);
  return result === '' ? fallback : result;
}

function numberAt(record: Record<string, unknown> | undefined, key: string): number {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function recordAt(record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = record?.[key];
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function runDayKey(run: AgentRun): string | null {
  const date = new Date(run.startedAt);
  return Number.isNaN(date.getTime()) ? null : localDayKey(date);
}

export class AgentRunManager {
  private readonly active = new Map<string, RunEntry>();
  private readonly buffers = new Map<string, LogLine[]>();
  private readonly persistQueues = new Map<string, Promise<void>>();
  private readonly resolvingChanges = new Set<string>();

  constructor(
    private readonly store: LibraryStore,
    private readonly runStore: AgentRunStore,
    private readonly logsRoot: string,
    private readonly emit: AgentEmitFn,
    private readonly spawnFn: SpawnFn = spawn,
    private readonly killFn: KillFn = (pid, signal) => treeKill(pid, signal),
    private readonly git: GitService = new GitService(),
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

  async getAgentChanges(runId: string): Promise<GitChangePreview> {
    const run = this.findRun(runId);
    if (run.status === 'running') throw new Error('Aguarde o agente terminar antes de revisar os arquivos.');
    const changes = run.agentChanges ?? [];
    if (changes.length === 0) throw new Error('Esta execução não tem alterações pendentes para revisar.');
    const workingPath = await this.resolveRunWorkingPath(run);
    return this.git.previewChanges(workingPath, changes.map((change) => change.path));
  }

  async resolveAgentChanges(runId: string, action: 'keep' | 'discard'): Promise<AgentChangesResolution> {
    if (this.resolvingChanges.has(runId)) throw new Error('Aguarde a resolução atual das alterações.');
    this.resolvingChanges.add(runId);
    try {
      const run = this.findRun(runId);
      if (run.status === 'running') throw new Error('Aguarde o agente terminar antes de resolver as alterações.');
      const changes = run.agentChanges ?? [];
      if (changes.length === 0) throw new Error('Esta execução não tem alterações pendentes para resolver.');

      let discarded: string[] = [];
      let skipped: string[] = [];
      if (action === 'discard') {
        const workingPath = await this.resolveRunWorkingPath(run);
        ({ discarded, skipped } = await this.git.discardAgentChanges(workingPath, changes));
      }

      const remaining = changes.filter((change) => skipped.includes(change.path));
      const resolved: AgentRun = { ...run };
      if (remaining.length > 0) resolved.agentChanges = remaining;
      else delete resolved.agentChanges;
      await this.runStore.upsert(resolved);
      this.emitChanged(resolved);
      return { run: resolved, discarded, skipped };
    } finally {
      this.resolvingChanges.delete(runId);
    }
  }

  private findRun(runId: string): AgentRun {
    const run = this.runStore.list().find((candidate) => candidate.id === runId);
    if (run == null) throw new Error('Execução de agente não encontrada.');
    return run;
  }

  private async resolveRunWorkingPath(run: AgentRun): Promise<string> {
    if (run.cwd == null || !isAbsolute(run.cwd)) throw new Error('A pasta desta execução não pode ser confirmada com segurança.');
    const repo = this.store.getRepo(run.repoId);
    if (repo == null) throw new Error('O projeto desta execução não existe mais na biblioteca.');
    const approvedPaths = [repo.localPath, repo.devSession?.workspacePath]
      .filter((path): path is string => path != null && path.trim() !== '');
    const requestedPath = await fs.realpath(resolve(run.cwd));
    const canonicalPaths = await Promise.all(approvedPaths.map((path) => fs.realpath(path).catch(() => null)));
    const comparisonPath = (path: string): string => process.platform === 'win32' ? path.toLocaleLowerCase('en-US') : path;
    if (!canonicalPaths.some((path) => path != null && comparisonPath(path) === comparisonPath(requestedPath))) {
      throw new Error('A pasta da execução não corresponde mais ao projeto salvo. Nenhum arquivo foi alterado.');
    }
    return requestedPath;
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
    const workingPath = repo.devSession?.workspacePath?.trim() || repo.localPath;
    if (workingPath == null || workingPath === '') throw new Error('Repositório sem pasta local');

    const provider = resolveProvider(profile);
    const settings = this.store.getSettings();
    const hasBudgetLimit = settings.agentRunBudgetUsd != null || settings.agentDailyBudgetUsd != null;
    if (hasBudgetLimit && provider === 'generic') {
      throw new Error('Este comando não informa o custo ao Glibrary. Use Claude Code ou OpenCode monitorado, ou remova o limite de gasto.');
    }
    const now = new Date();
    if (settings.agentDailyBudgetUsd != null && this.dailyCost(localDayKey(now)) >= settings.agentDailyBudgetUsd) {
      throw new Error('O limite diário de gasto já foi atingido. Ajuste o limite nas Configurações ou tente novamente amanhã.');
    }
    if (!settings.showAdvancedResources) await this.git.ensureWorkingBranch(workingPath, prompt, now);
    const baselinePaths = await this.git.listChanges(workingPath)
      .then((status) => new Set(status.files.map((file) => file.path)))
      .catch(() => null);
    const command = buildAgentCommand(profile, prompt, provider);
    const run: AgentRun = {
      id: randomUUID(),
      profileId: profile.id,
      profileName: profile.name,
      repoId: repo.id,
      repoName: repo.name,
      cwd: workingPath,
      provider,
      command: provider === 'generic' ? command : `${provider === 'claude-code' ? 'Claude Code' : 'OpenCode'} · monitoramento local`,
      ...(provider === 'generic' && prompt != null && prompt.trim() !== '' ? { prompt } : {}),
      ...(provider !== 'generic' ? { activity: [], subagents: [] } : {}),
      status: 'running',
      startedAt: new Date().toISOString(),
      logFile: ''
    };

    const logFile = await this.openLogFile(run.id, repo.name);
    run.logFile = logFile?.path ?? '';

    const monitor = provider === 'claude-code'
      ? await startClaudeTelemetryReceiver((update) => { void this.onClaudeTelemetry(run.id, update); })
      : undefined;

    const environment: NodeJS.ProcessEnv = { ...process.env, FORCE_COLOR: '1' };
    if (monitor != null) {
      const existingAttributes = environment.OTEL_RESOURCE_ATTRIBUTES?.trim();
      environment.CLAUDE_CODE_ENABLE_TELEMETRY = '1';
      environment.OTEL_METRICS_EXPORTER = 'otlp';
      environment.OTEL_LOGS_EXPORTER = 'otlp';
      environment.OTEL_EXPORTER_OTLP_PROTOCOL = 'http/json';
      environment.OTEL_EXPORTER_OTLP_ENDPOINT = monitor.endpoint;
      environment.OTEL_METRIC_EXPORT_INTERVAL = '3000';
      environment.OTEL_METRICS_INCLUDE_SESSION_ID = 'true';
      environment.OTEL_METRICS_INCLUDE_ACCOUNT_UUID = 'true';
      environment.OTEL_LOG_USER_PROMPTS = '0';
      environment.OTEL_LOG_ASSISTANT_RESPONSES = '0';
      environment.OTEL_LOG_TOOL_DETAILS = '0';
      environment.OTEL_RESOURCE_ATTRIBUTES = [existingAttributes, `glibrary.run_id=${run.id}`].filter(Boolean).join(',');
    }

    let proc: ChildProcess;
    try {
      proc = this.spawnFn(command, {
        cwd: workingPath,
        env: environment,
        shell: true
      });
    } catch (error) {
      await monitor?.close().catch(() => undefined);
      throw error;
    }

    const entry: RunEntry = {
      proc, run,
      logStream: logFile?.stream ?? null,
      stderrTail: [],
      stopRequested: false,
      hooks: {},
      monitor,
      outputPending: '',
      baselinePaths
    };
    this.active.set(run.id, entry);
    this.buffers.set(run.id, []);

    // Handlers ficam no entry.hooks para que o processo e os testes os acionem pela mesma via.
    const hooks = entry.hooks;
    hooks.onOut = (data: Buffer) => {
      if (provider === 'opencode') this.onOpenCodeData(entry, data);
      else if (provider === 'generic') this.onData(entry, 'out', data);
    };
    hooks.onErr = (data: Buffer) => provider === 'generic' ? this.onData(entry, 'err', data) : undefined;
    hooks.onExit = (code: number | null, signal: string | null) => {
      const exitCode = code ?? (signal != null ? 1 : 0);
      this.finish(entry, exitCode).catch(() => undefined);
    };

    proc.stdout?.on('data', (data: Buffer) => { hooks.onOut?.(data); });
    proc.stderr?.on('data', (data: Buffer) => { hooks.onErr?.(data); });
    proc.on('error', (err: Error) => this.pushLine(entry, { stream: 'err', text: provider === 'generic' ? err.message : `Não foi possível iniciar ${provider === 'claude-code' ? 'Claude Code' : 'OpenCode'}.` }));
    proc.on('exit', (code: number | null, signal: string | null) => { hooks.onExit?.(code, signal); });

    this.pushLine(entry, { stream: 'sys', text: provider === 'generic' ? `> ${command}` : `Iniciando monitoramento local: ${provider === 'claude-code' ? 'Claude Code' : 'OpenCode'}` });
    await this.persistRun(entry);
    await this.store.updateAgentProfile(profile.id, { lastRunAt: new Date().toISOString() });
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
      await entry.monitor?.close().catch(() => undefined);
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

  private onOpenCodeData(entry: RunEntry, data: Buffer): void {
    entry.outputPending += data.toString('utf8');
    const lines = entry.outputPending.split(/\r?\n/);
    entry.outputPending = lines.pop() ?? '';
    for (const line of lines) this.handleOpenCodeLine(entry, line);
  }

  private handleOpenCodeLine(entry: RunEntry, line: string): void {
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return;
      event = parsed as Record<string, unknown>;
    } catch {
      return;
    }

    const eventType = typeof event.type === 'string' ? event.type : '';
    const sessionId = typeof event.sessionID === 'string' ? event.sessionID.slice(0, 200) : typeof event.sessionId === 'string' ? event.sessionId.slice(0, 200) : undefined;
    if (sessionId != null && entry.run.providerSessionId == null) entry.run.providerSessionId = sessionId;
    const part = recordAt(event, 'part');
    const state = recordAt(part, 'state');
    const metadata = recordAt(state, 'metadata');
    const tokens = recordAt(part, 'tokens') ?? recordAt(event, 'tokens');
    const cache = recordAt(tokens, 'cache');
    const model = typeof part?.modelID === 'string' ? part.modelID : typeof part?.model === 'string' ? part.model : typeof event.model === 'string' ? event.model : undefined;
    const providerName = typeof part?.providerID === 'string' ? part.providerID.slice(0, 80) : model?.split('/')[0];

    if (eventType === 'step_start') {
      this.recordActivity(entry, { kind: 'status', label: 'OpenCode iniciou uma etapa', status: 'running' });
      return;
    }
    if (eventType === 'background_wait') {
      this.recordActivity(entry, { kind: 'status', label: 'OpenCode está aguardando tarefas em segundo plano', status: 'waiting' });
      return;
    }
    if (eventType === 'step_finish') {
      const usage = this.ensureUsage(entry.run);
      usage.inputTokens += numberAt(tokens, 'input');
      usage.outputTokens += numberAt(tokens, 'output');
      usage.reasoningTokens += numberAt(tokens, 'reasoning');
      usage.cacheReadTokens += numberAt(cache, 'read');
      usage.cacheWriteTokens += numberAt(cache, 'write');
      usage.costUsd += numberAt(part, 'cost') || numberAt(event, 'cost');
      if (model != null) usage.model = model;
      usage.updatedAt = new Date().toISOString();
      usage.accountKey ??= providerName ?? 'opencode';
      usage.accountLabel ??= `OpenCode · ${usage.accountKey}`;
      entry.run.accountKey = usage.accountKey;
      entry.run.accountLabel = usage.accountLabel;
      this.recordActivity(entry, { kind: 'usage', label: 'Uso da sessão atualizado', status: 'done' });
      void this.enforceBudget(entry);
      return;
    }

    if (eventType !== 'tool_use' && eventType !== 'tool_result' && part?.type !== 'tool') return;
    const toolName = safeName(part?.tool ?? part?.name ?? event.tool, 'ferramenta');
    const toolStatus = typeof state?.status === 'string' ? state.status : '';
    const isSubagent = /^(task|subagent|delegate_task|agent)$/i.test(toolName);
    const agentId = typeof metadata?.sessionID === 'string'
      ? metadata.sessionID.slice(0, 200)
      : typeof metadata?.sessionId === 'string'
        ? metadata.sessionId.slice(0, 200)
        : typeof part?.callID === 'string'
          ? part.callID.slice(0, 200)
          : typeof part?.id === 'string'
            ? part.id.slice(0, 200)
            : undefined;
    const parentAgentId = typeof metadata?.parentID === 'string'
      ? metadata.parentID.slice(0, 200)
      : typeof metadata?.parentId === 'string'
        ? metadata.parentId.slice(0, 200)
        : undefined;
    const agentType = safeName(metadata?.agent ?? metadata?.agentType, isSubagent ? 'Subagent' : toolName);
    const status: AgentSubagent['status'] = /error|failed/i.test(toolStatus) ? 'error' : eventType === 'tool_result' || /complete|success|done/i.test(toolStatus) ? 'done' : 'running';

    if (isSubagent && agentId != null) {
      this.upsertSubagent(entry, { id: agentId, ...(parentAgentId != null ? { parentId: parentAgentId } : {}), name: agentType, status });
      this.recordActivity(entry, { kind: 'subagent', label: `${status === 'done' ? 'Concluiu' : 'Executando'} subagent ${agentType}`.slice(0, 220), agentId, ...(parentAgentId != null ? { parentAgentId } : {}), agentType, status });
    } else {
      const verb = status === 'done' ? 'Concluiu' : status === 'error' ? 'Falhou em' : 'Executando';
      this.recordActivity(entry, { kind: 'tool', label: `${verb} ${toolName}`, status });
    }
    if (model != null) {
      const usage = this.ensureUsage(entry.run);
      usage.model = model;
      usage.updatedAt = new Date().toISOString();
    }
  }

  private async onClaudeTelemetry(runId: string, update: AgentTelemetryUpdate): Promise<void> {
    const entry = this.active.get(runId);
    if (entry == null) return;
    if (update.sessionId != null) entry.run.providerSessionId = update.sessionId;
    if (update.accountKey != null) {
      entry.run.accountKey = update.accountKey;
      entry.run.accountLabel = update.accountLabel ?? `Claude Code · …${update.accountKey.slice(-6)}`;
    }
    if (update.usageDelta != null) {
      const usage = this.ensureUsage(entry.run);
      usage.inputTokens += update.usageDelta.inputTokens ?? 0;
      usage.outputTokens += update.usageDelta.outputTokens ?? 0;
      usage.cacheReadTokens += update.usageDelta.cacheReadTokens ?? 0;
      usage.cacheWriteTokens += update.usageDelta.cacheWriteTokens ?? 0;
      usage.costUsd += update.usageDelta.costUsd ?? 0;
      usage.updatedAt = new Date().toISOString();
      if (update.model != null) usage.model = update.model;
      if (update.accountKey != null) {
        usage.accountKey = update.accountKey;
        usage.accountLabel = update.accountLabel ?? `Claude Code · …${update.accountKey.slice(-6)}`;
      }
      await this.enforceBudget(entry);
    }
    if (update.activity != null) {
      if (update.activity.kind === 'subagent' && update.activity.agentId != null) {
        this.upsertSubagent(entry, {
          id: update.activity.agentId,
          ...(update.activity.parentAgentId != null ? { parentId: update.activity.parentAgentId } : {}),
          name: update.activity.agentType ?? 'Subagent',
          status: update.activity.status ?? 'running'
        });
      }
      this.recordActivity(entry, update.activity);
    } else {
      await this.persistRun(entry);
    }
  }

  private ensureUsage(run: AgentRun): AgentTokenUsage {
    run.tokenUsage ??= {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      costUsd: 0,
      updatedAt: new Date().toISOString()
    };
    return run.tokenUsage;
  }

  private dailyCost(dayKey: string): number {
    const runs = new Map<string, AgentRun>();
    for (const run of this.runStore.list()) {
      if (runDayKey(run) === dayKey) runs.set(run.id, run);
    }
    for (const entry of this.active.values()) {
      if (runDayKey(entry.run) === dayKey) runs.set(entry.run.id, entry.run);
    }
    let total = 0;
    for (const run of runs.values()) total += run.tokenUsage?.costUsd ?? 0;
    return total;
  }

  private async enforceBudget(entry: RunEntry): Promise<void> {
    const settings = this.store.getSettings();
    if (settings.agentRunBudgetUsd == null && settings.agentDailyBudgetUsd == null) return;
    const runCostUsd = entry.run.tokenUsage?.costUsd ?? 0;
    const evaluation = evaluateAgentBudget({
      runCostUsd,
      dailyCostUsd: this.dailyCost(localDayKey(new Date())),
      ...(settings.agentRunBudgetUsd != null ? { runLimitUsd: settings.agentRunBudgetUsd } : {}),
      ...(settings.agentDailyBudgetUsd != null ? { dailyLimitUsd: settings.agentDailyBudgetUsd } : {})
    });
    if (evaluation.warning && !entry.run.budgetWarning) {
      entry.run.budgetWarning = true;
      this.recordActivity(entry, { kind: 'status', label: 'Você chegou a 80% de um limite de gasto configurado.', status: 'waiting' });
    }
    if (evaluation.exceeded == null || entry.run.budgetStopReason != null) return;
    const entries = evaluation.exceeded === 'daily' ? [...this.active.values()] : [entry];
    for (const current of entries) {
      if (current.run.budgetStopReason != null) continue;
      current.run.budgetStopReason = evaluation.exceeded;
      current.run.lastError = evaluation.exceeded === 'daily'
        ? 'Limite diário de gasto atingido; execução interrompida.'
        : 'Limite de gasto desta execução atingido; execução interrompida.';
      this.recordActivity(current, { kind: 'status', label: current.run.lastError, status: 'error' });
      void this.stop(current.run.id);
    }
  }

  private upsertSubagent(entry: RunEntry, input: Omit<AgentSubagent, 'startedAt'> & { startedAt?: string }): void {
    const children = entry.run.subagents ?? (entry.run.subagents = []);
    const existing = children.find((child) => child.id === input.id);
    const at = new Date().toISOString();
    if (existing == null) {
      children.push({ ...input, startedAt: input.startedAt ?? at });
    } else {
      Object.assign(existing, input);
      if (input.status !== 'running') existing.finishedAt = at;
    }
    if (children.length > 200) children.splice(0, children.length - 200);
  }

  private recordActivity(entry: RunEntry, input: Omit<AgentActivity, 'id' | 'at'>): void {
    const activity = entry.run.activity ?? (entry.run.activity = []);
    const at = new Date().toISOString();
    const item: AgentActivity = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at, ...input };
    activity.push(item);
    if (activity.length > 100) activity.splice(0, activity.length - 100);
    this.pushLine(entry, { stream: 'sys', text: item.label });
    void this.persistRun(entry).catch(() => undefined);
  }

  private persistRun(entry: RunEntry): Promise<void> {
    const runId = entry.run.id;
    const previous = this.persistQueues.get(runId) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.runStore.upsert({ ...entry.run }));
    this.persistQueues.set(runId, current);
    return current.then(() => {
      this.emitChanged({ ...entry.run });
      if (this.persistQueues.get(runId) === current) this.persistQueues.delete(runId);
    }, (error: unknown) => {
      if (this.persistQueues.get(runId) === current) this.persistQueues.delete(runId);
      throw error;
    });
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
      if (entry.run.provider === 'opencode' && entry.outputPending.trim() !== '') {
        const pending = entry.outputPending;
        entry.outputPending = '';
        this.handleOpenCodeLine(entry, pending);
      }
      const logStream = entry.logStream;
      if (logStream != null) {
        logStream.end();
        if (!logStream.closed) {
          await new Promise<void>((resolve) => logStream.once('close', resolve));
        }
      }
      const run: AgentRun = { ...entry.run };
      if (run.cwd != null && entry.baselinePaths != null) {
        const agentChanges = await this.git.captureAgentChanges(run.cwd, entry.baselinePaths).catch(() => []);
        if (agentChanges.length > 0) run.agentChanges = agentChanges;
      }
      run.exitCode = code;
      run.finishedAt = new Date().toISOString();
      run.durationMs = Math.max(0, Date.now() - Date.parse(run.startedAt));
      if (entry.stopRequested) run.status = 'stopped';
      else if (code === 0) run.status = 'done';
      else {
        run.status = 'error';
        const tail = entry.stderrTail.join('\n');
        if (entry.run.provider === 'generic' && tail !== '') run.lastError = tail;
        else if (entry.run.provider !== 'generic') run.lastError = 'O provedor encerrou com erro. Consulte a CLI para ver os detalhes.';
      }
      entry.run = run;
      await this.persistRun(entry);
    } finally {
      this.active.delete(entry.run.id);
      await entry.monitor?.close().catch(() => undefined);
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

