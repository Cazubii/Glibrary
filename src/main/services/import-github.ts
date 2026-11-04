import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import type { Agent, ScanIssue, Skill } from '../../shared/types';
import { isSafeDirectoryName } from '../../shared/validators';
import { discoverAgents } from './skills-scan';

export interface GithubFileEntry {
  name: string;
  type: string;
  downloadUrl?: string;
}

export type JsonFetcher = (url: string, token?: string) => Promise<unknown>;
export type TextFetcher = (url: string, token?: string) => Promise<string>;

interface OwnerRepo {
  owner: string;
  repo: string;
}

/** Extrai owner/repo de uma URL do GitHub (com ou sem .git). */
export function parseGithubUrl(remoteUrl: string): OwnerRepo {
  const match = remoteUrl.match(/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i);
  if (!match) throw new Error('URL do GitHub inválida');
  return { owner: match[1], repo: match[2] };
}

export type BranchResolver = (owner: string, repo: string) => Promise<string>;

function resolvableBranch(fetchJson: JsonFetcher, token?: string): BranchResolver {
  return async (owner, repo) => {
    try {
      const data = (await fetchJson(`https://api.github.com/repos/${owner}/${repo}`, token)) as Record<string, unknown>;
      if (typeof data['default_branch'] === 'string' && data['default_branch'] !== '') {
        return data['default_branch'];
      }
    } catch {
      // segue com HEAD
    }
    return 'HEAD';
  };
}

async function fetchRawOrThrow(
  textFetcher: TextFetcher,
  url: string,
  token?: string
): Promise<string | null> {
  try {
    return await textFetcher(url, token);
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404) return null;
    throw err instanceof Error ? err : new Error(String((err as { message?: string }).message ?? err));
  }
}

export interface ImportSkillArgs {
  remoteUrl: string;
  skillFolders: string[];
  existingSkills: Skill[];
  fetchJson: JsonFetcher;
  fetchText: TextFetcher;
  token?: string;
}

/** Baixa o SKILL.md da raiz do repositório e escreve em <skillFolders[0]>/<repo>/SKILL.md. */
export async function importSkillFromGithub(args: ImportSkillArgs): Promise<{ skillFile: string; repoName: string }> {
  const { owner, repo } = parseGithubUrl(args.remoteUrl);
  const targetRoot = args.skillFolders[0];
  if (!targetRoot) throw new Error('Configure uma pasta de Skills primeiro');
  const dirName = isSafeDirectoryName(repo) ? repo : `repo-${randomUUID().slice(0, 8)}`;
  const targetDir = join(targetRoot, dirName);
  const targetFile = join(targetDir, 'SKILL.md');
  if (existsSync(targetFile)) throw new Error(`"${repo}/SKILL.md" já foi importado para ${targetDir}`);

  const branch = await resolvableBranch(args.fetchJson, args.token)(owner, repo);
  const content =
    (await fetchRawOrThrow(args.fetchText, `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/SKILL.md`, args.token)) ??
    (await fetchRawOrThrow(args.fetchText, `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/SKILL.md`, args.token));
  if (content == null) throw new Error(`"SKILL.md" não encontrado na raiz de ${owner}/${repo}`);
  if (!content.trim()) {
    throw new Error('O SKILL.md baixado está vazio');
  }

  await mkdir(targetDir, { recursive: true });
  await writeFile(targetFile, content, 'utf8');
  return { skillFile: targetFile, repoName: repo };
}

export interface ImportAgentsArgs {
  remoteUrl: string;
  agentFolders: string[];
  existingAgents: Agent[];
  fetchJson: JsonFetcher;
  fetchText: TextFetcher;
  token?: string;
  maxFiles?: number;
}

const AGENT_DIR_CANDIDATES = ['.claude/agents', 'agents'];

/** Baixa os .md de agentes de um repo (pastas agents/ ou .claude/agents/) para <agentFolders[0]>/<repo>/. */
export async function importAgentsFromGithub(
  args: ImportAgentsArgs
): Promise<{ files: string[]; agents: Agent[]; issues: ScanIssue[] }> {
  const { owner, repo } = parseGithubUrl(args.remoteUrl);
  const targetRoot = args.agentFolders[0];
  if (!targetRoot) throw new Error('Configure uma pasta de Agents primeiro');
  const maxFiles = args.maxFiles ?? 10;

  const branch = await resolvableBranch(args.fetchJson, args.token)(owner, repo);
  let entries: GithubFileEntry[] = [];
  for (const folder of AGENT_DIR_CANDIDATES) {
    try {
      const data = (await args.fetchJson(
        `https://api.github.com/repos/${owner}/${repo}/contents/${folder}?ref=${branch}`,
        args.token
      )) as unknown;
      if (Array.isArray(data)) {
        entries = data as GithubFileEntry[];
        break;
      }
    } catch {
      // tenta a próxima pasta candidata
    }
  }
  if (entries.length === 0) {
    throw new Error(`Nenhuma pasta de agentes encontrada em ${owner}/${repo} (.claude/agents ou agents)`);
  }

  const mdFiles = entries
    .filter((entry) => entry.type === 'file' && entry.name.toLowerCase().endsWith('.md'))
    .slice(0, maxFiles);
  if (mdFiles.length === 0) {
    throw new Error(`Nenhum arquivo .md de agente encontrado em ${owner}/${repo}`);
  }

  const issues: ScanIssue[] = [];
  const dirName = isSafeDirectoryName(repo) ? repo : `repo-${randomUUID().slice(0, 8)}`;
  const written: string[] = [];
  const targetDir = join(targetRoot, dirName);
  await mkdir(targetDir, { recursive: true });
  for (const entry of mdFiles) {
    const url = entry.downloadUrl;
    if (!url) continue;
    const content = await fetchRawOrThrow(args.fetchText, url, args.token);
    if (content == null) continue;
    const target = join(targetDir, entry.name);
    await writeFile(target, content, 'utf8');
    written.push(target);
  }
  if (written.length === 0) throw new Error('Nenhum agente pôde ser baixado');

  const rescan = await discoverAgents([targetRoot], args.existingAgents);
  const writtenLower = new Set(written.map((file) => resolve(file).toLowerCase()));
  const agents = rescan.agents.filter((agent) => writtenLower.has(resolve(agent.file).toLowerCase()));
  issues.push(...rescan.issues.filter((issue) => writtenLower.has(resolve(issue.path).toLowerCase())));
  return { files: written, agents, issues };
}
