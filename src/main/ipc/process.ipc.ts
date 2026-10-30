import { ipcMain } from 'electron';
import type { CommandSpec, IpcResult, LogLine, RunHandle } from '../../shared/types';
import { ProcessRunInputSchema, RepoIdInputSchema } from '../../shared/schemas';
import { IpcChannels } from '../../shared/ipc-channels';
import type { ProcessManager } from '../services/process-manager';
import type { LibraryStore } from '../services/library-store';

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data };
}

function fail(error: unknown): IpcResult<never> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function resolveSpec(
  store: LibraryStore,
  id: string,
  kind: 'install' | 'start' | 'extra',
  extraIndex: number | undefined,
): CommandSpec {
  const repo = store.getRepo(id);
  if (repo == null) throw new Error('Repositório não encontrado');
  if (kind === 'install') {
    if (repo.installCommand == null) throw new Error('Nenhum comando de instalação configurado');
    return repo.installCommand;
  }
  if (kind === 'start') {
    if (repo.startCommand == null) throw new Error('Nenhum comando de início configurado');
    return repo.startCommand;
  }
  const extra = repo.extraCommands?.[extraIndex ?? -1];
  if (extra == null) throw new Error('Comando extra não encontrado');
  return extra.spec;
}

export function registerProcessIpc(manager: ProcessManager, store: LibraryStore): void {
  ipcMain.handle(
    IpcChannels.processRun,
    async (_event, raw: unknown): Promise<IpcResult<RunHandle>> => {
      try {
        const input = ProcessRunInputSchema.parse(raw);
        const spec = resolveSpec(store, input.id, input.kind, input.extraIndex);
        return ok(await manager.run(input.id, input.kind, spec));
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.processStop,
    async (_event, raw: unknown): Promise<IpcResult<null>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        await manager.stop(id);
        return ok(null);
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IpcChannels.processGetLogs,
    async (_event, raw: unknown): Promise<IpcResult<LogLine[]>> => {
      try {
        const { id } = RepoIdInputSchema.parse(raw);
        return ok(manager.getLogs(id));
      } catch (e) {
        return fail(e);
      }
    },
  );
}
