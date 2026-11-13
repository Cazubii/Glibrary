import {
  simpleGit,
  type SimpleGit,
  type SimpleGitProgressEvent,
  type PullResult,
  type StatusResult,
} from 'simple-git';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { GitBranchList, LocalBranchSummary, RemoteBranchSummary } from '../../shared/git-branches';
import type { AgentFileChange, GitChangePreview, GitFile, GitNewFilePreview } from '../../shared/types';
import { buildWorkingBranchName, isProtectedBranch } from './git-protection';

export interface CloneProgress {
  percent: number | null;
  stage: string;
}

export interface FetchStatus {
  behindBy: number;
  ahead: number;
  dirty: boolean;
}

export type ProgressCallback = (progress: CloneProgress) => void;

const MAX_REVIEW_DIFF_CHARS = 500_000;
const MAX_NEW_FILE_PREVIEW_BYTES = 100_000;
const MAX_NEW_FILE_TOTAL_BYTES = 500_000;

function pathIsWithin(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return fromRoot !== '' && fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function isBinary(buffer: Buffer): boolean {
  return buffer.includes(0);
}

function clippedText(buffer: Buffer, limit: number): { text: string; truncated: boolean; binary: boolean } {
  const truncated = buffer.length > limit;
  const content = buffer.subarray(0, limit);
  const binary = isBinary(buffer);
  return {
    text: binary ? `[Arquivo binário: ${buffer.length.toLocaleString('pt-BR')} bytes]` : content.toString('utf8'),
    truncated,
    binary
  };
}

async function hashWorkspaceFile(root: string, relativePath: string): Promise<string | null> {
  const absoluteFile = resolve(root, relativePath);
  if (!pathIsWithin(root, absoluteFile)) return null;
  let buffer: Buffer;
  try {
    const info = await fs.lstat(absoluteFile);
    if (info.isDirectory()) return null;
    if (info.isSymbolicLink()) {
      buffer = Buffer.from(`Link simbólico para: ${await fs.readlink(absoluteFile)}`);
    } else {
      const realFile = await fs.realpath(absoluteFile);
      if (!pathIsWithin(root, realFile)) return null;
      buffer = await fs.readFile(realFile);
    }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return createHash('sha256').update('glibrary:missing').digest('hex');
    }
    return null;
  }
  return createHash('sha256').update(buffer).digest('hex');
}

/** Mapeia o status do simple-git para o formato compartilhado com o renderer. */
export function summarizeStatus(status: StatusResult): {
  branch: string | null;
  ahead: number;
  behind: number;
  files: Array<{ path: string; state: 'staged' | 'modified' | 'untracked' }>;
} {
  const files = status.files.map((f) => ({
    path: f.path,
    state:
      f.working_dir === ' ' && f.index !== ' ' ? ('staged' as const)
      : f.working_dir === '?' ? ('untracked' as const)
      : ('modified' as const)
  }));
  return {
    branch: status.current ?? null,
    ahead: status.ahead ?? 0,
    behind: status.behind ?? 0,
    files
  };
}

/** Mascara tokens/acessos que possam vazar em mensagens de erro do git. */
export function sanitizeGitOutput(text: string): string {
  return text
    .replace(/x-access-token:[^@\s]+@/g, 'x-access-token:***@')
    .replace(/:\/\/[^@/\s:]+:[^@/\s]+@/g, '://***@')
    .replace(/\bgh[po]_[A-Za-z0-9]{20,}\b/g, '***');
}

/** Indica se o remote usa github.com em http(s)/ssh (push com header de autorizacao). */
export function isGithubRemote(remoteUrl: string): boolean {
  return /^https:\/\/(www\.)?github\.com\//i.test(remoteUrl) || /^git@github\.com:/i.test(remoteUrl);
}

/** Valor do header HTTP Basic para PAT do GitHub (convencao x-access-token). */
export function githubAuthHeader(token: string): string {
  return `Authorization: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
}

export function githubAuthConfig(token: string): string[] {
  return [`http.extraHeader=${githubAuthHeader(token)}`];
}

export class GitService {
  private readonly clones = new Map<string, { cancel: () => void }>();

  isCloning(repoId: string): boolean {
    return this.clones.has(repoId);
  }

  async clone(
    repoId: string,
    url: string,
    destParent: string,
    name: string,
    onProgress: ProgressCallback,
    token?: string
  ): Promise<string> {
    if (this.clones.has(repoId)) throw new Error('Clone já em andamento');
    const target = join(destParent, name);
    const git: SimpleGit = simpleGit({
      ...(token != null && token !== '' && isGithubRemote(url)
        ? { config: githubAuthConfig(token) }
        : {}),
      progress: ({ method, stage, progress }: SimpleGitProgressEvent) => {
        if (method === 'clone') {
          onProgress({ percent: progress, stage });
        }
      }
    });

    let cancelled = false;
    this.clones.set(repoId, {
      cancel: () => {
        cancelled = true;
      }
    });

    try {
      onProgress({ percent: null, stage: 'Iniciando clone…' });
      await git.clone(url, target);
      if (cancelled) throw new Error('Clone cancelado');
      onProgress({ percent: 100, stage: 'Concluído' });
      return target;
    } finally {
      this.clones.delete(repoId);
    }
  }

  cancelClone(repoId: string): void {
    this.clones.get(repoId)?.cancel();
  }

  private at(localPath: string): SimpleGit {
    return simpleGit({ baseDir: localPath });
  }

  async pull(localPath: string): Promise<{ updated: boolean; summary: string }> {
    const git = this.at(localPath);
    const before = (await git.revparse('HEAD')).trim();
    const result: PullResult = await git.pull();
    const after = (await git.revparse('HEAD')).trim();
    const s = result.summary;
    return {
      updated: before !== after,
      summary: `${s.changes} mudanças, +${s.insertions} -${s.deletions}`
    };
  }

  async fetchStatus(localPath: string): Promise<FetchStatus> {
    const git = this.at(localPath);
    await git.fetch(['--prune', '--quiet']).catch(() => undefined);
    const status = await git.status();
    return {
      behindBy: status.behind ?? 0,
      ahead: status.ahead ?? 0,
      dirty: !status.isClean()
    };
  }

  async getRemoteUrl(localPath: string): Promise<string | null> {
    try {
      const result = await this.at(localPath).remote(['get-url', 'origin']);
      return typeof result === 'string' ? result.trim() : null;
    } catch {
      return null;
    }
  }

  async getCurrentBranch(localPath: string): Promise<string | null> {
    try {
      const result = await this.at(localPath).branch();
      return result.current ?? null;
    } catch {
      return null;
    }
  }

  /** Lista branches locais e refs remotas, atualizando as refs sem falhar offline. */
  async listBranches(localPath: string): Promise<GitBranchList> {
    const git = this.at(localPath);
    await git.fetch(['--all', '--prune', '--quiet']).catch(() => undefined);
    const [localResult, remoteResult] = await Promise.all([
      git.branchLocal(),
      git.branch(['-r'])
    ]);
    const local: LocalBranchSummary[] = localResult.all
      .map((name) => ({ name, current: name === localResult.current }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const remote: RemoteBranchSummary[] = remoteResult.all
      .filter((ref) => !ref.includes(' -> '))
      .map((ref) => {
        const slash = ref.indexOf('/');
        return {
          name: slash >= 0 ? ref.slice(slash + 1) : ref,
          remote: slash >= 0 ? ref.slice(0, slash) : '',
          ref
        };
      })
      .sort((a, b) => a.ref.localeCompare(b.ref));
    return { current: localResult.current ?? null, local, remote };
  }

  /** Cria branch a partir da branch padrão local ou da ref origin correspondente. */
  async createBranch(localPath: string, name: string, defaultBranch?: string): Promise<void> {
    if (defaultBranch == null || defaultBranch === '') {
      throw new Error('A branch padrão do repositório não está disponível.');
    }
    const git = this.at(localPath);
    try {
      await git.raw(['check-ref-format', '--branch', name]);
    } catch {
      throw new Error('Nome de branch inválido.');
    }
    const [local, remote] = await Promise.all([git.branchLocal(), git.branch(['-r'])]);
    const remoteBase = `origin/${defaultBranch}`;
    const base = local.all.includes(defaultBranch)
      ? defaultBranch
      : remote.all.includes(remoteBase)
        ? remoteBase
        : null;
    if (base == null) throw new Error(`Branch padrão "${defaultBranch}" não encontrada no repositório local.`);
    await git.checkout(['-b', name, base]);
  }

  /** Sai de main/master para uma linha de trabalho antes de o agente editar arquivos. */
  async ensureWorkingBranch(localPath: string, prompt: string | undefined, date = new Date()): Promise<string | null> {
    const current = await this.getCurrentBranch(localPath);
    if (current == null || !isProtectedBranch(current)) return current;
    const existing = (await this.at(localPath).branchLocal()).all;
    const name = buildWorkingBranchName(prompt, date, existing);
    await this.createBranch(localPath, name, current);
    return name;
  }

  /** Faz checkout local ou cria uma branch local acompanhando uma ref remota. */
  async checkoutBranch(localPath: string, branch: string): Promise<string> {
    const git = this.at(localPath);
    const local = await git.branchLocal();
    if (local.all.includes(branch)) {
      await git.checkout(branch);
      return branch;
    }

    const remote = await git.branch(['-r']);
    if (!remote.all.includes(branch) || branch.includes(' -> ')) {
      throw new Error(`Branch "${branch}" não encontrada.`);
    }
    const slash = branch.indexOf('/');
    const localName = slash >= 0 ? branch.slice(slash + 1) : branch;
    if (local.all.includes(localName)) {
      await git.checkout(localName);
      return localName;
    }
    await git.checkout(['-b', localName, branch]);
    return localName;
  }

  /** Status detalhado (branch, ahead/behind, arquivos) para a aba Git. */
  async listChanges(localPath: string): Promise<{
    branch: string | null;
    ahead: number;
    behind: number;
    files: Array<{ path: string; state: 'staged' | 'modified' | 'untracked' }>;
  }> {
    const git = this.at(localPath);
    await git.fetch(['--prune', '--quiet']).catch(() => undefined);
    return summarizeStatus(await git.status());
  }

  /** Prepara uma revisão estável do diff e do conteúdo de arquivos ainda não rastreados. */
  async previewChanges(localPath: string, onlyPaths?: readonly string[]): Promise<GitChangePreview> {
    const git = this.at(localPath);
    const status = await git.status();
    const root = await fs.realpath(localPath);
    const stateByPath = new Map<string, GitFile['state']>(
      status.files.map((file) => [
        file.path,
        file.working_dir === ' ' && file.index !== ' ' ? 'staged'
          : file.working_dir === '?' ? 'untracked'
          : 'modified'
      ])
    );
    const untracked = await git.raw(['ls-files', '--others', '--exclude-standard', '-z']);
    const allowedPaths = onlyPaths == null ? null : new Set(onlyPaths);
    const paths = [...new Set([
      ...stateByPath.keys(),
      ...untracked.split('\0').filter((path) => path !== '')
    ])].filter((path) => allowedPaths == null || allowedPaths.has(path)).sort((a, b) => a.localeCompare(b));
    const files: GitFile[] = [];
    const newFiles: GitNewFilePreview[] = [];
    const hash = createHash('sha256');
    let fullDiff = '';
    let remainingNewFileBytes = MAX_NEW_FILE_TOTAL_BYTES;
    let truncated = false;

    for (const path of paths) {
      const inHead = await git.raw(['cat-file', '-e', `HEAD:${path}`]).then(() => true, () => false);
      hash.update(path);
      hash.update('\0');
      if (inHead) {
        const fileDiff = await git.diff(['--no-ext-diff', '--no-color', '--binary', 'HEAD', '--', path]);
        hash.update('tracked\0');
        hash.update(fileDiff);
        fullDiff += fileDiff;
        files.push({ path, state: stateByPath.get(path) ?? 'modified' });
        continue;
      }

      const absoluteFile = resolve(root, path);
      if (!pathIsWithin(root, absoluteFile)) continue;
      let fileBuffer: Buffer;
      try {
        const info = await fs.lstat(absoluteFile);
        if (info.isDirectory()) continue;
        if (info.isSymbolicLink()) {
          fileBuffer = Buffer.from(`Link simbólico para: ${await fs.readlink(absoluteFile)}`);
        } else {
          const realFile = await fs.realpath(absoluteFile);
          if (!pathIsWithin(root, realFile)) continue;
          fileBuffer = await fs.readFile(realFile);
        }
      } catch {
        continue;
      }

      hash.update('new\0');
      hash.update(fileBuffer);
      hash.update('\0');
      const previewLimit = Math.min(MAX_NEW_FILE_PREVIEW_BYTES, remainingNewFileBytes);
      const display = clippedText(fileBuffer, previewLimit);
      remainingNewFileBytes = Math.max(0, remainingNewFileBytes - Math.min(fileBuffer.length, previewLimit));
      truncated ||= display.truncated;
      newFiles.push({ path, content: display.text, binary: display.binary, truncated: display.truncated });
      files.push({ path, state: stateByPath.get(path) ?? 'untracked' });
    }

    const diffTruncated = fullDiff.length > MAX_REVIEW_DIFF_CHARS;
    truncated ||= diffTruncated;
    return {
      revision: hash.digest('hex'),
      files,
      diff: diffTruncated ? `${fullDiff.slice(0, MAX_REVIEW_DIFF_CHARS)}\n… diff reduzido para caber na revisão.` : fullDiff,
      newFiles,
      truncated
    };
  }

  /** Registra apenas arquivos que estavam limpos antes da execução do agente. */
  async captureAgentChanges(localPath: string, baselinePaths: ReadonlySet<string>): Promise<AgentFileChange[]> {
    const git = this.at(localPath);
    const status = await git.status();
    const untracked = await git.raw(['ls-files', '--others', '--exclude-standard', '-z']);
    const paths = [...new Set([
      ...status.files.map((file) => file.path),
      ...untracked.split('\0').filter((path) => path !== '')
    ])].sort((a, b) => a.localeCompare(b));
    const root = await fs.realpath(localPath);
    const changes: AgentFileChange[] = [];
    for (const path of paths) {
      if (baselinePaths.has(path)) continue;
      const inHead = await git.raw(['cat-file', '-e', `HEAD:${path}`]).then(() => true, () => false);
      const sha256 = await hashWorkspaceFile(root, path);
      if (sha256 == null) continue;
      changes.push({ path, kind: inHead ? 'tracked' : 'untracked', sha256 });
      if (changes.length >= 500) break;
    }
    return changes;
  }

  /** Descarta somente snapshots ainda idênticos; edições posteriores ficam intactas. */
  async discardAgentChanges(localPath: string, changes: readonly AgentFileChange[]): Promise<{ discarded: string[]; skipped: string[] }> {
    const git = this.at(localPath);
    const status = await git.status();
    const currentPaths = new Set(status.files.map((file) => file.path));
    const untracked = await git.raw(['ls-files', '--others', '--exclude-standard', '-z']);
    for (const path of untracked.split('\0')) if (path !== '') currentPaths.add(path);
    const root = await fs.realpath(localPath);
    const discarded: string[] = [];
    const skipped: string[] = [];

    for (const change of changes) {
      const absoluteFile = resolve(root, change.path);
      if (!pathIsWithin(root, absoluteFile) || !currentPaths.has(change.path)) {
        skipped.push(change.path);
        continue;
      }
      const currentHash = await hashWorkspaceFile(root, change.path);
      if (currentHash !== change.sha256) {
        skipped.push(change.path);
        continue;
      }
      const inHead = await git.raw(['cat-file', '-e', `HEAD:${change.path}`]).then(() => true, () => false);
      try {
        if (change.kind === 'tracked') {
          if (!inHead) {
            skipped.push(change.path);
            continue;
          }
          await git.raw(['restore', '--source=HEAD', '--staged', '--worktree', '--', change.path]);
        } else {
          if (inHead) {
            skipped.push(change.path);
            continue;
          }
          await git.raw(['reset', '-q', 'HEAD', '--', change.path]).catch(() => undefined);
          const info = await fs.lstat(absoluteFile).catch(() => null);
          if (info != null) {
            if (info.isDirectory()) {
              skipped.push(change.path);
              continue;
            }
            await fs.unlink(absoluteFile);
          }
        }
        discarded.push(change.path);
      } catch {
        skipped.push(change.path);
      }
    }
    return { discarded, skipped };
  }

  /** Salva exatamente os arquivos revisados; se algo mudou, exige uma nova revisão. */
  async commitReviewed(localPath: string, message: string, expectedRevision: string): Promise<{ commit: string }> {
    if (!/^[a-f0-9]{64}$/i.test(expectedRevision)) throw new Error('A revisão das alterações não é válida.');
    const git = this.at(localPath);
    const before = await this.previewChanges(localPath);
    if (before.files.length === 0) throw new Error('Não há alterações para salvar.');
    if (before.revision !== expectedRevision) throw new Error('As alterações mudaram desde a revisão. Revise novamente antes de salvar.');

    await git.add(['-A', '--', ...before.files.map((file) => file.path)]);
    const after = await this.previewChanges(localPath);
    if (after.revision !== expectedRevision) throw new Error('As alterações mudaram desde a revisão. Revise novamente antes de salvar.');

    for (const key of ['user.name', 'user.email']) {
      let value = '';
      try {
        value = (await git.getConfig(key)).value ?? '';
      } catch {
        value = '';
      }
      if (value === '') throw new Error(`Git sem identidade: configure "${key}" antes de salvar a versão.`);
    }
    try {
      const summary = await git.commit(message);
      return { commit: summary.commit };
    } catch (error) {
      throw new Error(sanitizeGitOutput(error instanceof Error ? error.message : String(error)));
    }
  }

  /** `git add -A` + commit. Requer user.name/email configurados no git do usuário. */
  async commitAll(localPath: string, message: string): Promise<{ commit: string }> {
    const git = this.at(localPath);
    for (const key of ['user.name', 'user.email']) {
      let value = '';
      try {
        value = (await git.getConfig(key)).value ?? '';
      } catch {
        value = '';
      }
      if (value === '') {
        throw new Error(
          `Git sem identidade: configure "${key}" (git config --global ${key} "valor") antes de commitar`
        );
      }
    }
    await git.add(['-A']);
    try {
      const summary = await git.commit(message);
      return { commit: summary.commit };
    } catch (e) {
      throw new Error(sanitizeGitOutput(e instanceof Error ? e.message : String(e)));
    }
  }

  /** Remove o último commit local sem apagar nem sobrescrever os arquivos. */
  async undoLastUnsentCommit(localPath: string): Promise<{ branch: string; commit: string }> {
    const git = this.at(localPath);
    const status = await git.status();
    const branch = status.current;
    if (branch == null) throw new Error('Não foi possível identificar a linha de trabalho atual.');
    const upstream = status.tracking ?? `origin/${branch}`;
    const remoteRef = `refs/remotes/${upstream}`;
    const remoteExists = await git.raw(['show-ref', '--verify', '--quiet', remoteRef]).then(() => true, () => false);
    if (remoteExists) {
      const ahead = Number((await git.raw(['rev-list', '--count', `${upstream}..HEAD`])).trim());
      if (!Number.isFinite(ahead) || ahead < 1) throw new Error('A última versão já foi enviada. Use “Reverter” para criar uma nova versão de correção.');
    }
    const commit = (await git.raw(['rev-parse', 'HEAD'])).trim();
    const parent = await git.raw(['rev-parse', '--verify', 'HEAD^']).then((value) => value.trim(), () => {
      throw new Error('Não é possível desfazer a primeira versão deste projeto.');
    });
    await git.reset(['--mixed', parent]);
    return { branch, commit };
  }

  /** Cria um commit de reversão somente quando HEAD está enviado e a pasta está limpa. */
  async revertLastSentCommit(localPath: string): Promise<{ branch: string; commit: string }> {
    const git = this.at(localPath);
    const status = await git.status();
    const branch = status.current;
    if (branch == null) throw new Error('Não foi possível identificar a linha de trabalho atual.');
    if (!status.isClean()) throw new Error('Salve ou revise as alterações locais antes de reverter uma versão enviada.');
    if ((status.ahead ?? 0) > 0) throw new Error('Há versões que ainda não foram enviadas. Envie ou desfaça primeiro a última versão local.');
    if ((status.behind ?? 0) > 0) throw new Error('Baixe as novidades do GitHub antes de reverter.');
    const upstream = status.tracking ?? `origin/${branch}`;
    const remoteRef = `refs/remotes/${upstream}`;
    const remoteExists = await git.raw(['show-ref', '--verify', '--quiet', remoteRef]).then(() => true, () => false);
    if (!remoteExists) throw new Error('Não foi possível confirmar que a última versão está no GitHub.');
    await git.raw(['merge-base', '--is-ancestor', 'HEAD', upstream]).catch(() => {
      throw new Error('Não foi possível confirmar que a versão atual foi enviada ao GitHub.');
    });
    const commit = (await git.raw(['rev-parse', 'HEAD'])).trim();
    try {
      await git.raw(['revert', '--no-edit', 'HEAD']);
    } catch (error) {
      throw new Error(sanitizeGitOutput(error instanceof Error ? error.message : String(error)));
    }
    return { branch, commit };
  }

  /** Push para origin; usa PAT como header HTTP (nunca persiste o token em config/url). */
  async push(localPath: string, token?: string): Promise<{ branch: string }> {
    const remote = await this.getRemoteUrl(localPath);
    if (remote == null) throw new Error('Repositório sem remote origin configurado');
    const branch = (await this.at(localPath).branch()).current;
    if (branch == null || branch === '') throw new Error('Branch atual indefinida (HEAD detached?)');
    const useHeader = token != null && token !== '' && isGithubRemote(remote);
    const git =
      useHeader && token != null
        ? simpleGit({ baseDir: localPath, config: githubAuthConfig(token) })
        : this.at(localPath);
    try {
      await git.push(['-u', 'origin', branch]);
      return { branch };
    } catch (e) {
      throw new Error(sanitizeGitOutput(e instanceof Error ? e.message : String(e)));
    }
  }
}
