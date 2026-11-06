import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CloudDownload, Loader2 } from 'lucide-react';
import type { Repo } from '@shared/types';
import { api } from '../lib/api';

const MAX_CHECKS = 12;

interface Props {
  onError: (message: string) => void;
  onSuccess?: (message: string) => void;
}

/** No startup: verifica commits atrás do remoto e oferece "Puxar todos". */
export default function OutdatedBanner({ onError, onSuccess }: Props): React.JSX.Element | null {
  const [pulling, setPulling] = useState(false);
  const [outdated, setOutdated] = useState<Repo[]>([]);
  const [checked, setChecked] = useState(false);

  const check = useCallback(async (): Promise<void> => {
    setOutdated([]);
    try {
      const settings = await api.settingsGet();
      if (!settings.checkUpdatesOnStart) {
        setChecked(true);
        return;
      }
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
          // repo individual indisponível não bloqueia os demais
        }
      }
      setOutdated(behind);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecked(true);
    }
  }, [onError]);

  useEffect(() => { void check(); }, [check]);

  const pullAll = async (): Promise<void> => {
    if (outdated.length === 0) return;
    setPulling(true);
    let updated = 0;
    for (const repo of outdated) {
      try {
        const result = await api.repoPull(repo.id);
        if (result.updated) updated += 1;
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
      }
    }
    setPulling(false);
    setOutdated([]);
    onSuccess?.(updated > 0 ? `${updated} repositório(s) atualizado(s).` : 'Todos já estavam atualizados.');
  };

  if (!checked) {
    return (
      <p className="mb-4 flex items-center gap-2 text-xs text-steam-text/40">
        <Loader2 size={13} className="animate-spin" />
        Verificando repositórios…
      </p>
    );
  }
  if (outdated.length === 0) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-steam-warn/40 bg-steam-warn/10 px-4 py-3 text-sm">
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
  );
}
