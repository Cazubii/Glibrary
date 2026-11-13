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

function providerLabel(provider: AgentRun['provider']): string {
  if (provider === 'claude-code') return 'Claude Code';
  if (provider === 'opencode') return 'OpenCode';
  return 'Comando genérico';
}

function tokenTotal(run: AgentRun): number {
  const usage = run.tokenUsage;
  return usage == null ? 0 : usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.reasoningTokens;
}

function nestingDepth(run: AgentRun, parentId: string | undefined): number {
  if (parentId == null) return 0;
  const children = run.subagents ?? [];
  let depth = 1;
  let current = children.find((child) => child.id === parentId);
  const seen = new Set<string>();
  while (current?.parentId != null && depth < 4 && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = children.find((child) => child.id === current?.parentId);
  }
  return depth;
}

export default function AgentRunCard({ run, lines, running, onStop, onOpenLog, compact = false }: Props): React.JSX.Element {
  const status = statusStyle(run.status);
  return (
    <div className="rounded-lg border border-steam-elevated/50 bg-steam-panel p-3">
      <div className="flex items-center gap-2 text-sm">
        <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} aria-hidden/>
        <span className="font-semibold">{run.profileName}</span>
        <span className="truncate text-steam-text/50">{run.repoName}</span>
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
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-steam-text/45">
        <span>{providerLabel(run.provider)}</span>
        {run.accountLabel != null && <span>{run.accountLabel}</span>}
        {run.tokenUsage != null && <span>{tokenTotal(run).toLocaleString('pt-PT')} tokens · ${run.tokenUsage.costUsd.toFixed(4)}</span>}
        {run.cwd != null && <span className="min-w-0 truncate font-mono" title={run.cwd}>{run.cwd}</span>}
      </div>
      {compact && (run.activity?.length || run.subagents?.length) ? (
        <div className="mt-1 flex items-center gap-2 truncate text-[11px] text-steam-text/55">
          {run.subagents != null && run.subagents.length > 0 && <span className="shrink-0">{run.subagents.filter((child) => child.status === 'running').length} subagent(s)</span>}
          {run.activity?.at(-1) != null && <span className="truncate">{run.activity.at(-1)?.label}</span>}
        </div>
      ) : null}
      {!compact && run.subagents != null && run.subagents.length > 0 && (
        <div className="mt-2 border-l border-steam-elevated pl-3">
          {run.subagents.slice(-6).map((child) => (
            <div key={child.id} style={{ marginLeft: `${nestingDepth(run, child.parentId) * 12}px` }} className="flex items-center gap-2 py-0.5 text-xs text-steam-text/65">
              <span className={`h-1.5 w-1.5 rounded-full ${child.status === 'running' ? 'bg-steam-green' : child.status === 'error' ? 'bg-steam-error' : 'bg-steam-text/30'}`} />
              <span className="font-medium">{child.name}</span>
              <span className="text-steam-text/40">{child.status === 'running' ? 'executando' : child.status === 'waiting' ? 'aguardando' : child.status === 'error' ? 'erro' : 'concluído'}</span>
            </div>
          ))}
        </div>
      )}
      {!compact && run.activity != null && run.activity.length > 0 && (
        <div className="mt-2 space-y-0.5 text-xs text-steam-text/60">
          {run.activity.slice(-4).reverse().map((item) => (
            <div key={item.id} className="truncate" title={item.label}>
              <span className="mr-2 text-steam-text/35">{new Date(item.at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>{item.label}
            </div>
          ))}
        </div>
      )}
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
