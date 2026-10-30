/**
 * Normalização de URLs git (seção 9):
 * `git@github.com:a/b` == `https://github.com/a/b` — sem `.git`, sem barra
 * final, minúsculo.
 */
export function normalizeGitUrl(url: string): string {
  let u = url.trim().toLowerCase();
  u = u.replace(/\/+$/, '');
  u = u.replace(/\.git$/, '');
  u = u.replace(/\/+$/, '');

  const ssh = /^git@([^:]+):(.+)$/.exec(u);
  if (ssh != null) {
    u = `https://${ssh[1]}/${ssh[2]}`;
  }
  u = u.replace(/^ssh:\/\/git@/, 'https://');
  u = u.replace(/^git:\/\//, 'https://');
  return u;
}

/** Aceita apenas `https://…` e `git@…` (seção 7, segurança). */
export function isValidGitUrl(url: string): boolean {
  const t = url.trim();
  return /^https:\/\/\S+$/.test(t) || /^git@\S+:\S+$/.test(t) || /^ssh:\/\/git@\S+$/.test(t);
}

/** Extrai `owner/name` de URLs GitHub, se aplicável. */
export function parseGithubRepo(
  url: string,
): { owner: string; repo: string } | null {
  const normalized = normalizeGitUrl(url);
  const m = /^https:\/\/github\.com\/([^/]+)\/([^/]+)$/.exec(normalized);
  if (m == null) return null;
  return { owner: m[1], repo: m[2] };
}

/** Normaliza caminhos locais para comparação de duplicatas. */
export function normalizeLocalPath(path: string, platform: NodeJS.Platform): string {
  let p = path.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (platform === 'win32') p = p.toLowerCase();
  return p;
}
