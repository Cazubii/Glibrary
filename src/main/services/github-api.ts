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

/** Seção 10: token sempre via safeStorage. */
export function encodeToken(token: string): string {
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

function fetchJson(url: string, token?: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'GET' });
    if (token != null && token !== '') {
      request.setHeader('Authorization', `Bearer ${token}`);
    }
    request.setHeader('Accept', 'application/vnd.github+json');
    request.setHeader('User-Agent', 'Glibrary');
    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf-8');
      });
      response.on('end', () => {
        if (response.statusCode === 403 || response.statusCode === 429) {
          reject(new Error('Limite da API do GitHub atingido. Tente mais tarde ou adicione um token.'));
          return;
        }
        if (response.statusCode == null || response.statusCode >= 400) {
          reject(new Error(`GitHub API: HTTP ${response.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Resposta inválida da API do GitHub'));
        }
      });
    });
    request.on('error', (err) => reject(err));
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
