import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Library } from 'lucide-react';
import type { Repo } from '@shared/types';
import { useLibraryStore } from './store/library';
import { api } from './lib/api';
import LibraryPage from './pages/LibraryPage';
import RepoDetailPage from './pages/RepoDetailPage';

interface Toast {
  id: number;
  message: string;
}

export default function App(): React.JSX.Element {
  const { repos, loaded, error, load, toggleFavorite } = useLibraryStore();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [openRepoId, setOpenRepoId] = useState<string | null>(null);

  const pushToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const offStatus = api.onStatusChanged(({ id, status }) => {
      useLibraryStore.setState((s) => ({
        repos: s.repos.map((r) => (r.id === id ? { ...r, status: status as Repo['status'] } : r))
      }));
    });
    const offExit = api.onProcessExit(() => {
      void load();
    });
    return () => {
      offStatus();
      offExit();
    };
  }, [load]);

  useEffect(() => {
    if (error != null) pushToast(error);
  }, [error, pushToast]);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center bg-steam-bg text-steam-text">
        Carregando biblioteca…
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col bg-steam-bg text-steam-text">
      <header className="flex items-center gap-3 border-b border-steam-elevated/50 px-4 py-2">
        <Library size={22} className="text-steam-accent" />
        <span className="text-lg font-bold tracking-wide">GLIBRARY</span>
        <nav className="ml-4 flex gap-1 text-sm">
          <span className="rounded bg-steam-elevated px-3 py-1 text-steam-accent">Biblioteca</span>
          <span
            className="cursor-not-allowed rounded px-3 py-1 text-steam-text/40"
            title="Em breve (Fase 5)"
          >
            Ferramentas
          </span>
          <span
            className="cursor-not-allowed rounded px-3 py-1 text-steam-text/40"
            title="Em breve"
          >
            Configurações
          </span>
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        {openRepoId != null ? (
          <RepoDetailPage
            repoId={openRepoId}
            onBack={() => setOpenRepoId(null)}
            onError={pushToast}
          />
        ) : (
          <LibraryPage
            repos={repos}
            onToggleFavorite={(id) =>
              void toggleFavorite(id).catch((e: unknown) => pushToast(String(e)))
            }
            onOpenRepo={setOpenRepoId}
            onReload={() => void load()}
            onError={pushToast}
          />
        )}
      </div>

      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-sm items-start gap-2 rounded bg-steam-error px-4 py-3 text-sm text-white shadow-lg"
          >
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => setToasts((t) => t.filter((x) => x.id !== toast.id))}
              aria-label="Fechar aviso"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
