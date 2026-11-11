import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IPty } from 'node-pty';
import { TerminalManager, resolveShell, type TerminalEvents } from '../src/main/services/terminal-manager';

interface FakePtyHooks {
  onData?: (data: string) => void;
  onExit?: (e: { exitCode: number }) => void;
}

function fakeSpawnFactory() {
  const calls: Array<{ file: string; cwd: string }> = [];
  const spawned: FakePtyHooks[] = [];
  const killCount = { value: 0 };
  const writes: string[] = [];
  const resized: string[] = [];
  const spawn = (file: string, _args: string | string[], options: { cwd?: string }): IPty => {
    calls.push({ file, cwd: options.cwd ?? '' });
    const hooks: FakePtyHooks = {};
    spawned.push(hooks);
    return {
      onData: (cb: (data: string) => void) => {
        hooks.onData = cb;
        return { dispose(): void {} };
      },
      onExit: (cb: (e: { exitCode: number }) => void) => {
        hooks.onExit = cb;
        return { dispose(): void {} };
      },
      write: (data: string) => writes.push(data),
      resize: (cols: number, rows: number) => resized.push(`${cols}x${rows}`),
      kill: () => killCount.value += 1
    } as unknown as IPty;
  };
  return { spawn, calls, spawned, killCount, writes, resized };
}

function collectingEvents(log: { data: string[]; exitSent: number }): TerminalEvents {
  return {
    send: (_channel, payload) => {
      const p = payload as { data?: string; exitCode?: number };
      if (p.data != null) log.data.push(p.data);
      if (p.exitCode != null) log.exitSent += 1;
    }
  };
}

describe('TerminalManager', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'glib-term-'));
    mkdirSync(join(dir, 'sub'), { recursive: true });
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('cria sessão no shell da plataforma', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const id = manager.create({ send: () => undefined }, dir);
    expect(id).toBe('t1');
    expect(manager.alive(id)).toBe(true);
    expect(fake.calls[0]).toMatchObject({ cwd: dir });
    expect(fake.calls[0].file).toBe(resolveShell());
  });

  it('lança erro para pasta inexistente', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    expect(() => manager.create({ send: () => undefined }, join(dir, 'sub', 'nao-existe'))).toThrow();
    expect(manager.alive('t1')).toBe(false);
  });

  it('encaminha input e resize para o PTY', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const id = manager.create({ send: () => undefined }, dir);
    manager.input(id, 'ls\r');
    manager.resize(id, 100, 40);
    expect(fake.writes).toEqual(['ls\r']);
    expect(fake.resized).toEqual(['100x40']);
  });

  it('ignora input/resize/kill de ids desconhecidos', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    expect(() => {
      manager.input('falta', 'x');
      manager.resize('falta', 80, 24);
      manager.kill('falta');
    }).not.toThrow();
    expect(fake.writes).toEqual([]);
    expect(fake.killCount.value).toBe(0);
  });

  it('kill encerra e a sessão sai do mapa', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const id = manager.create({ send: () => undefined }, dir);
    manager.kill(id);
    expect(fake.killCount.value).toBe(1);
    fake.spawned[0].onExit?.({ exitCode: 0 });
    expect(manager.alive(id)).toBe(false);
  });

  it('saída do PTY chega como output e exit é enviado uma vez', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const log = { data: [] as string[], exitSent: 0 };
    manager.create(collectingEvents(log), dir);
    fake.spawned[0].onData?.('hello\n');
    fake.spawned[0].onExit?.({ exitCode: 3 });
    expect(log.data).toEqual(['hello\n']);
    expect(log.exitSent).toBe(1);
  });

  it('saída após exit não é enviada', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const log = { data: [] as string[], exitSent: 0 };
    manager.create(collectingEvents(log), dir);
    fake.spawned[0].onExit?.({ exitCode: 0 });
    fake.spawned[0].onData?.('tardio');
    expect(log.data).toEqual([]);
    expect(log.exitSent).toBe(1);
  });

  it('reattaches to the same cwd and returns buffered terminal output', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const firstLog = { data: [] as string[], exitSent: 0 };
    const first = manager.open(collectingEvents(firstLog), dir);
    fake.spawned[0].onData?.('prompt> ');
    manager.detach(first.id);
    fake.spawned[0].onData?.('while detached');

    const secondLog = { data: [] as string[], exitSent: 0 };
    const second = manager.open(collectingEvents(secondLog), dir);
    fake.spawned[0].onData?.('hello\n');

    expect(second.id).toBe(first.id);
    expect(second.snapshot).toBe('prompt> while detached');
    expect(second.sequence).toBe(2);
    expect(fake.calls).toHaveLength(1);
    expect(secondLog.data).toEqual(['hello\n']);
  });

  it('kills the terminal session for a workspace cwd', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const id = manager.open({ send: () => undefined }, dir).id;
    manager.killForCwd(dir);
    expect(fake.killCount.value).toBe(1);
    fake.spawned[0].onExit?.({ exitCode: 0 });
    expect(manager.alive(id)).toBe(false);
  });
});
