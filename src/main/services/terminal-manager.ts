import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { homedir } from 'os';
import * as pty from 'node-pty';
import type { IPty } from 'node-pty';
import type {
  Repo,
  TerminalSessionSnapshot,
  TerminalSessionSummary,
  TerminalStartInput
} from '../../shared/types';
import { IpcChannels } from '../../shared/ipc-channels';
import type { LibraryStore } from './library-store';
import type { CodespaceService } from './codespace-service';
import type { TemporaryCheckoutService } from './temporary-checkout';

export type EmitFn = (channel: string, payload: unknown) => void;

const MAX_ACTIVE_SESSIONS = 4;
const MAX_RETAINED_SESSIONS = 20;
const MAX_BUFFER_LINES = 2000;
const MAX_BUFFER_CHARS = 512 * 1024;

interface Session extends TerminalSessionSnapshot {
  proc: IPty;
}

export class TerminalManager {
  private readonly sessions = new Map<string, Session>();
  private starting = 0;

  constructor(
    private readonly store: LibraryStore,
    private readonly codespaces: CodespaceService,
    private readonly temporaryCheckouts: TemporaryCheckoutService,
    private readonly emit: EmitFn,
    private readonly defaultCwd = homedir()
  ) {}

  list(repoId: string): TerminalSessionSnapshot[] {
    return [...this.sessions.values()]
      .filter((session) => session.repoId === repoId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((session) => this.snapshot(session));
  }

  async start(input: TerminalStartInput): Promise<TerminalSessionSnapshot> {
    const active = [...this.sessions.values()].filter((session) => session.state === 'running').length;
    if (active + this.starting >= MAX_ACTIVE_SESSIONS) {
      throw new Error('Limite de 4 terminais simultâneos atingido. Encerre uma sessão antes de abrir outra.');
    }
    const repo = this.store.getRepo(input.repoId);
    if (!repo) throw new Error('Repositório não encontrado.');
    this.starting += 1;
    try {
      let proc: IPty;
      let temporaryPath: string | undefined;
      if (input.provider === 'codespace') {
        if (!input.codespaceName) throw new Error('Selecione um Codespace existente.');
        await this.codespaces.attach(repo, input.codespaceName);
        proc = pty.spawn('gh', ['codespace', 'ssh', '--codespace', input.codespaceName], {
          name: 'xterm-256color',
          cols: input.cols,
          rows: input.rows,
          cwd: this.defaultCwd,
          env: this.terminalEnvironment()
        });
      } else {
        let cwd = repo.localPath;
        if (input.provider === 'temporary-local') {
          cwd = await this.temporaryCheckouts.create(repo);
          temporaryPath = cwd;
        }
        if (!cwd || !existsSync(cwd)) {
          throw new Error('Este projeto não está disponível localmente. Conecte um Codespace ou escolha Checkout temporário.');
        }
        const shell = this.getShell();
        proc = pty.spawn(shell.executable, shell.args, {
          name: 'xterm-256color',
          cols: input.cols,
          rows: input.rows,
          cwd,
          env: this.terminalEnvironment()
        });
      }

      const id = randomUUID();
      const session: Session = {
        id,
        repoId: repo.id,
        title: this.sessionTitle(repo, input.provider),
        provider: input.provider,
        state: 'running',
        createdAt: new Date().toISOString(),
        buffer: '',
        ...(temporaryPath ? { temporaryPath } : {}),
        ...(input.codespaceName ? { codespaceName: input.codespaceName } : {}),
        proc
      };
      this.sessions.set(id, session);
      proc.onData((data) => this.onData(session, data));
      proc.onExit(({ exitCode, signal }) => this.onExit(session, exitCode, signal));
      this.pruneExitedSessions();
      return this.snapshot(session);
    } finally {
      this.starting -= 1;
    }
  }

  write(sessionId: string, data: string): void {
    const session = this.requireRunning(sessionId);
    session.proc.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.requireRunning(sessionId);
    session.proc.resize(cols, rows);
  }

  clear(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Sessão de terminal não encontrada.');
    session.buffer = '';
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.state === 'running') {
      session.proc.kill();
      await this.waitForExit([session], 2000);
    }
  }

  async closeAll(): Promise<void> {
    const active = [...this.sessions.values()].filter((session) => session.state === 'running');
    for (const session of active) {
      try { session.proc.kill(); } catch { /* já encerrou */ }
    }
    await this.waitForExit(active, 5000);
  }

  private async waitForExit(sessions: Session[], timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (sessions.some((session) => session.state === 'running') && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private requireRunning(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Sessão de terminal não encontrada.');
    if (session.state !== 'running') throw new Error('Esta sessão já foi encerrada.');
    return session;
  }

  private terminalEnvironment(): Record<string, string> {
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    );
    return { ...inherited, TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '1' };
  }

  private getShell(): { executable: string; args: string[] } {
    if (process.platform === 'win32') {
      return { executable: 'powershell.exe', args: ['-NoLogo'] };
    }
    const executable = process.env.SHELL && process.env.SHELL.trim() !== '' ? process.env.SHELL : (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
    return { executable, args: ['-l'] };
  }

  private sessionTitle(repo: Repo, provider: TerminalStartInput['provider']): string {
    if (provider === 'codespace') return repo.name + ' · Codespace';
    if (provider === 'temporary-local') return repo.name + ' · temporário';
    return repo.name + ' · local';
  }

  private onData(session: Session, data: string): void {
    session.buffer += data;
    if (session.buffer.length > MAX_BUFFER_CHARS) session.buffer = session.buffer.slice(-MAX_BUFFER_CHARS);
    const lines = session.buffer.split(/\r?\n/);
    if (lines.length > MAX_BUFFER_LINES) {
      session.buffer = lines.slice(-MAX_BUFFER_LINES).join('\n');
    }
    this.emit(IpcChannels.terminalOutput, { sessionId: session.id, data });
  }

  private onExit(session: Session, exitCode: number, signal?: number): void {
    if (session.state !== 'running') return;
    session.state = exitCode === 0 ? 'exited' : 'error';
    session.exitCode = exitCode;
    session.proc = null as unknown as IPty;
    if (session.state === 'error' && session.provider === 'codespace') {
      session.errorMessage = 'A conexão terminou. Verifique a rede e confirme que a imagem do Codespace tem um servidor SSH ativo.';
    }
    this.emit(IpcChannels.terminalExit, {
      sessionId: session.id,
      exitCode,
      ...(signal != null ? { signal } : {})
    });
    this.pruneExitedSessions();
  }

  private snapshot(session: Session): TerminalSessionSnapshot {
    const { proc: _proc, ...snapshot } = session;
    return snapshot;
  }

  private pruneExitedSessions(): void {
    const exited = [...this.sessions.values()]
      .filter((session) => session.state !== 'running')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const session of exited.slice(0, Math.max(0, exited.length - MAX_RETAINED_SESSIONS))) {
      this.sessions.delete(session.id);
    }
  }
}
