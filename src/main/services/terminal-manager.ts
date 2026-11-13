import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { spawn as ptySpawn, type IPty } from 'node-pty';
import { IpcChannels } from '../../shared/ipc-channels';
import type {
  TerminalAttachResult,
  TerminalListResult,
  TerminalSessionStatus,
  TerminalSessionSummary
} from '../../shared/types';

export interface TerminalEvents {
  send(channel: string, payload: unknown): void;
}

export type SpawnPty = typeof ptySpawn;

interface TerminalSession {
  pty: IPty | null;
  cwd: string;
  name: string;
  status: TerminalSessionStatus;
  createdAt: string;
  exitCode?: number;
  events: TerminalEvents | null;
  attachmentId: string | null;
  output: string;
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

  create(cwd: string, cols = 80, rows = 24): TerminalSessionSummary {
    if (cwd === '' || !existsSync(cwd)) throw new Error(`Pasta não encontrada: ${cwd}`);
    const resolvedCwd = resolve(cwd);
    const cwdKey = this.cwdKey(resolvedCwd);
    const usedNames = new Set(
      [...this.sessions.values()]
        .filter((session) => this.cwdKey(session.cwd) === cwdKey)
        .map((session) => session.name)
    );
    let nameIndex = 1;
    while (usedNames.has(`Terminal ${nameIndex}`)) nameIndex += 1;

    const id = this.newId();
    const pty = this.spawnPty(resolveShell(), [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: resolvedCwd,
      env: { ...process.env } as unknown as Record<string, string>
    });
    const session: TerminalSession = {
      pty,
      cwd: resolvedCwd,
      name: `Terminal ${nameIndex}`,
      status: 'running',
      createdAt: new Date().toISOString(),
      events: null,
      attachmentId: null,
      output: '',
      sequence: 0
    };
    this.sessions.set(id, session);
    pty.onData((data) => {
      if (this.sessions.get(id) !== session || session.status !== 'running') return;
      session.sequence += 1;
      session.output = `${session.output}${data}`.slice(-TERMINAL_SNAPSHOT_LIMIT);
      session.events?.send(IpcChannels.terminalOutput, { id, data, sequence: session.sequence });
    });
    pty.onExit(({ exitCode }) => {
      if (this.sessions.get(id) !== session || session.status !== 'running') return;
      session.pty = null;
      session.status = 'exited';
      session.exitCode = exitCode;
      const events = session.events;
      session.events = null;
      session.attachmentId = null;
      events?.send(IpcChannels.terminalExit, { id, exitCode });
    });
    return this.toSummary(id, session);
  }

  list(cwd: string): TerminalListResult {
    const resolvedCwd = resolve(cwd);
    const cwdKey = this.cwdKey(resolvedCwd);
    const sessions = [...this.sessions.entries()]
      .filter(([, session]) => this.cwdKey(session.cwd) === cwdKey)
      .map(([id, session]) => this.toSummary(id, session));
    return { cwd: resolvedCwd, sessions };
  }

  private cwdKey(cwd: string): string {
    return process.platform === 'win32' ? cwd.toLocaleLowerCase('en-US') : cwd;
  }

  private toSummary(id: string, session: TerminalSession): TerminalSessionSummary {
    return {
      id,
      cwd: session.cwd,
      name: session.name,
      status: session.status,
      createdAt: session.createdAt,
      ...(session.exitCode === undefined ? {} : { exitCode: session.exitCode })
    };
  }

  attach(id: string, events: TerminalEvents, cols = 80, rows = 24): TerminalAttachResult {
    const session = this.sessions.get(id);
    if (session == null) throw new Error(`Sessão de terminal não encontrada: ${id}`);

    const attachmentId = randomUUID();
    if (session.status === 'running' && session.pty != null) {
      session.events = events;
      session.attachmentId = attachmentId;
      session.pty.resize(cols, rows);
    }

    return {
      id,
      attachmentId,
      snapshot: session.output,
      sequence: session.sequence,
      status: session.status,
      ...(session.exitCode === undefined ? {} : { exitCode: session.exitCode })
    };
  }

  detach(id: string, attachmentId: string): void {
    const session = this.sessions.get(id);
    if (session != null && session.attachmentId === attachmentId) {
      session.events = null;
      session.attachmentId = null;
    }
  }

  killForCwd(cwd: string): void {
    const resolvedCwd = resolve(cwd);
    const key = this.cwdKey(resolvedCwd);
    for (const [id, session] of [...this.sessions.entries()]) {
      if (this.cwdKey(session.cwd) === key) this.close(id);
    }
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) this.close(id);
  }

  input(id: string, data: string): void {
    const session = this.sessions.get(id);
    if (session == null || session.status !== 'running' || session.pty == null) return;
    session.pty.write(data);
  }

  resize(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id);
    if (session == null || session.status !== 'running' || session.pty == null) return;
    session.pty.resize(cols, rows);
  }

  close(id: string): void {
    const session = this.sessions.get(id);
    if (session == null) return;

    this.sessions.delete(id);
    const pty = session.pty;
    session.pty = null;
    session.events = null;
    session.attachmentId = null;
    if (pty != null && session.status === 'running') pty.kill();
  }

  alive(id: string): boolean {
    const session = this.sessions.get(id);
    return session?.status === 'running' && session.pty != null;
  }
}
