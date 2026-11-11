import {
  simpleGit,
  type SimpleGit,
  type SimpleGitProgressEvent,
  type PullResult
} from 'simple-git';
import { join } from 'path';
import type { GitBranchList, LocalBranchSummary, RemoteBranchSummary } from '../../shared/git-branches';

/** Indica se o remote usa GitHub em HTTP ou SSH. */
export function isGithubRemote(remoteUrl: string): boolean {
  return /^https:\/\/(www\.)?github\.com\//i.test(remoteUrl) || /^git@github\.com:/i.test(remoteUrl);
}

/** Valor do header HTTP Basic para PAT do GitHub. */
export function githubAuthHeader(token: string): string {
  return `Authorization: basic ${Buffer.from(`x-access-token:${token}`).toString('base64')}`;
}

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
        ? { config: ['-c', `http.extraHeader=${githubAuthHeader(token)}`] }
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
    await git.fetch(['--all', '--prune', '--quiet']).catch(() => undefined);
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
    const [localResult, remoteResult] = await Promise.all([git.branchLocal(), git.branch(['-r'])]);
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
}
