import { useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { TagCount } from '@shared/tags';

interface Props {
  tags: TagCount[];
  /** Rejeita em caso de falha (toast é do chamador); o editor permanece aberto para correção. */
  onRename: (from: string, to: string) => Promise<void>;
  /** Rejeita em caso de falha (toast é do chamador); a confirmação permanece aberta. */
  onDelete: (name: string) => Promise<void>;
  onClose: () => void;
}

export default function TagManagerDialog({
  tags,
  onRename,
  onDelete,
  onClose
}: Props): React.JSX.Element {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Gerenciar tags"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded border border-steam-elevated bg-steam-panel p-5">
        <div className="flex items-center">
          <h2 className="text-lg font-semibold">Gerenciar tags</h2>
          <button
            type="button"
            ref={closeRef}
            onClick={onClose}
            aria-label="Fechar"
            className="ml-auto rounded p-1 text-steam-text/50 hover:text-steam-text"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
          {tags.map(({ name, count }) => (
            <li
              key={name}
              className="flex items-center gap-2 rounded border border-steam-elevated bg-steam-bg px-3 py-2"
            >
              {editing === name ? (
                <>
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="min-w-0 flex-1 rounded border border-steam-elevated bg-steam-panel px-2 py-1 text-sm"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setBusy(true);
                      void onRename(name, draft.trim())
                        .then(() => setEditing(null))
                        .catch(() => undefined)
                        .finally(() => setBusy(false));
                    }}
                    disabled={busy || draft.trim() === '' || draft.trim() === name}
                    className="rounded bg-steam-accent px-2 py-1 text-xs text-steam-bg disabled:opacity-50"
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded px-2 py-1 text-xs text-steam-text/60"
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <span className="min-w-0 flex-1 truncate text-sm">{name}</span>
                  <span className="text-xs text-steam-text/40">{count}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(null);
                      setEditing(name);
                      setDraft(name);
                    }}
                    className="rounded px-2 py-1 text-xs text-steam-text/60 hover:text-steam-accent"
                  >
                    Renomear
                  </button>
                  {confirming === name ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setBusy(true);
                          void onDelete(name)
                            .then(() => setConfirming(null))
                            .catch(() => undefined)
                            .finally(() => setBusy(false));
                        }}
                        disabled={busy}
                        className="rounded bg-steam-error px-2 py-1 text-xs text-white disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded px-2 py-1 text-xs text-steam-text/60"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(name)}
                      aria-label={`Apagar tag ${name}`}
                      className="rounded p-1 text-steam-text/40 hover:text-red-400"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
          {tags.length === 0 && (
            <li className="py-6 text-center text-sm text-steam-text/50">
              Nenhuma tag para gerenciar.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
