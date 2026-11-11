import { execFile } from 'child_process';
import { promisify } from 'util';
import { parseGithubRepo } from '../../shared/git-utils';
import type { GithubCodespace, GithubCodespaceMachine, Repo } from '../../shared/types';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 1024 * 1024;
const BILLING_MESSAGE = 'Confira a cobrança e o armazenamento de Codespaces na página de faturamento do GitHub.';

export interface CodespaceChoices {
  codespaces: GithubCodespace[];
  machines: GithubCodespaceMachine[];
}

interface GhCodespaceRecord {
  name?: unknown;
  repository?: unknown;
  state?: unknown;
  webUrl?: unknown;
  web_url?: unknown;
}

interface GhMachineRecord {
  name?: unknown;
  display_name?: unknown;
  memory_in_bytes?: unknown;
  storage_in_bytes?: unknown;
}

function repoName(repo: Repo): string {
  const parsed = repo.remoteUrl ? parseGithubRepo(repo.remoteUrl) : null;
  if (!parsed) throw new Error('O repositório precisa ter uma URL do GitHub para usar Codespaces.');
  return parsed.owner + '/' + parsed.repo;
}

function normalizeState(value: unknown): GithubCodespace['state'] {
  const state = String(value ?? '').toLowerCase();
  if (state === 'available' || state === 'running') return 'available';
  if (state === 'shutdown' || state === 'stopped') return 'shutdown';
  return 'unknown';
}

function normalizeRepository(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value != null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record['full_name'] ?? record['name'] ?? '');
  }
  return '';
}

export class CodespaceService {
  private async runGh(args: string[], timeout = 30000): Promise<string> {
    try {
      const result = await execFileAsync('gh', args, {
        timeout,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        encoding: 'utf8'
      });
      return String(result.stdout ?? '');
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stderr?: string; code?: string | number; killed?: boolean };
      if (err.code === 'ENOENT') throw new Error('GitHub CLI (gh) não está instalado ou não está no PATH.');
      if (err.killed) throw new Error('A operação do GitHub CLI excedeu o tempo limite.');
      throw error;
    }
  }

  private async assertAuthenticated(): Promise<void> {
    try {
      await this.runGh(['auth', 'status']);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('não está instalado')) throw error;
      throw new Error('O GitHub CLI não está autenticado. Execute gh auth login no terminal do sistema.');
    }
  }

  async listForRepo(repo: Repo): Promise<CodespaceChoices> {
    const fullName = repoName(repo);
    await this.assertAuthenticated();
    try {
      const raw = await this.runGh([
        'codespace', 'list', '--repo', fullName, '--json', 'name,repository,state,webUrl'
      ]);
      const values = JSON.parse(raw) as GhCodespaceRecord[];
      const codespaces = (Array.isArray(values) ? values : [])
        .map((item): GithubCodespace | null => {
          if (typeof item.name !== 'string' || item.name === '') return null;
          const url = item.webUrl ?? item.web_url;
          return {
            name: item.name,
            repository: normalizeRepository(item.repository) || fullName,
            state: normalizeState(item.state),
            ...(typeof url === 'string' && url !== '' ? { webUrl: url } : {})
          };
        })
        .filter((item): item is GithubCodespace => item != null);
      const machines = await this.listMachines(fullName);
      return { codespaces, machines };
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('O GitHub CLI devolveu uma lista de Codespaces inválida.');
      throw error;
    }
  }

  private async listMachines(fullName: string): Promise<GithubCodespaceMachine[]> {
    try {
      const raw = await this.runGh(['api', 'repos/' + fullName + '/codespaces/machines']);
      const parsed = JSON.parse(raw) as { machines?: GhMachineRecord[] };
      return (parsed.machines ?? [])
        .filter((machine) => typeof machine.name === 'string')
        .map((machine) => {
          const memory = Number(machine.memory_in_bytes ?? 0);
          const storage = Number(machine.storage_in_bytes ?? 0);
          return {
            name: String(machine.name),
            displayName: typeof machine.display_name === 'string' ? machine.display_name : String(machine.name),
            memoryGb: memory > 0 ? Math.round(memory / (1024 ** 3)) : 0,
            storageGb: storage > 0 ? Math.round(storage / (1024 ** 3)) : 0
          };
        });
    } catch {
      // Sem permissão de leitura de máquinas, os Codespaces existentes ainda podem ser usados.
      return [];
    }
  }

  async start(repo: Repo, name: string): Promise<void> {
    const choices = await this.listForRepo(repo);
    const found = choices.codespaces.find((item) => item.name === name);
    if (!found) throw new Error('O Codespace selecionado não pertence a este repositório ou não está acessível.');
    if (found.state === 'available') return;
    try {
      await this.runGh(['codespace', 'start', '--codespace', name], 180000);
    } catch {
      throw new Error('Não foi possível iniciar o Codespace. ' + BILLING_MESSAGE);
    }
  }

  async stop(repo: Repo, name: string): Promise<void> {
    const choices = await this.listForRepo(repo);
    if (!choices.codespaces.some((item) => item.name === name)) {
      throw new Error('O Codespace selecionado não pertence a este repositório ou não está acessível.');
    }
    try {
      await this.runGh(['codespace', 'stop', '--codespace', name], 60000);
    } catch {
      throw new Error('Não foi possível parar o Codespace selecionado.');
    }
  }

  async create(repo: Repo, machineName: string): Promise<GithubCodespace> {
    const fullName = repoName(repo);
    const choices = await this.listForRepo(repo);
    if (!choices.machines.some((machine) => machine.name === machineName)) {
      throw new Error('Selecione uma máquina disponível para este repositório.');
    }
    try {
      const raw = await this.runGh([
        'codespace', 'create', '--repo', fullName, '--machine', machineName, '--json', 'name'
      ], 300000);
      const created = JSON.parse(raw) as { name?: unknown };
      if (typeof created.name !== 'string' || created.name === '') {
        throw new Error('O GitHub CLI não informou o nome do Codespace criado.');
      }
      return {
        name: created.name,
        repository: fullName,
        state: 'available'
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('não está instalado')) throw error;
      throw new Error('Não foi possível criar o Codespace. ' + BILLING_MESSAGE);
    }
  }

  async attach(repo: Repo, name: string): Promise<void> {
    const choices = await this.listForRepo(repo);
    const found = choices.codespaces.find((item) => item.name === name);
    if (!found) throw new Error('O Codespace selecionado não pertence a este repositório ou não está acessível.');
    if (found.state !== 'available') throw new Error('Este Codespace está parado. Inicie-o explicitamente antes de conectar.');
  }
}
