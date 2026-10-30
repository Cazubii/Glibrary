import { useMemo } from 'react';
import type { Repo } from '@shared/types';
import RepoCard from './RepoCard';

interface Props {
  repos: Repo[];
  onToggleFavorite: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function RepoGrid({ repos, onToggleFavorite, onOpen }: Props): React.JSX.Element {
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
          onToggleFavorite={onToggleFavorite}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}
