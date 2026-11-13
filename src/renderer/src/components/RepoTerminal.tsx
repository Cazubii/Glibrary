import { useCallback, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import type { TerminalSessionSummary } from '@shared/types';
import TerminalSessionView from './TerminalSessionView';
import { terminalCwdKey, useTerminalsStore } from '../store/terminals';

interface Props {
  cwd: string;
  onActivity?: () => void;
  onClose?: () => void;
}

export default function RepoTerminal({ cwd, onActivity, onClose }: Props): React.JSX.Element | null {
  const group = useTerminalsStore((state) => {
    const key = terminalCwdKey(cwd);
    return state.groups[key] ?? Object.values(state.groups).find((item) => terminalCwdKey(item.cwd) === key);
  });
  const openPanel = useTerminalsStore((state) => state.openPanel);
  const hidePanel = useTerminalsStore((state) => state.hidePanel);
  const createTerminal = useTerminalsStore((state) => state.createTerminal);
  const selectTerminal = useTerminalsStore((state) => state.selectTerminal);
  const closeTerminal = useTerminalsStore((state) => state.closeTerminal);
  const markExited = useTerminalsStore((state) => state.markExited);
  const onExit = useCallback((id: string, exitCode: number) => markExited(id, exitCode), [markExited]);
  const closePanel = useCallback(() => {
    hidePanel(cwd);
    onClose?.();
  }, [cwd, hidePanel, onClose]);

  useEffect(() => {
    void openPanel(cwd);
  }, [cwd, openPanel]);

  if (group != null && !group.panelOpen) return null;

  const sessions: TerminalSessionSummary[] = group?.sessions ?? [];
  const active = sessions.find((session) => session.id === group?.activeId);
  const loading = group?.loading ?? true;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-steam-elevated bg-[#1b202b]" aria-label="Terminais do projeto">
      <div className="flex min-h-10 items-center gap-2 border-b border-steam-elevated bg-steam-panel px-2">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto" role="tablist" aria-label="Sessões do terminal">
          {sessions.map((session) => (
            <div key={session.id} className="flex shrink-0 items-center rounded-t border border-b-0 border-steam-elevated bg-steam-panel">
              <button
                type="button"
                role="tab"
                aria-selected={session.id === group?.activeId}
                aria-label={`${session.name}${session.status === 'exited' ? ', encerrado' : ''}`}
                onClick={() => selectTerminal(cwd, session.id)}
                className={`min-h-8 max-w-48 truncate px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-steam-accent ${
                  session.id === group?.activeId ? 'text-steam-accent' : 'text-steam-text/70 hover:text-steam-text'
                }`}
              >
                {session.name}
                {session.status === 'exited' && <span className="ml-2 text-steam-warn">Encerrado</span>}
              </button>
              <button
                type="button"
                onClick={() => void closeTerminal(cwd, session.id)}
                className="mr-1 rounded p-1 text-steam-text/50 transition-colors hover:bg-steam-elevated hover:text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
                aria-label={`Fechar ${session.name}`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void createTerminal(cwd)}
          disabled={loading}
          className="inline-flex min-h-8 shrink-0 items-center justify-center rounded px-2 text-steam-text/75 transition-colors hover:bg-steam-elevated hover:text-steam-text disabled:cursor-wait disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
          aria-label="Novo terminal"
          title="Novo terminal"
        >
          <Plus size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={closePanel}
          className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded px-2 text-xs text-steam-text/65 transition-colors hover:bg-steam-elevated hover:text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
          aria-label="Fechar painel do terminal"
          title="Fechar painel"
        >
          Fechar painel <X size={13} aria-hidden="true" />
        </button>
      </div>

      {group?.error != null && <div className="bg-steam-error/15 px-3 py-1.5 text-xs text-steam-error" role="alert">{group.error}</div>}
      {active != null ? (
        <TerminalSessionView
          key={active.id}
          session={active}
          onExit={onExit}
          onClosePanel={closePanel}
          onActivity={onActivity}
        />
      ) : loading ? (
        <div className="flex min-h-48 flex-1 items-center justify-center text-xs text-steam-text/55" role="status">
          Carregando terminais…
        </div>
      ) : (
        <div className="flex min-h-48 flex-1 flex-col items-center justify-center gap-3 text-sm text-steam-text/60">
          <span>Nenhum terminal aberto</span>
          <button
            type="button"
            onClick={() => void createTerminal(cwd)}
            className="rounded border border-steam-elevated px-3 py-2 text-xs text-steam-text transition-colors hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
          >
            Novo terminal
          </button>
        </div>
      )}
    </section>
  );
}
