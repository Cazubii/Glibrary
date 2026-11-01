import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { readdir, readFile, stat } from 'fs/promises';
import { basename, join, resolve } from 'path';
import type { Skill } from '../../shared/types';

export function parseSkillMetadata(
  content: string,
  fallback: string
): { name: string; description?: string } {
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/);
  const name =
    frontmatter?.[1]?.match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim() ?? fallback;
  const description = frontmatter?.[1]?.match(/^description:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
  return { name, ...(description ? { description } : {}) };
}

export async function discoverSkills(roots: string[], existing: Skill[]): Promise<Skill[]> {
  const byPath = new Map(existing.map((skill) => [resolve(skill.path).toLowerCase(), skill]));
  const discovered = new Map<string, Skill>();
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
      const meta = parseSkillMetadata(content, basename(path));
      discovered.set(key, {
        id: previous?.id ?? randomUUID(),
        name: meta.name,
        ...(meta.description ? { description: meta.description } : {}),
        path,
        source: resolve(root),
        tags: previous?.tags ?? [],
        favorite: previous?.favorite ?? false,
        addedAt: previous?.addedAt ?? new Date().toISOString(),
        updatedAt: new Date((await stat(file)).mtimeMs).toISOString()
      });
    }
  }
  return [...discovered.values()];
}
