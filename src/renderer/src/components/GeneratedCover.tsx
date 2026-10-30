import type { Repo } from '@shared/types';

function hashHue(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 360;
  }
  return hash;
}

function initials(name: string): string {
  const parts = name.split(/[-_\s]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function GeneratedCover({ repo }: { repo: Repo }): React.JSX.Element {
  const hue = hashHue(repo.name);
  return (
    <div
      className="flex h-full w-full items-center justify-center"
      style={{
        background: `linear-gradient(135deg, hsl(${hue}, 45%, 28%), hsl(${(hue + 40) % 360}, 50%, 18%))`
      }}
    >
      <span className="select-none text-4xl font-bold text-white/80">{initials(repo.name)}</span>
    </div>
  );
}
