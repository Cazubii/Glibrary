import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import { promisify } from 'util';
import { tmpdir } from 'os';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';
import type { Repo, TemporaryCheckoutStatus } from '../../shared/types';

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 1024 * 1024;
const MAX_TEMPORARY_CHECKOUTS = 3;

interface CheckoutRecord {
  repoId: string;
  repoName: string;
  remoteFingerprint: string;
  path: string;
  createdAt: string;
}

function remoteFingerprint(remoteUrl: string): string {
  if (remoteUrl.startsWith('https://') || remoteUrl.startsWith('ssh://')) {
    const parsed = new URL(remoteUrl);
    const sensitiveQuery = [...parsed.searchParams.keys()].some((key) => /token|secret|password|credential/i.test(key));
    const credentialedUser = parsed.username !== '' && parsed.username.toLowerCase() !== 'git';
    if (parsed.password !== '' || credentialedUser || sensitiveQuery) {
      throw new Error('Remova credenciais da URL remota e use o gerenciador de credenciais do Git.');
    }
  }
  return createHash('sha256').update(remoteUrl).digest('hex');
}

export class TemporaryCheckoutService {
  private records = new Map<string, CheckoutRecord>();
  private loaded = false;

  constructor(private readonly registryPath: string) {}

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await fs.readFile(this.registryPath, 'utf8');
      const values = JSON.parse(raw) as CheckoutRecord[];
      for (const value of Array.isArray(values) ? values : []) {
        if (
          typeof value.repoId === 'string' &&
          typeof value.path === 'string' &&
          typeof value.remoteFingerprint === 'string' &&
          this.isManagedPath(value.path)
        ) this.records.set(value.repoId, value);
      }
    } catch {
      // Primeiro uso ou registro ainda não criado.
    }
  }

  private isManagedPath(path: string): boolean {
    const root = resolve(tmpdir());
    const target = resolve(path);
    const rel = relative(root, target);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel) && basename(target).startsWith('glibrary-checkout-');
  }

  private async save(): Promise<void> {
    await fs.mkdir(dirname(this.registryPath), { recursive: true });
    const tmpPath = this.registryPath + '.tmp';
    await fs.writeFile(tmpPath, JSON.stringify([...this.records.values()], null, 2), 'utf8');
    await fs.rename(tmpPath, this.registryPath);
  }

  async create(repo: Repo): Promise<string> {
    await this.load();
    if (!repo.remoteUrl) throw new Error('Este repositório não tem URL remota para clonar.');
    const fingerprint = remoteFingerprint(repo.remoteUrl);
    const existing = this.records.get(repo.id);
    if (existing && this.isManagedPath(existing.path)) {
      if (existing.remoteFingerprint !== fingerprint) {
        throw new Error('Este checkout temporário pertence a outra URL remota. Revise-o antes de removê-lo.');
      }
      try {
        const info = await fs.stat(existing.path);
        if (info.isDirectory()) return existing.path;
      } catch {
        this.records.delete(repo.id);
      }
    }

    for (const [repoId, record] of this.records) {
      try { await fs.stat(record.path); }
      catch { this.records.delete(repoId); }
    }
    if (this.records.size >= MAX_TEMPORARY_CHECKOUTS) {
      throw new Error('Limite de 3 checkouts temporários atingido. Revise e remova um checkout antes de criar outro.');
    }

    const target = await fs.mkdtemp(join(tmpdir(), 'glibrary-checkout-'));
    try {
      await execFileAsync('git', ['clone', '--quiet', '--depth=1', '--filter=blob:none', repo.remoteUrl, target], {
        timeout: 180000,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        encoding: 'utf8'
      });
      const record: CheckoutRecord = {
        repoId: repo.id,
        repoName: repo.name,
        remoteFingerprint: fingerprint,
        path: target,
        createdAt: new Date().toISOString()
      };
      this.records.set(repo.id, record);
      await this.save();
      return target;
    } catch (error) {
      if (this.isManagedPath(target)) await fs.rm(target, { recursive: true, force: true }).catch(() => undefined);
      const err = error as NodeJS.ErrnoException & { stderr?: string; code?: string };
      if (err.code === 'ENOENT') throw new Error('Git não está instalado ou não está no PATH.');
      throw new Error('Não foi possível criar o checkout temporário. Verifique o acesso Git ao repositório e tente novamente.');
    }
  }

  async status(repoId: string): Promise<TemporaryCheckoutStatus> {
    await this.load();
    const record = this.records.get(repoId);
    if (!record || !this.isManagedPath(record.path)) return { exists: false };
    try {
      const stat = await fs.stat(record.path);
      if (!stat.isDirectory()) return { exists: false };
    } catch {
      this.records.delete(repoId);
      await this.save();
      return { exists: false };
    }

    let workingTreeDirty = false;
    let unpushedCommits: number | null = null;
    try {
      const result = await execFileAsync('git', ['status', '--porcelain', '--untracked-files=all'], {
        cwd: record.path, timeout: 15000, maxBuffer: MAX_BUFFER, windowsHide: true, encoding: 'utf8'
      });
      workingTreeDirty = String(result.stdout).trim() !== '';
    } catch {
      workingTreeDirty = true;
    }
    try {
      const result = await execFileAsync('git', ['rev-list', '--count', '@{upstream}..HEAD'], {
        cwd: record.path, timeout: 15000, maxBuffer: MAX_BUFFER, windowsHide: true, encoding: 'utf8'
      });
      const count = Number(String(result.stdout).trim());
      if (Number.isFinite(count) && count >= 0) unpushedCommits = count;
    } catch {
      // Sem upstream conhecido, não é seguro remover o checkout automaticamente.
    }
    const dirty = workingTreeDirty || unpushedCommits == null || unpushedCommits > 0;
    return {
      exists: true,
      path: record.path,
      dirty,
      unpushedCommits,
      createdAt: record.createdAt
    };
  }

  async cleanup(repoId: string): Promise<TemporaryCheckoutStatus> {
    const status = await this.status(repoId);
    if (!status.exists) return status;
    if (status.dirty) {
      throw new Error('O checkout contém alterações ou commits ainda não enviados. Ele foi preservado.');
    }
    await this.load();
    const record = this.records.get(repoId);
    if (!record || !this.isManagedPath(record.path) || resolve(record.path) !== resolve(status.path ?? '')) {
      throw new Error('O caminho temporário não corresponde ao registro criado pelo Glibrary.');
    }
    await fs.rm(record.path, { recursive: true, force: true });
    this.records.delete(repoId);
    await this.save();
    return { exists: false };
  }
}
