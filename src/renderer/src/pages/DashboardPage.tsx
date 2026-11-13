import { useCallback, useEffect, useMemo, useState } from 'react';
import { Flame, Layers3, BarChart3, Download, RefreshCw, Star } from 'lucide-react';
import type { Agent, AssetCategory, BaseItem, ProjectRef, Skill, UsageEvent } from '@shared/types';
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS } from '@shared/categories';
import { buildDashboardMarkdown, computeDashboardData, computeMonthlyUsage } from '@shared/dashboard';
import { DonutChart, HBarChart } from '../components/charts';
import { api } from '../lib/api';
import { useDashboardStore } from '../store/dashboard';
import GithubAccountSection from '../components/dashboard/GithubAccountSection';
import GithubCharts from '../components/dashboard/GithubCharts';
import SyncedReposSection from '../components/dashboard/SyncedReposSection';
import GettingStartedChecklist from '../components/GettingStartedChecklist';
import RepoDetailPage from './RepoDetailPage';

type Section = 'skills' | 'agents';

interface Props {
  onError: (error: unknown) => void;
  onSuccess: (message: string) => void;
  onOpenProjects: () => void;
  onOpenTools: () => void;
  onOpenAgents: () => void;
}

/** Aba inicial: conta GitHub, gráficos, projetos sincronizados e uso da biblioteca. */
export default function DashboardPage({ onError, onSuccess, onOpenProjects, onOpenTools, onOpenAgents }: Props): React.JSX.Element {
  const { account, loading, refreshing, error, load } = useDashboardStore();
  const [openRepoId, setOpenRepoId] = useState<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<ProjectRef[] | null>(null);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let cancelled = false;
    api.assetsGet()
      .then(({ projects }) => {
        if (cancelled) return;
        const recent = projects
          .filter((project) => project.localPath != null)
          .sort((left, right) => Date.parse(right.addedAt) - Date.parse(left.addedAt))
          .slice(0, 4);
        setRecentProjects(recent);
      })
      .catch((e: unknown) => onError(e));
    return () => { cancelled = true; };
  }, [onError]);
  const refresh = useCallback(() => { void load(true); }, [load]);

  if (openRepoId != null) {
    return <RepoDetailPage repoId={openRepoId} onBack={() => setOpenRepoId(null)} onError={onError} onSuccessToast={onSuccess} />;
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <header className="flex items-center">
        <div>
            <h1 className="text-xl font-semibold">Início</h1>
          <p className="mt-1 text-xs text-steam-text/50">
            Sua conta GitHub, os repositórios sincronizados e a saúde da biblioteca.
            {account != null && ` Atualizado às ${new Date(account.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`}
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading || refreshing}
          className="ml-auto flex items-center gap-1.5 rounded border border-steam-elevated bg-steam-panel px-3 py-1.5 text-xs hover:bg-steam-elevated/40 disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading || refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Atualizando…' : 'Atualizar'}
        </button>
      </header>

      <GettingStartedChecklist
        onError={onError}
        onOpenTools={onOpenTools}
        onOpenProjects={onOpenProjects}
        onOpenAgents={onOpenAgents}
      />

      {error != null && (
        <div role="alert" className="flex items-center gap-3 rounded border border-steam-error/40 bg-steam-error/10 px-4 py-3 text-sm text-steam-error">
          <span className="flex-1">{account != null ? `${error} Exibindo os últimos dados carregados.` : error}</span>
          <button type="button" onClick={refresh} className="text-xs underline">Tentar novamente</button>
        </div>
      )}

      {account == null ? (
        loading && (
          <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Carregando dados do GitHub">
            <div className="h-32 animate-pulse rounded border border-steam-elevated bg-steam-panel lg:col-span-2" />
            <div className="h-32 animate-pulse rounded border border-steam-elevated bg-steam-panel" />
          </div>
        )
      ) : (
        <>
          <GithubAccountSection account={account} onConnected={refresh} onError={onError} />
          {account.connected && <GithubCharts repos={account.repos} />}
        </>
      )}

      <section aria-labelledby="recent-projects-title" className="flex flex-col gap-3 border-b border-steam-elevated/30 pb-5">
        <header className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="recent-projects-title" className="text-base font-semibold">Projetos recentes</h2>
            <p className="mt-1 text-xs text-steam-text/55">Seus projetos neste computador, prontos para continuar.</p>
          </div>
          <button
            type="button"
            onClick={onOpenProjects}
            className="rounded border border-steam-elevated bg-steam-panel px-3 py-1.5 text-xs font-medium hover:bg-steam-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
          >
            {recentProjects?.length ? 'Ver projetos' : 'Abrir ou adicionar um projeto'}
          </button>
        </header>
        {recentProjects == null ? (
          <p className="text-sm text-steam-text/50" role="status">Carregando projetos…</p>
        ) : recentProjects.length > 0 ? (
          <ul className="divide-y divide-steam-elevated/40 rounded border border-steam-elevated/50 bg-steam-panel/40">
            {recentProjects.map((project) => (
              <li key={project.id} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">{project.name}</h3>
                  <p className="truncate text-xs text-steam-text/50">Adicionado {new Date(project.addedAt).toLocaleDateString('pt-BR')}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded border border-steam-elevated/50 bg-steam-panel/40 px-3 py-4 text-sm text-steam-text/60">
            Ainda não há projetos locais. Abra ou adicione um projeto para começar.
          </p>
        )}
      </section>

      <SyncedReposSection onOpen={setOpenRepoId} onError={onError} />

      <LibraryUsageSection onError={onError} onSuccess={onSuccess} />
    </main>
  );
}

/** Uso de Skills/Agents nos projetos (conteúdo original do Dashboard). */
function LibraryUsageSection({ onError, onSuccess }: Pick<Props, 'onError' | 'onSuccess'>): React.JSX.Element {
  const [assets, setAssets] = useState<{
    skills: Skill[];
    agents: Agent[];
    bases: BaseItem[];
    projects: ProjectRef[];
    usage: UsageEvent[];
  } | null>(null);
  const [section, setSection] = useState<Section>('skills');
  const [selectedCategories, setSelectedCategories] = useState<AssetCategory[]>([]);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api.assetsGet()
      .then((data) => {
        if (!cancelled) setAssets({ skills: data.skills, agents: data.agents, bases: data.bases, projects: data.projects, usage: data.usage });
      })
      .catch((e: unknown) => onError(e));
    return () => { cancelled = true; };
  }, [onError]);

  const toggleCategory = (category: AssetCategory): void => {
    setSelectedCategories((current) =>
      current.includes(category) ? current.filter((item) => item !== category) : [...current, category]
    );
  };

  const data = useMemo(
    () =>
      assets
        ? computeDashboardData(assets.skills, assets.agents, assets.bases, assets.projects, {
            categories: selectedCategories,
            favoritesOnly
          })
        : null,
    [assets, selectedCategories, favoritesOnly]
  );

  if (!data || !assets) {
    return <p className="py-10 text-center text-sm text-steam-text/50">Carregando uso da biblioteca…</p>;
  }

  const summary = data.summary;
  const statCards = [
    { label: 'Projetos', value: summary.projects },
    { label: 'Skills', value: summary.skills },
    { label: 'Agents', value: summary.agents },
    { label: 'Bases', value: summary.bases },
    { label: 'Favoritos', value: summary.favorites },
    { label: 'Skills sem uso', value: summary.unusedSkills },
    { label: 'Agents sem uso', value: summary.unusedAgents }
  ];

  const usageItems = section === 'skills'
    ? data.mostUsedSkills.map((item) => ({ label: item.name, value: item.count, hint: item.category }))
    : data.mostUsedAgents.map((item) => ({ label: item.name, value: item.count, hint: item.category }));
  const usageEmpty = section === 'skills'
    ? 'Adicione Skills a seus projetos para ver o uso aqui.'
    : 'Adicione Agents a seus projetos para ver o uso aqui.';
  const coverage = (section === 'skills' ? summary.projectsWithSkills : summary.projectsWithAgents);

  return (
    <section className="flex min-w-0 flex-col border-t border-steam-elevated/50 pt-6">
      <header className="mb-6 flex items-center">
        <div>
          <h2 className="text-lg font-semibold">Uso da biblioteca</h2>
          <p className="mt-1 text-xs text-steam-text/50">Uso de Skills e Agents nos seus projetos, saúde da biblioteca e contextos.</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            const markdown = buildDashboardMarkdown(data, assets.usage);
            try {
              const path = await api.dashboardExport(markdown);
              if (path) onSuccess(`Dashboard exportado: ${path}`);
            } catch (e) {
              onError(e);
            }
          }}
          className="ml-auto flex items-center gap-1.5 rounded border border-steam-elevated bg-steam-panel px-3 py-1.5 text-xs hover:bg-steam-elevated/40"
        >
          <Download size={14} />
          Exportar Markdown
        </button>
      </header>

      <header className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-steam-text/40">Filtros</span>
        {ASSET_CATEGORIES.map((category) => (
          <button
            type="button"
            key={category}
            onClick={() => toggleCategory(category)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${selectedCategories.includes(category) ? 'border-steam-accent bg-steam-elevated text-steam-accent' : 'border-steam-elevated text-steam-text/60 hover:bg-steam-panel'}`}
          >
            {ASSET_CATEGORY_LABELS[category]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFavoritesOnly((f) => !f)}
          className={`ml-auto flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs ${favoritesOnly ? 'border-steam-accent bg-steam-elevated text-steam-accent' : 'border-steam-elevated text-steam-text/60 hover:bg-steam-panel'}`}
        >
          <Star size={12} />
          Favoritos
        </button>
        {(selectedCategories.length > 0 || favoritesOnly) && (
          <button type="button" onClick={() => { setSelectedCategories([]); setFavoritesOnly(false); }} className="text-xs text-steam-text/50 underline hover:text-steam-accent">
            Limpar
          </button>
        )}
      </header>

      <section className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {statCards.map((card) => (
          <div key={card.label} className="rounded border border-steam-elevated bg-steam-panel p-4">
            <p className="text-xs uppercase tracking-wide text-steam-text/40">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-steam-text">{card.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded border border-steam-elevated bg-steam-panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Flame size={16} className="text-steam-accent" />
            <h2 className="text-sm font-semibold">Mais usados nos projetos</h2>
            <div className="ml-auto flex gap-1 text-xs">
              <button type="button" onClick={() => setSection('skills')} className={`rounded px-2 py-1 ${section === 'skills' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}>Skills</button>
              <button type="button" onClick={() => setSection('agents')} className={`rounded px-2 py-1 ${section === 'agents' ? 'bg-steam-elevated text-steam-accent' : 'text-steam-text/60 hover:bg-steam-panel'}`}>Agents</button>
            </div>
          </div>
          <HBarChart items={usageItems} emptyText={usageEmpty} />
          <p className="mt-3 text-xs text-steam-text/40">
            {coverage} de {summary.projects} projetos com {section === 'skills' ? 'Skills' : 'Agents'} associados · top 10
          </p>
        </section>

        <section className="rounded border border-steam-elevated bg-steam-panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-steam-accent" />
            <h2 className="text-sm font-semibold">Aberturas de Skills/Agents por mês</h2>
          </div>
          <HBarChart
            items={computeMonthlyUsage(assets.usage, new Date()).map((entry) => ({ label: entry.label, value: entry.count }))}
            emptyText="Nenhuma abertura registrada ainda."
          />
          <p className="mt-3 text-xs text-steam-text/40">Cada abertura (Abrir) de uma Skill ou Agent gera um evento nos últimos 6 meses.</p>
        </section>

        <section className="rounded border border-steam-elevated bg-steam-panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Layers3 size={16} className="text-steam-accent" />
            <h2 className="text-sm font-semibold">Uso por categoria</h2>
          </div>
          <DonutChart
            items={data.categoryDistribution.map((c) => ({ label: c.label, value: c.count }))}
            emptyText="Sem uso registrado ainda."
          />
        </section>

        <section className="rounded border border-steam-elevated bg-steam-panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 size={16} className="text-steam-accent" />
            <h2 className="text-sm font-semibold">Projetos antigos e cobertura</h2>
          </div>
          {data.oldestProjects.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-steam-text/40">
                  <th className="pb-2">Projeto</th>
                  <th className="pb-2 text-right">Skills</th>
                  <th className="pb-2 text-right">Agents</th>
                  <th className="pb-2 text-right">Desde</th>
                </tr>
              </thead>
              <tbody>
                {data.oldestProjects.map((project) => (
                  <tr key={project.id} className="border-t border-steam-elevated/50">
                    <td className="truncate py-2 pr-2 text-steam-text/80" title={project.name}>{project.name}</td>
                    <td className="py-2 text-right tabular-nums">{project.skillCount}</td>
                    <td className="py-2 text-right tabular-nums">{project.agentCount}</td>
                    <td className="py-2 pl-2 text-right text-xs text-steam-text/40">{new Date(project.addedAt).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="flex h-40 items-center justify-center rounded border border-dashed border-steam-elevated text-sm text-steam-text/40">
              Nenhum projeto cadastrado ainda.
            </p>
          )}
        </section>

        <section className="rounded border border-steam-elevated bg-steam-panel p-5">
          <div className="mb-4 flex items-center gap-2">
            <Layers3 size={16} className="text-steam-accent" />
            <h2 className="text-sm font-semibold">Tags mais usadas (projetos)</h2>
          </div>
          {data.topTags.length ? (
            <div className="flex flex-wrap gap-2">
              {data.topTags.map((tag) => (
                <span key={tag.tag} className="flex items-center gap-1.5 rounded-full border border-steam-elevated bg-steam-bg px-3 py-1 text-xs text-steam-text/70">
                  #{tag.tag}
                  <span className="opacity-60">{tag.count}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="flex h-40 items-center justify-center rounded border border-dashed border-steam-elevated text-sm text-steam-text/40">
              Nenhuma tag em projetos.
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
