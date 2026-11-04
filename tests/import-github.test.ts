import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parseGithubUrl, importAgentsFromGithub, importSkillFromGithub } from '../src/main/services/import-github';

describe('parseGithubUrl', () => {
  it('extrai owner/repo de URLs comuns', () => {
    expect(parseGithubUrl('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
    expect(parseGithubUrl('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
    expect(parseGithubUrl('https://github.com/owner/repo/')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('rejeita URLs que não são do GitHub', () => {
    expect(() => parseGithubUrl('https://gitlab.com/owner/repo')).toThrow('inválida');
  });
});

describe('importSkillFromGithub', () => {
  let dir: string;
  beforeEach(async () => {
    dir = join(tmpdir(), `glib-import-${Date.now()}`);
    await fs.mkdir(dir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('baixa o SKILL.md e escreve em <folder>/<repo>/SKILL.md', async () => {
    const calls: string[] = [];
    const result = await importSkillFromGithub({
      remoteUrl: 'https://github.com/owner/repo-demo',
      skillFolders: [dir],
      existingSkills: [],
      fetchJson: async (url) => { calls.push(url); return { default_branch: 'main' }; },
      fetchText: async (url) => { calls.push(url); return '---\nname: Demo importada\n---\ncorpo'; }
    });
    expect(result.repoName).toBe('repo-demo');
    expect(calls.some((url) => url.includes('/main/SKILL.md'))).toBe(true);
    expect(calls.some((url) => url.includes('api.github.com/repos/owner/repo-demo'))).toBe(true);
    const saved = await fs.readFile(join(dir, 'repo-demo', 'SKILL.md'), 'utf-8');
    expect(saved).toContain('Demo importada');
  });

  it('erro 404 do SKILL.md e pasta/destino já ocupada viram erros claros', async () => {
    const textFetcher: (url: string) => Promise<string> = async () => {
      throw { statusCode: 404, message: 'not found' };
    };
    await expect(
      importSkillFromGithub({
        remoteUrl: 'https://github.com/owner/sem-skill',
        skillFolders: [dir],
        existingSkills: [],
        fetchJson: async () => ({ default_branch: 'main' }),
        fetchText: textFetcher
      })
    ).rejects.toThrow('não encontrado na raiz');

    await fs.mkdir(join(dir, 'repo-demo2'), { recursive: true });
    await fs.writeFile(join(dir, 'repo-demo2', 'SKILL.md'), '---\nname: x\n---\n', 'utf-8');
    await expect(
      importSkillFromGithub({
        remoteUrl: 'https://github.com/owner/repo-demo2',
        skillFolders: [dir],
        existingSkills: [],
        fetchJson: async () => ({ default_branch: 'main' }),
        fetchText: async () => 'conteúdo'
      })
    ).rejects.toThrow('já foi importado');
  });

  it('sem pasta configurada falha com instrução', async () => {
    await expect(
      importSkillFromGithub({
        remoteUrl: 'https://github.com/owner/repo',
        skillFolders: [],
        existingSkills: [],
        fetchJson: async () => ({}),
        fetchText: async () => ''
      })
    ).rejects.toThrow('Configure uma pasta de Skills');
  });
});

describe('importAgentsFromGithub', () => {
  it('usa .claude/agents ou agents/ e grava os .md baixados', async () => {
    const dir = join(tmpdir(), `glib-agents-${Date.now()}`);
    try {
      const seenUrls: string[] = [];
      const result = await importAgentsFromGithub({
        remoteUrl: 'https://github.com/owner/agents-repo',
        agentFolders: [dir],
        existingAgents: [],
        fetchJson: async (url) => {
          seenUrls.push(url);
          if (url.includes('contents/.claude/agents')) {
            return [
              { name: 'revisor.md', type: 'file', downloadUrl: 'https://raw/revisor.md' },
              { name: 'sub pasta', type: 'dir' }
            ];
          }
          throw new Error('404');
        },
        fetchText: async (url) => {
          seenUrls.push(url);
          return '---\nname: Revisor\n---\ncorpo';
        }
      });
      expect(seenUrls.some((url) => url.includes('contents/.claude/agents'))).toBe(true);
      expect(result.files).toHaveLength(1);
      expect(result.agents[0]).toMatchObject({ name: 'Revisor' });
      expect(await fs.readFile(join(dir, 'agents-repo', 'revisor.md'), 'utf-8')).toContain('Revisor');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('falha com mensagem útil se nenhuma pasta de agentes existir', async () => {
    const dir = join(tmpdir(), `glib-agents-empty-${Date.now()}`);
    try {
      await expect(
        importAgentsFromGithub({
          remoteUrl: 'https://github.com/owner/sem-agents',
          agentFolders: [dir],
          existingAgents: [],
          fetchJson: async () => { throw new Error('404'); },
          fetchText: async () => ''
        })
      ).rejects.toThrow('Nenhuma pasta de agentes');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
