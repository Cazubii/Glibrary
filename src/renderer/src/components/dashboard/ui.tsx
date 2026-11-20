/** Blocos visuais do Dashboard: painel com cabeçalho e cartão de indicador. */

export function Panel({
  title,
  icon,
  action,
  footer,
  className = '',
  children
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className={`min-w-0 rounded-xl border border-steam-elevated bg-steam-panel p-5 shadow-[inset_0_1px_0_hsl(var(--steam-text)/0.05)] ${className}`}>
      <header className="mb-4 flex items-center gap-2">
        {icon != null && <span className="text-steam-text/50">{icon}</span>}
        <h2 className="text-sm font-medium">{title}</h2>
        {action != null && <div className="ml-auto flex items-center gap-1 text-xs">{action}</div>}
      </header>
      {children}
      {footer != null && <p className="mt-4 text-xs text-steam-text/40">{footer}</p>}
    </section>
  );
}

export type BadgeTone = 'good' | 'bad' | 'neutral';

const BADGE: Record<BadgeTone, string> = {
  good: 'border-steam-accent/25 bg-steam-accent/10 text-steam-accent',
  bad: 'border-steam-error/25 bg-steam-error/10 text-steam-error',
  neutral: 'border-steam-elevated bg-steam-bg/60 text-steam-text/55'
};

export function KpiCard({
  icon,
  label,
  value,
  caption,
  badge
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  caption: string;
  badge?: { text: string; tone: BadgeTone };
}): React.JSX.Element {
  return (
    <div className="min-w-0 rounded-xl border border-steam-elevated bg-steam-panel p-4 shadow-[inset_0_1px_0_hsl(var(--steam-text)/0.05)]">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-steam-elevated bg-steam-bg/60 text-steam-text/60">{icon}</span>
        <p className="truncate text-sm text-steam-text/80">{label}</p>
      </div>
      <p className="mt-4 text-2xl font-semibold tabular-nums tracking-tight">{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="truncate text-xs text-steam-text/40">{caption}</span>
        {badge != null && (
          <span className={`ml-auto shrink-0 rounded-full border px-1.5 text-[10px] font-medium leading-4 ${BADGE[badge.tone]}`}>{badge.text}</span>
        )}
      </div>
    </div>
  );
}
