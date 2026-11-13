import { Clipboard, Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { GitChangePreview } from '@shared/types';

interface Props {
  preview: GitChangePreview;
  message: string;
  busy: boolean;
  onMessageChange: (message: string) => void;
  onClose: () => void;
  onCommit: (revision: string) => void;
}

export default function GitReviewDialog({ preview, message, busy, onMessageChange, onClose, onCommit }: Props): React.JSX.Element {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [busy, onClose]);

  const copyAgentRequest = async (): Promise<void> => {
    const newFiles = preview.newFiles.map((file) => `\n## ${file.path}\n${file.content}`).join('\n');
    const request = [
      'Leia as mudanças abaixo e sugira uma mensagem curta de commit em português. Não altere nenhum arquivo.',
      `Arquivos: ${preview.files.map((file) => file.path).join(', ')}`,
      preview.diff,
      newFiles
    ].join('\n\n').slice(0, 30_000);
    try {
      await navigator.clipboard.writeText(request);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3 sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="git-review-title" className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-steam-elevated bg-steam-panel shadow-2xl">
        <header className="flex items-start gap-3 border-b border-steam-elevated px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id="git-review-title" className="text-base font-semibold">Revise as mudanças antes de salvar</h2>
            <p className="mt-1 text-xs text-steam-text/60">{preview.files.length} arquivo(s) serão incluídos nesta versão.</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} disabled={busy} aria-label="Cancelar revisão" className="rounded p-1 text-steam-text/60 hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:opacity-50">
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:grid-cols-[minmax(13rem,0.8fr)_minmax(0,1.5fr)] sm:p-5">
          <section aria-label="Arquivos alterados" className="min-w-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-steam-text/50">Arquivos</h3>
            <ul className="space-y-1 rounded-lg bg-steam-bg/60 p-2">
              {preview.files.map((file) => (
                <li key={`${file.path}-${file.state}`} className="break-all rounded px-2 py-1.5 font-mono text-xs text-steam-text/80">
                  <span className="mr-2 text-steam-accent">{file.state === 'untracked' ? 'Novo' : file.state === 'staged' ? 'Preparado' : 'Alterado'}</span>
                  {file.path}
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => void copyAgentRequest()} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded border border-steam-elevated px-3 text-xs text-steam-text/80 hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent">
              <Clipboard size={13} aria-hidden="true" /> {copied ? 'Pedido copiado' : 'Copiar pedido para o agente'}
            </button>
            <p className="mt-1 text-[11px] text-steam-text/45">Cole o pedido no agente para receber uma sugestão de mensagem.</p>
          </section>

          <section aria-label="Diff das alterações" className="min-w-0">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-steam-text/50">O que mudou</h3>
            {preview.truncated && <p role="status" className="mb-2 rounded bg-steam-warn/10 px-3 py-2 text-xs text-steam-warn">A prévia foi reduzida; o salvamento continua incluindo os arquivos completos.</p>}
            <div className="space-y-3">
              {preview.diff !== '' && <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-steam-bg p-3 font-mono text-[11px] leading-5 text-steam-text/80">{preview.diff}</pre>}
              {preview.newFiles.map((file) => (
                <section key={file.path} className="overflow-hidden rounded-lg bg-steam-bg">
                  <h4 className="border-b border-steam-elevated px-3 py-2 font-mono text-xs text-steam-accent">{file.path}</h4>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-[11px] leading-5 text-steam-text/80">{file.binary ? file.content : file.content || '(arquivo vazio)'}</pre>
                </section>
              ))}
              {preview.diff === '' && preview.newFiles.length === 0 && <p className="rounded-lg bg-steam-bg p-3 text-xs text-steam-text/60">Nenhum conteúdo textual para mostrar.</p>}
            </div>
          </section>
        </div>

        <footer className="flex flex-wrap items-end gap-2 border-t border-steam-elevated px-4 py-3 sm:px-5">
          <label className="min-w-56 flex-1 text-xs font-medium text-steam-text/70">
            Mensagem da versão
            <input value={message} onChange={(event) => onMessageChange(event.target.value)} maxLength={500} placeholder="Ex.: Corrige validação do formulário" className="mt-1.5 min-h-9 w-full rounded border border-steam-elevated bg-steam-bg px-3 text-sm text-steam-text outline-none focus:border-steam-accent" />
          </label>
          <button type="button" onClick={onClose} disabled={busy} className="min-h-9 rounded border border-steam-elevated px-3 text-xs text-steam-text/80 hover:bg-steam-elevated disabled:opacity-50">Cancelar</button>
          <button type="button" onClick={() => onCommit(preview.revision)} disabled={busy || message.trim() === '' || preview.files.length === 0} className="inline-flex min-h-9 items-center gap-2 rounded bg-steam-accent px-3 text-xs font-semibold text-steam-bg disabled:cursor-wait disabled:opacity-45">
            <Save size={13} aria-hidden="true" /> {busy ? 'Salvando versão…' : 'Salvar versão'}
          </button>
        </footer>
      </section>
    </div>
  );
}

