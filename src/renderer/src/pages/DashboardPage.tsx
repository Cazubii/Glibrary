import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, CalendarRange, Database, Flame, FolderGit2, Layers3, BarChart3, Download, RefreshCw, ShieldCheck, Sparkles, Star, Tags } from 'lucide-react';
import type { Agent, AssetCategory, BaseItem, ProjectRef, Skill, UsageEvent } from '@shared/types';
import { ASSET_CATEGORIES, ASSET_CATEGORY_LABELS } from '@shared/categories';
import { buildDashboardMarkdown, computeDashboardData, computeMonthlyUsage } from '@shared/dashboard';
import { ColumnChart, DonutChart, HBarChart, RingMeter } from '../components/charts';
import { api } from '../lib/api';
import { useDashboardStore } from '../store/dashboard';
import GithubAccountSection from '../components/dashboard/GithubAccountSection';
import GithubCharts from '../components/dashboard/GithubCharts';
import SyncedReposSection from '../components/dashboard/SyncedReposSection';
import { KpiCard, Panel } from '../components/dashboard/ui';
import RepoDetailPage from './RepoDetailPage';

type Section = 'skills' | 'agents';

interface Props { onError: (message: string) => void; onSuccess: (message: string) => void }

const BUTTON = 'flex items-center gap-1.5 rounded-lg border border-steam-elevated bg-steam-panel px-3 py-1.5 text-xs hover:bg-steam-elevated/50 disabled:opacity-60';
const EMPTY = 'flex h-40 items-center justify-center rounded-lg border border-dashed border-steam-elevated text-sm text-steam-text/40';

const percent = (part: number, total: number): number => (total > 0 ? (part / total) * 100 : 0);

/** Aba inicial: conta GitHub, gráficos, projetos sincronizados e uso da biblioteca. */
export default function DashboardPage({ onError, onSuccess }: Props): React.JSX.Element {
  const { account, loading, refreshing, error, load } = useDashboardStore();
  const [openRepoId, setOpenRepoId] = useState<string | null>(null);
  useEffect(() => { void load(); }, [load]);
  const refresh = useCallback(() => { void load(true); }, [load]);

  if (openRepoId != null) {
    return <RepoDetailPage repoId={openRepoId} onBack={() => setOpenRepoId(null)} onError={onError} onSuccessToast={onSuccess} />;
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5 md:p-6">
      <header className="flex flex-wrap items-center gap-3 rounded-xl border border-steam-elevated bg-steam-panel px-5 py-3.5">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-0.5 text-xs text-steam-text/50">
            Sua conta GitHub, os repositórios sincronizados e a saúde da biblioteca.
            {account != null && ` Atualizado às ${new Date(account.fetchedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`}
          </p>
        </div>
        <button type="button" onClick={refresh} disabled={loading || refreshing} className={`ml-auto ${BUTTON}`}>
          <RefreshCw size={14} className={loading || refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Atualizando…' : 'Atualizar'}
        </button>
      </header>

      {error != null && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-steam-error/40 bg-steam-error/10 px-4 py-3 text-sm text-steam-error">
          <span className="flex-1">{account != null ? `${error} Exibindo os últimos dados carregados.` : error}</span>
          <button type="button" onClick={refresh} className="text-xs underline">Tentar novamente</button>
        </div>
      )}

      {account == null ? (
        loading && (
          <div className="grid gap-4 lg:grid-cols-3" aria-busy="true" aria-label="Carregando dados do GitHub">
            <div className="h-32 animate-pulse rounded-xl border border-steam-elevated bg-steam-panel lg:col-span-2" />
            <div className="h-32 animate-pulse rounded-xl border border-steam-elevated bg-steam-panel" />
          </div>
        )
      ) : (
        <>
          <GithubAccountSection account={account} onConnected={refresh} onError={onError} />
          {account.connected && <GithubCharts repos={account.repos} />}
        </>
      )}

      <SyncedReposSection onOpen={setOpenRepoId} onError={onError} />

      <LibraryUsageSection onError={onError} onSuccess={onSuccess} />
    </main>
  );
}

/** Uso de Skills/Agents nos projetos (conteúdo original do Dashboard). */
function LibraryUsageSection({ onError, onSuccess }: Props): React.JSX.Element {
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
      .catch((e: unknown) => onError(e instanceof Error ? e.message : String(e)));
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
  const usedSkills = summary.skills - summary.unusedSkills;
  const usedAgents = summary.agents - summary.unusedAgents;

  const usageItems = section === 'skills'
    ? data.mostUsedSkills.map((item) => ({ label: item.name, value: item.count, hint: item.category }))
    : data.mostUsedAgents.map((item) => ({ label: item.name, value: item.count, hint: item.category }));
  const usageEmpty = section === 'skills'
    ? 'Adicione Skills a seus projetos para ver o uso aqui.'
    : 'Adicione Agents a seus projetos para ver o uso aqui.';
  const coverage = (section === 'skills' ? summary.projectsWithSkills : summary.projectsWithAgents);
  const chip = (active: boolean): string =>
    `rounded-full border px-2.5 py-0.5 text-xs ${active ? 'border-steam-accent/50 bg-steam-accent/10 text-steam-accent' : 'border-steam-elevated text-steam-text/60 hover:bg-steam-panel'}`;
  const tab = (active: boolean): string =>
    `rounded-md px-2 py-1 ${active ? 'bg-steam-elevated text-steam-text' : 'text-steam-text/55 hover:text-steam-text/85'}`;

  return (
    <section className="flex min-w-0 flex-col gap-4 border-t border-steam-elevated/60 pt-5">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-base font-semibold">Uso da biblioteca</h2>
          <p className="mt-0.5 text-xs text-steam-text/50">Uso de Skills e Agents nos seus projetos, saúde da biblioteca e contextos.</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            const markdown = buildDashboardMarkdown(data, assets.usage);
            try {
              const path = await api.dashboardExport(markdown);
              if (path) onSuccess(`Dashboard exportado: ${path}`);
            } catch (e) {
              onError(e instanceof Error ? e.message : String(e));
            }
          }}
          className={`ml-auto ${BUTTON}`}
        >
          <Download size={14} />
          Exportar Markdown
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-steam-text/35">Filtros</span>
        {ASSET_CATEGORIES.map((category) => (
          <button type="button" key={category} onClick={() => toggleCategory(category)} aria-pressed={selectedCategories.includes(category)} className={chip(selectedCategories.includes(category))}>
            {ASSET_CATEGORY_LABELS[category]}
          </button>
        ))}
        <button type="button" onClick={() => setFavoritesOnly((f) => !f)} aria-pressed={favoritesOnly} className={`ml-auto flex items-center gap-1 ${chip(favoritesOnly)}`}>
          <Star size={12} />
          Favoritos
        </button>
        {(selectedCategories.length > 0 || favoritesOnly) && (
          <button type="button" onClick={() => { setSelectedCategories([]); setFavoritesOnly(false); }} className="text-xs text-steam-text/50 underline hover:text-steam-accent">
            Limpar
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard icon={<FolderGit2 size={14} />} label="Projetos" value={summary.projects} caption="Na biblioteca" />
        <KpiCard
          icon={<Sparkles size={14} />}
          label="Skills"
          value={summary.skills}
          caption="Sem uso"
          badge={{ text: String(summary.unusedSkills), tone: summary.unusedSkills > 0 ? 'bad' : 'good' }}
        />
        <KpiCard
          icon={<Bot size={14} />}
          label="Agents"
          value={summary.agents}
          caption="Sem uso"
          badge={{ text: String(summary.unusedAgents), tone: summary.unusedAgents > 0 ? 'bad' : 'good' }}
        />
        <KpiCard icon={<Database size={14} />} label="Bases" value={summary.bases} caption="Repositórios-base" />
        <KpiCard icon={<Star size={14} />} label="Favoritos" value={summary.favorites} caption="Marcados" />
      </div>

      <Panel icon={<ShieldCheck size={15} />} title="Cobertura da biblioteca" footer="Verde a partir de 66%, amarelo a partir de 33%, vermelho abaixo disso.">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <RingMeter percent={percent(usedSkills, summary.skills)} detail={`${usedSkills}/${summary.skills}`} caption="Skills em uso" />
          <RingMeter percent={percent(usedAgents, summary.agents)} detail={`${usedAgents}/${summary.agents}`} caption="Agents em uso" />
          <RingMeter percent={percent(summary.projectsWithSkills, summary.projects)} detail={`${summary.projectsWithSkills}/${summary.projects}`} caption="Projetos com Skills" />
          <RingMeter percent={percent(summary.projectsWithAgents, summary.projects)} detail={`${summary.projectsWithAgents}/${summary.projects}`} caption="Projetos com Agents" />
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          icon={<Flame size={15} />}
          title="Mais usados nos projetos"
          action={
            <>
              <button type="button" onClick={() => setSection('skills')} aria-pressed={section === 'skills'} className={tab(section === 'skills')}>Skills</button>
              <button type="button" onClick={() => setSection('agents')} aria-pressed={section === 'agents'} className={tab(section === 'agents')}>Agents</button>
            </>
          }
          footer={`${coverage} de ${summary.projects} projetos com ${section === 'skills' ? 'Skills' : 'Agents'} associados · top 10`}
        >
          <HBarChart items={usageItems} emptyText={usageEmpty} />
        </Panel>

        <Panel icon={<CalendarRange size={15} />} title="Aberturas de Skills/Agents por mês" footer="Cada abertura (Abrir) de uma Skill ou Agent gera um evento nos últimos 6 meses.">
          <ColumnChart
            items={computeMonthlyUsage(assets.usage, new Date()).map((entry) => ({ label: entry.label, value: entry.count }))}
            emptyText="Nenhuma abertura registrada ainda."
            ariaLabel="Aberturas de Skills e Agents por mês"
          />
        </Panel>

        <Panel icon={<Layers3 size={15} />} title="Uso por categoria">
          <DonutChart
            items={data.categoryDistribution.map((c) => ({ label: c.label, value: c.count }))}
            emptyText="Sem uso registrado ainda."
          />
        </Panel>

        <Panel icon={<BarChart3 size={15} />} title="Projetos antigos e cobertura">
          {data.oldestProjects.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-steam-text/40">
                  <th className="pb-2 font-medium">Projeto</th>
                  <th className="pb-2 text-right font-medium">Skills</th>
                  <th className="pb-2 text-right font-medium">Agents</th>
                  <th className="pb-2 text-right font-medium">Desde</th>
                </tr>
              </thead>
              <tbody>
                {data.oldestProjects.map((project) => (
                  <tr key={project.id} className="border-t border-steam-elevated/60">
                    <td className="truncate py-2 pr-2 text-steam-text/80" title={project.name}>{project.name}</td>
                    <td className="py-2 text-right tabular-nums">{project.skillCount}</td>
                    <td className="py-2 text-right tabular-nums">{project.agentCount}</td>
                    <td className="py-2 pl-2 text-right text-xs text-steam-text/40">{new Date(project.addedAt).toLocaleDateString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={EMPTY}>Nenhum projeto cadastrado ainda.</p>
          )}
        </Panel>

        <Panel icon={<Tags size={15} />} title="Tags mais usadas (projetos)" className="xl:col-span-2">
          {data.topTags.length ? (
            <div className="flex flex-wrap gap-2">
              {data.topTags.map((tag) => (
                <span key={tag.tag} className="flex items-center gap-1.5 rounded-full border border-steam-elevated bg-steam-bg/60 px-3 py-1 text-xs text-steam-text/70">
                  #{tag.tag}
                  <span className="opacity-60">{tag.count}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className={EMPTY}>Nenhuma tag em projetos.</p>
          )}
        </Panel>
      </div>
    </section>
  );
}
