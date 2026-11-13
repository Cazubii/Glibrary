import type { DevSession } from '../../../shared/types';

interface Props {
  session?: DevSession | null;
}

/** Indicador compacto do workspace ativo, reaproveitado em listas e no Dashboard. */
export default function DevSessionBadge({ session }: Props): React.JSX.Element | null {
  if (session == null) return null;

  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-steam-green/35 bg-steam-green/10 px-2 py-0.5 text-[11px] font-medium text-steam-green"
      role="status"
      title={`Sendo editado na branch ${session.branch}`}
      aria-label={`Sendo editado na branch ${session.branch}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-steam-green motion-reduce:animate-none" aria-hidden="true" />
      <span className="shrink-0">Sendo editado</span>
      <code className="max-w-32 truncate border-l border-steam-green/30 pl-1.5 font-normal">{session.branch}</code>
    </span>
  );
}
