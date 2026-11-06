import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Library, BarChart3, Boxes, Moon, Search, Sun, X } from 'lucide-react';
import { useLibraryStore } from './store/library';
import AssetLibraryPage from './pages/AssetLibraryPage';
import DashboardPage from './pages/DashboardPage';
import CollectionsPage from './pages/CollectionsPage';
import GithubSearchPage from './pages/GithubSearchPage';

type Page = 'library' | 'dashboard' | 'collections' | 'search';
type ToastKind = 'error' | 'success';

interface Toast { id: number; message: string; kind: ToastKind }

type PushToast = (message: string, kind?: ToastKind) => void;

export default function App(): React.JSX.Element {
  const { loaded, error, load, settings, updateSettings } = useLibraryStore();
  const theme = settings?.theme ?? 'dark';
  const [page, setPage] = useState<Page>('library');
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
    <header className="flex items-center gap-3 border-b border-steam-elevated/50 px-4 py-2">
      <Library size={22} className="text-steam-accent"/>
      <span className="text-lg font-bold tracking-wide">GLIBRARY</span>
      <nav className="ml-6 flex gap-1 text-sm">
        <button type="button" onClick={() => setPage('library')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'library' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><Library size={15}/>Biblioteca</button>
        <button type="button" onClick={() => setPage('dashboard')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'dashboard' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><BarChart3 size={15}/>Dashboard</button>
        <button type="button" onClick={() => setPage('collections')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'collections' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><Boxes size={15}/>Coleções</button>
        <button type="button" onClick={() => setPage('search')} className={`flex items-center gap-1.5 rounded px-3 py-1.5 ${page === 'search' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}><Search size={15}/>Busca</button>
      </nav>
      <span className="ml-4 text-sm text-steam-text/50">Skills · Agents · Bases · Projetos</span>
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
        title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        className="ml-auto rounded p-1.5 text-steam-text/60 hover:bg-steam-panel hover:text-steam-accent"
      >
        {theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}
      </button>
    </header>
    <div className="flex min-h-0 flex-1">
      {page === 'library'
        ? <AssetLibraryPage onError={onError} onSuccess={onSuccess}/>
        : page === 'dashboard'
          ? <DashboardPage onError={onError} onSuccess={onSuccess}/>
          : page === 'collections'
            ? <CollectionsPage onError={onError} onSuccess={onSuccess}/>
            : <GithubSearchPage onError={onError} onSuccess={onSuccess}/>}
    </div>
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col gap-2">{toasts.map((toast) => <div key={toast.id} className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded px-4 py-3 text-sm text-white shadow-lg ${toast.kind === 'success' ? 'bg-steam-green' : 'bg-steam-error'}`} role="status">{toast.kind === 'success' ? <CheckCircle2 size={16} className="mt-0.5 shrink-0"/> : <AlertCircle size={16} className="mt-0.5 shrink-0"/>}<span className="flex-1">{toast.message}</span><button type="button" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))} aria-label="Fechar aviso"><X size={14}/></button></div>)}</div>
  </div>;
}
