import { useMemo } from 'react';
import { CalendarRange, Code2, Star } from 'lucide-react';
import type { GithubOwnRepo, LabelCount } from '@shared/github-dashboard';
import { computeLanguageStats, computeReposPerYear, topStarredRepos } from '@shared/github-dashboard';
import { DonutChart, HBarChart } from '../charts';

/** Colunas verticais em CSS puro (repos criados por ano). */
function YearColumns({ items }: { items: LabelCount[] }): React.JSX.Element {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.every((i) => i.value === 0)) {
    return <div className="flex h-40 items-center justify-center rounded border border-dashed border-steam-elevated text-sm text-steam-text/40">Nenhum repositório criado no período.</div>;
  }
  return (
    <div className="flex h-40 items-end gap-2" role="img" aria-label="Repositórios criados por ano">
      {items.map((item) => (
        <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="text-xs tabular-nums text-steam-text/60">{item.value}</span>
          <div
            className="w-full max-w-10 rounded-t bg-steam-accent/80"
            style={{ height: `${Math.max((item.value / max) * 100, item.value > 0 ? 4 : 1)}%` }}
            title={`${item.label}: ${item.value}`}
          />
          <span className="text-[11px] tabular-nums text-steam-text/50">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ icon, title, children, footer }: { icon: React.ReactNode; title: string; children: React.ReactNode; footer?: string }): React.JSX.Element {
  return (
    <section className="min-w-0 rounded border border-steam-elevated bg-steam-panel p-5">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
      {footer != null && <p className="mt-3 text-xs text-steam-text/40">{footer}</p>}
    </section>
  );
}

/** Seção 2 — linguagens, criação por ano e repos mais estrelados. */
export default function GithubCharts({ repos }: { repos: GithubOwnRepo[] }): React.JSX.Element {
  const languages = useMemo(() => computeLanguageStats(repos), [repos]);
  const perYear = useMemo(() => computeReposPerYear(repos, new Date()), [repos]);
  const starred = useMemo(() => topStarredRepos(repos), [repos]);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card icon={<Code2 size={16} className="text-steam-accent" />} title="Linguagens" footer={`${repos.length} repositórios próprios analisados`}>
        <DonutChart items={languages} emptyText="Nenhum repositório encontrado." centerLabel="repos" ariaLabel="Linguagens dos repositórios" />
      </Card>
      <Card icon={<CalendarRange size={16} className="text-steam-accent" />} title="Repositórios criados por ano">
        <YearColumns items={perYear} />
      </Card>
      <Card icon={<Star size={16} className="text-steam-accent" />} title="Mais estrelados">
        <HBarChart
          items={starred.map((repo) => ({ label: repo.name, value: repo.stars }))}
          emptyText="Nenhum repositório com estrelas ainda."
        />
      </Card>
    </div>
  );
}
