import type { ChildProcess } from 'child_process';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { LibraryStore } from '../src/main/services/library-store';
import { ToolManager } from '../src/main/services/tool-manager';

interface FakeHooks {
  onExit?: (code: number | null, signal: string | null) => void;
  onError?: (error: Error) => void;
  onOut?: (data: Buffer) => void;
  onErr?: (data: Buffer) => void;
}

interface SpawnCall {
  command: string;
  args?: string[];
  cwd?: string;
  hooks: FakeHooks;
}

function fakeSpawnFactory(openCodeExitCode = 0) {
  const calls: SpawnCall[] = [];
  const spawn = (command: string, options: { args?: string[]; cwd?: string }): ChildProcess => {
    const hooks: FakeHooks = {};
    calls.push({ command, args: options.args, cwd: options.cwd, hooks });
    return {
      pid: 4242,
      stdout: { on: (_event: string, callback: (data: Buffer) => void) => { hooks.onOut = callback; } },
      stderr: { on: (_event: string, callback: (data: Buffer) => void) => { hooks.onErr = callback; } },
      on: (event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'exit') {
          hooks.onExit = callback as FakeHooks['onExit'];
          if (['opencode --version', 'git --version', 'node --version', 'npm --version'].includes(command)) {
            queueMicrotask(() => hooks.onExit?.(openCodeExitCode, null));
          }
        }
        if (event === 'error') hooks.onError = callback as FakeHooks['onError'];
      },
      kill: () => hooks.onExit?.(0, 'SIGTERM')
    } as unknown as ChildProcess;
  };
  return { spawn, calls };
}

const wait = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('ToolManager', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function makeManager(openCodeExitCode = 0) {
    const dir = await mkdtemp(join(tmpdir(), 'glib-tool-manager-'));
    dirs.push(dir);
    const toolsRoot = join(dir, 'tools');
    const logsRoot = join(dir, 'logs', 'tools');
    const store = new LibraryStore(dir, dir);
    await store.load();
    const fake = fakeSpawnFactory(openCodeExitCode);
    const emitted: Array<{ channel: string; payload: unknown }> = [];
    const manager = new ToolManager(
      store,
      toolsRoot,
      logsRoot,
      (channel, payload) => emitted.push({ channel, payload }),
      fake.spawn,
      () => undefined
    );
    return { dir, toolsRoot, store, fake, emitted, manager };
  }

  it('validates a GitHub URL when adding a custom tool', async () => {
    const { manager } = await makeManager();
    await expect(manager.add('https://example.com/not-github')).rejects.toThrow();
    await expect(manager.add('https://github.com/example/my-cli')).resolves.toMatchObject({ name: 'my-cli' });
  });

  it('installs Habblaud directly without OpenCode', async () => {
    const { manager, fake, toolsRoot } = await makeManager();
    const run = await manager.install('builtin-habblaud');
    const installCall = fake.calls.find(({ command }) => command === 'node');
    expect(installCall?.args?.[0]).toBe('-e');
    expect(installCall?.args?.[1]).toContain('https://github.com/marmottajr/habblaud');
    // O script embute o caminho como literal JSON (barras invertidas escapadas no Windows).
    expect(installCall?.args?.[1]).toContain(JSON.stringify(join(toolsRoot, 'habblaud')));
    expect(installCall?.cwd).toBe(toolsRoot);
    expect(run.prompt).toContain('npm install');
  });

  it('captures output in memory and the run log file', async () => {
    const { manager, fake } = await makeManager();
    const run = await manager.install('builtin-omniroute');
    const installCall = fake.calls.find(({ command }) => command.startsWith('opencode run '));
    installCall?.hooks.onOut?.(Buffer.from('instalando omni\n'));
    expect(manager.getLogs(run.id).some(({ text }) => text === 'instalando omni')).toBe(true);
    await wait();
    expect(await readFile(run.logFile, 'utf8')).toContain('instalando omni');
  });

  it('marks exit code zero as done and releases the busy lock', async () => {
    const { manager, fake, emitted } = await makeManager();
    const run = await manager.install('builtin-omniroute');
    expect(manager.isBusy('builtin-omniroute')).toBe(true);
    fake.calls.find(({ command }) => command.startsWith('opencode run '))?.hooks.onExit?.(0, null);
    await wait();
    expect(emitted.some(({ payload }) => (payload as { id?: string; status?: string }).id === run.id && (payload as { status?: string }).status === 'done')).toBe(true);
    expect(manager.isBusy('builtin-omniroute')).toBe(false);
  });

  it('marks a non-zero exit as error', async () => {
    const { manager, fake, emitted } = await makeManager();
    const run = await manager.install('builtin-omniroute');
    fake.calls.find(({ command }) => command.startsWith('opencode run '))?.hooks.onExit?.(1, null);
    await wait();
    expect(emitted.some(({ payload }) => (payload as { id?: string; status?: string }).id === run.id && (payload as { status?: string }).status === 'error')).toBe(true);
  });

  it('detects a custom tool from package.json in its install folder', async () => {
    const { manager, toolsRoot } = await makeManager();
    const tool = await manager.add('https://github.com/example/custom-cli');
    const target = join(toolsRoot, 'custom-cli');
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'package.json'), '{"name":"custom-cli"}', 'utf8');
    expect(await manager.detect(tool.id)).toBe('installed');
  });

  it('returns the expected error when OpenCode is unavailable', async () => {
    const { manager, fake } = await makeManager(1);
    await expect(manager.install('builtin-omniroute')).rejects.toThrow('OpenCode não encontrado no PATH');
    expect(fake.calls.map(({ command }) => command)).toEqual(['opencode --version']);
  });
});
