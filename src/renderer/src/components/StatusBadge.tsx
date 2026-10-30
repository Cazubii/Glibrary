import type { RepoStatus } from '@shared/types';

const STATUS_LABELS: Record<RepoStatus, string> = {
  not_cloned: 'Não clonado',
  cloning: 'Clonando…',
  cloned: 'Clonado',
  installing: 'Instalando…',
  installed: 'Instalado',
  running: 'Rodando',
  error: 'Com erro',
  missing: 'Pasta sumiu'
};

const STATUS_COLORS: Record<RepoStatus, string> = {
  not_cloned: 'bg-steam-elevated text-steam-text/80',
  cloning: 'bg-steam-accent/20 text-steam-accent',
  cloned: 'bg-steam-elevated text-steam-text',
  installing: 'bg-steam-accent/20 text-steam-accent',
  installed: 'bg-steam-green/20 text-steam-green',
  running: 'bg-steam-green text-white',
  error: 'bg-steam-error/20 text-steam-error',
  missing: 'bg-steam-warn/20 text-steam-warn'
};

export default function StatusBadge({ status }: { status: RepoStatus }): React.JSX.Element {
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_COLORS[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
