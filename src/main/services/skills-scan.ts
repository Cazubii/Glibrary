import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { basename, join, resolve } from 'path';
import type { Agent, ScanIssue, Skill, SkillsScanResult, AgentsScanResult } from '../../shared/types';
import { toAssetCategory, isKnownAssetCategoryRaw } from '../../shared/categories';

export interface AssetFrontmatter {
  name: string;
  description?: string;
  category?: string;
}

export function parseAssetFrontmatter(
  content: string,
  fallback: string
): AssetFrontmatter {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const name =
    frontmatter?.[1]?.match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() ?? fallback;
  const description = frontmatter?.[1]?.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
  const category = frontmatter?.[1]?.match(/^category:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
  return { name, ...(description ? { description } : {}), ...(category ? { category } : {}) };
}

export function parseSkillMetadata(
  content: string,
  fallback: string
): { name: string; description?: string } {
  const { name, description } = parseAssetFrontmatter(content, fallback);
  return { name, ...(description ? { description } : {}) };
}

const IGNORED_DIR_NAMES = new Set(['node_modules', '.git', '.vite', '.cache']);

/** Problemas de metadados do conteúdo de um SKILL.md ou arquivo de agente. */
function contentIssues(
  content: string,
  type: 'skill' | 'agent',
  file: string,
  meta: AssetFrontmatter
): ScanIssue[] {
  const issues: ScanIssue[] = [];
  const fm = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  if (!content.trim()) {
    issues.push({ type, path: file, reason: 'arquivo vazio' });
    return issues;
  }
  if (!fm) {
    issues.push({ type, path: file, reason: 'sem frontmatter (---)' });
  } else if (!/^name:\s*\S/m.test(fm[1])) {
    issues.push({ type, path: file, name: meta.name, reason: `sem "name:" no frontmatter (usando "${meta.name}")` });
  }
  if (meta.category !== undefined && !isKnownAssetCategoryRaw(meta.category) && toAssetCategory(meta.category) === 'outros') {
    issues.push({
      type,
      path: file,
      name: meta.name,
      reason: `categoria desconhecida "${meta.category}" (tratada como "outros")`
    });
  }
  return issues;
}

/** Descobre skills (`SKILL.md`) nas pastas configuradas, preservando id/tags/categoria. */
export async function discoverSkills(roots: string[], existing: Skill[]): Promise<SkillsScanResult> {
  const byPath = new Map(existing.map((skill) => [resolve(skill.path).toLowerCase(), skill]));
  const discovered = new Map<string, Skill>();
  const issues: ScanIssue[] = [];
  for (const root of roots) {
    if (!existsSync(root) || !(await stat(root)).isDirectory()) continue;
    const entries = await readdir(root, { withFileTypes: true });
    const candidates = [
      join(root, 'SKILL.md'),
      ...entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name, 'SKILL.md'))
    ];
    for (const file of candidates) {
      if (!existsSync(file)) continue;
      const path = resolve(file, '..');
      const key = path.toLowerCase();
      if (discovered.has(key)) continue;
      const content = await readFile(file, 'utf8');
      const previous = byPath.get(key);
      const meta = parseAssetFrontmatter(content, basename(path));
      issues.push(...contentIssues(content, 'skill', file, meta));
      discovered.set(key, {
        id: previous?.id ?? randomUUID(),
        name: meta.name,
        ...(meta.description ? { description: meta.description } : {}),
        category: previous?.category ?? toAssetCategory(meta.category),
        path,
        source: resolve(root),
        tags: previous?.tags ?? [],
        favorite: previous?.favorite ?? false,
        addedAt: previous?.addedAt ?? new Date().toISOString(),
        updatedAt: new Date((await stat(file)).mtimeMs).toISOString()
      });
    }
  }
  return { skills: [...discovered.values()], issues };
}

/** Descobre agentes (arquivos .md de agente) nas pastas configuradas, preservando id/tags/categoria. */
export async function discoverAgents(roots: string[], existing: Agent[]): Promise<AgentsScanResult> {
  const byPath = new Map(
    existing.map((agent) => [resolve(agent.file).toLowerCase(), agent])
  );
  const discovered = new Map<string, Agent>();
  const issues: ScanIssue[] = [];
  for (const root of roots) {
    if (!existsSync(root) || !(await stat(root)).isDirectory()) continue;
    const resolvedRoot = resolve(root);
    const entries = await readdir(root, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) continue;
      if (!entry.name.toLowerCase().endsWith('.md')) continue;
      if (entry.name.toLowerCase() === 'skill.md') continue;
      files.push(join(resolvedRoot, entry.name));
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || IGNORED_DIR_NAMES.has(entry.name)) continue;
      const dir = join(resolvedRoot, entry.name);
      const dirEntries = await readdir(dir, { withFileTypes: true });
      for (const file of dirEntries) {
        if (!file.isFile() || !file.name.toLowerCase().endsWith('.md')) continue;
        if (file.name.toLowerCase() === 'skill.md') continue;
        files.push(join(dir, file.name));
      }
    }
    for (const file of files) {
      const key = file.toLowerCase();
      if (discovered.has(key)) continue;
      const content = await readFile(file, 'utf8');
      const previous = byPath.get(key);
      const meta = parseAssetFrontmatter(content, basename(file, '.md'));
      issues.push(...contentIssues(content, 'agent', file, meta));
      discovered.set(key, {
        id: previous?.id ?? randomUUID(),
        name: meta.name,
        ...(meta.description ? { description: meta.description } : {}),
        category: previous?.category ?? toAssetCategory(meta.category),
        path: resolve(file, '..'),
        file,
        source: resolvedRoot,
        tags: previous?.tags ?? [],
        favorite: previous?.favorite ?? false,
        addedAt: previous?.addedAt ?? new Date().toISOString(),
        updatedAt: new Date((await stat(file)).mtimeMs).toISOString()
      });
    }
  }
  return { agents: [...discovered.values()], issues };
}
