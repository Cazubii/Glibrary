import { ArrowUpRight, Clock3, GitBranch, GitFork, Globe2, LockKeyhole, Star } from 'lucide-react';
import type { ProjectRepoSummary } from '../../../../shared/github-projects';
import type { Repo } from '../../../../shared/types';
import type { ProjectCloneState } from '../../store/projects';

interface Props {
  project: ProjectRepoSummary;
  libraryRepo?: Repo;
  clone?: ProjectCloneState;
  onClone: () => void;
  onOpen: () => void;
  onWork: () => void;
}

function formatUpdatedAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Sem data de atualização';
  const deltaSeconds = (timestamp - Date.now()) / 1000;
  const absoluteSeconds = Math.abs(deltaSeconds);
  const units: Array<{ limit: number; seconds: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { limit: 60, seconds: 1, unit: 'second' },
    { limit: 3600, seconds: 60, unit: 'minute' },
    { limit: 86400, seconds: 3600, unit: 'hour' },
    { limit: 2_592_000, seconds: 86400, unit: 'day' },
    { limit: 31_536_000, seconds: 2_592_000, unit: 'month' },
    { limit: Infinity, seconds: 31_536_000, unit: 'year' }
  ];
  const selected = units.find((item) => absoluteSeconds < item.limit) ?? units[units.length - 1];
  const amount = Math.round(deltaSeconds / selected.seconds);
  return `Atualizado ${new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' }).format(amount, selected.unit)}`;
}

const compactNumber = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });

export default function ProjectRepoRow({ project, libraryRepo, clone, onClone, onOpen, onWork }: Props): React.JSX.Element {
  const cloned = libraryRepo?.localPath != null && libraryRepo.status !== 'missing';
  const cloning = clone?.status === 'cloning' || libraryRepo?.status === 'cloning';
  const cloneError = clone?.error ?? (libraryRepo?.status === 'error' ? libraryRepo.lastError : undefined);

  return (
    <li className="flex flex-col gap-3 border-b border-steam-elevated/60 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h2 className="min-w-0 truncate text-sm font-semibold text-steam-text">
            <a
              href={project.htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-sm hover:text-steam-accent hover:underline hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
              title={project.fullName}
            >
              {project.name}
            </a>
          </h2>
          <span className="inline-flex items-center gap-1 rounded-full border border-steam-elevated px-2 py-0.5 text-[11px] text-steam-text/80">
            {project.visibility === 'private' ? <LockKeyhole size={11} aria-hidden="true" /> : <Globe2 size={11} aria-hidden="true" />}
            {project.visibility === 'private' ? 'Privado' : 'Público'}
          </span>
          {project.isFork && (
            <span className="inline-flex items-center gap-1 rounded-full border border-steam-elevated px-2 py-0.5 text-[11px] text-steam-text/70">
              <GitFork size={11} aria-hidden="true" /> Fork
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 max-w-3xl text-xs leading-5 text-steam-text/75">
          {project.description ?? 'Sem descrição.'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-steam-text/75">
          {project.language != null && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-steam-accent" aria-hidden="true" />
              {project.language}
            </span>
          )}
          <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`${project.stars} estrelas`}>
            <Star size={12} className="text-steam-warn" aria-hidden="true" />
            {compactNumber.format(project.stars)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock3 size={12} aria-hidden="true" />
            {formatUpdatedAt(project.updatedAt)}
          </span>
        </div>
        {cloning && (
          <div className="mt-3 max-w-xl" role="status" aria-live="polite">
            <div className="mb-1 flex items-center justify-between gap-3 text-[11px] text-steam-text/75">
              <span className="truncate">{clone?.stage ?? 'Preparando clone…'}</span>
              {clone?.percent != null && <span className="shrink-0 tabular-nums">{clone.percent}%</span>}
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-steam-elevated"
              role="progressbar"
              aria-label={`Clonando ${project.name}`}
              aria-valuemin={0}
              aria-valuemax={100}
              {...(clone?.percent != null ? { 'aria-valuenow': clone.percent } : {})}
            >
              <div
                className={`h-full rounded-full bg-steam-accent transition-[width] duration-200 motion-reduce:transition-none ${clone?.percent == null ? 'w-1/3 animate-pulse motion-reduce:animate-none' : ''}`}
                style={clone?.percent != null ? { width: `${clone.percent}%` } : undefined}
              />
            </div>
          </div>
        )}
        {cloneError != null && !cloning && (
          <p className="mt-2 text-xs text-steam-error" role="status">{cloneError}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {cloned ? (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-9 items-center gap-1.5 rounded border border-steam-elevated px-3 text-xs font-medium text-steam-text/90 transition-colors duration-150 hover:bg-steam-elevated hover:text-steam-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent disabled:opacity-50"
          >
            <ArrowUpRight size={13} aria-hidden="true" /> Abrir
          </button>
        ) : (
          <button
            type="button"
            onClick={onClone}
            disabled={cloning}
            className="inline-flex min-h-9 items-center gap-1.5 rounded bg-steam-accent px-3 text-xs font-semibold text-steam-bg transition-colors duration-150 hover:bg-steam-accent/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent focus-visible:ring-offset-2 focus-visible:ring-offset-steam-bg disabled:cursor-wait disabled:opacity-60"
          >
            <GitBranch size={13} aria-hidden="true" />
            {cloning ? 'Clonando…' : 'Clonar para o PC'}
          </button>
        )}
        <button
          type="button"
          onClick={onWork}
          className="inline-flex min-h-9 items-center gap-1.5 rounded border border-steam-elevated px-3 text-xs font-medium text-steam-text/90 transition-colors duration-150 hover:bg-steam-elevated hover:text-steam-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-steam-accent"
        >
          <GitBranch size={13} aria-hidden="true" /> Trabalhar via branch
        </button>
      </div>
    </li>
  );
}
