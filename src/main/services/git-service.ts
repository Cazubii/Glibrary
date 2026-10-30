import {
  simpleGit,
  type SimpleGit,
  type SimpleGitProgressEvent,
  type PullResult
} from 'simple-git';
import { join } from 'path';

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
  ): Promise<string> {
    if (this.clones.has(repoId)) throw new Error('Clone já em andamento');
    const target = join(destParent, name);
    const git: SimpleGit = simpleGit({
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
}
