import { useEffect, useState } from 'react';
import { CheckCircle2, CloudDownload, Loader2, RotateCw, X } from 'lucide-react';
import type { AppUpdateState } from '@shared/types';
import { api } from '../lib/api';

export default function AppUpdateBanner(): React.JSX.Element | null {
  const [state, setState] = useState<AppUpdateState | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const unsubscribe = api.onAppUpdateChanged((next) => {
      if (!active) return;
      setState(next);
      setHidden(false);
    });
    void api.appUpdateGetState().then((next) => {
      if (active) setState(next);
    }).catch(() => {
      // A indisponibilidade do serviço de atualização não impede o uso do app.
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  if (
    state == null || hidden ||
    !['available', 'downloading', 'downloaded', 'error', 'unavailable'].includes(state.status) ||
    (state.status === 'unavailable' && state.message == null)
  ) {
    return null;
  }

  const checkAgain = async (): Promise<void> => {
    setBusy(true);
    try {
      setState(await api.appUpdateCheck());
    } catch {
      // A falha já aparece no aviso; não mostrar dados técnicos ao usuário.
    } finally {
      setBusy(false);
    }
  };

  const install = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.appUpdateInstall();
    } catch {
      setBusy(false);
    }
  };

  return (
    <section
      className="mx-4 mt-3 flex flex-wrap items-center gap-3 rounded border border-steam-accent/40 bg-steam-accent/10 px-4 py-3 text-sm"
      aria-live="polite"
      aria-label="Atualização do Glibrary"
    >
      {state.status === 'downloading' ? (
        <Loader2 size={17} className="shrink-0 animate-spin text-steam-accent" aria-hidden="true" />
      ) : state.status === 'downloaded' ? (
        <CheckCircle2 size={17} className="shrink-0 text-steam-green" aria-hidden="true" />
      ) : state.status === 'error' ? (
        <RotateCw size={17} className="shrink-0 text-steam-warn" aria-hidden="true" />
      ) : (
        <CloudDownload size={17} className="shrink-0 text-steam-accent" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {state.status === 'downloaded'
            ? `Glibrary ${state.availableVersion ?? ''} está pronto para instalar`
            : state.status === 'downloading'
              ? 'Baixando atualização do Glibrary'
              : state.status === 'unavailable'
                ? 'Atualização automática indisponível nesta versão'
              : state.status === 'error'
                ? 'Não foi possível verificar atualizações'
                : `Nova versão do Glibrary${state.availableVersion ? `: ${state.availableVersion}` : ''}`}
        </p>
        <p className="text-xs text-steam-text/70">
          {state.status === 'downloading'
            ? `${state.percent ?? 0}% baixado`
            : state.status === 'error'
              ? state.message ?? 'Tente novamente mais tarde.'
              : state.message}
        </p>
      </div>
      {state.status === 'downloaded' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void install()}
          className="rounded bg-steam-accent px-3 py-1.5 text-xs font-semibold text-steam-bg disabled:opacity-50"
        >
          Reiniciar e atualizar
        </button>
      ) : state.status === 'error' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void checkAgain()}
          className="rounded border border-steam-elevated px-3 py-1.5 text-xs font-semibold hover:bg-steam-panel disabled:opacity-50"
        >
          {busy ? 'Verificando…' : 'Tentar novamente'}
        </button>
      ) : null}
      {state.status !== 'downloading' && (
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Fechar aviso de atualização"
          className="rounded p-1 text-steam-text/60 hover:bg-steam-panel hover:text-steam-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
        >
          <X size={15} />
        </button>
      )}
    </section>
  );
}
