import type { Agent, BaseItem, ProjectRef, Skill, UsageEvent } from './types';
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS } from './categories';
import type { AssetCategory } from './categories';
import { tagKey } from './tags';

export interface UsageCount {
  id: string;
  name: string;
  category: AssetCategory;
  count: number;
  favorite: boolean;
}

export interface CategoryCount {
  category: AssetCategory;
  label: string;
  count: number;
}

export interface DashboardSummary {
  projects: number;
  skills: number;
  agents: number;
  bases: number;
  favorites: number;
  projectsWithSkills: number;
  projectsWithAgents: number;
  unusedSkills: number;
  unusedAgents: number;
  totalCoversSkills: number; // nº de pares projeto-skill
  totalPairsAgents: number; // nº de pares projeto-agent
}

export interface TagUsage {
  tag: string;
  count: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  mostUsedSkills: UsageCount[];
  mostUsedAgents: UsageCount[];
  oldestProjects: { id: string; name: string; addedAt: string; skillCount: number; agentCount: number }[];
  categoryDistribution: CategoryCount[];
  topTags: TagUsage[];
}

function countUsage(
  items: { id: string; name: string; category: AssetCategory; favorite: boolean }[],
  idsUsed: string[],
  limit: number
): UsageCount[] {
  const map = new Map<string, number>();
  for (const id of idsUsed) map.set(id, (map.get(id) ?? 0) + 1);
  return items
    .map((item) => ({ ...item, count: map.get(item.id) ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface DashboardOptions {
  categories?: AssetCategory[]; // vazio = todas
  favoritesOnly?: boolean;
}

function applyFilters(items: { category: AssetCategory; favorite: boolean }[], options?: DashboardOptions): boolean[] {
  return items.map(
    (item) =>
      (!options?.favoritesOnly || item.favorite) &&
      (!options?.categories || options.categories.length === 0 || options.categories.includes(item.category))
  );
}

export function computeDashboardData(
  skills: Skill[],
  agents: Agent[],
  bases: BaseItem[],
  projects: ProjectRef[],
  options?: DashboardOptions
): DashboardData {
  const keepSkills = applyFilters(skills, options);
  const keepAgents = applyFilters(agents, options);
  const visibleSkillIds = new Set(skills.filter((_, index) => keepSkills[index]).map((item) => item.id));
  const visibleAgentIds = new Set(agents.filter((_, index) => keepAgents[index]).map((item) => item.id));
  const filteredSkills = skills.filter((_, index) => keepSkills[index]);
  const filteredAgents = agents.filter((_, index) => keepAgents[index]);

  const skillUseIds: string[] = [];
  const agentUseIds: string[] = [];
  const tagCounts = new Map<string, TagUsage>();
  let projectsWithSkills = 0;
  let projectsWithAgents = 0;
  const projectRows: DashboardData['oldestProjects'] = [];
  for (const project of projects) {
    for (const id of project.skillIds) if (visibleSkillIds.has(id)) skillUseIds.push(id);
    for (const id of project.agentIds) if (visibleAgentIds.has(id)) agentUseIds.push(id);
    if (project.skillIds.length > 0) projectsWithSkills += 1;
    if (project.agentIds.length > 0) projectsWithAgents += 1;
    projectRows.push({
      id: project.id,
      name: project.name,
      addedAt: project.addedAt,
      skillCount: project.skillIds.length,
      agentCount: project.agentIds.length
    });
    const seen = new Set<string>();
    for (const raw of project.tags) {
      const tag = raw.trim();
      if (tag === '') continue;
      const key = tagKey(tag);
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = tagCounts.get(key);
      if (entry != null) entry.count += 1;
      else tagCounts.set(key, { tag, count: 1 });
    }
  }

  const usedSkillIds = new Set(skillUseIds);
  const usedAgentIds = new Set(agentUseIds);
  const summary: DashboardSummary = {
    projects: projects.length,
    skills: skills.length,
    agents: agents.length,
    bases: bases.length,
    favorites:
      skills.filter((s) => s.favorite).length +
      agents.filter((a) => a.favorite).length +
      bases.filter((b) => b.favorite).length,
    projectsWithSkills,
    projectsWithAgents,
    unusedSkills: skills.filter((s) => !usedSkillIds.has(s.id)).length,
    unusedAgents: agents.filter((a) => !usedAgentIds.has(a.id)).length,
    totalCoversSkills: skillUseIds.length,
    totalPairsAgents: agentUseIds.length
  };

  const categoryWeights = new Map<AssetCategory, number>();
  for (const skill of filteredSkills) {
    const uses = skillUseIds.filter((id) => id === skill.id).length;
    if (uses > 0) {
      const key = skill.category;
      categoryWeights.set(key, (categoryWeights.get(key) ?? 0) + uses);
    }
  }
  for (const agent of filteredAgents) {
    const uses = agentUseIds.filter((id) => id === agent.id).length;
    if (uses > 0) {
      const key = agent.category;
      categoryWeights.set(key, (categoryWeights.get(key) ?? 0) + uses);
    }
  }
  const categoryDistributionOut: CategoryCount[] = ASSET_CATEGORIES.map((category) => ({
    category,
    label: ASSET_CATEGORY_LABELS[category],
    count: categoryWeights.get(category) ?? 0
  })).filter((entry) => entry.count > 0);

  return {
    summary,
    mostUsedSkills: countUsage(filteredSkills, skillUseIds, 10),
    mostUsedAgents: countUsage(filteredAgents, agentUseIds, 10),
    oldestProjects: projectRows
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt))
      .slice(0, 8),
    categoryDistribution: categoryDistributionOut,
    topTags: [...tagCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10)
  };
}

export interface MonthUsage {
  year: number;
  month: number; // 1-12
  label: string; // ex.: "dez 25"
  count: number;
}

const MONTH_ABBREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Conta eventos de uso por mês nos últimos `months` meses (inclui o mês atual). */
export function computeMonthlyUsage(events: UsageEvent[], now: Date, months = 6): MonthUsage[] {
  const buckets = new Map<string, MonthUsage>();
  const list: MonthUsage[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const entry: MonthUsage = {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: `${MONTH_ABBREV[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`,
      count: 0
    };
    buckets.set(`${entry.year}-${entry.month}`, entry);
    list.push(entry);
  }
  for (const event of events) {
    const date = new Date(event.at);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    const entry = buckets.get(key);
    if (entry != null) entry.count += 1;
  }
  return list;
}

/** Serializa o dashboard como Markdown. */
export function buildDashboardMarkdown(data: DashboardData, usage: UsageEvent[] = [], now = new Date()): string {
  const lines: string[] = [];
  const summary = data.summary;
  lines.push('# Dashboard da biblioteca', '');
  lines.push(`Gerado em ${now.toISOString()}`, '');
  lines.push('## Resumo', '');
  lines.push(`- Projetos: ${summary.projects}`);
  lines.push(`- Skills: ${summary.skills} (${summary.unusedSkills} sem uso)`);
  lines.push(`- Agents: ${summary.agents} (${summary.unusedAgents} sem uso)`);
  lines.push(`- Bases: ${summary.bases}`);
  lines.push(`- Favoritos: ${summary.favorites}`);
  lines.push(`- Projetos com Skills: ${summary.projectsWithSkills}`);
  lines.push(`- Projetos com Agents: ${summary.projectsWithAgents}`, '');
  const section = (title: string, items: UsageCount[]): void => {
    lines.push(`## ${title}`, '');
    if (items.length === 0) {
      lines.push('_Nenhum uso registrado._', '');
      return;
    }
    for (const item of items) lines.push(`- ${item.name} — ${item.count} projeto(s)`);
    lines.push('');
  };
  section('Skills mais usadas', data.mostUsedSkills);
  section('Agents mais usados', data.mostUsedAgents);
  lines.push('## Uso por categoria', '');
  for (const entry of data.categoryDistribution) {
    lines.push(`- ${entry.label}: ${entry.count}`);
  }
  lines.push('');
  const monthly = computeMonthlyUsage(usage, now);
  lines.push('## Uso mensal (últimos 6 meses)', '');
  for (const entry of monthly) lines.push(`- ${entry.label}: ${entry.count}`);
  lines.push('');
  if (data.topTags.length > 0) {
    lines.push('## Tags mais usadas', '');
    for (const tag of data.topTags) lines.push(`- #${tag.tag}: ${tag.count}`);
    lines.push('');
  }
  if (data.oldestProjects.length > 0) {
    lines.push('## Projetos mais antigos', '');
    for (const project of data.oldestProjects) {
      lines.push(`- ${project.name} (${project.addedAt.slice(0, 10)}) — ${project.skillCount} skills, ${project.agentCount} agents`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
