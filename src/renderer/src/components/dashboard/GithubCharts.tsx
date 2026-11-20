import { useMemo } from 'react';
import { CalendarRange, Code2, Star } from 'lucide-react';
import type { GithubOwnRepo } from '@shared/github-dashboard';
import { computeLanguageStats, computeReposPerYear, topStarredRepos } from '@shared/github-dashboard';
import { ColumnChart, DonutChart, HBarChart } from '../charts';
import { Panel } from './ui';

/** Seção 2 — linguagens, criação por ano e repos mais estrelados. */
export default function GithubCharts({ repos }: { repos: GithubOwnRepo[] }): React.JSX.Element {
  const languages = useMemo(() => computeLanguageStats(repos), [repos]);
  const perYear = useMemo(() => computeReposPerYear(repos, new Date()), [repos]);
  const starred = useMemo(() => topStarredRepos(repos), [repos]);
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Panel icon={<Code2 size={15} />} title="Linguagens" footer={`${repos.length} repositórios próprios analisados`}>
        <DonutChart items={languages} emptyText="Nenhum repositório encontrado." centerLabel="repos" ariaLabel="Linguagens dos repositórios" />
      </Panel>
      <Panel icon={<CalendarRange size={15} />} title="Repositórios criados por ano">
        <ColumnChart items={perYear} emptyText="Nenhum repositório criado no período." ariaLabel="Repositórios criados por ano" />
      </Panel>
      <Panel icon={<Star size={15} />} title="Mais estrelados">
        <HBarChart
          items={starred.map((repo) => ({ label: repo.name, value: repo.stars }))}
          emptyText="Nenhum repositório com estrelas ainda."
        />
      </Panel>
    </div>
  );
}
