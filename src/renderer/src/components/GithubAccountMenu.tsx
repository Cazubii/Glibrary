import { useEffect, useRef, useState } from 'react';
import { Check, Cloud, Copy, ExternalLink, LogOut, RefreshCw } from 'lucide-react';
import type { GithubOAuthDeviceSession, GithubUser } from '@shared/types';
import { useLibraryStore } from '../store/library';
import { api } from '../lib/api';

type AuthError = (error: unknown) => void;

/** Menu de conta GitHub: Device Flow principal e PAT nas opções avançadas. */
export default function GithubAccountMenu({ onError }: { onError: AuthError }): React.JSX.Element {
  const { updateSettings } = useLibraryStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [user, setUser] = useState<GithubUser | null>(null);
  const [draft, setDraft] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [deviceFlow, setDeviceFlow] = useState<GithubOAuthDeviceSession | null>(null);
  const [flowMessage, setFlowMessage] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const onErrorRef = useRef(onError);
  const deviceSessionId = deviceFlow?.sessionId;
  const deviceIntervalSeconds = deviceFlow?.intervalSeconds;
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.githubOAuthStatus()
      .then(({ configured }) => { if (active) setOauthAvailable(configured); })
      .catch(() => { if (active) setOauthAvailable(false); });
    void api.githubAuthMe()
      .then((identity) => { if (active) setUser(identity); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent): void => {
      if (menuRef.current != null && !menuRef.current.contains(event.target as Node)) {
        if (deviceSessionId != null) {
          setDeviceFlow(null);
          setFlowMessage('Login cancelado.');
        }
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open, deviceSessionId]);

  useEffect(() => {
    if (deviceSessionId == null || deviceIntervalSeconds == null) return;
    let cancelled = false;
    let timer: number | null = null;
    let intervalSeconds = deviceIntervalSeconds;

    const schedule = (seconds: number): void => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => { void poll(); }, Math.max(1, seconds) * 1_000);
    };
    const poll = async (): Promise<void> => {
      try {
        const result = await api.githubOAuthPoll(deviceSessionId);
        if (cancelled) return;
        if (result.status === 'pending') {
          intervalSeconds = result.intervalSeconds;
          schedule(intervalSeconds);
          return;
        }
        setDeviceFlow(null);
        if (result.status === 'complete') {
          setUser(result.user);
          setFlowMessage('Conta conectada ao GitHub.');
          setOpen(false);
        } else if (result.status === 'expired') {
          setFlowMessage('O código expirou. Inicie uma nova tentativa de login.');
        } else {
          setFlowMessage('O login foi cancelado no GitHub. Você pode tentar novamente.');
        }
      } catch (error) {
        if (cancelled) return;
        onErrorRef.current(error);
        schedule(intervalSeconds);
      }
    };

    schedule(intervalSeconds);
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      void api.githubOAuthCancel(deviceSessionId).catch(() => undefined);
    };
  }, [deviceSessionId, deviceIntervalSeconds]);

  const startDeviceFlow = async (): Promise<void> => {
    setSaving(true);
    setFlowMessage('');
    try {
      const session = await api.githubOAuthStart();
      setDeviceFlow(session);
      setCodeCopied(false);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const connectWithToken = async (): Promise<void> => {
    const token = draft.trim();
    if (token.length < 10) return;
    setSaving(true);
    try {
      const identity = await api.githubAuthCheck(token);
      await updateSettings({ githubToken: token });
      setUser(identity);
      setDraft('');
      setOpen(false);
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    try {
      await updateSettings({ githubToken: '' });
      setUser(null);
      setOpen(false);
    } catch (error) {
      onError(error);
    }
  };

  const cancelDeviceFlow = (): void => {
    setDeviceFlow(null);
    setFlowMessage('Login cancelado.');
  };

  const copyUserCode = async (): Promise<void> => {
    if (deviceFlow == null) return;
    try {
      await navigator.clipboard.writeText(deviceFlow.userCode);
      setCodeCopied(true);
    } catch (error) {
      onError(error);
    }
  };

  return (
    <div className="relative ml-auto" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (open && deviceSessionId != null) {
            setDeviceFlow(null);
            setFlowMessage('Login cancelado.');
          }
          setOpen((value) => !value);
        }}
        className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-steam-text/70 hover:bg-steam-panel hover:text-steam-accent"
        aria-label="Conta GitHub"
        aria-expanded={open}
      >
        {user?.avatarUrl != null ? (
          <img src={user.avatarUrl} alt="" width={18} height={18} className="rounded-full" />
        ) : (
          <Cloud size={16} />
        )}
        <span className="hidden xl:inline">{user?.login ?? 'GitHub'}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-steam-elevated bg-steam-panel p-4 shadow-xl">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-steam-text/60" role="status">
              <RefreshCw size={14} className="animate-spin" /> Verificando a conta…
            </p>
          ) : user != null ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                {user.avatarUrl != null && (
                  <img src={user.avatarUrl} alt="" width={40} height={40} className="rounded-full" />
                )}
                <div>
                  <div className="text-sm font-semibold">{user.name ?? user.login}</div>
                  <div className="text-xs text-steam-text/60">@{user.login}</div>
                </div>
              </div>
              <p className="text-xs text-steam-text/60">
                “Sair deste computador” apaga o acesso salvo aqui. Para revogar a permissão no GitHub, abra as configurações da sua conta.
              </p>
              <a
                href="https://github.com/settings/applications"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-steam-accent underline"
              >
                Revogar o Glibrary no GitHub <ExternalLink size={12} />
              </a>
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-steam-text/60 underline"
              >
                Revogar um token de acesso pessoal
              </a>
              <button
                type="button"
                onClick={() => void disconnect()}
                className="flex items-center justify-center gap-2 rounded bg-steam-elevated px-3 py-2 text-sm hover:bg-steam-error/20 hover:text-steam-error"
              >
                <LogOut size={14} /> Sair deste computador
              </button>
            </div>
          ) : deviceFlow != null ? (
            <div className="flex flex-col gap-3" aria-live="polite">
              <div className="text-sm font-semibold">Confirme no GitHub</div>
              <p className="text-xs text-steam-text/65">Abra a página do GitHub e informe este código de uso único:</p>
              <div className="flex items-center justify-between rounded border border-steam-elevated bg-steam-bg px-3 py-2">
                <code className="font-mono text-lg font-bold tracking-widest text-steam-text">{deviceFlow.userCode}</code>
                <button
                  type="button"
                  onClick={() => void copyUserCode()}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-steam-accent hover:bg-steam-elevated"
                  aria-label="Copiar código de acesso"
                >
                  {codeCopied ? <Check size={13} /> : <Copy size={13} />}
                  {codeCopied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
              <a
                href={deviceFlow.verificationUri}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg"
              >
                Abrir GitHub e informar o código <ExternalLink size={14} />
              </a>
              <p className="text-center text-xs text-steam-text/50" role="status">
                Aguardando autorização. O código expira por volta de {new Date(deviceFlow.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
              </p>
              <button type="button" onClick={cancelDeviceFlow} className="text-xs text-steam-text/60 underline">
                Cancelar login
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold">Conectar ao GitHub</div>
              {oauthAvailable ? (
                <>
                  <p className="text-xs text-steam-text/60">Confirme a conta no navegador. Você não precisa criar nem copiar um token.</p>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void startDeviceFlow()}
                    className="flex items-center justify-center gap-2 rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"
                  >
                    {saving ? <RefreshCw size={14} className="animate-spin" /> : <Cloud size={14} />}
                    {saving ? 'Preparando login…' : 'Entrar com GitHub'}
                  </button>
                </>
              ) : (
                <p className="rounded border border-steam-elevated bg-steam-bg p-2 text-xs text-steam-text/60">
                  A entrada simplificada depende da configuração do aplicativo GitHub pelo mantenedor. Enquanto isso, você pode usar a opção avançada.
                </p>
              )}
              {flowMessage !== '' && <p className="text-xs text-steam-text/70" role="status">{flowMessage}</p>}
              <button
                type="button"
                onClick={() => setAdvancedOpen((value) => !value)}
                className="text-left text-xs text-steam-accent underline"
                aria-expanded={advancedOpen}
              >
                {advancedOpen ? 'Ocultar opções avançadas' : 'Opções avançadas: usar token de acesso'}
              </button>
              {advancedOpen && (
                <div className="flex flex-col gap-3 border-t border-steam-elevated pt-3">
                  <p className="text-xs text-steam-text/60">
                    Gere um token de acesso pessoal com permissão para seus repositórios e cole aqui. Ele é cifrado neste computador.
                  </p>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=Glibrary"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-steam-accent underline"
                  >
                    Abrir geração de token no GitHub
                  </a>
                  <input
                    type="password"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void connectWithToken();
                    }}
                    placeholder="ghp_…"
                    aria-label="Token de acesso pessoal do GitHub"
                    className="w-full rounded border border-steam-elevated bg-steam-bg px-3 py-2 font-mono text-xs outline-none focus:border-steam-accent"
                  />
                  <button
                    type="button"
                    disabled={draft.trim().length < 10 || saving}
                    onClick={() => void connectWithToken()}
                    className="rounded bg-steam-elevated px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    {saving ? 'Validando…' : 'Validar e conectar'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
