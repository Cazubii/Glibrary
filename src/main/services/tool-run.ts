import { spawn } from 'child_process';

export interface ShellRunPlan {
  file: string;
  args: string[];
}

/** Monta o shell da plataforma para executar um comando configurado pelo usuário. */
export function buildShellRun(command: string): ShellRunPlan {
  if (process.platform === 'win32') {
    return { file: 'cmd.exe', args: ['/d', '/s', '/c', command] };
  }
  return { file: '/bin/sh', args: ['-c', command] };
}

/** Limita a saída capturada ao final; evita floods na IPC. */
export function trimOutput(text: string, max = 4000): string {
  if (text.length <= max) return text;
  return `[saída truncada]\n…${text.slice(-max)}`;
}

/** Roda processo desacoplado (tools keepAlive: dev servers não travam a UI). */
export function runDetached(command: string, cwd: string): void {
  const plan = buildShellRun(command);
  const child = spawn(plan.file, plan.args, {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: false
  });
  child.on('error', () => undefined);
  child.unref();
}
