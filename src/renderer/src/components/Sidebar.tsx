import { useMemo, useState } from 'react';
import { FolderOpen, Library, Star, AlertTriangle, HardDrive, Circle, RefreshCcw } from 'lucide-react';
import type { Repo } from '@shared/types';

export type SidebarFilter =
  | { kind: 'all' }
  | { kind: 'favorites' }
  | { kind: 'status'; status: Repo['status'] }
  | { kind: 'updates' }
  | { kind: 'tag'; tag: string }
  | { kind: 'tool'; tool: string };

interface Props {
  repos: Repo[];
  filter: SidebarFilter;
  onFilterChange: (filter: SidebarFilter) => void;
  onScan: () => void;
}

export default function Sidebar({
  repos,
  filter,
  onFilterChange,
  onScan
}: Props): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false);

  const counts = useMemo(() => {
    const favorites = repos.filter((r) => r.favorite).length;
    const installed = repos.filter((r) => r.status === 'installed' || r.status === 'running').length;
    const notCloned = repos.filter((r) => r.status === 'not_cloned').length;
    const errors = repos.filter((r) => r.status === 'error').length;
    const updates = repos.filter((r) => (r.behindBy ?? 0) > 0).length;
    const tags = new Map<string, number>();
    for (const r of repos) {
      for (const t of r.tags) tags.set(t, (tags.get(t) ?? 0) + 1);
    }
    return { favorites, installed, notCloned, errors, updates, tags: [...tags.entries()].sort() };
  }, [repos]);

  const itemClass = (active: boolean): string =>
    `flex w-full items-center gap-2 rounded px-3 py-1.5 text-sm transition-colors ${
      active ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/80 hover:bg-steam-panel'
    }`;

  return (
    <aside
      className={`flex shrink-0 flex-col bg-steam-panel py-4 transition-all ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="mb-3 flex items-center gap-2 px-3 text-steam-accent"
      >
        <Library size={20} />
        {!collapsed && <span className="text-lg font-bold">GLIBRARY</span>}
      </button>

      <nav className="flex flex-col gap-1 px-2">
        <button
          type="button"
          className={itemClass(filter.kind === 'all')}
          onClick={() => onFilterChange({ kind: 'all' })}
        >
          <Library size={16} />
          {!collapsed && <span>Todos</span>}
        </button>
        <button
          type="button"
          className={itemClass(filter.kind === 'favorites')}
          onClick={() => onFilterChange({ kind: 'favorites' })}
        >
          <Star size={16} />
          {!collapsed && <span>Favoritos ({counts.favorites})</span>}
        </button>
        <button
          type="button"
          className={itemClass(
            filter.kind === 'status' && (filter.status === 'installed' || filter.status === 'running'),
          )}
          onClick={() => onFilterChange({ kind: 'status', status: 'installed' })}
        >
          <HardDrive size={16} />
          {!collapsed && <span>Instalados ({counts.installed})</span>}
        </button>
        <button
          type="button"
          className={itemClass(filter.kind === 'status' && filter.status === 'not_cloned')}
          onClick={() => onFilterChange({ kind: 'status', status: 'not_cloned' })}
        >
          <Circle size={16} />
          {!collapsed && <span>Não clonados ({counts.notCloned})</span>}
        </button>
        <button
          type="button"
          className={itemClass(filter.kind === 'status' && filter.status === 'error')}
          onClick={() => onFilterChange({ kind: 'status', status: 'error' })}
        >
          <AlertTriangle size={16} />
          {!collapsed && <span>Com erro ({counts.errors})</span>}
        </button>
        <button
          type="button"
          className={itemClass(filter.kind === 'updates')}
          onClick={() => onFilterChange({ kind: 'updates' })}
        >
          <RefreshCcw size={16} />
          {!collapsed && <span>Com atualização ({counts.updates})</span>}
        </button>
      </nav>

      {!collapsed && counts.tags.length > 0 && (
        <>
          <div className="mt-4 px-3 text-xs font-semibold uppercase text-steam-text/50">Tags</div>
          <nav className="mt-1 flex flex-col gap-1 px-2">
            {counts.tags.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                className={itemClass(filter.kind === 'tag' && filter.tag === tag)}
                onClick={() => onFilterChange({ kind: 'tag', tag })}
              >
                <span className="truncate">
                  #{tag} ({count})
                </span>
              </button>
            ))}
          </nav>
        </>
      )}

      <div className="mt-auto px-2">
        <button type="button" className={itemClass(false)} onClick={onScan}>
          <FolderOpen size={16} />
          {!collapsed && <span>Escanear pastas</span>}
        </button>
      </div>
    </aside>
  );
}
