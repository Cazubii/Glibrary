import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { spawn as ptySpawn, type IPty } from 'node-pty';
import { IpcChannels } from '../../shared/ipc-channels';

export interface TerminalEvents {
  send(channel: string, payload: unknown): void;
}

export type SpawnPty = typeof ptySpawn;

interface TerminalSession {
  pty: IPty;
  cwd: string;
  events: TerminalEvents | null;
  output: string;
  sequence: number;
}

export interface OpenTerminalResult {
  id: string;
  snapshot: string;
  sequence: number;
}

const TERMINAL_SNAPSHOT_LIMIT = 100_000;

export function resolveShell(): string {
  if (process.platform === 'win32') return 'powershell.exe';
  const shell = process.env.SHELL;
  return shell != null && existsSync(shell) ? shell : '/bin/bash';
}

/** Gerencia sessões PTY (terminal real) para o renderer via IPC streaming. */
export class TerminalManager {
  private readonly sessions = new Map<string, TerminalSession>();

  constructor(
    private readonly spawnPty: SpawnPty = ptySpawn,
    private readonly newId: () => string = () => randomUUID()
  ) {}

  create(events: TerminalEvents, cwd: string, cols = 80, rows = 24): string {
    if (cwd === '' || !existsSync(cwd)) throw new Error(`Pasta não encontrada: ${cwd}`);
    const id = this.newId();
    const pty = this.spawnPty(resolveShell(), [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env } as unknown as Record<string, string>
    });
    const session: TerminalSession = { pty, cwd: resolve(cwd), events, output: '', sequence: 0 };
    this.sessions.set(id, session);
    pty.onData((data) => {
      if (this.sessions.get(id) !== session) return;
      session.sequence += 1;
      session.output = `${session.output}${data}`.slice(-TERMINAL_SNAPSHOT_LIMIT);
      session.events?.send(IpcChannels.terminalOutput, { id, data, sequence: session.sequence });
    });
    pty.onExit(({ exitCode }) => {
      if (this.sessions.get(id) !== session) return;
      this.sessions.delete(id);
      session.events?.send(IpcChannels.terminalExit, { id, exitCode });
    });
    return id;
  }

  /** Reanexa ao terminal da pasta ou cria uma sessÃ£o persistente para ela. */
  open(events: TerminalEvents, cwd: string, cols = 80, rows = 24): OpenTerminalResult {
    if (cwd === '' || !existsSync(cwd)) throw new Error(`Pasta nÃ£o encontrada: ${cwd}`);
    const resolvedCwd = resolve(cwd);
    const key = process.platform === 'win32' ? resolvedCwd.toLocaleLowerCase('en-US') : resolvedCwd;
    const existing = [...this.sessions.entries()].find(([, session]) => {
      const sessionKey = process.platform === 'win32' ? session.cwd.toLocaleLowerCase('en-US') : session.cwd;
      return sessionKey === key;
    });
    if (existing != null) {
      const [id, session] = existing;
      session.events = events;
      return { id, snapshot: session.output, sequence: session.sequence };
    }

    const id = this.create(events, resolvedCwd, cols, rows);
    const session = this.sessions.get(id);
    return { id, snapshot: session?.output ?? '', sequence: session?.sequence ?? 0 };
  }

  detach(id: string): void {
    const session = this.sessions.get(id);
    if (session != null) session.events = null;
  }

  killForCwd(cwd: string): void {
    const resolvedCwd = resolve(cwd);
    const key = process.platform === 'win32' ? resolvedCwd.toLocaleLowerCase('en-US') : resolvedCwd;
    for (const [id, session] of this.sessions) {
      const sessionKey = process.platform === 'win32' ? session.cwd.toLocaleLowerCase('en-US') : session.cwd;
      if (sessionKey === key) this.kill(id);
    }
  }

  input(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session == null) return;
    session.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (session == null) return;
    session.pty.resize(cols, rows);
  }

  kill(id: string): void {
    const session = this.sessions.get(id);
    if (session == null) return;
    session.pty.kill();
  }

  alive(id: string): boolean {
    return this.sessions.has(id);
  }
}
