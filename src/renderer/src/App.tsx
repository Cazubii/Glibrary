import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Activity, Library, BarChart3, Boxes, Bot, FolderGit2, Moon, Search, ScanSearch, Sun, Wrench, X } from 'lucide-react';
import { useLibraryStore } from './store/library';
import GithubAccountMenu from './components/GithubAccountMenu';
import AssetLibraryPage from './pages/AssetLibraryPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProjectsPage = lazy(() => import('./pages/ProjectsPage'));
const CollectionsPage = lazy(() => import('./pages/CollectionsPage'));
const GithubSearchPage = lazy(() => import('./pages/GithubSearchPage'));
const RepoAnalysisPage = lazy(() => import('./pages/RepoAnalysisPage'));
const ConsumoPage = lazy(() => import('./pages/ConsumoPage'));
const ToolsPage = lazy(() => import('./pages/ToolsPage'));
const AgentesPage = lazy(() => import('./pages/AgentesPage'));

type Page = 'library' | 'dashboard' | 'projects' | 'collections' | 'search' | 'analyze' | 'consumo' | 'ferramentas' | 'agentes';
type ToastKind = 'error' | 'success';

interface Toast { id: number; message: string; kind: ToastKind }

type PushToast = (message: string, kind?: ToastKind) => void;

export default function App(): React.JSX.Element {
  const { loaded, error, load, settings, updateSettings } = useLibraryStore();
  const theme = settings?.theme ?? 'dark';
  const [page, setPage] = useState<Page>('dashboard');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const pendingSearch = useRef(false);
  const pushToast: PushToast = useCallback((message, kind = 'error') => {
    const id = Date.now() + Math.random(); setToasts((items) => [...items, { id, message, kind }]);
    setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 5000);
  }, []);
  const onError: PushToast = useCallback((message) => pushToast(message, 'error'), [pushToast]);
  const onSuccess: PushToast = useCallback((message) => pushToast(message, 'success'), [pushToast]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (error) onError(error); }, [error, onError]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: next }).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        const input = document.getElementById('library-search') as HTMLInputElement | null;
        if (input) {
          setPage('library');
          input.focus();
          input.select();
        } else {
          pendingSearch.current = true;
          setPage('library');
        }
      }
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (page === 'library' && pendingSearch.current) {
      pendingSearch.current = false;
      requestAnimationFrame(() => {
        const input = document.getElementById('library-search') as HTMLInputElement | null;
        input?.focus();
        input?.select();
      });
    }
  }, [page]);
  if (!loaded) return <div className="flex h-full items-center justify-center bg-steam-bg text-steam-text">Carregando biblioteca…</div>;
  const navItems: { id: Page; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={16}/> },
    { id: 'projects', label: 'Projetos', icon: <FolderGit2 size={16}/> },
    { id: 'library', label: 'Biblioteca', icon: <Library size={16}/> },
    { id: 'collections', label: 'Coleções', icon: <Boxes size={16}/> },
    { id: 'search', label: 'Busca', icon: <Search size={16}/> },
    { id: 'analyze', label: 'Análise', icon: <ScanSearch size={16}/> },
    { id: 'consumo', label: 'Consumo', icon: <Activity size={16}/> },
    { id: 'agentes', label: 'Agentes', icon: <Bot size={16}/> },
    { id: 'ferramentas', label: 'Ferramentas', icon: <Wrench size={16}/> }
  ];
  const openSearch = (): void => {
    const input = document.getElementById('library-search') as HTMLInputElement | null;
    if (page === 'library' && input) {
      input.focus();
      input.select();
      return;
    }
    pendingSearch.current = true;
    setPage('library');
  };
  return <div className="relative flex h-full bg-steam-bg text-steam-text">
    <aside className="glibrary-sidebar flex w-14 shrink-0 flex-col gap-4 overflow-y-auto border-r border-steam-elevated/70 bg-steam-bg px-2 py-4 md:w-56 md:px-3">
      <div className="flex items-center gap-2.5 px-1.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-steam-accent/40 bg-steam-accent/10 text-steam-accent"><Library size={16}/></span>
        <span className="hidden text-base font-semibold tracking-tight md:inline">Glibrary</span>
      </div>
      <button type="button" onClick={openSearch} aria-label="Buscar na biblioteca (Ctrl+K)" className="flex items-center gap-2 rounded-lg border border-steam-elevated bg-steam-panel px-2.5 py-2 text-xs text-steam-text/50 hover:border-steam-text/20 hover:text-steam-text/80">
        <Search size={14} className="shrink-0"/>
        <span className="hidden flex-1 text-left md:inline">Buscar</span>
        <kbd className="hidden rounded border border-steam-elevated px-1 font-sans text-[10px] text-steam-text/40 md:inline">Ctrl K</kbd>
      </button>
      <nav className="flex flex-col gap-0.5 text-sm" aria-label="Menu principal">
        <span className="mb-1 hidden px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-steam-text/35 md:block">Menu principal</span>
        {navItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPage(item.id)}
            aria-current={page === item.id ? 'page' : undefined}
            title={item.label}
            className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left ${page === item.id ? 'border-steam-elevated bg-steam-panel text-steam-text shadow-[inset_0_1px_0_hsl(var(--steam-text)/0.04)]' : 'border-transparent text-steam-text/55 hover:bg-steam-panel/60 hover:text-steam-text/85'}`}
          >
            <span className={`shrink-0 ${page === item.id ? 'text-steam-accent' : ''}`}>{item.icon}</span>
            <span className="sr-only md:not-sr-only">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-steam-elevated/70 pt-3 text-sm">
        <GithubAccountMenu onError={onError} placement="sidebar"/>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-steam-text/55 hover:bg-steam-panel/60 hover:text-steam-text/85"
        >
          {theme === 'dark' ? <Sun size={16} className="shrink-0"/> : <Moon size={16} className="shrink-0"/>}
          <span className="hidden md:inline">{theme === 'dark' ? 'Tema claro' : 'Tema escuro'}</span>
        </button>
      </div>
    </aside>
    <div className="flex min-h-0 min-w-0 flex-1">
      <Suspense fallback={<div className="m-auto text-sm text-steam-text/50">Carregando página…</div>}>
        {page === 'library'
          ? <AssetLibraryPage onError={onError} onSuccess={onSuccess}/>
          : page === 'dashboard'
            ? <DashboardPage onError={onError} onSuccess={onSuccess}/>
            : page === 'projects'
              ? <ProjectsPage onError={onError} onSuccess={onSuccess}/>
            : page === 'collections'
              ? <CollectionsPage onError={onError} onSuccess={onSuccess}/>
              : page === 'search'
                ? <GithubSearchPage onError={onError} onSuccess={onSuccess}/>
                : page === 'analyze'
                  ? <RepoAnalysisPage onError={onError} onSuccess={onSuccess}/>
                  : page === 'consumo'
                    ? <ConsumoPage onError={onError} onSuccess={onSuccess}/>
                    : page === 'agentes'
                      ? <AgentesPage/>
                      : <ToolsPage onError={onError}/>}
      </Suspense>
    </div>
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">{toasts.map((toast) => <div key={toast.id} className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded px-4 py-3 text-sm text-white shadow-lg ${toast.kind === 'success' ? 'bg-steam-green' : 'bg-steam-error'}`} role="status">{toast.kind === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> : <AlertCircle size={16} className="mt-0.5 shrink-0"/>}<span className="flex-1">{toast.message}</span><button type="button" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))} aria-label="Fechar aviso"><X size={14}/></button></div>)}</div>
  </div>;
}
