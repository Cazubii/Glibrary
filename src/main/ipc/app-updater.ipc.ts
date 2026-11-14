import { ipcMain } from 'electron';
import { IpcChannels } from '../../shared/ipc-channels';
import type { IpcResult } from '../../shared/types';
import { translateError } from '../services/error-translator';
import type { AppUpdaterManager } from '../services/app-updater';

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: translateError(error) };
}

export function registerAppUpdaterIpc(manager: AppUpdaterManager): void {
  ipcMain.handle(IpcChannels.appUpdateGetState, async (): Promise<IpcResult<ReturnType<AppUpdaterManager['getState']>>> => {
    try {
      return ok(manager.getState());
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IpcChannels.appUpdateCheck, async (): Promise<IpcResult<ReturnType<AppUpdaterManager['getState']>>> => {
    try {
      return ok(await manager.check());
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IpcChannels.appUpdateInstall, async (): Promise<IpcResult<null>> => {
    try {
      manager.install();
      return ok(null);
    } catch (error) {
      return fail(error);
    }
  });
}
