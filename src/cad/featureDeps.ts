/**
 * Timeline dependency graph (T1 delete warning / T2 reorder validity).
 *
 * A feature B depends on an earlier feature A when
 *   · B references A's id anywhere in its own data (sketchFaceBinding.sourceId, toFace/target ids,
 *     feature-pattern targets, …) — scanned generically so new feature kinds are covered; or
 *   · A is a standalone sketch node (type 'sketch') and B consumes the same sketch
 *     (sketchId / loft sketchIds).
 * Body-level dependencies (a shell/fillet that only works on A's solid) are not visible statically;
 * the store discovers those from the rebuild failure list and asks the user (see requestRemoveFeature).
 */
type F = { id: string; type: string; sketchId?: string; sketchIds?: string[] } & Record<string, unknown>

function collectStrings(v: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || v == null) return
  if (typeof v === 'string') { out.add(v); return }
  if (Array.isArray(v)) { for (const x of v) collectStrings(x, out, depth + 1); return }
  if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) if (k !== 'id' && k !== 'name') collectStrings(x, out, depth + 1)
}

const sketchesOf = (f: F): string[] => [...(f.sketchId ? [f.sketchId] : []), ...(Array.isArray(f.sketchIds) ? f.sketchIds : [])]

/** Ids of other features that `f` needs to exist (anywhere in the list). */
export function featureRefs(f: F, all: readonly F[]): Set<string> {
  const strings = new Set<string>()
  collectStrings(f, strings)
  const refs = new Set<string>()
  for (const g of all) {
    if (g.id === f.id) continue
    if (strings.has(g.id)) refs.add(g.id)
    else if (g.type === 'sketch' && f.type !== 'sketch' && g.sketchId && sketchesOf(f).includes(g.sketchId)) refs.add(g.id)
  }
  return refs
}

/** Features (in timeline order) that depend on `id`, directly or transitively. */
export function featureDependents(features: readonly F[], id: string): F[] {
  const doomed = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of features) {
      if (doomed.has(f.id)) continue
      for (const r of featureRefs(f, features)) if (doomed.has(r)) { doomed.add(f.id); grew = true; break }
    }
  }
  return features.filter((f) => f.id !== id && doomed.has(f.id))
}

/** Move `id` to index `to` (array index in the result). null when out of range / no-op. */
export function reorderedFeatures<T extends F>(features: readonly T[], id: string, to: number): T[] | null {
  const from = features.findIndex((f) => f.id === id)
  if (from < 0 || to < 0 || to >= features.length || to === from) return null
  const next = features.slice()
  const [m] = next.splice(from, 1)
  next.splice(to, 0, m)
  return next
}

/** First ordering violation (a feature placed before something it references), or null if valid. */
export function orderViolation(features: readonly F[]): { feature: F; needs: F } | null {
  const pos = new Map(features.map((f, i) => [f.id, i]))
  for (let i = 0; i < features.length; i++) {
    for (const r of featureRefs(features[i], features)) {
      const j = pos.get(r)
      if (j != null && j > i) return { feature: features[i], needs: features[j] }
    }
  }
  return null
}

// ── RETEST19 #1：拓撲引用（邊／面）依賴 ─────────────────────────────────────────────────────────────
// fillet/chamfer/shell/draft/按拉/面編輯 等特徵唔係引用特徵 id，而係引用【前面幾何】嘅邊／面（近點 nears + 持久指紋）。
// 靜態 id 掃描睇唔到 → 上移到產生嗰條邊嘅拉伸之前，內核搵唔到邊就靜默跳過（圓角「消失」冇警告）。
// 做法：移動後，凡係「前置特徵集合」少咗嘢嘅拓撲特徵，用【新順序嘅前綴】試建（唔落 store、唔改 worker 狀態），
// 檢查拾取點仲喺幾何上：邊類（圓角／倒角）要貼住 ≥2 個面（真係一條棱），面類要貼住實體表面；冇拾取點就至少要有實體。
type P3 = [number, number, number]
const EDGE_TYPES = new Set(['fillet', 'chamfer'])
const TOPO_TYPES = new Set(['fillet', 'chamfer', 'shell', 'draft', 'pushpull', 'delface', 'splitface', 'replaceface', 'moveface', 'offsetsurf', 'rotateface'])
const PICK_KEYS = ['near', 'nears', 'sideNears', 'refFaceNear'] as const

const isP3 = (v: unknown): v is P3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x))

export function isTopoRefFeature(f: F): boolean {
  if (TOPO_TYPES.has(f.type)) return true
  return f.type === 'extrude' && !!(f as { toFace?: unknown }).toFace   // 拉伸「到面」亦引用前面嘅面
}

/** 特徵嘅拾取點（CAD 座標）+ 係咪邊引用。 */
export function topoPicks(f: F): { pts: P3[]; edge: boolean } {
  const pts: P3[] = []
  const src = f.type === 'extrude' ? ((f as { toFace?: Record<string, unknown> }).toFace ?? {}) : (f as Record<string, unknown>)
  for (const k of PICK_KEYS) {
    const v = src[k]
    if (isP3(v)) pts.push(v)
    else if (Array.isArray(v)) for (const p of v) if (isP3(p)) pts.push(p)
  }
  return { pts, edge: EDGE_TYPES.has(f.type) }
}

/** 移動後要驗證嘅拓撲特徵：佢前面嘅特徵集合少咗（有特徵由佢前面搬到佢後面）。 */
export function topoFeaturesToCheck<T extends F>(before: readonly T[], after: readonly T[]): { feature: T; lost: T[] }[] {
  const out: { feature: T; lost: T[] }[] = []
  const posB = new Map(before.map((f, i) => [f.id, i]))
  const posA = new Map(after.map((f, i) => [f.id, i]))
  for (const f of after) {
    if (!isTopoRefFeature(f)) continue
    const ib = posB.get(f.id), ia = posA.get(f.id)!
    if (ib == null) continue
    const lost = before.slice(0, ib).filter((g) => (posA.get(g.id) ?? -1) > ia && g.type !== 'sketch' && g.type !== 'datum')
    if (lost.length) out.push({ feature: f, lost })
  }
  return out
}

function closestOnTri(p: P3, a: P3, b: P3, c: P3): number {
  // Ericson, Real-Time Collision Detection 5.1.5 — 返回距離平方
  const sub = (u: P3, v: P3): P3 => [u[0] - v[0], u[1] - v[1], u[2] - v[2]]
  const dot = (u: P3, v: P3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a)
  const d1 = dot(ab, ap), d2 = dot(ac, ap)
  const d2s = (q: P3) => { const d = sub(p, q); return dot(d, d) }
  const at = (u: number, v: number): P3 => [a[0] + ab[0] * u + ac[0] * v, a[1] + ab[1] * u + ac[1] * v, a[2] + ab[2] * u + ac[2] * v]
  if (d1 <= 0 && d2 <= 0) return d2s(a)
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp)
  if (d3 >= 0 && d4 <= d3) return d2s(b)
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return d2s(at(d1 / (d1 - d3), 0))
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp)
  if (d6 >= 0 && d5 <= d6) return d2s(c)
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return d2s(at(0, d2 / (d2 - d6)))
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return d2s([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]) }
  const den = 1 / (va + vb + vc)
  return d2s(at(vb * den, vc * den))
}

type MeshLike = { vertices: ArrayLike<number>; triangles: ArrayLike<number>; faceGroups?: { start: number; count: number; faceId: number }[] }

/** 拾取點附近（≤tol）有幾多個唔同嘅 B-rep 面（冇 faceGroups → 有貼面就當 1）。 */
export function pickFaceSupport(p: P3, m: MeshLike, tol: number): number {
  const V = m.vertices, T = m.triangles, t2 = tol * tol
  const v = (i: number): P3 => [V[i * 3], V[i * 3 + 1], V[i * 3 + 2]]
  const faceOf = (tri: number): number => {
    const fg = m.faceGroups
    if (!fg) return 0
    for (const g of fg) if (tri * 3 >= g.start && tri * 3 < g.start + g.count) return g.faceId
    return -1
  }
  const faces = new Set<number>()
  for (let t = 0; t + 2 < T.length; t += 3) {
    const a = v(T[t]), b = v(T[t + 1]), c = v(T[t + 2])
    // 快速 AABB 剔除
    if (p[0] < Math.min(a[0], b[0], c[0]) - tol || p[0] > Math.max(a[0], b[0], c[0]) + tol) continue
    if (p[1] < Math.min(a[1], b[1], c[1]) - tol || p[1] > Math.max(a[1], b[1], c[1]) + tol) continue
    if (p[2] < Math.min(a[2], b[2], c[2]) - tol || p[2] > Math.max(a[2], b[2], c[2]) + tol) continue
    if (closestOnTri(p, a, b, c) <= t2) faces.add(faceOf(t / 3))
  }
  return faces.size
}

/** 拓撲特徵喺呢個前綴實體上仲搵唔搵到佢引用嘅邊／面。mesh=null（前面冇實體）→ 搵唔到。 */
export function topoRefsResolvable(f: F, prefixMesh: MeshLike | null): boolean {
  if (!prefixMesh || !prefixMesh.triangles || prefixMesh.triangles.length < 3) return false
  const { pts, edge } = topoPicks(f)
  if (!pts.length) return true
  const V = prefixMesh.vertices
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < V.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], V[i + k]); mx[k] = Math.max(mx[k], V[i + k]) }
  const tol = Math.max(0.05, 0.002 * Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]))
  return pts.every((p) => pickFaceSupport(p, prefixMesh, tol) >= (edge ? 2 : 1))
}

// ── FISHING12 P1：「作用於實體」特徵嘅重排依賴 ──────────────────────────────────────────────────────
// 孔／切割／刻字凸字（emboss）／面上螺紋／面上草圖（sketchFaceBinding）等，靠前面已有實體嘅面先有意義，
// 但唔一定有 id 或拾取點引用 → 靜態掃描同 topoRefsResolvable 都睇唔到。上移到產生實體嘅原語之前，
// 內核切／刻空氣就靜默無效（「已上移「孔1」並重建」但孔消失）。做法：凡係前置特徵少咗實體特徵，
// 用新順序前綴「有／冇呢個特徵」各試建一次比體積；原本有效、移動後變無效（或前面冇咗實體）→ 拒絕。
const BODY_DEP_TYPES = new Set(['hole', 'othread', 'ithread', 'cylpatch'])
const opOf = (f: Record<string, unknown>): unknown => f.operation ?? f.op

export function isBodyDependentFeature(f: F): boolean {
  if (isTopoRefFeature(f)) return false   // 已由 topoFeaturesToCheck + topoRefsResolvable 處理
  if (f.type === 'sketch' || f.type === 'datum') return false
  if (BODY_DEP_TYPES.has(f.type)) return true
  if ((f as { sketchFaceBinding?: unknown }).sketchFaceBinding) return true
  if (f.type === 'text' && (f as { arbPlane?: unknown }).arbPlane) return true   // 面上凸字／刻字
  const op = opOf(f)
  if (op === 'cut' || op === 'intersect') return true
  const subs = (f as { subs?: Record<string, unknown>[] }).subs
  if (Array.isArray(subs) && subs.some((x) => x && (opOf(x) === 'cut' || opOf(x) === 'intersect'))) return true
  return false
}

/** 移動後要試建驗證嘅「作用於實體」特徵：佢前面少咗（非草圖／基準）特徵。 */
export function bodyFeaturesToCheck<T extends F>(before: readonly T[], after: readonly T[]): { feature: T; lost: T[] }[] {
  const out: { feature: T; lost: T[] }[] = []
  const posB = new Map(before.map((f, i) => [f.id, i]))
  const posA = new Map(after.map((f, i) => [f.id, i]))
  for (const f of after) {
    if (!isBodyDependentFeature(f)) continue
    const ib = posB.get(f.id), ia = posA.get(f.id)!
    if (ib == null) continue
    const lost = before.slice(0, ib).filter((g) => (posA.get(g.id) ?? -1) > ia && g.type !== 'sketch' && g.type !== 'datum')
    if (lost.length) out.push({ feature: f, lost })
  }
  return out
}

/** 一個特徵喺某前綴上嘅效果：前綴體積（冇實體＝0）同加入特徵後體積。 */
export type FeatureEffect = { without: number; with: number }
const effectTol = (e: FeatureEffect) => Math.max(1e-3, 1e-6 * Math.max(Math.abs(e.without), Math.abs(e.with)))
/** 特徵有冇真係改變到實體（體積差大過容差）。 */
export function featureHasEffect(e: FeatureEffect): boolean {
  return Math.abs(e.with - e.without) > effectTol(e)
}
/**
 * 移動後特徵變成「靜默無效」：原本有效（改到實體），而移動後 ① 前面已冇實體（孔／刻字冇面可落），或 ② 加入後體積冇變。
 * 原本已經無效嘅舊檔特徵唔當新違規（只拒絕今次移動引入嘅問題）。
 */
export function effectLostByMove(orig: FeatureEffect, moved: FeatureEffect): boolean {
  if (!featureHasEffect(orig)) return false
  if (orig.without > 0 && !(moved.without > effectTol(moved))) return true
  return !featureHasEffect(moved)
}
