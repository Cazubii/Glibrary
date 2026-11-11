import { z } from 'zod';
import type { IpcResult } from '../../shared/types';
import type { ListAccountReposInput, ProjectRepoPage, ProjectRepoSummary } from '../../shared/github-projects';

export type JsonFetcher = (url: string, token?: string) => Promise<unknown>;

const API = 'https://api.github.com';

const GithubRepoSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  full_name: z.string().optional(),
  description: z.string().nullable().optional(),
  private: z.boolean().optional(),
  visibility: z.string().optional(),
  fork: z.boolean().optional(),
  language: z.string().nullable().optional(),
  stargazers_count: z.number().finite().nonnegative().optional(),
  updated_at: z.string().optional(),
  html_url: z.string().optional(),
  default_branch: z.string().optional()
}).passthrough();

function mapGithubRepo(value: unknown): ProjectRepoSummary | null {
  const parsed = GithubRepoSchema.safeParse(value);
  if (!parsed.success) return null;

  const repo = parsed.data;
  const summary: ProjectRepoSummary = {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name ?? repo.name,
    visibility: repo.private === true || repo.visibility === 'private' || repo.visibility === 'internal'
      ? 'private'
      : 'public',
    isFork: repo.fork === true,
    stars: repo.stargazers_count ?? 0,
    updatedAt: repo.updated_at ?? '',
    htmlUrl: repo.html_url ?? ''
  };

  if (repo.description != null) summary.description = repo.description;
  if (repo.language != null && repo.language !== '') summary.language = repo.language;
  if (repo.default_branch != null && repo.default_branch !== '') summary.defaultBranch = repo.default_branch;
  return summary;
}

function projectsErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('HTTP 401')) return 'Token do GitHub inválido ou expirado. Conecte a conta novamente.';
  return `Não foi possível carregar os repositórios do GitHub: ${message}`;
}

/** Busca uma página de /user/repos e mapeia os campos usados pela interface. */
export async function listAccountRepos(
  fetchJson: JsonFetcher,
  input: ListAccountReposInput
): Promise<ProjectRepoPage> {
  if (input.token == null || input.token === '') {
    throw new Error('Conecte sua conta GitHub para listar os repositórios.');
  }

  const params = new URLSearchParams({
    affiliation: 'owner,collaborator,organization_member',
    visibility: input.visibility ?? 'all',
    sort: input.sort ?? 'updated',
    direction: 'desc',
    per_page: String(input.perPage ?? 50),
    page: String(input.page ?? 1)
  });
  const response = await fetchJson(`${API}/user/repos?${params.toString()}`, input.token);
  if (!Array.isArray(response)) throw new Error('Resposta inesperada da API do GitHub (/user/repos)');

  const mapped = response
    .map(mapGithubRepo)
    .filter((repo): repo is ProjectRepoSummary => repo != null);
  const repos = input.fork === false ? mapped.filter((repo) => !repo.isFork) : mapped;
  const page = input.page ?? 1;
  const perPage = input.perPage ?? 50;

  return { repos, page, perPage, hasMore: response.length >= perPage };
}

/** Limite IPC da consulta; mantém o contrato de resposta uniforme do app. */
export async function loadAccountRepos(
  fetchJson: JsonFetcher,
  input: ListAccountReposInput
): Promise<IpcResult<ProjectRepoPage>> {
  try {
    return { ok: true, data: await listAccountRepos(fetchJson, input) };
  } catch (error) {
    return { ok: false, error: projectsErrorMessage(error) };
  }
}
