import { useMemo } from 'react';
import type { Repo } from '@shared/types';
import { useLibraryStore } from '../store/library';
import RepoCard from './RepoCard';
import StatusBadge from './StatusBadge';
import GeneratedCover from './GeneratedCover';

interface Props {
  repos: Repo[];
  viewMode: 'grid' | 'list';
  onToggleFavorite: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function RepoGrid({
  repos,
  viewMode,
  onToggleFavorite,
  onOpen
}: Props): React.JSX.Element {
  const tools = useLibraryStore((s) => s.tools);

  const missingByRepo = useMemo(() => {
    const installed = new Map(tools.map((t) => [t.id, t.installed]));
    const map = new Map<string, string[]>();
    for (const repo of repos) {
      const missing = (repo.detection?.requiredTools ?? []).filter(
        (id) => installed.get(id) === false,
      );
      if (missing.length > 0) map.set(repo.id, missing);
    }
    return map;
  }, [repos, tools]);

  if (viewMode === 'list') {
    return (
      <div className="flex flex-col gap-1">
        {repos.map((repo) => (
          <button
            key={repo.id}
            type="button"
            onClick={() => onOpen(repo.id)}
            className="flex items-center gap-3 rounded bg-steam-panel px-3 py-2 text-left hover:bg-steam-elevated/60"
          >
            <div className="h-10 w-16 shrink-0 overflow-hidden rounded">
              <GeneratedCover repo={repo} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{repo.name}</div>
              <div className="truncate text-xs text-steam-text/50">
                {repo.owner ?? 'local'}
                {repo.language != null ? ` · ${repo.language}` : ''}
                {(missingByRepo.get(repo.id) ?? []).length > 0
                  ? ` · Falta: ${(missingByRepo.get(repo.id) ?? []).join(', ')}`
                  : ''}
              </div>
            </div>
            {repo.stars != null && (
              <span className="hidden text-xs text-steam-text/50 sm:inline">★ {repo.stars}</span>
            )}
            <StatusBadge status={repo.status} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {repos.map((repo) => (
        <RepoCard
          key={repo.id}
          repo={repo}
          missingTools={missingByRepo.get(repo.id)}
          onToggleFavorite={onToggleFavorite}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
