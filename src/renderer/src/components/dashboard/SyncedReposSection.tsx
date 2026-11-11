import { useMemo } from 'react';
import { ExternalLink, FolderGit2, Star } from 'lucide-react';
import { buildSyncedReposView } from '@shared/github-dashboard';
import { useLibraryStore } from '../../store/library';
import StatusBadge from '../StatusBadge';
import DevSessionBadge from '../DevSessionBadge';

interface Props {
  onOpen: (repoId: string) => void;
  onError: (message: string) => void;
}

/** Seção 3 — repositórios registrados na biblioteca (library.json). */
export default function SyncedReposSection({ onOpen, onError }: Props): React.JSX.Element {
  const { repos, toggleFavorite } = useLibraryStore();
  const view = useMemo(() => buildSyncedReposView(repos), [repos]);
  const strip = [
    { label: 'Sincronizados', value: view.summary.total },
    { label: 'Instalados', value: view.summary.installed },
    { label: 'Favoritos', value: view.summary.favorites }
  ];
  return (
    <section className="rounded border border-steam-elevated bg-steam-panel p-5">
      <div className="mb-4 flex items-center gap-2">
        <FolderGit2 size={16} className="text-steam-accent" />
        <h2 className="text-sm font-semibold">Projetos sincronizados</h2>
      </div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        {strip.map((item) => (
          <div key={item.label} className="rounded border border-steam-elevated/70 bg-steam-bg/40 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-steam-text/40">{item.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{item.value}</p>
          </div>
        ))}
      </div>
      {view.rows.length === 0 ? (
        <p className="flex h-32 items-center justify-center rounded border border-dashed border-steam-elevated text-sm text-steam-text/40">
          Nenhum repositório registrado no sistema ainda.
        </p>
      ) : (
        <ul className="divide-y divide-steam-elevated/50">
          {view.rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5">
              <button
                type="button"
                onClick={() => { toggleFavorite(row.id).catch((e: unknown) => onError(e instanceof Error ? e.message : String(e))); }}
                aria-label={row.favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
                aria-pressed={row.favorite}
                className={`shrink-0 rounded p-1 hover:bg-steam-elevated ${row.favorite ? 'text-steam-warn' : 'text-steam-text/30'}`}
              >
                <Star size={14} fill={row.favorite ? 'currentColor' : 'none'} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium" title={row.owner != null ? `${row.owner}/${row.name}` : row.name}>
                    {row.owner != null && <span className="text-steam-text/50">{row.owner}/</span>}{row.name}
                  </span>
                  <StatusBadge status={row.status} />
                  <DevSessionBadge session={repos.find((repo) => repo.id === row.id)?.devSession} />
                  {row.stars != null && row.stars > 0 && (
                    <span className="text-xs tabular-nums text-steam-text/40">★ {row.stars.toLocaleString('pt-BR')}</span>
                  )}
                </div>
                {row.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {row.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-steam-elevated px-2 text-[11px] text-steam-text/60">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
              <span className="hidden shrink-0 text-xs text-steam-text/40 md:inline" title="Última atualização">
                {row.updatedAt !== '' ? new Date(row.updatedAt).toLocaleDateString('pt-BR') : '—'}
              </span>
              <button
                type="button"
                onClick={() => onOpen(row.id)}
                className="flex shrink-0 items-center gap-1 rounded border border-steam-elevated px-2.5 py-1 text-xs hover:bg-steam-elevated hover:text-steam-accent"
              >
                <ExternalLink size={12} /> Abrir
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
