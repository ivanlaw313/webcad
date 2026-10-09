// Model-mode multi-selection (Fusion): faces / edges / bodies with Ctrl/Shift toggle and window/crossing box select.
// Pure helpers only (no React/three/store) → unit-testable. Coordinates: `pt` = three-world point (what pick
// commands like roundEdgeAt/pushPullAt consume); `tris`/`segs` = CAD-space flat positions for the highlight overlay.
export type V3 = [number, number, number]
export type ModelSelItem =
  | { kind: 'face'; key: string; pt: V3; n?: V3; tris: number[] }
  | { kind: 'edge'; key: string; pt: V3; segs: number[] }
  | { kind: 'body'; key: string; parked?: number }

export type SelMod = 'replace' | 'toggle'
/** Fusion: Ctrl/Cmd/Shift + click adds/removes; plain click replaces. */
export function clickMod(e: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): SelMod {
  return e.ctrlKey || e.metaKey || e.shiftKey ? 'toggle' : 'replace'
}
export const selKey = (it: ModelSelItem) => it.kind + ':' + it.key

export function applySelClick(list: readonly ModelSelItem[], item: ModelSelItem, mod: SelMod): ModelSelItem[] {
  if (mod === 'replace') return [item]
  const k = selKey(item)
  return list.some((x) => selKey(x) === k) ? list.filter((x) => selKey(x) !== k) : [...list, item]
}
/** Union for additive box select (keeps existing order, appends new keys). */
export function mergeSel(list: readonly ModelSelItem[], add: readonly ModelSelItem[]): ModelSelItem[] {
  const seen = new Set(list.map(selKey))
  const out = [...list]
  for (const it of add) { const k = selKey(it); if (!seen.has(k)) { seen.add(k); out.push(it) } }
  return out
}

// ── B-rep edge chains from flat segment positions [x0,y0,z0,x1,y1,z1, …] ──────────────────────
const vkey = (p: ArrayLike<number>, i: number) => `${Math.round(p[i] * 1e4)},${Math.round(p[i + 1] * 1e4)},${Math.round(p[i + 2] * 1e4)}`
/**
 * Segments that form the same B-rep edge as segment `seg`: walk through shared endpoints while the endpoint has
 * exactly two incident segments (a smooth polyline); stop at corners (≥3) / open ends (1).
 */
export function edgeChainAt(pos: ArrayLike<number>, seg: number): number[] {
  const n = Math.floor(pos.length / 6)
  if (!(seg >= 0 && seg < n)) return []
  const inc = new Map<string, number[]>()
  for (let s = 0; s < n; s++) for (const e of [0, 3]) { const k = vkey(pos, s * 6 + e); const a = inc.get(k); if (a) a.push(s); else inc.set(k, [s]) }
  const out = new Set<number>([seg])
  const walk = (from: number, endOff: number) => {
    let cur = from, k = vkey(pos, cur * 6 + endOff)
    for (let guard = 0; guard < n; guard++) {
      const nb = inc.get(k)
      if (!nb || nb.length !== 2) return
      const nx = nb[0] === cur ? nb[1] : nb[0]
      if (out.has(nx)) return
      out.add(nx)
      const k0 = vkey(pos, nx * 6), k1 = vkey(pos, nx * 6 + 3)
      k = k0 === k ? k1 : k0
      cur = nx
    }
  }
  walk(seg, 0); walk(seg, 3)
  return [...out].sort((a, b) => a - b)
}
export function chainSegs(pos: ArrayLike<number>, chain: number[]): number[] {
  const out: number[] = []
  for (const s of chain) for (let j = 0; j < 6; j++) out.push(pos[s * 6 + j])
  return out
}

// ── Screen-space rectangle tests (window = fully inside, crossing = touches) ───────────────────
export type Rect = { L: number; T: number; R: number; B: number }
const inR = (r: Rect, x: number, y: number) => x >= r.L && x <= r.R && y >= r.T && y <= r.B
function segsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
  if (Math.abs(d) < 1e-12) return false
  const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d
  const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d
  return t >= 0 && t <= 1 && u >= 0 && u <= 1
}
export function segTouchesRect(r: Rect, ax: number, ay: number, bx: number, by: number): boolean {
  if (inR(r, ax, ay) || inR(r, bx, by)) return true
  const e: [number, number, number, number][] = [[r.L, r.T, r.R, r.T], [r.R, r.T, r.R, r.B], [r.R, r.B, r.L, r.B], [r.L, r.B, r.L, r.T]]
  return e.some(([x0, y0, x1, y1]) => segsCross(ax, ay, bx, by, x0, y0, x1, y1))
}
function ptInTri(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax)
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx)
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx)
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)
}
/** pts2 = flat projected [x,y,…] (NaN = behind camera → never inside). */
export function allInside(r: Rect, pts2: ArrayLike<number>): boolean {
  if (pts2.length < 2) return false
  for (let i = 0; i + 1 < pts2.length; i += 2) if (!(Number.isFinite(pts2[i]) && inR(r, pts2[i], pts2[i + 1]))) return false
  return true
}
/** Crossing test for segments: flat [ax,ay,bx,by,…]. */
export function segsTouch(r: Rect, seg2: ArrayLike<number>): boolean {
  for (let i = 0; i + 3 < seg2.length; i += 4) {
    const a = [seg2[i], seg2[i + 1], seg2[i + 2], seg2[i + 3]]
    if (a.every(Number.isFinite) && segTouchesRect(r, a[0], a[1], a[2], a[3])) return true
  }
  return false
}
/** Crossing test for triangles: flat [ax,ay,bx,by,cx,cy,…]. */
export function trisTouch(r: Rect, tri2: ArrayLike<number>): boolean {
  for (let i = 0; i + 5 < tri2.length; i += 6) {
    const t = [tri2[i], tri2[i + 1], tri2[i + 2], tri2[i + 3], tri2[i + 4], tri2[i + 5]]
    if (!t.every(Number.isFinite)) continue
    if (inR(r, t[0], t[1]) || inR(r, t[2], t[3]) || inR(r, t[4], t[5])) return true
    if (ptInTri(r.L, r.T, t[0], t[1], t[2], t[3], t[4], t[5])) return true
    if (segTouchesRect(r, t[0], t[1], t[2], t[3]) || segTouchesRect(r, t[2], t[3], t[4], t[5]) || segTouchesRect(r, t[4], t[5], t[0], t[1])) return true
  }
  return false
}
/** Which root-level entity kind a box selection collects (honours the selection filter + priority). */
export function boxSelKind(priority: 'body' | 'face' | 'edge', types: readonly string[], fullyInsideBody: boolean, winMode: boolean): 'body' | 'face' | 'edge' | null {
  const ok = (t: string) => types.includes(t)
  // Window around a whole body → the body (Fusion), unless edge priority asks for edges explicitly.
  if (winMode && fullyInsideBody && ok('body') && priority !== 'edge') return 'body'
  if (priority === 'body' && ok('body')) return 'body'
  if (priority === 'edge' && ok('edge')) return 'edge'
  if (ok('face')) return 'face'
  if (ok('edge')) return 'edge'
  if (ok('body')) return 'body'
  return null
}
