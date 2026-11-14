import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CloudDownload, Loader2 } from 'lucide-react';
import type { Repo } from '@shared/types';
import { api } from '../lib/api';

const MAX_CHECKS = 12;

interface Props {
  onError: (error: unknown) => void;
  onSuccess?: (message: string) => void;
  checkOnStart: boolean;
  onCheckOnStartChange: (enabled: boolean) => void;
}

/** Verifica atualizações sob demanda e oferece "Puxar todos" quando necessário. */
export default function OutdatedBanner({ onError, onSuccess, checkOnStart, onCheckOnStartChange }: Props): React.JSX.Element {
  const [pulling, setPulling] = useState(false);
  const [checking, setChecking] = useState(false);
  const [outdated, setOutdated] = useState<Repo[]>([]);
  const [checked, setChecked] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const checkInProgress = useRef(false);

  const check = useCallback(async (): Promise<void> => {
    if (checkInProgress.current) return;
    checkInProgress.current = true;
    setChecking(true);
    setOutdated([]);
    setResultMessage(null);
    try {
      const lib = await api.libraryGet();
      const candidates = lib.repos
        .filter((repo) => (repo.status === 'cloned' || repo.status === 'installed') && repo.localPath)
        .slice(0, MAX_CHECKS);
      const behind: Repo[] = [];
      for (const repo of candidates) {
        try {
          const status = await api.repoFetchStatus(repo.id);
          if (status.behindBy > 0) behind.push({ ...repo, behindBy: status.behindBy });
        } catch {
          // Repo individual indisponível não bloqueia os demais.
        }
      }
      setOutdated(behind);
      setResultMessage(
        candidates.length === 0
          ? 'Não há projetos clonados para verificar.'
          : behind.length === 0
            ? 'Todos os projetos verificados estão atualizados.'
            : null
      );
    } catch (e) {
      setResultMessage('A verificação falhou. Tente novamente.');
      onError(e);
    } finally {
      checkInProgress.current = false;
      setChecked(true);
      setChecking(false);
    }
  }, [onError]);

  useEffect(() => {
    if (checkOnStart && !checked && !checkInProgress.current) void check();
  }, [checkOnStart, checked, check]);

  const pullAll = async (): Promise<void> => {
    if (outdated.length === 0) return;
    setPulling(true);
    let updated = 0;
    for (const repo of outdated) {
      try {
        const result = await api.repoPull(repo.id);
        if (result.updated) updated += 1;
      } catch (e) {
        onError(e);
      }
    }
    setPulling(false);
    setOutdated([]);
    setResultMessage(null);
    onSuccess?.(updated > 0 ? `${updated} repositório(s) atualizado(s).` : 'Todos já estavam atualizados.');
  };

  return (
    <div className="mb-4 space-y-2">
      {outdated.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded border border-steam-warn/40 bg-steam-warn/10 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-steam-warn" />
          <span className="font-medium text-steam-warn">
            {outdated.length} repositório(s) desatualizado(s):
          </span>
          <span className="text-steam-text/80">
            {outdated.map((repo) => `${repo.name} (+${repo.behindBy ?? 0})`).join(', ')}
          </span>
          <button
            type="button"
            disabled={pulling}
            onClick={() => void pullAll()}
            className="ml-auto flex items-center gap-2 rounded bg-steam-accent px-3 py-1.5 text-xs font-semibold text-steam-bg disabled:opacity-50"
          >
            <CloudDownload size={14} className={pulling ? 'animate-spin' : ''} />
            {pulling ? 'Puxando…' : 'Puxar todos'}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3 text-xs text-steam-text/60">
        {checking ? (
          <span className="flex items-center gap-2"><Loader2 size={13} className="animate-spin" />Verificando até {MAX_CHECKS} projetos…</span>
        ) : (
          <span>{resultMessage ?? 'A verificação remota só roda quando solicitada.'}</span>
        )}
        <button
          type="button"
          disabled={checking || pulling}
          onClick={() => void check()}
          className="rounded border border-steam-elevated px-2.5 py-1 text-xs font-medium text-steam-text hover:bg-steam-panel disabled:opacity-50"
        >
          {checking ? 'Verificando…' : checked ? 'Verificar novamente' : 'Verificar atualizações'}
        </button>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={checkOnStart}
            onChange={(event) => onCheckOnStartChange(event.target.checked)}
          />
          Verificar ao abrir a Biblioteca
        </label>
      </div>
    </div>
  );
}
