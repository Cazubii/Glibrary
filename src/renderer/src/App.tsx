import { useEffect, useState, useCallback } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { Library } from 'lucide-react';
import type { Repo } from '@shared/types';
import { useLibraryStore } from './store/library';
import { api } from './lib/api';
import LibraryPage from './pages/LibraryPage';
import RepoDetailPage from './pages/RepoDetailPage';
import ToolsPage from './pages/ToolsPage';
import Onboarding from './components/Onboarding';
import type { SidebarFilter } from './components/Sidebar';

interface Toast {
  id: number;
  message: string;
}

type Page = 'library' | 'tools';

const ONBOARDING_KEY = 'glibrary.onboardingDone';

export default function App(): React.JSX.Element {
  const { repos, settings, loaded, error, load, toggleFavorite, tools, toolsLoaded, loadTools } =
    useLibraryStore();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [openRepoId, setOpenRepoId] = useState<string | null>(null);
  const [page, setPage] = useState<Page>('library');
  const [filter, setFilter] = useState<SidebarFilter>({ kind: 'all' });
  const [onboarded, setOnboarded] = useState(
    () => localStorage.getItem(ONBOARDING_KEY) === '1',
  );

  const pushToast = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => {
      setToasts((t) => t.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  const finishOnboarding = useCallback(() => {
    localStorage.setItem(ONBOARDING_KEY, '1');
    setOnboarded(true);
    void load();
  }, [load]);

  const showOnboarding =
    loaded &&
    !onboarded &&
    repos.length === 0 &&
    (settings?.scanFolders.length ?? 0) === 0;

  useEffect(() => {
    void load();
    void loadTools();
  }, [load, loadTools]);

  useEffect(() => {
    const offStatus = api.onStatusChanged(({ id, status }) => {
      useLibraryStore.setState((s) => ({
        repos: s.repos.map((r) => (r.id === id ? { ...r, status: status as Repo['status'] } : r))
      }));
    });
    const offExit = api.onProcessExit(() => {
      void load();
    });
    const offClone = api.onCloneProgress(({ id, percent, stage }) => {
      useLibraryStore.getState().setCloneProgress(id, { percent, stage });
    });
    return () => {
      offStatus();
      offExit();
      offClone();
    };
  }, [load]);

  useEffect(() => {
    if (error != null) pushToast(error);
  }, [error, pushToast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const input = document.getElementById('library-search') as HTMLInputElement | null;
        input?.focus();
        input?.select();
      } else if (e.key === 'Escape') {
        setOpenRepoId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
          <button
            type="button"
            onClick={() => {
              setPage('library');
              setOpenRepoId(null);
            }}
            className={`rounded px-3 py-1 ${
              page === 'library' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60'
            }`}
          >
            Biblioteca
          </button>
          <button
            type="button"
            onClick={() => {
              setPage('tools');
              setOpenRepoId(null);
            }}
            className={`rounded px-3 py-1 ${
              page === 'tools' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60'
            }`}
          >
            Ferramentas
          </button>
          <span
            className="cursor-not-allowed rounded px-3 py-1 text-steam-text/40"
            title="Em breve"
          >
            Configurações
          </span>
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        {showOnboarding ? (
          <Onboarding onDone={finishOnboarding} onError={pushToast} />
        ) : openRepoId != null ? (
          <RepoDetailPage
            repoId={openRepoId}
            onBack={() => setOpenRepoId(null)}
            onError={pushToast}
          />
        ) : page === 'tools' ? (
          <ToolsPage
            tools={tools}
            toolsLoaded={toolsLoaded}
            repos={repos}
            onRecheck={() => void loadTools(true)}
            onFilterByTool={(tool) => {
              setFilter({ kind: 'tool', tool });
              setPage('library');
            }}
          />
        ) : (
          <LibraryPage
            repos={repos}
            filter={filter}
            onFilterChange={setFilter}
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
