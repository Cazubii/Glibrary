import { describe, expect, it } from 'vitest';
import { assertProtectedBranchPush, buildWorkingBranchName, evaluateAgentBudget, isProtectedBranch } from '../src/main/services/git-protection';

describe('git protection rules', () => {
  it('protects only the conventional main branches', () => {
    expect(isProtectedBranch('main')).toBe(true);
    expect(isProtectedBranch('master')).toBe(true);
    expect(isProtectedBranch('Main')).toBe(false);
    expect(isProtectedBranch('feature/main')).toBe(false);
  });

  it('requires confirmation before sending to the main branch in simple mode', () => {
    expect(() => assertProtectedBranchPush('main', true, false)).toThrow('Confirme o envio');
    expect(() => assertProtectedBranchPush('main', true, true)).not.toThrow();
    expect(() => assertProtectedBranchPush('feature/login', true, false)).not.toThrow();
    expect(() => assertProtectedBranchPush('main', false, false)).not.toThrow();
  });

  it('creates a readable, unique Glibrary branch name', () => {
    const date = new Date('2026-11-13T12:00:00.000Z');
    const first = 'glibrary/2026-11-13-corrige-login-do-github';
    expect(buildWorkingBranchName('Corrige login do GitHub', date, [])).toBe(first);
    expect(buildWorkingBranchName('Corrige login do GitHub', date, [first])).toBe(`${first}-2`);
  });

  it('warns at 80 percent and reports the first exceeded limit', () => {
    expect(evaluateAgentBudget({ runCostUsd: 8, dailyCostUsd: 15, runLimitUsd: 10, dailyLimitUsd: 20 })).toEqual({
      warning: true,
      exceeded: null
    });
    expect(evaluateAgentBudget({ runCostUsd: 10, dailyCostUsd: 10, runLimitUsd: 10, dailyLimitUsd: 20 })).toEqual({
      warning: true,
      exceeded: 'execution'
    });
    expect(evaluateAgentBudget({ runCostUsd: 2, dailyCostUsd: 20, runLimitUsd: 10, dailyLimitUsd: 20 })).toEqual({
      warning: true,
      exceeded: 'daily'
    });
  });
});
