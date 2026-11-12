import { mkdirSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
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
  const writesBySession: string[][] = [];
  const resized: string[] = [];
  const spawn = (file: string, _args: string | string[], options: { cwd?: string }): IPty => {
    calls.push({ file, cwd: options.cwd ?? '' });
    const hooks: FakePtyHooks = {};
    const sessionWrites: string[] = [];
    spawned.push(hooks);
    writesBySession.push(sessionWrites);
    return {
      onData: (cb: (data: string) => void) => {
        hooks.onData = cb;
        return { dispose(): void {} };
      },
      onExit: (cb: (e: { exitCode: number }) => void) => {
        hooks.onExit = cb;
        return { dispose(): void {} };
      },
      write: (data: string) => {
        writes.push(data);
        sessionWrites.push(data);
      },
      resize: (cols: number, rows: number) => resized.push(`${cols}x${rows}`),
      kill: () => killCount.value += 1
    } as unknown as IPty;
  };
  return { spawn, calls, spawned, killCount, writes, writesBySession, resized };
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
    const session = manager.create(dir);
    expect(session.id).toBe('t1');
    expect(manager.alive(session.id)).toBe(true);
    expect(fake.calls[0]).toMatchObject({ cwd: dir });
    expect(fake.calls[0].file).toBe(resolveShell());
  });

  it('cria e lista três sessões independentes na mesma pasta', () => {
    const fake = fakeSpawnFactory();
    const ids = ['t1', 't2', 't3'];
    const manager = new TerminalManager(fake.spawn, () => ids.shift() ?? 'unexpected');

    const first = manager.create(dir);
    const second = manager.create(dir);
    const third = manager.create(dir);

    expect(first).toMatchObject({ id: 't1', cwd: resolve(dir), name: 'Terminal 1', status: 'running' });
    expect(second).toMatchObject({ id: 't2', cwd: resolve(dir), name: 'Terminal 2', status: 'running' });
    expect(third).toMatchObject({ id: 't3', cwd: resolve(dir), name: 'Terminal 3', status: 'running' });
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(manager.list(dir)).toMatchObject({
      cwd: resolve(dir),
      sessions: [{ id: 't1' }, { id: 't2' }, { id: 't3' }]
    });
    expect(fake.calls).toHaveLength(3);
    expect(fake.calls.map((call) => call.cwd)).toEqual([resolve(dir), resolve(dir), resolve(dir)]);
  });

  it('lança erro para pasta inexistente', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    expect(() => manager.create(join(dir, 'sub', 'nao-existe'))).toThrow();
    expect(manager.alive('t1')).toBe(false);
  });

  it('encaminha input e resize para o PTY', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const session = manager.create(dir);
    manager.input(session.id, 'ls\r');
    manager.resize(session.id, 100, 40);
    expect(fake.writes).toEqual(['ls\r']);
    expect(fake.resized).toEqual(['100x40']);
  });

  it('ignora input/resize/close de ids desconhecidos', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    expect(() => {
      manager.input('falta', 'x');
      manager.resize('falta', 80, 24);
      manager.close('falta');
    }).not.toThrow();
    expect(fake.writes).toEqual([]);
    expect(fake.killCount.value).toBe(0);
  });

  it('close encerra e a sessão sai do mapa', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const session = manager.create(dir);
    manager.close(session.id);
    expect(fake.killCount.value).toBe(1);
    fake.spawned[0].onExit?.({ exitCode: 0 });
    expect(manager.alive(session.id)).toBe(false);
  });

  it('saída do PTY chega como output e exit é enviado uma vez', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const log = { data: [] as string[], exitSent: 0 };
    const session = manager.create(dir);
    manager.attach(session.id, collectingEvents(log));
    fake.spawned[0].onData?.('hello\n');
    fake.spawned[0].onExit?.({ exitCode: 3 });
    expect(log.data).toEqual(['hello\n']);
    expect(log.exitSent).toBe(1);
  });

  it('saída após exit não é enviada', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const log = { data: [] as string[], exitSent: 0 };
    const session = manager.create(dir);
    manager.attach(session.id, collectingEvents(log));
    fake.spawned[0].onExit?.({ exitCode: 0 });
    fake.spawned[0].onData?.('tardio');
    expect(log.data).toEqual([]);
    expect(log.exitSent).toBe(1);
  });

  it('reattaches to the same cwd and returns buffered terminal output', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const firstLog = { data: [] as string[], exitSent: 0 };
    const created = manager.create(dir);
    const first = manager.attach(created.id, collectingEvents(firstLog));
    fake.spawned[0].onData?.('prompt> ');
    manager.detach(first.id, first.attachmentId);
    fake.spawned[0].onData?.('while detached');

    const secondLog = { data: [] as string[], exitSent: 0 };
    const second = manager.attach(created.id, collectingEvents(secondLog));
    fake.spawned[0].onData?.('hello\n');

    expect(second.id).toBe(first.id);
    expect(second.snapshot).toBe('prompt> while detached');
    expect(second.sequence).toBe(2);
    expect(fake.calls).toHaveLength(1);
    expect(secondLog.data).toEqual(['hello\n']);
  });

  it('ignores stale detach after the terminal has been reattached', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const firstLog = { data: [] as string[], exitSent: 0 };
    const created = manager.create(dir);
    const first = manager.attach(created.id, collectingEvents(firstLog));
    const secondLog = { data: [] as string[], exitSent: 0 };
    const second = manager.attach(created.id, collectingEvents(secondLog));

    manager.detach(first.id, first.attachmentId);
    fake.spawned[0].onData?.('typed input echo\n');

    expect(second.id).toBe(first.id);
    expect(second.attachmentId).not.toBe(first.attachmentId);
    expect(secondLog.data).toEqual(['typed input echo\n']);
  });

  it('reattaches by id with a snapshot and ignores a stale detach token', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const created = manager.create(dir);
    const first = manager.attach(created.id, collectingEvents({ data: [], exitSent: 0 }));
    fake.spawned[0].onData?.('prompt> ');
    manager.detach(created.id, first.attachmentId);
    fake.spawned[0].onData?.('while detached');

    const secondLog = { data: [] as string[], exitSent: 0 };
    const second = manager.attach(created.id, collectingEvents(secondLog));
    manager.detach(created.id, first.attachmentId);
    fake.spawned[0].onData?.('next> ');

    expect(second.snapshot).toBe('prompt> while detached');
    expect(second.sequence).toBe(2);
    expect(secondLog.data).toEqual(['next> ']);
    expect(second.attachmentId).not.toBe(first.attachmentId);
  });

  it('mantém sessão encerrada e snapshot até fechar a aba', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const created = manager.create(dir);
    const log = { data: [] as string[], exitSent: 0 };
    manager.attach(created.id, collectingEvents(log));
    fake.spawned[0].onData?.('última saída');
    fake.spawned[0].onExit?.({ exitCode: 7 });

    const exited = manager.list(dir).sessions[0];
    const reopened = manager.attach(created.id, collectingEvents({ data: [], exitSent: 0 }));
    expect(exited).toMatchObject({ id: 't1', status: 'exited', exitCode: 7 });
    expect(reopened).toMatchObject({ status: 'exited', exitCode: 7, snapshot: 'última saída' });
    expect(log.exitSent).toBe(1);

    manager.close(created.id);
    expect(manager.list(dir).sessions).toEqual([]);
  });

  it('isola input e saída por sessão', () => {
    const fake = fakeSpawnFactory();
    const ids = ['t1', 't2'];
    const manager = new TerminalManager(fake.spawn, () => ids.shift() ?? 'unexpected');
    const first = manager.create(dir);
    const second = manager.create(dir);
    const firstLog = { data: [] as string[], exitSent: 0 };
    const secondLog = { data: [] as string[], exitSent: 0 };
    manager.attach(first.id, collectingEvents(firstLog));
    manager.attach(second.id, collectingEvents(secondLog));

    manager.input(first.id, 'um');
    manager.input(second.id, 'dois');
    fake.spawned[0].onData?.('saída um');
    fake.spawned[1].onData?.('saída dois');

    expect(fake.writesBySession).toEqual([['um'], ['dois']]);
    expect(firstLog.data).toEqual(['saída um']);
    expect(secondLog.data).toEqual(['saída dois']);
  });

  it('fecha somente o PTY solicitado e remove apenas sua sessão', () => {
    const fake = fakeSpawnFactory();
    const ids = ['t1', 't2'];
    const manager = new TerminalManager(fake.spawn, () => ids.shift() ?? 'unexpected');
    const first = manager.create(dir);
    const second = manager.create(dir);

    manager.close(first.id);

    expect(fake.killCount.value).toBe(1);
    expect(manager.list(dir).sessions).toMatchObject([{ id: second.id, status: 'running' }]);
    expect(manager.alive(first.id)).toBe(false);
    expect(manager.alive(second.id)).toBe(true);
  });

  it('descarta todas as sessões do workspace sem fechar uma subpasta', () => {
    const fake = fakeSpawnFactory();
    const ids = ['t1', 't2', 't3'];
    const manager = new TerminalManager(fake.spawn, () => ids.shift() ?? 'unexpected');
    manager.create(dir);
    manager.create(dir);
    const nested = manager.create(join(dir, 'sub'));

    manager.killForCwd(dir);

    expect(fake.killCount.value).toBe(2);
    expect(manager.list(dir).sessions).toEqual([]);
    expect(manager.list(join(dir, 'sub')).sessions).toMatchObject([{ id: nested.id, status: 'running' }]);
  });

  it('encerra todas as sessões no shutdown e permite chamada repetida', () => {
    const fake = fakeSpawnFactory();
    const ids = ['t1', 't2'];
    const manager = new TerminalManager(fake.spawn, () => ids.shift() ?? 'unexpected');
    manager.create(dir);
    manager.create(join(dir, 'sub'));

    manager.killAll();
    manager.killAll();

    expect(fake.killCount.value).toBe(2);
    expect(manager.list(dir).sessions).toEqual([]);
    expect(manager.list(join(dir, 'sub')).sessions).toEqual([]);
  });

  it('kills the terminal session for a workspace cwd', () => {
    const fake = fakeSpawnFactory();
    const manager = new TerminalManager(fake.spawn, () => 't1');
    const session = manager.create(dir);
    manager.killForCwd(dir);
    expect(fake.killCount.value).toBe(1);
    expect(manager.alive(session.id)).toBe(false);
  });
});
