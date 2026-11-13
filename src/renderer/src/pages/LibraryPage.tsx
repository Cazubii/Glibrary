import { useMemo, useState } from 'react';
import { Plus, Search, LayoutGrid, List, ArrowDownWideNarrow, Download, Upload } from 'lucide-react';
import type { Repo } from '@shared/types';
import RepoGrid from '../components/RepoGrid';
import Sidebar, { type SidebarFilter } from '../components/Sidebar';
import AddRepoDialog from '../components/AddRepoDialog';
import ScanDialog from '../components/ScanDialog';
import { useLibraryStore } from '../store/library';
import { api } from '../lib/api';

type SortKey = 'name' | 'recent' | 'stars';

function sortRepos(repos: Repo[], sort: SortKey): Repo[] {
  const copy = [...repos];
  switch (sort) {
    case 'name':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'recent':
      return copy.sort((a, b) => b.addedAt.localeCompare(a.addedAt));
    case 'stars':
      return copy.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
  }
}

interface Props {
  repos: Repo[];
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onToggleFavorite: (id: string) => void;
  onOpenRepo: (id: string) => void;
  onReload: () => void;
  onError: (error: unknown) => void;
}

function matchesFilter(repo: Repo, filter: SidebarFilter): boolean {
  switch (filter.kind) {
    case 'all':
      return true;
    case 'favorites':
      return repo.favorite;
    case 'tag':
      return repo.tags.includes(filter.tag);
    case 'updates':
      return (repo.behindBy ?? 0) > 0;
    case 'tool':
      return (repo.detection?.requiredTools ?? []).includes(filter.tool);
    case 'status':
      if (filter.status === 'installed') {
        return repo.status === 'installed' || repo.status === 'running';
      }
      return repo.status === filter.status;
  }
}

function matchesSearch(repo: Repo, query: string): boolean {
  if (query.trim() === '') return true;
  const q = query.trim().toLowerCase();
  return (
    repo.name.toLowerCase().includes(q) ||
    (repo.owner ?? '').toLowerCase().includes(q) ||
    (repo.description ?? '').toLowerCase().includes(q) ||
    (repo.localPath ?? '').toLowerCase().includes(q) ||
    repo.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export default function LibraryPage({
  repos,
  filter,
  onFilterChange,
  onToggleFavorite,
  onOpenRepo,
  onReload,
  onError
}: Props): React.JSX.Element {
  const [query, setQuery] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showScan, setShowScan] = useState(false);
  const [sort, setSort] = useState<SortKey>('name');
  const settings = useLibraryStore((s) => s.settings);
  const updateSettings = useLibraryStore((s) => s.updateSettings);
  const viewMode = settings?.viewMode ?? 'grid';

  const visible = useMemo(
    () =>
      sortRepos(
        repos.filter((r) => matchesFilter(r, filter) && matchesSearch(r, query)),
        sort,
      ),
    [repos, filter, query, sort],
  );

  const toggleView = (): void => {
    void updateSettings({ viewMode: viewMode === 'grid' ? 'list' : 'grid' }).catch((e: unknown) =>
      onError(e instanceof Error ? e.message : String(e)),
    );
  };

  const doExport = async (): Promise<void> => {
    try {
      await api.libraryExport();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const doImport = async (): Promise<void> => {
    try {
      const count = await api.libraryImport();
      if (count > 0) onReload();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex h-full">
      <Sidebar
        repos={repos}
        filter={filter}
        onFilterChange={onFilterChange}
        onScan={() => setShowScan(true)}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-steam-elevated/50 px-6 py-3">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg hover:opacity-90"
          >
            <Plus size={16} />
            Adicionar
          </button>

          <div className="relative ml-auto flex items-center gap-2">
            <div className="relative w-60">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-steam-text/50"
              />
              <input
                id="library-search"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar repositórios… (Ctrl+K)"
                className="w-full rounded border border-steam-elevated bg-steam-panel py-2 pl-9 pr-3 text-sm outline-none focus:border-steam-accent"
              />
            </div>

            <div className="flex items-center gap-1 rounded border border-steam-elevated">
              <ArrowDownWideNarrow size={14} className="ml-2 text-steam-text/50" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="bg-steam-panel py-1.5 pr-2 text-xs outline-none"
              >
                <option value="name">Nome</option>
                <option value="recent">Recentes</option>
                <option value="stars">Estrelas</option>
              </select>
            </div>

            <button
              type="button"
              onClick={toggleView}
              title={viewMode === 'grid' ? 'Modo lista' : 'Modo grade'}
              className="rounded border border-steam-elevated bg-steam-panel p-2 hover:bg-steam-elevated"
            >
              {viewMode === 'grid' ? <List size={16} /> : <LayoutGrid size={16} />}
            </button>

            <button
              type="button"
              onClick={() => void doExport()}
              title="Exportar biblioteca"
              className="rounded border border-steam-elevated bg-steam-panel p-2 hover:bg-steam-elevated"
            >
              <Download size={16} />
            </button>
            <button
              type="button"
              onClick={() => void doImport()}
              title="Importar biblioteca"
              className="rounded border border-steam-elevated bg-steam-panel p-2 hover:bg-steam-elevated"
            >
              <Upload size={16} />
            </button>
          </div>
        </header>

        {filter.kind === 'tool' && (
          <div className="flex items-center gap-2 border-b border-steam-elevated/30 px-6 py-2 text-xs text-steam-text/70">
            <span>Filtrando por ferramenta: <strong>{filter.tool}</strong></span>
            <button
              type="button"
              onClick={() => onFilterChange({ kind: 'all' })}
              className="rounded bg-steam-elevated px-2 py-0.5 hover:bg-steam-accent/20"
            >
              limpar
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-steam-text/60">
              <p className="text-lg">
                {repos.length === 0
                  ? 'Sua biblioteca está vazia'
                  : 'Nenhum repositório corresponde ao filtro'}
              </p>
              {repos.length === 0 && (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowScan(true)}
                    className="rounded bg-steam-elevated px-5 py-2.5 text-sm font-semibold hover:bg-steam-accent/20"
                  >
                    Escanear minhas pastas
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAdd(true)}
                    className="rounded bg-steam-accent px-5 py-2.5 text-sm font-semibold text-steam-bg hover:opacity-90"
                  >
                    Adicionar pasta local
                  </button>
                </div>
              )}
            </div>
          ) : (
            <RepoGrid
              repos={visible}
              viewMode={viewMode}
              onToggleFavorite={onToggleFavorite}
              onOpen={onOpenRepo}
            />
          )}
        </div>
      </main>

      {showAdd && (
        <AddRepoDialog
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            onReload();
          }}
          onError={onError}
        />
      )}

      {showScan && (
        <ScanDialog
          onClose={() => setShowScan(false)}
          onImported={() => onReload()}
          onError={onError}
        />
      )}
    </div>
  );
}
