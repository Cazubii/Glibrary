import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { randomUUID } from 'crypto';
import { existsSync, statSync } from 'fs';
import { basename, join, resolve } from 'path';
import type { DetectionResult, IpcResult, Repo, Settings } from '../../shared/types';
import {
  AddLocalInputSchema,
  RepoIdInputSchema,
  RepoUpdateInputSchema,
  RepoRemoveInputSchema,
  SettingsPatchSchema
} from '../../shared/schemas';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from '../services/library-store';
import { detectProject } from '../services/detector';
import { applyDetection } from '../services/detector/apply';

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

function inferInstalled(localPath: string): boolean {
  return ['node_modules', '.venv', 'venv', 'target'].some((d) =>
    existsSync(join(localPath, d)),
  );
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
        const installed = inferInstalled(localPath);
        const repo: Repo = {
          id: randomUUID(),
          name: basename(localPath),
          localPath,
          status: installed ? 'installed' : 'cloned',
          tags: [],
          favorite: false,
          addedAt: new Date().toISOString(),
          ...(installed ? { installedAt: new Date().toISOString() } : {})
        };
        const detection = await detectProject(localPath);
        const saved = await store.addRepo(applyDetection(repo, detection));
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
    IpcChannels.repoDetect,
    async (_event, raw: unknown): Promise<IpcResult<DetectionResult>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        if (repo.localPath == null) {
          return fail(new Error('Repositório sem pasta local'));
        }
        const detection = await detectProject(repo.localPath);
        await store.updateRepo(id, applyDetection(repo, detection));
        return ok(detection);
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

  ipcMain.handle(
    IpcChannels.repoOpenBrowser,
    async (_event, raw: unknown): Promise<IpcResult<null>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        if (repo.openUrl == null) return fail(new Error('Nenhuma URL detectada'));
        await shell.openExternal(repo.openUrl);
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
