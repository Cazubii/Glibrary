import { ipcMain } from 'electron';
import type { GitBranchList } from '../../shared/git-branches';
import {
  BranchCheckoutInputSchema,
  BranchCreateInputSchema,
  BranchesListInputSchema
} from '../../shared/git-branches';
import type { ProjectRepoPage } from '../../shared/github-projects';
import { ListAccountReposInputSchema } from '../../shared/github-projects';
import type { IpcResult } from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from '../services/library-store';
import { decodeToken, fetchJson } from '../services/github-api';
import type { GitService } from '../services/git-service';
import { loadAccountRepos } from '../services/github-projects';

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

/** Lista repositórios da conta e operações de branch em clones locais. */
export function registerProjectsIpc(store: LibraryStore, git: GitService): void {
  const localRepoPath = (id: string): string => {
    const repo = store.getRepo(id);
    if (repo == null) throw new Error('Repositório não encontrado na biblioteca.');
    if (repo.localPath == null || repo.localPath === '') {
      throw new Error('Clonar primeiro para trabalhar com branches.');
    }
    return repo.localPath;
  };

  ipcMain.handle(
    IpcChannels.projectsList,
    async (_event, raw: unknown): Promise<IpcResult<ProjectRepoPage>> => {
      const parsed = ListAccountReposInputSchema.safeParse(raw ?? {});
      if (!parsed.success) return fail(new Error('Parâmetros inválidos para listar repositórios.'));
      const token = decodeToken(store.getSettings().githubToken);
      return loadAccountRepos(fetchJson, { ...parsed.data, token });
    }
  );

  ipcMain.handle(
    IpcChannels.branchesList,
    async (_event, raw: unknown): Promise<IpcResult<GitBranchList>> => {
      const parsed = BranchesListInputSchema.safeParse(raw);
      if (!parsed.success) return fail(new Error('Parâmetros inválidos para listar branches.'));
      try {
        return ok(await git.listBranches(localRepoPath(parsed.data.id)));
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IpcChannels.branchCreate,
    async (_event, raw: unknown): Promise<IpcResult<{ branch: string }>> => {
      const parsed = BranchCreateInputSchema.safeParse(raw);
      if (!parsed.success) return fail(new Error('Parâmetros inválidos para criar branch.'));
      try {
        const { id, name, defaultBranch } = parsed.data;
        await git.createBranch(localRepoPath(id), name, defaultBranch);
        return ok({ branch: name });
      } catch (error) {
        return fail(error);
      }
    }
  );

  ipcMain.handle(
    IpcChannels.branchCheckout,
    async (_event, raw: unknown): Promise<IpcResult<{ branch: string }>> => {
      const parsed = BranchCheckoutInputSchema.safeParse(raw);
      if (!parsed.success) return fail(new Error('Parâmetros inválidos para trocar de branch.'));
      try {
        const { id, branch } = parsed.data;
        return ok({ branch: await git.checkoutBranch(localRepoPath(id), branch) });
      } catch (error) {
        return fail(error);
      }
    }
  );
}
