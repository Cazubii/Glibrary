import { z } from 'zod';
import { translateError } from './error-translator';
import type { GithubJsonRequestOptions } from './github-api';
export type { GithubJsonRequestOptions } from './github-api';
import type { IpcResult } from '../../shared/types';
import type { ListAccountReposInput, ProjectRepoPage, ProjectRepoSummary } from '../../shared/github-projects';

export type JsonFetcher = (url: string, token?: string, options?: GithubJsonRequestOptions) => Promise<unknown>;

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

const CreatedGithubRepoSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  owner: z.object({ login: z.string().min(1) }),
  private: z.boolean(),
  html_url: z.string().url(),
  clone_url: z.string().url()
}).passthrough();

export interface CreateAccountRepositoryInput {
  token: string;
  name: string;
  description?: string;
  visibility: 'private' | 'public';
}

export interface CreatedAccountRepository {
  id: number;
  owner: string;
  name: string;
  visibility: 'private' | 'public';
  htmlUrl: string;
  cloneUrl: string;
}

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

/** Cria um repositório vazio para receber o primeiro envio da pasta local. */
export async function createAccountRepository(
  fetchJson: JsonFetcher,
  input: CreateAccountRepositoryInput
): Promise<CreatedAccountRepository> {
  if (input.token.trim() === '') throw new Error('Conecte sua conta GitHub antes de publicar.');
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(input.name) || input.name === '.' || input.name === '..') {
    throw new Error('Use um nome de repositório com até 100 letras, números, ponto, hífen ou sublinhado.');
  }
  if (input.description != null && input.description.length > 350) {
    throw new Error('A descrição do repositório deve ter até 350 caracteres.');
  }

  let response: unknown;
  try {
    response = await fetchJson(`${API}/user/repos`, input.token, {
      method: 'POST',
      body: {
        name: input.name,
        ...(input.description != null && input.description.trim() !== '' ? { description: input.description.trim() } : {}),
        private: input.visibility === 'private',
        auto_init: false
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/HTTP 403/.test(message)) {
      throw new Error('O GitHub não autorizou criar o repositório. O GitHub App precisa da permissão “Repository creation: write”; um token pessoal precisa de public_repo para repositórios públicos ou repo para privados.');
    }
    if (/HTTP 422/.test(message)) throw new Error('Já existe um repositório com esse nome nesta conta. Escolha outro nome.');
    throw error;
  }

  const parsed = CreatedGithubRepoSchema.safeParse(response);
  if (!parsed.success) throw new Error('Resposta inesperada da API do GitHub (/user/repos create)');
  const repo = parsed.data;
  if (!/^https:\/\/(www\.)?github\.com\//i.test(repo.clone_url)) {
    throw new Error('A resposta do GitHub trouxe um endereço de clone inesperado.');
  }
  return {
    id: repo.id,
    owner: repo.owner.login,
    name: repo.name,
    visibility: repo.private ? 'private' : 'public',
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url
  };
}

/** Limite IPC da consulta; mantém o contrato de resposta uniforme do app. */
export async function loadAccountRepos(
  fetchJson: JsonFetcher,
  input: ListAccountReposInput
): Promise<IpcResult<ProjectRepoPage>> {
  try {
    return { ok: true, data: await listAccountRepos(fetchJson, input) };
  } catch (error) {
    return { ok: false, error: translateError(error) };
  }
}
