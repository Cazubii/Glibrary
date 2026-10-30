import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ProcessManager } from '../src/main/services/process-manager';
import { LibraryStore } from '../src/main/services/library-store';
import type { Repo } from '../src/shared/types';

let dir: string;
let store: LibraryStore;
let manager: ProcessManager;
const events: { channel: string; payload: unknown }[] = [];

function makeRepo(overrides: Partial<Repo> = {}): Repo {
  return {
    id: 'p1',
    name: 'proc-demo',
    status: 'cloned',
    tags: [],
    favorite: false,
    addedAt: new Date().toISOString(),
    ...overrides
  };
}

function waitFor(condition: () => boolean, timeoutMs = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = (): void => {
      if (condition()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
      setTimeout(tick, 50);
    };
    tick();
  });
}

beforeEach(async () => {
  dir = join(tmpdir(), `glib-proc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await fs.mkdir(dir, { recursive: true });
  store = new LibraryStore(dir, dir);
  await store.load();
  await store.addRepo(makeRepo());
  events.length = 0;
  manager = new ProcessManager(store, join(dir, 'logs'), (channel, payload) => {
    events.push({ channel, payload });
  });
});

afterEach(async () => {
  await manager.stopAll();
  await fs.rm(dir, { recursive: true, force: true });
});

describe('ProcessManager', () => {
  it('roda um comando, captura stdout e finaliza com código 0', async () => {
    await manager.run('p1', 'install', { command: 'echo hello-glibrary' });
    await waitFor(() => events.some((e) => e.channel === 'process:exit'));

    const exit = events.find((e) => e.channel === 'process:exit');
    expect(exit?.payload).toMatchObject({ id: 'p1', code: 0 });

    const logs = manager.getLogs('p1');
    expect(logs.some((l) => l.text.includes('hello-glibrary'))).toBe(true);
    expect(logs[0].text.startsWith('> echo')).toBe(true);
    expect(store.getRepo('p1')?.status).toBe('installed');
    expect(store.getRepo('p1')?.installedAt).toBeDefined();
  });

  it('comando com erro vira status error e grava lastError', async () => {
    await manager.run('p1', 'install', {
      command: 'node -e "console.error(\'boom\'); process.exit(2)"'
    });
    await waitFor(() => events.some((e) => e.channel === 'process:exit'));

    const repo = store.getRepo('p1');
    expect(repo?.status).toBe('error');
    expect(repo?.lastError).toContain('boom');
  });

  it('só permite um processo por repositório', async () => {
    await manager.run('p1', 'start', {
      command: 'node -e "setInterval(()=>{},1000)"'
    });
    await expect(
      manager.run('p1', 'install', { command: 'echo second' }),
    ).rejects.toThrow(/processo rodando/i);
  });

  it('stop mata o processo (sem órfãos) e o buffer tem linhas', async () => {
    await manager.run('p1', 'start', {
      command: 'node -e "setInterval(()=>{},1000)"'
    });
    expect(manager.isRunning('p1')).toBe(true);

    await manager.stop('p1');
    await waitFor(() => !manager.isRunning('p1'));

    expect(manager.getLogs('p1').length).toBeGreaterThan(0);
    const exit = events.find((e) => e.channel === 'process:exit');
    expect(exit).toBeDefined();
    expect(store.getRepo('p1')?.status).toBe('installed');
  });

  it('grava log em arquivo dentro de logs/<repoId>/', async () => {
    const handle = await manager.run('p1', 'install', { command: 'echo arquivo' });
    await waitFor(() => events.some((e) => e.channel === 'process:exit'));

    expect(handle.logFile).not.toBeNull();
    const content = await fs.readFile(handle.logFile as string, 'utf-8');
    expect(content).toContain('arquivo');
  });

  it('detecta URL localhost no log e atualiza openUrl', async () => {
    await manager.run('p1', 'start', {
      command: 'node -e "console.log(\'Server running at http://localhost:5173/\')"'
    });
    await waitFor(() => store.getRepo('p1')?.openUrl != null);

    expect(store.getRepo('p1')?.openUrl).toBe('http://localhost:5173/');
  });

  it('emite process:log por evento para cada linha', async () => {
    await manager.run('p1', 'install', { command: 'echo uma-linha' });
    await waitFor(() => events.some((e) => e.channel === 'process:exit'));

    const logEvents = events.filter((e) => e.channel === 'process:log');
    expect(logEvents.length).toBeGreaterThan(1);
    const line = (logEvents[1].payload as { line: { text: string } }).line;
    expect(line.text).toContain('uma-linha');
  });
});
