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
  return <div className="relative flex h-full flex-col bg-steam-bg text-steam-text">
    <header className="glibrary-app-header flex items-center gap-3 border-b border-steam-elevated/50 px-4 py-2">
      <Library size={22} className="text-steam-accent"/>
      <span className="text-lg font-bold tracking-wide">GLIBRARY</span>
      <nav className="glibrary-app-nav ml-2 flex min-w-0 flex-1 gap-1 text-sm">
        <button type="button" onClick={() => setPage('dashboard')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'dashboard' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><BarChart3 size={15}/>Dashboard</button>
        <button type="button" onClick={() => setPage('projects')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'projects' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><FolderGit2 size={15}/>Projetos</button>
        <button type="button" onClick={() => setPage('library')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'library' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><Library size={15}/>Biblioteca</button>
        <button type="button" onClick={() => setPage('collections')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'collections' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><Boxes size={15}/>Coleções</button>
        <button type="button" onClick={() => setPage('search')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'search' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><Search size={15}/>Busca</button>
        <button type="button" onClick={() => setPage('analyze')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'analyze' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><ScanSearch size={15}/>Análise</button>
        <button type="button" onClick={() => setPage('consumo')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'consumo' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><Activity size={15}/>Consumo</button>
        <button type="button" onClick={() => setPage('agentes')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'agentes' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><Bot size={15}/>Agentes</button>
        <button type="button" onClick={() => setPage('ferramentas')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'ferramentas' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><Wrench size={15}/>Ferramentas</button>
      </nav>
      <span className="ml-2 hidden shrink-0 whitespace-nowrap text-sm text-steam-text/50 2xl:block">Skills · Agents · Bases · Projetos</span>
      <GithubAccountMenu onError={onError} />
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        className="ml-auto shrink-0 rounded p-1.5 text-steam-text/60 hover:bg-steam-panel hover:text-steam-accent"
      >
        {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
      </button>
    </header>
    <div className="flex min-h-0 flex-1">
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
