import { ipcMain, shell } from 'electron';
import { z } from 'zod';
import type {
  GithubCodespace,
  IpcResult,
  TerminalSessionSnapshot,
  TemporaryCheckoutStatus
} from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import {
  TerminalClearInputSchema,
  TerminalCodespaceActionInputSchema,
  TerminalCodespaceCreateInputSchema,
  TerminalCodespacesInputSchema,
  TerminalRepoInputSchema,
  TerminalResizeInputSchema,
  TerminalSessionInputSchema,
  TerminalStartInputSchema,
  TerminalTempCleanupInputSchema,
  TerminalWriteInputSchema
} from '../../shared/schemas';
import type { LibraryStore } from '../services/library-store';
import type { CodespaceChoices, CodespaceService } from '../services/codespace-service';
import type { TemporaryCheckoutService } from '../services/temporary-checkout';
import type { TerminalManager } from '../services/terminal-manager';

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues.map((issue) => issue.message).join('; ') };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message.slice(0, 500) };
}

function requireRepo(store: LibraryStore, repoId: string) {
  const repo = store.getRepo(repoId);
  if (!repo) throw new Error('Repositório não encontrado.');
  return repo;
}

export function registerTerminalIpc(
  store: LibraryStore,
  manager: TerminalManager,
  codespaces: CodespaceService,
  temporaryCheckouts: TemporaryCheckoutService
): void {
  ipcMain.handle(IpcChannels.terminalList, async (_event, raw: unknown): Promise<IpcResult<TerminalSessionSnapshot[]>> => {
    try {
      const { repoId } = TerminalRepoInputSchema.parse(raw);
      requireRepo(store, repoId);
      return ok(manager.list(repoId));
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalStart, async (_event, raw: unknown): Promise<IpcResult<TerminalSessionSnapshot>> => {
    try {
      const input = TerminalStartInputSchema.parse(raw);
      requireRepo(store, input.repoId);
      return ok(await manager.start(input));
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalWrite, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const input = TerminalWriteInputSchema.parse(raw);
      manager.write(input.sessionId, input.data);
      return ok(null);
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalResize, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const input = TerminalResizeInputSchema.parse(raw);
      manager.resize(input.sessionId, input.cols, input.rows);
      return ok(null);
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalClose, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { sessionId } = TerminalSessionInputSchema.parse(raw);
      await manager.close(sessionId);
      return ok(null);
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalClear, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { sessionId } = TerminalClearInputSchema.parse(raw);
      manager.clear(sessionId);
      return ok(null);
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalCodespacesList, async (_event, raw: unknown): Promise<IpcResult<CodespaceChoices>> => {
    try {
      const { repoId } = TerminalCodespacesInputSchema.parse(raw);
      return ok(await codespaces.listForRepo(requireRepo(store, repoId)));
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalCodespaceStart, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const input = TerminalCodespaceActionInputSchema.parse(raw);
      await codespaces.start(requireRepo(store, input.repoId), input.codespaceName);
      return ok(null);
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalCodespaceStop, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const input = TerminalCodespaceActionInputSchema.parse(raw);
      await codespaces.stop(requireRepo(store, input.repoId), input.codespaceName);
      return ok(null);
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalCodespaceCreate, async (_event, raw: unknown): Promise<IpcResult<GithubCodespace>> => {
    try {
      const input = TerminalCodespaceCreateInputSchema.parse(raw);
      return ok(await codespaces.create(requireRepo(store, input.repoId), input.machine));
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalTempStatus, async (_event, raw: unknown): Promise<IpcResult<TemporaryCheckoutStatus>> => {
    try {
      const { repoId } = TerminalRepoInputSchema.parse(raw);
      requireRepo(store, repoId);
      return ok(await temporaryCheckouts.status(repoId));
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalTempCleanup, async (_event, raw: unknown): Promise<IpcResult<TemporaryCheckoutStatus>> => {
    try {
      const { repoId } = TerminalTempCleanupInputSchema.parse(raw);
      requireRepo(store, repoId);
      return ok(await temporaryCheckouts.cleanup(repoId));
    } catch (error) { return fail(error); }
  });

  ipcMain.handle(IpcChannels.terminalTempOpen, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { repoId } = TerminalRepoInputSchema.parse(raw);
      requireRepo(store, repoId);
      const status = await temporaryCheckouts.status(repoId);
      if (!status.exists || !status.path) throw new Error('Checkout temporário não encontrado.');
      shell.showItemInFolder(status.path);
      return ok(null);
    } catch (error) { return fail(error); }
  });
}
