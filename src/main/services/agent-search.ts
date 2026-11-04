import type { KnownAgentDef } from '../../shared/agent-registry';
import { findKnownAgent, genericAgentQueries } from '../../shared/agent-registry';
import { normalizeGitUrl } from '../../shared/git-utils';
import { parseTopReposResponse } from './top-repos';
import type { JsonFetcher, GithubRepoListItem } from './top-repos';

export interface AgentSearchResponse {
  knownAgent: string | null;
  knownAgentId: string | null;
  usedQueries: string[];
  repos: GithubRepoListItem[];
  totalResults: number;
}

interface ListResult {
  repos: GithubRepoListItem[];
  skipped: boolean;
}

/** Junta resultados de várias consultas: dedupe por URL, ordena por estrelas, cap 50. */
export function mergeSearchLists(lists: GithubRepoListItem[][], cap = 50): GithubRepoListItem[] {
  const seen = new Map<string, GithubRepoListItem>();
  for (const list of lists) {
    for (const item of list) {
      const key = normalizeGitUrl(item.remoteUrl || `${item.owner}/${item.name}`);
      if (!seen.has(key)) seen.set(key, item);
    }
  }
  return [...seen.values()].sort((a, b) => b.stars - a.stars).slice(0, cap);
}

async function runQuery(
  query: string,
  perQueryLimit: number,
  fetchJson: JsonFetcher,
  token?: string
): Promise<ListResult> {
  const url =
    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}` +
    `&sort=stars&order=desc&per_page=${perQueryLimit}`;
  try {
    return { repos: parseTopReposResponse(await fetchJson(url, token)), skipped: false };
  } catch {
    return { repos: [], skipped: true };
  }
}

/**
 * Busca "melhores repos para o agente X": textos livres mapeiam para agentes conhecidos
 * (topics do ecossistema) ou caem em consultas genéricas (frase + tópico derivado).
 */
export async function searchAgentRepos(
  fetchJson: JsonFetcher,
  options: {
    input: string;
    token?: string;
    perQueryLimit?: number;
    fallbackTotal?: number;
  }
): Promise<AgentSearchResponse> {
  const normalizedInput = options.input.trim();
  if (normalizedInput === '') throw new Error('Informe o nome de um agente para buscar');
  const known = findKnownAgent(normalizedInput);
  const queries = known != null ? [...known.queries] : genericAgentQueries(normalizedInput);
  const perQueryLimit = Math.min(Math.max(options.perQueryLimit ?? 30, 1), 50);

  const results: ListResult[] = [];
  for (const query of queries) {
    results.push(await runQuery(query, perQueryLimit, fetchJson, options.token));
  }

  let repos = mergeSearchLists(results.map((result) => result.repos));
  let skippedAll = results.every((result) => result.skipped);
  if (repos.length === 0 && !skippedAll && known != null) {
    // Ecossistema sem resultados: cai para busca literal do nome do agente.
    const fallback = await runQuery(known.label, perQueryLimit, fetchJson, options.token);
    repos = mergeSearchLists([fallback.repos]);
    skippedAll = fallback.skipped;
  }
  if (repos.length === 0 && skippedAll) {
    throw new Error('Nenhuma consulta respondeu — tente novamente em um minuto (limite da API do GitHub)');
  }

  const triedQueries = [...queries];
  if (known != null && repos.length > 0 && triedQueries.length > 0 && results.every((result) => result.repos.length === 0)) {
    triedQueries.push(known.label);
  }
  return {
    knownAgent: known?.label ?? null,
    knownAgentId: known?.id ?? null,
    usedQueries: triedQueries,
    repos,
    totalResults: repos.length
  };
}

export type { KnownAgentDef };
