import { useCallback, useState } from 'react';
import type { ProjectRef, UserTool } from '@shared/types';
import { api } from '../lib/api';

export interface PendingToolRun {
  tool: UserTool;
  project: ProjectRef;
}

type Stage =
  | { state: 'confirm' }
  | { state: 'running' }
  | { state: 'result'; output: string; code: number; started: boolean };

/** Confirma, executa a ferramenta no projeto e mostra a saída capturada. */
export default function UserToolRunDialog({
  pending,
  onClose,
  onError,
  onSuccess
}: {
  pending: PendingToolRun;
  onClose: () => void;
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}): React.JSX.Element {
  const [stage, setStage] = useState<Stage>({ state: 'confirm' });

  const run = useCallback(async (): Promise<void> => {
    setStage({ state: 'running' });
    try {
      const result = await api.userToolRun(pending.tool.id, pending.project.id);
      if (result.started) {
        onSuccess?.(`"${pending.tool.name}" iniciado em processo independente`);
        onClose();
        return;
      }
      setStage({ state: 'result', output: result.output ?? '', code: result.code ?? 0, started: false });
    } catch (e) {
      onClose();
      onError(e instanceof Error ? e.message : String(e));
    }
  }, [pending, onClose, onError, onSuccess]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={() => stage.state !== 'running' && onClose()}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg bg-steam-panel p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Executar ferramenta"
      >
        {stage.state === 'confirm' && (
          <>
            <h2 className="mb-1 text-lg font-bold">{pending.tool.name}</h2>
            <p className="mb-3 text-sm text-steam-text/60">
              O comando abaixo vai rodar no terminal embutido da aplicação, dentro da pasta do projeto:
            </p>
            <p className="mb-1 truncate rounded bg-steam-bg px-3 py-2 font-mono text-xs" title={pending.tool.command}>
              {pending.tool.command}
            </p>
            <p className="mb-4 text-xs text-steam-text/40">Pasta: {pending.project.localPath}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="rounded bg-steam-elevated px-4 py-2 text-sm hover:bg-steam-accent/20">
                Cancelar
              </button>
              <button type="button" onClick={() => void run()} className="rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg">
                Executar
              </button>
            </div>
          </>
        )}

        {stage.state === 'running' && (
          <p className="flex items-center gap-2 py-8 text-sm text-steam-text/60">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-steam-accent border-t-transparent" />
            Executando… (processos longos encerram automaticamente em 3 min)
          </p>
        )}

        {stage.state === 'result' && (
          <>
            <h2 className="mb-1 text-lg font-bold">
              {stage.code === 0 ? 'Concluído' : `Finalizado com código ${stage.code}`}
            </h2>
            <pre className="mb-4 max-h-96 flex-1 overflow-y-auto whitespace-pre-wrap rounded bg-steam-bg p-3 font-mono text-xs text-steam-text/80">
              {stage.output.trim() === '' ? '(sem saída)' : stage.output}
            </pre>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="rounded bg-steam-elevated px-4 py-2 text-sm hover:bg-steam-accent/20">
                Fechar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
