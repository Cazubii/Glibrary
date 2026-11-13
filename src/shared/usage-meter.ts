import type { Agent, Skill, UsageEvent } from './types';

export interface UsageDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface UsageRankItem {
  id: string;
  name: string;
  count: number;
  lastAt: string | null;
}

export interface UsageAggregate {
  /** total de eventos na janela */
  total: number;
  /** projeção simples para 30 dias (total * 30 / windowDays) */
  projectedMonthly: number;
  /** série diária da janela (inclui dias zerados) */
  days: UsageDay[];
  /** eventos por asset na janela */
  byAsset: Map<string, { count: number; lastAt: string | null }>;
  lastAt: string | null;
}

/** Agrega eventos do tipo na janela em dias, incluindo dias zerados. */
export function computeUsageWindow(
  events: UsageEvent[],
  windowDays: 7 | 30 | 90,
  kind: 'skill' | 'agent'
): UsageAggregate {
  const now = new Date();
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - (windowDays - 1));
  cutoff.setHours(0, 0, 0, 0);

  const byDay = new Map<string, number>();
  const byAsset = new Map<string, { count: number; lastAt: string | null }>();
  let lastAt: string | null = null;
  let total = 0;

  for (const event of events) {
    if (event.kind !== kind) continue;
    if (lastAt == null || event.at > lastAt) lastAt = event.at;
    if (new Date(event.at).getTime() < cutoff.getTime()) continue;
    total += 1;
    const key = event.at.slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
    const entry = byAsset.get(event.assetId) ?? { count: 0, lastAt: null };
    entry.count += 1;
    if (entry.lastAt == null || event.at > entry.lastAt) entry.lastAt = event.at;
    byAsset.set(event.assetId, entry);
  }

  const days: UsageDay[] = [];
  for (let i = 0; i < windowDays; i++) {
    const day = new Date(cutoff);
    day.setDate(cutoff.getDate() + i);
    const key = day.toISOString().slice(0, 10);
    days.push({ date: key, count: byDay.get(key) ?? 0 });
  }

  return {
    total,
    projectedMonthly: Math.round((total * 30) / windowDays),
    days,
    byAsset,
    lastAt
  };
}

/** Rank dentro da janela, cruzando o nome dos assets atuais da biblioteca. */
export function buildRank(
  byAsset: UsageAggregate['byAsset'],
  assets: { skills: Skill[]; agents: Agent[] },
  kind: 'skill' | 'agent',
  limit = 8
): UsageRankItem[] {
  const names =
    kind === 'agent'
      ? assets.agents.map((a) => ({ id: a.id, name: a.name }))
      : assets.skills.map((s) => ({ id: s.id, name: s.name }));
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const items: UsageRankItem[] = [];
  for (const [id, entry] of byAsset) {
    items.push({
      id,
      name: nameOf.get(id) ?? `(removido) ${id.slice(0, 8)}`,
      count: entry.count,
      lastAt: entry.lastAt
    });
  }
  items.sort((a, b) => b.count - a.count || (a.name < b.name ? -1 : 1));
  return items.slice(0, limit);
}
