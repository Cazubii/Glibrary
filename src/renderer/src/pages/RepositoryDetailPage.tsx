import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, FolderGit2, Globe, Terminal as TerminalIcon } from 'lucide-react';
import type { Repo } from '@shared/types';
import { api } from '../lib/api';
import RepoTerminal from '../components/RepoTerminal';

interface Props {
  repoId: string;
  onBack: () => void;
  onError: (message: string) => void;
}

export default function RepositoryDetailPage({ repoId, onBack, onError }: Props): React.JSX.Element {
  const [repo, setRepo] = useState<Repo | null>(null);
  const [loading, setLoading] = useState(true);
  const [terminalOpen, setTerminalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api.libraryGet().then((library) => {
      if (!cancelled) setRepo(library.repos.find((item) => item.id === repoId) ?? null);
    }).catch((error: unknown) => {
      if (!cancelled) onError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repoId, onError]);

  if (loading) return <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-steam-text/50">Carregando projeto…</div>;
  if (!repo) return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-sm text-steam-text/55">
      <p>Este repositório não está mais na biblioteca.</p>
      <button type="button" onClick={onBack} className="rounded border border-steam-elevated px-3 py-2 hover:bg-steam-panel">Voltar aos projetos</button>
    </div>
  );

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-5">
      <div className="mb-4 flex min-w-0 items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Voltar aos projetos" className="rounded p-2 text-steam-text/55 hover:bg-steam-panel hover:text-steam-text"><ArrowLeft size={17} /></button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <FolderGit2 size={17} className="shrink-0 text-steam-accent" />
            <h1 className="truncate text-lg font-semibold">{repo.name}</h1>
            {repo.owner && <span className="truncate text-xs text-steam-text/40">por {repo.owner}</span>}
          </div>
          {repo.remoteUrl && (
            <a href={repo.remoteUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-[11px] text-steam-text/40 hover:text-steam-accent">
              {repo.remoteUrl}<ExternalLink size={10} />
            </a>
          )}
        </div>
        <span className="hidden items-center gap-1 rounded border border-steam-elevated px-2 py-1 text-[10px] text-steam-text/45 sm:inline-flex">
          {repo.localPath ? <FolderGit2 size={11} /> : <Globe size={11} />}
          {repo.localPath ? 'Pasta local disponível' : 'Repositório remoto'}
        </span>
        {!terminalOpen && (
          <button type="button" onClick={() => setTerminalOpen(true)} className="inline-flex shrink-0 items-center gap-2 rounded bg-steam-accent px-3 py-2 text-xs font-semibold text-steam-bg">
            <TerminalIcon size={14} /> Abrir terminal
          </button>
        )}
      </div>

      <section className="min-h-0 flex-1 overflow-auto rounded border border-steam-elevated/70 bg-steam-panel/35 p-5">
        <h2 className="text-sm font-semibold">Detalhes do repositório</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-steam-text/55">{repo.description || 'Sem descrição.'}</p>
        <div className="mt-5 grid gap-3 text-xs text-steam-text/50 sm:grid-cols-2">
          <div className="rounded border border-steam-elevated/70 bg-steam-panel p-3">
            <span className="block text-[10px] uppercase tracking-wide text-steam-text/35">Ambiente local</span>
            <span className="mt-1 block">{repo.localPath ? repo.localPath : 'Nenhum clone local'}</span>
          </div>
          <div className="rounded border border-steam-elevated/70 bg-steam-panel p-3">
            <span className="block text-[10px] uppercase tracking-wide text-steam-text/35">Linguagem</span>
            <span className="mt-1 block">{repo.language || 'Não identificada'}</span>
          </div>
        </div>
        {!terminalOpen && (
          <div className="mt-5 rounded border border-dashed border-steam-elevated p-4 text-xs text-steam-text/45">
            O terminal não inicia processos em segundo plano. Abra-o quando quiser executar comandos neste projeto.
          </div>
        )}
      </section>

      {terminalOpen && <RepoTerminal repo={repo} onHide={() => setTerminalOpen(false)} onError={onError} />}
    </main>
  );
}
