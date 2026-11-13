import { describe, expect, it } from 'vitest';
import type { UsageEvent } from '../src/shared/types';
import type { Agent } from '../src/shared/types';
import type { UsageAggregate } from '../src/shared/usage-meter';
import { buildRank, computeUsageWindow } from '../src/shared/usage-meter';
import { buildShellRun, trimOutput } from '../src/main/services/tool-run';

function ev(id: string, kind: 'skill' | 'agent', assetId: string, at: string): UsageEvent {
  return { id, kind, assetId, at };
}

function agentFixture(id: string, name: string): Agent {
  return {
    id,
    name,
    category: 'outros',
    path: '',
    source: '',
    tags: [],
    favorite: false,
    addedAt: ''
  } as unknown as Agent;
}

describe('computeUsageWindow', () => {
  it('agrega só do kind pedido, dentro da janela, com dias zerados', () => {
    const today = new Date().toISOString();
    const yesterday = new Date(Date.now() - 36 * 3600e3).toISOString();
    const ancient = new Date(Date.now() - 60 * 24 * 3600e3).toISOString();
    const events = [
      ev('1', 'agent', 'a1', today),
      ev('2', 'agent', 'a1', yesterday),
      ev('3', 'skill', 's1', today),
      ev('4', 'agent', 'a2', ancient)
    ];
    const usage = computeUsageWindow(events, 7, 'agent');
    expect(usage.total).toBe(2);
    expect(usage.days.filter((day) => day.count > 0).reduce((sum, day) => sum + day.count, 0)).toBe(2);
    expect(usage.byAsset.get('a1')?.count).toBe(2);
    expect(usage.byAsset.has('a2')).toBe(false);
    expect(usage.projectedMonthly).toBe(Math.round((2 * 30) / 7));
    expect(usage.lastAt).toBe(today);
  });

  it('janela de 90 dias inclui o evento antigo', () => {
    const ancient = new Date(Date.now() - 60 * 24 * 3600e3).toISOString();
    const usage = computeUsageWindow([ev('1', 'agent', 'a2', ancient)], 90, 'agent');
    expect(usage.total).toBe(1);
    expect(usage.byAsset.get('a2')?.count).toBe(1);
  });

  it('biblioteca vazia: zeros e todos os dias presentes', () => {
    const usage = computeUsageWindow([], 30, 'skill');
    expect(usage.total).toBe(0);
    expect(usage.days).toHaveLength(30);
    expect(usage.projectedMonthly).toBe(0);
    expect(usage.lastAt).toBeNull();
  });
});

describe('buildRank', () => {
  const byAsset: UsageAggregate['byAsset'] = new Map([
    ['gone', { count: 5, lastAt: null }],
    ['b', { count: 2, lastAt: null }],
    ['a', { count: 2, lastAt: null }]
  ]);

  it('ordena por contagem e nomeia pelo asset atual; removidos ficam anonimizados', () => {
    const rank = buildRank(
      byAsset,
      { agents: [agentFixture('a', 'Alpha'), agentFixture('b', 'Beta')], skills: [] },
      'agent'
    );
    expect(rank.map((item) => item.name)).toEqual(['(removido) gone', 'Alpha', 'Beta']);
    expect(rank.map((item) => item.count)).toEqual([5, 2, 2]);
  });

  it('limita ao N pedido', () => {
    const many: UsageAggregate['byAsset'] = new Map(
      ['x1', 'x2', 'x3'].map((id) => [id, { count: 1, lastAt: null }])
    );
    expect(
      buildRank(many, { agents: [agentFixture('x1', 'A'), agentFixture('x2', 'B'), agentFixture('x3', 'C')], skills: [] }, 'agent', 2)
    ).toHaveLength(2);
  });
});

describe('buildShellRun / trimOutput', () => {
  it('no windows usa cmd /c; senão sh -c', () => {
    const plan = buildShellRun('echo oi');
    if (process.platform === 'win32') {
      expect(plan.file).toBe('cmd.exe');
      expect(plan.args.at(-1)).toBe('echo oi');
    } else {
      expect(plan.file).toBe('/bin/sh');
      expect(plan.args).toEqual(['-c', 'echo oi']);
    }
  });

  it('trimOutput corta preservando a cauda e marca truncamento', () => {
    expect(trimOutput('curta')).toBe('curta');
    const long = 'x'.repeat(5000);
    const trimmed = trimOutput(long, 100);
    expect(trimmed.length).toBeLessThan(120);
    expect(trimmed.startsWith('[saída truncada]')).toBe(true);
    expect(trimmed.endsWith('x')).toBe(true);
  });
});
