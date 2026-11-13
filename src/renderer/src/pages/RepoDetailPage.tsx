import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import {
  ArrowLeft,
  RefreshCw,
  Star,
  Wrench,
  AlertTriangle,
  Check,
  Globe,
  Download,
  Folder,
  Code,
  Terminal,
  ExternalLink,
  Trash2,
  FileText,
  Package,
  X
} from 'lucide-react';
import type { CommandSpec, ProcessKind, Repo } from '@shared/types';
import { useLibraryStore, runConfirmKey } from '../store/library';
import { useTerminalGroup, useTerminalsStore } from '../store/terminals';
import { api } from '../lib/api';
import GeneratedCover from '../components/GeneratedCover';
import StatusBadge from '../components/StatusBadge';
import CommandEditor from '../components/CommandEditor';
import ActionButton from '../components/ActionButton';
import LogConsole from '../components/LogConsole';
import ConfirmDialog from '../components/ConfirmDialog';
import RepoTerminal from '../components/RepoTerminal';
import RepoGitPanel from '../components/RepoGitPanel';

type Tab = 'overview' | 'git' | 'console' | 'commands' | 'notes';

interface Props {
  repoId: string;
  onBack: () => void;
  onError: (message: string) => void;
  onSuccessToast?: (message: string) => void;
}

export default function RepoDetailPage({ repoId, onBack, onError, onSuccessToast }: Props): React.JSX.Element {
  const { repos, logs, confirmedRuns, cloneProgress, tools, updateRepo, toggleFavorite, appendLog, clearLogs, confirmRun } =
    useLibraryStore();
  const repo = useMemo(() => repos.find((r) => r.id === repoId), [repos, repoId]);

  const missingTools = useMemo(() => {
    if (repo?.detection == null) return [] as string[];
    return repo.detection.requiredTools.filter(
      (id) => tools.find((t) => t.id === id)?.installed === false,
    );
  }, [repo?.detection, tools]);
  const blocked = missingTools.length > 0;
  const blockedReason = blocked ? `Falta instalar: ${missingTools.join(', ')}` : undefined;
  const [tab, setTab] = useState<Tab>('overview');
  const [detecting, setDetecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState(repo?.notes ?? '');
  const [notesTimer, setNotesTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const [pendingRun, setPendingRun] = useState<{ kind: ProcessKind; command: string } | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeText, setRemoveText] = useState('');
  const terminalGroup = useTerminalGroup(repo?.localPath);
  const termOpen = terminalGroup?.panelOpen ?? false;
  const openTerminalPanel = useTerminalsStore((state) => state.openPanel);
  const hideTerminalPanel = useTerminalsStore((state) => state.hidePanel);

  const repoLogs = logs[repoId] ?? [];

  useEffect(() => {
    setNotes(repo?.notes ?? '');
  }, [repo?.notes]);

  const patch = useCallback(
    async (p: Partial<Repo>): Promise<void> => {
      try {
        await updateRepo(repoId, p);
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    },
    [repoId, updateRepo, onError],
  );

  useEffect(() => {
    const offLog = api.onProcessLog(({ id, line }) => appendLog(id, line));
    return () => {
      offLog();
    };
  }, [appendLog]);

  if (repo == null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p>Repositório não encontrado</p>
        <button
          type="button"
          onClick={onBack}
          className="rounded bg-steam-accent px-4 py-2 text-sm font-semibold text-steam-bg"
        >
          Voltar
        </button>
      </div>
    );
  }

  const detectAgain = async (): Promise<void> => {
    setDetecting(true);
    try {
      const detection = await api.repoDetect(repo.id);
      const install = detection.installCandidates[0];
      const start = detection.startCandidates[0];
      await updateRepo(repo.id, {
        detection,
        ...(repo.commandsEditedByUser !== true
          ? {
              ...(install != null ? { installCommand: install } : {}),
              ...(start != null ? { startCommand: start } : {})
            }
          : {})
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setDetecting(false);
    }
  };

  const runKind = async (kind: ProcessKind): Promise<void> => {
    const spec = kind === 'install' ? repo.installCommand : repo.startCommand;
    if (spec == null) {
      onError(
        kind === 'install'
          ? 'Nenhum comando de instalação configurado'
          : 'Nenhum comando de início configurado',
      );
      return;
    }
    const key = runConfirmKey(repo.id, spec.command);
    if (!confirmedRuns.includes(key)) {
      setPendingRun({ kind, command: spec.command });
      return;
    }
    await execute(kind);
  };

  const clone = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.repoClone(repo.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const execute = async (kind: ProcessKind): Promise<void> => {
    setBusy(true);
    try {
      await api.processRun(repo.id, kind);
      await patch({
        status: kind === 'install' ? 'installing' : 'running'
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.processStop(repo.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pull = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.repoPull(repo.id);
      await patch({ behindBy: 0, lastPulledAt: new Date().toISOString() });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const locateFolder = async (): Promise<void> => {
    try {
      const folder = await api.dialogPickFolder();
      if (folder == null) return;
      await updateRepo(repo.id, { localPath: folder, status: 'cloned' });
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const runAction = async (fn: () => unknown): Promise<void> => {
    try {
      await fn();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  const createEnv = async (): Promise<void> => {
    await runAction(async () => {
      await api.repoCreateEnv(repo.id);
      if (repo.detection != null) {
        await patch({ detection: { ...repo.detection, hasEnvExample: false } });
      }
    });
  };

  const uninstall = async (): Promise<void> => {
    await runAction(async () => {
      await api.repoUninstallDeps(repo.id);
    });
  };

  const confirmRemove = async (deleteFolder: boolean): Promise<void> => {
    if (removeText.trim() !== repo.name) return;
    setRemoveOpen(false);
    setRemoveText('');
    await runAction(async () => {
      await api.repoRemove(repo.id, deleteFolder);
      onBack();
    });
  };

  const setCommand = (field: 'installCommand' | 'startCommand') =>
    (spec: CommandSpec | undefined): void => {
      void patch({ [field]: spec, commandsEditedByUser: true } as Partial<Repo>);
    };

  const saveNotes = (text: string): void => {
    setNotes(text);
    if (notesTimer != null) clearTimeout(notesTimer);
    setNotesTimer(
      setTimeout(() => {
        void patch({ notes: text });
      }, 500),
    );
  };

  const tabButton = (id: Tab, label: string): React.JSX.Element => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={`border-b-2 px-4 py-2 text-sm transition-colors ${
        tab === id
          ? 'border-steam-accent text-steam-accent'
          : 'border-transparent text-steam-text/60 hover:text-steam-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="relative">
        <div className="h-40 w-full overflow-hidden">
          <GeneratedCover repo={repo} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex items-end gap-4 bg-gradient-to-t from-steam-bg to-transparent p-4">
          <button
            type="button"
            onClick={onBack}
            className="mb-1 rounded bg-steam-panel/80 p-2 hover:bg-steam-elevated"
            aria-label="Voltar"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1">
            <div className="text-xs text-steam-text/60">{repo.owner ?? 'local'}</div>
            <h1 className="text-2xl font-bold">{repo.name}</h1>
          </div>
          <ActionButton
            repo={repo}
            busy={busy}
            blocked={blocked}
            blockedReason={blockedReason}
            cloneProgress={cloneProgress[repo.id]}
            onInstall={() => void (repo.status === 'not_cloned' ? clone() : runKind('install'))}
            onStart={() => void runKind('start')}
            onStop={() => void stop()}
            onRetry={() => void (repo.status === 'error' && repo.localPath == null ? clone() : runKind('install'))}
            onLocate={() => void locateFolder()}
          />
          <button
            type="button"
            onClick={() => void toggleFavorite(repo.id)}
            className={`mb-1 rounded p-2 ${
              repo.favorite ? 'text-steam-warn' : 'text-steam-text/50 hover:text-steam-text'
            }`}
            aria-label="Favoritar"
          >
            <Star size={20} fill={repo.favorite ? 'currentColor' : 'none'} />
          </button>
          <button
            type="button"
            onClick={() => void detectAgain()}
            disabled={detecting}
            className="mb-1 flex items-center gap-2 rounded bg-steam-elevated px-3 py-2 text-sm hover:bg-steam-accent/20 disabled:opacity-50"
          >
            <RefreshCw size={14} className={detecting ? 'animate-spin' : ''} />
            Detectar de novo
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-steam-elevated/50 px-4 py-2">
        <StatusBadge status={repo.status} />
        {blocked && (
          <span className="flex items-center gap-1 rounded bg-steam-warn/20 px-2 py-1 text-xs text-steam-warn">
            <AlertTriangle size={12} /> Falta: {missingTools.join(', ')}
          </span>
        )}
        {(repo.behindBy ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => void pull()}
            disabled={busy}
            className="flex items-center gap-1 rounded bg-steam-accent/20 px-2 py-1 text-xs text-steam-accent hover:bg-steam-accent/30 disabled:opacity-50"
          >
            <Download size={12} /> Atualizar ({repo.behindBy} commits atrás)
          </button>
        )}
        {repo.commandsEditedByUser === true && (
          <span className="text-[11px] text-steam-warn" title="Comandos editados manualmente">
            comandos editados
          </span>
        )}
        {repo.openUrl != null && (
          <button
            type="button"
            onClick={() => void api.repoOpenBrowser(repo.id).catch((e: unknown) => onError(String(e)))}
            className="flex items-center gap-1 rounded bg-steam-green/20 px-2 py-1 text-xs text-steam-green hover:bg-steam-green/30"
          >
            <Globe size={12} /> Abrir no navegador
          </button>
        )}
      </div>

      <div className="flex border-b border-steam-elevated/50 px-4">
        {tabButton('overview', 'Visão geral')}
        {tabButton('git', 'Git')}
        {tabButton('console', 'Console')}
        {tabButton('commands', 'Comandos')}
        {tabButton('notes', 'Notas')}
        {repo.localPath != null && (
          <button
            type="button"
            onClick={() => {
              if (repo.localPath == null) return;
              if (termOpen) hideTerminalPanel(repo.localPath);
              else void openTerminalPanel(repo.localPath);
            }}
            className={`ml-auto flex items-center gap-1.5 self-center rounded px-3 py-1.5 text-xs ${
              termOpen
                ? 'bg-steam-accent/30 text-steam-accent'
                : 'bg-steam-elevated text-steam-text/80 hover:bg-steam-accent/20'
            }`}
          >
            <Terminal size={14} /> Terminal embutido
          </button>
        )}
      </div>

      {termOpen && repo.localPath != null && (
        <div className="flex h-[42vh] min-h-[260px] flex-col border-t border-steam-elevated">
          <div className="flex items-center justify-between bg-steam-panel px-3 py-1.5 text-xs text-steam-text/70">
            <span className="font-mono truncate">{repo.localPath}</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <RepoTerminal cwd={repo.localPath} onClose={() => hideTerminalPanel(repo.localPath!)} />
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="flex flex-col gap-4">
            {repo.description != null && <p className="text-steam-text/80">{repo.description}</p>}
            <div className="flex flex-wrap gap-4 text-sm">
              {repo.stars != null && <span>★ {repo.stars}</span>}
              {repo.language != null && <span>{repo.language}</span>}
              {repo.localPath != null && (
                <span className="font-mono text-xs text-steam-text/60">{repo.localPath}</span>
              )}
            </div>
            {repo.detection != null && (
              <div className="rounded-lg bg-steam-panel p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Wrench size={14} /> Tipos detectados
                </div>
                <div className="flex flex-wrap gap-1">
                  {repo.detection.kinds.map((k) => (
                    <span key={k} className="rounded bg-steam-elevated px-2 py-0.5 text-xs">
                      {k}
                    </span>
                  ))}
                </div>
                {repo.detection.detectedPort != null && (
                  <div className="mt-2 text-xs text-steam-text/60">
                    Porta: {repo.detection.detectedPort}
                  </div>
                )}
                {repo.detection.hasEnvExample && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-steam-warn">
                    <AlertTriangle size={12} /> Tem .env.example sem .env
                  </div>
                )}
                <div className="mt-3 text-xs text-steam-text/60">
                  Ferramentas exigidas: {repo.detection.requiredTools.join(', ') || '—'}
                </div>
              </div>
            )}
            <div>
              <div className="mb-2 text-sm font-semibold">Tags</div>
              <TagEditor tags={repo.tags} onChange={(tags) => void patch({ tags })} />
            </div>

            <div className="rounded-lg bg-steam-panel p-4">
              <div className="mb-3 text-sm font-semibold">Ações</div>
              <div className="flex flex-wrap gap-2">
                {repo.localPath != null && (
                  <>
                    <ActionChip
                      icon={<Folder size={14} />}
                      label="Abrir pasta"
                      onClick={() => void runAction(() => api.repoOpenFolder(repo.id))}
                    />
                    <ActionChip
                      icon={<Code size={14} />}
                      label="Abrir no editor"
                      onClick={() => void runAction(() => api.repoOpenEditor(repo.id))}
                    />
                    <ActionChip
                      icon={<Terminal size={14} />}
                      label="Abrir terminal"
                      onClick={() => void runAction(() => api.repoOpenTerminal(repo.id))}
                    />
                  </>
                )}
                {repo.remoteUrl != null && (
                  <ActionChip
                    icon={<ExternalLink size={14} />}
                    label="Abrir no GitHub"
                    onClick={() =>
                      void runAction(() => {
                        window.open(repo.remoteUrl as string, '_blank');
                      })
                    }
                  />
                )}
                {repo.localPath != null && repo.detection?.hasEnvExample === true && (
                  <ActionChip
                    icon={<FileText size={14} />}
                    label="Criar .env"
                    onClick={() => void createEnv()}
                  />
                )}
                {repo.localPath != null &&
                  (repo.status === 'installed' || repo.status === 'cloned') && (
                    <ActionChip
                      icon={<Package size={14} />}
                      label="Desinstalar dependências"
                      onClick={() => void uninstall()}
                    />
                  )}
                <ActionChip
                  icon={<Trash2 size={14} />}
                  label="Remover da biblioteca"
                  danger
                  onClick={() => setRemoveOpen(true)}
                />
              </div>
            </div>
          </div>
        )}

        {tab === 'git' &&
          (repo.localPath != null ? (
            <RepoGitPanel
              repoId={repo.id}
              remoteUrl={repo.remoteUrl}
              onError={onError}
              {...(onSuccessToast != null ? { onSuccess: onSuccessToast } : {})}
            />
          ) : (
            <p className="text-steam-text/60">
              Clone este repositório (ou indique a pasta local) para usar a aba Git.
            </p>
          ))}

        {tab === 'console' && (
          <div className="h-full min-h-[320px]">
            <LogConsole lines={repoLogs} onClear={() => clearLogs(repo.id)} />
          </div>
        )}

        {tab === 'commands' && (
          <div className="flex flex-col gap-4">
            {repo.commandsEditedByUser === true && (
              <div className="flex items-center gap-2 rounded bg-steam-warn/10 px-3 py-2 text-xs text-steam-warn">
                <Check size={12} /> Comandos editados por você — a re-detecção não vai sobrescrever.
              </div>
            )}
            <CommandEditor
              label="Instalar"
              value={repo.installCommand}
              candidates={repo.detection?.installCandidates ?? []}
              onChange={setCommand('installCommand')}
            />
            <CommandEditor
              label="Iniciar"
              value={repo.startCommand}
              candidates={repo.detection?.startCandidates ?? []}
              readmeCommands={repo.detection?.readmeCommands}
              onChange={setCommand('startCommand')}
            />
          </div>
        )}

        {tab === 'notes' && (
          <textarea
            value={notes}
            onChange={(e) => saveNotes(e.target.value)}
            placeholder="Anotações livres sobre este repositório…"
            className="h-64 w-full resize-none rounded-lg bg-steam-panel p-4 text-sm outline-none focus:ring-1 focus:ring-steam-accent"
          />
        )}
      </div>

      {removeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setRemoveOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-lg bg-steam-panel p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Remover repositório"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-bold text-steam-error">
                <Trash2 size={18} /> Remover {repo.name}
              </h2>
              <button type="button" onClick={() => setRemoveOpen(false)} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <p className="mb-3 text-sm text-steam-text/70">
              Digite <strong className="text-steam-text">{repo.name}</strong> para confirmar. A
              pasta só é apagada na opção abaixo.
            </p>
            <input
              type="text"
              value={removeText}
              onChange={(e) => setRemoveText(e.target.value)}
              placeholder={repo.name}
              className="w-full rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm outline-none focus:border-steam-error"
            />
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={removeText.trim() !== repo.name}
                onClick={() => void confirmRemove(true)}
                className="rounded bg-steam-error px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                Remover e apagar a pasta do disco
              </button>
              <button
                type="button"
                disabled={removeText.trim() !== repo.name}
                onClick={() => void confirmRemove(false)}
                className="rounded bg-steam-elevated px-4 py-2 text-sm disabled:opacity-40"
              >
                Remover somente da biblioteca
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingRun != null && (
        <ConfirmDialog
          title="Confirmar execução"
          message={`Você vai executar código de terceiros na sua máquina.\n\nComando: ${pendingRun.command}\nPasta: ${repo.localPath ?? '(atual)'}`}
          confirmLabel="Executar"
          onConfirm={() => {
            const kind = pendingRun.kind;
            confirmRun(runConfirmKey(repo.id, pendingRun.command));
            setPendingRun(null);
            void execute(kind);
          }}
          onCancel={() => setPendingRun(null)}
        />
      )}
    </div>
  );
}

function ActionChip({
  icon,
  label,
  onClick,
  danger = false
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-xs ${
        danger
          ? 'bg-steam-error/15 text-steam-error hover:bg-steam-error/25'
          : 'bg-steam-elevated text-steam-text/80 hover:bg-steam-accent/20'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function TagEditor({
  tags,
  onChange
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
}): React.JSX.Element {
  const [draft, setDraft] = useState('');

  const add = (): void => {
    const tag = draft.trim().replace(/^#/, '');
    if (tag === '' || tags.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...tags, tag]);
    setDraft('');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-1 rounded bg-steam-elevated px-2 py-1 text-xs"
        >
          #{tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter((t) => t !== tag))}
            className="text-steam-text/50 hover:text-steam-error"
            aria-label={`Remover tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
        }}
        onBlur={add}
        placeholder="+ tag"
        className="w-24 rounded border border-steam-elevated bg-steam-bg px-2 py-1 text-xs outline-none focus:border-steam-accent"
      />
    </div>
  );
}
