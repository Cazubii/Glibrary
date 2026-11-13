import type { Repo, RepoStatus } from './types';

/** Perfil público da conta GitHub conectada (resposta de /user). */
export interface GithubProfile {
  login: string;
  name?: string;
  avatarUrl?: string;
  bio?: string;
  htmlUrl?: string;
  location?: string;
  blog?: string;
  followers: number;
  following: number;
  publicRepos: number;
  createdAt?: string;
}

/** Cota "core" da API REST do GitHub (resposta de /rate_limit). */
export interface GithubRateLimit {
  limit: number;
  remaining: number;
  used: number;
  /** ISO do momento em que a cota é renovada. */
  resetAt: string;
}

/** Repositório da conta conectada (resposta de /user/repos). */
export interface GithubOwnRepo {
  name: string;
  fullName: string;
  htmlUrl: string;
  description?: string;
  language?: string;
  stars: number;
  forks: number;
  private: boolean;
  fork: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Dados da aba Dashboard vindos do GitHub. */
export interface DashboardAccount {
  connected: boolean;
  profile: GithubProfile | null;
  rateLimit: GithubRateLimit | null;
  repos: GithubOwnRepo[];
  fetchedAt: string;
}

export type RateLimitLevel = 'ok' | 'warn' | 'critical';

/** verde ≥ 50% · amarelo ≥ 10% · vermelho abaixo disso. */
export function rateLimitLevel(rate: GithubRateLimit): RateLimitLevel {
  if (rate.limit <= 0) return 'critical';
  const ratio = rate.remaining / rate.limit;
  if (ratio >= 0.5) return 'ok';
  if (ratio >= 0.1) return 'warn';
  return 'critical';
}

export interface LabelCount {
  label: string;
  value: number;
}

/** Top linguagens por nº de repositórios; o restante vira "Outras". */
export function computeLanguageStats(repos: GithubOwnRepo[], top = 6): LabelCount[] {
  const counts = new Map<string, number>();
  for (const repo of repos) {
    const lang = repo.language ?? 'Sem linguagem';
    counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const sorted = [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  if (sorted.length <= top) return sorted;
  const head = sorted.slice(0, top);
  const rest = sorted.slice(top).reduce((sum, item) => sum + item.value, 0);
  return [...head, { label: 'Outras', value: rest }];
}

/** Repositórios criados por ano nos últimos `years` anos (inclui anos zerados). */
export function computeReposPerYear(repos: GithubOwnRepo[], now: Date, years = 6): LabelCount[] {
  const current = now.getUTCFullYear();
  const buckets = new Map<number, number>();
  for (let y = current - years + 1; y <= current; y++) buckets.set(y, 0);
  for (const repo of repos) {
    if (repo.createdAt == null) continue;
    const year = new Date(repo.createdAt).getUTCFullYear();
    if (buckets.has(year)) buckets.set(year, (buckets.get(year) ?? 0) + 1);
  }
  return [...buckets.entries()].map(([year, value]) => ({ label: String(year), value }));
}

/** Os `limit` repositórios com mais estrelas (ignora os sem estrela). */
export function topStarredRepos(repos: GithubOwnRepo[], limit = 5): GithubOwnRepo[] {
  return repos
    .filter((repo) => repo.stars > 0)
    .sort((a, b) => b.stars - a.stars || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface SyncedRepoRow {
  id: string;
  name: string;
  owner?: string;
  status: RepoStatus;
  tags: string[];
  favorite: boolean;
  stars?: number;
  /** Data mais recente entre pull, instalação, execução e cadastro. */
  updatedAt: string;
}

export interface SyncedReposView {
  rows: SyncedRepoRow[];
  summary: { total: number; installed: number; favorites: number };
}

const INSTALLED_STATUSES: RepoStatus[] = ['installed', 'running'];

function latestIso(values: (string | undefined)[]): string {
  let best = '';
  let bestTime = -Infinity;
  for (const value of values) {
    if (value == null || value === '') continue;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > bestTime) {
      best = value;
      bestTime = time;
    }
  }
  return best;
}

/** Linhas da seção "Projetos sincronizados", ordenadas pela atualização mais recente. */
export function buildSyncedReposView(repos: Repo[]): SyncedReposView {
  const rows = repos
    .map((repo): SyncedRepoRow => ({
      id: repo.id,
      name: repo.name,
      owner: repo.owner,
      status: repo.status,
      tags: repo.tags,
      favorite: repo.favorite,
      stars: repo.stars,
      updatedAt: latestIso([repo.lastPulledAt, repo.installedAt, repo.lastRunAt, repo.addedAt])
    }))
    .sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  return {
    rows,
    summary: {
      total: repos.length,
      installed: repos.filter((repo) => INSTALLED_STATUSES.includes(repo.status)).length,
      favorites: repos.filter((repo) => repo.favorite).length
    }
  };
}
