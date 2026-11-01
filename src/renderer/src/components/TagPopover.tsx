import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { normalizeTag, sameTag } from '@shared/tags';

interface Props {
  currentTags: string[];
  allTags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  onClose: () => void;
}

export default function TagPopover({
  currentTags,
  allTags,
  onAdd,
  onRemove,
  onClose
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const draftTag = normalizeTag(draft);
  const suggestions =
    draftTag == null
      ? []
      : allTags.filter(
          (tag) =>
            tag.toLowerCase().includes(draftTag.toLowerCase()) &&
            !currentTags.some((current) => sameTag(current, tag))
        );
  const commit = (): void => {
    const tag = normalizeTag(draft);
    if (tag == null) return;
    if (!currentTags.some((current) => sameTag(current, tag))) onAdd(tag);
    setDraft('');
  };
  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-20 mt-1 w-64 rounded border border-steam-elevated bg-steam-bg p-3 shadow-lg"
    >
      <div className="flex flex-wrap gap-1.5">
        {currentTags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-full bg-steam-elevated px-2 py-0.5 text-xs"
          >
            {tag}
            <button type="button" onClick={() => onRemove(tag)} aria-label={`Remover tag ${tag}`}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        placeholder="Nova tag… (Enter)"
        autoFocus
        className="mt-2 w-full rounded border border-steam-elevated bg-steam-panel px-2 py-1 text-xs outline-none focus:border-steam-accent"
      />
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {suggestions.slice(0, 8).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onAdd(tag)}
              className="rounded-full border border-steam-elevated px-2 py-0.5 text-xs text-steam-text/60 hover:text-steam-accent"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
