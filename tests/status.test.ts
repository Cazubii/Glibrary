import { describe, it, expect } from 'vitest';
import {
  stabilizeOnStartup,
  markMissingOnStartup,
  applyStartupCorrections,
  isUnstableStatus
} from '../src/shared/status';

describe('isUnstableStatus', () => {
  it('marca cloning, installing e running como instáveis', () => {
    expect(isUnstableStatus('cloning')).toBe(true);
    expect(isUnstableStatus('installing')).toBe(true);
    expect(isUnstableStatus('running')).toBe(true);
  });

  it('não marca statuses estáveis', () => {
    for (const s of ['not_cloned', 'cloned', 'installed', 'error', 'missing'] as const) {
      expect(isUnstableStatus(s)).toBe(false);
    }
  });
});

describe('stabilizeOnStartup', () => {
  it('running volta para installed quando tem installedAt', () => {
    expect(stabilizeOnStartup('running', true, true)).toBe('installed');
  });

  it('running volta para cloned quando não tem installedAt', () => {
    expect(stabilizeOnStartup('running', false, true)).toBe('cloned');
  });

  it('installing volta para cloned', () => {
    expect(stabilizeOnStartup('installing', false, true)).toBe('cloned');
  });

  it('cloning sem localPath volta para not_cloned', () => {
    expect(stabilizeOnStartup('cloning', false, false)).toBe('not_cloned');
  });

  it('status estável não muda', () => {
    expect(stabilizeOnStartup('installed', true, true)).toBe('installed');
    expect(stabilizeOnStartup('error', false, true)).toBe('error');
    expect(stabilizeOnStartup('not_cloned', false, false)).toBe('not_cloned');
  });
});

describe('markMissingOnStartup', () => {
  it('pasta que sumiu vira missing', () => {
    expect(markMissingOnStartup('cloned', true, false)).toBe('missing');
    expect(markMissingOnStartup('installed', true, false)).toBe('missing');
    expect(markMissingOnStartup('running', true, false)).toBe('missing');
  });

  it('pasta existente não muda', () => {
    expect(markMissingOnStartup('cloned', true, true)).toBe('cloned');
  });

  it('repo sem localPath (not_cloned) não vira missing', () => {
    expect(markMissingOnStartup('not_cloned', false, false)).toBe('not_cloned');
  });
});

describe('applyStartupCorrections', () => {
  it('corrige status preso e pasta sumida de uma vez', () => {
    const repo = {
      id: 'x',
      name: 'x',
      status: 'running' as const,
      localPath: '/tmp/x',
      tags: [],
      favorite: false,
      addedAt: new Date().toISOString()
    };
    const { status, changed } = applyStartupCorrections(repo, false);
    expect(status).toBe('missing');
    expect(changed).toBe(true);
  });

  it('não reporta mudança quando nada precisa corrigir', () => {
    const repo = {
      id: 'x',
      name: 'x',
      status: 'installed' as const,
      localPath: '/tmp/x',
      installedAt: new Date().toISOString(),
      tags: [],
      favorite: false,
      addedAt: new Date().toISOString()
    };
    const { status, changed } = applyStartupCorrections(repo, true);
    expect(status).toBe('installed');
    expect(changed).toBe(false);
  });
});
