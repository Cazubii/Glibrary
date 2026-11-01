import { Settings2, X } from 'lucide-react';
import type { TagCount } from '@shared/tags';
import { sameTag } from '@shared/tags';

interface Props {
  tags: TagCount[];
  selected: string[];
  onToggle: (name: string) => void;
  onClear: () => void;
  onManage: () => void;
}

export default function TagChips({
  tags,
  selected,
  onToggle,
  onClear,
  onManage
}: Props): React.JSX.Element {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {tags.map(({ name, count }) => {
        const active = selected.some((tag) => sameTag(tag, name));
        return (
          <button
            key={name}
            type="button"
            onClick={() => onToggle(name)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
              active
                ? 'border-steam-accent bg-steam-accent/20 text-steam-accent'
                : 'border-steam-elevated bg-steam-panel text-steam-text/70 hover:text-steam-accent'
            }`}
          >
            {name}
            <span className="opacity-60">{count}</span>
          </button>
        );
      })}
      {selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs text-steam-text/50 hover:text-steam-text"
        >
          <X size={12} />
          Limpar
        </button>
      )}
      <button
        type="button"
        onClick={onManage}
        aria-label="Gerenciar tags"
        className="ml-auto rounded p-1.5 text-steam-text/40 hover:text-steam-accent"
      >
        <Settings2 size={15} />
      </button>
    </div>
  );
}
