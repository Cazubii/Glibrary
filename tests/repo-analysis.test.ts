import { describe, it, expect } from 'vitest';
import { buildRepoAnalysis, analyzeGithubRepo, parseOwnerRepo } from '../src/main/services/repo-analysis';

const NOW = new Date('2026-11-08T12:00:00.000Z');

function repoPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'demo',
    full_name: 'acme/demo',
    owner: { login: 'acme' },
    description: 'Projeto de demonstração',
    stargazers_count: 25000,
    forks_count: 300,
    subscribers_count: 900,
    open_issues_count: 40,
    language: 'TypeScript',
    topics: ['cli', 'typescript'],
    license: { spdx_id: 'MIT' },
    created_at: '2023-04-01T00:00:00.000Z',
    pushed_at: '2026-11-05T00:00:00.000Z',
    archived: false,
    homepage: 'https://demo.dev',
    default_branch: 'main',
    ...overrides
  };
}

const readme = { size: 8192 };
const contributors = Array.from({ length: 12 }, (_, i) => ({ login: `dev${i}` }));
const releases = [
  { published_at: '2026-10-01T00:00:00.000Z' },
  { published_at: '2026-06-01T00:00:00.000Z' },
  { published_at: '2024-01-01T00:00:00.000Z' }
];

const HEALTHY = { repo: repoPayload(), readme, contributors, releases } as const;

function analysisOf(overrides: Partial<{ repo: unknown; readme: unknown; contributors: unknown[] | null; releases: unknown[] | null }>): ReturnType<typeof buildRepoAnalysis> {
  return buildRepoAnalysis({
    repo: overrides.repo ?? repoPayload(),
    readme: overrides.readme !== undefined ? overrides.readme : readme,
    contributors: overrides.contributors !== undefined ? overrides.contributors : contributors,
    releases: overrides.releases !== undefined ? overrides.releases : releases,
    owner: 'acme',
    name: 'demo',
    remoteUrl: 'https://github.com/acme/demo',
    now: NOW
  });
}

describe('parseOwnerRepo', () => {
  it('extrai owner/repo com ou sem .git', () => {
    expect(parseOwnerRepo('https://github.com/acme/demo')).toEqual({ owner: 'acme', repo: 'demo' });
    expect(parseOwnerRepo('https://github.com/Acme/Demo.git')).toEqual({ owner: 'Acme', repo: 'Demo' });
  });

  it('lança erro para URL fora do GitHub', () => {
    expect(() => parseOwnerRepo('https://gitlab.com/a/b')).toThrow('URL do GitHub inválida');
  });
});

describe('buildRepoAnalysis', () => {
  it('projeto saudável gera pontos positivos principais e campo básico', () => {
    const a = analysisOf(HEALTHY);
    expect(a).toMatchObject({
      owner: 'acme',
      name: 'demo',
      stars: 25000,
      forks: 300,
      openIssues: 40,
      language: 'TypeScript',
      license: 'MIT',
      releasesLastYear: 2,
      contributorsCount: 12
    });
    expect(a.pros).toEqual(expect.arrayContaining([
      expect.stringContaining('Muito popular'),
      expect.stringContaining('últimos commits há menos de 30 dias'),
      expect.stringContaining('README detalhado'),
      expect.stringContaining('Licença permissiva (MIT)'),
      expect.stringContaining('12 contribuidores')
    ]));
    expect(a.cons).toHaveLength(0);
  });

  it('projeto estagnado sem licença nem README acumula pontos negativos', () => {
    const a = analysisOf({
      repo: repoPayload({
        stargazers_count: 12,
        license: null,
        pushed_at: '2025-03-01T00:00:00.000Z',
        archived: true,
        description: undefined,
        open_issues_count: 320
      }),
      readme: null,
      contributors: [{ login: 'solo' }],
      releases: []
    });
    expect(a.license).toBeUndefined();
    expect(a.cons).toEqual(expect.arrayContaining([
      expect.stringContaining('Pouca adoção'),
      expect.stringContaining('Sem atividade há 1 ano'),
      expect.stringContaining('Sem README'),
      expect.stringContaining('Sem licença declarada'),
      expect.stringContaining('única pessoa'),
      expect.stringContaining('320 issues'),
      expect.stringContaining('Nenhum release publicado'),
      expect.stringContaining('ARQUIVADO'),
      expect.stringContaining('Sem descrição')
    ]));
  });

  it('licença GPL vira observação de copyleft e licenças desconhecidas pedem checagem', () => {
    const gpl = analysisOf({ repo: repoPayload({ license: { spdx_id: 'GPL-3.0' } }) });
    expect(gpl.pros).toEqual(expect.arrayContaining([expect.stringContaining('Licença copyleft declarada (GPL-3.0)')]));
    const unknown = analysisOf({ repo: repoPayload({ license: { spdx_id: 'NOASSERTION' } }) });
    expect(unknown.cons).toEqual(expect.arrayContaining([expect.stringContaining('Licença não identificada automaticamente')]));
  });
});

describe('analyzeGithubRepo', () => {
  it('combina as 4 chamadas da API e devolve a análise', async () => {
    const calls: string[] = [];
    const fakeJson = async (url: string): Promise<unknown> => {
      calls.push(url);
      if (url.endsWith('/demo')) return repoPayload();
      if (url.includes('/readme')) return readme;
      if (url.includes('/contributors')) return contributors;
      if (url.includes('/releases')) return releases;
      throw new Error('URL inesperada');
    };
    const a = await analyzeGithubRepo(fakeJson, { remoteUrl: 'https://github.com/acme/demo.git', now: NOW });
    expect(calls).toHaveLength(4);
    expect(calls[0]).toContain('https://api.github.com/repos/acme/demo');
    expect(a.stars).toBe(25000);
    expect(a.remoteUrl).toBe('https://github.com/acme/demo');
    expect(a.pros.length).toBeGreaterThan(3);
  });

  it('continua a análise com fallback vazio quando readme/contributors/releases falham', async () => {
    const fakeJson = async (url: string): Promise<unknown> => {
      if (url.endsWith('/demo')) return repoPayload();
      throw new Error('boom');
    };
    const a = await analyzeGithubRepo(fakeJson, { remoteUrl: 'https://github.com/acme/demo', now: NOW });
    expect(a.readmeSize).toBeUndefined();
    expect(a.contributorsCount).toBeUndefined();
    expect(a.cons).toEqual(expect.arrayContaining([expect.stringContaining('Sem README')]));
  });

  it('propaga erro 404 do repo principal (nao tolera falha na chamada base)', async () => {
    const fakeJson = async (): Promise<unknown> => {
      throw new Error('GitHub API: HTTP 404');
    };
    await expect(analyzeGithubRepo(fakeJson, { remoteUrl: 'https://github.com/acme/nao-existe', now: NOW }))
      .rejects.toThrow('HTTP 404');
  });
});
