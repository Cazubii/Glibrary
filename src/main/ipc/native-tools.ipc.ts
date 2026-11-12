import { ipcMain, shell } from 'electron';
import { z } from 'zod';
import type { IpcResult, LogLine, ToolEntry, ToolInstallRun, ToolStatus } from '../../shared/types';
import { ToolInputSchema } from '../../shared/schemas';
import { IpcChannels } from '../../shared/ipc-channels';
import type { ToolManager } from '../services/tool-manager';

const ToolIdInputSchema = z.object({ id: z.string().min(1) }).strict();
const ToolDetectInputSchema = z.object({ id: z.string().min(1).optional() }).strict();

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

export function registerNativeToolsIpc(manager: ToolManager): void {
  ipcMain.handle(IpcChannels.toolsList, async (): Promise<IpcResult<ToolEntry[]>> => {
    try { return ok(manager.list()); } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.toolsAdd, async (_event, raw: unknown): Promise<IpcResult<ToolEntry>> => {
    try {
      const { url } = ToolInputSchema.parse(raw);
      return ok(await manager.add(url));
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.toolsRemove, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { id } = ToolIdInputSchema.parse(raw);
      await manager.remove(id);
      return ok(null);
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.toolsInstall, async (_event, raw: unknown): Promise<IpcResult<ToolInstallRun>> => {
    try {
      const { id } = ToolIdInputSchema.parse(raw);
      return ok(await manager.install(id));
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.toolsOpen, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { id } = ToolIdInputSchema.parse(raw);
      const directory = await manager.getInstalledDirectory(id);
      const error = await shell.openPath(directory);
      if (error !== '') throw new Error(error);
      return ok(null);
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(
    IpcChannels.toolsDetect,
    async (_event, raw: unknown): Promise<IpcResult<ToolStatus | Record<string, ToolStatus>>> => {
      try {
        const { id } = ToolDetectInputSchema.parse(raw ?? {});
        return ok(id != null ? await manager.detect(id) : await manager.detect());
      } catch (error) { return fail(error); }
    }
  );

  ipcMain.handle(IpcChannels.toolRunsGetLogs, async (_event, raw: unknown): Promise<IpcResult<LogLine[]>> => {
    try {
      const { id } = ToolIdInputSchema.parse(raw);
      return ok(manager.getLogs(id));
    } catch (error) { return fail(error); }
  });
}
