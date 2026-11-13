export type AgentBudgetLimit = 'execution' | 'daily';

export interface AgentBudgetEvaluation {
  warning: boolean;
  exceeded: AgentBudgetLimit | null;
}

export interface AgentBudgetInput {
  runCostUsd: number;
  dailyCostUsd: number;
  runLimitUsd?: number;
  dailyLimitUsd?: number;
}

export function isProtectedBranch(branch: string | null | undefined): boolean {
  return branch === 'main' || branch === 'master';
}

export function assertProtectedBranchPush(branch: string | null | undefined, simpleMode: boolean, confirmed: boolean): void {
  if (simpleMode && isProtectedBranch(branch) && !confirmed) {
    throw new Error(`Confirme o envio para a linha principal (${branch}) antes de continuar.`);
  }
}

export function buildWorkingBranchName(prompt: string | undefined, date: Date, existing: readonly string[]): string {
  const slug = (prompt ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '') || 'alteracao';
  const base = `glibrary/${date.toISOString().slice(0, 10)}-${slug}`;
  const names = new Set(existing.map((name) => name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  let suffix = 2;
  while (names.has(`${base}-${suffix}`.toLowerCase())) suffix += 1;
  return `${base}-${suffix}`;
}

export function evaluateAgentBudget(input: AgentBudgetInput): AgentBudgetEvaluation {
  const exceeded: AgentBudgetLimit | null =
    input.dailyLimitUsd != null && input.dailyCostUsd >= input.dailyLimitUsd
      ? 'daily'
      : input.runLimitUsd != null && input.runCostUsd >= input.runLimitUsd
        ? 'execution'
        : null;
  const warning =
    (input.runLimitUsd != null && input.runCostUsd >= input.runLimitUsd * 0.8) ||
    (input.dailyLimitUsd != null && input.dailyCostUsd >= input.dailyLimitUsd * 0.8);
  return { warning, exceeded };
}

