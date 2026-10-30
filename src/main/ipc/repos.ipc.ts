import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { randomUUID } from 'crypto';
import { existsSync, statSync } from 'fs';
import { basename, join, resolve } from 'path';
import type { DetectionResult, IpcResult, Repo, Settings } from '../../shared/types';
import {
  AddLocalInputSchema,
  AddByUrlInputSchema,
  RepoIdInputSchema,
  RepoUpdateInputSchema,
  RepoRemoveInputSchema,
  SettingsPatchSchema
} from '../../shared/schemas';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from '../services/library-store';
import type { GitService } from '../services/git-service';
import { detectProject } from '../services/detector';
import { applyDetection } from '../services/detector/apply';
import { fetchRepoMeta, encodeToken, decodeToken } from '../services/github-api';
import { downloadCover } from '../services/cover-service';
import {
  isValidGitUrl,
  normalizeGitUrl,
  normalizeLocalPath,
  parseGithubRepo
} from '../../shared/git-utils';

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

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload);
  }
}

function inferInstalled(localPath: string): boolean {
  return ['node_modules', '.venv', 'venv', 'target'].some((d) =>
    existsSync(join(localPath, d)),
  );
}

function repoNameFromUrl(url: string): string {
  const cleaned = url.trim().replace(/\.git$/, '').replace(/\/+$/, '');
  const segment = cleaned.split(/[/:]/).pop() ?? 'repo';
  return segment;
}

export function registerRepoIpc(
  store: LibraryStore,
  git: GitService,
  coversDir: string,
): void {
  const githubToken = (): string | undefined =>
    decodeToken(store.getSettings().githubToken);
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
    IpcChannels.repoAddByUrl,
    async (_event, raw: unknown): Promise<IpcResult<Repo>> => {
      try {
        const input = AddByUrlInputSchema.parse(raw);
        const url = input.url.trim();
        if (!isValidGitUrl(url)) {
          return fail(new Error('URL inválida. Use https://… ou git@…'));
        }
        const normalized = normalizeGitUrl(url);
        const duplicate = store
          .listRepos()
          .find(
            (r) =>
              (r.remoteUrl != null && normalizeGitUrl(r.remoteUrl) === normalized) ||
              (r.localPath != null &&
                normalizeLocalPath(r.localPath, process.platform) ===
                  normalizeLocalPath(join(store.getSettings().reposRoot, repoNameFromUrl(url)), process.platform)),
          );
        if (duplicate) {
          return fail(new Error(`Já está na biblioteca: ${duplicate.name}`));
        }

        const gh = parseGithubRepo(url);
        const name = input.name ?? gh?.repo ?? repoNameFromUrl(url);
        const now = new Date().toISOString();
        const repo: Repo = {
          id: randomUUID(),
          name,
          owner: gh?.owner,
          remoteUrl: url,
          status: 'not_cloned',
          tags: [],
          favorite: false,
          addedAt: now
        };

        if (gh != null) {
          try {
            const meta = await fetchRepoMeta(gh.owner, gh.repo, { token: githubToken() });
            repo.description = meta.description;
            repo.stars = meta.stars;
            repo.language = meta.language;
            repo.topics = meta.topics;
          } catch {
            // metadados são melhor esforço
          }
          const coverPath = await downloadCover(coversDir, repo.id, gh.owner, gh.repo);
          if (coverPath != null) repo.coverPath = coverPath;
        }

        const saved = await store.addRepo(repo);

        if (input.clone) {
          void (async () => {
            try {
              await store.updateRepo(saved.id, { status: 'cloning' });
              broadcastStatus(saved.id, 'cloning');
              const target = await git.clone(
                saved.id,
                url,
                store.getSettings().reposRoot,
                name,
                (progress) => broadcast(IpcChannels.cloneProgress, { id: saved.id, ...progress }),
              );
              const detection = await detectProject(target);
              const updated = await store.updateRepo(
                saved.id,
                applyDetection({ ...saved, localPath: target, status: 'cloned' }, detection),
              );
              broadcastStatus(saved.id, updated.status);
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              await store.updateRepo(saved.id, { status: 'error', lastError: message });
              broadcastStatus(saved.id, 'error');
            }
          })();
        }

        return ok(saved);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoClone,
    async (_event, raw: unknown): Promise<IpcResult<null>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        const remoteUrl = repo.remoteUrl;
        if (remoteUrl == null) return fail(new Error('Repositório sem URL remota'));
        if (repo.localPath != null && existsSync(repo.localPath)) {
          return fail(new Error('A pasta já existe'));
        }
        void (async () => {
          try {
            await store.updateRepo(id, { status: 'cloning' });
            broadcastStatus(id, 'cloning');
            const name = repo.name;
            const target = await git.clone(
              id,
              remoteUrl,
              store.getSettings().reposRoot,
              name,
              (progress) => broadcast(IpcChannels.cloneProgress, { id, ...progress }),
            );
            const detection = await detectProject(target);
            const updated = await store.updateRepo(
              id,
              applyDetection({ ...repo, localPath: target, status: 'cloned' }, detection),
            );
            broadcastStatus(id, updated.status);
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            await store.updateRepo(id, { status: 'error', lastError: message });
            broadcastStatus(id, 'error');
          }
        })();
        return ok(null);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoPull,
    async (_event, raw: unknown): Promise<IpcResult<{ updated: boolean; summary: string }>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        if (repo.localPath == null) return fail(new Error('Repositório sem pasta local'));
        const result = await git.pull(repo.localPath);
        await store.updateRepo(id, {
          lastPulledAt: new Date().toISOString(),
          behindBy: 0
        });
        return ok(result);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoFetchStatus,
    async (_event, raw: unknown): Promise<IpcResult<{ behindBy: number; ahead: number; dirty: boolean }>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        if (repo.localPath == null) return fail(new Error('Repositório sem pasta local'));
        const status = await git.fetchStatus(repo.localPath);
        await store.updateRepo(id, { behindBy: status.behindBy });
        return ok(status);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoRefreshMeta,
    async (_event, raw: unknown): Promise<IpcResult<Repo>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        const gh = repo.remoteUrl != null ? parseGithubRepo(repo.remoteUrl) : null;
        if (gh == null) return fail(new Error('Não é um repositório GitHub'));
        const meta = await fetchRepoMeta(gh.owner, gh.repo, { token: githubToken() });
        const coverPath =
          (await downloadCover(coversDir, id, gh.owner, gh.repo)) ?? repo.coverPath;
        const updated = await store.updateRepo(id, {
          description: meta.description,
          stars: meta.stars,
          language: meta.language,
          topics: meta.topics,
          ...(coverPath != null ? { coverPath } : {})
        });
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
        if (patch.githubToken != null) {
          patch.githubToken =
            patch.githubToken === '' ? '' : encodeToken(patch.githubToken);
        }
        return ok(await store.updateSettings(patch));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
