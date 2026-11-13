import { ipcMain } from 'electron';
import { translateError } from '../services/error-translator';
import type { GitBranchList } from '../../shared/git-branches';
import type {
  DevWorkspaceCloseResult,
  DevWorkspaceOpenResult,
  DevWorkspaceStatus,
  IpcResult
} from '../../shared/types';
import {
  DevWorkspaceBranchInputSchema,
  DevWorkspaceCreateBranchInputSchema,
  DevWorkspaceOpenInputSchema,
  DevWorkspaceRepoInputSchema,
  DevWorkspacePushInputSchema
} from '../../shared/schemas';
import { IpcChannels } from '../../shared/ipc-channels';
import type { DevWorkspaceManager } from '../services/dev-workspace';
import type { LibraryStore } from '../services/library-store';
import type { TerminalManager } from '../services/terminal-manager';

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: translateError(error) };
}

export function registerDevWorkspaceIpc(
  store: LibraryStore,
  manager: DevWorkspaceManager,
  terminals: TerminalManager
): void {
  ipcMain.handle(IpcChannels.devWorkspaceOpen, async (_event, raw: unknown): Promise<IpcResult<DevWorkspaceOpenResult>> => {
    const parsed = DevWorkspaceOpenInputSchema.safeParse(raw);
    if (!parsed.success) return fail(new Error('Parâmetros inválidos para abrir a área de desenvolvimento.'));
    try {
      const repo = store.getRepo(parsed.data.repoId);
      if (repo == null) return fail(new Error('Repositório não encontrado na biblioteca.'));
      return ok(await manager.ensureWorkspace(repo, parsed.data.branch));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IpcChannels.devWorkspaceClose, async (_event, raw: unknown): Promise<IpcResult<DevWorkspaceCloseResult>> => {
    const parsed = DevWorkspaceRepoInputSchema.safeParse(raw);
    if (!parsed.success) return fail(new Error('Parâmetros inválidos para encerrar a área de desenvolvimento.'));
    try {
      const repo = store.getRepo(parsed.data.repoId);
      if (repo?.devSession != null) terminals.killForCwd(repo.devSession.workspacePath);
      return ok(await manager.closeWorkspace(parsed.data.repoId));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IpcChannels.devWorkspaceStatus, async (_event, raw: unknown): Promise<IpcResult<DevWorkspaceStatus>> => {
    const parsed = DevWorkspaceRepoInputSchema.safeParse(raw);
    if (!parsed.success) return fail(new Error('Parâmetros inválidos para consultar o workspace.'));
    try {
      return ok(await manager.statusForRepo(parsed.data.repoId));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IpcChannels.devWorkspaceBranches, async (_event, raw: unknown): Promise<IpcResult<GitBranchList>> => {
    const parsed = DevWorkspaceRepoInputSchema.safeParse(raw);
    if (!parsed.success) return fail(new Error('Parâmetros inválidos para listar branches.'));
    try {
      return ok(await manager.listBranches(parsed.data.repoId));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IpcChannels.devWorkspaceSwitchBranch, async (_event, raw: unknown): Promise<IpcResult<{ branch: string }>> => {
    const parsed = DevWorkspaceBranchInputSchema.safeParse(raw);
    if (!parsed.success) return fail(new Error('Parâmetros inválidos para trocar de branch.'));
    try {
      return ok(await manager.switchBranch(parsed.data.repoId, parsed.data.branch));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IpcChannels.devWorkspaceCreateBranch, async (_event, raw: unknown): Promise<IpcResult<{ branch: string }>> => {
    const parsed = DevWorkspaceCreateBranchInputSchema.safeParse(raw);
    if (!parsed.success) return fail(new Error('Parâmetros inválidos para criar branch.'));
    try {
      return ok(await manager.createBranch(parsed.data.repoId, parsed.data.name, parsed.data.defaultBranch));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IpcChannels.devWorkspaceSync, async (_event, raw: unknown): Promise<IpcResult<{ updated: boolean; summary: string; status: DevWorkspaceStatus }>> => {
    const parsed = DevWorkspaceRepoInputSchema.safeParse(raw);
    if (!parsed.success) return fail(new Error('Parâmetros inválidos para sincronizar o workspace.'));
    try {
      return ok(await manager.sync(parsed.data.repoId));
    } catch (error) {
      return fail(error);
    }
  });

  ipcMain.handle(IpcChannels.devWorkspacePush, async (_event, raw: unknown): Promise<IpcResult<{ branch: string; status: DevWorkspaceStatus }>> => {
    const parsed = DevWorkspacePushInputSchema.safeParse(raw);
    if (!parsed.success) return fail(new Error('Parâmetros inválidos para enviar alterações.'));
    try {
      return ok(await manager.push(parsed.data.repoId, parsed.data.confirmProtectedBranch));
    } catch (error) {
      return fail(error);
    }
  });
}
