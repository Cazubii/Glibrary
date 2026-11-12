import { isValidGitUrl, normalizeGitUrl } from '../../shared/git-utils';
import type { RepoAnalysis } from '../../shared/types';

export type JsonFetcher = (url: string, token?: string) => Promise<unknown>;

/** Extrai owner/repo de uma URL do GitHub (com ou sem .git). */
export function parseOwnerRepo(remoteUrl: string): { owner: string; repo: string } {
  const match = remoteUrl.match(/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i);
  if (!match) throw new Error('URL do GitHub inválida');
  return { owner: match[1], repo: match[2] };
}

function pickNumber(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  return typeof value === 'number' ? value : 0;
}

function pickString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function monthsBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
}

export interface RepoAnalysisInputs {
  /** Payload bruto de GET /repos/{owner}/{repo}. */
  repo: unknown;
  /** Payload bruto de GET /repos/{owner}/{repo}/readme (ou null quando ausente). */
  readme: unknown;
  /** Array bruto de GET /repos/{owner}/{repo}/contributors?per_page=100 (ou null). */
  contributors: unknown[] | null;
  /** Array bruto de GET /repos/{owner}/{repo}/releases?per_page=100 (ou null). */
  releases: unknown[] | null;
  /** Owner/repo já extraídos da URL informada. */
  owner: string;
  name: string;
  remoteUrl: string;
  now: Date;
}

/**
 * Monta a análise heurística em pt-BR a partir dos payloads brutos da API do GitHub.
 * Regras baseadas em metadados públicos: popularidade, atividade, licença, README,
 * comunidade e releases. Sem match de regra, a lista simplesmente não ganha item.
 */
export function buildRepoAnalysis(inputs: RepoAnalysisInputs): RepoAnalysis {
  const repo = inputs.repo ?? {};
  const data = repo as Record<string, unknown>;
  const owner = (data['owner'] ?? {}) as Record<string, unknown>;
  const license = data['license'] != null ? (data['license'] as Record<string, unknown>) : null;
  const licenseSpdx = license != null ? pickString(license, 'spdx_id') ?? pickString(license, 'name') : undefined;
  const readmeSize =
    inputs.readme != null && typeof inputs.readme === 'object'
      ? pickNumber(inputs.readme as Record<string, unknown>, 'size')
      : undefined;
  const contributorsCount = inputs.contributors != null ? inputs.contributors.length : undefined;
  let releasesLastYear = 0;
  let releasesTotal = 0;
  if (inputs.releases != null) {
    releasesTotal = inputs.releases.length;
    for (const raw of inputs.releases) {
      if (raw != null && typeof raw === 'object') {
        const published = pickString(raw as Record<string, unknown>, 'published_at');
        if (published != null) {
          const at = new Date(published);
          if (!Number.isNaN(at.getTime()) && inputs.now.getTime() - at.getTime() <= 365 * 24 * 60 * 60 * 1000) {
            releasesLastYear += 1;
          }
        }
      }
    }
  }
  const pushedAt = pickString(data, 'pushed_at');
  const pushed = pushedAt != null ? new Date(pushedAt) : null;
  const pushedDays = pushed != null && !Number.isNaN(pushed.getTime())
    ? Math.floor((inputs.now.getTime() - pushed.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const stars = pickNumber(data, 'stargazers_count');
  const openIssues = pickNumber(data, 'open_issues_count');
  const created = pickString(data, 'created_at');
  const pros: string[] = [];
  const cons: string[] = [];

  if (stars >= 10000) pros.push(`Muito popular com ${stars.toLocaleString('pt-BR')} estrelas — adoção comprovada pela comunidade`);
  else if (stars >= 1000) pros.push(`Popular com ${stars.toLocaleString('pt-BR')} estrelas`);
  else if (stars < 50) cons.push(`Pouca adoção: apenas ${stars} estrela(s) — projeto pouco testado em produção`);

  if (pushedDays != null && pushedDays <= 30) pros.push('Ativo: últimos commits há menos de 30 dias');
  else if (pushedDays != null && pushedDays > 180) {
    const meses = monthsBetween(pushed as Date, inputs.now);
    cons.push(`Sem atividade há ${meses >= 12 ? `${Math.floor(meses / 12)} ano(s)` : `${meses} mês(es)`} (último push em ${pushedAt?.slice(0, 10)}) — risco de abandono`);
  }

  if (inputs.readme == null) cons.push('Sem README — documentação inexistente ou inacessível');
  else if (readmeSize != null && readmeSize >= 2048) pros.push('README detalhado (documentação razoável na raiz)');
  else if (readmeSize != null && readmeSize < 512) cons.push('README muito curto — documentação mínima');

  if (licenseSpdx != null && licenseSpdx !== 'NOASSERTION') {
    if (['MIT', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', '0BSD', 'Unlicense'].includes(licenseSpdx)) {
      pros.push(`Licença permissiva (${licenseSpdx}) — uso e redistribuição livres`);
    } else if (licenseSpdx.startsWith('AGPL') || licenseSpdx.startsWith('GPL') || licenseSpdx.startsWith('LGPL')) {
      pros.push(`Licença copyleft declarada (${licenseSpdx}) — confira os termos antes de usar comercialmente`);
    } else {
      pros.push(`Licença declarada (${licenseSpdx})`);
    }
  } else if (licenseSpdx === 'NOASSERTION') {
    cons.push('Licença não identificada automaticamente — verifique o arquivo LICENSE no repositório');
  } else {
    cons.push('Sem licença declarada — uso legalmente restrito ao direito do repositório');
  }

  if (contributorsCount != null) {
    if (contributorsCount >= 10) pros.push(`Comunidade ativa: ${contributorsCount >= 100 ? '100+' : contributorsCount} contribuidores`);
    else if (contributorsCount <= 1) cons.push('Mantido por uma única pessoa — risco de vida baixa caso o mantenedor saia');
  }

  if (openIssues >= 200) cons.push(`${openIssues.toLocaleString('pt-BR')} issues abertas — fila grande para o time de manutenção`);
  if (releasesTotal === 0 && inputs.releases != null) cons.push('Nenhum release publicado — sem marcos de versão estáveis');
  if (releasesLastYear === 0 && releasesTotal > 0) cons.push('Nenhum release no último ano — versões estáticas');

  const archived = data['archived'] === true;
  if (archived) cons.push('Repositório ARQUIVADO — somente leitura, sem novas atualizações');

  if (pickString(data, 'description') == null) cons.push('Sem descrição do projeto na página do GitHub');

  const topics =
    Array.isArray(data['topics'])
      ? (data['topics'] as unknown[]).filter((t): t is string => typeof t === 'string')
      : [];

  return {
    owner: pickString(owner, 'login') ?? inputs.owner,
    name: pickString(data, 'name') ?? inputs.name,
    fullName: pickString(data, 'full_name') ?? `${inputs.owner}/${inputs.name}`,
    remoteUrl: inputs.remoteUrl,
    ...(pickString(data, 'description') ? { description: pickString(data, 'description') } : {}),
    stars,
    forks: pickNumber(data, 'forks_count'),
    watchers: pickNumber(data, 'subscribers_count'),
    openIssues,
    ...(pickString(data, 'language') ? { language: pickString(data, 'language') } : {}),
    topics,
    ...(licenseSpdx != null ? { license: licenseSpdx } : {}),
    ...(created != null ? { createdAt: created } : {}),
    ...(pushedAt != null ? { pushedAt } : {}),
    archived,
    ...(pickString(data, 'homepage') ? { homepage: pickString(data, 'homepage') } : {}),
    ...(pickString(data, 'default_branch') ? { defaultBranch: pickString(data, 'default_branch') } : {}),
    ...(readmeSize != null ? { readmeSize } : {}),
    ...(contributorsCount != null ? { contributorsCount } : {}),
    releasesLastYear,
    pros,
    cons,
    analysisAt: new Date(inputs.now).toISOString()
  };
}

/** Orquestra as chamadas da API (repo + readme + contributors + releases) e monta a análise. */
export async function analyzeGithubRepo(
  fetchJson: JsonFetcher,
  options: { remoteUrl: string; token?: string; now?: Date }
): Promise<RepoAnalysis> {
  const { owner, repo } = parseOwnerRepo(options.remoteUrl);
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const now = options.now ?? new Date();
  const safe = async <T>(run: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await run(); } catch { return fallback; }
  };
  const [data, readme, contributors, releases] = await Promise.all([
    fetchJson(base, options.token),
    safe<unknown>(() => fetchJson(`${base}/readme`, options.token), null),
    safe<unknown[] | null>(() => fetchJson(`${base}/contributors?per_page=100`, options.token) as Promise<unknown[]>, null),
    safe<unknown[] | null>(() => fetchJson(`${base}/releases?per_page=100`, options.token) as Promise<unknown[]>, null)
  ]);
  const normalizedUrl = isValidGitUrl(options.remoteUrl) ? normalizeGitUrl(options.remoteUrl) : options.remoteUrl;
  return buildRepoAnalysis({
    repo: data,
    readme,
    contributors,
    releases,
    owner,
    name: repo,
    remoteUrl: normalizedUrl,
    now
  });
}
