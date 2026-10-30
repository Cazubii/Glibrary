import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { CommandSpec } from '@shared/types';

interface Props {
  label: string;
  value: CommandSpec | undefined;
  candidates: CommandSpec[];
  readmeCommands?: CommandSpec[];
  onChange: (spec: CommandSpec | undefined) => void;
}

function specText(spec: CommandSpec | undefined): string {
  return spec?.command ?? '';
}

export default function CommandEditor({
  label,
  value,
  candidates,
  readmeCommands,
  onChange
}: Props): React.JSX.Element {
  const [text, setText] = useState(specText(value));
  const [editing, setEditing] = useState(false);

  const commit = (): void => {
    setEditing(false);
    const trimmed = text.trim();
    if (trimmed === '') {
      onChange(undefined);
      return;
    }
    const cwd = value?.cwd;
    onChange({ command: trimmed, ...(cwd != null ? { cwd } : {}) });
  };

  return (
    <div className="rounded-lg bg-steam-bg/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-steam-text/80">{label}</span>
        {editing ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={commit}
              className="rounded p-1 text-steam-green hover:bg-steam-green/20"
              aria-label="Salvar comando"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                setText(specText(value));
                setEditing(false);
              }}
              className="rounded p-1 text-steam-text/60 hover:bg-steam-elevated"
              aria-label="Cancelar edição"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-steam-accent hover:underline"
          >
            Editar
          </button>
        )}
      </div>

      {editing ? (
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setText(specText(value));
              setEditing(false);
            }
          }}
          autoFocus
          className="w-full rounded border border-steam-accent bg-steam-bg px-2 py-1.5 font-mono text-xs outline-none"
        />
      ) : (
        <code className="block truncate font-mono text-xs text-steam-green">
          {specText(value) || <span className="text-steam-text/40">—</span>}
        </code>
      )}

      {candidates.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase text-steam-text/40">Detectados</div>
          <div className="flex flex-wrap gap-1">
            {candidates.map((c) => (
              <button
                key={c.command}
                type="button"
                onClick={() => {
                  setText(c.command);
                  onChange(c);
                }}
                className="rounded bg-steam-elevated px-2 py-0.5 font-mono text-[10px] text-steam-text/80 hover:bg-steam-accent/20"
              >
                {c.command}
              </button>
            ))}
          </div>
        </div>
      )}

      {readmeCommands != null && readmeCommands.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] uppercase text-steam-text/40">
            Sugestões do README
          </div>
          <div className="flex flex-wrap gap-1">
            {readmeCommands.map((c) => (
              <button
                key={c.command}
                type="button"
                onClick={() => {
                  setText(c.command);
                  onChange(c);
                }}
                className="rounded bg-steam-elevated px-2 py-0.5 font-mono text-[10px] text-steam-text/70 hover:bg-steam-accent/20"
              >
                {c.command}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
