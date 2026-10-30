import { Star, AlertTriangle } from 'lucide-react';
import type { Repo } from '@shared/types';
import GeneratedCover from './GeneratedCover';
import StatusBadge from './StatusBadge';

interface Props {
  repo: Repo;
  missingTools?: string[];
  onToggleFavorite: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function RepoCard({
  repo,
  missingTools,
  onToggleFavorite,
  onOpen
}: Props): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onOpen(repo.id)}
      className="group flex flex-col overflow-hidden rounded-lg bg-steam-panel text-left transition-colors hover:bg-steam-elevated/60"
    >
      <div className="relative aspect-video w-full overflow-hidden">
        <GeneratedCover repo={repo} />
        <span
          role="button"
          tabIndex={0}
          aria-label={repo.favorite ? 'Desfavoritar' : 'Favoritar'}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(repo.id);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onToggleFavorite(repo.id);
            }
          }}
          className={`absolute right-2 top-2 cursor-pointer rounded p-1 transition-opacity ${
            repo.favorite
              ? 'text-steam-warn opacity-100'
              : 'text-white/70 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Star size={16} fill={repo.favorite ? 'currentColor' : 'none'} />
        </span>
      </div>
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold text-steam-text">{repo.name}</span>
          <StatusBadge status={repo.status} />
        </div>
        <div className="flex items-center justify-between text-xs text-steam-text/60">
          <span>{repo.owner ?? 'local'}</span>
          {repo.language != null && <span>{repo.language}</span>}
        </div>
        {repo.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {repo.tags.map((tag) => (
              <span key={tag} className="rounded bg-steam-elevated px-1.5 py-0.5 text-[10px]">
                #{tag}
              </span>
            ))}
          </div>
        )}
        {missingTools != null && missingTools.length > 0 && (
          <div className="flex items-center gap-1 pt-1 text-[11px] text-steam-warn">
            <AlertTriangle size={12} />
            Falta: {missingTools.join(', ')}
          </div>
        )}
      </div>
    </button>
  );
}
