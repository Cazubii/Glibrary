import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clipboard, Copy, ExternalLink, Globe, Maximize2, Minimize2, Plus, Power, RefreshCw,
  Search, Columns2, Terminal as TerminalIcon, Trash2, X
} from 'lucide-react';
import type {
  GithubCodespace,
  GithubCodespaceMachine,
  Repo,
  TerminalProvider,
  TerminalSessionSnapshot,
  TemporaryCheckoutStatus
} from '@shared/types';
import { api } from '../lib/api';

const BILLING_URL = 'https://github.com/settings/billing/summary';

interface Props {
  repo: Repo;
  onHide: () => void;
  onError: (message: string) => void;
}

interface PaneControls {
  focus: () => void;
  clear: () => void;
  findNext: (query: string) => boolean;
  selection: () => string;
  paste: (text: string) => void;
}

function mergeSession(current: TerminalSessionSnapshot[], next: TerminalSessionSnapshot): TerminalSessionSnapshot[] {
  const found = current.some((session) => session.id === next.id);
  return found
    ? current.map((session) => session.id === next.id ? { ...session, ...next } : session)
    : [...current, next].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export default function RepoTerminal({ repo, onHide, onError }: Props): React.JSX.Element {
  const [sessions, setSessions] = useState<TerminalSessionSnapshot[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [splitIds, setSplitIds] = useState<string[] | null>(null);
  const [provider, setProvider] = useState<TerminalProvider>(repo.localPath ? 'local' : 'codespace');
  const [codespaces, setCodespaces] = useState<GithubCodespace[]>([]);
  const [machines, setMachines] = useState<GithubCodespaceMachine[]>([]);
  const [selectedCodespace, setSelectedCodespace] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('');
  const [devcontainerPaths, setDevcontainerPaths] = useState<string[]>([]);
  const [selectedDevcontainer, setSelectedDevcontainer] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('');
  const [tempStatus, setTempStatus] = useState<TemporaryCheckoutStatus>({ exists: false });
  const [providerError, setProviderError] = useState('');
  const [busy, setBusy] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [, setControlRevision] = useState(0);
  const controls = useRef(new Map<string, PaneControls>());

  useEffect(() => {
    let cancelled = false;
    const offExit = api.onTerminalExit((event) => {
      setSessions((current) => current.map((session) => session.id === event.sessionId
        ? {
            ...session,
            state: event.exitCode === 0 ? 'exited' : 'error',
            exitCode: event.exitCode ?? undefined
          }
        : session));
    });
    void api.terminalList(repo.id).then((items) => {
      if (cancelled) return;
      setSessions((current) => {
        const latest = new Map(items.map((item) => [item.id, item]));
        for (const item of current) {
          const snapshot = latest.get(item.id);
          if (snapshot) latest.set(item.id, { ...snapshot, ...item });
        }
        return [...latest.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      });
      if (items.length > 0) setActiveId((current) => current ?? items[items.length - 1].id);
    }).catch((error: unknown) => {
      if (!cancelled) setProviderError(error instanceof Error ? error.message : String(error));
    });
    void api.terminalTempStatus(repo.id).then((status) => {
      if (!cancelled) setTempStatus(status);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      offExit();
    };
  }, [repo.id]);

  const loadCodespaces = useCallback(async (): Promise<void> => {
    if (!repo.remoteUrl) {
      setProviderError('Adicione uma URL GitHub para usar Codespaces.');
      return;
    }
    setProviderError('');
    try {
      const result = await api.terminalCodespacesList(repo.id);
      setCodespaces(result.codespaces);
      setMachines(result.machines);
      setDevcontainerPaths(result.devcontainerPaths);
      setSelectedDevcontainer((current) => result.devcontainerPaths.includes(current) ? current : (result.devcontainerPaths[0] ?? ''));
      setDefaultBranch(result.defaultBranch);
      setSelectedCodespace((current) =>
        result.codespaces.some((space) => space.name === current)
          ? current
          : (result.codespaces[0]?.name ?? '')
      );
      setSelectedMachine((current) =>
        result.machines.some((machine) => machine.name === current)
          ? current
          : (result.machines[0]?.name ?? '')
      );
    } catch (error) {
      setProviderError(error instanceof Error ? error.message : String(error));
    }
  }, [repo.id, repo.remoteUrl]);

  useEffect(() => {
    if (provider === 'codespace') void loadCodespaces();
  }, [provider, loadCodespaces]);

  const registerControls = useCallback((id: string, value: PaneControls | null): void => {
    if (value) controls.current.set(id, value);
    else controls.current.delete(id);
    setControlRevision((revision) => revision + 1);
  }, []);

  const activeSession = sessions.find((session) => session.id === activeId) ?? null;
  const visibleIds = splitIds?.filter((id) => sessions.some((session) => session.id === id)) ?? [];
  const activeControls = activeId ? controls.current.get(activeId) : undefined;

  const startSession = async (
    selectedProvider: TerminalProvider,
    codespaceName?: string
  ): Promise<TerminalSessionSnapshot | null> => {
    setBusy(true);
    setProviderError('');
    try {
      const session = await api.terminalStart({
        repoId: repo.id,
        provider: selectedProvider,
        cols: 100,
        rows: 28,
        ...(codespaceName ? { codespaceName } : {})
      });
      setSessions((current) => mergeSession(current, session));
      setActiveId(session.id);
      setSplitIds(null);
      if (selectedProvider === 'temporary-local') {
        void api.terminalTempStatus(repo.id).then(setTempStatus).catch(() => undefined);
      }
      return session;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProviderError(message);
      onError(message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  const connectCodespace = async (): Promise<void> => {
    const target = codespaces.find((space) => space.name === selectedCodespace);
    if (!target) {
      setProviderError('Selecione um Codespace disponível.');
      return;
    }
    if (target.state === 'shutdown') {
      const accepted = window.confirm(
        'Este Codespace está parado. Iniciá-lo usa recursos de computação e pode gerar cobrança. Deseja continuar?'
      );
      if (!accepted) return;
      setBusy(true);
      try {
        await api.terminalCodespaceStart(repo.id, target.name);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setProviderError(message);
        onError(message);
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    await startSession('codespace', target.name);
  };

  const createCodespace = async (): Promise<void> => {
    const machine = machines.find((item) => item.name === selectedMachine);
    if (!machine) {
      setProviderError('Não foi possível carregar as máquinas disponíveis para este repositório.');
      return;
    }
    const accepted = window.confirm(
      'Criar um Codespace para ' + repo.name + ' usando ' + machine.displayName +
      ' (' + (machine.memoryGb || '?') + ' GB de memória, ' + (machine.storageGb || '?') +
      ' GB de armazenamento), na branch ' + (defaultBranch || 'padrão') +
      (selectedDevcontainer ? ', com ' + selectedDevcontainer : ', com a configuração padrão') +
      '. O GitHub pode cobrar pelo uso de computação e armazenamento. Deseja continuar?'
    );
    if (!accepted) return;
    setBusy(true);
    setProviderError('');
    try {
      const created = await api.terminalCodespaceCreate(repo.id, machine.name, selectedDevcontainer || undefined);
      setCodespaces((current) => [created, ...current.filter((space) => space.name !== created.name)]);
      setSelectedCodespace(created.name);
      await startSession('codespace', created.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProviderError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  const stopCodespace = async (): Promise<void> => {
    const target = codespaces.find((space) => space.name === selectedCodespace);
    if (!target) return;
    if (!window.confirm('Parar ' + target.name + '? As sessões SSH conectadas serão encerradas.')) return;
    setBusy(true);
    try {
      const attached = sessions.filter((session) =>
        session.provider === 'codespace' &&
        session.codespaceName === target.name &&
        session.state === 'running'
      );
      await Promise.all(attached.map((session) => api.terminalClose(session.id)));
      await api.terminalCodespaceStop(repo.id, target.name);
      setSessions((current) => current.map((session) => attached.some((item) => item.id === session.id)
        ? { ...session, state: 'exited' }
        : session));
      await loadCodespaces();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProviderError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  const cleanupTemporaryCheckout = async (): Promise<void> => {
    if (tempStatus.dirty) {
      setProviderError('O checkout tem alterações ou commits pendentes. Ele foi preservado.');
      return;
    }
    if (!window.confirm('Remover o checkout temporário limpo deste projeto?')) return;
    setBusy(true);
    try {
      setTempStatus(await api.terminalTempCleanup(repo.id));
      setProviderError('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProviderError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  const openTemporaryFolder = async (): Promise<void> => {
    try {
      await api.terminalTempOpen(repo.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setProviderError(message);
      onError(message);
    }
  };

  const addSplit = async (): Promise<void> => {
    if (!activeSession || activeSession.state !== 'running') return;
    const next = await startSession(activeSession.provider, activeSession.codespaceName);
    if (next) setSplitIds([activeSession.id, next.id]);
  };

  const clearActive = async (): Promise<void> => {
    if (!activeSession || !activeControls) return;
    activeControls.clear();
    try { await api.terminalClear(activeSession.id); }
    catch (error) { onError(error instanceof Error ? error.message : String(error)); }
  };

  const copySelection = async (): Promise<void> => {
    const selection = activeControls?.selection() ?? '';
    if (!selection) return;
    try { await navigator.clipboard.writeText(selection); }
    catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível copiar a seleção.'); }
  };

  const pasteClipboard = async (): Promise<void> => {
    if (!activeControls) return;
    try { activeControls.paste(await navigator.clipboard.readText()); }
    catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível ler a área de transferência.'); }
  };

  const searchNext = (value: string): void => {
    setSearchQuery(value);
    if (value) activeControls?.findNext(value);
  };

  const providerLabel = provider === 'local'
    ? 'Local'
    : provider === 'codespace'
      ? 'Codespaces'
      : 'Checkout temporário';
  const terminalSession = (id: string): TerminalSessionSnapshot | undefined =>
    sessions.find((session) => session.id === id);

  return (
    <section className={
      'relative flex min-h-0 flex-col overflow-hidden rounded-t border border-steam-elevated bg-[#101318] ' +
      (maximized ? 'absolute inset-0 z-30 rounded-none' : 'h-[58%] shrink-0')
    }>
      <header className="flex min-h-11 items-center gap-2 border-b border-steam-elevated px-3">
        <TerminalIcon size={15} className="text-steam-accent" />
        <span className="text-xs font-semibold">Terminal</span>
        <span className="text-[10px] text-steam-text/40">{providerLabel}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" title="Maximizar" aria-label="Maximizar terminal" onClick={() => setMaximized((value) => !value)} className="rounded p-1.5 text-steam-text/50 hover:bg-steam-elevated hover:text-steam-text">
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button type="button" title="Ocultar painel" aria-label="Ocultar terminal" onClick={onHide} className="rounded p-1.5 text-steam-text/50 hover:bg-steam-elevated hover:text-steam-text"><X size={14} /></button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-steam-elevated/70 px-3 py-2">
        <label className="flex items-center gap-2 text-[11px] text-steam-text/55">
          Ambiente
          <select value={provider} onChange={(event) => setProvider(event.target.value as TerminalProvider)} className="rounded border border-steam-elevated bg-steam-panel px-2 py-1.5 text-xs text-steam-text">
            {repo.localPath && <option value="local">Terminal local</option>}
            {repo.remoteUrl && <option value="codespace">GitHub Codespaces</option>}
            {repo.remoteUrl && <option value="temporary-local">Checkout temporário</option>}
          </select>
        </label>

        {provider === 'local' && (
          <button type="button" disabled={busy || !repo.localPath} onClick={() => void startSession('local')} className="inline-flex items-center gap-1.5 rounded bg-steam-accent px-3 py-1.5 text-xs font-semibold text-steam-bg disabled:opacity-45">
            <Plus size={13} /> Nova sessão local
          </button>
        )}

        {provider === 'codespace' && <>
          <label className="flex items-center gap-2 text-[11px] text-steam-text/55">
            Codespace
            <select value={selectedCodespace} onChange={(event) => setSelectedCodespace(event.target.value)} className="max-w-56 rounded border border-steam-elevated bg-steam-panel px-2 py-1.5 text-xs text-steam-text">
              {codespaces.length === 0 && <option value="">Nenhum existente</option>}
              {codespaces.map((space) => <option key={space.name} value={space.name}>{space.name} · {space.state === 'available' ? 'ativo' : space.state === 'shutdown' ? 'parado' : 'estado desconhecido'}</option>)}
            </select>
          </label>
          <button type="button" disabled={busy || !selectedCodespace} onClick={() => void connectCodespace()} className="inline-flex items-center gap-1.5 rounded bg-steam-accent px-3 py-1.5 text-xs font-semibold text-steam-bg disabled:opacity-45">
            <TerminalIcon size={13} /> {codespaces.find((space) => space.name === selectedCodespace)?.state === 'shutdown' ? 'Iniciar e conectar' : 'Conectar'}
          </button>
          <button type="button" disabled={busy || codespaces.length === 0} onClick={() => void stopCodespace()} className="inline-flex items-center gap-1 rounded border border-steam-elevated px-2.5 py-1.5 text-xs text-steam-text/65 disabled:opacity-40"><Power size={12} /> Parar Codespace</button>
          {machines.length > 0 && <>
            <label className="flex items-center gap-2 text-[11px] text-steam-text/55">
              Máquina
              <select value={selectedMachine} onChange={(event) => setSelectedMachine(event.target.value)} className="max-w-52 rounded border border-steam-elevated bg-steam-panel px-2 py-1.5 text-xs text-steam-text">
                {machines.map((machine) => <option key={machine.name} value={machine.name}>{machine.displayName} · {machine.memoryGb || '?'} GB</option>)}
              </select>
            </label>
            <span className="text-[10px] text-steam-text/35">Branch: {defaultBranch || 'padrão'}</span>
            {devcontainerPaths.length > 1 && <label className="flex items-center gap-2 text-[11px] text-steam-text/55">Configuração
              <select value={selectedDevcontainer} onChange={(event) => setSelectedDevcontainer(event.target.value)} className="max-w-56 rounded border border-steam-elevated bg-steam-panel px-2 py-1.5 text-xs text-steam-text">
                {devcontainerPaths.map((path) => <option key={path} value={path}>{path}</option>)}
              </select>
            </label>}
            {codespaces.length === 0 && <button type="button" disabled={busy} onClick={() => void createCodespace()} className="rounded border border-steam-accent/50 px-2.5 py-1.5 text-xs text-steam-accent disabled:opacity-45">Criar Codespace…</button>}
          </>}
          <a href={BILLING_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-steam-text/45 hover:text-steam-accent">Cobrança <ExternalLink size={10} /></a>
        </>}

        {provider === 'temporary-local' && <>
          <button type="button" disabled={busy} onClick={() => void startSession('temporary-local')} className="inline-flex items-center gap-1.5 rounded bg-steam-accent px-3 py-1.5 text-xs font-semibold text-steam-bg disabled:opacity-45">
            <Plus size={13} /> {tempStatus.exists ? 'Abrir terminal temporário' : 'Criar checkout e abrir'}
          </button>
          {tempStatus.exists && <>
            <span className={'text-[10px] ' + (tempStatus.dirty ? 'text-amber-300' : 'text-steam-text/45')}>
              {tempStatus.dirty ? 'Checkout preservado com alterações pendentes' : 'Checkout temporário limpo'}
            </span>
            <button type="button" onClick={() => void openTemporaryFolder()} className="rounded border border-steam-elevated px-2 py-1.5 text-[10px] text-steam-text/65 hover:bg-steam-elevated">Abrir pasta</button>
            {tempStatus.dirty && repo.remoteUrl && <a href={repo.remoteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[10px] text-steam-accent">Abrir GitHub para publicar <ExternalLink size={10} /></a>}
            {!tempStatus.dirty && <button type="button" disabled={busy} onClick={() => void cleanupTemporaryCheckout()} className="rounded border border-steam-elevated px-2 py-1.5 text-[10px] text-steam-text/65 hover:bg-steam-elevated disabled:opacity-40">Remover checkout</button>}
          </>}
        </>}
      </div>

      {provider === 'codespace' && (
        <div className="flex items-center gap-2 border-b border-steam-elevated/50 bg-steam-panel/50 px-3 py-1.5 text-[10px] text-steam-text/45">
          <Globe size={12} />
          A conexão SSH requer um servidor SSH instalado na imagem do Codespace.
          {codespaces.length === 0 && !providerError && <button type="button" onClick={() => void loadCodespaces()} className="ml-auto inline-flex items-center gap-1 text-steam-accent"><RefreshCw size={11} /> Atualizar</button>}
        </div>
      )}

      {providerError !== '' && <p role="status" className="border-b border-steam-error/25 bg-steam-error/5 px-3 py-2 text-xs text-steam-error">{providerError}</p>}

      {sessions.length > 0 && <>
        <div className="flex min-h-10 items-center gap-1 overflow-x-auto border-b border-steam-elevated/70 px-2">
          {sessions.map((session) => (
            <button key={session.id} type="button" onClick={() => { setActiveId(session.id); setSplitIds(null); }} className={'flex shrink-0 items-center gap-2 rounded-t px-3 py-2 text-[11px] ' + (activeId === session.id ? 'border-b-2 border-steam-accent bg-steam-panel text-steam-text' : 'text-steam-text/45 hover:bg-steam-panel')}>
              <span className={'h-1.5 w-1.5 rounded-full ' + (session.state === 'running' ? 'bg-emerald-400' : session.state === 'error' ? 'bg-steam-error' : 'bg-steam-text/30')} />
              <span>{session.title}</span>
              {session.exitCode != null && <span className="text-[9px] opacity-50">({session.exitCode})</span>}
            </button>
          ))}
          <span className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" title="Abrir segundo terminal lado a lado" disabled={!activeSession || activeSession.state !== 'running' || busy} onClick={() => void addSplit()} className="rounded p-1.5 text-steam-text/45 hover:bg-steam-panel disabled:opacity-25"><Columns2 size={14} /></button>
            <button type="button" title="Limpar saída" disabled={!activeSession} onClick={() => void clearActive()} className="rounded p-1.5 text-steam-text/45 hover:bg-steam-panel disabled:opacity-25"><Trash2 size={14} /></button>
            <button type="button" title="Copiar seleção" disabled={!activeControls} onClick={() => void copySelection()} className="rounded p-1.5 text-steam-text/45 hover:bg-steam-panel disabled:opacity-25"><Copy size={14} /></button>
            <button type="button" title="Colar" disabled={!activeControls} onClick={() => void pasteClipboard()} className="rounded p-1.5 text-steam-text/45 hover:bg-steam-panel disabled:opacity-25"><Clipboard size={14} /></button>
            <button type="button" title="Buscar na saída" onClick={() => setSearchOpen((value) => !value)} className="rounded p-1.5 text-steam-text/45 hover:bg-steam-panel"><Search size={14} /></button>
            {activeSession?.state === 'running' && <button type="button" title="Encerrar sessão" onClick={() => void api.terminalClose(activeSession.id).catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)))} className="rounded p-1.5 text-steam-text/45 hover:bg-steam-error/20 hover:text-steam-error"><Power size={14} /></button>}
          </span>
        </div>
        {searchOpen && (
          <div className="flex items-center gap-2 border-b border-steam-elevated/50 px-3 py-1.5">
            <Search size={12} className="text-steam-text/40" />
            <input autoFocus value={searchQuery} onChange={(event) => searchNext(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') activeControls?.findNext(searchQuery); if (event.key === 'Escape') setSearchOpen(false); }} placeholder="Buscar na saída do terminal" className="min-w-0 flex-1 bg-transparent text-xs text-steam-text outline-none" />
            <button type="button" onClick={() => setSearchOpen(false)} aria-label="Fechar busca" className="text-steam-text/40 hover:text-steam-text"><X size={13} /></button>
          </div>
        )}
        <div className={'grid min-h-0 flex-1 ' + (visibleIds.length > 1 ? 'grid-cols-2 divide-x divide-steam-elevated' : 'grid-cols-1')}>
          {(visibleIds.length > 0 ? visibleIds : activeId ? [activeId] : []).map((id) => {
            const session = terminalSession(id);
            return session ? <TerminalPane key={id} session={session} onReady={registerControls} onError={onError} /> : null;
          })}
        </div>
      </>}

      {sessions.length === 0 && (
        <div className="flex min-h-28 flex-1 items-center justify-center px-5 text-center text-xs text-steam-text/35">
          Abra uma sessão quando precisar. Nenhum processo de terminal é iniciado automaticamente.
        </div>
      )}
    </section>
  );
}

function TerminalPane({ session, onReady, onError }: {
  session: TerminalSessionSnapshot;
  onReady: (id: string, controls: PaneControls | null) => void;
  onError: (message: string) => void;
}): React.JSX.Element {
  const host = useRef<HTMLDivElement | null>(null);
  const running = useRef(session.state === 'running');
  const currentSession = useRef(session);
  running.current = session.state === 'running';
  currentSession.current = session;

  useEffect(() => {
    let disposed = false;
    let terminal: import('@xterm/xterm').Terminal | null = null;
    let fitAddon: import('@xterm/addon-fit').FitAddon | null = null;
    let searchAddon: import('@xterm/addon-search').SearchAddon | null = null;
    let webLinksAddon: import('@xterm/addon-web-links').WebLinksAddon | null = null;
    let observer: ResizeObserver | null = null;
    let offOutput: (() => void) | null = null;
    let dataSubscription: { dispose: () => void } | null = null;

    const initialize = async (): Promise<void> => {
      const [xtermModule, fitModule, searchModule, webLinksModule] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-search'),
        import('@xterm/addon-web-links'),
        import('@xterm/xterm/css/xterm.css')
      ]);
      if (disposed || !host.current) return;
      terminal = new xtermModule.Terminal({
        cursorBlink: true,
        convertEol: true,
        scrollback: 2000,
        fontSize: 12,
        fontFamily: 'Consolas, "Cascadia Code", "Fira Code", monospace',
        theme: {
          background: '#101318',
          foreground: '#d7dae0',
          cursor: '#66c0f4',
          selectionBackground: '#66c0f455',
          black: '#171a21',
          red: '#f06b72',
          green: '#85d69a',
          yellow: '#e7c873',
          blue: '#66a5d9',
          magenta: '#c69be8',
          cyan: '#74c9d5',
          white: '#d7dae0',
          brightBlack: '#6e7785',
          brightRed: '#ff858b',
          brightGreen: '#9ee8ae',
          brightYellow: '#f4db91',
          brightBlue: '#83bcf0',
          brightMagenta: '#d7aeff',
          brightCyan: '#92e2eb',
          brightWhite: '#ffffff'
        }
      });
      fitAddon = new fitModule.FitAddon();
      searchAddon = new searchModule.SearchAddon();
      webLinksAddon = new webLinksModule.WebLinksAddon((_event, uri) => {
        if (uri.startsWith('https://') || uri.startsWith('http://')) window.open(uri, '_blank');
      });
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(searchAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(host.current);
      terminal.write(currentSession.current.buffer, () => fitAddon?.fit());
      terminal.attachCustomKeyEventHandler((event) => {
        const modifier = event.ctrlKey || event.metaKey;
        if (modifier && event.key.toLowerCase() === 'c' && terminal?.hasSelection()) {
          void navigator.clipboard.writeText(terminal.getSelection()).catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
          return false;
        }
        if (modifier && event.key.toLowerCase() === 'v') {
          void navigator.clipboard.readText().then((value) => terminal?.paste(value)).catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
          return false;
        }
        return true;
      });
      dataSubscription = terminal.onData((data) => {
        if (running.current) void api.terminalWrite(currentSession.current.id, data).catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
      });
      offOutput = api.onTerminalOutput((event) => {
        if (event.sessionId === currentSession.current.id) terminal?.write(event.data);
      });
      terminal.onResize(({ cols, rows }) => {
        if (running.current) void api.terminalResize(session.id, cols, rows).catch(() => undefined);
      });
      observer = new ResizeObserver(() => {
        try { fitAddon?.fit(); } catch { /* o painel pode estar oculto durante a animação */ }
      });
      observer.observe(host.current);
      requestAnimationFrame(() => {
        try { fitAddon?.fit(); terminal?.focus(); } catch { /* layout inicial */ }
      });
      onReady(session.id, {
        focus: () => terminal?.focus(),
        clear: () => terminal?.clear(),
        findNext: (query) => Boolean(searchAddon?.findNext(query)),
        selection: () => terminal?.getSelection() ?? '',
        paste: (value) => terminal?.paste(value)
      });
    };

    void initialize().catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
    return () => {
      disposed = true;
      observer?.disconnect();
      offOutput?.();
      dataSubscription?.dispose();
      onReady(session.id, null);
      terminal?.dispose();
      fitAddon?.dispose();
      searchAddon?.dispose();
      webLinksAddon?.dispose();
    };
  }, [session.id, onError, onReady]);

  return <div className="min-h-0 min-w-0 overflow-hidden p-1"><div ref={host} className="h-full w-full" /></div>;
}
