import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ExternalLink, GitBranch, Plus, RefreshCw, TerminalSquare } from 'lucide-react';
import type { GitBranchList } from '../../../../shared/git-branches';
import type { ProjectRepoSummary } from '../../../../shared/github-projects';
import type { Repo } from '../../../../shared/types';
import { api } from '../../lib/api';
import type { ProjectCloneState } from '../../store/projects';
import RepoTerminal from '../RepoTerminal';

interface Props {
  project: ProjectRepoSummary;
  repo?: Repo;
  clone?: ProjectCloneState;
  onBack: () => void;
  onCloneFirst: () => void;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

export default function ProjectWorkspace({
  project,
  repo,
  clone,
  onBack,
  onCloneFirst,
  onError,
  onSuccess
}: Props): React.JSX.Element {
  const repoId = repo?.id;
  const localPath = repo?.localPath;
  const isLocal = localPath != null && localPath !== '' && repo?.status !== 'missing';
  const [branches, setBranches] = useState<GitBranchList | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchBusy, setBranchBusy] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);

  const refreshBranches = useCallback(async (): Promise<void> => {
    if (repoId == null || localPath == null || localPath === '' || repo?.status === 'missing') return;
    setLoading(true);
    setLoadError(null);
    try {
      setBranches(await api.branchesList(repoId));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível carregar as branches.');
    } finally {
      setLoading(false);
    }
  }, [repo?.status, repoId, localPath]);

  useEffect(() => {
    setBranches(null);
    void refreshBranches();
  }, [refreshBranches]);

  const localNames = useMemo(() => new Set(branches?.local.map((branch) => branch.name) ?? []), [branches]);
  const cloning = clone?.status === 'cloning' || repo?.status === 'cloning';
  const cloneError = clone?.error ?? (repo?.status === 'error' ? repo.lastError : undefined);

  const checkout = async (branch: string): Promise<void> => {
    if (repoId == null) return;
    setBranchBusy(true);
    try {
      const result = await api.branchCheckout(repoId, branch);
      onSuccess(`Branch ${result.branch} selecionada.`);
      await refreshBranches();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Não foi possível trocar de branch.');
    } finally {
      setBranchBusy(false);
    }
  };

  const createBranch = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (repoId == null || project.defaultBranch == null || branchName.trim() === '') return;
    setBranchBusy(true);
    try {
      const result = await api.branchCreate(repoId, branchName.trim(), project.defaultBranch);
      setBranchName('');
      onSuccess(`Branch ${result.branch} criada a partir de ${project.defaultBranch}.`);
      await refreshBranches();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Não foi possível criar a branch.');
    } finally {
      setBranchBusy(false);
    }
  };

  return (
    <main className="projects-surface flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
      <header className="flex flex-col gap-4 border-b border-steam-elevated/60 pb-4 sm:flex-row sm:items-start">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-9 w-fit items-center gap-2 rounded border border-steam-elevated px-3 text-xs text-steam-text/85 transition-colors duration-150 hover:bg-steam-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Voltar a Projetos
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{project.fullName}</h1>
          <p className="mt-1 max-w-3xl text-sm leading-5 text-steam-text/75">
            {project.description ?? 'Branches locais e remotas deste repositório.'}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steam-text/75">
            <span className="inline-flex items-center gap-1.5">
              <GitBranch size={13} aria-hidden="true" />
              Branch padrão: {project.defaultBranch ?? 'não informada'}
            </span>
            <a
              href={project.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-steam-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
            >
              Abrir no GitHub <ExternalLink size={12} aria-hidden="true" />
            </a>
          </div>
        </div>
      </header>

      {!isLocal ? (
        <section className="max-w-3xl border-b border-steam-elevated/60 pb-5" aria-labelledby="clone-first-title">
          <h2 id="clone-first-title" className="text-base font-semibold">Este repositório ainda não está no PC</h2>
          <p className="mt-1 text-sm text-steam-text/75">
            Clone o projeto para listar branches, trocar de branch e abrir um terminal nesta pasta.
          </p>
          {cloning ? (
            <div className="mt-4 max-w-lg" role="status" aria-live="polite">
              <p className="mb-2 text-xs text-steam-text/80">{clone?.stage ?? 'Clonando repositório…'}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-steam-elevated" role="progressbar" aria-label={`Clonando ${project.name}`} aria-valuemin={0} aria-valuemax={100} {...(clone?.percent != null ? { 'aria-valuenow': clone.percent } : {})}>
                <div
                  className={`h-full rounded-full bg-steam-accent transition-[width] duration-200 motion-reduce:transition-none ${clone?.percent == null ? 'w-1/3 animate-pulse motion-reduce:animate-none' : ''}`}
                  style={clone?.percent != null ? { width: `${clone.percent}%` } : undefined}
                />
              </div>
            </div>
          ) : (
            <>
              {cloneError != null && <p className="mt-3 text-xs text-steam-error" role="status">{cloneError}</p>}
              <button
                type="button"
                onClick={onCloneFirst}
                className="mt-4 inline-flex min-h-9 items-center gap-2 rounded bg-steam-accent px-3 text-xs font-semibold text-steam-bg transition-colors duration-150 hover:bg-steam-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent focus-visible:ring-offset-2 focus-visible:ring-offset-steam-bg"
              >
                <GitBranch size={14} aria-hidden="true" /> Clonar primeiro
              </button>
            </>
          )}
        </section>
      ) : (
        <>
          <section className="max-w-4xl" aria-labelledby="new-branch-title">
            <form onSubmit={(event) => void createBranch(event)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="new-branch-name" id="new-branch-title" className="block text-sm font-medium">Criar branch a partir de {project.defaultBranch ?? 'branch padrão'}</label>
                <input
                  id="new-branch-name"
                  value={branchName}
                  onChange={(event) => setBranchName(event.target.value)}
                  placeholder="ex.: feature/minha-alteracao"
                  maxLength={120}
                  autoComplete="off"
                  className="mt-2 min-h-10 w-full rounded border border-steam-elevated bg-steam-bg px-3 text-sm text-steam-text placeholder:text-steam-text/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
                />
              </div>
              <button
                type="submit"
                disabled={branchName.trim() === '' || project.defaultBranch == null || branchBusy || !isLocal}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded bg-steam-accent px-4 text-xs font-semibold text-steam-bg transition-colors duration-150 hover:bg-steam-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent focus-visible:ring-offset-2 focus-visible:ring-offset-steam-bg disabled:cursor-not-allowed disabled:opacity-50"
                title={project.defaultBranch == null ? 'A branch padrão não foi informada pelo GitHub.' : undefined}
              >
                <Plus size={14} aria-hidden="true" /> Criar branch
              </button>
            </form>
            {project.defaultBranch == null && (
              <p className="mt-2 text-xs text-steam-text/70">A API do GitHub não informou a branch padrão deste repositório.</p>
            )}
          </section>

          <section className="max-w-5xl border-t border-steam-elevated/60 pt-4" aria-labelledby="branches-title">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="branches-title" className="text-base font-semibold">Branches</h2>
                <p className="mt-1 text-xs text-steam-text/70">
                  {branches?.current != null ? `Branch atual: ${branches.current}` : 'Branches locais e refs publicadas em origin.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshBranches()}
                disabled={loading || branchBusy}
                className="inline-flex min-h-9 items-center gap-1.5 rounded border border-steam-elevated px-3 text-xs text-steam-text/85 transition-colors duration-150 hover:bg-steam-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:opacity-50"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" />
                Atualizar branches
              </button>
            </div>

            {loadError != null && (
              <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded border border-steam-error/40 bg-steam-error/10 px-3 py-2.5 text-sm text-steam-error">
                <span className="min-w-0 flex-1">{loadError}</span>
                <button type="button" onClick={() => void refreshBranches()} className="rounded underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent">Tentar novamente</button>
              </div>
            )}

            {loading && branches == null ? (
              <ul className="mt-4 divide-y divide-steam-elevated/50" aria-busy="true" aria-label="Carregando branches">
                {[0, 1, 2].map((item) => <li key={item} className="flex items-center justify-between py-3"><span className="h-4 w-40 animate-pulse rounded bg-steam-elevated motion-reduce:animate-none" /><span className="h-7 w-20 animate-pulse rounded bg-steam-elevated motion-reduce:animate-none" /></li>)}
              </ul>
            ) : branches != null ? (
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <BranchGroup title="Locais" empty="Nenhuma branch local." count={branches.local.length}>
                  {branches.local.map((branch) => (
                    <li key={branch.name} className="flex min-h-11 items-center gap-3 py-2">
                      <GitBranch size={14} className={branch.current ? 'text-steam-accent' : 'text-steam-text/60'} aria-hidden="true" />
                      <code className="min-w-0 flex-1 truncate text-xs text-steam-text/90">{branch.name}</code>
                      {branch.current ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-steam-green"><Check size={12} aria-hidden="true" /> Atual</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void checkout(branch.name)}
                          disabled={branchBusy}
                          className="min-h-8 rounded border border-steam-elevated px-2.5 text-[11px] text-steam-text/85 transition-colors duration-150 hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:opacity-50"
                        >
                          Checkout
                        </button>
                      )}
                    </li>
                  ))}
                </BranchGroup>

                <BranchGroup title="Remotas" empty="Nenhuma branch remota encontrada." count={branches.remote.length}>
                  {branches.remote.map((branch) => {
                    const localExists = localNames.has(branch.name);
                    return (
                      <li key={branch.ref} className="flex min-h-11 items-center gap-3 py-2">
                        <GitBranch size={14} className="text-steam-text/50" aria-hidden="true" />
                        <code className="min-w-0 flex-1 truncate text-xs text-steam-text/80">{branch.ref}</code>
                        {localExists ? (
                          <span className="text-[11px] text-steam-text/65">Já existe localmente</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void checkout(branch.ref)}
                            disabled={branchBusy}
                            className="min-h-8 rounded border border-steam-elevated px-2.5 text-[11px] text-steam-text/85 transition-colors duration-150 hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:opacity-50"
                          >
                            Checkout
                          </button>
                        )}
                      </li>
                    );
                  })}
                </BranchGroup>
              </div>
            ) : null}
          </section>

          <section className="max-w-5xl border-t border-steam-elevated/60 pt-4" aria-labelledby="terminal-title">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="terminal-title" className="text-sm font-semibold">Terminal do repositório</h2>
                <p className="mt-1 break-all font-mono text-[11px] text-steam-text/70">{localPath}</p>
              </div>
              <button
                type="button"
                onClick={() => setTerminalOpen((open) => !open)}
                aria-expanded={terminalOpen}
                className="inline-flex min-h-9 items-center gap-2 rounded border border-steam-elevated px-3 text-xs font-medium text-steam-text/90 transition-colors duration-150 hover:bg-steam-panel hover:text-steam-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
              >
                <TerminalSquare size={14} aria-hidden="true" /> {terminalOpen ? 'Fechar terminal' : 'Abrir terminal'}
              </button>
            </div>
            {terminalOpen && (
              <div className="mt-3 h-72 max-h-[45vh] min-h-48 overflow-hidden rounded border border-steam-elevated" aria-label="Terminal interativo do repositório">
                <RepoTerminal cwd={localPath} />
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

interface BranchGroupProps {
  title: string;
  empty: string;
  count: number;
  children: React.ReactNode;
}

function BranchGroup({ title, empty, count, children }: BranchGroupProps): React.JSX.Element {
  return (
    <section aria-label={`${title}, ${count}`}>
      <h3 className="mb-1 text-xs font-semibold text-steam-text/75">{title} <span className="tabular-nums text-steam-text/60">{count}</span></h3>
      {count === 0 ? (
        <p className="border-t border-steam-elevated/50 py-3 text-xs text-steam-text/70">{empty}</p>
      ) : (
        <ul className="divide-y divide-steam-elevated/50 border-t border-steam-elevated/50">{children}</ul>
      )}
    </section>
  );
}
