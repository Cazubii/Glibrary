import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { X } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';
import type { TerminalSessionSummary } from '@shared/types';
import { api } from '../lib/api';

interface Props {
  session: TerminalSessionSummary;
  onExit: (id: string, exitCode: number) => void;
  onClosePanel: () => void;
  onActivity?: () => void;
}

export default function TerminalSessionView({ session, onExit, onClosePanel, onActivity }: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container == null) return;

    let terminalId: string | null = session.id;
    let attachmentId: string | null = null;
    let disposed = false;
    let opening = true;
    let exitHandled = false;
    let lastSequence = 0;
    const pendingOutput: Array<{ data: string; sequence?: number }> = [];
    setError(null);
    setExitCode(session.status === 'exited' ? session.exitCode ?? 0 : null);

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

    const handleExit = (code: number): void => {
      if (exitHandled) return;
      exitHandled = true;
      terminalId = null;
      setExitCode(code);
      onExit(session.id, code);
      term.write(`\r\n\x1b[90m[ Processo encerrado (código ${code}) ]\x1b[0m\r\n`);
    };

    const offOutput = api.onTerminalOutput(({ id, data, sequence }) => {
      if (id !== session.id) return;
      onActivity?.();
      if (opening) {
        pendingOutput.push({ data, ...(sequence != null ? { sequence } : {}) });
        return;
      }
      if (sequence == null || sequence > lastSequence) {
        term.write(data);
        if (sequence != null) lastSequence = sequence;
      }
    });
    const offExit = api.onTerminalExit(({ id, exitCode: code }) => {
      if (id === session.id) handleExit(code);
    });

    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(container);
    fit.fit();

    api.terminalAttach(session.id, term.cols, term.rows)
      .then((result) => {
        if (disposed) {
          void api.terminalDetach(result.id, result.attachmentId).catch(() => undefined);
          return;
        }
        attachmentId = result.attachmentId;
        lastSequence = result.sequence;
        if (result.snapshot !== '') term.write(result.snapshot);
        for (const output of pendingOutput) {
          if (output.sequence == null || output.sequence > lastSequence) {
            term.write(output.data);
            if (output.sequence != null) lastSequence = output.sequence;
          }
        }
        pendingOutput.length = 0;
        opening = false;
        if (result.status === 'exited') handleExit(result.exitCode ?? 0);
        fit.fit();
        term.focus();
      })
      .catch((cause: unknown) => {
        opening = false;
        if (disposed) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
        term.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
      });

    return () => {
      disposed = true;
      terminalId = null;
      observer.disconnect();
      offOutput();
      offExit();
      if (attachmentId != null) void api.terminalDetach(session.id, attachmentId).catch(() => undefined);
      term.dispose();
    };
  }, [session.id, session.status, session.exitCode, onExit, onActivity]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#1b202b]">
      {error != null && <div className="bg-steam-error/15 px-3 py-1 text-xs text-steam-error" role="alert">{error}</div>}
      {exitCode != null && (
        <div className="flex items-center justify-between gap-3 bg-steam-warn/15 px-3 py-1 text-xs text-steam-warn" role="status">
          <span>Sessão encerrada (código {exitCode}).</span>
          <button
            type="button"
            onClick={onClosePanel}
            className="inline-flex shrink-0 items-center gap-1 rounded px-2 py-1 font-medium text-steam-text/90 transition-colors hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
            aria-label="Fechar painel do terminal"
          >
            Fechar painel <X size={13} aria-hidden="true" />
          </button>
        </div>
      )}
      <div ref={containerRef} className="flex-1" />
    </div>
  );
}
