export type P3 = [number, number, number]

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: P3) => Math.hypot(a[0], a[1], a[2])
const addScaled = (p: P3, d: P3, t: number): P3 => [p[0] + d[0] * t, p[1] + d[1] * t, p[2] + d[2] * t]
const clamp = (n: number) => Math.max(0, Math.min(1, n))

export function closestPolylinePair(a: P3[], b: P3[]) {
  let best: { distance: number; a: P3; b: P3 } | null = null
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const p = a[i - 1], q = b[j - 1], u = sub(a[i], p), v = sub(b[j], q), w = sub(p, q)
    const A = dot(u, u), B = dot(u, v), C = dot(v, v), D = dot(u, w), E = dot(v, w), den = A * C - B * B
    if (A < 1e-12 || C < 1e-12) continue
    let s = den > 1e-12 ? clamp((B * E - C * D) / den) : 0
    let t = clamp((B * s + E) / C)
    s = clamp((B * t - D) / A)
    t = clamp((B * s + E) / C)
    const pa = addScaled(p, u, s), pb = addScaled(q, v, t), distance = len(sub(pb, pa))
    if (!best || distance < best.distance) best = { distance, a: pa, b: pb }
  }
  return best
}
