import { createHash } from 'crypto';
import { access, mkdir, rm } from 'fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'path';
import { simpleGit, type SimpleGit } from 'simple-git';
import type { GitBranchList } from '../../shared/git-branches';
import type {
  DevSession,
  DevWorkspaceCloseResult,
  DevWorkspaceOpenResult,
  DevWorkspaceStatus,
  Repo
} from '../../shared/types';
import { isSafeDirectoryName } from '../../shared/validators';
import { assertProtectedBranchPush } from './git-protection';
import { getGithubAccessToken } from './github-oauth';
import { GitService, githubAuthHeader, isGithubRemote, sanitizeGitOutput } from './git-service';
import type { LibraryStore } from './library-store';

export interface DevWorkspaceExecutor {
  exists(path: string): Promise<boolean>;
  isRepository(path: string): Promise<boolean>;
  makeDirectory(path: string): Promise<void>;
  remove(path: string): Promise<void>;
  clone(repoId: string, remoteUrl: string, target: string): Promise<void>;
  currentBranch(path: string): Promise<string | null>;
  checkoutBranch(path: string, branch: string): Promise<string>;
  createBranch(path: string, name: string, defaultBranch: string): Promise<void>;
  listBranches(path: string): Promise<GitBranchList>;
  statusPorcelain(path: string): Promise<string>;
  pullRebase(path: string): Promise<{ updated: boolean; summary: string }>;
  push(path: string): Promise<{ branch: string }>;
}

export function parseDevWorkspaceStatus(output: string): DevWorkspaceStatus {
  const lines = output.split(/\r?\n/).filter((line) => line !== '');
  const header = lines.find((line) => line.startsWith('## '));
  if (header == null) {
    return { branch: null, changes: lines.length, ahead: 0, behind: 0 };
  }

  const tracking = header.slice(3);
  const branchText = tracking.split('...')[0] ?? '';
  const branch = branchText.replace(/^No commits yet on /, '').trim() || null;
  const ahead = Number(tracking.match(/\bahead (\d+)\b/)?.[1] ?? 0);
  const behind = Number(tracking.match(/\bbehind (\d+)\b/)?.[1] ?? 0);
  const changes = lines.filter((line) => !line.startsWith('## ')).length;

  return { branch, changes, ahead, behind };
}

function samePath(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === 'win32'
    ? a.toLocaleLowerCase('en-US') === b.toLocaleLowerCase('en-US')
    : a === b;
}

function pathInside(root: string, candidate: string): boolean {
  const rootPath = resolve(root);
  const candidatePath = resolve(candidate);
  const child = relative(rootPath, candidatePath);
  return child !== '' && child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

function workspaceSlug(repo: Repo): string {
  const source = `${repo.owner ?? 'repo'}-${repo.name}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, 100);
  if (source !== '' && isSafeDirectoryName(source)) return source;
  const suffix = createHash('sha256').update(repo.remoteUrl ?? repo.id).digest('hex').slice(0, 10);
  return `repo-${suffix}`;
}

function userFacingError(error: unknown): Error {
  const raw = error instanceof Error ? error.message : String(error);
  if (/ENOSPC|no space left|not enough space|disk full|espa[cç]o.*disco/i.test(raw)) {
    return new Error('Espaço em disco insuficiente para preparar o workspace.');
  }
  return new Error(sanitizeGitOutput(raw));
}

class NodeDevWorkspaceExecutor implements DevWorkspaceExecutor {
  constructor(
    private readonly git: GitService,
    private readonly token: () => Promise<string | undefined>
  ) {}

  async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  async isRepository(path: string): Promise<boolean> {
    try {
      return await this.at(path).checkIsRepo();
    } catch {
      return false;
    }
  }

  async makeDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async remove(path: string): Promise<void> {
    await rm(path, { recursive: true, force: true });
  }

  async clone(repoId: string, remoteUrl: string, target: string): Promise<void> {
    const name = basename(target);
    await this.git.clone(repoId, remoteUrl, dirname(target), name, () => undefined, await this.token());
  }

  async currentBranch(path: string): Promise<string | null> {
    return this.git.getCurrentBranch(path);
  }

  async checkoutBranch(path: string, branch: string): Promise<string> {
    return this.git.checkoutBranch(path, branch);
  }

  async createBranch(path: string, name: string, defaultBranch: string): Promise<void> {
    await this.git.createBranch(path, name, defaultBranch);
  }

  async listBranches(path: string): Promise<GitBranchList> {
    const git = await this.authenticatedAt(path);
    await git.fetch(['--all', '--prune', '--quiet']).catch(() => undefined);
    const [localResult, remoteResult] = await Promise.all([git.branchLocal(), git.branch(['-r'])]);
    const local = localResult.all
      .map((name) => ({ name, current: name === localResult.current }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const remote = remoteResult.all
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

  async statusPorcelain(path: string): Promise<string> {
    return this.at(path).raw(['status', '--porcelain', '-b']);
  }

  async pullRebase(path: string): Promise<{ updated: boolean; summary: string }> {
    const git = await this.authenticatedAt(path);
    const before = (await git.revparse('HEAD')).trim();
    const output = await git.raw(['pull', '--rebase']);
    const after = (await git.revparse('HEAD')).trim();
    return {
      updated: before !== after,
      summary: output.trim() || (before === after ? 'Já estava atualizado.' : 'Sincronização concluída.')
    };
  }

  async push(path: string): Promise<{ branch: string }> {
    return this.git.push(path, await this.token());
  }

  private at(path: string): SimpleGit {
    return simpleGit({ baseDir: path });
  }

  private async authenticatedAt(path: string): Promise<SimpleGit> {
    const remoteUrl = await this.git.getRemoteUrl(path);
    const token = await this.token();
    if (remoteUrl != null && isGithubRemote(remoteUrl) && token != null && token !== '') {
      return simpleGit({ baseDir: path, config: ['-c', `http.extraHeader=${githubAuthHeader(token)}`] });
    }
    return this.at(path);
  }
}

/** Prepara e mantém a sessão de desenvolvimento de cada repositório. */
export class DevWorkspaceManager {
  private readonly workspacesRoot: string;
  private readonly executor: DevWorkspaceExecutor;

  constructor(
    private readonly store: LibraryStore,
    workspacesRoot: string,
    executor?: DevWorkspaceExecutor
  ) {
    this.workspacesRoot = resolve(workspacesRoot);
    this.executor = executor ?? new NodeDevWorkspaceExecutor(
      new GitService(),
      () => getGithubAccessToken(this.store)
    );
  }

  async ensureWorkspace(repo: Repo, requestedBranch?: string): Promise<DevWorkspaceOpenResult> {
    if (repo.remoteUrl == null || repo.remoteUrl.trim() === '') {
      throw new Error('Repositório sem URL remota para preparar o workspace.');
    }

    const registeredPath = repo.localPath?.trim() ?? '';
    let workspacePath: string | null = null;
    let reusedManaged = false;
    let shouldClone = false;

    if (registeredPath !== '' && await this.executor.exists(registeredPath)) {
      workspacePath = resolve(registeredPath);
      if (!await this.executor.isRepository(workspacePath)) {
        throw new Error('A pasta local cadastrada não contém um repositório Git válido.');
      }
    } else {
      const previousPath = repo.devSession?.workspacePath;
      if (
        previousPath != null &&
        (pathInside(this.workspacesRoot, previousPath) || samePath(previousPath, registeredPath)) &&
        await this.executor.exists(previousPath) &&
        await this.executor.isRepository(previousPath)
      ) {
        workspacePath = resolve(previousPath);
        reusedManaged = pathInside(this.workspacesRoot, workspacePath);
      } else {
        workspacePath = resolve(this.workspacesRoot, workspaceSlug(repo));
        if (await this.executor.exists(workspacePath)) {
          if (!await this.executor.isRepository(workspacePath)) {
            throw new Error('Já existe uma pasta de workspace com este nome, mas ela não contém um repositório Git.');
          }
          reusedManaged = true;
        } else {
          shouldClone = true;
        }
      }
    }

    if (workspacePath == null) throw new Error('Não foi possível escolher uma pasta para o workspace.');

    try {
      if (shouldClone) {
        await this.executor.makeDirectory(dirname(workspacePath));
        await this.executor.clone(repo.id, repo.remoteUrl, workspacePath);
        reusedManaged = false;
      }

      const requested = requestedBranch?.trim() ?? '';
      const current = await this.executor.currentBranch(workspacePath);
      const actualBranch = requested === ''
        ? current
        : current === requested
          ? current
          : await this.executor.checkoutBranch(workspacePath, requested);
      if (actualBranch == null || actualBranch === '') {
        throw new Error('O repositório não informou uma branch atual. Selecione uma branch para continuar.');
      }

      const currentRepo = this.store.getRepo(repo.id);
      if (currentRepo == null) throw new Error('Repositório não encontrado na biblioteca.');
      const devSession: DevSession = {
        startedAt: currentRepo.devSession?.startedAt ?? new Date().toISOString(),
        branch: actualBranch,
        workspacePath
      };
      await this.store.updateRepo(repo.id, { devSession });

      return { workspacePath, reusedManaged, branch: actualBranch };
    } catch (error) {
      if (shouldClone) await this.executor.remove(workspacePath).catch(() => undefined);
      throw userFacingError(error);
    }
  }

  async closeWorkspace(repoId: string): Promise<DevWorkspaceCloseResult> {
    const repo = this.requireRepo(repoId);
    const workspacePath = repo.devSession?.workspacePath ?? null;
    const registeredPath = repo.localPath ?? '';
    let removed = false;

    if (
      workspacePath != null &&
      pathInside(this.workspacesRoot, workspacePath) &&
      !samePath(workspacePath, registeredPath)
    ) {
      await this.executor.remove(workspacePath);
      removed = true;
    }

    if (repo.devSession != null) await this.store.updateRepo(repoId, { devSession: null });
    return { workspacePath, removed };
  }

  isBeingEdited(repoId: string): boolean {
    return this.store.getRepo(repoId)?.devSession != null;
  }

  async status(workspacePath: string): Promise<DevWorkspaceStatus> {
    try {
      if (!await this.executor.isRepository(workspacePath)) {
        throw new Error('A pasta da sessão não contém um repositório Git válido.');
      }
      return parseDevWorkspaceStatus(await this.executor.statusPorcelain(workspacePath));
    } catch (error) {
      throw userFacingError(error);
    }
  }

  async statusForRepo(repoId: string): Promise<DevWorkspaceStatus> {
    const session = this.requireRepo(repoId).devSession;
    if (session == null) throw new Error('Não há uma sessão de desenvolvimento aberta para este repositório.');
    return this.status(session.workspacePath);
  }

  async listBranches(repoId: string): Promise<GitBranchList> {
    const session = this.requireSession(repoId);
    return this.executor.listBranches(session.workspacePath);
  }

  async switchBranch(repoId: string, branch: string): Promise<{ branch: string }> {
    const session = this.requireSession(repoId);
    const actualBranch = await this.executor.checkoutBranch(session.workspacePath, branch);
    await this.updateBranch(repoId, session, actualBranch);
    return { branch: actualBranch };
  }

  async createBranch(repoId: string, name: string, defaultBranch: string): Promise<{ branch: string }> {
    const session = this.requireSession(repoId);
    await this.executor.createBranch(session.workspacePath, name, defaultBranch);
    const branch = await this.executor.currentBranch(session.workspacePath);
    if (branch == null || branch === '') throw new Error('A branch foi criada, mas não foi possível confirmar a branch atual.');
    await this.updateBranch(repoId, session, branch);
    return { branch };
  }

  async sync(repoId: string): Promise<{ updated: boolean; summary: string; status: DevWorkspaceStatus }> {
    const session = this.requireSession(repoId);
    const result = await this.executor.pullRebase(session.workspacePath);
    return { ...result, status: await this.status(session.workspacePath) };
  }

  async push(repoId: string, confirmProtectedBranch = false): Promise<{ branch: string; status: DevWorkspaceStatus }> {
    const session = this.requireSession(repoId);
    const branch = await this.executor.currentBranch(session.workspacePath);
    assertProtectedBranchPush(branch, !this.store.getSettings().showAdvancedResources, confirmProtectedBranch);
    const result = await this.executor.push(session.workspacePath);
    return { ...result, status: await this.status(session.workspacePath) };
  }

  private requireRepo(repoId: string): Repo {
    const repo = this.store.getRepo(repoId);
    if (repo == null) throw new Error('Repositório não encontrado na biblioteca.');
    return repo;
  }

  private requireSession(repoId: string): DevSession {
    const session = this.requireRepo(repoId).devSession;
    if (session == null) throw new Error('Abra a área de desenvolvimento antes de operar neste workspace.');
    return session;
  }

  private async updateBranch(repoId: string, session: DevSession, branch: string): Promise<void> {
    await this.store.updateRepo(repoId, {
      devSession: { ...session, branch }
    });
  }
}
