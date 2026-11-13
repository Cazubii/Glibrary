import { Moon, Settings2, Sun, Wrench, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AgentRun, Settings } from '@shared/types';
import { api } from '../lib/api';

interface SettingsMenuProps {
  showAdvancedResources: boolean;
  theme: 'dark' | 'light';
  agentRunBudgetUsd?: number;
  agentDailyBudgetUsd?: number;
  toolsOpen: boolean;
  onAdvancedResourcesChange: (show: boolean) => void;
  onThemeToggle: () => void;
  onBudgetChange: (patch: Pick<Settings, 'agentRunBudgetUsd' | 'agentDailyBudgetUsd'>) => Promise<void>;
  onOpenTools: () => void;
}

export default function SettingsMenu({
  showAdvancedResources,
  theme,
  agentRunBudgetUsd,
  agentDailyBudgetUsd,
  toolsOpen,
  onAdvancedResourcesChange,
  onThemeToggle,
  onBudgetChange,
  onOpenTools
}: SettingsMenuProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [runBudget, setRunBudget] = useState(agentRunBudgetUsd?.toString() ?? '');
  const [dailyBudget, setDailyBudget] = useState(agentDailyBudgetUsd?.toString() ?? '');
  const [savingBudget, setSavingBudget] = useState(false);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);

  useEffect(() => {
    setRunBudget(agentRunBudgetUsd?.toString() ?? '');
    setDailyBudget(agentDailyBudgetUsd?.toString() ?? '');
  }, [agentDailyBudgetUsd, agentRunBudgetUsd]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void api.agentRunsList().then((runs) => {
      if (!active) return;
      setAgentRuns((current) => {
        const byId = new Map(runs.map((run) => [run.id, run]));
        for (const run of current) byId.set(run.id, run);
        return [...byId.values()];
      });
    }).catch(() => undefined);
    const offChanged = api.onAgentRunsChanged((run) => {
      setAgentRuns((current) => {
        const index = current.findIndex((candidate) => candidate.id === run.id);
        if (index < 0) return [run, ...current];
        const next = [...current];
        next[index] = run;
        return next;
      });
    });
    return () => { active = false; offChanged(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const closeOnPointerOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOnPointerOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const openTools = (): void => {
    setOpen(false);
    onOpenTools();
  };

  const saveBudgets = async (): Promise<void> => {
    const parse = (value: string): number | undefined => value.trim() === '' ? undefined : Number(value);
    const nextRun = parse(runBudget);
    const nextDaily = parse(dailyBudget);
    if ((nextRun != null && (!Number.isFinite(nextRun) || nextRun < 0.01 || nextRun > 10_000)) ||
        (nextDaily != null && (!Number.isFinite(nextDaily) || nextDaily < 0.01 || nextDaily > 10_000))) return;
    setSavingBudget(true);
    try {
      await onBudgetChange({ agentRunBudgetUsd: nextRun, agentDailyBudgetUsd: nextDaily });
    } finally {
      setSavingBudget(false);
    }
  };

  const invalidRunBudget = runBudget.trim() !== '' && (!Number.isFinite(Number(runBudget)) || Number(runBudget) < 0.01 || Number(runBudget) > 10_000);
  const invalidDailyBudget = dailyBudget.trim() !== '' && (!Number.isFinite(Number(dailyBudget)) || Number(dailyBudget) < 0.01 || Number(dailyBudget) > 10_000);
  const today = new Date().toDateString();
  const todayCostUsd = agentRuns
    .filter((run) => new Date(run.startedAt).toDateString() === today)
    .reduce((total, run) => total + (run.tokenUsage?.costUsd ?? 0), 0);
  const runBudgetWarning = agentRunBudgetUsd != null && agentRuns.some((run) =>
    run.status === 'running' && (run.tokenUsage?.costUsd ?? 0) >= agentRunBudgetUsd * 0.8
  );
  const dailyBudgetWarning = agentDailyBudgetUsd != null && todayCostUsd >= agentDailyBudgetUsd * 0.8;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Configurações"
        aria-expanded={open}
        aria-controls="glibrary-settings-menu"
        title="Configurações"
        onClick={() => setOpen((current) => !current)}
        className={`rounded p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent ${open || toolsOpen ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel hover:text-steam-accent'}`}
      >
        <Settings2 size={17} aria-hidden="true" />
      </button>
      {open && (
        <section
          id="glibrary-settings-menu"
          aria-label="Configurações"
          className="absolute right-0 top-full z-50 mt-2 max-h-[calc(100vh-5rem)] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg border border-steam-elevated bg-steam-panel p-4 shadow-lg"
        >
          <header className="mb-3 flex items-center">
            <h2 className="text-sm font-semibold">Configurações</h2>
            <button
              type="button"
              aria-label="Fechar configurações"
              onClick={() => setOpen(false)}
              className="ml-auto rounded p-1 text-steam-text/55 hover:bg-steam-elevated hover:text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </header>
          <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-2 text-sm focus-within:outline-none focus-within:ring-2 focus-within:ring-steam-accent">
            <input
              type="checkbox"
              checked={showAdvancedResources}
              onChange={(event) => onAdvancedResourcesChange(event.target.checked)}
              className="mt-0.5 accent-steam-accent"
            />
            <span>
              <span className="block font-medium">Mostrar recursos avançados</span>
              <span className="mt-0.5 block text-xs text-steam-text/60">Coleções, análise e consumo detalhado</span>
            </span>
          </label>
          <section className="mt-3 border-t border-steam-elevated pt-3" aria-labelledby="agent-budget-title">
            <h3 id="agent-budget-title" className="text-sm font-medium">Limites de gasto dos agentes</h3>
            <label className="mt-2 block text-xs text-steam-text/70">
              Por execução (US$)
              <input type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={runBudget} onChange={(event) => setRunBudget(event.target.value)} placeholder="Sem limite" aria-invalid={invalidRunBudget} className="mt-1 min-h-9 w-full rounded border border-steam-elevated bg-steam-bg px-2 text-sm text-steam-text outline-none focus:border-steam-accent aria-invalid:border-steam-error" />
            </label>
            <label className="mt-2 block text-xs text-steam-text/70">
              Por dia (US$)
              <input type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" value={dailyBudget} onChange={(event) => setDailyBudget(event.target.value)} placeholder="Sem limite" aria-invalid={invalidDailyBudget} className="mt-1 min-h-9 w-full rounded border border-steam-elevated bg-steam-bg px-2 text-sm text-steam-text outline-none focus:border-steam-accent aria-invalid:border-steam-error" />
            </label>
            {(runBudgetWarning || dailyBudgetWarning) && <p role="status" className="mt-2 rounded bg-steam-warn/10 px-2 py-1.5 text-xs text-steam-warn">Você chegou a 80% de um limite de gasto. Uso registrado hoje: US$ {todayCostUsd.toFixed(2)}.</p>}
            <p className="mt-2 text-[11px] leading-4 text-steam-text/50">O Glibrary usa os custos informados pelo Claude Code e OpenCode. Com um limite ativo, comandos sem medição de custo não iniciam.</p>
            <button type="button" onClick={() => void saveBudgets()} disabled={savingBudget || invalidRunBudget || invalidDailyBudget} className="mt-2 min-h-8 rounded bg-steam-accent px-3 text-xs font-semibold text-steam-bg disabled:opacity-45">{savingBudget ? 'Salvando…' : 'Salvar limites'}</button>
          </section>
          <button
            type="button"
            onClick={onThemeToggle}
            className="mt-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-steam-text/80 hover:bg-steam-elevated hover:text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
          >
            {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            {theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
          </button>
          <button
            type="button"
            onClick={openTools}
            aria-current={toolsOpen ? 'page' : undefined}
            className="mt-1 flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-steam-text/80 hover:bg-steam-elevated hover:text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
          >
            <Wrench size={15} aria-hidden="true" />
            Ferramentas
          </button>
        </section>
      )}
    </div>
  );
}
