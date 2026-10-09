/**
 * 放樣（Loft）內核核心 —— worker 同 Node 內核測試共用同一段碼（cad.worker.ts 用 Vite ?url 匯入 wasm，
 * Node import 唔到，所以幾何決策抽喺呢度）。
 *
 * Fusion 式放樣要點：
 *  1. 截面 wire 方向一致：每個截面嘅環繞方向（Newell 法向）對齊「行進方向」（下一截面形心 − 本截面形心），
 *     反向嘅 wire 先 Reversed() —— 避免方↔圓因一順一逆而扭成沙漏。
 *  2. 起點對齊：BRepOffsetAPI_ThruSections.CheckCompatibility(true) 令 OCCT BRepFill_CompatibleWires
 *     按截面邊數（唔同時用極座標法切分邊）同最近起點重新配對，方→圓唔會扭。
 *  3. 非平行截面（例如一個水平、一個直立）：同一套方向規則，用行進方向而唔用固定 Z。
 *  4. 結果把關：BRepCheck_Analyzer 有效 + 體積 > 0，否則拋清楚嘅繁體原因（唔會靜默出爛實體）。
 */
import { cast } from 'replicad'

export type V3 = [number, number, number]
export type LoftBuildOpts = {
  ruled?: boolean
  continuity?: 'C1' | 'C2'
  capPoint?: V3
  capEnd?: 'first' | 'last'
}

export const LOFT_MSG = {
  tooFew: '放樣失敗：至少要 2 個截面（或 1 個截面加封口點）',
  coincident: (i: number, j: number) => `放樣失敗：第 ${i} 同第 ${j} 個截面喺同一位置（重疊）— 請移開其中一個截面`,
  notClosed: (i: number) => `放樣失敗：第 ${i} 個截面唔係閉合輪廓 — 請用閉合草圖輪廓或平面`,
  build: '放樣失敗：內核無法將各截面連成實體 — 請檢查截面有冇自交、截面之間會唔會互相穿插，或者試下「直紋」',
  invalid: '放樣失敗：生成嘅實體自交／無效 — 請調整截面次序或位置（截面之間唔好交叉），或者試下「直紋」',
} as const

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const len = (a: V3) => Math.hypot(a[0], a[1], a[2])

/** 沿 wire（按 wire 自身方向，含邊 orientation）均勻參數取樣 n 點（唔含重複終點）。 */
export function sampleWirePts(oc: any, wire: any, n = 64): V3[] {
  const ad = new oc.BRepAdaptor_CompCurve_2(wire, false)
  try {
    const t0 = ad.FirstParameter(), t1 = ad.LastParameter()
    const out: V3[] = []
    for (let i = 0; i < n; i++) {
      const p = ad.Value(t0 + (t1 - t0) * i / n)
      out.push([p.X(), p.Y(), p.Z()])
      p.delete?.()
    }
    return out
  } finally { ad.delete?.() }
}

/** 閉環形心 + Newell 面積向量（方向 = 環繞方向右手法向，長度 = 2×面積）。 */
export function loopFrame(pts: V3[]): { c: V3; n: V3; area: number } {
  const c: V3 = [0, 0, 0]
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2] }
  const k = pts.length || 1
  c[0] /= k; c[1] /= k; c[2] /= k
  const n: V3 = [0, 0, 0]
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    n[0] += (a[1] - b[1]) * (a[2] + b[2])
    n[1] += (a[2] - b[2]) * (a[0] + b[0])
    n[2] += (a[0] - b[0]) * (a[1] + b[1])
  }
  return { c, n, area: len(n) / 2 }
}

/**
 * 每個截面應唔應該反轉，令全部截面環繞方向一致對齊行進方向。
 * 行進方向 d_i：首截面用 c1−c0，末截面用 c_n−c_{n−1}，中間用 c_{i+1}−c_{i−1}。
 * 若截面平面幾乎包含行進方向（|n̂·d̂|<0.2，例如 90° 拐彎嘅中間截面）→ 改同上一個（已定向）截面法向比。
 */
export function loftReverseFlags(frames: { c: V3; n: V3 }[]): boolean[] {
  const N = frames.length
  const flags: boolean[] = new Array(N).fill(false)
  let prevN: V3 | null = null
  for (let i = 0; i < N; i++) {
    const d = N < 2 ? [0, 0, 1] as V3 : i === 0 ? sub(frames[1].c, frames[0].c) : i === N - 1 ? sub(frames[N - 1].c, frames[N - 2].c) : sub(frames[i + 1].c, frames[i - 1].c)
    const n = frames[i].n, ln = len(n), ld = len(d)
    let s = 0
    if (ln > 1e-12 && ld > 1e-12) {
      const cosv = dot(n, d) / (ln * ld)
      if (Math.abs(cosv) >= 0.2) s = Math.sign(cosv)
    }
    if (s === 0 && prevN && ln > 1e-12) s = Math.sign(dot(n, prevN)) || 1
    if (s === 0) s = 1
    flags[i] = s < 0
    prevN = flags[i] ? [-n[0], -n[1], -n[2]] : n
  }
  return flags
}

function asWire(oc: any, shape: any): any {
  return oc.TopoDS.Wire_1(shape)
}

/** 驗證截面：閉合、唔重疊。throw 繁體原因。 */
export function checkLoftSections(oc: any, wires: any[]): { c: V3; n: V3; area: number }[] {
  const frames = wires.map((w, i) => {
    const closed = oc.BRep_Tool.IsClosed_1 ? oc.BRep_Tool.IsClosed_1(w) : true
    if (!closed) throw new Error(LOFT_MSG.notClosed(i + 1))
    return loopFrame(sampleWirePts(oc, w, 48))
  })
  for (let i = 0; i < frames.length; i++) for (let j = i + 1; j < frames.length; j++) {
    const a = frames[i], b = frames[j]
    const scale = Math.max(Math.sqrt(a.area), Math.sqrt(b.area), 1e-6)
    const na = len(a.n), nb = len(b.n)
    const parallel = na > 1e-12 && nb > 1e-12 && Math.abs(dot(a.n, b.n)) / (na * nb) > 0.999999
    const dist = len(sub(a.c, b.c))
    if (parallel && dist < scale * 1e-4 && (j === i + 1 || frames.length === 2)) throw new Error(LOFT_MSG.coincident(i + 1, j + 1))
  }
  return frames
}

/** 方向一致化：回傳新 wire 陣列（需要嘅先 Reversed）。 */
export function alignLoftWires(oc: any, wires: any[], frames?: { c: V3; n: V3 }[]): { wires: any[]; reversed: boolean[] } {
  const fr = frames ?? wires.map((w) => loopFrame(sampleWirePts(oc, w, 48)))
  const reversed = loftReverseFlags(fr)
  return { wires: wires.map((w, i) => reversed[i] ? asWire(oc, w.Reversed()) : w), reversed }
}

export function shapeVolume(oc: any, shape: any): number {
  const g = new oc.GProp_GProps_1()
  try { oc.BRepGProp.VolumeProperties_1(shape, g, false, false, false); return g.Mass() } finally { g.delete?.() }
}

export function shapeIsValid(oc: any, shape: any): boolean {
  const a = new oc.BRepCheck_Analyzer(shape, true, false)
  try { return !!a.IsValid_2() } finally { a.delete?.() }
}

/**
 * 內核放樣（實體）。wires = TopoDS_Wire（按截面次序）。
 * 回傳 { shape: replicad Shape3D, first, last }，first/last = 首/末端蓋面（TopoDS_Shape，薄壁開口用）。
 */
export function buildLoft(oc: any, rawWires: any[], opts: LoftBuildOpts = {}): { shape: any; first: any; last: any; reversed: boolean[] } {
  if (rawWires.length < 2 && !(rawWires.length >= 1 && opts.capPoint)) throw new Error(LOFT_MSG.tooFew)
  const frames = checkLoftSections(oc, rawWires)
  // 封口點當一個冇法向嘅偽截面參與行進方向計算（單截面 + 封口點時方向先有意義）
  let wires: any[], reversed: boolean[]
  if (opts.capPoint) {
    const cap = { c: opts.capPoint, n: [0, 0, 0] as V3 }
    const fr = opts.capEnd === 'first' ? [cap, ...frames] : [...frames, cap]
    const fl = loftReverseFlags(fr)
    reversed = opts.capEnd === 'first' ? fl.slice(1) : fl.slice(0, -1)
    wires = rawWires.map((w, i) => reversed[i] ? asWire(oc, w.Reversed()) : w)
  } else ({ wires, reversed } = alignLoftWires(oc, rawWires, frames))
  let ts: any = null, prog: any = null, vtx: any = null
  try {
    ts = new oc.BRepOffsetAPI_ThruSections(true, !!opts.ruled, 1e-6)
    ts.CheckCompatibility(true)
    if (opts.continuity && !opts.ruled) {
      ts.SetSmoothing(true)
      ts.SetContinuity(oc.GeomAbs_Shape['GeomAbs_' + opts.continuity])
    }
    if (opts.capPoint) {
      const p = new oc.gp_Pnt_3(opts.capPoint[0], opts.capPoint[1], opts.capPoint[2])
      const mv = new oc.BRepBuilderAPI_MakeVertex(p)
      vtx = mv.Vertex(); p.delete?.(); mv.delete?.()
    }
    if (vtx && opts.capEnd === 'first') ts.AddVertex(vtx)
    for (const w of wires) ts.AddWire(w)
    if (vtx && opts.capEnd !== 'first') ts.AddVertex(vtx)
    prog = new oc.Message_ProgressRange_1()
    try { ts.Build(prog) } catch { throw new Error(LOFT_MSG.build) }
    if (ts.IsDone && !ts.IsDone()) throw new Error(LOFT_MSG.build)
    const sh = ts.Shape()
    if (!sh || sh.IsNull()) throw new Error(LOFT_MSG.build)
    const vol = shapeVolume(oc, sh)
    if (!Number.isFinite(vol) || Math.abs(vol) < 1e-9) throw new Error(LOFT_MSG.invalid)
    if (!shapeIsValid(oc, sh)) throw new Error(LOFT_MSG.invalid)
    let first: any = null, last: any = null
    try { first = ts.FirstShape() } catch { /* 封口點端冇蓋面 */ }
    try { last = ts.LastShape() } catch { /* */ }
    return { shape: cast(sh), first, last, reversed }
  } finally {
    prog?.delete?.()
    // ts 保留到 FirstShape/LastShape 取完；TopoDS 句柄獨立於 builder，可以安全釋放 builder
    ts?.delete?.()
  }
}

/**
 * 導軌（截面平移跟隨）：每個截面喺世界 XY 平移 (dx,dy)，令截面邊界喺「形心→導軌點」方向嘅最遠點掂到導軌點。
 * 支援任何朝向嘅截面（用截面 3D 取樣點投影到 XY）。回傳每截面平移量。
 */
export function railFollowOffsets(loops: V3[][], rail: [number, number][]): V3[] {
  return loops.map((pts, i) => {
    const rp = rail[i]
    if (!rp || !pts.length) return [0, 0, 0]
    const cx = pts.reduce((t, q) => t + q[0], 0) / pts.length, cy = pts.reduce((t, q) => t + q[1], 0) / pts.length
    const vx = rp[0] - cx, vy = rp[1] - cy, L = Math.hypot(vx, vy)
    if (L < 1e-9) return [0, 0, 0]
    const ux = vx / L, uy = vy / L
    let best = -Infinity, bx = cx, by = cy
    for (const q of pts) { const pr = q[0] * ux + q[1] * uy; if (pr > best) { best = pr; bx = q[0]; by = q[1] } }
    return [rp[0] - bx, rp[1] - by, 0]
  })
}

export function translateWire(oc: any, wire: any, d: V3): any {
  if (Math.abs(d[0]) < 1e-12 && Math.abs(d[1]) < 1e-12 && Math.abs(d[2]) < 1e-12) return wire
  const t = new oc.gp_Trsf_1()
  const v = new oc.gp_Vec_4(d[0], d[1], d[2])
  try {
    t.SetTranslation_1(v)
    const tf = new oc.BRepBuilderAPI_Transform_2(wire, t, true)
    const out = asWire(oc, tf.Shape())
    tf.delete?.()
    return out
  } finally { t.delete?.(); v.delete?.() }
}

/** 薄壁：揀要開口嘅端蓋面（末端優先，失敗再試首端）。回傳 replicad FaceFinder 過濾函數。 */
export function capFaceFinder(cap: any): ((ff: any) => any) | null {
  if (!cap || cap.IsNull?.()) return null
  return (ff: any) => ff.when(({ element }: any) => !!element?.wrapped?.IsSame?.(cap))
}

/** 平面截面 wire 向內偏移 d（2D MakeOffset，圓角接駁）。用面積判斷方向：結果面積必須細過原截面，否則反方向再試。
 *  失敗 / 退化（太薄、偏移後消失）→ null。 */
export function insetPlanarWire(oc: any, wire: any, d: number): any | null {
  const area0 = loopFrame(sampleWirePts(oc, wire, 96)).area
  for (const sign of [-1, 1]) {
    let mo: any = null
    try {
      mo = new oc.BRepOffsetAPI_MakeOffset_3(wire, oc.GeomAbs_JoinType.GeomAbs_Arc, false)
      mo.Perform(sign * d, 0)
      if (mo.IsDone && !mo.IsDone()) continue
      const sh = mo.Shape()
      if (!sh || sh.IsNull()) continue
      const exp = new oc.TopExp_Explorer_2(sh, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE)
      const wires: any[] = []
      for (; exp.More(); exp.Next()) wires.push(oc.TopoDS.Wire_1(exp.Current()))
      exp.delete?.()
      if (wires.length !== 1) continue
      const area = loopFrame(sampleWirePts(oc, wires[0], 96)).area
      if (area > 1e-6 && area < area0 - 1e-9) return wires[0]
    } catch { /* 試另一方向 */ } finally { mo?.delete?.() }
  }
  return null
}
