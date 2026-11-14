import { describe, expect, it, vi } from 'vitest';
import {
  createAccountRepository,
  listAccountRepos,
  loadAccountRepos,
  type GithubJsonRequestOptions,
  type JsonFetcher
} from '../src/main/services/github-projects';

const REPOS = [
  {
    id: 11,
    name: 'glibrary',
    full_name: 'igor/glibrary',
    description: 'Biblioteca de projetos',
    private: false,
    fork: false,
    language: 'TypeScript',
    stargazers_count: 8,
    updated_at: '2026-11-10T12:00:00Z',
    html_url: 'https://github.com/igor/glibrary',
    default_branch: 'main'
  },
  {
    id: 12,
    name: 'forked-tool',
    full_name: 'igor/forked-tool',
    description: null,
    private: true,
    fork: true,
    language: null,
    stargazers_count: 0,
    updated_at: '2026-11-09T12:00:00Z',
    html_url: 'https://github.com/igor/forked-tool',
    default_branch: 'trunk'
  },
  { id: 0, name: '' }
];

function fakeFetcher(response: unknown): JsonFetcher & ReturnType<typeof vi.fn> {
  return vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
}

describe('serviço de projetos do GitHub', () => {
  it('mapeia repositórios públicos, privados, forks e descrições nulas', async () => {
    const page = await listAccountRepos(fakeFetcher(REPOS), {
      token: 'token', page: 1, perPage: 50, sort: 'updated', visibility: 'all', fork: true
    });

    expect(page.repos).toEqual([
      {
        id: 11,
        name: 'glibrary',
        fullName: 'igor/glibrary',
        description: 'Biblioteca de projetos',
        visibility: 'public',
        isFork: false,
        language: 'TypeScript',
        stars: 8,
        updatedAt: '2026-11-10T12:00:00Z',
        htmlUrl: 'https://github.com/igor/glibrary',
        defaultBranch: 'main'
      },
      {
        id: 12,
        name: 'forked-tool',
        fullName: 'igor/forked-tool',
        visibility: 'private',
        isFork: true,
        stars: 0,
        updatedAt: '2026-11-09T12:00:00Z',
        htmlUrl: 'https://github.com/igor/forked-tool',
        defaultBranch: 'trunk'
      }
    ]);
  });

  it('repassa paginação, visibilidade e ordenação para /user/repos', async () => {
    const fetcher = fakeFetcher([]);
    await listAccountRepos(fetcher, {
      token: 'segredo', page: 3, perPage: 25, sort: 'updated', visibility: 'private', fork: true
    });

    const [url, token] = fetcher.mock.calls[0] as [string, string | undefined];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/user/repos');
    expect(parsed.searchParams.get('page')).toBe('3');
    expect(parsed.searchParams.get('per_page')).toBe('25');
    expect(parsed.searchParams.get('sort')).toBe('updated');
    expect(parsed.searchParams.get('direction')).toBe('desc');
    expect(parsed.searchParams.get('visibility')).toBe('private');
    expect(parsed.searchParams.get('affiliation')).toBe('owner,collaborator,organization_member');
    expect(token).toBe('segredo');
  });

  it('filtra forks sem perder o indicador de páginas seguintes', async () => {
    const page = await listAccountRepos(fakeFetcher(REPOS.slice(0, 2)), {
      token: 'token', page: 2, perPage: 2, sort: 'updated', visibility: 'all', fork: false
    });
    expect(page.repos.map((repo) => repo.name)).toEqual(['glibrary']);
    expect(page).toMatchObject({ page: 2, perPage: 2, hasMore: true });
  });

  it('converte falha HTTP e resposta inválida em { ok: false, error }', async () => {
    const unauthorized = await loadAccountRepos(fakeFetcher(new Error('GitHub API: HTTP 401')), {
      token: 'token', page: 1, perPage: 50, sort: 'updated', visibility: 'all', fork: true
    });
    expect(unauthorized).toMatchObject({
      ok: false,
      error: {
        title: 'A conexão com o GitHub precisa ser renovada',
        nextStep: 'Abra Projetos e conecte sua conta novamente.',
        technicalDetails: 'GitHub API: HTTP 401'
      }
    });

    const invalid = await loadAccountRepos(fakeFetcher({ items: [] }), {
      token: 'token', page: 1, perPage: 50, sort: 'updated', visibility: 'all', fork: true
    });
    expect(invalid).toMatchObject({
      ok: false,
      error: {
        title: 'Não foi possível concluir esta ação',
        technicalDetails: 'Resposta inesperada da API do GitHub (/user/repos)'
      }
    });
  });

  it('cria repositório do usuário por POST e mapeia visibilidade e URLs', async () => {
    const fetcher = vi.fn(async () => ({
      id: 45,
      name: 'meu-site',
      owner: { login: 'igor' },
      private: true,
      html_url: 'https://github.com/igor/meu-site',
      clone_url: 'https://github.com/igor/meu-site.git'
    })) as JsonFetcher & ReturnType<typeof vi.fn>;

    const created = await createAccountRepository(fetcher, {
      token: 'token-secreto',
      name: 'meu-site',
      description: 'Meu primeiro site',
      visibility: 'private'
    });

    expect(fetcher).toHaveBeenCalledWith('https://api.github.com/user/repos', 'token-secreto', {
      method: 'POST',
      body: { name: 'meu-site', description: 'Meu primeiro site', private: true, auto_init: false }
    } satisfies GithubJsonRequestOptions);
    expect(created).toEqual({
      id: 45,
      owner: 'igor',
      name: 'meu-site',
      visibility: 'private',
      htmlUrl: 'https://github.com/igor/meu-site',
      cloneUrl: 'https://github.com/igor/meu-site.git'
    });
  });

  it('explica a permissão mínima necessária quando o GitHub recusa a criação', async () => {
    const fetcher = fakeFetcher(new Error('GitHub API: HTTP 403'));
    await expect(createAccountRepository(fetcher, {
      token: 'token-secreto',
      name: 'meu-site',
      visibility: 'public'
    })).rejects.toThrow(/Repository creation: write/);
  });

  it('não aceita uma resposta inválida do endpoint de criação', async () => {
    await expect(createAccountRepository(fakeFetcher({ name: 'meu-site' }), {
      token: 'token-secreto',
      name: 'meu-site',
      visibility: 'private'
    })).rejects.toThrow('Resposta inesperada da API do GitHub (/user/repos create)');
  });
});
