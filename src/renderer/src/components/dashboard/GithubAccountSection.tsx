import { useState } from 'react';
import { CalendarDays, Cloud, Gauge, Link2, MapPin, Users } from 'lucide-react';
import type { DashboardAccount, GithubRateLimit } from '@shared/github-dashboard';
import { rateLimitLevel } from '@shared/github-dashboard';
import { useLibraryStore } from '../../store/library';
import { api } from '../../lib/api';

const LEVEL_DOT: Record<ReturnType<typeof rateLimitLevel>, string> = {
  ok: 'bg-steam-green',
  warn: 'bg-steam-warn',
  critical: 'bg-steam-error'
};

const LEVEL_LABEL: Record<ReturnType<typeof rateLimitLevel>, string> = {
  ok: 'Cota folgada',
  warn: 'Cota baixa',
  critical: 'Cota quase esgotada'
};

function RateLimitCard({ rate, connected }: { rate: GithubRateLimit | null; connected: boolean }): React.JSX.Element {
  return (
    <div className="rounded border border-steam-elevated bg-steam-panel p-5">
      <div className="mb-3 flex items-center gap-2">
        <Gauge size={16} className="text-steam-accent" />
        <h2 className="text-sm font-semibold">Status da API</h2>
      </div>
      {rate == null ? (
        <p className="text-sm text-steam-text/50">Cota indisponível no momento.</p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${LEVEL_DOT[rateLimitLevel(rate)]}`} aria-hidden />
            <span className="text-sm text-steam-text/80">{LEVEL_LABEL[rateLimitLevel(rate)]}</span>
          </div>
          <p className="mt-2 text-2xl font-semibold tabular-nums">
            {rate.remaining.toLocaleString('pt-BR')}
            <span className="text-sm font-normal text-steam-text/50"> / {rate.limit.toLocaleString('pt-BR')}</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded bg-steam-elevated/60">
            <div
              className={`h-full ${LEVEL_DOT[rateLimitLevel(rate)]}`}
              style={{ width: `${rate.limit > 0 ? (rate.remaining / rate.limit) * 100 : 0}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-steam-text/40">
            Renova às {new Date(rate.resetAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            {connected ? '' : ' · cota anônima'}
          </p>
        </>
      )}
    </div>
  );
}

function ConnectCard({ onConnected, onError }: { onConnected: () => void; onError: (error: unknown) => void }): React.JSX.Element {
  const { updateSettings } = useLibraryStore();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const connect = async (): Promise<void> => {
    const token = draft.trim();
    if (token.length < 10) return;
    setSaving(true);
    try {
      await api.githubAuthCheck(token);
      await updateSettings({ githubToken: token });
      setDraft('');
      onConnected();
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="rounded border border-dashed border-steam-elevated bg-steam-panel p-5">
      <div className="mb-2 flex items-center gap-2">
        <Cloud size={16} className="text-steam-accent" />
        <h2 className="text-sm font-semibold">Conecte sua conta GitHub</h2>
      </div>
      <p className="text-xs text-steam-text/60">
        Cole um Personal Access Token para ver seu perfil, linguagens e repositórios aqui. Ele é cifrado com
        safeStorage — o mesmo token do botão GitHub no topo.
      </p>
      <a
        href="https://github.com/settings/tokens/new?scopes=repo&description=Glibrary"
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-xs text-steam-accent underline"
      >
        Gerar token no GitHub
      </a>
      <div className="mt-3 flex gap-2">
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void connect(); }}
          placeholder="ghp_…"
          aria-label="Token do GitHub"
          className="min-w-0 flex-1 rounded border border-steam-elevated bg-steam-bg px-3 py-2 font-mono text-xs outline-none focus:border-steam-accent"
        />
        <button
          type="button"
          disabled={draft.trim().length < 10 || saving}
          onClick={() => void connect()}
          className="rounded bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"
        >
          {saving ? 'Validando…' : 'Conectar'}
        </button>
      </div>
    </div>
  );
}

interface Props {
  account: DashboardAccount;
  onConnected: () => void;
  onError: (error: unknown) => void;
}

/** Seção 1 — perfil GitHub e status da cota da API. */
export default function GithubAccountSection({ account, onConnected, onError }: Props): React.JSX.Element {
  const profile = account.profile;
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      {profile == null ? (
        <div className="lg:col-span-2">
          <ConnectCard onConnected={onConnected} onError={onError} />
        </div>
      ) : (
        <div className="flex gap-4 rounded border border-steam-elevated bg-steam-panel p-5 lg:col-span-2">
          {profile.avatarUrl != null && (
            <img src={profile.avatarUrl} alt="" width={72} height={72} className="h-[72px] w-[72px] shrink-0 rounded-full" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h2 className="text-lg font-semibold">{profile.name ?? profile.login}</h2>
              {profile.htmlUrl != null ? (
                <a href={profile.htmlUrl} target="_blank" rel="noreferrer" className="text-sm text-steam-accent hover:underline">@{profile.login}</a>
              ) : (
                <span className="text-sm text-steam-text/60">@{profile.login}</span>
              )}
            </div>
            {profile.bio != null && <p className="mt-1 text-sm text-steam-text/70">{profile.bio}</p>}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-steam-text/60">
              <span className="flex items-center gap-1"><Users size={13} />
                <strong className="text-steam-text">{profile.followers}</strong> seguidores · <strong className="text-steam-text">{profile.following}</strong> seguindo
              </span>
              <span><strong className="text-steam-text">{profile.publicRepos}</strong> repositórios públicos</span>
              {profile.createdAt != null && (
                <span className="flex items-center gap-1"><CalendarDays size={13} />
                  Membro desde {new Date(profile.createdAt).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
                </span>
              )}
              {profile.location != null && <span className="flex items-center gap-1"><MapPin size={13} />{profile.location}</span>}
              {profile.blog != null && (
                <a
                  href={/^https?:\/\//.test(profile.blog) ? profile.blog : `https://${profile.blog}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-steam-accent hover:underline"
                >
                  <Link2 size={13} />{profile.blog}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
      <RateLimitCard rate={account.rateLimit} connected={account.connected} />
    </section>
  );
}
