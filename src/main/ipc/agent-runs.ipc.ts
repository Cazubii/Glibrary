import { ipcMain } from 'electron';
import { translateError } from '../services/error-translator';
import type { AgentProfile, AgentRun, IpcResult, LogLine } from '../../shared/types';
import {
  AgentIdInputSchema,
  AgentProfileInputSchema,
  AgentProfileUpdateInputSchema,
  AgentRunStartInputSchema
} from '../../shared/schemas';
import { IpcChannels } from '../../shared/ipc-channels';
import type { AgentRunManager } from '../services/agent-run-manager';
import type { LibraryStore } from '../services/library-store';

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: translateError(error) };
}

export function registerAgentRunsIpc(store: LibraryStore, manager: AgentRunManager): void {
  ipcMain.handle(IpcChannels.agentProfilesList, async (): Promise<IpcResult<AgentProfile[]>> => {
    try { return ok(store.listAgentProfiles()); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentProfilesCreate, async (_event, raw: unknown): Promise<IpcResult<AgentProfile>> => {
    try {
      const input = AgentProfileInputSchema.parse(raw);
      if (store.getRepo(input.repoId) == null) throw new Error('Repositório não encontrado');
      return ok(await store.addAgentProfile(input));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentProfilesUpdate, async (_event, raw: unknown): Promise<IpcResult<AgentProfile>> => {
    try {
      const { id, patch } = AgentProfileUpdateInputSchema.parse(raw);
      if (patch.repoId != null && store.getRepo(patch.repoId) == null) throw new Error('Repositório não encontrado');
      return ok(await store.updateAgentProfile(id, patch));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentProfilesRemove, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { id } = AgentIdInputSchema.parse(raw);
      if (manager.hasActiveRunsForProfile(id)) {
        throw new Error('Pare as execuções ativas deste perfil antes de removê-lo');
      }
      await store.removeAgentProfile(id);
      return ok(null);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentRunsStart, async (_event, raw: unknown): Promise<IpcResult<AgentRun>> => {
    try {
      const input = AgentRunStartInputSchema.parse(raw);
      return ok(await manager.start(input.profileId, input.prompt));
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentRunsStop, async (_event, raw: unknown): Promise<IpcResult<null>> => {
    try {
      const { id } = AgentIdInputSchema.parse(raw);
      await manager.stop(id);
      return ok(null);
    } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentRunsList, async (): Promise<IpcResult<AgentRun[]>> => {
    try { return ok(manager.listRuns()); } catch (e) { return fail(e); }
  });

  ipcMain.handle(IpcChannels.agentRunsGetLogs, async (_event, raw: unknown): Promise<IpcResult<LogLine[]>> => {
    try {
      const { id } = AgentIdInputSchema.parse(raw);
      return ok(manager.getLogs(id));
    } catch (e) { return fail(e); }
  });
}
