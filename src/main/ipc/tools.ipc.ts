import { ipcMain } from 'electron';
import type { IpcResult } from '../../shared/types';
import type { ToolStatus } from '../../shared/tools';
import { IpcChannels } from '../../shared/ipc-channels';
import type { ToolsChecker } from '../services/tools-checker';

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function registerToolsIpc(checker: ToolsChecker): void {
  ipcMain.handle(
    IpcChannels.toolsCheck,
    async (_event, raw: unknown): Promise<IpcResult<ToolStatus[]>> => {
      try {
        const force = raw != null && typeof raw === 'object' && (raw as { force?: unknown }).force === true;
        return ok(await checker.check(force));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
