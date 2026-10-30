import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { Repo } from '@shared/types';
import RepoGrid from '../components/RepoGrid';
import Sidebar, { type SidebarFilter } from '../components/Sidebar';
import AddRepoDialog from '../components/AddRepoDialog';

interface Props {
  repos: Repo[];
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onToggleFavorite: (id: string) => void;
  onOpenRepo: (id: string) => void;
  onReload: () => void;
  onError: (message: string) => void;
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
  const [scanPlaceholder, setScanPlaceholder] = useState(false);

  const visible = useMemo(
    () => repos.filter((r) => matchesFilter(r, filter) && matchesSearch(r, query)),
    [repos, filter, query],
  );

  return (
    <div className="flex h-full">
      <Sidebar
        repos={repos}
        filter={filter}
        onFilterChange={onFilterChange}
        onScan={() => setScanPlaceholder(true)}
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

          <div className="relative ml-auto w-72">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-steam-text/50"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar repositórios…"
              className="w-full rounded border border-steam-elevated bg-steam-panel py-2 pl-9 pr-3 text-sm outline-none focus:border-steam-accent"
            />
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
                    onClick={() => setScanPlaceholder(true)}
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
            <RepoGrid repos={visible} onToggleFavorite={onToggleFavorite} onOpen={onOpenRepo} />
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

      {scanPlaceholder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setScanPlaceholder(false)}
          role="presentation"
        >
          <div
            className="rounded-lg bg-steam-panel p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <p className="mb-4">O scanner de pastas chega na Fase 5.</p>
            <button
              type="button"
              onClick={() => setScanPlaceholder(false)}
              className="rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
