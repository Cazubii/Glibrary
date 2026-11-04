import { X } from 'lucide-react';
import {
  ASSET_CATEGORIES,
  ASSET_CATEGORY_LABELS
} from '@shared/categories';
import type { AssetCategory } from '@shared/categories';

interface Props {
  counts: Partial<Record<AssetCategory, number>>;
  selected: AssetCategory[];
  onToggle: (category: AssetCategory) => void;
  onClear: () => void;
}

export default function CategoryChips({
  counts,
  selected,
  onToggle,
  onClear
}: Props): React.JSX.Element {
  const categories = ASSET_CATEGORIES.filter((category) => (counts[category] ?? 0) > 0);
  if (categories.length <= 1) return <></>;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-steam-text/40">Categoria</span>
      {categories.map((category) => {
        const active = selected.includes(category);
        return (
          <button
            key={category}
            type="button"
            onClick={() => onToggle(category)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${
              active
                ? 'border-steam-accent bg-steam-accent/20 text-steam-accent'
                : 'border-steam-elevated bg-steam-panel text-steam-text/70 hover:text-steam-accent'
            }`}
          >
            {ASSET_CATEGORY_LABELS[category]}
            <span className="opacity-60">{counts[category]}</span>
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
    </div>
  );
}
