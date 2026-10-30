import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { randomUUID } from 'crypto';
import { existsSync, statSync } from 'fs';
import { basename, resolve } from 'path';
import type { IpcResult, Repo, Settings } from '../../shared/types';
import {
  AddLocalInputSchema,
  RepoUpdateInputSchema,
  RepoRemoveInputSchema,
  SettingsPatchSchema
} from '../../shared/schemas';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from '../services/library-store';

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function broadcastStatus(id: string, status: Repo['status']): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IpcChannels.repoStatusChanged, { id, status });
  }
}

export function registerRepoIpc(store: LibraryStore): void {
  ipcMain.handle(IpcChannels.libraryGet, async (): Promise<IpcResult<unknown>> => {
    try {
      return ok(store.get());
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(
    IpcChannels.repoAddLocal,
    async (_event, raw: unknown): Promise<IpcResult<Repo>> => {
      try {
        const input = AddLocalInputSchema.parse(raw);
        const localPath = resolve(input.path);
        if (!existsSync(localPath) || !statSync(localPath).isDirectory()) {
          return fail(new Error('Pasta não encontrada'));
        }
        const duplicate = store
          .listRepos()
          .find((r) => r.localPath != null && resolve(r.localPath) === localPath);
        if (duplicate) {
          return fail(new Error('Esta pasta já está na biblioteca'));
        }
        const repo: Repo = {
          id: randomUUID(),
          name: basename(localPath),
          localPath,
          status: 'cloned',
          tags: [],
          favorite: false,
          addedAt: new Date().toISOString()
        };
        const saved = await store.addRepo(repo);
        broadcastStatus(saved.id, saved.status);
        return ok(saved);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoUpdate,
    async (_event, raw: unknown): Promise<IpcResult<Repo>> => {
      try {
        const input = RepoUpdateInputSchema.parse(raw);
        const { id, ...patch } = input;
        const before = store.getRepo(id);
        const updated = await store.updateRepo(id, patch);
        if (before == null || before.status !== updated.status) {
          broadcastStatus(updated.id, updated.status);
        }
        return ok(updated);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoRemove,
    async (_event, raw: unknown): Promise<IpcResult<null>> => {
      try {
        const input = RepoRemoveInputSchema.parse(raw);
        const repo = store.getRepo(input.id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        await store.removeRepo(input.id);
        if (input.deleteFolder && repo.localPath && existsSync(repo.localPath)) {
          await shell.trashItem(repo.localPath);
        }
        return ok(null);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(IpcChannels.dialogPickFolder, async (): Promise<IpcResult<string | null>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const options = { properties: ['openDirectory' as const] };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return ok(null);
      return ok(result.filePaths[0]);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.settingsGet, async (): Promise<IpcResult<Settings>> => {
    try {
      return ok(store.getSettings());
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(
    IpcChannels.settingsSet,
    async (_event, raw: unknown): Promise<IpcResult<Settings>> => {
      try {
        const patch = SettingsPatchSchema.parse(raw);
        return ok(await store.updateSettings(patch));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
