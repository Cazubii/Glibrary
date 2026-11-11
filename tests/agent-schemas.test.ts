import { describe, expect, it } from 'vitest';
import {
  AgentProfileSchema,
  AgentProfileInputSchema,
  AgentProfileUpdateInputSchema,
  AgentRunSchema,
  AgentRunStartInputSchema,
  AgentIdInputSchema
} from '../src/shared/schemas';

describe('Schemas do painel de agentes', () => {
  it('AgentProfileInputSchema aplica args padrão', () => {
    const input = AgentProfileInputSchema.parse({ name: 'Claude', repoId: 'r1', command: 'claude' });
    expect(input.args).toEqual([]);
  });

  it('AgentProfileInputSchema rejeita comando vazio', () => {
    expect(() =>
      AgentProfileInputSchema.parse({ name: 'x', repoId: 'r1', command: '  ' })
    ).toThrow();
  });

  it('AgentProfileUpdateInputSchema exige id e patch sem default de args', () => {
    const ok = AgentProfileUpdateInputSchema.parse({ id: 'p1', patch: { name: 'novo' } });
    expect(ok.patch.name).toBe('novo');
    expect(ok.patch.args).toBeUndefined();
    expect(() => AgentProfileUpdateInputSchema.parse({ patch: {} })).toThrow();
  });

  it('AgentRunStartInputSchema aceita prompt opcional e rejeita campos extras', () => {
    const ok = AgentRunStartInputSchema.parse({ profileId: 'p1', prompt: 'oi' });
    expect(ok.prompt).toBe('oi');
    expect(() => AgentRunStartInputSchema.parse({ profileId: '' })).toThrow();
    expect(() => AgentRunStartInputSchema.parse({ profileId: 'p1', extra: 1 })).toThrow();
  });

  it('AgentRunSchema valida run e status enum', () => {
    const run = AgentRunSchema.parse({
      id: 'r1', profileId: 'p1', profileName: 'n', repoId: 'repo', repoName: 'demo',
      command: 'claude "oi"', status: 'running', startedAt: '2026-01-01T00:00:00Z', logFile: ''
    });
    expect(run.status).toBe('running');
    expect(() => AgentRunSchema.parse({ ...run, status: 'x' })).toThrow();
  });

  it('AgentProfileSchema valida perfil completo', () => {
    const profile = AgentProfileSchema.parse({
      id: 'p1',
      name: 'Claude',
      repoId: 'r1',
      command: 'claude',
      args: ['--resume'],
      createdAt: '2026-01-01T00:00:00Z'
    });
    expect(profile.lastRunAt).toBeUndefined();
    expect(profile.args).toEqual(['--resume']);
  });

  it('AgentIdInputSchema exige id', () => {
    expect(AgentIdInputSchema.parse({ id: 'x' })).toEqual({ id: 'x' });
    expect(() => AgentIdInputSchema.parse({})).toThrow();
  });
});
