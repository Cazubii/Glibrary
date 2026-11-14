import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  GitBranch,
  Globe2,
  LockKeyhole,
  Plus,
  RefreshCw,
  Send,
  Trash2
} from 'lucide-react';
import type { GitBranchList } from '../../../shared/git-branches';
import type { DevWorkspaceOpenResult, DevWorkspaceStatus, Repo } from '../../../shared/types';
import type { ProjectRepoSummary } from '../../../shared/github-projects';
import { api } from '../lib/api';
import { findLibraryRepo } from '../store/projects';
import { useLibraryStore } from '../store/library';
import { useTerminalGroup, useTerminalsStore } from '../store/terminals';
import RepoTerminal from '../components/RepoTerminal';
import Termo from '../components/Termo';

interface Props {
  project: ProjectRepoSummary;
  repo?: Repo;
  onBack: () => void;
  onSuccess: (message: string) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function DevWorkspacePage({ project, repo: initialRepo, onBack, onSuccess }: Props): React.JSX.Element {
  const loadLibrary = useLibraryStore((state) => state.load);
  const initialRepoRef = useRef<{ projectId: number; repo?: Repo }>({ projectId: project.id, ...(initialRepo != null ? { repo: initialRepo } : {}) });
  if (initialRepoRef.current.projectId !== project.id) {
    initialRepoRef.current = { projectId: project.id, ...(initialRepo != null ? { repo: initialRepo } : {}) };
  } else if (initialRepoRef.current.repo == null && initialRepo != null) {
    initialRepoRef.current.repo = initialRepo;
  }
  const [repo, setRepo] = useState<Repo | null>(initialRepo ?? null);
  const [workspace, setWorkspace] = useState<DevWorkspaceOpenResult | null>(null);
  const [branches, setBranches] = useState<GitBranchList | null>(null);
  const [status, setStatus] = useState<DevWorkspaceStatus | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'branch' | 'sync' | 'push' | 'discard' | null>(null);
  const [branchName, setBranchName] = useState('');
  const [attempt, setAttempt] = useState(0);
  const terminalGroup = useTerminalGroup(workspace?.workspacePath);
  const terminalPanelOpen = terminalGroup?.panelOpen ?? true;
  const openTerminalPanel = useTerminalsStore((state) => state.openPanel);
  const hideTerminalPanel = useTerminalsStore((state) => state.hidePanel);
  const activityTimer = useRef<number | null>(null);

  const refreshStatus = useCallback(async (repoId: string): Promise<void> => {
    try {
      setStatus(await api.devWorkspaceStatus(repoId));
    } catch (error) {
      setOpenError(errorMessage(error, 'Não foi possível atualizar o estado do workspace.'));
    }
  }, []);

  const refreshBranches = useCallback(async (repoId: string): Promise<void> => {
    setBranchError(null);
    try {
      setBranches(await api.devWorkspaceBranches(repoId));
    } catch (error) {
      setBranchError(errorMessage(error, 'Não foi possível carregar as linhas de trabalho.'));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setOpenError(null);
    setBranches(null);
    setStatus(null);
    setWorkspace(null);

    const prepare = async (): Promise<void> => {
      try {
        let registered = findLibraryRepo(useLibraryStore.getState().repos, project) ?? initialRepoRef.current.repo;
        if (registered == null) {
          registered = await api.repoAddByUrl(project.htmlUrl, false, project.name);
          await loadLibrary();
        }
        if (cancelled) return;
        setRepo(registered);

        const preferredBranch = registered.devSession?.branch ?? project.defaultBranch;
        const result = await api.devWorkspaceOpen(registered.id, preferredBranch);
        if (cancelled) return;
        setWorkspace(result);
        await loadLibrary();
        void refreshStatus(registered.id);
        void refreshBranches(registered.id);
      } catch (error) {
        if (!cancelled) setOpenError(errorMessage(error, 'Não foi possível preparar o workspace.'));
      }
    };

    void prepare();
    return () => { cancelled = true; };
  }, [attempt, loadLibrary, project, refreshBranches, refreshStatus]);

  const repoId = repo?.id;
  useEffect(() => {
    if (repoId == null || workspace == null) return;
    const timer = window.setInterval(() => { void refreshStatus(repoId); }, 10_000);
    return () => window.clearInterval(timer);
  }, [repoId, refreshStatus, workspace]);

  useEffect(() => () => {
    if (activityTimer.current != null) window.clearTimeout(activityTimer.current);
  }, []);

  const options = useMemo(() => {
    const local = branches?.local ?? [];
    const localNames = new Set(local.map((branch) => branch.name));
    const remote = (branches?.remote ?? [])
      .filter((branch) => !localNames.has(branch.name))
      .map((branch) => ({ value: branch.ref, label: branch.ref }));
    return [
      ...local.map((branch) => ({ value: branch.name, label: branch.name })),
      ...remote
    ];
  }, [branches]);

  const reloadWorkspaceInfo = async (id: string): Promise<void> => {
    await Promise.all([refreshStatus(id), refreshBranches(id), loadLibrary()]);
  };

  const switchBranch = async (branch: string): Promise<void> => {
    if (repoId == null || branch === '' || branch === workspace?.branch) return;
    setBusy('branch');
    setOpenError(null);
    try {
      const result = await api.devWorkspaceSwitchBranch(repoId, branch);
      setWorkspace((current) => current == null ? current : { ...current, branch: result.branch });
      await reloadWorkspaceInfo(repoId);
      onSuccess(`Linha de trabalho "${result.branch}" selecionada.`);
    } catch (error) {
      setOpenError(errorMessage(error, 'Não foi possível trocar de branch.'));
    } finally {
      setBusy(null);
    }
  };

  const createBranch = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (repoId == null || project.defaultBranch == null || branchName.trim() === '') return;
    setBusy('branch');
    setOpenError(null);
    try {
      const result = await api.devWorkspaceCreateBranch(repoId, branchName.trim(), project.defaultBranch);
      setBranchName('');
      setWorkspace((current) => current == null ? current : { ...current, branch: result.branch });
      await reloadWorkspaceInfo(repoId);
      onSuccess(`Linha de trabalho "${result.branch}" criada a partir de ${project.defaultBranch}.`);
    } catch (error) {
      setOpenError(errorMessage(error, 'Não foi possível criar a branch.'));
    } finally {
      setBusy(null);
    }
  };

  const sync = async (): Promise<void> => {
    if (repoId == null) return;
    setBusy('sync');
    setOpenError(null);
    try {
      const result = await api.devWorkspaceSync(repoId);
      setStatus(result.status);
      onSuccess(result.updated ? 'As novidades do GitHub foram baixadas.' : 'A linha de trabalho já está atualizada.');
    } catch (error) {
      setOpenError(errorMessage(error, 'Não foi possível baixar as novidades do GitHub.'));
    } finally {
      setBusy(null);
    }
  };

  const push = async (): Promise<void> => {
    if (repoId == null) return;
    const branchName = status?.branch ?? workspace?.branch;
    const confirmProtectedBranch = branchName === 'main' || branchName === 'master';
    if (confirmProtectedBranch && !window.confirm(`Você está prestes a enviar alterações para a linha principal (${branchName}). Isso publicará o trabalho no GitHub. Deseja continuar?`)) return;
    setBusy('push');
    setOpenError(null);
    try {
      const result = await api.devWorkspacePush(repoId, confirmProtectedBranch);
      setStatus(result.status);
      onSuccess(`Alterações enviadas para o GitHub na linha ${result.branch}.`);
    } catch (error) {
      setOpenError(errorMessage(error, 'Não foi possível enviar as alterações.'));
    } finally {
      setBusy(null);
    }
  };

  const discard = async (): Promise<void> => {
    if (repoId == null) return;
    const confirmed = window.confirm(
      `Descartar a pasta de trabalho de ${project.fullName}? A cópia gerenciada será removida. Uma cópia já cadastrada na biblioteca será preservada.`
    );
    if (!confirmed) return;
    setBusy('discard');
    setOpenError(null);
    try {
      const result = await api.devWorkspaceClose(repoId);
      await loadLibrary();
      onSuccess(result.removed ? 'Pasta de trabalho descartada.' : 'Sessão encerrada. A cópia cadastrada foi preservada.');
      onBack();
    } catch (error) {
      setOpenError(errorMessage(error, 'Não foi possível descartar o workspace.'));
      setBusy(null);
    }
  };

  const refreshAfterTerminalActivity = useCallback((): void => {
    if (repoId == null) return;
    if (activityTimer.current != null) window.clearTimeout(activityTimer.current);
    activityTimer.current = window.setTimeout(() => { void refreshStatus(repoId); }, 500);
  }, [repoId, refreshStatus]);

  const loading = workspace == null && openError == null;
  const changeLabel = status == null
    ? 'Verificando alterações…'
    : status.changes === 1
      ? '1 alteração não enviada'
      : `${status.changes.toLocaleString('pt-BR')} alterações não enviadas`;

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
      <header className="flex flex-wrap items-start gap-x-4 gap-y-3 border-b border-steam-elevated/60 pb-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-9 items-center gap-2 rounded border border-steam-elevated px-3 text-xs font-medium text-steam-text/90 transition-colors duration-150 hover:bg-steam-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Voltar a Projetos
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="min-w-0 truncate text-xl font-semibold">{project.fullName}</h1>
            <span className="inline-flex items-center gap-1 rounded-full border border-steam-elevated px-2 py-0.5 text-[11px] text-steam-text/80">
              {project.visibility === 'private' ? <LockKeyhole size={11} aria-hidden="true" /> : <Globe2 size={11} aria-hidden="true" />}
              {project.visibility === 'private' ? 'Privado' : 'Público'}
            </span>
            {project.language != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-steam-elevated px-2 py-0.5 text-[11px] text-steam-text/80">
                <span className="h-1.5 w-1.5 rounded-full bg-steam-accent" aria-hidden="true" />{project.language}
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 max-w-3xl text-xs leading-5 text-steam-text/70">{project.description ?? 'Workspace do repositório no GitHub.'}</p>
        </div>
        <a
          href={project.htmlUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded border border-steam-elevated px-3 text-xs text-steam-text/80 transition-colors duration-150 hover:bg-steam-panel hover:text-steam-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
        >
          GitHub <ExternalLink size={12} aria-hidden="true" />
        </a>
      </header>

      {openError != null && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded border border-steam-error/40 bg-steam-error/10 px-3 py-2.5 text-sm text-steam-error">
          <AlertCircle size={15} aria-hidden="true" />
          <span className="min-w-0 flex-1">{openError}</span>
          {workspace == null && (
            <button
              type="button"
              onClick={() => setAttempt((current) => current + 1)}
              className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
            >
              Tentar novamente
            </button>
          )}
        </div>
      )}

      {loading ? (
        <section className="flex min-h-72 flex-1 flex-col gap-4" aria-busy="true" aria-label="Preparando workspace">
          <div className="h-14 animate-pulse rounded border border-steam-elevated bg-steam-panel motion-reduce:animate-none" />
          <div className="h-10 w-2/3 animate-pulse rounded bg-steam-elevated motion-reduce:animate-none" />
          <div className="min-h-56 flex-1 animate-pulse rounded border border-steam-elevated bg-[#1b202b] motion-reduce:animate-none" />
        </section>
      ) : workspace != null ? (
        <>
          <section className="flex flex-wrap items-end gap-3" aria-label="Linha de trabalho (branch)">
            <div className="min-w-56 flex-1 sm:max-w-md">
              <label htmlFor="dev-branch" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-steam-text/85">
                <GitBranch size={13} className="text-steam-accent" aria-hidden="true" /> <Termo id="branch" showTechnical /> atual
              </label>
              <select
                id="dev-branch"
                value={workspace.branch}
                onChange={(event) => { void switchBranch(event.target.value); }}
                disabled={busy != null || branches == null}
                className="min-h-10 w-full rounded border border-steam-elevated bg-steam-panel px-3 text-sm text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:cursor-wait disabled:opacity-60"
              >
                {!options.some((option) => option.value === workspace.branch) && <option value={workspace.branch}>{workspace.branch}</option>}
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <form onSubmit={(event) => void createBranch(event)} className="flex min-w-56 flex-1 items-end gap-2 sm:max-w-lg">
              <div className="min-w-0 flex-1">
                <label htmlFor="dev-new-branch" className="mb-1.5 block text-xs font-medium text-steam-text/85">Nova linha de trabalho (branch) a partir de {project.defaultBranch ?? 'linha principal'}</label>
                <input
                  id="dev-new-branch"
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                  maxLength={120}
                  autoComplete="off"
                  placeholder="feature/minha-alteracao"
                  disabled={busy != null || project.defaultBranch == null}
                  className="min-h-10 w-full rounded border border-steam-elevated bg-steam-panel px-3 text-sm text-steam-text placeholder:text-steam-text/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:cursor-not-allowed disabled:opacity-55"
                />
              </div>
              <button
                type="submit"
                disabled={busy != null || branchName.trim() === '' || project.defaultBranch == null}
                className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded border border-steam-elevated px-3 text-xs font-medium text-steam-text/90 transition-colors duration-150 hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:cursor-not-allowed disabled:opacity-50"
                title={project.defaultBranch == null ? 'A branch padrão não foi informada pelo GitHub.' : undefined}
              >
                <Plus size={13} aria-hidden="true" /> Criar
              </button>
            </form>
          </section>

          {branchError != null && (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-steam-error">
              <AlertCircle size={13} aria-hidden="true" /><span>{branchError}</span>
              <button type="button" onClick={() => { if (repoId != null) void refreshBranches(repoId); }} className="underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent">Tentar novamente</button>
            </div>
          )}

          <section className="flex flex-wrap items-center gap-2 border-y border-steam-elevated/60 py-3" aria-label="Ações do workspace">
            <button
              type="button"
              onClick={() => void sync()}
              disabled={busy != null}
              className="inline-flex min-h-9 items-center gap-2 rounded bg-steam-accent px-3 text-xs font-semibold text-steam-bg transition-colors duration-150 hover:bg-steam-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent focus-visible:ring-offset-2 focus-visible:ring-offset-steam-bg disabled:cursor-wait disabled:opacity-55"
            >
              <RefreshCw size={13} className={busy === 'sync' ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
              {busy === 'sync' ? 'Baixando novidades…' : <Termo id="pull" showTechnical />}
            </button>
            <button
              type="button"
              onClick={() => void push()}
              disabled={busy != null}
              className="inline-flex min-h-9 items-center gap-2 rounded border border-steam-elevated bg-steam-panel px-3 text-xs font-medium text-steam-text/90 transition-colors duration-150 hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:cursor-wait disabled:opacity-55"
            >
              <Send size={13} aria-hidden="true" /> {busy === 'push' ? 'Enviando…' : <Termo id="push" showTechnical />}
            </button>
            <button
              type="button"
              onClick={() => void discard()}
              disabled={busy != null}
              className="ml-auto inline-flex min-h-9 items-center gap-2 rounded border border-steam-error/35 px-3 text-xs font-medium text-steam-error transition-colors duration-150 hover:bg-steam-error/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-error disabled:cursor-wait disabled:opacity-55"
            >
              <Trash2 size={13} aria-hidden="true" /> {busy === 'discard' ? 'Descartando…' : <>Descartar <Termo id="workspace" /></>}
            </button>
            <div className="flex basis-full flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steam-text/75 sm:basis-auto sm:ml-auto" aria-live="polite">
              <span className="tabular-nums">{changeLabel}</span>
              {status != null && status.ahead > 0 && (
                <span className="inline-flex items-center gap-1 tabular-nums"><ArrowUp size={12} aria-hidden="true" /> {status.ahead} versão(ões) para enviar</span>
              )}
              {status != null && status.behind > 0 && (
                <span className="inline-flex items-center gap-1 tabular-nums"><ArrowDown size={12} aria-hidden="true" /> {status.behind === 1 ? 'Há 1 novidade no GitHub' : `Há ${status.behind} novidades no GitHub`}</span>
              )}
            </div>
          </section>

          <section className={`flex flex-col ${terminalPanelOpen ? 'min-h-80 flex-1' : ''}`} aria-labelledby="workspace-terminal-title">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h2 id="workspace-terminal-title" className="text-sm font-semibold">Terminal da <Termo id="workspace" /></h2>
              <code className="min-w-0 truncate text-[11px] text-steam-text/50" title={workspace.workspacePath}>{workspace.workspacePath}</code>
              {busy === 'branch' && <span className="text-[11px] text-steam-text/60" role="status">Atualizando linha de trabalho…</span>}
              <button
                type="button"
                onClick={() => {
                  if (terminalPanelOpen) hideTerminalPanel(workspace.workspacePath);
                  else void openTerminalPanel(workspace.workspacePath);
                }}
                aria-expanded={terminalPanelOpen}
                className="ml-auto inline-flex min-h-8 items-center rounded border border-steam-elevated px-2.5 text-xs text-steam-text/85 transition-colors hover:bg-steam-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
              >
                {terminalPanelOpen ? 'Fechar terminal' : 'Abrir terminal'}
              </button>
            </div>
            {terminalPanelOpen && (
              <div className="h-[min(58vh,680px)] min-h-72 overflow-hidden rounded border border-steam-elevated bg-[#1b202b]">
                <RepoTerminal
                  cwd={workspace.workspacePath}
                  onActivity={refreshAfterTerminalActivity}
                  onClose={() => hideTerminalPanel(workspace.workspacePath)}
                />
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
