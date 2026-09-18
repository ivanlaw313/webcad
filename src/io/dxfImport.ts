// Self-written minimal DXF reader (R12+ ASCII). Imports the common 2D-profile subset — LINE, LWPOLYLINE
// (incl. group-42 bulge arcs, tessellated), (legacy) POLYLINE vertices, CIRCLE, ARC, SPLINE (De Boor NURBS
// incl. weights; Catmull-Rom over fit points), ELLIPSE (incl. partial elliptical arcs) and INSERT block
// references (BLOCKS section, nested ≤4 levels, translate/rotate/per-axis scale) — into closed profiles
// ready for extrusion. TEXT / MTEXT are retained as ImpText annotations (not silently dropped); hatches /
// dimensions etc. still report via skipped. License-safe: clean-room from the public DXF group-code format.
import { tessellateSeg } from '../sketch/sketchOps.ts'
// GM-X3 #8：每个轮廓保留来源 layer（DXF group-code 8）→ 导入对话框逐层包含勾选。optional：SVG 无层 = undefined，旧调用零回归。
export type ImpProfile = ({ kind: 'circle'; c: [number, number]; r: number } | { kind: 'poly'; pts: [number, number][] }) & { layer?: string }
// Lightweight DXF text annotation (TEXT / MTEXT). Shown as sketch labels + construction underline markers.
export type ImpText = { at: [number, number]; text: string; height: number; rot?: number; layer?: string }

/** Strip common MTEXT control codes to plain display text (keep newlines as spaces). */
export function stripMtextFormatting(raw: string): string {
  let s = raw.replace(/\\P/gi, ' ').replace(/\\~|\\n/gi, ' ')
  // {\fArial|b0|i0|c0|p34;Hello} → Hello; drop other {\…;…} / \A1; style prefixes.
  s = s.replace(/\{\\[^;]*;/g, '').replace(/\}/g, '')
  s = s.replace(/\\[A-Za-z][^;\\]*;/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

/** BBox centre used by classifyProfiles so TEXT annotations share the same recenter. */
export function profilesRecenterOffset(profiles: ImpProfile[]): [number, number] {
  if (!profiles.length) return [0, 0]
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9
  const acc = (x: number, y: number) => { if (x < mnx) mnx = x; if (y < mny) mny = y; if (x > mxx) mxx = x; if (y > mxy) mxy = y }
  for (const p of profiles) { if (p.kind === 'circle') { acc(p.c[0] - p.r, p.c[1] - p.r); acc(p.c[0] + p.r, p.c[1] + p.r) } else for (const pt of p.pts) acc(pt[0], pt[1]) }
  if (!(Number.isFinite(mnx) && Number.isFinite(mxx))) return [0, 0]
  return [(mnx + mxx) / 2, (mny + mxy) / 2]
}

export function shiftTexts(texts: ImpText[], ox: number, oy: number): ImpText[] {
  return texts.map((t) => ({ ...t, at: [t.at[0] - ox, t.at[1] - oy] as [number, number] }))
}

/** Default construction-marker budget for large schematics (v1.34). Labels still kept in sketchSources. */
export const DXF_MAX_TEXT_MARKERS = 128

/** Construction underline + point marker for each ImpText (visible without font WASM).
 *  v1.34: `maxMarkers` caps geometry explosion on TEXT-heavy schematics; HUD still shows all labels. */
export function textsToConstructionShapes(texts: ImpText[], opt?: { maxMarkers?: number }): Array<
  | { type: 'poly'; pts: [number, number][]; open: true; construction: true }
  | { type: 'circle'; c: [number, number]; r: number; point: true; construction: true }
> {
  const out: Array<
    | { type: 'poly'; pts: [number, number][]; open: true; construction: true }
    | { type: 'circle'; c: [number, number]; r: number; point: true; construction: true }
  > = []
  const cap = opt?.maxMarkers != null ? Math.max(0, opt.maxMarkers) : texts.length
  const n = Math.min(texts.length, cap)
  for (let i = 0; i < n; i++) {
    const t = texts[i]
    const h = Math.max(0.5, t.height || 2.5)
    const w = Math.max(h * 1.2, Math.min(80, (t.text?.length || 1) * h * 0.55))
    const rad = ((t.rot || 0) * Math.PI) / 180
    const dx = Math.cos(rad) * w, dy = Math.sin(rad) * w
    out.push({ type: 'circle', c: [t.at[0], t.at[1]], r: 0, point: true, construction: true })
    out.push({ type: 'poly', pts: [[t.at[0], t.at[1]], [t.at[0] + dx, t.at[1] + dy]], open: true, construction: true })
  }
  return out
}

const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05

// Recentre a set of 2D profiles about the XY origin, then classify each as an outer ('new') boundary or a
// hole ('cut'): the largest-area profile is the base; any smaller profile whose centroid lies inside the base
// is a hole. Shared by DXF and SVG import. Pure (no store/worker coupling) → unit-testable.
export function classifyProfiles(profiles: ImpProfile[]): { profile: ImpProfile; operation: 'new' | 'cut' }[] {
  if (!profiles.length) return []
  const [ox, oy] = profilesRecenterOffset(profiles)
  const shifted: ImpProfile[] = profiles.map((p) => p.kind === 'circle' ? { kind: 'circle', c: [p.c[0] - ox, p.c[1] - oy], r: p.r, ...(p.layer ? { layer: p.layer } : {}) } : { kind: 'poly', pts: p.pts.map((pt) => [pt[0] - ox, pt[1] - oy] as [number, number]), ...(p.layer ? { layer: p.layer } : {}) })
  const polyArea = (pts: [number, number][]) => { let a = 0; for (let i = 0; i < pts.length; i++) { const j = (i + 1) % pts.length; a += pts[i][0] * pts[j][1] - pts[j][0] * pts[i][1] } return Math.abs(a) / 2 }
  const cent = (p: ImpProfile): [number, number] => p.kind === 'circle' ? p.c : [p.pts.reduce((s, q) => s + q[0], 0) / p.pts.length, p.pts.reduce((s, q) => s + q[1], 0) / p.pts.length]
  const area = (p: ImpProfile) => p.kind === 'circle' ? Math.PI * p.r * p.r : polyArea(p.pts)
  const inPoly = (pt: [number, number], pts: [number, number][]) => { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1]; if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)) inside = !inside } return inside }
  // Even-odd nesting rule (like font/CAD fill): a profile contained in an ODD number of larger profiles is a
  // HOLE (cut), EVEN is SOLID (new). Correctly handles a plate-with-hole, MULTIPLE separate shapes each with
  // their own holes (e.g. a logo's letters A/B/O), and islands-inside-holes — not just "the single biggest".
  const areas = shifted.map((p) => area(p))
  const ptInside = (c: [number, number], q: ImpProfile) => q.kind === 'circle' ? Math.hypot(c[0] - q.c[0], c[1] - q.c[1]) < q.r : inPoly(c, q.pts)
  return shifted.map((p, i) => {
    const c = cent(p)
    let depth = 0
    for (let k = 0; k < shifted.length; k++) if (k !== i && areas[k] > areas[i] && ptInside(c, shifted[k])) depth++
    return { profile: p, operation: depth % 2 === 1 ? 'cut' as const : 'new' as const }
  })
}

// ---------------------------------------------------------------------------------------------------------
// 2D affine transform [a, b, c, d, e, f]: x' = a·x + b·y + e, y' = c·x + d·y + f. Used to instantiate INSERT
// block references (translate + rotate + per-axis scale), composable for nested blocks.
type Xf = [number, number, number, number, number, number]
const XID: Xf = [1, 0, 0, 1, 0, 0]
const xfp = (m: Xf, x: number, y: number): [number, number] => [m[0] * x + m[1] * y + m[4], m[2] * x + m[3] * y + m[5]]
const xfMul = (o: Xf, i: Xf): Xf => [o[0] * i[0] + o[1] * i[2], o[0] * i[1] + o[1] * i[3], o[2] * i[0] + o[3] * i[2], o[2] * i[1] + o[3] * i[3], o[0] * i[4] + o[1] * i[5] + o[4], o[2] * i[4] + o[3] * i[5] + o[5]]
// A transform keeps circles circular iff its two columns are orthogonal and equally long (rotation × uniform scale ± mirror).
const xfUniform = (m: Xf) => Math.abs(m[0] * m[0] + m[2] * m[2] - m[1] * m[1] - m[3] * m[3]) < 1e-6 && Math.abs(m[0] * m[1] + m[2] * m[3]) < 1e-6

// Evaluate a (possibly rational) B-spline with De Boor's algorithm — exported so it is unit-testable. When
// the DXF knot vector is missing or inconsistent (count ≠ nCtrl+degree+1, NaN, or decreasing) it falls back
// gracefully instead of throwing: closed splines get a periodic wrap (first `degree` control points repeated
// + uniform knots → exact closure), open ones an open-uniform clamped vector. Chord-based tessellation:
// 64 segments minimum, +1 segment per mm of control-polygon length, capped at 128.
export function evalBSpline(ctrlIn: [number, number][], degreeIn: number, knotsIn: number[], weightsIn?: number[], closed?: boolean): [number, number][] {
  if (ctrlIn.length < 2) return ctrlIn.map((p) => [p[0], p[1]])
  const deg = Math.max(1, Math.min(Number.isFinite(degreeIn) && degreeIn >= 1 ? Math.floor(degreeIn) : 3, ctrlIn.length - 1))
  let ctrl = ctrlIn
  let weights = weightsIn && weightsIn.length === ctrlIn.length && weightsIn.every((w) => Number.isFinite(w) && w > 0) ? weightsIn : undefined
  let knots = knotsIn
  const knotsOk = knots.length === ctrl.length + deg + 1 && knots.every((k, i) => Number.isFinite(k) && (i === 0 || k >= knots[i - 1])) && knots[deg] < knots[knots.length - 1 - deg]
  if (!knotsOk) {
    if (closed) { // periodic wrap: uniform knots over ctrl+first-deg-points — the curve returns to its start exactly
      ctrl = [...ctrlIn, ...ctrlIn.slice(0, deg)]
      if (weights) weights = [...weights, ...weights.slice(0, deg)]
      knots = Array.from({ length: ctrl.length + deg + 1 }, (_, i) => i)
    } else { // open-uniform clamped: passes through first/last control point
      const spans = ctrl.length - deg
      knots = [...new Array(deg + 1).fill(0), ...Array.from({ length: spans - 1 }, (_, i) => i + 1), ...new Array(deg + 1).fill(spans)]
    }
  }
  let plen = 0
  for (let i = 1; i < ctrl.length; i++) plen += Math.hypot(ctrl[i][0] - ctrl[i - 1][0], ctrl[i][1] - ctrl[i - 1][1])
  const n = Math.min(128, Math.max(64, Math.ceil(plen)))
  const t0 = knots[deg], t1 = knots[knots.length - 1 - deg]
  const hi = knots.length - deg - 2 // largest valid knot span index
  const out: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const t = t0 + ((t1 - t0) * i) / n
    let k = deg
    while (k < hi && t >= knots[k + 1]) k++
    // De Boor in homogeneous coords (x·w, y·w, w) so rational (weighted) splines come out right too.
    const d: [number, number, number][] = []
    for (let j = 0; j <= deg; j++) { const idx = j + k - deg, w = weights ? weights[idx] : 1; d.push([ctrl[idx][0] * w, ctrl[idx][1] * w, w]) }
    for (let r = 1; r <= deg; r++)
      for (let j = deg; j >= r; j--) {
        const den = knots[j + 1 + k - r] - knots[j + k - deg]
        const al = den > 1e-12 ? (t - knots[j + k - deg]) / den : 0
        d[j] = [d[j - 1][0] * (1 - al) + d[j][0] * al, d[j - 1][1] * (1 - al) + d[j][1] * al, d[j - 1][2] * (1 - al) + d[j][2] * al]
      }
    const w = Math.abs(d[deg][2]) > 1e-12 ? d[deg][2] : 1
    out.push([d[deg][0] / w, d[deg][1] / w])
  }
  if (closed && !near(out[0], out[out.length - 1])) out.push([out[0][0], out[0][1]]) // closed flag on a clamped spline: close it
  return out
}

// Uniform Catmull-Rom through SPLINE fit points (files that store fit points but no control points).
// Interpolates every fit point; ~64 segments total, capped at 128 — exported so it is unit-testable.
export function evalCatmullRom(fit: [number, number][], closed?: boolean): [number, number][] {
  if (fit.length < 3) return fit.map((p) => [p[0], p[1]])
  const n = fit.length, segs = closed ? n : n - 1
  const sub = Math.max(1, Math.min(16, Math.floor(128 / segs), Math.round(64 / segs)))
  const P = (i: number) => closed ? fit[((i % n) + n) % n] : fit[Math.max(0, Math.min(n - 1, i))]
  const out: [number, number][] = []
  for (let s = 0; s < segs; s++) {
    const p0 = P(s - 1), p1 = P(s), p2 = P(s + 1), p3 = P(s + 2)
    for (let j = 0; j < sub; j++) {
      const t = j / sub, t2 = t * t, t3 = t2 * t
      out.push([
        0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  out.push(closed ? [fit[0][0], fit[0][1]] : [fit[n - 1][0], fit[n - 1][1]])
  return out
}

type DxfEnt = { type: string; pairs: [number, string][] }

export type ParseDxfOpt = {
  /** Cooperative cancel (AbortSignal or `{ aborted: boolean }`). Checked between entity emit batches. */
  signal?: AbortSignal | { aborted?: boolean }
  /** Progress hook (phase + counts). Caller may update UI status. */
  onProgress?: (p: { phase: string; done: number; total: number }) => void
  /** Soft cap on retained ImpText (overflow counted in stats.textTruncated). Default: unlimited. */
  maxTexts?: number
}

export type ParseDxfStats = {
  bytes: number
  entityCount: number
  textTotal: number
  textKept: number
  textTruncated: number
  cancelled?: boolean
}

export type ParseDxfResult = {
  profiles: ImpProfile[]
  texts: ImpText[]
  note: string
  skipped: string[]
  layers: string[]
  stats: ParseDxfStats
}

const isAborted = (sig?: AbortSignal | { aborted?: boolean }) => !!(sig && ('aborted' in sig ? sig.aborted : false))

export function parseDxfToProfiles(text: string, opt?: ParseDxfOpt): ParseDxfResult {
  const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
  const toks = text.split(/\r\n|\r|\n/)
  // DXF is a flat stream of (group-code, value) line pairs. Resync if a stray non-numeric code line appears.
  const pairs: [number, string][] = []
  for (let i = 0; i + 1 < toks.length; i += 2) {
    const code = parseInt(toks[i].trim(), 10)
    if (Number.isNaN(code)) { i -= 1; continue }
    pairs.push([code, toks[i + 1]])
  }
  // Split into entities: a group code 0 starts a new entity whose value is the entity type.
  const ents: DxfEnt[] = []
  let cur: DxfEnt | null = null
  for (const [code, val] of pairs) {
    if (code === 0) { if (cur) ents.push(cur); cur = { type: (val || '').trim().toUpperCase(), pairs: [] } }
    else if (cur) cur.pairs.push([code, val])
  }
  if (cur) ents.push(cur)

  const num = (p: [number, string][], code: number) => { const f = p.find((x) => x[0] === code); return f ? parseFloat(f[1]) : NaN }
  const numOr = (p: [number, string][], code: number, dflt: number) => { const v = num(p, code); return Number.isFinite(v) ? v : dflt }
  const str = (p: [number, string][], code: number) => { const f = p.find((x) => x[0] === code); return f ? f[1].trim() : '' }

  // --- pass 1: route entities into BLOCK definitions vs model space -------------------------------------
  // Entities inside SECTION BLOCKS belong to their BLOCK (drawn only when an INSERT references the block);
  // everything else — including section-less DXF fragments — is model-space geometry, as before.
  const blocks = new Map<string, { base: [number, number]; ents: DxfEnt[] }>()
  const model: DxfEnt[] = []
  let section = ''
  let blk: { base: [number, number]; ents: DxfEnt[] } | null = null
  for (const e of ents) {
    if (e.type === 'SECTION') { section = str(e.pairs, 2).toUpperCase(); blk = null; continue }
    if (e.type === 'ENDSEC') { section = ''; blk = null; continue }
    if (section === 'BLOCKS') {
      if (e.type === 'BLOCK') { blk = { base: [numOr(e.pairs, 10, 0), numOr(e.pairs, 20, 0)], ents: [] }; const nm = str(e.pairs, 2).toUpperCase(); if (nm) blocks.set(nm, blk); continue }
      if (e.type === 'ENDBLK') { blk = null; continue }
      if (blk) blk.ents.push(e)
      continue
    }
    model.push(e)
  }

  const circles: ImpProfile[] = []
  const segs: [number, number, number, number][] = []   // loose line/arc segments to chain into loops
  const segLayer: string[] = []                          // GM-X3 #8：逐 seg 的 layer（chain 后 loop 继承种子段）
  const closedLoops: { pts: [number, number][]; layer: string }[] = []
  const texts: ImpText[] = []
  const skipped = new Set<string>()
  const STRUCT = new Set(['SECTION', 'ENDSEC', 'EOF', 'TABLE', 'ENDTAB', 'BLOCK', 'ENDBLK', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS', 'CLASS', 'SEQEND', 'VERTEX', 'LAYER', 'STYLE', 'VPORT', 'LTYPE', 'APPID', 'DIMSTYLE', 'HEADER'])

  // --- pass 2: emit geometry, recursing through INSERT references with a composed transform -------------
  // GM-X3 #8：lyr = 当前实体 layer（entity 自带 code 8，否则继承 INSERT 的 layer；缺省 '0'）。
  const emit = (e: DxfEnt, m: Xf, depth: number, parentLyr = '0'): void => {
    const lyr = str(e.pairs, 8) || parentLyr || '0'
    if (e.type === 'LINE') {
      const x1 = num(e.pairs, 10), y1 = num(e.pairs, 20), x2 = num(e.pairs, 11), y2 = num(e.pairs, 21)
      if ([x1, y1, x2, y2].every(Number.isFinite)) { const p = xfp(m, x1, y1), q = xfp(m, x2, y2); segs.push([p[0], p[1], q[0], q[1]]); segLayer.push(lyr) }
    } else if (e.type === 'CIRCLE') {
      const cx = num(e.pairs, 10), cy = num(e.pairs, 20), r = num(e.pairs, 40)
      if ([cx, cy, r].every(Number.isFinite) && r > 0) {
        if (xfUniform(m)) circles.push({ kind: 'circle', c: xfp(m, cx, cy), r: r * Math.hypot(m[0], m[2]), layer: lyr })
        else { // non-uniform block scale turns the circle into an ellipse → tessellate a 48-gon
          const pts: [number, number][] = []
          for (let i = 0; i < 48; i++) { const a = (i * Math.PI * 2) / 48; pts.push(xfp(m, cx + r * Math.cos(a), cy + r * Math.sin(a))) }
          closedLoops.push({ pts, layer: lyr })
        }
      }
    } else if (e.type === 'ARC') {
      const cx = num(e.pairs, 10), cy = num(e.pairs, 20), r = num(e.pairs, 40), a0 = num(e.pairs, 50), a1 = num(e.pairs, 51)
      if ([cx, cy, r, a0, a1].every(Number.isFinite) && r > 0) {
        let sweep = a1 - a0; while (sweep <= 0) sweep += 360
        const n = Math.max(3, Math.ceil(sweep / 8)) // ~8° chords — smoother imported arcs (better print/appearance)
        let prev = xfp(m, cx + r * Math.cos((a0 * Math.PI) / 180), cy + r * Math.sin((a0 * Math.PI) / 180))
        for (let i = 1; i <= n; i++) { const a = ((a0 + (sweep * i) / n) * Math.PI) / 180, q = xfp(m, cx + r * Math.cos(a), cy + r * Math.sin(a)); segs.push([prev[0], prev[1], q[0], q[1]]); segLayer.push(lyr); prev = q }
      }
    } else if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      // Collect RAW verts + per-vertex group-42 bulge (the bulge belongs to the segment STARTING at that
      // vertex; the last vertex's bulge is the closing segment). Bulge arcs are tessellated in raw coords
      // FIRST, then transformed point-wise — a non-uniform INSERT scale turns arcs into ellipses, so
      // transforming arc parameters instead of points would be wrong.
      const raw: [number, number][] = []
      const bulges: number[] = []
      let vx: number | null = null
      for (const [code, val] of e.pairs) {
        if (code === 10) vx = parseFloat(val)
        else if (code === 20 && vx != null) { const vy = parseFloat(val); if (Number.isFinite(vx) && Number.isFinite(vy)) { raw.push([vx, vy]); bulges.push(0) } vx = null } // drop non-finite vertices so a stray bad coord doesn't poison the whole import
        else if (code === 42 && raw.length) { const b = parseFloat(val); if (Number.isFinite(b)) bulges[raw.length - 1] = b }
      }
      const closed = (num(e.pairs, 70) || 0) & 1
      if (raw.length >= 2) {
        const pts: [number, number][] = []
        const nSeg = closed ? raw.length : raw.length - 1
        for (let i = 0; i < raw.length; i++) {
          pts.push(xfp(m, raw[i][0], raw[i][1]))
          const b = i < nSeg ? (bulges[i] || 0) : 0
          if (Math.abs(b) > 1e-9) {
            // DXF positive bulge = CCW start→end (凸向行进右侧); tessellateSeg uses webcad 凸左 convention → negate.
            const mid = tessellateSeg(raw[i], raw[(i + 1) % raw.length], -b)
            for (let k = 0; k < mid.length - 1; k++) pts.push(xfp(m, mid[k][0], mid[k][1]))  // skip the endpoint — next vertex pushes it (closing seg: raw[0] already at pts[0])
          }
        }
        if (closed) closedLoops.push({ pts, layer: lyr })
        else for (let i = 0; i + 1 < pts.length; i++) { segs.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]); segLayer.push(lyr) }
      }
    } else if (e.type === 'SPLINE') {
      // 70 flags (bit1 closed) · 71 degree · 40* knots · 41* weights · 10/20* control points · 11/21* fit points
      const flags = numOr(e.pairs, 70, 0), degree = num(e.pairs, 71), closed = !!(flags & 1)
      const knots: number[] = [], weights: number[] = [], ctrl: [number, number][] = [], fit: [number, number][] = []
      let cx: number | null = null, fx: number | null = null
      for (const [code, val] of e.pairs) {
        if (code === 40) knots.push(parseFloat(val))
        else if (code === 41) weights.push(parseFloat(val))
        else if (code === 10) cx = parseFloat(val)
        else if (code === 20 && cx != null) { const y = parseFloat(val); if (Number.isFinite(cx) && Number.isFinite(y)) ctrl.push([cx, y]); cx = null }
        else if (code === 11) fx = parseFloat(val)
        else if (code === 21 && fx != null) { const y = parseFloat(val); if (Number.isFinite(fx) && Number.isFinite(y)) fit.push([fx, y]); fx = null }
      }
      const raw = ctrl.length >= 2 ? evalBSpline(ctrl, degree, knots, weights.length === ctrl.length ? weights : undefined, closed)
        : fit.length >= 2 ? evalCatmullRom(fit, closed) : null
      if (raw && raw.length >= 2) {
        const tp = raw.map((p) => xfp(m, p[0], p[1]))
        if (closed) closedLoops.push({ pts: tp, layer: lyr })
        else for (let i = 0; i + 1 < tp.length; i++) { segs.push([tp[i][0], tp[i][1], tp[i + 1][0], tp[i + 1][1]]); segLayer.push(lyr) }
      }
    } else if (e.type === 'ELLIPSE') {
      // 10/20 center · 11/21 major-axis endpoint vector (relative) · 40 minor/major ratio · 41/42 start/end params (rad)
      const cx = num(e.pairs, 10), cy = num(e.pairs, 20), mx = num(e.pairs, 11), my = num(e.pairs, 21), ratio = num(e.pairs, 40)
      let p0 = numOr(e.pairs, 41, 0), p1 = numOr(e.pairs, 42, Math.PI * 2)
      if ([cx, cy, mx, my].every(Number.isFinite) && Number.isFinite(ratio) && ratio > 0 && Math.hypot(mx, my) > 1e-9) {
        while (p1 <= p0 + 1e-12) p1 += Math.PI * 2
        const sweep = p1 - p0, full = Math.abs(sweep - Math.PI * 2) < 1e-6
        const n = full ? 48 : Math.max(8, Math.ceil((48 * sweep) / (Math.PI * 2)))
        const ex = -my * ratio, ey = mx * ratio // minor semi-axis = major axis rotated 90° × ratio → rotation respected
        const pt = (t: number) => xfp(m, cx + Math.cos(t) * mx + Math.sin(t) * ex, cy + Math.cos(t) * my + Math.sin(t) * ey)
        if (full) { const pts: [number, number][] = []; for (let i = 0; i < n; i++) pts.push(pt(p0 + (sweep * i) / n)); closedLoops.push({ pts, layer: lyr }) }
        else { let prev = pt(p0); for (let i = 1; i <= n; i++) { const q = pt(p0 + (sweep * i) / n); segs.push([prev[0], prev[1], q[0], q[1]]); segLayer.push(lyr); prev = q } }
      }
    } else if (e.type === 'INSERT') {
      // 2 block name · 10/20 insertion point · 41/42 x/y scale (default 1) · 50 rotation (degrees)
      const name = str(e.pairs, 2).toUpperCase()
      const b = name ? blocks.get(name) : undefined
      if (!b) { skipped.add(name ? `INSERT(${name}未定义)` : 'INSERT'); return }
      if (depth >= 4) { skipped.add('INSERT(嵌套>4层)'); return }
      const ix = numOr(e.pairs, 10, 0), iy = numOr(e.pairs, 20, 0)
      const sx = numOr(e.pairs, 41, 1) || 1, sy = numOr(e.pairs, 42, 1) || 1
      const rot = (numOr(e.pairs, 50, 0) * Math.PI) / 180, co = Math.cos(rot), si = Math.sin(rot)
      // local map: p ↦ R(rot)·S(sx,sy)·(p − blockBase) + insertionPoint, composed onto the incoming transform
      const a = co * sx, bb = -si * sy, c = si * sx, d = co * sy
      const local: Xf = [a, bb, c, d, ix - (a * b.base[0] + bb * b.base[1]), iy - (c * b.base[0] + d * b.base[1])]
      const total = xfMul(m, local)
      for (const be of b.ents) emit(be, total, depth + 1, lyr)   // GM-X3 #8：块内实体无自带 layer 时继承 INSERT 的 layer
    } else if (e.type === 'TEXT' || e.type === 'MTEXT') {
      // TEXT: 1=string · 10/20 insert · 40 height · 50 rotation°. MTEXT: 1 + optional 3* chunks · same placement.
      const chunks: string[] = []
      for (const [code, val] of e.pairs) {
        if (code === 1 || code === 3) chunks.push(val)
      }
      const raw = chunks.join('')
      const plain = e.type === 'MTEXT' ? stripMtextFormatting(raw) : raw.replace(/\s+/g, ' ').trim()
      const x = num(e.pairs, 10), y = num(e.pairs, 20)
      const h = numOr(e.pairs, 40, 2.5)
      const rot = numOr(e.pairs, 50, 0)
      if (plain && [x, y].every(Number.isFinite)) {
        const at = xfp(m, x, y)
        const scl = Math.hypot(m[0], m[2]) || 1
        const height = Math.max(0.1, (Number.isFinite(h) && h > 0 ? h : 2.5) * scl)
        // Rotation: compose entity rot with transform polar angle (approx for uniform scale/rotate).
        const baseAng = Math.atan2(m[2], m[0]) * 180 / Math.PI
        const rotOut = rot + (Number.isFinite(baseAng) ? baseAng : 0)
        texts.push({ at, text: plain, height, ...(Math.abs(rotOut) > 1e-6 ? { rot: rotOut } : {}), layer: lyr })
      }
    } else if (!STRUCT.has(e.type) && e.type) {
      skipped.add(e.type) // HATCH / DIMENSION … (unsupported geometry, incl. unknowns inside blocks)
    }
  }
  let textTotal = 0
  const maxTexts = opt?.maxTexts != null && opt.maxTexts >= 0 ? opt.maxTexts : Infinity
  const emitWrapped = (e: DxfEnt, m: Xf, depth: number, parentLyr = '0'): void => {
    if (e.type === 'TEXT' || e.type === 'MTEXT') {
      textTotal++
      if (texts.length >= maxTexts) return  // count but skip retaining overflow
    }
    emit(e, m, depth, parentLyr)
  }
  // Rebind INSERT recursion to honor text cap / cancel — monkey-patch via local emit path for model only;
  // nested INSERT still uses raw emit (block texts rare); schematic TEXT is almost always model-space.
  const BATCH = 400
  for (let i = 0; i < model.length; i++) {
    if (i % BATCH === 0) {
      if (isAborted(opt?.signal)) {
        const layers = ['0']
        return {
          profiles: [], texts: [], note: 'DXF 导入已取消', skipped: [], layers,
          stats: { bytes: text.length, entityCount: model.length, textTotal, textKept: 0, textTruncated: 0, cancelled: true },
        }
      }
      opt?.onProgress?.({ phase: 'entities', done: i, total: model.length })
    }
    emitWrapped(model[i], XID, 0, '0')
  }

  // v1.34: spatial-hash endpoint index — O(n) greedy chain (was O(n²) scan; 20k loose LINEs froze UI ~10s).
  const CELL = 0.05  // match `near` tolerance
  const qk = (x: number, y: number) => `${Math.floor(x / CELL)}:${Math.floor(y / CELL)}`
  type EndHit = { si: number; end: 0 | 1 }
  const endIndex = new Map<string, EndHit[]>()
  const pushEnd = (x: number, y: number, hit: EndHit) => {
    const k = qk(x, y)
    const arr = endIndex.get(k)
    if (arr) arr.push(hit)
    else endIndex.set(k, [hit])
  }
  for (let i = 0; i < segs.length; i++) {
    pushEnd(segs[i][0], segs[i][1], { si: i, end: 0 })
    pushEnd(segs[i][2], segs[i][3], { si: i, end: 1 })
  }
  const neighbors = (x: number, y: number): EndHit[] => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL)
    const out: EndHit[] = []
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const bucket = endIndex.get(`${cx + dx}:${cy + dy}`)
      if (bucket) out.push(...bucket)
    }
    return out
  }
  const used = new Array(segs.length).fill(false)
  for (let s = 0; s < segs.length; s++) {
    if (used[s]) continue
    used[s] = true
    const loop: [number, number][] = [[segs[s][0], segs[s][1]], [segs[s][2], segs[s][3]]]
    const loopLyr = segLayer[s] || '0'
    let ext = true
    while (ext) {
      ext = false
      const tail = loop[loop.length - 1]
      for (const hit of neighbors(tail[0], tail[1])) {
        if (used[hit.si]) continue
        const a: [number, number] = [segs[hit.si][0], segs[hit.si][1]]
        const b: [number, number] = [segs[hit.si][2], segs[hit.si][3]]
        const pt = hit.end === 0 ? a : b
        const other = hit.end === 0 ? b : a
        if (near(tail, pt)) { loop.push(other); used[hit.si] = true; ext = true; break }
      }
    }
    if (loop.length >= 3) closedLoops.push({ pts: loop, layer: loopLyr })
  }

  const profiles: ImpProfile[] = [...circles]
  for (const loop of closedLoops) {
    const pts = loop.pts.slice()
    if (pts.length > 1 && near(pts[0], pts[pts.length - 1])) pts.pop() // drop duplicate closing vertex
    if (pts.length >= 3) profiles.push({ kind: 'poly', pts, ...(loop.layer ? { layer: loop.layer } : {}) })
  }
  const layers = [...new Set([
    ...profiles.map((p) => p.layer ?? '0'),
    ...texts.map((t) => t.layer ?? '0'),
  ])].sort()
  const textKept = texts.length
  const textTruncated = Math.max(0, textTotal - textKept)
  const textNote = textTotal ? ` · ${textTotal} 文字标注${textTruncated ? `（保留 ${textKept}）` : ''}` : ''
  const note = profiles.length
    ? `识别 ${profiles.length} 个轮廓（${circles.length} 圆 + ${profiles.length - circles.length} 多段线${layers.length > 1 ? ` · ${layers.length} 层` : ''}）${textNote}`
    : textTotal
      ? `未找到轮廓，但识别 ${textTotal} 个文字标注（TEXT/MTEXT）`
      : '未找到可用轮廓（支持 LINE / LWPOLYLINE / CIRCLE / ARC / SPLINE / ELLIPSE / INSERT 块 · TEXT/MTEXT 标注）'
  opt?.onProgress?.({ phase: 'done', done: model.length, total: model.length })
  void t0
  return {
    profiles, texts, note, skipped: [...skipped], layers,
    stats: { bytes: text.length, entityCount: model.length, textTotal, textKept, textTruncated },
  }
}
