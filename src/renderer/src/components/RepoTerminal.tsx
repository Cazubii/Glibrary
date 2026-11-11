import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { api } from '../lib/api';

interface Props {
  cwd: string;
  persistent?: boolean;
  onActivity?: () => void;
}

/** Terminal real (PTY) embutido, com sessão por drawer aberto. */
export default function RepoTerminal({ cwd, persistent = false, onActivity }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exited, setExited] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container == null) return;
    setError(null);
    setExited(null);
    const term = new Terminal({
      fontSize: 13,
      cursorBlink: true,
      theme: { background: '#1b202b', foreground: '#d5d9e0', cursor: '#66c0f4' }
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    term.onData((data) => {
      if (terminalId != null) api.terminalInput(terminalId, data);
    });
    term.onResize(({ cols, rows }) => {
      if (terminalId != null) api.terminalResize(terminalId, cols, rows);
    });

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(container);

    let terminalId: string | null = null;
    let disposed = false;
    let opening = true;
    const pendingOutput = new Map<string, Array<{ data: string; sequence?: number }>>();
    const offOutput = api.onTerminalOutput(({ id, data, sequence }) => {
      onActivity?.();
      if (id === terminalId) {
        term.write(data);
      } else if (opening) {
        const pending = pendingOutput.get(id) ?? [];
        pending.push({ data, ...(sequence != null ? { sequence } : {}) });
        pendingOutput.set(id, pending);
      }
    });
    const offExit = api.onTerminalExit(({ id, exitCode }) => {
      if (id !== terminalId) return;
      terminalId = null;
      setExited(exitCode);
      term.write(`\r\n\x1b[90m[ Processo encerrado (código ${exitCode}) ]\x1b[0m\r\n`);
    });

    const openTerminal = persistent
      ? api.terminalOpen(cwd)
      : api.terminalCreate(cwd).then((id) => ({ id, snapshot: '', sequence: 0 }));

    openTerminal
      .then((result) => {
        if (disposed) {
          if (persistent) void api.terminalDetach(result.id).catch(() => undefined);
          else api.terminalKill(result.id);
          return;
        }
        terminalId = result.id;
        opening = false;
        if (result.snapshot !== '') term.write(result.snapshot);
        const buffered = pendingOutput.get(result.id) ?? [];
        for (const output of buffered) {
          if (output.sequence == null || output.sequence > result.sequence) term.write(output.data);
        }
        pendingOutput.delete(result.id);
        pendingOutput.clear();
        fit.fit();
        term.focus();
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
        term.write(`\r\n\x1b[31m${e instanceof Error ? e.message : String(e)}\x1b[0m\r\n`);
      });

    return () => {
      disposed = true;
      observer.disconnect();
      offOutput();
      offExit();
      if (terminalId != null) {
        if (persistent) void api.terminalDetach(terminalId).catch(() => undefined);
        else api.terminalKill(terminalId);
      }
      term.dispose();
    };
  }, [cwd, onActivity, persistent]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#1b202b]">
      {error != null && (
        <div className="bg-steam-error/15 px-3 py-1 text-xs text-steam-error">{error}</div>
      )}
      {exited != null && (
        <div className="bg-steam-warn/15 px-3 py-1 text-xs text-steam-warn">
          Sessão encerrada (código {exited}). Feche o painel para abrir uma nova.
        </div>
      )}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
