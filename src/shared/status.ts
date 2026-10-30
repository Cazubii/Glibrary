import type { Repo, RepoStatus } from './types';

const UNSTABLE_STATUSES: readonly RepoStatus[] = ['cloning', 'installing', 'running'];

export function isUnstableStatus(status: RepoStatus): boolean {
  return UNSTABLE_STATUSES.includes(status);
}

/**
 * Ao abrir o app (seção 5.2): status presos em estados transitórios voltam
 * para o último status estável (installed ou cloned).
 */
export function stabilizeOnStartup(
  status: RepoStatus,
  hasInstalledAt: boolean,
  hasLocalPath: boolean,
): RepoStatus {
  if (!isUnstableStatus(status)) return status;
  if (!hasLocalPath) return 'not_cloned';
  return hasInstalledAt ? 'installed' : 'cloned';
}

/**
 * Ao abrir o app (seção 5.2): repo com localPath cuja pasta sumiu vira `missing`.
 * Repos sem localPath (not_cloned) não são afetados.
 */
export function markMissingOnStartup(
  status: RepoStatus,
  hasLocalPath: boolean,
  folderExists: boolean,
): RepoStatus {
  if (hasLocalPath && !folderExists && status !== 'not_cloned') return 'missing';
  return status;
}

export function applyStartupCorrections(
  repo: Repo,
  folderExists: boolean,
): { status: RepoStatus; changed: boolean } {
  const stabilized = stabilizeOnStartup(
    repo.status,
    repo.installedAt != null,
    repo.localPath != null,
  );
  const status = markMissingOnStartup(stabilized, repo.localPath != null, folderExists);
  return { status, changed: status !== repo.status };
}
