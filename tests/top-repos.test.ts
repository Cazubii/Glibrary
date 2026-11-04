import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { LibraryStore } from '../src/main/services/library-store';
import { buildTopReposUrl, fetchTopRepos, parseTopReposResponse } from '../src/main/services/top-repos';

const SAMPLE = {
  items: [
    {
      owner: { login: 'acme' },
      name: 'BigRepo',
      html_url: 'https://github.com/acme/bigrepo',
      description: 'Grande repositorio',
      stargazers_count: 1234,
      language: 'TypeScript',
      topics: ['tools', 'cli'],
      pushed_at: '2026-11-01T00:00:00Z',
      created_at: '2026-10-15T00:00:00Z'
    },
    {
      owner: { login: 'dev' },
      name: 'small',
      html_url: 'https://github.com/dev/small.git',
      stargazers_count: 10
    }
  ]
};

describe('parseTopReposResponse', () => {
  it('mapeia os campos principal, privando o que vem vazio', () => {
    const repos = parseTopReposResponse(SAMPLE);
    expect(repos).toHaveLength(2);
    expect(repos[0]).toMatchObject({
      owner: 'acme',
      name: 'BigRepo',
      remoteUrl: 'https://github.com/acme/bigrepo',
      description: 'Grande repositorio',
      stars: 1234,
      language: 'TypeScript',
      topics: ['tools', 'cli']
    });
    expect(repos[1]).toMatchObject({ owner: 'dev', name: 'small', stars: 10 });
    expect(repos[1].description).toBeUndefined();
    expect(repos[1].topics).toBeUndefined();
  });

  it('normaliza url .git para a forma canônica', () => {
    const repos = parseTopReposResponse(SAMPLE);
    expect(repos[1].remoteUrl).toBe('https://github.com/dev/small');
  });

  it('lança erro para resposta sem items', () => {
    expect(() => parseTopReposResponse({ floco: 1 })).toThrow('Resposta inesperada');
  });
});

describe('fetchTopRepos', () => {
  it('monta URL de busca com janela e limite e devolve fetchedAt', async () => {
    const urls: string[] = [];
    const fake: (url: string, token?: string) => Promise<unknown> = (url) => {
      urls.push(url);
      return Promise.resolve(SAMPLE);
    };
    const result = await fetchTopRepos(fake, { limit: 25, windowDays: 30, token: 'x' });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('per_page=25');
    expect(urls[0]).toContain('sort=stars');
    expect(result.repos).toHaveLength(2);
    expect(new Date(result.fetchedAt).getTime()).toBeGreaterThan(0);
  });

  it('limita os valores extremos (1–100)', () => {
    const urlLow = buildTopReposUrl(Math.min(Math.max(500, 1), 100), 30);
    expect(urlLow).toContain('per_page=100');
  });
});

describe('LibraryStore topRepos', () => {
  let dir: string;
  let counter = 0;
  beforeEach(async () => {
    dir = join(tmpdir(), `glib-top-${Date.now()}-${counter++}`);
    await fs.mkdir(dir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('começa vazio e persiste a lista após setTopRepos', async () => {
    const store = new LibraryStore(dir, join(dir, 'repos'));
    const lib = await store.load();
    expect(lib.topRepos).toEqual({ fetchedAt: '', repos: [] });

    await store.setTopRepos({ fetchedAt: '2026-11-04T10:00:00.000Z', repos: parseTopReposResponse(SAMPLE) });
    const store2 = new LibraryStore(dir, join(dir, 'repos'));
    const lib2 = await store2.load();
    expect(lib2.topRepos.fetchedAt).toBe('2026-11-04T10:00:00.000Z');
    expect(lib2.topRepos.repos[0]).toMatchObject({ owner: 'acme', stars: 1234 });
  });
});
