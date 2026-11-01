import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { discoverSkills, parseSkillMetadata } from '../src/main/services/skills-scan';
import type { Skill } from '../src/shared/types';

let dir: string;
let counter = 0;

beforeEach(async () => {
  dir = join(tmpdir(), `glib-scan-${Date.now()}-${counter++}`);
  await fs.mkdir(dir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

async function writeSkill(root: string, folder: string, body: string): Promise<string> {
  const skillDir = join(root, folder);
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(join(skillDir, 'SKILL.md'), body, 'utf-8');
  return skillDir;
}

describe('parseSkillMetadata', () => {
  it('lê name e description do frontmatter', () => {
    const meta = parseSkillMetadata(
      '---\nname: "Minha skill"\ndescription: Faz coisas\n---\n# corpo',
      'fallback'
    );
    expect(meta).toEqual({ name: 'Minha skill', description: 'Faz coisas' });
  });

  it('usa fallback quando não há frontmatter', () => {
    expect(parseSkillMetadata('# só corpo', 'pasta')).toEqual({ name: 'pasta' });
  });
});

describe('discoverSkills', () => {
  it('descobre SKILL.md na raiz e em pastas filhas diretas', async () => {
    const root = join(dir, 'skills');
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(join(root, 'SKILL.md'), '---\nname: Raiz\n---\n', 'utf-8');
    await writeSkill(root, 'filha', '---\nname: Filha\n---\n');
    const skills = await discoverSkills([root], []);
    expect(skills.map((s) => s.name).sort()).toEqual(['Filha', 'Raiz']);
    expect(skills.every((s) => s.source === root)).toBe(true);
  });

  it('preserva id, tags e favorite de skills existentes na ressincronização', async () => {
    const root = join(dir, 'skills');
    const skillDir = await writeSkill(root, 'demo', '---\nname: Demo\n---\n');
    const existing: Skill[] = [
      {
        id: 'id-fixo',
        name: 'Demo',
        path: skillDir,
        source: root,
        tags: ['docs', 'web'],
        favorite: true,
        addedAt: '2026-01-01T00:00:00.000Z'
      }
    ];
    const skills = await discoverSkills([root], existing);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      id: 'id-fixo',
      tags: ['docs', 'web'],
      favorite: true,
      addedAt: '2026-01-01T00:00:00.000Z'
    });
    expect(skills[0].updatedAt).toBeTruthy();
  });

  it('ignora pastas inexistentes e não varre subpastas além das diretas', async () => {
    const root = join(dir, 'skills');
    await writeSkill(root, 'uma', '---\nname: Uma\n---\n');
    await fs.mkdir(join(root, 'uma', 'nested'), { recursive: true });
    await fs.writeFile(
      join(root, 'uma', 'nested', 'SKILL.md'),
      '---\nname: Nested\n---\n',
      'utf-8'
    );
    const skills = await discoverSkills([root, join(dir, 'nao-existe')], []);
    expect(skills.map((s) => s.name)).toEqual(['Uma']);
  });
});
