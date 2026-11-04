import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { discoverAgents, discoverSkills, parseSkillMetadata } from '../src/main/services/skills-scan';
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
    const { skills } = await discoverSkills([root], []);
    expect(skills.map((s) => s.name).sort()).toEqual(['Filha', 'Raiz']);
    expect(skills.every((s) => s.source === root)).toBe(true);
    expect(skills.find((s) => s.name === 'Raiz')).toMatchObject({ tags: [], favorite: false });
  });

  it('preserva id, tags e favorite de skills existentes na ressincronização', async () => {
    const root = join(dir, 'skills');
    const skillDir = await writeSkill(root, 'demo', '---\nname: Demo\n---\n');
    const existing: Skill[] = [
      {
        id: 'id-fixo',
        name: 'Demo',
        category: 'codigo',
        path: skillDir,
        source: root,
        tags: ['docs', 'web'],
        favorite: true,
        addedAt: '2026-01-01T00:00:00.000Z'
      }
    ];
    const { skills } = await discoverSkills([root], existing);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      id: 'id-fixo',
      tags: ['docs', 'web'],
      favorite: true,
      addedAt: '2026-01-01T00:00:00.000Z'
    });
    expect(skills[0].updatedAt).toBeTruthy();
  });

  it('rescan atualiza name/description do frontmatter e preserva id, tags e favorite', async () => {
    const root = join(dir, 'skills');
    const skillDir = await writeSkill(root, 'demo', '---\nname: Antiga\n---\n');
    const existing: Skill[] = [
      {
        id: 'id-fixo',
        name: 'Antiga',
        category: 'design',
        path: skillDir,
        source: root,
        tags: ['docs'],
        favorite: true,
        addedAt: '2026-01-01T00:00:00.000Z'
      }
    ];
    await fs.writeFile(
      join(skillDir, 'SKILL.md'),
      '---\nname: Nova\ndescription: Atualizada\n---\n',
      'utf-8'
    );
    const { skills } = await discoverSkills([root], existing);
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      id: 'id-fixo',
      name: 'Nova',
      description: 'Atualizada',
      tags: ['docs'],
      favorite: true,
      addedAt: '2026-01-01T00:00:00.000Z'
    });
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
    const { skills } = await discoverSkills([root, join(dir, 'nao-existe')], []);
    expect(skills.map((s) => s.name)).toEqual(['Uma']);
  });
});

describe('categoria das skills', () => {
  it('deriva a categoria do frontmatter e cai em "outros" quando desconhecida', async () => {
    const root = join(dir, 'skills');
    await writeSkill(root, 'design', '---\nname: D\ncategory: design\n---\n');
    await writeSkill(root, 'estranha', '---\nname: E\ncategory: qualquer-coisa\n---\n');
    await writeSkill(root, 'sem', '---\nname: S\n---\n');
    const { skills, issues } = await discoverSkills([root], []);
    expect(skills.find((s) => s.name === 'D')?.category).toBe('design');
    expect(skills.find((s) => s.name === 'E')?.category).toBe('outros');
    expect(skills.find((s) => s.name === 'S')?.category).toBe('outros');
    const issueE = issues.find((issue) => issue.name === 'E');
    expect(issueE?.reason).toContain('categoria desconhecida "qualquer-coisa"');
    expect(issues.find((issue) => issue.name === 'D')).toBeUndefined();
  });

  it('preserva a categoria definida pelo usuário após rescan', async () => {
    const root = join(dir, 'skills');
    const skillDir = await writeSkill(root, 'demo', '---\nname: Demo\ncategory: devops\n---\n');
    const { skills } = await discoverSkills([root], [
      { id: 'a', name: 'Demo', category: 'testes', path: skillDir, source: root, tags: [], favorite: false, addedAt: '2026-01-01T00:00:00.000Z' }
    ]);
    expect(skills[0].category).toBe('testes');
  });

  it('reporta problemas de frontmatter (sem frontmatter, sem name, arquivo vazio)', async () => {
    const root = join(dir, 'skills');
    await writeSkill(root, 'sem-fm', '# só corpo');
    await writeSkill(root, 'sem-nome', '---\ndescription: x\n---\ncorpo');
    await writeSkill(root, 'vazio', '   ');
    const { skills, issues } = await discoverSkills([root], []);
    expect(skills).toHaveLength(3);
    const byFolder = (folder: string): string => join(root, folder, 'SKILL.md').toLowerCase();
    expect(issues.find((i) => i.path.toLowerCase() === byFolder('sem-fm'))?.reason).toBe('sem frontmatter (---)');
    expect(issues.find((i) => i.path.toLowerCase() === byFolder('sem-nome'))?.reason).toContain('sem "name:"');
    expect(issues.find((i) => i.path.toLowerCase() === byFolder('vazio'))?.reason).toBe('arquivo vazio');
  });
});

describe('discoverAgents', () => {
  it('descobre arquivos .md de agente na raiz e em subpastas, sem SKILL.md', async () => {
    const root = join(dir, 'agents');
    await fs.mkdir(join(root, 'revisao'), { recursive: true });
    await fs.writeFile(join(root, 'code-reviewer.md'), '---\nname: Revisor\ncategory: codigo\ndescription: Revisa código\n---\n', 'utf-8');
    await fs.writeFile(join(root, 'revisao', 'ux-check.md'), '---\nname: UX\n---\n', 'utf-8');
    await fs.writeFile(join(root, 'revisao', 'SKILL.md'), '---\nname: Sobrenome\n---\n', 'utf-8');
    await fs.writeFile(join(root, 'notas.txt'), 'x', 'utf-8');
    const { agents } = await discoverAgents([root], []);
    expect(agents.map((a) => a.name).sort()).toEqual(['Revisor', 'UX']);
    const revisor = agents.find((a) => a.name === 'Revisor');
    expect(revisor).toMatchObject({ category: 'codigo', description: 'Revisa código', source: root });
    expect(revisor?.file).toBe(join(root, 'code-reviewer.md'));
  });

  it('usa o nome do arquivo como fallback e categoria "outros" por padrão', async () => {
    const root = join(dir, 'agents');
    await fs.mkdir(root, { recursive: true });
    await fs.writeFile(join(root, 'sem-frontmatter.md'), '# corpo\n', 'utf-8');
    const { agents, issues } = await discoverAgents([root], []);
    expect(agents[0]).toMatchObject({ name: 'sem-frontmatter', category: 'outros' });
    expect(issues[0]).toMatchObject({ type: 'agent', reason: 'sem frontmatter (---)' });
  });

  it('preserva id, tags, favorite e categoria do usuário no rescan', async () => {
    const root = join(dir, 'agents');
    await fs.mkdir(root, { recursive: true });
    const file = join(root, 'code-reviewer.md');
    await fs.writeFile(file, '---\nname: Revisor\n---\n', 'utf-8');
    const { agents } = await discoverAgents([root], [
      { id: 'ag-1', name: 'Revisor', category: 'testes', path: root, file, source: root, tags: ['qa'], favorite: true, addedAt: '2026-01-01T00:00:00.000Z' }
    ]);
    expect(agents[0]).toMatchObject({ id: 'ag-1', category: 'testes', tags: ['qa'], favorite: true });
  });
});
