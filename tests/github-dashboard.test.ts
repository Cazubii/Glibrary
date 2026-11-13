import { describe, it, expect, vi } from 'vitest';
import {
  USER_REPOS_URL,
  fetchDashboardAccount,
  loadDashboardAccount,
  parseGithubProfile,
  parseOwnRepos,
  parseRateLimit,
  type JsonFetcher
} from '../src/main/services/github-dashboard';
import {
  buildSyncedReposView,
  computeLanguageStats,
  computeReposPerYear,
  rateLimitLevel,
  topStarredRepos,
  type GithubOwnRepo
} from '../src/shared/github-dashboard';
import type { Repo } from '../src/shared/types';

const USER = {
  login: 'octo',
  name: 'Octo Cat',
  avatar_url: 'https://avatars.example/octo.png',
  bio: 'Construindo coisas',
  html_url: 'https://github.com/octo',
  location: 'São Paulo',
  blog: '',
  followers: 42,
  following: 7,
  public_repos: 12,
  created_at: '2015-03-01T00:00:00Z'
};

const RATE = { resources: { core: { limit: 5000, remaining: 4990, used: 10, reset: 1_800_000_000 } }, rate: { limit: 1 } };

const REPOS = [
  { name: 'alpha', full_name: 'octo/alpha', html_url: 'https://github.com/octo/alpha', language: 'TypeScript', stargazers_count: 30, forks_count: 2, private: false, fork: false, created_at: '2024-02-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', description: 'Primeiro' },
  { name: 'beta', full_name: 'octo/beta', html_url: 'https://github.com/octo/beta', language: null, stargazers_count: 0, private: true, fork: true, created_at: '2026-01-01T00:00:00Z' },
  { full_name: 'sem-nome' }
];

function fakeFetcher(map: Record<string, unknown>): JsonFetcher & ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string) => {
    for (const [suffix, value] of Object.entries(map)) {
      if (url.endsWith(suffix) || url === suffix) {
        if (value instanceof Error) throw value;
        return value;
      }
    }
    throw new Error(`URL inesperada: ${url}`);
  });
}

describe('parsers do dashboard GitHub', () => {
  it('mapeia os campos do usuário e ignora strings vazias', () => {
    const profile = parseGithubProfile(USER);
    expect(profile).toMatchObject({
      login: 'octo',
      name: 'Octo Cat',
      avatarUrl: 'https://avatars.example/octo.png',
      bio: 'Construindo coisas',
      location: 'São Paulo',
      followers: 42,
      following: 7,
      publicRepos: 12,
      createdAt: '2015-03-01T00:00:00Z'
    });
    expect(profile.blog).toBeUndefined();
    expect(() => parseGithubProfile({ id: 1 })).toThrow('/user');
  });

  it('mapeia o rate limit do recurso core', () => {
    expect(parseRateLimit(RATE)).toEqual({
      limit: 5000,
      remaining: 4990,
      used: 10,
      resetAt: new Date(1_800_000_000 * 1000).toISOString()
    });
    expect(parseRateLimit({ rate: { limit: 60, remaining: 15, reset: 0 } })).toMatchObject({ limit: 60, remaining: 15, used: 45 });
    expect(() => parseRateLimit({})).toThrow('/rate_limit');
  });

  it('mapeia repositórios (nome, estrelas, linguagem) e descarta itens sem nome', () => {
    const repos = parseOwnRepos(REPOS);
    expect(repos).toHaveLength(2);
    expect(repos[0]).toMatchObject({ name: 'alpha', fullName: 'octo/alpha', stars: 30, forks: 2, language: 'TypeScript', private: false, fork: false });
    expect(repos[1]).toMatchObject({ name: 'beta', stars: 0, forks: 0, private: true, fork: true });
    expect(repos[1].language).toBeUndefined();
    expect(() => parseOwnRepos({})).toThrow('/user/repos');
  });
});

describe('fetchDashboardAccount / loadDashboardAccount', () => {
  const now = (): Date => new Date('2026-11-11T00:00:00Z');

  it('junta perfil, repos e cota com o token', async () => {
    const fetcher = fakeFetcher({ '/user': USER, [USER_REPOS_URL]: REPOS, '/rate_limit': RATE });
    const account = await fetchDashboardAccount(fetcher, 'tok', now);
    expect(account.connected).toBe(true);
    expect(account.profile?.login).toBe('octo');
    expect(account.repos.map((r) => r.name)).toEqual(['alpha', 'beta']);
    expect(account.rateLimit?.remaining).toBe(4990);
    expect(account.fetchedAt).toBe('2026-11-11T00:00:00.000Z');
    expect(fetcher).toHaveBeenCalledWith('https://api.github.com/user', 'tok');
  });

  it('sem token, só busca a cota anônima', async () => {
    const fetcher = fakeFetcher({ '/rate_limit': { resources: { core: { limit: 60, remaining: 60, used: 0, reset: 0 } } } });
    const account = await fetchDashboardAccount(fetcher, undefined, now);
    expect(account).toMatchObject({ connected: false, profile: null, repos: [] });
    expect(account.rateLimit?.limit).toBe(60);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('falha na cota não derruba o restante', async () => {
    const fetcher = fakeFetcher({ '/user': USER, [USER_REPOS_URL]: [], '/rate_limit': new Error('offline') });
    const account = await fetchDashboardAccount(fetcher, 'tok', now);
    expect(account.rateLimit).toBeNull();
    expect(account.profile?.login).toBe('octo');
  });

  it('mapeia erros para { ok: false, error } em pt-BR', async () => {
    const unauthorized = await loadDashboardAccount(fakeFetcher({ '/user': new Error('GitHub API: HTTP 401'), [USER_REPOS_URL]: [], '/rate_limit': RATE }), 'tok');
    expect(unauthorized).toEqual({ ok: false, error: 'Token do GitHub inválido ou expirado. Conecte a conta novamente.' });

    const generic = await loadDashboardAccount(fakeFetcher({ '/user': USER, [USER_REPOS_URL]: new Error('timeout'), '/rate_limit': RATE }), 'tok');
    expect(generic).toEqual({ ok: false, error: 'Não foi possível carregar os dados do GitHub: timeout' });

    const success = await loadDashboardAccount(fakeFetcher({ '/rate_limit': RATE }), undefined);
    expect(success.ok).toBe(true);
  });
});

describe('agregações do dashboard', () => {
  const repo = (name: string, over: Partial<GithubOwnRepo> = {}): GithubOwnRepo => ({
    name, fullName: `octo/${name}`, htmlUrl: '', stars: 0, forks: 0, private: false, fork: false, ...over
  });

  it('classifica o nível do rate limit', () => {
    expect(rateLimitLevel({ limit: 100, remaining: 80, used: 20, resetAt: '' })).toBe('ok');
    expect(rateLimitLevel({ limit: 100, remaining: 20, used: 80, resetAt: '' })).toBe('warn');
    expect(rateLimitLevel({ limit: 100, remaining: 5, used: 95, resetAt: '' })).toBe('critical');
  });

  it('agrupa linguagens com "Outras"', () => {
    const repos = [repo('a', { language: 'TS' }), repo('b', { language: 'TS' }), repo('c', { language: 'Go' }), repo('d', { language: 'Rust' }), repo('e')];
    expect(computeLanguageStats(repos, 2)).toEqual([
      { label: 'TS', value: 2 },
      { label: 'Go', value: 1 },
      { label: 'Outras', value: 2 }
    ]);
  });

  it('conta repositórios criados por ano incluindo anos zerados', () => {
    const repos = [repo('a', { createdAt: '2026-01-01T00:00:00Z' }), repo('b', { createdAt: '2024-05-01T00:00:00Z' }), repo('c', { createdAt: '2010-01-01T00:00:00Z' })];
    expect(computeReposPerYear(repos, new Date('2026-11-11T00:00:00Z'), 3)).toEqual([
      { label: '2024', value: 1 },
      { label: '2025', value: 0 },
      { label: '2026', value: 1 }
    ]);
  });

  it('lista os mais estrelados', () => {
    const repos = [repo('a', { stars: 1 }), repo('b', { stars: 9 }), repo('c'), repo('d', { stars: 4 })];
    expect(topStarredRepos(repos, 2).map((r) => r.name)).toEqual(['b', 'd']);
  });

  it('monta projetos sincronizados com resumo e data mais recente', () => {
    const base = { tags: [], favorite: false, addedAt: '2026-01-01T00:00:00.000Z' };
    const repos: Repo[] = [
      { id: '1', name: 'um', status: 'installed', ...base, favorite: true, lastPulledAt: '2026-10-01T00:00:00.000Z' },
      { id: '2', name: 'dois', status: 'not_cloned', ...base, tags: ['x'] },
      { id: '3', name: 'tres', status: 'running', ...base, installedAt: '2026-11-01T00:00:00.000Z' }
    ];
    const view = buildSyncedReposView(repos);
    expect(view.summary).toEqual({ total: 3, installed: 2, favorites: 1 });
    expect(view.rows.map((r) => r.id)).toEqual(['3', '1', '2']);
    expect(view.rows[1].updatedAt).toBe('2026-10-01T00:00:00.000Z');
  });
});
