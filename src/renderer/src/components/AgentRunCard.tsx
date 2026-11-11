import { Square } from 'lucide-react';
import type { AgentRun, LogLine } from '@shared/types';

interface Props {
  run: AgentRun;
  lines?: LogLine[];
  running: boolean;
  onStop: (id: string) => void;
  onOpenLog?: (run: AgentRun) => void;
  compact?: boolean;
}

function statusStyle(status: AgentRun['status']): { dot: string; label: string } {
  switch (status) {
    case 'running': return { dot: 'bg-steam-green', label: 'Rodando' };
    case 'done': return { dot: 'bg-steam-accent', label: 'Concluído' };
    case 'error': return { dot: 'bg-steam-error', label: 'Erro' };
    default: return { dot: 'bg-steam-text/40', label: 'Parado' };
  }
}

export function formatDuration(ms: number | undefined): string {
  if (ms == null) return '—';
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export default function AgentRunCard({ run, lines, running, onStop, onOpenLog, compact = false }: Props): React.JSX.Element {
  const status = statusStyle(run.status);
  return (
    <div className="rounded-lg border border-steam-elevated/50 bg-steam-panel p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} aria-hidden/>
        <span className="font-semibold">{run.profileName}</span>
        <span className="truncate text-steam-text/50">{run.repoName}{run.prompt != null ? ` · ${run.prompt}` : ''}</span>
        <span className="ml-auto shrink-0 text-xs text-steam-text/50">
          {run.status === 'running' ? formatDuration(Date.now() - Date.parse(run.startedAt)) : formatDuration(run.durationMs)}
        </span>
        {running && (
          <button type="button" onClick={() => onStop(run.id)} title="Parar execução"
            className="rounded p-1 text-steam-error hover:bg-steam-error/10" aria-label={`Parar ${run.profileName}`}>
            <Square size={13}/>
          </button>
        )}
        {onOpenLog != null && (
          <button type="button" onClick={() => onOpenLog(run)} className="rounded px-2 py-1 text-xs text-steam-accent hover:bg-steam-elevated">Log</button>
        )}
      </div>
      {!compact && run.status === 'error' && run.lastError != null && (
        <p className="mt-2 line-clamp-2 font-mono text-xs text-steam-error">{run.lastError}</p>
      )}
      {lines != null && lines.length > 0 && !compact && (
        <pre className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] leading-4 text-steam-text/70">
          {lines.slice(-8).map((l) => l.text).join('\n')}
        </pre>
      )}
    </div>
  );
}
