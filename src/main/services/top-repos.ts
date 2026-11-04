import { isValidGitUrl, normalizeGitUrl } from '../../shared/git-utils';

export interface GithubRepoListItem {
  owner: string;
  name: string;
  remoteUrl: string;
  description?: string;
  stars: number;
  language?: string;
  topics?: string[];
  pushedAt?: string;
  createdAt?: string;
}

export interface TopReposFetchOptions {
  /** Quantidade de repos (1–100). */
  limit?: number;
  /** Janela de "em alta", em dias. */
  windowDays?: number;
}

export type JsonFetcher = (url: string, token?: string) => Promise<unknown>;

function pickString(item: Record<string, unknown>, key: string): string | undefined {
  const value = item[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Converte a resposta bruta de search/repositories em lista de TopRepo. */
export function parseTopReposResponse(data: unknown): GithubRepoListItem[] {
  const items = data != null && typeof data === 'object'
    ? (data as Record<string, unknown>)['items']
    : undefined;
  if (!Array.isArray(items)) throw new Error('Resposta inesperada da busca do GitHub');
  return items.map((raw): GithubRepoListItem => {
    const item = raw as Record<string, unknown>;
    const ownerRecord = (item['owner'] ?? {}) as Record<string, unknown>;
    const htmlUrl = pickString(item, 'html_url') ?? '';
    return {
      owner: pickString(ownerRecord, 'login') ?? '',
      name: pickString(item, 'name') ?? '',
      remoteUrl: htmlUrl !== '' && isValidGitUrl(htmlUrl) ? normalizeGitUrl(htmlUrl) : htmlUrl,
      stars: typeof item['stargazers_count'] === 'number' ? item['stargazers_count'] : 0,
      ...(pickString(item, 'description') ? { description: pickString(item, 'description') } : {}),
      ...(pickString(item, 'language') ? { language: pickString(item, 'language') } : {}),
      ...(Array.isArray(item['topics'])
        ? { topics: (item['topics'] as unknown[]).filter((t): t is string => typeof t === 'string') }
        : {}),
      ...(pickString(item, 'pushed_at') ? { pushedAt: pickString(item, 'pushed_at') } : {}),
      ...(pickString(item, 'created_at') ? { createdAt: pickString(item, 'created_at') } : {})
    };
  });
}

export function buildTopReposUrl(limit: number, windowDays: number): string {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return (
    `https://api.github.com/search/repositories?q=created:%3E%3D${since}` +
    `&sort=stars&order=desc&per_page=${limit}`
  );
}

/**
 * Busca os repos "em alta": criados nos últimos N dias, ordenados por estrelas.
 * (A API do GitHub não tem endpoint de trending; esta é a aproximação padrão.)
 */
export async function fetchTopRepos(
  fetchJson: JsonFetcher,
  options: TopReposFetchOptions & { token?: string } = {}
): Promise<{ fetchedAt: string; repos: GithubRepoListItem[] }> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const windowDays = Math.max(options.windowDays ?? 30, 1);
  const data = await fetchJson(buildTopReposUrl(limit, windowDays), options.token);
  return { fetchedAt: new Date().toISOString(), repos: parseTopReposResponse(data) };
}

export interface GithubSearchResponse extends GithubRepoList {
  totalCount: number;
}

interface GithubRepoList {
  fetchedAt: string;
  repos: GithubRepoListItem[];
}

export interface GithubSearchOptions {
  query: string;
  language?: string;
  limit?: number;
  token?: string;
}

/** Monta a URL de search/repositories ordenada por estrelas. */
export function buildSearchUrl(query: string, language: string | undefined, limit: number): string {
  let qualifier = encodeURIComponent(query.trim());
  if (language != null && language !== '') {
    qualifier += `+language%3A${encodeURIComponent(language)}`;
  }
  return `https://api.github.com/search/repositories?q=${qualifier}&sort=stars&order=desc&per_page=${limit}`;
}

/** Busca repos por tema, retornando os mais bem avaliados (estrelas). */
export async function searchGithubRepos(
  fetchJson: JsonFetcher,
  options: GithubSearchOptions
): Promise<GithubSearchResponse> {
  const query = options.query.trim();
  if (query === '') throw new Error('Informe um tema para buscar');
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 50);
  const data = await fetchJson(buildSearchUrl(query, options.language, limit), options.token);
  const totalCount = data != null && typeof data === 'object' && typeof (data as Record<string, unknown>)['total_count'] === 'number'
    ? ((data as Record<string, unknown>)['total_count'] as number)
    : 0;
  return { fetchedAt: new Date().toISOString(), repos: parseTopReposResponse(data), totalCount };
}
