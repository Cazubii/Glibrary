import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Activity, Bot, Coins, Flame, RefreshCw, TrendingUp, WandSparkles } from 'lucide-react';
import type { Agent, AgentRun, Skill, UsageEvent } from '@shared/types';
import { buildRank, computeUsageWindow, type UsageRankItem } from '@shared/usage-meter';
import { api } from '../lib/api';
import Termo from '../components/Termo';

type Kind = 'agent' | 'skill';
type Window = 7 | 30 | 90;

interface Props {
  onError: (error: unknown) => void;
  onSuccess?: (message: string) => void;
}

const KIND_TABS: Array<{ id: Kind; label: ReactNode; icon: ReactNode }> = [
  { id: 'agent', label: <Termo id="agent" />, icon: <Bot size={15} /> },
  { id: 'skill', label: <Termo id="skill" />, icon: <WandSparkles size={15} /> }
];

function StatCard({ label, value, icon }: { label: ReactNode; value: string | number; icon: ReactNode }): React.JSX.Element {
  return (
    <div className="rounded-lg bg-steam-panel p-4">
      <div className="flex items-center gap-2 text-steam-text/50">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-1 text-xl font-bold">{value}</div>
    </div>
  );
}

function formatTokens(value: number): string {
  return Math.round(value).toLocaleString('pt-PT');
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 }).format(value);
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days}d`;
  return new Date(iso).toLocaleDateString('pt-BR');
}

/** Página do medidor de uso de agents e skills (eventos, rank e projeção). */
export default function ConsumoPage({ onError, onSuccess }: Props): React.JSX.Element {
  const [data, setData] = useState<{ skills: Skill[]; agents: Agent[]; usage: UsageEvent[] } | null>(null);
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [kind, setKind] = useState<Kind>('agent');
  const [windowDays, setWindowDays] = useState<Window>(30);
  const [busy, setBusy] = useState(false);

  const load = async (): Promise<void> => {
    setBusy(true);
    try {
      const [response, runs] = await Promise.all([api.assetsGet(), api.agentRunsList()]);
      setData({ skills: response.skills, agents: response.agents, usage: response.usage });
      setAgentRuns(runs);
    } catch (e) {
      onError(e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
    return api.onAgentRunsChanged((run) => {
      setAgentRuns((current) => {
        const index = current.findIndex((item) => item.id === run.id);
        if (index === -1) return [run, ...current];
        const next = [...current];
        next[index] = run;
        return next;
      });
    });
  }, []);

  const aggregate = useMemo(() => (data != null ? computeUsageWindow(data.usage, windowDays, kind) : null), [data, windowDays, kind]);
  const rank = useMemo(
    () => (aggregate != null && data != null ? buildRank(aggregate.byAsset, { skills: data.skills, agents: data.agents }, kind) : []),
    [aggregate, data, kind]
  );

  const tokenRuns = useMemo(() => {
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    return agentRuns.filter((run) => run.tokenUsage != null && Date.parse(run.startedAt) >= cutoff);
  }, [agentRuns, windowDays]);
  const tokenTotals = useMemo(() => tokenRuns.reduce((total, run) => {
    const usage = run.tokenUsage;
    if (usage == null) return total;
    total.input += usage.inputTokens;
    total.output += usage.outputTokens;
    total.cache += usage.cacheReadTokens + usage.cacheWriteTokens;
    total.reasoning += usage.reasoningTokens;
    total.cost += usage.costUsd;
    return total;
  }, { input: 0, output: 0, cache: 0, reasoning: 0, cost: 0 }), [tokenRuns]);
  const accountTotals = useMemo(() => {
    const totals = new Map<string, { runs: number; tokens: number; cost: number }>();
    for (const run of tokenRuns) {
      const key = run.accountLabel ?? (run.provider === 'opencode' ? 'OpenCode · provedor não identificado' : run.provider === 'claude-code' ? 'Claude Code · conta não identificada' : 'Conta não identificada');
      const current = totals.get(key) ?? { runs: 0, tokens: 0, cost: 0 };
      current.runs += 1;
      current.tokens += run.tokenUsage?.inputTokens ?? 0;
      current.tokens += run.tokenUsage?.outputTokens ?? 0;
      current.tokens += run.tokenUsage?.cacheReadTokens ?? 0;
      current.tokens += run.tokenUsage?.cacheWriteTokens ?? 0;
      current.tokens += run.tokenUsage?.reasoningTokens ?? 0;
      current.cost += run.tokenUsage?.costUsd ?? 0;
      totals.set(key, current);
    }
    return [...totals.entries()].sort((a, b) => b[1].tokens - a[1].tokens);
  }, [tokenRuns]);
  const projectTotals = useMemo(() => {
    const totals = new Map<string, { name: string; runs: number; tokens: number; cost: number }>();
    for (const run of tokenRuns) {
      const current = totals.get(run.repoId) ?? { name: run.repoName, runs: 0, tokens: 0, cost: 0 };
      current.runs += 1;
      current.tokens += run.tokenUsage?.inputTokens ?? 0;
      current.tokens += run.tokenUsage?.outputTokens ?? 0;
      current.tokens += run.tokenUsage?.cacheReadTokens ?? 0;
      current.tokens += run.tokenUsage?.cacheWriteTokens ?? 0;
      current.tokens += run.tokenUsage?.reasoningTokens ?? 0;
      current.cost += run.tokenUsage?.costUsd ?? 0;
      totals.set(run.repoId, current);
    }
    return [...totals.entries()].sort((a, b) => b[1].tokens - a[1].tokens);
  }, [tokenRuns]);

  const register = async (item: UsageRankItem): Promise<void> => {
    try {
      await api.usageRecord(kind, item.id);
      await load();
      onSuccess?.(`Uso registrado: ${item.name}`);
    } catch (e) {
      onError(e);
    }
  };

  if (data == null || aggregate == null) {
    return <main className="flex flex-1 items-center justify-center text-sm text-steam-text/50">Carregando medidor de consumo…</main>;
  }

  const maxDay = Math.max(1, ...aggregate.days.map((day) => day.count));
  const rankTotal = rank.reduce((sum, item) => sum + item.count, 0);

  return (
    <main className="flex flex-1 flex-col overflow-y-auto">
      <header className="flex flex-wrap items-center gap-3 border-b border-steam-elevated/50 px-6 py-3">
        <Activity size={18} className="text-steam-accent" />
        <div className="mr-auto">
          <h1 className="text-lg font-bold">Consumo</h1>
          <p className="text-xs text-steam-text/50">Medidor de usos: cada abertura/registro de skill ou agent conta um evento.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="flex items-center gap-2 rounded bg-steam-elevated px-3 py-1.5 text-sm hover:bg-steam-accent/20 disabled:opacity-50"
        >
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Atualizar
        </button>
      </header>

      <div className="px-6 py-4">
        <section className="mb-5 rounded-lg border border-steam-elevated/50 bg-steam-panel p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Coins size={16} className="text-steam-accent" />
            <h2 className="text-sm font-semibold">Uso de texto nas sessões de agentes</h2>
            <span className="text-xs text-steam-text/40">execuções monitoradas · últimos {windowDays} dias</span>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className="rounded bg-steam-bg/60 p-3"><p className="text-[11px] text-steam-text/45"><Termo id="inputTokens" /></p><p className="mt-1 font-semibold">{formatTokens(tokenTotals.input)}</p></div>
            <div className="rounded bg-steam-bg/60 p-3"><p className="text-[11px] text-steam-text/45"><Termo id="outputTokens" /></p><p className="mt-1 font-semibold">{formatTokens(tokenTotals.output)}</p></div>
            <div className="rounded bg-steam-bg/60 p-3"><p className="text-[11px] text-steam-text/45"><Termo id="cache" /></p><p className="mt-1 font-semibold">{formatTokens(tokenTotals.cache)}</p></div>
            <div className="rounded bg-steam-bg/60 p-3"><p className="text-[11px] text-steam-text/45">Raciocínio</p><p className="mt-1 font-semibold">{formatTokens(tokenTotals.reasoning)}</p></div>
            <div className="rounded bg-steam-bg/60 p-3"><p className="text-[11px] text-steam-text/45">Custo informado</p><p className="mt-1 font-semibold">{formatUsd(tokenTotals.cost)}</p></div>
          </div>
          {tokenRuns.length === 0 ? (
            <p className="mt-3 text-xs text-steam-text/45">Ainda não há dados de tokens. Eles aparecem nas execuções iniciadas por perfis Claude Code ou OpenCode monitorados.</p>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.65fr)]">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-xs">
                  <thead className="text-steam-text/40"><tr><th className="py-1">Projeto / sessão</th><th>Provedor / conta</th><th className="text-right"><Termo id="tokens" /></th><th className="text-right">Custo</th></tr></thead>
                  <tbody>
                    {tokenRuns.slice(0, 12).map((run) => {
                      const usage = run.tokenUsage!;
                      const total = usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens + usage.reasoningTokens;
                      return <tr key={run.id} className="border-t border-steam-elevated/40">
                        <td className="py-1.5 pr-3"><span className="block font-medium">{run.repoName}</span><span className="text-[10px] text-steam-text/40">{run.providerSessionId ?? run.profileName} · {new Date(run.startedAt).toLocaleDateString('pt-PT')}</span></td>
                        <td className="pr-3 text-steam-text/55">{run.accountLabel ?? (run.provider === 'opencode' ? 'OpenCode · provedor não identificado' : run.provider === 'claude-code' ? 'Claude Code · conta não identificada' : 'Genérico')}</td>
                        <td className="text-right">{formatTokens(total)}</td>
                        <td className="text-right">{formatUsd(usage.costUsd)}</td>
                      </tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-steam-text/65">Uso por conta/provedor</h3>
                  <ul className="space-y-1.5">
                    {accountTotals.map(([label, total]) => <li key={label} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className="text-steam-text/50">{formatTokens(total.tokens)}</span>
                      <span className="text-steam-text/70">{formatUsd(total.cost)}</span>
                    </li>)}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-2 text-xs font-semibold text-steam-text/65">Uso por projeto</h3>
                  <ul className="space-y-1.5">
                  {projectTotals.map(([repoId, total]) => <li key={repoId} className="flex items-center gap-2 text-xs">
                    <span className="min-w-0 flex-1 truncate">{total.name}</span>
                      <span className="text-steam-text/50">{formatTokens(total.tokens)}</span>
                      <span className="text-steam-text/70">{formatUsd(total.cost)}</span>
                    </li>)}
                  </ul>
                </div>
              </div>
            </div>
          )}
          <p className="mt-3 text-[11px] text-steam-text/35">Valores da sessão reportados pelo provedor; custos podem ser estimativas. Esta tela não representa saldo restante nem fatura oficial.</p>
        </section>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded bg-steam-panel p-0.5">
            {KIND_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setKind(tab.id)}
                className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ${kind === tab.id ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:text-steam-text'}`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
          <div className="flex rounded bg-steam-panel p-0.5">
            {([7, 30, 90] as const).map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setWindowDays(days)}
                className={`rounded px-3 py-1.5 text-sm ${windowDays === days ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:text-steam-text'}`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label={`Usos em ${windowDays}d`} value={aggregate.total} icon={<Flame size={16} />} />
          <StatCard label="Projeção mensal" value={aggregate.projectedMonthly} icon={<TrendingUp size={16} />} />
          <StatCard label="Último uso" value={aggregate.lastAt != null ? relativeDate(aggregate.lastAt) : '—'} icon={<Activity size={16} />} />
          <StatCard label={kind === 'agent' ? <><Termo id="agent" /> com uso</> : <><Termo id="skill" /> com uso</>} value={aggregate.byAsset.size} icon={<Bot size={16} />} />
        </div>

        <section className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg bg-steam-panel p-4">
            <h2 className="mb-3 text-sm font-semibold">Usos por dia</h2>
            {aggregate.total === 0 ? (
              <p className="text-sm text-steam-text/50">Nenhum uso no período — abra um assistente ou uma instrução reutilizável na Biblioteca, ou clique em +1.</p>
            ) : (
              <div className="flex h-36 items-end gap-0.5">
                {aggregate.days.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.count} uso(s)`}
                    className="flex-1 rounded-t bg-steam-accent/70 hover:bg-steam-accent"
                    style={{ height: `${(day.count / maxDay) * 100}%`, minHeight: day.count > 0 ? 2 : 0 }}
                  />
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-steam-text/40">janela de {windowDays} dias · pico {maxDay} usos/dia</p>
          </div>

          <div className="rounded-lg bg-steam-panel p-4">
            <div className="mb-3 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">{kind === 'agent' ? 'Top agents' : 'Top skills'}</h2>
              <span className="text-xs text-steam-text/40">{rankTotal} usos no período</span>
            </div>
            {rank.length === 0 ? (
              <p className="text-sm text-steam-text/50">Sem eventos ainda.</p>
            ) : (
              <ul className="space-y-1.5">
                {rank.map((item, index) => (
                  <li key={item.id} className="flex items-center gap-2 text-sm">
                    <span className="w-5 text-right font-mono text-xs text-steam-text/40">{index + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="w-6 text-right font-semibold">{item.count}</span>
                    <button
                      type="button"
                      onClick={() => void register(item)}
                      className="rounded bg-steam-elevated px-2 py-1 text-xs text-steam-text/70 hover:bg-steam-accent/20 hover:text-steam-accent"
                      title="Registrar um uso agora"
                    >
                      +1
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <div className="mt-4 rounded border border-dashed border-steam-elevated p-3 text-xs text-steam-text/50">
          Como medimos: o evento entra quando você abre a skill/agent na Biblioteca (via botão abrir) ou quando marca um uso manual no medidor (+1). O painel de sessões acima acompanha apenas execuções iniciadas por perfis monitorados do Claude Code ou OpenCode.
        </div>
      </div>
    </main>
  );
}
