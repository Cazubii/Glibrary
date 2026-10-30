import { useMemo } from 'react';
import type { Repo } from '@shared/types';
import { useLibraryStore } from '../store/library';
import RepoCard from './RepoCard';

interface Props {
  repos: Repo[];
  onToggleFavorite: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function RepoGrid({ repos, onToggleFavorite, onOpen }: Props): React.JSX.Element {
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

  const sorted = useMemo(
    () => [...repos].sort((a, b) => a.name.localeCompare(b.name)),
    [repos],
  );

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
      {sorted.map((repo) => (
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
