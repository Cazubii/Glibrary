import { useCallback, useEffect, useState } from 'react';
import { GitBranch, GitCommitHorizontal, RefreshCw, Upload } from 'lucide-react';
import type { GitFile, GitStatusDetail } from '@shared/types';
import { api, GlibraryApiError } from '../lib/api';
import Termo from './Termo';

interface Props {
  repoId: string;
  remoteUrl?: string | null;
  onError: (error: unknown) => void;
  onSuccess?: (message: string) => void;
}

const STATE_STYLE: Record<GitFile['state'], string> = {
  staged: 'text-steam-green',
  modified: 'text-steam-warn',
  untracked: 'text-steam-text/40'
};

const STATE_LABEL: Record<GitFile['state'], string> = {
  staged: 'S',
  modified: 'M',
  untracked: 'U'
};

/** Mostra o estado das versões locais e as ações para salvá-las e enviá-las. */
export default function RepoGitPanel({ repoId, remoteUrl, onError, onSuccess }: Props): React.JSX.Element {
  const [status, setStatus] = useState<GitStatusDetail | null>(null);
  const [notGit, setNotGit] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState<'status' | 'commit' | 'push' | null>('status');

  const refresh = useCallback(async (): Promise<void> => {
    setBusy('status');
    try {
      setStatus(await api.repoGitStatus(repoId));
      setNotGit(false);
    } catch (e) {
      const technicalMessage = e instanceof GlibraryApiError ? e.presentation.technicalDetails : e instanceof Error ? e.message : String(e);
      if (/not a git repository|does not appear to be a git repository|not a git directory/i.test(technicalMessage)) {
        setNotGit(true);
      } else {
        onError(e);
      }
    } finally {
      setBusy(null);
    }
  }, [repoId, onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const commit = async (): Promise<void> => {
    if (message.trim() === '') return;
    setBusy('commit');
    try {
      const { commit: hash } = await api.repoCommit(repoId, message.trim());
      setMessage('');
      onSuccess?.(`Nova versão salva (commit ${hash.slice(0, 7)}).`);
      await refresh();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };

  const push = async (): Promise<void> => {
    setBusy('push');
    try {
      const { branch } = await api.repoPush(repoId);
      onSuccess?.(`Enviado ao GitHub na linha ${branch}.`);
      await refresh();
    } catch (e) {
      onError(e);
    } finally {
      setBusy(null);
    }
  };

  if (notGit) {
    return (
      <div className="rounded-lg bg-steam-panel p-4 text-sm text-steam-text/70">
        Esta pasta ainda não controla versões. Use "Abrir terminal" para começar a controlar versões deste projeto, ou aponte a pasta correta.
      </div>
    );
  }

  const files = status?.files ?? [];
  const canCommit = status != null && files.length > 0 && message.trim() !== '' && busy == null;
  const canPush = status != null && remoteUrl != null && busy == null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-steam-panel p-3 text-sm">
        <GitBranch size={14} className="text-steam-accent" />
        <span className="font-semibold"><Termo id="branch" showTechnical />: {status?.branch ?? '—'}</span>
        {(status?.ahead ?? 0) > 0 && (
          <span className="rounded bg-steam-accent/20 px-2 py-0.5 text-xs text-steam-accent">
            ↑ {status?.ahead} {status?.ahead === 1 ? 'versão aguardando envio' : 'versões aguardando envio'}
          </span>
        )}
        {(status?.behind ?? 0) > 0 && (
          <span className="rounded bg-steam-warn/20 px-2 py-0.5 text-xs text-steam-warn">
            ↓ {status?.behind === 1 ? 'Há 1 novidade' : `Há ${status?.behind} novidades`} no GitHub
          </span>
        )}
        {remoteUrl == null && (
          <span className="text-xs text-steam-warn" title="Este projeto ainda não está conectado ao GitHub">Ainda não está no GitHub</span>
        )}
        <span className="ml-auto text-xs text-steam-text/50">
          {files.length === 0 ? 'Sem mudanças locais' : `${files.length} arquivo(s) alterados`}
        </span>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={busy != null}
          className="rounded p-1.5 hover:bg-steam-elevated disabled:opacity-50"
          aria-label="Atualizar status do git"
        >
          <RefreshCw size={14} className={busy === 'status' ? 'animate-spin' : ''} />
        </button>
      </div>

      {files.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-lg bg-steam-panel">
          <ul className="divide-y divide-steam-elevated/40 text-sm">
            {files.map((file) => (
              <li key={`${file.path}-${file.state}`} className="flex items-center gap-2 px-3 py-1.5">
                <span
                  className={`w-4 text-center font-mono text-xs font-bold ${STATE_STYLE[file.state]}`}
                  title={`Estado: ${file.state}`}
                >
                  {STATE_LABEL[file.state]}
                </span>
                <span className="truncate font-mono text-xs">{file.path}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Mensagem desta versão (ex.: corrige validação do formulário)"
          rows={2}
          disabled={files.length === 0}
          className="resize-none rounded border border-steam-elevated bg-steam-panel p-2 text-sm outline-none focus:border-steam-accent disabled:opacity-50"
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!canCommit}
            onClick={() => void commit()}
            className="flex items-center gap-1.5 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-40"
          >
            <GitCommitHorizontal size={15} />
            {busy === 'commit' ? 'Salvando versão…' : <Termo id="commit" showTechnical />}
          </button>
          <button
            type="button"
            disabled={!canPush}
            onClick={() => void push()}
            className="flex items-center gap-1.5 rounded bg-steam-elevated px-3 py-2 text-sm hover:bg-steam-accent/20 disabled:opacity-40"
          >
            <Upload size={15} />
            {busy === 'push' ? 'Enviando ao GitHub…' : <><Termo id="push" showTechnical />{(status?.ahead ?? 0) > 0 ? ` (↑ ${status?.ahead})` : ''}</>}
          </button>
        </div>
        {files.length === 0 && status != null && status.behind > 0 && (
          <p className="text-xs text-steam-text/50">Use <Termo id="pull" showTechnical /> na barra para trazer as novidades para cá.</p>
        )}
      </div>
    </div>
  );
}
