/** Gráficos em SVG/CSS puro, sem dependências, usando os tokens do tema. */

const EMPTY = 'flex h-40 items-center justify-center rounded-lg border border-dashed border-steam-elevated text-sm text-steam-text/40';

/** Paleta das séries: verde, amarelo, laranja e vermelho primeiro, como a referência visual. */
export const CHART_COLORS = ['#45d483', '#f5c542', '#fb923c', '#fc5455', '#2dd4bf', '#a3e635', '#60a5fa', '#c084fc', '#94a3b8'];

export type Tone = 'good' | 'warn' | 'bad';

export const TONE_COLOR: Record<Tone, string> = {
  good: 'hsl(var(--steam-accent))',
  warn: 'hsl(var(--steam-warn))',
  bad: 'hsl(var(--steam-error))'
};

/** verde ≥ 66% · amarelo ≥ 33% · vermelho abaixo disso. */
export function toneFor(percent: number): Tone {
  if (percent >= 66) return 'good';
  if (percent >= 33) return 'warn';
  return 'bad';
}

interface HBarChartProps {
  items: { label: string; value: number; hint?: string }[];
  max?: number;
  emptyText: string;
}

/** Barras horizontais com trilho escuro, preenchimento em degradê e valor em pílula. */
export function HBarChart({ items, max, emptyText }: HBarChartProps): React.JSX.Element {
  if (items.length === 0) {
    return <div className={EMPTY}>{emptyText}</div>;
  }
  const maxValue = Math.max(max ?? 0, ...items.map((i) => i.value), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const width = Math.max((item.value / maxValue) * 100, 3);
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs text-steam-text/60" title={item.hint != null ? `${item.label} · ${item.hint}` : item.label}>
              {item.label}
            </span>
            <div className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-md bg-steam-elevated/50">
              <div
                className="h-full rounded-md"
                style={{
                  width: `${width}%`,
                  background: 'linear-gradient(90deg, hsl(var(--steam-accent) / 0.08), hsl(var(--steam-accent) / 0.55))',
                  boxShadow: 'inset -2px 0 0 hsl(var(--steam-accent))'
                }}
              />
              <span
                className="absolute top-1/2 -translate-y-1/2 rounded-full border border-steam-accent/40 bg-steam-bg/80 px-1.5 text-[10px] font-medium tabular-nums leading-4 text-steam-accent"
                style={width > 18 ? { right: `calc(${100 - width}% + 6px)` } : { left: `calc(${width}% + 6px)` }}
              >
                {item.value}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function arcPoint(cx: number, cy: number, r: number, angle: number): [number, number] {
  const a = (angle - 90) * (Math.PI / 180);
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

/** Arco aberto (para traço) entre dois ângulos, 0° no topo e sentido horário. */
function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const [x0, y0] = arcPoint(cx, cy, r, start);
  const [x1, y1] = arcPoint(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/** Rosca fina por categoria, com total no centro e legenda em pontos. */
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
  const c = 80;
  const r = 66;

  if (total === 0) {
    return <div className={EMPTY}>{emptyText}</div>;
  }

  const gap = filtered.length > 1 ? 2.5 : 0;
  let angle = 0;
  const slices = filtered.map((item, index) => {
    const sweep = (item.value / total) * 360;
    const end = sweep >= 360 ? 359.99 : angle + sweep - gap;
    const path = arcPath(c, c, r, angle, Math.max(end, angle + 0.5));
    angle += sweep;
    return { ...item, path, color: CHART_COLORS[index % CHART_COLORS.length] };
  });

  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label={ariaLabel} className="shrink-0">
        <circle cx={c} cy={c} r={r} fill="none" stroke="hsl(var(--steam-elevated) / 0.5)" strokeWidth="10" />
        <circle cx={c} cy={c} r={r - 14} fill="none" stroke="hsl(var(--steam-elevated) / 0.6)" strokeWidth="1" strokeDasharray="2 3" />
        {slices.map((slice) => (
          <path key={slice.label} d={slice.path} fill="none" stroke={slice.color} strokeWidth="10" />
        ))}
        <text x={c} y={c - 2} textAnchor="middle" className="fill-current text-steam-text" fontSize="24" fontWeight="600">
          {total}
        </text>
        <text x={c} y={c + 16} textAnchor="middle" className="fill-current text-steam-text/45" fontSize="10">
          {centerLabel}
        </text>
      </svg>
      <ul className="flex min-w-[9rem] flex-1 flex-col gap-1.5 text-xs">
        {slices.map((slice) => (
          <li key={slice.label} className="flex min-w-0 items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: slice.color }} />
            <span className="truncate text-steam-text/65">{slice.label}</span>
            <span className="ml-auto tabular-nums text-steam-text/40">{Math.round((slice.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Medidor semicircular com ponteiro, para uma proporção de 0 a 100%. */
export function Gauge({ percent, label, tone }: { percent: number; label: string; tone?: Tone }): React.JSX.Element {
  const value = Math.min(100, Math.max(0, percent));
  const color = TONE_COLOR[tone ?? toneFor(value)];
  const cx = 110;
  const cy = 104;
  const r = 82;
  const start = -90;
  const end = start + (value / 100) * 180;
  const [nx, ny] = arcPoint(cx, cy, r - 6, end);
  const [kx, ky] = arcPoint(cx, cy, r, end);
  return (
    <div className="flex flex-col items-center">
      <svg width="220" height="128" viewBox="0 0 220 128" role="img" aria-label={`${label}: ${Math.round(value)}%`}>
        <defs>
          <filter id="gauge-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <linearGradient id="gauge-fill" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor={color} stopOpacity="0.15" />
            <stop offset="1" stopColor={color} stopOpacity="0.9" />
          </linearGradient>
        </defs>
        <path d={arcPath(cx, cy, r, -90, 90)} fill="none" stroke="hsl(var(--steam-elevated) / 0.55)" strokeWidth="26" />
        {value > 0 && <path d={arcPath(cx, cy, r, start, Math.max(end, start + 0.5))} fill="none" stroke={color} strokeOpacity="0.35" strokeWidth="22" filter="url(#gauge-glow)" />}
        {value > 0 && <path d={arcPath(cx, cy, r, start, Math.max(end, start + 0.5))} fill="none" stroke="url(#gauge-fill)" strokeWidth="26" />}
        <path d={arcPath(cx, cy, r - 21, -90, 90)} fill="none" stroke="hsl(var(--steam-elevated) / 0.8)" strokeWidth="1" strokeDasharray="2 4" />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="hsl(var(--steam-text))" strokeWidth="3" strokeLinecap="round" />
        <circle cx={kx} cy={ky} r="5" fill="hsl(var(--steam-text))" stroke={color} strokeWidth="2" />
        <circle cx={cx} cy={cy} r="11" fill={color} fillOpacity="0.25" />
        <circle cx={cx} cy={cy} r="8" fill={color} />
        <circle cx={cx} cy={cy} r="3.5" fill="hsl(var(--steam-panel))" />
      </svg>
      <p className="-mt-1 text-sm font-semibold tabular-nums">{Math.round(value)}%</p>
    </div>
  );
}

/** Anel segmentado com porcentagem no centro e rótulo abaixo. */
export function RingMeter({ percent, caption, detail, tone }: { percent: number; caption: string; detail: string; tone?: Tone }): React.JSX.Element {
  const value = Math.min(100, Math.max(0, percent));
  const color = TONE_COLOR[tone ?? toneFor(value)];
  const c = 44;
  const r = 36;
  const end = (value / 100) * 360 - 0.01;
  return (
    <figure className="flex min-w-0 flex-col items-center gap-2">
      <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${caption}: ${Math.round(value)}%`}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="hsl(var(--steam-elevated) / 0.7)" strokeWidth="8" strokeDasharray="2 2.2" />
        {value > 0 && <path d={arcPath(c, c, r, 0, Math.max(end, 0.5))} fill="none" stroke={color} strokeWidth="8" strokeDasharray="2 2.2" />}
        <circle cx={c} cy={c} r={r - 9} fill="hsl(var(--steam-bg) / 0.6)" stroke="hsl(var(--steam-elevated) / 0.6)" />
        <text x={c} y={c + 1} textAnchor="middle" className="fill-current text-steam-text" fontSize="17" fontWeight="600">
          {Math.round(value)}
        </text>
        <text x={c} y={c + 14} textAnchor="middle" className="fill-current text-steam-text/45" fontSize="8">
          {detail}
        </text>
      </svg>
      <figcaption className="text-center text-xs text-steam-text/70">{caption}</figcaption>
    </figure>
  );
}

/** Colunas verticais em pílula, com trilho na altura total. */
export function ColumnChart({ items, emptyText, ariaLabel }: { items: { label: string; value: number }[]; emptyText: string; ariaLabel: string }): React.JSX.Element {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.every((i) => i.value === 0)) {
    return <div className={EMPTY}>{emptyText}</div>;
  }
  return (
    <div className="flex h-44 items-end gap-3" role="img" aria-label={ariaLabel}>
      {items.map((item) => (
        <div key={item.label} className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5" title={`${item.label}: ${item.value}`}>
          <span className="text-[11px] tabular-nums text-steam-text/55">{item.value}</span>
          <div className="relative w-full max-w-7 flex-1 overflow-hidden rounded-md bg-steam-elevated/45">
            <div
              className="absolute inset-x-0 bottom-0 rounded-md bg-steam-accent/85"
              style={{ height: `${Math.max((item.value / max) * 100, item.value > 0 ? 6 : 0)}%` }}
            />
          </div>
          <span className="text-[11px] tabular-nums text-steam-text/45">{item.label}</span>
        </div>
      ))}
    </div>
  );
}
