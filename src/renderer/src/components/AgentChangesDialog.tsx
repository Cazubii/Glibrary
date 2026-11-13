import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { AgentRun, GitChangePreview } from '@shared/types';
import { api } from '../lib/api';

interface Props {
  run: AgentRun;
  onClose: () => void;
}

export default function AgentChangesDialog({ run, onClose }: Props): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [preview, setPreview] = useState<GitChangePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    void api.agentRunsGetChanges(run.id).then((result) => {
      if (active) setPreview(result);
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason));
    });
    return () => { active = false; };
  }, [run.id]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="agent-changes-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-steam-elevated bg-steam-panel shadow-2xl">
        <header className="flex items-start gap-3 border-b border-steam-elevated px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id="agent-changes-title" className="text-base font-semibold">O que o agente alterou</h2>
            <p className="mt-1 text-xs text-steam-text/60">{run.profileName} · {run.repoName}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Fechar revisão" className="rounded p-1 text-steam-text/60 hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent">
            <X size={17} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-32 flex-1 space-y-4 overflow-y-auto p-4 sm:p-5">
          {error != null && <p role="alert" className="rounded bg-steam-error/10 p-3 text-sm text-steam-error">Não foi possível carregar as mudanças: {error}</p>}
          {preview == null && error == null && <p role="status" className="text-sm text-steam-text/60">Carregando mudanças…</p>}
          {preview != null && preview.files.length === 0 && <p className="text-sm text-steam-text/60">Essas mudanças já foram salvas ou foram resolvidas. Não há arquivos pendentes para revisar.</p>}
          {preview != null && preview.files.length > 0 && (
            <>
              <section aria-label="Arquivos alterados">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-steam-text/50">{preview.files.length} arquivo(s)</h3>
                <ul className="space-y-1 rounded-lg bg-steam-bg/60 p-2">
                  {preview.files.map((file) => <li key={file.path} className="break-all rounded px-2 py-1.5 font-mono text-xs text-steam-text/80"><span className="mr-2 text-steam-accent">{file.state === 'untracked' ? 'Novo' : file.state === 'staged' ? 'Preparado' : 'Alterado'}</span>{file.path}</li>)}
                </ul>
              </section>
              {preview.truncated && <p role="status" className="rounded bg-steam-warn/10 px-3 py-2 text-xs text-steam-warn">A prévia foi reduzida. O arquivo completo continua intacto no projeto.</p>}
              {preview.diff !== '' && <section aria-label="Resumo das mudanças"><h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-steam-text/50">O que mudou</h3><pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-steam-bg p-3 font-mono text-[11px] leading-5 text-steam-text/80">{preview.diff}</pre></section>}
              {preview.newFiles.map((file) => <section key={file.path} className="overflow-hidden rounded-lg bg-steam-bg"><h3 className="border-b border-steam-elevated px-3 py-2 font-mono text-xs text-steam-accent">{file.path}</h3><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-steam-text/80">{file.content || '(arquivo vazio)'}</pre></section>)}
            </>
          )}
        </div>
        <footer className="flex justify-end border-t border-steam-elevated px-4 py-3 sm:px-5">
          <button type="button" onClick={onClose} className="min-h-9 rounded border border-steam-elevated px-3 text-xs text-steam-text/80 hover:bg-steam-elevated">Fechar</button>
        </footer>
      </section>
    </div>
  );
}
