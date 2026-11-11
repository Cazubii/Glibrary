import { net, safeStorage } from 'electron';

export interface GithubRepoMeta {
  description?: string;
  stars?: number;
  language?: string;
  topics?: string[];
  defaultBranch?: string;
  htmlUrl?: string;
}

export interface GithubApiOptions {
  token?: string;
}

export type GithubApiErrorReason = 'invalid_token' | 'forbidden' | 'rate_limit' | 'network' | 'unknown';

export class GithubApiError extends Error {
  constructor(
    readonly reason: GithubApiErrorReason,
    readonly statusCode: number | undefined,
    message: string
  ) {
    super(message);
    this.name = 'GithubApiError';
  }
}

/** Seção 10: token sempre via safeStorage. */
export function encodeToken(token: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O armazenamento seguro do sistema não está disponível.');
  }
  return safeStorage.encryptString(token).toString('base64');
}

export function decodeToken(stored: string | undefined): string | undefined {
  if (stored == null || stored === '') return undefined;
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'));
  } catch {
    return stored;
  }
}

export function fetchJson(url: string, token?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' });
    if (token != null && token !== '') {
      request.setHeader('Authorization', `Bearer ${token}`);
    }
    request.setHeader('Accept', 'application/vnd.github+json');
    request.setHeader('X-GitHub-Api-Version', '2022-11-28');
    request.setHeader('User-Agent', 'Glibrary');
    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf-8');
      });
      response.on('end', () => {
        const status = response.statusCode;
        const rateRemaining = response.headers['x-ratelimit-remaining']?.[0];
        if (status === 401) {
          reject(new GithubApiError('invalid_token', status, 'Token do GitHub inválido ou expirado.'));
          return;
        }
        if (status === 403 || status === 429) {
          const rateLimited = status === 429 || rateRemaining === '0' || /rate limit exceeded/i.test(body);
          reject(new GithubApiError(
            rateLimited ? 'rate_limit' : 'forbidden',
            status,
            rateLimited
              ? 'Limite da API do GitHub atingido. Tente novamente mais tarde.'
              : 'O token não tem permissão para esta operação.'
          ));
          return;
        }
        if (status == null || status >= 400) {
          reject(new GithubApiError(
            'unknown',
            status,
            `GitHub API: HTTP ${status ?? 'desconhecido'}`
          ));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new GithubApiError('unknown', status, 'Resposta inválida da API do GitHub.'));
        }
      });
    });
    request.on('error', (err) => {
      reject(new GithubApiError('network', undefined, err.message));
    });
    request.end();
  });
}

export async function fetchRepoMeta(
  owner: string,
  repo: string,
  options: GithubApiOptions = {},
): Promise<GithubRepoMeta> {
  const data = (await fetchJson(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    options.token,
  )) as Record<string, unknown>;

  const meta: GithubRepoMeta = {};
  if (typeof data['description'] === 'string') meta.description = data['description'];
  if (typeof data['stargazers_count'] === 'number') meta.stars = data['stargazers_count'];
  if (typeof data['language'] === 'string') meta.language = data['language'];
  if (Array.isArray(data['topics'])) meta.topics = data['topics'] as string[];
  if (typeof data['default_branch'] === 'string') meta.defaultBranch = data['default_branch'];
  if (typeof data['html_url'] === 'string') meta.htmlUrl = data['html_url'];
  return meta;
}

export function opengraphCoverUrl(owner: string, repo: string): string {
  return `https://opengraph.githubassets.com/1/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/** Baixa o conteúdo cru de um arquivo (ex.: raw.githubusercontent.com). */
export function fetchText(url: string, token?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' });
    if (token != null && token !== '') {
      request.setHeader('Authorization', `Bearer ${token}`);
    }
    request.setHeader('User-Agent', 'Glibrary');
    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf-8');
      });
      response.on('end', () => {
        if (response.statusCode === 403 || response.statusCode === 429) {
          reject(new Error('Limite de acesso ao GitHub atingido. Tente mais tarde ou adicione um token.'));
          return;
        }
        if (response.statusCode !== 200) {
          reject({ statusCode: response.statusCode, message: `GitHub: HTTP ${response.statusCode}` });
          return;
        }
        resolve(body);
      });
    });
    request.on('error', (err) => reject(new Error(err.message)));
    request.end();
  });
}

