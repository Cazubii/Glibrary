import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import { translateError } from '../services/error-translator';
import { randomUUID } from 'crypto';
import { copyFileSync, existsSync, statSync } from 'fs';
import { readFile, rm, writeFile } from 'fs/promises';
import { spawn } from 'child_process';
import { basename, join, resolve } from 'path';
import type { DetectionResult, GitChangePreview, GitStatusDetail, GithubOAuthDeviceSession, GithubOAuthPollResult, GithubUser, IpcResult, Repo, RepoGitPrepareResult, RepoPublishResult, Settings } from '../../shared/types';
import {
  AddLocalInputSchema,
  AddByUrlInputSchema,
  AuthTokenInputSchema,
  GithubOAuthSessionInputSchema,
  CommitInputSchema,
  RepoIdInputSchema,
  RepoGitPrepareInputSchema,
  RepoPublishInputSchema,
  RepoPushInputSchema,
  RepoUpdateInputSchema,
  RepoRemoveInputSchema,
  SettingsPatchSchema,
} from '../../shared/schemas';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from '../services/library-store';
import { migrateLibrary } from '../services/library-store';
import type { GitService } from '../services/git-service';
import { assertProtectedBranchPush } from '../services/git-protection';
import { detectProject } from '../services/detector';
import { applyDetection } from '../services/detector/apply';
import { fetchJson, fetchRepoMeta, fetchGithubUser, encodeToken } from '../services/github-api';
import { createAccountRepository } from '../services/github-projects';
import { GithubOAuthService, getGithubAccessToken } from '../services/github-oauth';
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
  return { ok: false, error: translateError(error) };
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

function openTerminal(cwd: string): void {
  const spawnDetached = (command: string, args: string[]): void => {
    const child = spawn(command, args, {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    });
    child.on('error', () => undefined);
    child.unref();
  };

  if (process.platform === 'win32') {
    spawnDetached('cmd.exe', []);
  } else if (process.platform === 'darwin') {
    spawnDetached('open', ['-a', 'Terminal', cwd]);
  } else {
    spawnDetached('x-terminal-emulator', []);
  }
}

export function registerRepoIpc(
  store: LibraryStore,
  git: GitService,
  coversDir: string,
): void {
  const githubOAuth = new GithubOAuthService(store);
  const githubToken = (): Promise<string | undefined> => getGithubAccessToken(store);
  /** Resolve a pasta local de um repo OU de um projeto da biblioteca. */
  const gitTarget = (id: string): string => {
    const repoLocal = store.getRepo(id)?.localPath;
    if (repoLocal != null && repoLocal !== '') return repoLocal;
    const project = store.listProjects().find((p) => p.id === id);
    if (project?.localPath != null && project.localPath !== '') return project.localPath;
    throw new Error('Repositório/projeto sem pasta local');
  };
  ipcMain.handle(IpcChannels.libraryGet, async (): Promise<IpcResult<unknown>> => {
    try {
      return ok(store.get());
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.libraryExport, async (): Promise<IpcResult<string | null>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const options = {
        defaultPath: 'glibrary-backup.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      };
      const result = win
        ? await dialog.showSaveDialog(win, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || result.filePath == null) return ok(null);
      await writeFile(result.filePath, JSON.stringify(store.get(), null, 2), 'utf8');
      return ok(result.filePath);
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(IpcChannels.libraryImport, async (): Promise<IpcResult<number>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      const options = {
        properties: ['openFile' as const],
        filters: [{ name: 'JSON', extensions: ['json'] }]
      };
      const result = win
        ? await dialog.showOpenDialog(win, options)
        : await dialog.showOpenDialog(options);
      if (result.canceled || result.filePaths.length === 0) return ok(0);
      const raw = JSON.parse(await readFile(result.filePaths[0], 'utf8')) as unknown;
      const file = migrateLibrary(raw);
      const existing = store.listRepos();
      const knownUrls = new Set(
        existing.filter((r) => r.remoteUrl != null).map((r) => normalizeGitUrl(r.remoteUrl as string)),
      );
      const knownPaths = new Set(
        existing
          .filter((r) => r.localPath != null)
          .map((r) => normalizeLocalPath(r.localPath as string, process.platform)),
      );
      let imported = 0;
      for (const repo of file.repos) {
        if (knownUrls.has(repo.remoteUrl != null ? normalizeGitUrl(repo.remoteUrl) : '')) continue;
        if (
          repo.localPath != null &&
          knownPaths.has(normalizeLocalPath(repo.localPath, process.platform))
        ) {
          continue;
        }
        const exists = store.listRepos().some((r) => r.id === repo.id);
        await store.addRepo(exists ? { ...repo, id: randomUUID() } : repo);
        imported += 1;
      }
      const current = store.get();
      const appendUnique = <T extends { id: string }>(existingItems: T[], incoming: T[]): T[] => {
        const ids = new Set(existingItems.map((item) => item.id));
        imported += incoming.filter((item) => !ids.has(item.id)).length;
        return [...existingItems, ...incoming.filter((item) => !ids.has(item.id))];
      };
      await store.replaceAssets({
        skills: appendUnique(current.skills, file.skills),
        bases: appendUnique(current.bases, file.bases),
        projects: appendUnique(current.projects, file.projects)
      });
      return ok(imported);
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
            const meta = await fetchRepoMeta(gh.owner, gh.repo, { token: await githubToken() });
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
                await githubToken(),
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
              await githubToken(),
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
        const meta = await fetchRepoMeta(gh.owner, gh.repo, { token: await githubToken() });
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

  ipcMain.handle(
    IpcChannels.repoOpenFolder,
    async (_event, raw: unknown): Promise<IpcResult<null>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        if (repo.localPath == null) return fail(new Error('Repositório sem pasta local'));
        const error = await shell.openPath(repo.localPath);
        if (error !== '') return fail(new Error(error));
        return ok(null);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoOpenEditor,
    async (_event, raw: unknown): Promise<IpcResult<null>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        if (repo.localPath == null) return fail(new Error('Repositório sem pasta local'));
        const editor = store.getSettings().editorCommand;
        const child = spawn(editor, [repo.localPath], {
          shell: process.platform === 'win32',
          detached: true,
          stdio: 'ignore'
        });
        child.on('error', () => undefined);
        child.unref();
        return ok(null);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoOpenTerminal,
    async (_event, raw: unknown): Promise<IpcResult<null>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        if (repo.localPath == null) return fail(new Error('Repositório sem pasta local'));
        openTerminal(repo.localPath);
        return ok(null);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoCreateEnv,
    async (_event, raw: unknown): Promise<IpcResult<null>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        if (repo.localPath == null) return fail(new Error('Repositório sem pasta local'));
        const source = join(repo.localPath, '.env.example');
        const target = join(repo.localPath, '.env');
        if (!existsSync(source)) return fail(new Error('.env.example não encontrado'));
        if (existsSync(target)) return fail(new Error('.env já existe'));
        copyFileSync(source, target);
        await store.updateRepo(id, {
          detection: repo.detection != null ? { ...repo.detection, hasEnvExample: false } : undefined
        });
        return ok(null);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoUninstallDeps,
    async (_event, raw: unknown): Promise<IpcResult<Repo>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        const repo = store.getRepo(id);
        if (!repo) return fail(new Error('Repositório não encontrado'));
        if (repo.localPath == null) return fail(new Error('Repositório sem pasta local'));
        const targets = ['node_modules', '.venv', 'venv'];
        for (const dir of targets) {
          const full = join(repo.localPath, dir);
          if (existsSync(full)) await rm(full, { recursive: true, force: true });
        }
        const updated = await store.updateRepo(id, {
          status: 'cloned',
          installedAt: undefined
        });
        broadcastStatus(id, updated.status);
        return ok(updated);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.githubOAuthStatus,
    async (): Promise<IpcResult<{ configured: boolean }>> => ok({ configured: githubOAuth.isConfigured() }),
  );

  ipcMain.handle(
    IpcChannels.githubOAuthStart,
    async (): Promise<IpcResult<GithubOAuthDeviceSession>> => {
      try {
        return ok(await githubOAuth.startDeviceFlow());
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.githubOAuthPoll,
    async (_event, raw: unknown): Promise<IpcResult<GithubOAuthPollResult>> => {
      try {
        const { sessionId } = GithubOAuthSessionInputSchema.parse(raw);
        return ok(await githubOAuth.pollDeviceFlow(sessionId));
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.githubOAuthCancel,
    async (_event, raw: unknown): Promise<IpcResult<null>> => {
      try {
        const { sessionId } = GithubOAuthSessionInputSchema.parse(raw);
        githubOAuth.cancelDeviceFlow(sessionId);
        return ok(null);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.githubAuthCheck,
    async (_event, raw: unknown): Promise<IpcResult<GithubUser>> => {
      try {
        const { token } = AuthTokenInputSchema.parse(raw);
        return ok(await fetchGithubUser(token));
      } catch (e) {
        return fail(e instanceof Error && e.message.includes('HTTP 401')
          ? new Error('Token inválido ou sem autorização no GitHub')
          : e);
      }
    },
  );

  ipcMain.handle(IpcChannels.githubAuthMe, async (): Promise<IpcResult<GithubUser | null>> => {
    try {
      const token = await githubToken();
      if (token == null) return ok(null);
      return ok(await fetchGithubUser(token));
    } catch (e) {
      // token salvo mas inválido/expirado: sessão tratada como desconectada
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('HTTP 401')) return ok(null);
      return fail(e);
    }
  });

  ipcMain.handle(
    IpcChannels.repoGitStatus,
    async (_event, raw: unknown): Promise<IpcResult<GitStatusDetail>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        return ok(await git.listChanges(gitTarget(id)));
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoGitPrepare,
    async (_event, raw: unknown): Promise<IpcResult<RepoGitPrepareResult>> => {
      try {
        const input = RepoGitPrepareInputSchema.parse(raw);
        const repo = store.getRepo(input.id);
        if (repo?.localPath == null || !existsSync(repo.localPath) || !statSync(repo.localPath).isDirectory()) {
          throw new Error('Escolha primeiro uma pasta de projeto que exista no computador.');
        }
        return ok(await git.prepareForPublish(repo.localPath, input.identity));
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IpcChannels.repoGitPreview,
    async (_event, raw: unknown): Promise<IpcResult<GitChangePreview>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        return ok(await git.previewChanges(gitTarget(id)));
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IpcChannels.repoCommit,
    async (_event, raw: unknown): Promise<IpcResult<{ commit: string }>> => {
      try {
        const { id, message, revision } = CommitInputSchema.parse(raw);
        return ok(await git.commitReviewed(gitTarget(id), message, revision));
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoGitUndo,
    async (_event, raw: unknown): Promise<IpcResult<{ branch: string; commit: string }>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        return ok(await git.undoLastUnsentCommit(gitTarget(id)));
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IpcChannels.repoGitRevert,
    async (_event, raw: unknown): Promise<IpcResult<{ branch: string; commit: string }>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        return ok(await git.revertLastSentCommit(gitTarget(id)));
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IpcChannels.repoPush,
    async (_event, raw: unknown): Promise<IpcResult<{ branch: string }>> => {
      try {
        const { id, confirmProtectedBranch } = RepoPushInputSchema.parse(raw);
        const branch = await git.getCurrentBranch(gitTarget(id));
        assertProtectedBranchPush(branch, !store.getSettings().showAdvancedResources, confirmProtectedBranch);
        return ok(await git.push(gitTarget(id), await githubToken()));
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.repoPublish,
    async (_event, raw: unknown): Promise<IpcResult<RepoPublishResult>> => {
      try {
        const input = RepoPublishInputSchema.parse(raw);
        const repo = store.getRepo(input.id);
        if (repo?.localPath == null || !existsSync(repo.localPath) || !statSync(repo.localPath).isDirectory()) {
          throw new Error('Escolha primeiro uma pasta de projeto que exista no computador.');
        }
        const token = await githubToken();
        if (token == null || token === '') throw new Error('Conecte sua conta GitHub antes de publicar.');
        const { branch } = await git.assertReadyToPublish(repo.localPath);
        assertProtectedBranchPush(branch, !store.getSettings().showAdvancedResources, input.confirmProtectedBranch);
        const created = await createAccountRepository(fetchJson, {
          token,
          name: input.name,
          ...(input.description != null && input.description !== '' ? { description: input.description } : {}),
          visibility: input.visibility
        });
        await store.updateRepo(repo.id, { owner: created.owner, remoteUrl: created.cloneUrl });
        await git.addOrigin(repo.localPath, created.cloneUrl);
        try {
          await git.push(repo.localPath, token);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`O repositório ${created.htmlUrl} foi criado, mas a primeira versão ainda não foi enviada. O endereço foi salvo no projeto; abra Projetos e tente “Enviar ao GitHub”. Detalhes: ${detail}`);
        }
        return ok({
          owner: created.owner,
          name: created.name,
          visibility: created.visibility,
          htmlUrl: created.htmlUrl,
          branch
        });
      } catch (error) {
        return fail(error);
      }
    }
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
          patch.githubRefreshToken = '';
          patch.githubTokenExpiresAt = undefined;
          patch.githubRefreshTokenExpiresAt = undefined;
        } else if (patch.githubRefreshToken != null) {
          patch.githubRefreshToken =
            patch.githubRefreshToken === '' ? '' : encodeToken(patch.githubRefreshToken);
        }
        return ok(await store.updateSettings(patch));
      } catch (e) {
        return fail(e);
      }
    },
  );
}

