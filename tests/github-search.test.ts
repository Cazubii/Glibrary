import { describe, it, expect } from 'vitest';
import { buildSearchUrl, searchGithubRepos } from '../src/main/services/top-repos';

describe('buildSearchUrl', () => {
  it('encoda a consulta e ordena por estrelas', () => {
    const url = buildSearchUrl('csv parser python', undefined, 25);
    expect(url).toBe(
      'https://api.github.com/search/repositories?q=csv%20parser%20python&sort=stars&order=desc&per_page=25'
    );
  });

  it('adiciona language como qualifier', () => {
    const url = buildSearchUrl('auth', 'TypeScript', 10);
    expect(url).toContain('q=auth+language%3ATypeScript');
    expect(url).toContain('per_page=10');
  });
});

describe('searchGithubRepos', () => {
  const fetchJsonOk = async (): Promise<unknown> => ({
    total_count: 42,
    items: [
      {
        name: 'great-lib',
        owner: { login: 'owner' },
        html_url: 'https://github.com/owner/great-lib',
        stargazers_count: 999,
        description: 'Resolve seu problema',
        language: 'TypeScript',
        topics: ['targeted'],
        created_at: '2026-01-01T00:00:00.000Z'
      }
    ]
  });

  it('retorna repos parseados e total_count', async () => {
    const result = await searchGithubRepos(fetchJsonOk, { query: 'csv parser' });
    expect(result.totalCount).toBe(42);
    expect(result.repos[0]).toMatchObject({
      owner: 'owner',
      name: 'great-lib',
      stars: 999,
      language: 'TypeScript'
    });
    expect(result.fetchedAt).toBeTruthy();
  });

  it('rejeita consulta vazia e limita o tamanho', async () => {
    await expect(searchGithubRepos(fetchJsonOk, { query: '   ' })).rejects.toThrow('tema');
    let perPage = '';
    await searchGithubRepos(
      async (url) => {
        perPage = String(url.match(/per_page=(\d+)/)?.[1]);
        return { total_count: 0, items: [] };
      },
      { query: 'x', limit: 999 }
    );
    expect(perPage).toBe('50');
  });
});
