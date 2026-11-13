import type { ChildProcess } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { simpleGit } from 'simple-git';
import { afterAll, describe, expect, it } from 'vitest';
import { AgentRunManager, buildAgentCommand } from '../src/main/services/agent-run-manager';
import { AgentRunStore } from '../src/main/services/agent-run-store';
import { LibraryStore } from '../src/main/services/library-store';
import type { AgentProfile, Settings } from '../src/shared/types';

interface FakeHooks {
  onExit?: (code: number | null, signal: string | null) => void;
  onError?: (err: Error) => void;
  onOut?: (data: Buffer) => void;
  onErr?: (data: Buffer) => void;
}

function fakeSpawnFactory() {
  const calls: Array<{ command: string; cwd?: string }> = [];
  const spawned: FakeHooks[] = [];
  const spawn = (command: string, options: { cwd?: string }): ChildProcess => {
    calls.push({ command, cwd: options.cwd });
    const hooks: FakeHooks = {};
    spawned.push(hooks);
    return {
      pid: 4242,
      stdout: { on: (_: string, cb: (d: Buffer) => void) => { hooks.onOut = cb; } },
      stderr: { on: (_: string, cb: (d: Buffer) => void) => { hooks.onErr = cb; } },
      on: (event: string, cb: (...args: unknown[]) => void) => {
        if (event === 'exit') hooks.onExit = cb as FakeHooks['onExit'];
        if (event === 'error') hooks.onError = cb as FakeHooks['onError'];
      },
      kill: () => hooks.onExit?.(0, 'SIGTERM')
    } as unknown as ChildProcess;
  };
  return { spawn, calls, spawned };
}

const wait = (ms = 150): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForStatus(runStore: AgentRunStore, runId: string, expected: 'running' | 'done' | 'stopped' | 'error'): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (runStore.list().find((run) => run.id === runId)?.status === expected) return;
    await wait(20);
  }
  throw new Error(`A execução ${runId} não chegou ao estado ${expected}.`);
}

describe('buildAgentCommand', () => {
  it('junta command + args e cita o prompt', () => {
    const profile: AgentProfile = { id: 'p', name: 'n', repoId: 'r', command: 'claude', args: ['--model', 'sonnet'], createdAt: '' };
    expect(buildAgentCommand(profile)).toBe('claude --model sonnet');
    expect(buildAgentCommand(profile, 'faça "x"')).toBe('claude --model sonnet "faça \\"x\\""');
  });
});

describe('AgentRunManager', () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function freshDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'glib-agentmgr-'));
    dirs.push(dir);
    return dir;
  }

  async function makeManager(options: { provider?: AgentProfile['monitorProvider']; settings?: Partial<Settings> } = {}) {
    const dir = freshDir();
    const logsRoot = join(dir, 'logs');
    const store = new LibraryStore(dir, dir);
    await store.load();
    await store.addRepo({
      id: 'repo1', name: 'demo', localPath: dir, status: 'installed',
      tags: [], favorite: false, addedAt: new Date().toISOString()
    });
    const profile = await store.addAgentProfile({ name: 'Claude', repoId: 'repo1', command: 'claude', monitorProvider: options.provider ?? 'generic' });
    if (options.settings != null) await store.updateSettings(options.settings);
    const runStore = new AgentRunStore(join(dir, 'runs'));
    await runStore.load();
    const fake = fakeSpawnFactory();
    const emitted: Array<{ channel: string; payload: unknown }> = [];
    const manager = new AgentRunManager(
      store, runStore, logsRoot,
      (channel, payload) => emitted.push({ channel, payload }),
      fake.spawn,
      () => undefined
    );
    return { store, profile, runStore, fake, emitted, manager, dir };
  }

  it('start bloqueia perfil inexistente', async () => {
    const { manager } = await makeManager();
    await expect(manager.start('falta')).rejects.toThrow('Perfil não encontrado');
  });

  it('start cria run running, cwd correto e log em disco', async () => {
    const { manager, fake, runStore, profile, dir } = await makeManager();
    const run = await manager.start(profile.id);
    expect(run.status).toBe('running');
    expect(fake.calls[0]?.cwd).toBe(dir);
    const saved = runStore.list().find((r) => r.id === run.id);
    expect(saved?.status).toBe('running');
    await wait();
    const logText = readFileSync(run.logFile, 'utf-8');
    expect(logText).toContain('claude');
  });

  it('saída vai para buffer e arquivo', async () => {
    const { manager, profile } = await makeManager();
    const run = await manager.start(profile.id);
    const hooks = manager.getActiveHooks(run.id);
    hooks?.onOut?.(Buffer.from('linha um\n'));
    const logs = manager.getLogs(run.id);
    expect(logs.some((l) => l.stream === 'out' && l.text === 'linha um')).toBe(true);
    await wait();
    expect(readFileSync(run.logFile, 'utf-8')).toContain('linha um');
  });

  it('exit 0 → done; exit 1 → error com lastError', async () => {
    const { manager, runStore, profile } = await makeManager();
    const runA = await manager.start(profile.id);
    const runB = await manager.start(profile.id);
    const hooksA = manager.getActiveHooks(runA.id);
    const hooksB = manager.getActiveHooks(runB.id);
    hooksB?.onErr?.(Buffer.from('boom\n'));
    hooksA?.onExit?.(0, null);
    hooksB?.onExit?.(1, null);
    await Promise.all([waitForStatus(runStore, runA.id, 'done'), waitForStatus(runStore, runB.id, 'error')]);
    expect(runStore.list().find((r) => r.id === runA.id)?.status).toBe('done');
    const failed = runStore.list().find((r) => r.id === runB.id);
    expect(failed?.status).toBe('error');
    expect(failed?.lastError).toContain('boom');
    expect(failed?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('stop marca stopped e emite eventos changed', async () => {
    const { manager, emitted, runStore, profile } = await makeManager();
    const run = await manager.start(profile.id);
    await manager.stop(run.id);
    await waitForStatus(runStore, run.id, 'stopped');
    expect(runStore.list().find((r) => r.id === run.id)?.status).toBe('stopped');
    expect(emitted.some((e) => e.channel === 'agentRuns:changed')).toBe(true);
  });

  it('hasActiveRunsForProfile reflete execuções vivas', async () => {
    const { manager, profile } = await makeManager();
    expect(manager.hasActiveRunsForProfile(profile.id)).toBe(false);
    const run = await manager.start(profile.id);
    expect(manager.hasActiveRunsForProfile(profile.id)).toBe(true);
    await manager.stop(run.id);
    for (let i = 0; i < 100 && manager.hasActiveRunsForProfile(profile.id); i += 1) await wait(20);
    expect(manager.hasActiveRunsForProfile(profile.id)).toBe(false);
  });

  it('moves an agent away from main before the first edit in simple mode', async () => {
    const { manager, profile, store, dir, fake } = await makeManager();
    const projectPath = join(dir, 'project');
    mkdirSync(projectPath, { recursive: true });
    const git = simpleGit({ baseDir: projectPath });
    await git.init(['--initial-branch=main']);
    await git.addConfig('user.name', 'Teste');
    await git.addConfig('user.email', 'teste@example.test');
    writeFileSync(join(projectPath, 'README.md'), 'base\n');
    await git.add('.');
    await git.commit('initial');
    await store.updateRepo('repo1', { localPath: projectPath });
    await store.updateSettings({ showAdvancedResources: false });

    const run = await manager.start(profile.id, 'Corrige o texto inicial');
    expect(run.cwd).toBe(projectPath);
    expect((await git.branchLocal()).current).toMatch(/^glibrary\/\d{4}-\d{2}-\d{2}-corrige-o-texto-inicial$/);
    expect(fake.calls[0]?.cwd).toBe(projectPath);
  }, 15_000);

  it('blocks a generic command when a spend limit needs unavailable telemetry', async () => {
    const { manager, profile, fake } = await makeManager({ settings: { agentRunBudgetUsd: 2 } });
    await expect(manager.start(profile.id)).rejects.toThrow('não informa o custo');
    expect(fake.calls).toHaveLength(0);
  });

  it('warns at 80 percent and stops when an execution limit is reached', async () => {
    const { manager, profile, runStore } = await makeManager({ provider: 'opencode', settings: { agentRunBudgetUsd: 1 } });
    const run = await manager.start(profile.id);
    const hooks = manager.getActiveHooks(run.id);
    hooks?.onOut?.(Buffer.from('{"type":"step_finish","part":{"cost":0.8,"tokens":{}}}\n'));
    await wait();
    expect(runStore.list().find((item) => item.id === run.id)).toMatchObject({ budgetWarning: true, status: 'running' });

    hooks?.onOut?.(Buffer.from('{"type":"step_finish","part":{"cost":0.2,"tokens":{}}}\n'));
    await waitForStatus(runStore, run.id, 'stopped');
    expect(runStore.list().find((item) => item.id === run.id)).toMatchObject({ budgetStopReason: 'execution', status: 'stopped' });
  });

  it('stops all active runs when their combined daily cost reaches the limit', async () => {
    const { manager, profile, runStore } = await makeManager({ provider: 'opencode', settings: { agentDailyBudgetUsd: 1 } });
    const first = await manager.start(profile.id);
    const second = await manager.start(profile.id);
    manager.getActiveHooks(first.id)?.onOut?.(Buffer.from('{"type":"step_finish","part":{"cost":0.6,"tokens":{}}}\n'));
    await wait();
    manager.getActiveHooks(second.id)?.onOut?.(Buffer.from('{"type":"step_finish","part":{"cost":0.5,"tokens":{}}}\n'));
    await Promise.all([waitForStatus(runStore, first.id, 'stopped'), waitForStatus(runStore, second.id, 'stopped')]);
    expect(runStore.list().find((item) => item.id === first.id)).toMatchObject({ budgetStopReason: 'daily', status: 'stopped' });
    expect(runStore.list().find((item) => item.id === second.id)).toMatchObject({ budgetStopReason: 'daily', status: 'stopped' });
  });

  it('exposes only the agent snapshot and discards unchanged files without touching earlier work', async () => {
    const { manager, profile, dir, runStore, store } = await makeManager();
    const projectPath = join(dir, 'project');
    mkdirSync(projectPath, { recursive: true });
    const git = simpleGit({ baseDir: projectPath });
    await git.init(['--initial-branch=main']);
    await git.addConfig('user.name', 'Teste');
    await git.addConfig('user.email', 'teste@example.test');
    writeFileSync(join(projectPath, 'existing.txt'), 'base\n');
    await git.add('.');
    await git.commit('initial');
    await store.updateRepo('repo1', { localPath: projectPath });
    writeFileSync(join(projectPath, 'existing.txt'), 'work that existed before\n');

    const run = await manager.start(profile.id);
    writeFileSync(join(projectPath, 'existing.txt'), 'agent also changed it\n');
    writeFileSync(join(projectPath, 'new-from-agent.txt'), 'agent output\n');
    manager.getActiveHooks(run.id)?.onExit?.(0, null);
    await waitForStatus(runStore, run.id, 'done');

    const preview = await manager.getAgentChanges(run.id);
    expect(preview.files.map((file) => file.path)).toEqual(['new-from-agent.txt']);

    const resolution = await manager.resolveAgentChanges(run.id, 'discard');
    expect(resolution.discarded).toEqual(['new-from-agent.txt']);
    expect(resolution.skipped).toEqual([]);
    expect(resolution.run.agentChanges).toBeUndefined();
    expect(readFileSync(join(projectPath, 'existing.txt'), 'utf8')).toBe('agent also changed it\n');
    expect(() => readFileSync(join(projectPath, 'new-from-agent.txt'), 'utf8')).toThrow();
  });

  it('keeps a changed-after-snapshot file when the user chooses discard', async () => {
    const { manager, profile, dir, runStore, store } = await makeManager();
    const projectPath = join(dir, 'project');
    mkdirSync(projectPath, { recursive: true });
    const git = simpleGit({ baseDir: projectPath });
    await git.init(['--initial-branch=main']);
    await git.addConfig('user.name', 'Teste');
    await git.addConfig('user.email', 'teste@example.test');
    writeFileSync(join(projectPath, 'base.txt'), 'base\n');
    await git.add('.');
    await git.commit('initial');
    await store.updateRepo('repo1', { localPath: projectPath });

    const run = await manager.start(profile.id);
    writeFileSync(join(projectPath, 'new-from-agent.txt'), 'agent output\n');
    manager.getActiveHooks(run.id)?.onExit?.(0, null);
    await waitForStatus(runStore, run.id, 'done');
    writeFileSync(join(projectPath, 'new-from-agent.txt'), 'newer user edit\n');

    const resolution = await manager.resolveAgentChanges(run.id, 'discard');
    expect(resolution.discarded).toEqual([]);
    expect(resolution.skipped).toEqual(['new-from-agent.txt']);
    expect(resolution.run.agentChanges?.map((change) => change.path)).toEqual(['new-from-agent.txt']);
    expect(readFileSync(join(projectPath, 'new-from-agent.txt'), 'utf8')).toBe('newer user edit\n');
  });

  it('refuses to resolve a stored agent snapshot outside its saved project folder', async () => {
    const { manager, profile, dir, runStore, store } = await makeManager();
    const projectPath = join(dir, 'project');
    mkdirSync(projectPath, { recursive: true });
    const git = simpleGit({ baseDir: projectPath });
    await git.init(['--initial-branch=main']);
    await git.addConfig('user.name', 'Teste');
    await git.addConfig('user.email', 'teste@example.test');
    writeFileSync(join(projectPath, 'base.txt'), 'base\n');
    await git.add('.');
    await git.commit('initial');
    await store.updateRepo('repo1', { localPath: projectPath });

    const run = await manager.start(profile.id);
    writeFileSync(join(projectPath, 'new-from-agent.txt'), 'agent output\n');
    manager.getActiveHooks(run.id)?.onExit?.(0, null);
    await waitForStatus(runStore, run.id, 'done');
    const saved = runStore.list().find((candidate) => candidate.id === run.id);
    if (saved == null) throw new Error('Execução não foi persistida.');
    await runStore.upsert({ ...saved, cwd: dir });

    await expect(manager.resolveAgentChanges(run.id, 'discard')).rejects.toThrow('não corresponde mais ao projeto');
    expect(readFileSync(join(projectPath, 'new-from-agent.txt'), 'utf8')).toBe('agent output\n');
  });
});

