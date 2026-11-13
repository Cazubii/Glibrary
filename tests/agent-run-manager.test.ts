import type { ChildProcess } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, describe, expect, it } from 'vitest';
import { AgentRunManager, buildAgentCommand } from '../src/main/services/agent-run-manager';
import { AgentRunStore } from '../src/main/services/agent-run-store';
import { LibraryStore } from '../src/main/services/library-store';
import type { AgentProfile } from '../src/shared/types';

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

const wait = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

  async function makeManager() {
    const dir = freshDir();
    const logsRoot = join(dir, 'logs');
    const store = new LibraryStore(dir, dir);
    await store.load();
    await store.addRepo({
      id: 'repo1', name: 'demo', localPath: dir, status: 'installed',
      tags: [], favorite: false, addedAt: new Date().toISOString()
    });
    // Provedor genérico: sem telemetria do Claude Code e com saída bruta no log.
    const profile = await store.addAgentProfile({ name: 'Claude', repoId: 'repo1', command: 'claude', monitorProvider: 'generic' });
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
    await wait();
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
    await wait();
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
});
