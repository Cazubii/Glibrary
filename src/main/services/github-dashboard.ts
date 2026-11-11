import type { IpcResult } from '../../shared/types';
import type {
  DashboardAccount,
  GithubOwnRepo,
  GithubProfile,
  GithubRateLimit
} from '../../shared/github-dashboard';

/** Mesmo contrato de `fetchJson` (github-api.ts); injetável para testes. */
export type JsonFetcher = (url: string, token?: string) => Promise<unknown>;

const API = 'https://api.github.com';
export const USER_REPOS_URL = `${API}/user/repos?sort=updated&per_page=100&affiliation=owner`;

function asRecord(data: unknown): Record<string, unknown> | null {
  return data != null && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Mapeia a resposta de /user para o perfil exibido na aba Dashboard. */
export function parseGithubProfile(data: unknown): GithubProfile {
  const d = asRecord(data);
  const login = d != null ? str(d['login']) : undefined;
  if (d == null || login == null) throw new Error('Resposta inesperada da API do GitHub (/user)');
  const profile: GithubProfile = {
    login,
    followers: num(d['followers']),
    following: num(d['following']),
    publicRepos: num(d['public_repos'])
  };
  const optional: [keyof GithubProfile, string][] = [
    ['name', 'name'],
    ['avatarUrl', 'avatar_url'],
    ['bio', 'bio'],
    ['htmlUrl', 'html_url'],
    ['location', 'location'],
    ['blog', 'blog'],
    ['createdAt', 'created_at']
  ];
  for (const [key, field] of optional) {
    const value = str(d[field]);
    if (value != null) (profile as unknown as Record<string, unknown>)[key] = value;
  }
  return profile;
}

/** Mapeia /rate_limit (recurso "core"; cai para "rate" em respostas antigas). */
export function parseRateLimit(data: unknown): GithubRateLimit {
  const d = asRecord(data);
  const core = asRecord(asRecord(d?.['resources'])?.['core']) ?? asRecord(d?.['rate']);
  if (core == null || typeof core['limit'] !== 'number') {
    throw new Error('Resposta inesperada da API do GitHub (/rate_limit)');
  }
  const limit = num(core['limit']);
  const remaining = num(core['remaining']);
  const used = typeof core['used'] === 'number' ? core['used'] : Math.max(limit - remaining, 0);
  return { limit, remaining, used, resetAt: new Date(num(core['reset']) * 1000).toISOString() };
}

/** Mapeia /user/repos; descarta itens sem nome. */
export function parseOwnRepos(data: unknown): GithubOwnRepo[] {
  if (!Array.isArray(data)) throw new Error('Resposta inesperada da API do GitHub (/user/repos)');
  const repos: GithubOwnRepo[] = [];
  for (const item of data) {
    const d = asRecord(item);
    const name = d != null ? str(d['name']) : undefined;
    if (d == null || name == null) continue;
    const repo: GithubOwnRepo = {
      name,
      fullName: str(d['full_name']) ?? name,
      htmlUrl: str(d['html_url']) ?? '',
      stars: num(d['stargazers_count']),
      forks: num(d['forks_count']),
      private: d['private'] === true,
      fork: d['fork'] === true
    };
    const description = str(d['description']);
    if (description != null) repo.description = description;
    const language = str(d['language']);
    if (language != null) repo.language = language;
    const createdAt = str(d['created_at']);
    if (createdAt != null) repo.createdAt = createdAt;
    const updatedAt = str(d['updated_at']);
    if (updatedAt != null) repo.updatedAt = updatedAt;
    repos.push(repo);
  }
  return repos;
}

export async function fetchGithubProfile(fetchJson: JsonFetcher, token: string): Promise<GithubProfile> {
  return parseGithubProfile(await fetchJson(`${API}/user`, token));
}

export async function fetchRateLimit(fetchJson: JsonFetcher, token?: string): Promise<GithubRateLimit> {
  return parseRateLimit(await fetchJson(`${API}/rate_limit`, token));
}

export async function fetchOwnRepos(fetchJson: JsonFetcher, token: string): Promise<GithubOwnRepo[]> {
  return parseOwnRepos(await fetchJson(USER_REPOS_URL, token));
}

/**
 * Junta perfil, repositórios e cota. Sem token, devolve só a cota anônima
 * (`connected: false`). A cota é opcional: falha nela não derruba o restante.
 */
export async function fetchDashboardAccount(
  fetchJson: JsonFetcher,
  token: string | undefined,
  now: () => Date = () => new Date()
): Promise<DashboardAccount> {
  const rateLimitP = fetchRateLimit(fetchJson, token).catch(() => null);
  if (token == null || token === '') {
    return { connected: false, profile: null, rateLimit: await rateLimitP, repos: [], fetchedAt: now().toISOString() };
  }
  const [profile, repos, rateLimit] = await Promise.all([
    fetchGithubProfile(fetchJson, token),
    fetchOwnRepos(fetchJson, token),
    rateLimitP
  ]);
  return { connected: true, profile, rateLimit, repos, fetchedAt: now().toISOString() };
}

/** Converte falhas em `{ ok: false, error }` com mensagem pt-BR. */
export function dashboardErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('HTTP 401')) return 'Token do GitHub inválido ou expirado. Conecte a conta novamente.';
  return `Não foi possível carregar os dados do GitHub: ${msg}`;
}

export async function loadDashboardAccount(
  fetchJson: JsonFetcher,
  token: string | undefined,
  now?: () => Date
): Promise<IpcResult<DashboardAccount>> {
  try {
    return { ok: true, data: await fetchDashboardAccount(fetchJson, token, now) };
  } catch (error) {
    return { ok: false, error: dashboardErrorMessage(error) };
  }
}
