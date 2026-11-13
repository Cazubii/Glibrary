import { useState } from 'react';
import { X, FolderOpen } from 'lucide-react';
import { api } from '../lib/api';

interface Props {
  onClose: () => void;
  onAdded: () => void;
  onError: (error: unknown) => void;
}

type Tab = 'url' | 'folder';

export default function AddRepoDialog({ onClose, onAdded, onError }: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [cloneNow, setCloneNow] = useState(true);
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const failWith = (e: unknown): void => {
    const message = e instanceof Error ? e.message : String(e);
    setError(message);
    onError(message);
  };

  const pickFolder = async (): Promise<void> => {
    try {
      const folder = await api.dialogPickFolder();
      if (folder != null) setPath(folder);
    } catch (e) {
      failWith(e);
    }
  };

  const submitUrl = async (): Promise<void> => {
    const trimmed = url.trim();
    if (trimmed === '') {
      setError('Cole a URL do repositório');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.repoAddByUrl(normalizeInputUrl(trimmed), cloneNow);
      onAdded();
      onClose();
    } catch (e) {
      failWith(e);
    } finally {
      setBusy(false);
    }
  };

  const submitFolder = async (): Promise<void> => {
    if (path.trim() === '') {
      setError('Escolha uma pasta');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.repoAddLocal(path.trim());
      onAdded();
      onClose();
    } catch (e) {
      failWith(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-lg bg-steam-panel p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Adicionar repositório"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Adicionar repositório</h2>
          <button type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 flex gap-2 border-b border-steam-elevated/50">
          <button
            type="button"
            onClick={() => setTab('url')}
            className={`border-b-2 px-3 py-1.5 text-sm ${
              tab === 'url'
                ? 'border-steam-accent text-steam-accent'
                : 'border-transparent text-steam-text/60'
            }`}
          >
            Por URL
          </button>
          <button
            type="button"
            onClick={() => setTab('folder')}
            className={`border-b-2 px-3 py-1.5 text-sm ${
              tab === 'folder'
                ? 'border-steam-accent text-steam-accent'
                : 'border-transparent text-steam-text/60'
            }`}
          >
            Pasta local
          </button>
        </div>

        {tab === 'url' && (
          <>
            <label className="mb-2 block text-sm text-steam-text/70">
              URL do GitHub ou qualquer URL git
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitUrl();
              }}
              placeholder="github.com/owner/repo ou https://…"
              className="w-full rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm outline-none focus:border-steam-accent"
            />
            <label className="mt-3 flex items-center gap-2 text-sm text-steam-text/80">
              <input
                type="checkbox"
                checked={cloneNow}
                onChange={(e) => setCloneNow(e.target.checked)}
                className="accent-steam-accent"
              />
              Clonar agora
            </label>
          </>
        )}

        {tab === 'folder' && (
          <>
            <label className="mb-2 block text-sm text-steam-text/70">Pasta local</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="Caminho da pasta do repositório"
                className="flex-1 rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm outline-none focus:border-steam-accent"
              />
              <button
                type="button"
                onClick={() => void pickFolder()}
                className="rounded bg-steam-elevated px-3 py-2 text-sm hover:bg-steam-accent/20"
              >
                <FolderOpen size={16} />
              </button>
            </div>
          </>
        )}

        {error != null && <p className="mt-3 text-sm text-steam-error">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded px-4 py-2 text-sm text-steam-text/70 hover:bg-steam-elevated"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void (tab === 'url' ? submitUrl() : submitFolder())}
            disabled={busy}
            className="rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? 'Adicionando…' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Aceita colar `github.com/owner/repo` sem `https://` (seção 12.3). */
function normalizeInputUrl(input: string): string {
  const t = input.trim();
  if (/^https:\/\//.test(t) || /^git@/.test(t) || /^ssh:\/\//.test(t)) return t;
  return `https://${t}`;
}
