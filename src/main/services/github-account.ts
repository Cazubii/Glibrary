import type {
  GithubAccountProfile,
  GithubAccountRepo,
  GithubAccountStatus,
  GithubRepoPage
} from '../../shared/types';
import { fetchJson, GithubApiError } from './github-api';

const PAGE_SIZE = 50;

function asRecord(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    throw new GithubApiError('unknown', undefined, 'Resposta inválida da API do GitHub.');
  }
  return value as Record<string, unknown>;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new GithubApiError('unknown', undefined, 'Resposta incompleta da API do GitHub.');
  }
  return value;
}

export async function fetchGithubAccount(token: string): Promise<GithubAccountProfile> {
  const user = asRecord(await fetchJson('https://api.github.com/user', token));
  return {
    login: requiredString(user, 'login'),
    avatarUrl: requiredString(user, 'avatar_url'),
    htmlUrl: requiredString(user, 'html_url')
  };
}

function mapGithubRepo(value: unknown): GithubAccountRepo {
  const repo = asRecord(value);
  const owner = asRecord(repo['owner']);
  const ownerLogin = requiredString(owner, 'login');
  const name = requiredString(repo, 'name');
  const htmlUrl = requiredString(repo, 'html_url');
  const updatedAt = requiredString(repo, 'updated_at');
  if (typeof repo['id'] !== 'number' || typeof repo['private'] !== 'boolean') {
    throw new GithubApiError('unknown', undefined, 'Resposta incompleta da API do GitHub.');
  }
  return {
    id: repo['id'],
    owner: ownerLogin,
    name,
    fullName: typeof repo['full_name'] === 'string' ? repo['full_name'] : `${ownerLogin}/${name}`,
    remoteUrl: `https://github.com/${ownerLogin}/${name}.git`,
    htmlUrl,
    private: repo['private'],
    ...(typeof repo['description'] === 'string' ? { description: repo['description'] } : {}),
    ...(typeof repo['language'] === 'string' ? { language: repo['language'] } : {}),
    stars: typeof repo['stargazers_count'] === 'number' ? repo['stargazers_count'] : 0,
    ...(typeof repo['pushed_at'] === 'string' ? { pushedAt: repo['pushed_at'] } : {}),
    updatedAt
  };
}

export async function fetchGithubRepos(token: string, page: number): Promise<GithubRepoPage> {
  const query = new URLSearchParams({
    visibility: 'all',
    affiliation: 'owner,collaborator,organization_member',
    sort: 'updated',
    per_page: String(PAGE_SIZE),
    page: String(page)
  });
  const value = await fetchJson(`https://api.github.com/user/repos?${query.toString()}`, token);
  if (!Array.isArray(value)) {
    throw new GithubApiError('unknown', undefined, 'Resposta inválida da lista de repositórios.');
  }
  const repos = value.map(mapGithubRepo);
  return { repos, page, hasNextPage: repos.length === PAGE_SIZE };
}

export function githubAccountError(error: unknown, checkedAt: string): GithubAccountStatus {
  if (error instanceof GithubApiError) {
    return {
      state: 'error',
      reason: error.reason,
      message: error.message,
      checkedAt
    };
  }
  return {
    state: 'error',
    reason: 'unknown',
    message: 'Não foi possível verificar a conta GitHub.',
    checkedAt
  };
}
