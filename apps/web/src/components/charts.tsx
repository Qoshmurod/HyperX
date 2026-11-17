/** Server tomonida chiziladigan SVG grafiklar — tashqi kutubxonasiz, yorug'/qorong'i rejimga mos. */

const COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];

export interface Series {
  label: string;
  values: (number | null)[];
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted">
      {series.map((s, i) => (
        <span key={s.label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function BarChart({ labels, series, height = 220 }: { labels: string[]; series: Series[]; height?: number }) {
  const W = 640;
  const H = height;
  // Kam ustun bo'lsa yorliqlar gorizontal, ko'p bo'lsa qiya va chap tomonda joy qoldiriladi.
  const rotate = labels.length > 6;
  const pad = { l: rotate ? 72 : 36, r: 8, t: 8, b: rotate ? 64 : 28 };
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values.map((v) => v ?? 0))));
  const groupW = (W - pad.l - pad.r) / Math.max(1, labels.length);
  const barW = Math.max(3, Math.min(28, (groupW - 6) / series.length));
  const maxChars = Math.max(6, Math.floor(groupW / 6.2));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.label).join(', ')}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" />
            <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {labels.map((label, gi) => {
          const x0 = pad.l + gi * groupW + (groupW - barW * series.length) / 2;
          return (
            <g key={label + gi}>
              {series.map((s, si) => {
                const v = s.values[gi] ?? 0;
                return (
                  <rect key={s.label} x={x0 + si * barW} y={y(v)} width={barW - 1} height={Math.max(0, y(0) - y(v))} rx="2" fill={COLORS[si % COLORS.length]}>
                    <title>{`${label} — ${s.label}: ${v}`}</title>
                  </rect>
                );
              })}
              {rotate ? (
                <text x={pad.l + gi * groupW + groupW / 2} y={H - pad.b + 12} fontSize="10" fill="var(--muted)" textAnchor="end" transform={`rotate(-35 ${pad.l + gi * groupW + groupW / 2} ${H - pad.b + 12})`}>
                  {label.length > 18 ? `${label.slice(0, 17)}…` : label}
                </text>
              ) : (
                <text x={pad.l + gi * groupW + groupW / 2} y={H - pad.b + 16} fontSize="11" fill="var(--muted)" textAnchor="middle">
                  {label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
    </figure>
  );
}

export function LineChart({
  labels,
  series,
  band,
  height = 220,
  splitAt,
}: {
  labels: string[];
  series: Series[];
  band?: { lower: (number | null)[]; upper: (number | null)[] };
  height?: number;
  splitAt?: number;
}) {
  const W = 640;
  const H = height;
  const pad = { l: 40, r: 8, t: 8, b: 28 };
  const all = [...series.flatMap((s) => s.values), ...(band?.upper ?? []), ...(band?.lower ?? [])].filter((v): v is number => v !== null);
  const min = Math.min(0, ...all);
  const max = niceMax(Math.max(1, ...all));
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / Math.max(1, labels.length - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / (max - min || 1));
  const path = (vals: (number | null)[]): string =>
    vals
      .map((v, i) => (v === null ? null : `${x(i)},${y(v)}`))
      .filter((pt): pt is string => pt !== null)
      .reduce((acc, pt, i) => `${acc}${i ? 'L' : 'M'}${pt}`, '');
  const step = Math.ceil(labels.length / 8);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={series.map((s) => s.label).join(', ')}>
        {[0, 0.5, 1].map((f) => {
          const v = min + (max - min) * f;
          return (
            <g key={f}>
              <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        {band && (
          <path
            d={`${path(band.upper)}${band.lower
              .map((v, i) => ({ v, i }))
              .filter((p) => p.v !== null)
              .reverse()
              .map((p) => `L${x(p.i)},${y(p.v as number)}`)
              .join('')}Z`}
            fill="var(--chart-1)"
            opacity="0.15"
          />
        )}
        {splitAt !== undefined && <line x1={x(splitAt)} x2={x(splitAt)} y1={pad.t} y2={H - pad.b} stroke="var(--muted)" strokeDasharray="3 3" />}
        {series.map((s, si) => (
          <path key={s.label} d={path(s.values)} fill="none" stroke={COLORS[si % COLORS.length]} strokeWidth="2" strokeDasharray={si === 1 && band ? '5 4' : undefined} />
        ))}
        {labels.map((l, i) =>
          i % step === 0 ? (
            <text key={l + i} x={x(i)} y={H - 8} fontSize="10" fill="var(--muted)" textAnchor="middle">
              {l}
            </text>
          ) : null,
        )}
      </svg>
      <Legend series={series} />
    </figure>
  );
}
