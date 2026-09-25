// Aero Design Lab — plain-SVG charts (no chart deps): Pareto scatter + convergence line.
const W = 420, H = 190, PL = 46, PR = 10, PT = 10, PB = 30

function ticks(lo: number, hi: number, n = 4): number[] {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / n, mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(v)
  return out
}
const fmt = (v: number) => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : Number(v.toPrecision(3)).toString())

function range(vals: number[]): [number, number] {
  const f = vals.filter(Number.isFinite)
  if (!f.length) return [0, 1]
  let lo = Math.min(...f), hi = Math.max(...f)
  if (hi - lo < 1e-12) { lo -= Math.abs(lo) * 0.05 + 1e-6; hi += Math.abs(hi) * 0.05 + 1e-6 }
  const pad = (hi - lo) * 0.06
  return [lo - pad, hi + pad]
}

function Axes({ xr, yr, xl, yl }: { xr: [number, number]; yr: [number, number]; xl: string; yl: string }) {
  const sx = (v: number) => PL + (v - xr[0]) / (xr[1] - xr[0]) * (W - PL - PR)
  const sy = (v: number) => H - PB - (v - yr[0]) / (yr[1] - yr[0]) * (H - PT - PB)
  return (
    <g fontSize={9} fill="var(--text-dim)">
      <rect x={PL} y={PT} width={W - PL - PR} height={H - PT - PB} fill="none" stroke="var(--border)" />
      {ticks(xr[0], xr[1]).map((t) => <g key={'x' + t}><line x1={sx(t)} x2={sx(t)} y1={H - PB} y2={H - PB + 3} stroke="var(--border)" /><text x={sx(t)} y={H - PB + 12} textAnchor="middle">{fmt(t)}</text></g>)}
      {ticks(yr[0], yr[1]).map((t) => <g key={'y' + t}><line x1={PL - 3} x2={PL} y1={sy(t)} y2={sy(t)} stroke="var(--border)" /><text x={PL - 5} y={sy(t) + 3} textAnchor="end">{fmt(t)}</text></g>)}
      <text x={(PL + W - PR) / 2} y={H - 3} textAnchor="middle" fill="var(--text)">{xl}</text>
      <text x={10} y={(PT + H - PB) / 2} textAnchor="middle" fill="var(--text)" transform={`rotate(-90 10 ${(PT + H - PB) / 2})`}>{yl}</text>
    </g>
  )
}

export function ParetoChart({ cloud, front, xl, yl, highlight }: { cloud: number[][]; front: number[][]; xl: string; yl: string; highlight?: number[] | null }) {
  const all = cloud.concat(front)
  const xr = range(all.map((p) => p[0])), yr = range(all.map((p) => p[1]))
  const sx = (v: number) => PL + (v - xr[0]) / (xr[1] - xr[0]) * (W - PL - PR)
  const sy = (v: number) => H - PB - (v - yr[0]) / (yr[1] - yr[0]) * (H - PT - PB)
  const fr = front.slice().sort((a, b) => a[0] - b[0])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="pareto" style={{ display: 'block', maxWidth: W }}>
      <Axes xr={xr} yr={yr} xl={xl} yl={yl} />
      {cloud.map((p, i) => <circle key={'c' + i} cx={sx(p[0])} cy={sy(p[1])} r={2} fill="var(--text-dim)" opacity={0.35} />)}
      {fr.length > 1 && <polyline points={fr.map((p) => `${sx(p[0])},${sy(p[1])}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={1.2} opacity={0.6} />}
      {fr.map((p, i) => <circle key={'f' + i} cx={sx(p[0])} cy={sy(p[1])} r={3} fill="var(--accent)" />)}
      {highlight && <circle cx={sx(highlight[0])} cy={sy(highlight[1])} r={6} fill="none" stroke="#e8590c" strokeWidth={2} />}
    </svg>
  )
}

export function ConvergenceChart({ history, yl, xl }: { history: { evals: number; best: number[] }[]; yl: string; xl: string }) {
  const pts = history.filter((h) => Number.isFinite(h.best[0]))
  if (pts.length < 2) return <div style={{ fontSize: 11, color: 'var(--text-dim)', padding: 8 }}>…</div>
  const xr = range(pts.map((p) => p.evals)), yr = range(pts.map((p) => p.best[0]))
  const sx = (v: number) => PL + (v - xr[0]) / (xr[1] - xr[0]) * (W - PL - PR)
  const sy = (v: number) => H - PB - (v - yr[0]) / (yr[1] - yr[0]) * (H - PT - PB)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="convergence" style={{ display: 'block', maxWidth: W }}>
      <Axes xr={xr} yr={yr} xl={xl} yl={yl} />
      <polyline points={pts.map((p) => `${sx(p.evals)},${sy(p.best[0])}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth={1.6} />
    </svg>
  )
}
