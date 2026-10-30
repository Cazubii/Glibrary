import { useEffect, useRef, useState } from 'react';
import { Trash2, Copy, ArrowDownToLine } from 'lucide-react';
import Anser from 'anser';
import type { LogLine } from '@shared/types';

interface Props {
  lines: LogLine[];
  onClear?: () => void;
}

function lineColor(line: LogLine): string {
  if (line.stream === 'err') return 'text-steam-error';
  if (line.stream === 'sys') return 'text-steam-accent/70';
  return 'text-steam-text/90';
}

export default function LogConsole({ lines, onClear }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    if (follow && containerRef.current != null) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lines, follow]);

  const copyAll = (): void => {
    const text = lines.map((l) => `[${l.ts}] ${l.text}`).join('\n');
    void navigator.clipboard.writeText(text);
  };

  return (
    <div className="flex h-full flex-col rounded-lg bg-black/40">
      <div className="flex items-center gap-2 border-b border-steam-elevated/50 px-3 py-1.5">
        <span className="text-xs font-semibold text-steam-text/60">Console</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFollow((f) => !f)}
            className={`rounded p-1.5 text-xs ${
              follow ? 'text-steam-accent' : 'text-steam-text/50'
            } hover:bg-steam-elevated`}
            title={follow ? 'Auto-scroll ligado' : 'Auto-scroll desligado'}
          >
            <ArrowDownToLine size={14} />
          </button>
          <button
            type="button"
            onClick={copyAll}
            className="rounded p-1.5 text-steam-text/50 hover:bg-steam-elevated"
            title="Copiar"
          >
            <Copy size={14} />
          </button>
          <button
            type="button"
            onClick={onClear}
            className="rounded p-1.5 text-steam-text/50 hover:bg-steam-elevated"
            title="Limpar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          setFollow(atBottom);
        }}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs leading-5"
      >
        {lines.length === 0 ? (
          <div className="text-steam-text/40">Nenhuma saída ainda.</div>
        ) : (
          lines.map((line, i) => (
            <div key={`${line.ts}-${i}`} className={lineColor(line)}>
              <span
                dangerouslySetInnerHTML={{
                  __html: Anser.ansiToHtml(Anser.escapeForHtml(line.text))
                }}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
