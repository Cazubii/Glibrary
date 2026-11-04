import { describe, it, expect } from 'vitest';
import { buildDashboardMarkdown, computeDashboardData, computeMonthlyUsage } from '../src/shared/dashboard';
import type { Agent, BaseItem, ProjectRef, Skill, UsageEvent } from '../src/shared/types';

function skill(id: string, over: Partial<Skill> = {}): Skill {
  return { id, name: `skill-${id}`, category: 'codigo', path: `/p/${id}`, source: '/p', tags: [], favorite: false, addedAt: '2026-01-01T00:00:00.000Z', ...over };
}
function agent(id: string, over: Partial<Agent> = {}): Agent {
  return { id, name: `agent-${id}`, category: 'testes', path: `/a/${id}`, file: `/a/${id}.md`, source: '/a', tags: [], favorite: false, addedAt: '2026-01-01T00:00:00.000Z', ...over };
}
function base(id: string): BaseItem {
  return { id, name: `base-${id}`, tags: [], favorite: false, addedAt: '2026-01-01T00:00:00.000Z' };
}
function project(id: string, over: Partial<ProjectRef> = {}): ProjectRef {
  return { id, name: `proj-${id}`, tags: [], favorite: false, skillIds: [], agentIds: [], baseIds: [], addedAt: '2026-06-01T00:00:00.000Z', ...over };
}

describe('computeDashboardData', () => {
  it('ranqueia skills e agents por nº de projetos que os usam', () => {
    const data = computeDashboardData(
      [skill('s1'), skill('s2'), skill('s3')],
      [agent('a1'), agent('a2')],
      [base('b1')],
      [
        project('p1', { skillIds: ['s1', 's2'], agentIds: ['a1'] }),
        project('p2', { skillIds: ['s1'] }),
        project('p3', { skillIds: ['s1', 's3'], agentIds: ['a1', 'a2'] })
      ]
    );
    expect(data.mostUsedSkills[0]).toMatchObject({ id: 's1', count: 3 });
    expect(data.mostUsedSkills[1]).toMatchObject({ id: 's2', count: 1 });
    expect(data.mostUsedAgents[0]).toMatchObject({ id: 'a1', count: 2 });
    expect(data.mostUsedAgents[1]).toMatchObject({ id: 'a2', count: 1 });
    expect(data.summary.totalCoversSkills).toBe(5);
    expect(data.summary.totalPairsAgents).toBe(3);
  });

  it('aponta skills/agents sem uso e cobertura de projetos', () => {
    const data = computeDashboardData(
      [skill('s1'), skill('s2')],
      [agent('a1')],
      [],
      [project('p1', { skillIds: ['s1'] })]
    );
    expect(data.summary.unusedSkills).toBe(1);
    expect(data.summary.unusedAgents).toBe(1);
    expect(data.summary.projectsWithSkills).toBe(1);
    expect(data.summary.projectsWithAgents).toBe(0);
    expect(data.mostUsedAgents).toEqual([]);
  });

  it('agrupa uso por categoria só de itens com uso', () => {
    const data = computeDashboardData(
      [skill('s1', { category: 'design' }), skill('s2', { category: 'devops' })],
      [agent('a1', { category: 'design' })],
      [],
      [project('p1', { skillIds: ['s1'], agentIds: ['a1'] })]
    );
    const design = data.categoryDistribution.find((c) => c.category === 'design');
    expect(design).toMatchObject({ count: 2 });
    expect(data.categoryDistribution.find((c) => c.category === 'devops')).toBeUndefined();
  });

  it('agrega tags de projetos respeitando case-insensitive e top', () => {
    const data = computeDashboardData(
      [], [], [],
      [
        project('p1', { tags: ['WEB', 'web', 'api'] }),
        project('p2', { tags: ['Web'] })
      ]
    );
    expect(data.topTags[0]).toMatchObject({ tag: 'WEB', count: 2 });
    expect(data.topTags[1]).toMatchObject({ count: 1 });
    expect(data.summary.bases).toBe(0);
  });

  it('aplica filtros de categoria e somente favoritos', () => {
    const skills = [skill('s1', { category: 'design', favorite: false }), skill('s2', { category: 'codigo', favorite: true })];
    const agents = [agent('a1', { category: 'testes', favorite: true })];
    const projects = [
      project('p1', { skillIds: ['s1', 's2'], agentIds: ['a1'] })
    ];
    const filtered = computeDashboardData(skills, agents, [], projects, { categories: ['codigo'], favoritesOnly: true });
    expect(filtered.mostUsedSkills.map((s) => s.id)).toEqual(['s2']);
    expect(filtered.mostUsedAgents).toEqual([]);
    expect(filtered.summary.skills).toBe(2);
    const all = computeDashboardData(skills, agents, [], projects);
    expect(all.mostUsedSkills.map((s) => s.id)).toEqual(['s1', 's2']);
    expect(all.mostUsedAgents[0]).toMatchObject({ id: 'a1', count: 1 });
  });
});

describe('computeMonthlyUsage e buildDashboardMarkdown', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('computa uso por mês nos últimos 6 meses', () => {
    const events: UsageEvent[] = [
      { id: 'e1', kind: 'skill', assetId: 's1', at: '2026-06-01T10:00:00.000Z' },
      { id: 'e2', kind: 'agent', assetId: 'a1', at: '2026-06-20T10:00:00.000Z' },
      { id: 'e3', kind: 'skill', assetId: 's1', at: '2026-06-25T10:00:00.000Z' },
      { id: 'e4', kind: 'skill', assetId: 's1', at: '2026-01-05T10:00:00.000Z' },
      { id: 'e5', kind: 'skill', assetId: 's1', at: 'data-impossível' }
    ];
    const monthly = computeMonthlyUsage(events, now, 6);
    expect(monthly).toHaveLength(6);
    expect(monthly[5]).toMatchObject({ year: 2026, month: 6, count: 3 });
    expect(monthly[0]).toMatchObject({ year: 2026, month: 1, count: 1 });
    expect(monthly.reduce((sum, entry) => sum + entry.count, 0)).toBe(4);
    expect(monthly[5].label).toBe('jun 26');
  });

  it('serializa o dashboard em Markdown com seções', () => {
    const data = computeDashboardData(
      [skill('s1', { name: 'Docs', tags: ['x'] })],
      [agent('a1', { name: 'Revisor' })],
      [],
      [project('p1', { name: 'Portal', skillIds: ['s1'], agentIds: ['a1'], tags: ['web'] })]
    );
    const markdown = buildDashboardMarkdown(data, [{ id: 'e', kind: 'skill', assetId: 's1', at: '2026-06-01T00:00:00.000Z' }], now);
    expect(markdown).toContain('# Dashboard da biblioteca');
    expect(markdown).toContain('## Skills mais usadas');
    expect(markdown).toContain('- Docs — 1 projeto(s)');
    expect(markdown).toContain('- Revisor — 1 projeto(s)');
    expect(markdown).toContain('#web');
    expect(markdown).toContain('jun 26: 1');
  });
});
