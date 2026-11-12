import { useEffect, useRef, useState } from 'react';
import { Cloud, LogOut, RefreshCw } from 'lucide-react';
import type { GithubUser } from '@shared/types';
import { useLibraryStore } from '../store/library';
import { api } from '../lib/api';

type AuthError = (message: string) => void;

/** Botão de conta GitHub no header: conecte via PAT (validado em /user). */
export default function GithubAccountMenu({ onError }: { onError: AuthError }): React.JSX.Element {
  const { updateSettings } = useLibraryStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<GithubUser | null>(null);
  const [draft, setDraft] = useState('');
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .githubAuthMe()
      .then((u) => setUser(u))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent): void => {
      if (menuRef.current != null && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const connect = async (): Promise<void> => {
    const token = draft.trim();
    if (token.length < 10) return;
    setSaving(true);
    try {
      const identity = await api.githubAuthCheck(token);
      await updateSettings({ githubToken: token });
      setUser(identity);
      setDraft('');
      setOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    try {
      await updateSettings({ githubToken: '' });
      setUser(null);
      setOpen(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="relative ml-auto" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded px-2.5 py-1.5 text-sm text-steam-text/70 hover:bg-steam-panel hover:text-steam-accent"
        aria-label="Conta GitHub"
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
            <p className="flex items-center gap-2 text-sm text-steam-text/60">
              <RefreshCw size={14} className="animate-spin" /> Verificando sessão…
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
              <p className="text-xs text-steam-text/50">
                Commit e push usam este token em memória (nunca é salvo em config/url do git).
              </p>
              <button
                type="button"
                onClick={() => void disconnect()}
                className="flex items-center justify-center gap-2 rounded bg-steam-elevated px-3 py-2 text-sm hover:bg-steam-error/20 hover:text-steam-error"
              >
                <LogOut size={14} /> Desconectar
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold">Conectar GitHub</div>
              <p className="text-xs text-steam-text/60">
                Gere um Personal Access Token com escopo <code className="text-steam-accent">repo</code> e cole aqui.
                Ele é cifrado com safeStorage e só sai para a API e o push.
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
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void connect();
                }}
                placeholder="ghp_…"
                className="w-full rounded border border-steam-elevated bg-steam-bg px-3 py-2 font-mono text-xs outline-none focus:border-steam-accent"
              />
              <button
                type="button"
                disabled={draft.trim().length < 10 || saving}
                onClick={() => void connect()}
                className="rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"
              >
                {saving ? 'Validando…' : 'Validar e conectar'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
