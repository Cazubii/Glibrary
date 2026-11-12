import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import type { IPty } from 'node-pty';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcChannels } from '../src/shared/ipc-channels';
import { registerTerminalIpc } from '../src/main/ipc/terminal.ipc';
import { TerminalManager, type SpawnPty } from '../src/main/services/terminal-manager';

interface FakePtyHooks {
  onData?: (data: string) => void;
  onExit?: (event: { exitCode: number }) => void;
}

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>()
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => handlers.set(channel, handler),
    on: vi.fn()
  }
}));

describe('terminal IPC', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'glib-term-ipc-'));
  });
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  beforeEach(() => handlers.clear());

  it('lista, cria e anexa sessões por ID e valida payloads inválidos', async () => {
    const spawned: FakePtyHooks[] = [];
    const spawn: SpawnPty = () => {
      const hooks: FakePtyHooks = {};
      spawned.push(hooks);
      return {
        onData: (callback: (data: string) => void) => { hooks.onData = callback; return { dispose: () => undefined }; },
        onExit: (callback: (event: { exitCode: number }) => void) => { hooks.onExit = callback; return { dispose: () => undefined }; },
        write: vi.fn(),
        resize: vi.fn(),
        kill: vi.fn()
      } as unknown as IPty;
    };
    const manager = new TerminalManager(spawn, (() => {
      let next = 0;
      return () => `ipc-${++next}`;
    })());
    registerTerminalIpc(manager);
    const senderEvents = vi.fn();
    const event = { sender: { isDestroyed: () => false, send: senderEvents } };
    const invoke = async (channel: string | undefined, payload: unknown, ipcEvent: unknown = event): Promise<unknown> => {
      const handler = handlers.get(channel ?? '');
      if (handler == null) throw new Error(`IPC handler não registrado: ${channel}`);
      return handler(ipcEvent, payload);
    };

    const first = await invoke(IpcChannels.terminalSessionCreate, { cwd: dir }) as {
      ok: boolean; data: { id: string; name: string };
    };
    const second = await invoke(IpcChannels.terminalSessionCreate, { cwd: dir }) as {
      ok: boolean; data: { id: string; name: string };
    };
    expect(first).toMatchObject({ ok: true, data: { id: 'ipc-1', name: 'Terminal 1' } });
    expect(second).toMatchObject({ ok: true, data: { id: 'ipc-2', name: 'Terminal 2' } });
    expect(first.data.id).not.toBe(second.data.id);

    const listed = await invoke(IpcChannels.terminalList, { cwd: dir }) as {
      ok: boolean; data: { cwd: string; sessions: Array<{ id: string }> };
    };
    expect(listed).toMatchObject({
      ok: true,
      data: { cwd: resolve(dir), sessions: [{ id: first.data.id }, { id: second.data.id }] }
    });

    spawned[0].onData?.('prompt> ');
    const attached = await invoke(IpcChannels.terminalAttach, { id: first.data.id }) as {
      ok: boolean; data: { id: string; attachmentId: string; snapshot: string; sequence: number };
    };
    expect(attached).toMatchObject({
      ok: true,
      data: { id: first.data.id, snapshot: 'prompt> ', sequence: 1 }
    });

    const reattached = await invoke(IpcChannels.terminalAttach, { id: first.data.id }) as {
      ok: boolean; data: { attachmentId: string };
    };
    expect(reattached.data.attachmentId).not.toBe(attached.data.attachmentId);
    const detachedOld = await invoke(IpcChannels.terminalDetach, {
      id: first.data.id,
      attachmentId: attached.data.attachmentId
    });
    expect(detachedOld).toMatchObject({ ok: true });
    spawned[0].onData?.('next> ');
    expect(senderEvents).toHaveBeenCalledWith(IpcChannels.terminalOutput, {
      id: first.data.id,
      data: 'next> ',
      sequence: 2
    });

    const invalidCreate = await invoke(IpcChannels.terminalSessionCreate, {});
    const invalidAttach = await invoke(IpcChannels.terminalAttach, { id: '' });
    expect(invalidCreate).toMatchObject({ ok: false });
    expect(invalidAttach).toMatchObject({ ok: false });
    expect(spawned).toHaveLength(2);
  });
});
