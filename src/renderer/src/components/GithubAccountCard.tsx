import { useEffect, useState, type FormEvent } from 'react';
import { ExternalLink, Github, KeyRound, RefreshCw, Unplug } from 'lucide-react';
import { useLibraryStore } from '../store/library';

const tokenSettingsUrl = 'https://github.com/settings/personal-access-tokens';

function stateLabel(state: string): string {
  if (state === 'connected') return 'Conectada';
  if (state === 'disconnected') return 'Não conectada';
  return 'Requer atenção';
}

export default function GithubAccountCard({ onError }: { onError: (message: string) => void }): React.JSX.Element {
  const status = useLibraryStore((s) => s.githubAccount);
  const loadAccount = useLibraryStore((s) => s.loadGithubAccount);
  const connectAccount = useLibraryStore((s) => s.connectGithubAccount);
  const disconnectAccount = useLibraryStore((s) => s.disconnectGithubAccount);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState('');

  useEffect(() => {
    void loadAccount().catch((error: unknown) => {
      setInlineError(error instanceof Error ? error.message : String(error));
    });
  }, [loadAccount]);

  const refresh = async (): Promise<void> => {
    setBusy(true);
    setInlineError('');
    try {
      await loadAccount(true);
    } catch (error) {
      setInlineError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const connect = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (token.trim() === '' || busy) return;
    setBusy(true);
    setInlineError('');
    try {
      const next = await connectAccount(token.trim());
      if (next.state === 'connected') {
        setInlineError('');
      } else if (next.state === 'error') {
        setInlineError(next.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInlineError(message);
      onError(message);
    } finally {
      setToken('');
      setBusy(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    setBusy(true);
    setInlineError('');
    try {
      await disconnectAccount();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInlineError(message);
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  const connected = status?.state === 'connected';
  const statusMessage = status?.state === 'error'
    ? status.message
    : status?.state === 'connected'
      ? `Verificada em ${new Date(status.checkedAt).toLocaleString('pt-BR')}.`
      : status?.state === 'disconnected'
        ? 'Conecte uma credencial para ver a conta e os repositórios privados disponíveis.'
        : 'Consultando o estado da conta…';

  return (
    <section className="mb-6 rounded border border-steam-elevated bg-steam-panel p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-steam-elevated text-steam-accent">
          {connected
            ? <img src={status.account.avatarUrl} alt="" className="h-9 w-9 rounded-full" />
            : <Github size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Conta GitHub</h2>
          <p className="mt-0.5 text-xs text-steam-text/55">
            {connected ? (
              <a href={status.account.htmlUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-steam-accent">
                @{status.account.login}<ExternalLink size={11} />
              </a>
            ) : stateLabel(status?.state ?? 'loading')}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs ${connected ? 'border-steam-green/40 text-steam-green' : status?.state === 'error' ? 'border-steam-error/40 text-steam-error' : 'border-steam-elevated text-steam-text/50'}`}>
          {status ? stateLabel(status.state) : 'Verificando'}
        </span>
        <button type="button" onClick={() => void refresh()} disabled={busy} aria-label="Atualizar estado do GitHub" title="Atualizar" className="rounded p-2 text-steam-text/55 hover:bg-steam-elevated disabled:opacity-50">
          <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
        </button>
        {connected && (
          <button type="button" onClick={() => void disconnect()} disabled={busy} className="flex items-center gap-1 rounded border border-steam-elevated px-2.5 py-1.5 text-xs text-steam-text/60 hover:bg-steam-elevated disabled:opacity-50">
            <Unplug size={13} /> Desconectar
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-steam-text/55">{statusMessage}</p>
      {inlineError !== '' && <p role="status" className="mt-2 text-xs text-steam-error">{inlineError}</p>}
      {!connected && (
        <form onSubmit={(event) => void connect(event)} className="mt-4 flex flex-wrap items-end gap-2">
          <label className="flex min-w-64 flex-1 flex-col gap-1 text-xs text-steam-text/60">
            Token de acesso pessoal
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="github_pat_…"
              className="rounded border border-steam-elevated bg-steam-bg px-3 py-2 text-sm text-steam-text outline-none focus:border-steam-accent"
            />
          </label>
          <button type="submit" disabled={busy || token.trim() === ''} className="flex items-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50">
            <KeyRound size={14} /> {busy ? 'Verificando…' : 'Conectar'}
          </button>
          <a href={tokenSettingsUrl} target="_blank" rel="noreferrer" className="px-1 py-2 text-xs text-steam-text/55 underline hover:text-steam-accent">
            Criar token no GitHub
          </a>
          <p className="basis-full text-[11px] text-steam-text/40">
            Token fine-grained: permissão de repositórios Metadata: read nos repositórios que deseja listar. O token não é exibido novamente e o campo é limpo ao conectar.
          </p>
        </form>
      )}
    </section>
  );
}
