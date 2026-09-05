// M5 圓角識別 / 壓平 / 重施（Mesh→B-rep 逆向工程，_mesh2brep_plan.md Phase A / M5）—— 2026-07-25
// ════════════════════════════════════════════════════════════════════════════════════════════
// 機械件幾乎必有圓角，但【逆向出嚟嘅圓角帶】係最冇用嘅一種面：佢係一條窄長曲面條，
//  ① 令相鄰兩張面嘅邊界變成「兩條相切線」而唔係一條利邊 → direct-edit（pushpull/moveface）冇
//     基準可以郁；
//  ② 佢冇參數（改半徑 = 重新逆向成個件）；
//  ③ Fusion / Design X 嘅做法一律係：認出圓角 → 壓平返利邊 → 用【真圓角 feature】重施。
// 呢個模組就係做呢件事：
//   recoverFillets(seg)  → 認 blend 帶 + 揀返兩張支撐面 + 算返【壓平後嘅利邊】解析曲線 + 半徑
//   ↳ .suppress 直接餵 edgeReconstruct.planTier2({ suppress }) → M4 會把 blend 帶嘅三角【分派返】
//     兩張支撐面（喺圓角脊線切開），跟住兩張面嘅邊界由【解析求交】算，自動就係「延伸到利邊」。
//   reapplyFillets(OC, sharpSolid, strips) → 喺重建好嘅利邊實體上揀返嗰條邊，行真
//     BRepFilletAPI_MakeFillet → 出返一個【參數化、可改半徑、可壓平】嘅 timeline 圓角。
//
// ★ 三條硬教訓 ★
//  1. 【唔可以淨睇 isBlend】：M1 嘅 isBlend 係「窄 + 恆曲率 + ≥2 鄰面」嘅啟發式，內核鑲嵌喺交線
//     附近切出嘅細碎柱面條都會中招（實測 oblique_boss 曾經有個 80° 弧、面積 6.09 嘅假 blend）。
//     所以呢度一定要再過【相切閘】：blend 帶同支撐面喺共用邊上法向要平行（G1），唔係就唔認。
//  2. 【支撐面要揀共用邊最多嗰兩張】：圓角帶嘅兩頭仲會掂到端面（唔相切），順住 adjacency 亂揀
//     就會壓錯面。
//  3. 【壓平唔可以「刪咗佢算數」】：直接掉走 blend 帶會令兩張支撐面之間出現一條【冇鄰面】嘅自由
//     邊，M4 會即刻 declined。正路係把三角分派返兩邊（脊線切開），等解析求交自己出利邊。
//
// 純計算（recoverFillets 零內核）；reapplyFillets 先入內核，每個返回值即刻 IsNull 檢查。
// 驗收：tests/mesh2brep-tier2.mjs（filleted_box：r=4.000 認返 + 壓平體積 24000 + 重施體積對數）

import type { SegmentationResult, PrimitiveParams } from './primitiveFit.ts'
import type { Vec3 } from './meshSegment.ts'
import type { OCModule, OCShape } from './brepRebuild.ts'
import type { BlendSuppression, Tier2Curve } from './edgeReconstruct.ts'
import { intersectSurfaces, curvePointAt, curveParamOf, surfValue, surfGrad } from './edgeReconstruct.ts'

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x)
const DEG = 180 / Math.PI

// ═══════════════════════════════════ 輸出合約 ═══════════════════════════════════

/** 壓平後嘅利邊（= 重施圓角時要揀嘅嗰條邊）。 */
export interface SharpEdgeSpec {
  curve: Tier2Curve
  /** 沿曲線嘅參數範圍（由圓角帶嘅覆蓋範圍投影出嚟）。 */
  tMin: number
  tMax: number
  from: Vec3
  to: Vec3
  /** 中點 —— 重施圓角時靠佢喺實體上揀返條邊。 */
  mid: Vec3
}

export interface FilletStrip {
  /** M1 區序號（圓角帶本身）。 */
  region: number
  /** 兩張支撐區（M1 區序號）。 */
  supports: [number, number]
  kind: 'cylinder' | 'torus'
  /** 圓角半徑（constant-radius）。 */
  radius: number
  /** 凸圓角（外角倒圓）= true；凹圓角（內角補肉）= false。 */
  convex: boolean
  arcDeg: number
  area: number
  triCount: number
  /** 相切閘讀數（°，兩張支撐面各一個；越接近 0 越似真圓角）。 */
  tangencyDeg: [number, number]
  /** 交叉核對：支撐面到圓角軸/脊嘅距離 vs 半徑嘅相對誤差（理論 = 0）。 */
  radiusCheck: [number, number]
  sharpEdge: SharpEdgeSpec | null
  note: string
}

export interface FilletRecovery {
  strips: FilletStrip[]
  /** 直接餵 planTier2({ suppress }) / reconstructTier2。 */
  suppress: BlendSuppression
  warnings: string[]
  stats: { candidates: number; accepted: number; rejected: number }
}

export interface FilletRecoverOptions {
  /** 相切閘（°）。默認 8。 */
  tangentTolDeg?: number
  /** 圓角帶面積佔比上限（太大 = 佢係主體面，唔係圓角）。默認 0.25。 */
  maxAreaFrac?: number
  /** 圓角半徑上限（相對包圍盒對角）。默認 0.25。 */
  maxRadiusFrac?: number
  /** 除咗 M1 嘅 isBlend，仲收「窄弧柱面 + 兩張相切鄰面」嘅候選。默認 true。 */
  includeUnflaggedStrips?: boolean
}

// ═══════════════════════════════════ 識別 ═══════════════════════════════════

const edgeKey = (a: number, b: number, nv: number): number => (a < b ? a * nv + b : b * nv + a)

/** 邊 → 相鄰三角（搵共用邊 + 對面區用）。 */
function buildEdgeTris(seg: SegmentationResult): Map<number, number[]> {
  const nv = seg.verts.length / 3
  const m = new Map<number, number[]>()
  const nt = seg.tris.length / 3
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 3; k++) {
      const a = seg.tris[t * 3 + k], b = seg.tris[t * 3 + (k + 1) % 3]
      if (a === b) continue
      const key = edgeKey(a, b, nv)
      const arr = m.get(key)
      if (arr) arr.push(t); else m.set(key, [t])
    }
  }
  return m
}

/** 兩張面喺點 p 嘅法向夾角（°，唔理符號）—— G1 相切 = 0。 */
function tangencyDeg(a: PrimitiveParams, b: PrimitiveParams, p: Vec3): number {
  const ga = surfGrad(a, p), gb = surfGrad(b, p)
  if (!ga || !gb) return 180
  return Math.acos(clamp(Math.abs(dot3(ga, gb)), 0, 1)) * DEG
}

/**
 * 認圓角帶 + 揀支撐面 + 算壓平後嘅利邊。純計算（零內核）。
 * 判據次序：候選（isBlend / 窄弧柱面）→ 面積閘 → 半徑閘 → 相切閘（★ 最關鍵）→ 支撐面求交出利邊。
 */
export function recoverFillets(seg: SegmentationResult, opts: FilletRecoverOptions = {}): FilletRecovery {
  const warnings: string[] = []
  const strips: FilletStrip[] = []
  const tangTol = opts.tangentTolDeg ?? 8
  const maxAreaFrac = opts.maxAreaFrac ?? 0.25
  const maxRadiusFrac = opts.maxRadiusFrac ?? 0.25
  const nv = seg.verts.length / 3
  const R = seg.regions
  const totalArea = R.reduce((s, r) => s + r.area, 0) || 1
  const edgeTris = buildEdgeTris(seg)
  const P = (vi: number): Vec3 => [seg.verts[vi * 3], seg.verts[vi * 3 + 1], seg.verts[vi * 3 + 2]]

  let candidates = 0, rejected = 0
  for (const reg of R) {
    const prm = reg.paramsSnapped
    if (prm.kind !== 'cylinder' && prm.kind !== 'torus') continue
    const radius = prm.kind === 'cylinder' ? prm.radius : prm.minorRadius
    const flagged = reg.isBlend === true
    const narrow = prm.kind === 'cylinder' && !prm.full && (reg.arcCoverageDeg ?? 360) < 180
    if (!flagged && !(opts.includeUnflaggedStrips ?? true ? narrow || prm.kind === 'torus' : false)) continue
    candidates++

    const reject = (why: string): void => { rejected++; warnings.push(`區 ${reg.index}（r=${radius.toFixed(3)}）唔算圓角：${why}`) }
    if (!(radius > 0) || radius > seg.diag * maxRadiusFrac) { reject(`半徑 ${radius.toFixed(3)} 出界`); continue }
    if (reg.area > totalArea * maxAreaFrac) { reject(`面積佔比 ${(reg.area / totalArea * 100).toFixed(1)}% 太大（似係主體面）`); continue }

    // ── 共用邊統計（順手攞相切讀數）──
    interface NbInfo { region: number; edges: number; tangSum: number; pts: Vec3[] }
    const nbs = new Map<number, NbInfo>()
    for (const t of reg.triIndices) {
      for (let k = 0; k < 3; k++) {
        const a = seg.tris[t * 3 + k], b = seg.tris[t * 3 + (k + 1) % 3]
        if (a === b) continue
        for (const t2 of edgeTris.get(edgeKey(a, b, nv)) ?? []) {
          const rj = seg.labels[t2]
          if (rj === reg.index) continue
          let info = nbs.get(rj)
          if (!info) { info = { region: rj, edges: 0, tangSum: 0, pts: [] }; nbs.set(rj, info) }
          const pa = P(a), pb = P(b)
          const mid: Vec3 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]
          info.edges++
          info.tangSum += tangencyDeg(prm, R[rj].paramsSnapped, mid)
          info.pts.push(pa, pb)
        }
      }
    }
    const ranked = [...nbs.values()]
      .map((i) => ({ ...i, tang: i.tangSum / Math.max(1, i.edges) }))
      .filter((i) => R[i.region].kind !== 'freeform')
      .sort((a, b) => b.edges - a.edges)
    const tangent = ranked.filter((i) => i.tang <= tangTol)
    if (tangent.length < 2) { reject(`相切鄰面得 ${tangent.length} 張（要 2；讀數 ${ranked.slice(0, 3).map((i) => i.tang.toFixed(1) + '°').join('/')}）`); continue }
    const [sa, sb] = tangent.slice(0, 2)
    const supA = R[sa.region].paramsSnapped, supB = R[sb.region].paramsSnapped

    // ── 交叉核對：支撐面到圓角【脊/軸】嘅距離應該 = 半徑 ──
    const axisPt: Vec3 = prm.kind === 'cylinder' ? prm.point : prm.centre
    const rc: [number, number] = [
      Math.abs(Math.abs(surfValue(supA, axisPt)) - radius) / radius,
      Math.abs(Math.abs(surfValue(supB, axisPt)) - radius) / radius,
    ]
    if (prm.kind === 'cylinder' && (rc[0] > 0.05 || rc[1] > 0.05))
      warnings.push(`區 ${reg.index}: 支撐面到圓角軸嘅距離同半徑差 ${(Math.max(rc[0], rc[1]) * 100).toFixed(2)}%（可能唔係等半徑圓角）`)

    // ── 壓平後嘅利邊 = 兩張支撐面嘅解析交線 ──
    const brs = intersectSurfaces(supA, supB)
    let sharp: SharpEdgeSpec | null = null
    if (!brs.length) {
      warnings.push(`區 ${reg.index}: 兩張支撐面（${supA.kind}∧${supB.kind}）求唔到解析交線 → 只壓平，冇利邊規格`)
    } else {
      // 揀最貼圓角帶嘅分支；範圍由帶嘅共用邊點投影出嚟
      const probe = [...sa.pts, ...sb.pts]
      let best = 0, bestD = Infinity
      for (let i = 0; i < brs.length; i++) {
        let s = 0
        for (const q of probe) s += Math.abs(surfValue(supA, q)) + dist3(q, curvePointAt(brs[i], curveParamOf(brs[i], q)))
        if (s / probe.length < bestD) { bestD = s / probe.length; best = i }
      }
      const cv = brs[best]
      let tMin = Infinity, tMax = -Infinity
      for (const q of probe) {
        const t = curveParamOf(cv, q)
        if (t < tMin) tMin = t
        if (t > tMax) tMax = t
      }
      if (cv.closed) {
        // 閉合曲線：參數繞圈，min/max 冇意義 → 用覆蓋角判斷（v1 直接攞全圈中點）
        const tm = curveParamOf(cv, probe[0])
        sharp = { curve: cv, tMin: 0, tMax: Math.PI * 2, from: curvePointAt(cv, 0), to: curvePointAt(cv, 0), mid: curvePointAt(cv, tm) }
      } else {
        sharp = { curve: cv, tMin, tMax, from: curvePointAt(cv, tMin), to: curvePointAt(cv, tMax), mid: curvePointAt(cv, (tMin + tMax) / 2) }
      }
    }

    strips.push({
      region: reg.index, supports: [sa.region, sb.region], kind: prm.kind, radius,
      convex: prm.kind === 'cylinder' ? prm.convex : prm.convex,
      arcDeg: reg.arcCoverageDeg ?? 360, area: reg.area, triCount: reg.triCount,
      tangencyDeg: [sa.tang, sb.tang], radiusCheck: rc, sharpEdge: sharp,
      note: flagged ? 'M1 isBlend' : '窄弧補收',
    })
  }

  return {
    strips,
    suppress: { strips: strips.map((s) => ({ region: s.region, supports: s.supports })) },
    warnings,
    stats: { candidates, accepted: strips.length, rejected },
  }
}

// ═══════════════════════════════════ 重施（內核）═══════════════════════════════════

const nonNull = (s: OCShape): OCShape | null => { try { return s && !s.IsNull() ? s : null } catch { return null } }

/**
 * 點到【一條邊】嘅距離：粗掃 + 三分法精修。
 * ★ 唔可以淨係粗掃取 min —— 實測 9 點掃一條 20mm 長嘅直邊，中點會報 1.11mm（= 半格），
 *   一個 1e-4 嘅 pickTol 就會誤判「揀唔到邊」。（BRepExtrema_DistShapeShape 冇綁 point 版，
 *   FitWrapper.DeviationSample 只行 FACE，所以要自己精修。）
 */
function pointEdgeDist(OC: OCModule, edge: OCShape, p: Vec3): number {
  try {
    const ad = new OC.BRepAdaptor_Curve_2(OC.TopoDS.Edge_1(edge))
    const t0 = ad.FirstParameter(), t1 = ad.LastParameter()
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || !(t1 > t0)) return Infinity
    const at = (t: number): number => {
      const q = ad.Value(t)
      return Math.hypot(q.X() - p[0], q.Y() - p[1], q.Z() - p[2])
    }
    const N = 24
    let bt = t0, bd = Infinity
    for (let i = 0; i <= N; i++) {
      const t = t0 + (t1 - t0) * i / N, d = at(t)
      if (d < bd) { bd = d; bt = t }
    }
    let lo = Math.max(t0, bt - (t1 - t0) / N), hi = Math.min(t1, bt + (t1 - t0) / N)
    for (let k = 0; k < 60 && hi - lo > 1e-12; k++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3
      if (at(m1) <= at(m2)) hi = m2; else lo = m1
    }
    return Math.min(bd, at((lo + hi) / 2))
  } catch { return Infinity }
}

/** 邊上取樣點對【解析利邊曲線】嘅最大偏差 —— 確認揀到嘅係同一條幾何，唔係啱啱好經過中點。 */
function edgeOnCurve(OC: OCModule, edge: OCShape, spec: SharpEdgeSpec): number {
  try {
    const ad = new OC.BRepAdaptor_Curve_2(OC.TopoDS.Edge_1(edge))
    const t0 = ad.FirstParameter(), t1 = ad.LastParameter()
    let worst = 0
    for (let i = 0; i <= 8; i++) {
      const q = ad.Value(t0 + (t1 - t0) * i / 8)
      const p: Vec3 = [q.X(), q.Y(), q.Z()]
      worst = Math.max(worst, dist3(p, curvePointAt(spec.curve, curveParamOf(spec.curve, p))))
    }
    return worst
  } catch { return Infinity }
}

export interface ReapplyResult {
  shape: OCShape | null
  applied: number
  requested: number
  warnings: string[]
}

/**
 * 喺【壓平後嘅利邊實體】上重施真圓角 feature。
 * 揀邊靠 strip.sharpEdge.mid（解析利邊中點）—— 因為壓平係由解析求交出嚟，佢一定精確落喺
 * 重建實體嘅嗰條邊上（實測距離 ~1e-12mm）。
 */
export function reapplyFillets(OC: OCModule, shape: OCShape, strips: FilletStrip[], opts: { pickTol?: number } = {}): ReapplyResult {
  const warnings: string[] = []
  const out: ReapplyResult = { shape: null, applied: 0, requested: strips.length, warnings }
  if (!shape || !strips.length) { warnings.push('冇 shape 或者冇圓角規格'); return out }
  const MF = OC.BRepFilletAPI_MakeFillet_2 ?? OC.BRepFilletAPI_MakeFillet_1 ?? OC.BRepFilletAPI_MakeFillet
  if (typeof MF !== 'function') { warnings.push('BRepFilletAPI_MakeFillet 未綁定'); return out }
  const pickTol = opts.pickTol ?? 1e-4

  // 收集全部邊（explorer 會重複返同一條邊 —— 靠 hash 去重，否則同一條邊 Add 兩次會拋）
  const edges: OCShape[] = []
  const seen = new Set<number>()
  try {
    const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_EDGE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
    for (; ex.More(); ex.Next()) {
      const e = ex.Current()
      let h = -1
      try { h = e.HashCode ? e.HashCode(1e9) : -1 } catch { h = -1 }
      if (h >= 0) { if (seen.has(h)) continue; seen.add(h) }
      edges.push(e)
    }
  } catch (e) { warnings.push(`邊列舉失敗 ${(e as Error)?.message ?? e}`); return out }
  if (!edges.length) { warnings.push('實體冇邊'); return out }

  // ctor 逐個簽名試（worker lineage 先例：fillet 通常要第二個 ChFi3d 參數，但唔同 build 有唔同綁法）
  const fShape = OC.ChFi3d_FilletShape?.ChFi3d_Rational ?? 0
  let mk: OCShape | null
  try { mk = new MF(shape, fShape) } catch { try { mk = new MF(shape) } catch (e) { warnings.push(`MakeFillet 構造失敗 ${(e as Error)?.message ?? e}`); return out } }
  if (!mk) { warnings.push('MakeFillet 構造返 null'); return out }

  for (const s of strips) {
    if (!s.sharpEdge) { warnings.push(`區 ${s.region}: 冇利邊規格，跳過`); continue }
    let bestE: OCShape | null = null, bestD = Infinity
    for (const e of edges) {
      // 兩重判據：① 邊要【成條】落喺解析利邊上 ② 利邊中點要落喺呢條邊上
      if (edgeOnCurve(OC, e, s.sharpEdge) > pickTol) continue
      const d = pointEdgeDist(OC, e, s.sharpEdge.mid)
      if (d < bestD) { bestD = d; bestE = e }
    }
    if (!bestE || !(bestD <= pickTol)) { warnings.push(`區 ${s.region}: 喺實體上揀唔到利邊（最近 ${bestD.toExponential(2)}mm > ${pickTol}）`); continue }
    try { mk.Add_2(s.radius, OC.TopoDS.Edge_1(bestE)); out.applied++ }
    catch (e) { warnings.push(`區 ${s.region}: Add(r=${s.radius}) 拋 ${(e as Error)?.message ?? e}`) }
  }
  if (!out.applied) { warnings.push('冇一條邊加得入'); return out }

  try {
    const prog = OC.Message_ProgressRange_1 ? new OC.Message_ProgressRange_1() : undefined
    try { mk.Build(prog) } catch { mk.Build() }
  } catch (e) { warnings.push(`Build 拋 ${(e as Error)?.message ?? e}`); return out }
  try { if (typeof mk.IsDone === 'function' && !mk.IsDone()) { warnings.push('MakeFillet 唔 IsDone'); return out } } catch { /* 冇 IsDone 就算 */ }
  const res = nonNull(mk.Shape())
  if (!res) { warnings.push('MakeFillet 出 null shape'); return out }
  out.shape = res
  return out
}
