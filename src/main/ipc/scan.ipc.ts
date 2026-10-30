import { ipcMain, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { existsSync, statSync } from 'fs';
import { basename, join, resolve } from 'path';
import { homedir } from 'os';
import type { IpcResult, Repo, ScannedRepo } from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from '../services/library-store';
import type { GitService } from '../services/git-service';
import { detectProject } from '../services/detector';
import { applyDetection } from '../services/detector/apply';
import { scanFolders, classifyFound } from '../services/scanner';
import { normalizeGitUrl, normalizeLocalPath, parseGithubRepo } from '../../shared/git-utils';

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
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

function parseFolders(raw: unknown, fallback: string[]): string[] {
  if (raw == null || typeof raw !== 'object') return fallback;
  const value = (raw as { folders?: unknown }).folders;
  if (!Array.isArray(value)) return fallback;
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
}

interface ImportItem {
  localPath: string;
  remoteUrl?: string;
  branch?: string;
}

function parseImportItems(raw: unknown): ImportItem[] {
  if (raw == null || typeof raw !== 'object') return [];
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((item): ImportItem | null => {
      if (item == null || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      if (typeof obj.localPath !== 'string') return null;
      return {
        localPath: obj.localPath,
        ...(typeof obj.remoteUrl === 'string' ? { remoteUrl: obj.remoteUrl } : {}),
        ...(typeof obj.branch === 'string' ? { branch: obj.branch } : {})
      };
    })
    .filter((item): item is ImportItem => item != null);
}

const CANDIDATE_HOMES = [
  'Projects',
  'projetos',
  'dev',
  'code',
  'source/repos',
  'Documents/GitHub',
  'Desktop'
];

export function registerScanIpc(store: LibraryStore, git: GitService): void {
  let cancelled = false;

  ipcMain.handle(
    IpcChannels.scanStart,
    async (_event, raw: unknown): Promise<IpcResult<ScannedRepo[]>> => {
      try {
        cancelled = false;
        const folders = parseFolders(raw, store.getSettings().scanFolders);
        const found = await scanFolders({
          folders,
          isCancelled: () => cancelled,
          onProgress: (progress) => broadcast(IpcChannels.scanProgress, progress),
          readGit: async (localPath) => {
            const remoteUrl = await git.getRemoteUrl(localPath);
            const branch = await git.getCurrentBranch(localPath);
            return {
              ...(remoteUrl != null ? { remoteUrl } : {}),
              ...(branch != null ? { branch } : {})
            };
          }
        });
        broadcast(IpcChannels.scanProgress, {
          currentPath: '',
          found: found.length,
          done: true
        });
        return ok(classifyFound(found, store.listRepos()));
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(IpcChannels.scanCancel, async (): Promise<IpcResult<null>> => {
    cancelled = true;
    return ok(null);
  });

  ipcMain.handle(
    IpcChannels.scanImport,
    async (_event, raw: unknown): Promise<IpcResult<Repo[]>> => {
      try {
        const items = parseImportItems(raw);
        const imported: Repo[] = [];
        const existing = store.listRepos();
        const paths = new Set(
          existing
            .filter((r) => r.localPath != null)
            .map((r) => normalizeLocalPath(r.localPath as string, process.platform)),
        );
        const urls = new Set(
          existing
            .filter((r) => r.remoteUrl != null)
            .map((r) => normalizeGitUrl(r.remoteUrl as string)),
        );

        for (const item of items) {
          const localPath = resolve(item.localPath);
          if (!existsSync(localPath) || !statSync(localPath).isDirectory()) continue;
          const pathKey = normalizeLocalPath(localPath, process.platform);
          if (paths.has(pathKey)) continue;

          const remoteUrl = item.remoteUrl ?? (await git.getRemoteUrl(localPath)) ?? undefined;
          if (remoteUrl != null) {
            const urlKey = normalizeGitUrl(remoteUrl);
            if (urls.has(urlKey)) continue;
            urls.add(urlKey);
          }
          paths.add(pathKey);

          const github = remoteUrl != null ? parseGithubRepo(remoteUrl) : null;
          const installed = inferInstalled(localPath);
          const repo: Repo = {
            id: randomUUID(),
            name: github?.repo ?? basename(localPath),
            ...(github != null ? { owner: github.owner } : {}),
            ...(remoteUrl != null ? { remoteUrl } : {}),
            localPath,
            status: installed ? 'installed' : 'cloned',
            tags: [],
            favorite: false,
            addedAt: new Date().toISOString(),
            ...(installed ? { installedAt: new Date().toISOString() } : {})
          };
          const detection = await detectProject(localPath);
          const saved = await store.addRepo(applyDetection(repo, detection));
          broadcast(IpcChannels.repoStatusChanged, { id: saved.id, status: saved.status });
          imported.push(saved);
        }
        return ok(imported);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.onboardingSuggest,
    async (): Promise<IpcResult<{ path: string; exists: boolean }[]>> => {
      try {
        const home = homedir();
        return ok(
          CANDIDATE_HOMES.map((candidate) => {
            const path = join(home, candidate);
            let exists = false;
            try {
              exists = statSync(path).isDirectory();
            } catch {
              exists = false;
            }
            return { path, exists };
          }),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );
}
