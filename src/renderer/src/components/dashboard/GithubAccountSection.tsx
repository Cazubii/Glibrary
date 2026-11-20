import { useMemo, useState } from 'react';
import { CalendarDays, Cloud, Code2, GitFork, Gauge as GaugeIcon, Link2, MapPin, Star, UserPlus, FolderGit2 } from 'lucide-react';
import type { DashboardAccount, GithubRateLimit } from '@shared/github-dashboard';
import { computeLanguageStats, rateLimitLevel } from '@shared/github-dashboard';
import { useLibraryStore } from '../../store/library';
import { api } from '../../lib/api';
import { Gauge, type Tone } from '../charts';
import { KpiCard, Panel } from './ui';

const LEVEL_TONE: Record<ReturnType<typeof rateLimitLevel>, Tone> = {
  ok: 'good',
  warn: 'warn',
  critical: 'bad'
};

const LEVEL_LABEL: Record<ReturnType<typeof rateLimitLevel>, string> = {
  ok: 'Cota folgada',
  warn: 'Cota baixa',
  critical: 'Cota quase esgotada'
};

function RateLimitCard({ rate, connected }: { rate: GithubRateLimit | null; connected: boolean }): React.JSX.Element {
  return (
    <Panel title="Cota da API do GitHub" icon={<GaugeIcon size={15} />}>
      {rate == null ? (
        <p className="py-10 text-center text-sm text-steam-text/50">Cota indisponível no momento.</p>
      ) : (
        <div className="flex flex-col items-center">
          <Gauge
            percent={rate.limit > 0 ? (rate.remaining / rate.limit) * 100 : 0}
            label="Cota restante"
            tone={LEVEL_TONE[rateLimitLevel(rate)]}
          />
          <p className="mt-2 text-xs text-steam-text/70">
            {LEVEL_LABEL[rateLimitLevel(rate)]} · <span className="tabular-nums">{rate.remaining.toLocaleString('pt-BR')}</span>
            <span className="text-steam-text/40"> / {rate.limit.toLocaleString('pt-BR')}</span>
          </p>
          <p className="mt-1 text-xs text-steam-text/40">
            Renova às {new Date(rate.resetAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            {connected ? '' : ' · cota anônima'}
          </p>
        </div>
      )}
    </Panel>
  );
}

function ConnectCard({ onConnected, onError }: { onConnected: () => void; onError: (m: string) => void }): React.JSX.Element {
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
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="h-full rounded-xl border border-dashed border-steam-elevated bg-steam-panel p-5">
      <div className="mb-2 flex items-center gap-2">
        <Cloud size={16} className="text-steam-accent" />
        <h2 className="text-sm font-medium">Conecte sua conta GitHub</h2>
      </div>
      <p className="text-xs text-steam-text/60">
        Cole um Personal Access Token para ver seu perfil, linguagens e repositórios aqui. Ele é cifrado com
        safeStorage — o mesmo token do botão GitHub no menu lateral.
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
          className="min-w-0 flex-1 rounded-lg border border-steam-elevated bg-steam-bg px-3 py-2 font-mono text-xs outline-none focus:border-steam-accent"
        />
        <button
          type="button"
          disabled={draft.trim().length < 10 || saving}
          onClick={() => void connect()}
          className="rounded-lg bg-steam-accent px-3 py-2 text-sm font-semibold text-steam-bg disabled:opacity-50"
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
  onError: (message: string) => void;
}

/** Seção 1 — indicadores da conta, cota da API e perfil GitHub. */
export default function GithubAccountSection({ account, onConnected, onError }: Props): React.JSX.Element {
  const profile = account.profile;
  const kpis = useMemo(() => {
    const repos = account.repos;
    const stars = repos.reduce((sum, repo) => sum + repo.stars, 0);
    const forks = repos.reduce((sum, repo) => sum + repo.forks, 0);
    const privateCount = repos.filter((repo) => repo.private).length;
    const topStars = repos.reduce((max, repo) => Math.max(max, repo.stars), 0);
    const languageCount = new Set(repos.map((repo) => repo.language).filter((language) => language != null)).size;
    const topLanguage = computeLanguageStats(repos).find((item) => item.label !== 'Outras' && item.label !== 'Sem linguagem')?.label;
    return { count: repos.length, stars, forks, privateCount, topStars, languageCount, topLanguage };
  }, [account.repos]);

  return (
    <section className="flex flex-col gap-4">
      {profile != null && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <KpiCard icon={<FolderGit2 size={14} />} label="Repositórios" value={kpis.count} caption="Próprios" badge={kpis.privateCount > 0 ? { text: `${kpis.privateCount} privados`, tone: 'neutral' } : undefined} />
          <KpiCard icon={<Star size={14} />} label="Estrelas" value={kpis.stars} caption="Somadas" badge={kpis.topStars > 0 ? { text: `máx. ${kpis.topStars.toLocaleString('pt-BR')}`, tone: 'good' } : undefined} />
          <KpiCard icon={<GitFork size={14} />} label="Forks" value={kpis.forks} caption="Nos seus repositórios" />
          <KpiCard icon={<UserPlus size={14} />} label="Seguidores" value={profile.followers} caption={`Seguindo ${profile.following}`} />
          <KpiCard icon={<Code2 size={14} />} label="Linguagens" value={kpis.languageCount} caption="Principal" badge={kpis.topLanguage != null ? { text: kpis.topLanguage, tone: 'good' } : undefined} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <RateLimitCard rate={account.rateLimit} connected={account.connected} />
        {profile == null ? (
          <div className="lg:col-span-2">
            <ConnectCard onConnected={onConnected} onError={onError} />
          </div>
        ) : (
          <Panel title="Perfil" className="lg:col-span-2">
            <div className="flex gap-4">
              {profile.avatarUrl != null && (
                <img src={profile.avatarUrl} alt="" width={64} height={64} className="h-16 w-16 shrink-0 rounded-full border border-steam-elevated" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className="text-lg font-semibold">{profile.name ?? profile.login}</p>
                  {profile.htmlUrl != null ? (
                    <a href={profile.htmlUrl} target="_blank" rel="noreferrer" className="text-sm text-steam-accent hover:underline">@{profile.login}</a>
                  ) : (
                    <span className="text-sm text-steam-text/60">@{profile.login}</span>
                  )}
                </div>
                {profile.bio != null && <p className="mt-1 text-sm text-steam-text/65">{profile.bio}</p>}
                <dl className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                  <div className="flex items-center gap-2 rounded-lg border border-steam-elevated/70 bg-steam-bg/40 px-3 py-2">
                    <dt className="text-steam-text/45">Repositórios públicos</dt>
                    <dd className="ml-auto font-medium tabular-nums">{profile.publicRepos}</dd>
                  </div>
                  {profile.createdAt != null && (
                    <div className="flex items-center gap-2 rounded-lg border border-steam-elevated/70 bg-steam-bg/40 px-3 py-2">
                      <dt className="flex items-center gap-1.5 text-steam-text/45"><CalendarDays size={13} />Membro desde</dt>
                      <dd className="ml-auto font-medium">{new Date(profile.createdAt).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</dd>
                    </div>
                  )}
                  {profile.location != null && (
                    <div className="flex items-center gap-2 rounded-lg border border-steam-elevated/70 bg-steam-bg/40 px-3 py-2">
                      <dt className="flex items-center gap-1.5 text-steam-text/45"><MapPin size={13} />Local</dt>
                      <dd className="ml-auto truncate font-medium">{profile.location}</dd>
                    </div>
                  )}
                  {profile.blog != null && (
                    <div className="flex items-center gap-2 rounded-lg border border-steam-elevated/70 bg-steam-bg/40 px-3 py-2">
                      <dt className="flex items-center gap-1.5 text-steam-text/45"><Link2 size={13} />Site</dt>
                      <dd className="ml-auto min-w-0 truncate">
                        <a
                          href={/^https?:\/\//.test(profile.blog) ? profile.blog : `https://${profile.blog}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-steam-accent hover:underline"
                        >
                          {profile.blog}
                        </a>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </section>
  );
}
