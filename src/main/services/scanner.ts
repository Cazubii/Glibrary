import { promises as fs } from 'fs';
import type { Dirent } from 'fs';
import { join } from 'path';
import { normalizeGitUrl, normalizeLocalPath } from '../../shared/git-utils';
import type { FoundRepo, Repo, ScannedRepo } from '../../shared/types';

const IGNORED_DIRS = new Set([
  'node_modules',
  '.venv',
  'venv',
  'target',
  'dist',
  'build',
  '.cache',
  'AppData',
  'Library',
  '$Recycle.Bin',
  'Program Files'
]);

export interface ScanProgress {
  currentPath: string;
  found: number;
}

export interface ScanOptions {
  folders: string[];
  maxDepth?: number;
  platform?: NodeJS.Platform;
  onProgress?: (progress: ScanProgress) => void;
  isCancelled?: () => boolean;
  readGit?: (localPath: string) => Promise<{ remoteUrl?: string; branch?: string }>;
}

async function hasGitDir(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(join(dir, '.git'));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

async function walk(
  dir: string,
  depth: number,
  maxDepth: number,
  opts: {
    found: FoundRepo[];
    isCancelled: () => boolean;
    onProgress?: (p: ScanProgress) => void;
  }
): Promise<void> {
  if (opts.isCancelled()) return;
  if (await hasGitDir(dir)) {
    opts.found.push({ localPath: dir });
    opts.onProgress?.({ currentPath: dir, found: opts.found.length });
    return;
  }
  if (depth >= maxDepth) return;

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (opts.isCancelled()) return;
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith('.') || IGNORED_DIRS.has(name)) continue;
    await walk(join(dir, name), depth + 1, maxDepth, opts);
  }
}

/** Varre as pastas e devolve os repositórios encontrados (seção 9). */
export async function scanFolders(options: ScanOptions): Promise<FoundRepo[]> {
  const maxDepth = options.maxDepth ?? 4;
  const isCancelled = options.isCancelled ?? (() => false);
  const found: FoundRepo[] = [];

  for (const folder of options.folders) {
    if (isCancelled()) break;
    try {
      const stat = await fs.stat(folder);
      if (!stat.isDirectory()) continue;
    } catch {
      continue;
    }
    options.onProgress?.({ currentPath: folder, found: found.length });
    await walk(folder, 0, maxDepth, {
      found,
      isCancelled,
      ...(options.onProgress ? { onProgress: options.onProgress } : {})
    });
  }

  if (options.readGit != null) {
    for (const repo of found) {
      try {
        const meta = await options.readGit(repo.localPath);
        if (meta.remoteUrl != null) repo.remoteUrl = meta.remoteUrl;
        if (meta.branch != null) repo.branch = meta.branch;
      } catch {
        // segue sem metadados de git
      }
    }
  }

  return found;
}

/**
 * Marca duplicatas comparando caminho local normalizado ou URL remota
 * normalizada (seção 9). A resolução de conflito de URL/diferente pasta fica
 * na UI.
 */
export function classifyFound(
  found: FoundRepo[],
  existing: Repo[],
  platform: NodeJS.Platform = process.platform
): ScannedRepo[] {
  const byPath = new Map<string, Repo>();
  const byUrl = new Map<string, Repo>();
  for (const repo of existing) {
    if (repo.localPath != null) {
      byPath.set(normalizeLocalPath(repo.localPath, platform), repo);
    }
    if (repo.remoteUrl != null) {
      byUrl.set(normalizeGitUrl(repo.remoteUrl), repo);
    }
  }

  return found.map((item) => {
    const pathKey = normalizeLocalPath(item.localPath, platform);
    const pathMatch = byPath.get(pathKey);
    if (pathMatch != null) {
      return { ...item, duplicateOf: 'path', existingRepoId: pathMatch.id };
    }
    if (item.remoteUrl != null) {
      const urlMatch = byUrl.get(normalizeGitUrl(item.remoteUrl));
      if (urlMatch != null) {
        return { ...item, duplicateOf: 'url', existingRepoId: urlMatch.id };
      }
    }
    return { ...item };
  });
}
