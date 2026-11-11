import { ipcMain } from 'electron';
import { z } from 'zod';
import { IpcChannels } from '../../shared/ipc-channels';
import type { IpcResult } from '../../shared/types';
import type { TerminalEvents, TerminalManager } from '../services/terminal-manager';

const CreateInput = z.object({
  cwd: z.string().min(1),
  cols: z.number().int().min(2).max(500).optional(),
  rows: z.number().int().min(2).max(200).optional()
});

const DataInput = z.object({ id: z.string(), data: z.string() });

const ResizeInput = z.object({
  id: z.string(),
  cols: z.number().int().min(2).max(500),
  rows: z.number().int().min(2).max(200)
});

const IdInput = z.object({ id: z.string() });

export function registerTerminalIpc(manager: TerminalManager): void {
  ipcMain.handle(IpcChannels.terminalCreate, async (event, raw: unknown): Promise<IpcResult<{ id: string }>> => {
    try {
      const input = CreateInput.parse(raw);
      const sink: TerminalEvents = {
        send: (channel, payload) => {
          if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
        }
      };
      const id = manager.create(sink, input.cwd, input.cols, input.rows);
      return { ok: true, data: { id } };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IpcChannels.terminalOpen, async (event, raw: unknown): Promise<IpcResult<{ id: string; snapshot: string; sequence: number }>> => {
    try {
      const input = CreateInput.parse(raw);
      const sink: TerminalEvents = {
        send: (channel, payload) => {
          if (!event.sender.isDestroyed()) event.sender.send(channel, payload);
        }
      };
      return { ok: true, data: manager.open(sink, input.cwd, input.cols, input.rows) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle(IpcChannels.terminalDetach, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { id } = IdInput.parse(raw);
      manager.detach(id);
      return { ok: true, data: null };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.on(IpcChannels.terminalInput, (_event, raw: unknown) => {
    try {
      const { id, data } = DataInput.parse(raw);
      manager.input(id, data);
    } catch {
      // entrada inválida é ignorada; não há com quem responder
    }
  });

  ipcMain.on(IpcChannels.terminalResize, (_event, raw: unknown) => {
    try {
      const { id, cols, rows } = ResizeInput.parse(raw);
      manager.resize(id, cols, rows);
    } catch {
      // idem
    }
  });

  ipcMain.on(IpcChannels.terminalKill, (_event, raw: unknown) => {
    try {
      const { id } = IdInput.parse(raw);
      manager.kill(id);
    } catch {
      // idem
    }
  });
}
