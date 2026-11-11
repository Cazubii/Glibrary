interface HBarChartProps {
  items: { label: string; value: number; hint?: string }[];
  max?: number;
  emptyText: string;
}

/** Gráfico de barras horizontais em SVG puro (sem dependências). */
export function HBarChart({ items, max, emptyText }: HBarChartProps): React.JSX.Element {
  if (items.length === 0) {
    return <div className="flex h-40 items-center justify-center rounded border border-dashed border-steam-elevated text-sm text-steam-text/40">{emptyText}</div>;
  }
  const maxValue = Math.max(max ?? 0, ...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-3">
          <span className="w-40 shrink-0 truncate text-xs text-steam-text/70" title={item.label}>
            {item.label}
          </span>
          <div className="h-4 min-w-0 flex-1 overflow-hidden rounded bg-steam-elevated/60">
            <div
              className="h-full rounded bg-steam-accent/80"
              style={{ width: `${Math.max((item.value / maxValue) * 100, 2)}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-steam-text/60">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function polar(cx: number, cy: number, rOuter: number, rInner: number, startAngle: number, endAngle: number): string {
  const a0 = (startAngle - 90) * (Math.PI / 180);
  const a1 = (endAngle - 90) * (Math.PI / 180);
  const x0 = cx + rOuter * Math.cos(a0);
  const y0 = cy + rOuter * Math.sin(a0);
  const x1 = cx + rOuter * Math.cos(a1);
  const y1 = cy + rOuter * Math.sin(a1);
  const xi = cx + rInner * Math.cos(a1);
  const yi = cy + rInner * Math.sin(a1);
  const xj = cx + rInner * Math.cos(a0);
  const yj = cy + rInner * Math.sin(a0);
  const large = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1} ${y1} L ${xi} ${yi} A ${rInner} ${rInner} 0 ${large} 0 ${xj} ${yj} Z`;
}

/** Gráfico de rosca por categoria (usa o tema, sem bibliotecas externas). */
export function DonutChart({
  items,
  emptyText,
  centerLabel = 'usos',
  ariaLabel = 'Distribuição por categoria'
}: {
  items: { label: string; value: number }[];
  emptyText: string;
  centerLabel?: string;
  ariaLabel?: string;
}): React.JSX.Element {
  const filtered = items.filter((i) => i.value > 0);
  const total = filtered.reduce((sum, i) => sum + i.value, 0);
  const cx = 80;
  const cy = 80;
  const rOuter = 76;
  const rInner = 46;
  const colors = ['#c77dff', '#4cc9f0', '#7ae582', '#ffd166', '#ff8fa3', '#b197fc', '#90e0ef', '#a3c4f3', '#8f9aa8'];

  if (total === 0) {
    return <div className="flex h-40 items-center justify-center rounded border border-dashed border-steam-elevated text-sm text-steam-text/40">{emptyText}</div>;
  }

  let angle = 0;
  const slices = filtered.map((item, index) => {
    const sweep = (item.value / total) * 360;
    const path = polar(cx, cy, rOuter, rInner, angle, angle + sweep - (filtered.length > 1 ? 1 : 0));
    angle += sweep;
    return { ...item, path, color: colors[index % colors.length] };
  });

  return (
    <div className="flex items-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={ariaLabel}>
        {slices.map((slice) => (
          <path key={slice.label} d={slice.path} fill={slice.color} opacity={0.9} />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-current text-steam-text" fontSize="20" fontWeight="600">
          {total}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" className="fill-current text-steam-text/50" fontSize="10">
          {centerLabel}
        </text>
      </svg>
      <ul className="space-y-1.5 text-xs">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: slice.color }} />
            <span className="text-steam-text/70">{slice.label}</span>
            <span className="tabular-nums text-steam-text/40">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
