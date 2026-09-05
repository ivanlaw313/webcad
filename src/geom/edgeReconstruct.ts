// M4 Tier-2 解析边重建（Mesh→B-rep 逆向工程，_mesh2brep_plan.md Phase A / M4）—— 2026-07-25
// ════════════════════════════════════════════════════════════════════════════════════════════
// M3（brepRebuild.ts）行嘅係【鄰接參數 snap】路線：面同面之間靠「軸向 snap 落鄰接平面」「圓由鄰
// 區柱面參數起」呢啲【專門化】規則對縫。喺 golden 7 件（全部軸對齊 / 面面正交）上係 0.00000%，
// 但一離開軸對齊就冧：斜柱 boss 插落斜面 → 交線係【橢圓】，M3 嘅圓識別失手、柱面淨用 uv 矩形界
// → 縫合出開放殼（實測 3.59% 體積誤差，自由邊 57）。
//
// M4 唔再靠「特例規則」，而係做返 CAD 內核本身嘅嘢：
//   ① 約束 snap 先行（用 M1 嘅 seg.snaps / paramsSnapped）—— 求交【一定要】喺 snap 之後做，
//      否則 0.4998° 嘅誤差會令三面角點解喺歪位，之後點縫都有縫。
//   ② 逐對【解析求交】：plane∧plane=直線、plane∧cyl=圓/橢圓/兩直線、plane∧cone=圓/橢圓、
//      plane∧sphere=圓、共軸二次曲面對=圓 …… 一律出【精確解析曲線】（gp_Lin/gp_Circ/gp_Elips）。
//   ③ 三面角點：3 條隱函數 f=0 嘅 Newton（每個隱函數都係【帶號距離】→ 梯度單位長 → 收斂快而穩），
//      種子用網格角點。同一個角點由邊個面去解都收斂到【同一個根】→ 全域空間去重 → 三張面攞到
//      【逐位相同】嘅坐標 → 縫隙 = 0。
//   ④ 面延伸/裁剪：唔再用網格折線裁，而係用【解析邊砌 wire】再 MakeFace(surface, wire, inside)，
//      即係話面嘅邊界完全由解析交線定義 —— 圓角壓平（M5）之後兩張支撐面自動「延伸到利邊」亦係
//      靠呢一步（見 filletRecover.ts）。
//
// ★ 五條硬教訓（本模組實證，改嘢前睇清楚）★
//  1. 【周期面一定要切半】：柱/錐面畀兩條閉環（例如底橢圓 + 頂圓）夾住嘅時候，OCCT 要 seam 邊先
//     至係合法面。與其靠 ShapeFix_Face.FixMissingSeam 執，不如自己喺 u=0 / u=π 切成兩塊
//     simply-connected patch（接縫 = 母線直邊，兩塊共用），縫完 SewSolidify 內置嘅
//     UnifySameDomain 會自動合返一張 → 面數同 Fusion 一樣。
//  2. 【閉合曲線嘅切點要由「周期宿主」定」】：橢圓自己嘅參數 0 同柱面嘅 u=0 唔係同一點；如果兩
//     邊各切各嘅，接縫母線就唔喺柱面上（變咗弦）→ 面必爆。所以切點永遠由柱/錐嘅 (axis, refU)
//     半平面決定，平面側（孔環）照跟同一組切點。
//  3. 【gp_Lin / gp_Cone / gp_Torus 冇綁定】（實測 typeof === undefined）→ 直線邊行
//     MakeEdge_3(P1,P2)；錐/環面宿主行 FitWrapper.MakeAnalyticFace + BRep_Tool.Surface_2 攞
//     Handle_Geom_Surface 再 MakeFace_21。呢個「借 M2 造面攞 surface handle」嘅路對五種基元通用。
//  4. 【MakeFace(surf, wire, inside) 出嚟嘅面冇 pcurve】→ 一定要跟一次 ShapeFix_Face.Perform()
//     （佢會由 3D 曲線投影補 pcurve）。跟住用【網格面積】做理智閘：面積差 3 倍以上 = 揀錯咗
//     wire 嘅邊，反向再試。
//  5. 【碎片一定要收編】：CAD 內核自己出嘅鑲嵌喺橢圓交線附近會切出 1–2 個三角嘅長條，M1 會擬成
//     「平面」（3 點必共面）→ 唔收編就會多出兩張假面，縫死。判據 = 面積佔比細 + 所有頂點喺鄰組
//     解析面上（曲面鑲嵌頂點係【精確落喺面上】嘅，所以距離判據好硬淨）。
//
// 契約：planTier2() 純邏輯（零內核、零 DOM，Node 直接跑得）；executeTier2() 先入內核，
//       每個 FitWrapper / OCCT 返回值即刻 IsNull 檢查。起唔到 → tier='declined'，上層照跑 M3
//       （零回歸律：Tier-2 只可以係【額外嘅上位選項】，唔可以拖低現有結果）。
// 驗收：tests/mesh2brep-tier2.mjs

import type { SegmentationResult, PrimitiveParams, PrimitiveKind } from './primitiveFit.ts'
import type { Vec3 } from './meshSegment.ts'
import type { OCModule, OCShape } from './brepRebuild.ts'
import { ANALYTIC_KIND } from './brepRebuild.ts'

// ═══════════════════════════════════ 向量小工具 ═══════════════════════════════════

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add3 = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul3 = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const len3 = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
const norm3 = (a: Vec3): Vec3 => { const L = len3(a) || 1; return [a[0] / L, a[1] / L, a[2] / L] }
const dist3 = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const TAU = Math.PI * 2

/** 由方向起確定性正交基（同一個方向永遠出同一個 X）—— refX 唔確定嘅話切點/參數會飄。 */
function frameOf(n: Vec3): { x: Vec3; y: Vec3 } {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2])
  const seed: Vec3 = ax <= ay && ax <= az ? [1, 0, 0] : ay <= az ? [0, 1, 0] : [0, 0, 1]
  const x = norm3(cross3(n, seed))
  return { x, y: norm3(cross3(n, x)) }
}

// ═══════════════════════════════════ 隱函數（帶號距離 + 單位梯度）═══════════════════════════════════

/**
 * 基元嘅隱函數值。五種基元全部寫成【近似帶號距離】（梯度單位長）——
 * Newton 用單位梯度收斂又快又穩，而且殘差可以直接當 mm 讀（診斷用）。
 */
export function surfValue(s: PrimitiveParams, p: Vec3): number {
  switch (s.kind) {
    case 'plane': return dot3(s.normal, p) - s.d
    case 'sphere': return len3(sub3(p, s.centre)) - s.radius
    case 'cylinder': {
      const w = sub3(p, s.point), a = dot3(w, s.axis)
      return len3(sub3(w, mul3(s.axis, a))) - s.radius
    }
    case 'cone': {
      const w = sub3(p, s.apex), a = dot3(w, s.axis)
      const rho = len3(sub3(w, mul3(s.axis, a)))
      const h = s.halfAngleDeg * Math.PI / 180
      return rho * Math.cos(h) - a * Math.sin(h)
    }
    case 'torus': {
      const w = sub3(p, s.centre), a = dot3(w, s.axis)
      const rho = len3(sub3(w, mul3(s.axis, a)))
      return Math.hypot(rho - s.majorRadius, a) - s.minorRadius
    }
    default: return NaN
  }
}

/** 隱函數梯度（單位長；退化位返 null → 上層要換種子/放棄）。 */
export function surfGrad(s: PrimitiveParams, p: Vec3): Vec3 | null {
  switch (s.kind) {
    case 'plane': return s.normal
    case 'sphere': {
      const d = sub3(p, s.centre), L = len3(d)
      return L > 1e-12 ? mul3(d, 1 / L) : null
    }
    case 'cylinder': {
      const w = sub3(p, s.point), a = dot3(w, s.axis)
      const e = sub3(w, mul3(s.axis, a)), L = len3(e)
      return L > 1e-12 ? mul3(e, 1 / L) : null
    }
    case 'cone': {
      const w = sub3(p, s.apex), a = dot3(w, s.axis)
      const e = sub3(w, mul3(s.axis, a)), L = len3(e)
      if (!(L > 1e-12)) return null
      const h = s.halfAngleDeg * Math.PI / 180
      return norm3(sub3(mul3(e, Math.cos(h) / L), mul3(s.axis, Math.sin(h))))
    }
    case 'torus': {
      const w = sub3(p, s.centre), a = dot3(w, s.axis)
      const e = sub3(w, mul3(s.axis, a)), L = len3(e)
      if (!(L > 1e-12)) return null
      const dR = L - s.majorRadius
      const m = Math.hypot(dR, a)
      if (!(m > 1e-12)) return null
      return norm3(add3(mul3(e, dR / L / m), mul3(s.axis, a / m)))
    }
    default: return null
  }
}

// ═══════════════════════════════════ 三面角點 Newton ═══════════════════════════════════

export interface TripleSolveResult { p: Vec3; residual: number; ok: boolean; iterations: number; note: string }

/** 3×3 線性解（Cramer + 條件數守衛）。返 null = 奇異（三面法向共面 = 角點唔唯一）。 */
function solve3(m: number[], rhs: Vec3): Vec3 | null {
  const det = m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])
  if (!(Math.abs(det) > 1e-10)) return null      // 三個【單位】梯度 → det = 混合積，1e-10 ≈ 夾角 < 0.001°
  const inv = 1 / det
  const x = (rhs[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (rhs[1] * m[8] - m[5] * rhs[2]) + m[2] * (rhs[1] * m[7] - m[4] * rhs[2])) * inv
  const y = (m[0] * (rhs[1] * m[8] - m[5] * rhs[2]) - rhs[0] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * rhs[2] - rhs[1] * m[6])) * inv
  const z = (m[0] * (m[4] * rhs[2] - rhs[1] * m[7]) - m[1] * (m[3] * rhs[2] - rhs[1] * m[6]) + rhs[0] * (m[3] * m[7] - m[4] * m[6])) * inv
  return [x, y, z]
}

/**
 * 三面交點（Tier-2 嘅命根）。3 條 f_i(p)=0 嘅 Newton，Jacobian 行 = 各面梯度。
 * 種子用網格角點（一定喺真解附近 ~鑲嵌誤差），所以唔使全域搜索。
 * 步長封頂（diag*0.25）防止近奇異時飛出宇宙；殘差用【mm】判收斂。
 */
export function solveTripleVertex(surfs: [PrimitiveParams, PrimitiveParams, PrimitiveParams], seed: Vec3, diag: number, tol = 1e-9): TripleSolveResult {
  let p: Vec3 = [seed[0], seed[1], seed[2]]
  const maxStep = diag * 0.25
  let res = Infinity
  for (let it = 0; it < 60; it++) {
    const f: Vec3 = [surfValue(surfs[0], p), surfValue(surfs[1], p), surfValue(surfs[2], p)]
    res = Math.max(Math.abs(f[0]), Math.abs(f[1]), Math.abs(f[2]))
    if (!Number.isFinite(res)) return { p, residual: res, ok: false, iterations: it, note: '隱函數返 NaN' }
    if (res <= tol) return { p, residual: res, ok: true, iterations: it, note: '' }
    const g0 = surfGrad(surfs[0], p), g1 = surfGrad(surfs[1], p), g2 = surfGrad(surfs[2], p)
    if (!g0 || !g1 || !g2) return { p, residual: res, ok: false, iterations: it, note: '梯度退化（點喺軸/頂點上）' }
    const step = solve3([g0[0], g0[1], g0[2], g1[0], g1[1], g1[2], g2[0], g2[1], g2[2]], [-f[0], -f[1], -f[2]])
    if (!step) return { p, residual: res, ok: false, iterations: it, note: '三面近乎共面（角點唔唯一）' }
    const L = len3(step)
    const s = L > maxStep ? maxStep / L : 1
    p = add3(p, mul3(step, s))
  }
  return { p, residual: res, ok: res <= tol * 100, iterations: 60, note: res <= tol * 100 ? '收斂慢（放寬 100×）' : 'Newton 唔收斂' }
}

// ═══════════════════════════════════ 解析曲線 ═══════════════════════════════════

export type Tier2CurveKind = 'line' | 'circle' | 'ellipse'

/**
 * 解析交線。
 *  line   : P(t) = origin + t·dir（t = 帶號弧長）
 *  circle : P(t) = centre + r(cos t·refX + sin t·refY)，refY = normal × refX
 *  ellipse: P(t) = centre + majorR·cos t·refX + minorR·sin t·refY（★ OCCT gp_Elips 同款參數化）
 */
export interface Tier2Curve {
  kind: Tier2CurveKind
  origin: Vec3          // line = 線上一點；circle/ellipse = 中心
  dir: Vec3             // line = 單位方向；circle/ellipse = 曲線平面法向
  refX: Vec3            // circle/ellipse = 長軸方向（line 唔用）
  majorR: number
  minorR: number
  closed: boolean       // circle/ellipse = true
  note: string
}

const lineCurve = (o: Vec3, d: Vec3, note: string): Tier2Curve =>
  ({ kind: 'line', origin: o, dir: norm3(d), refX: [1, 0, 0], majorR: 0, minorR: 0, closed: false, note })
const circleCurve = (c: Vec3, n: Vec3, r: number, note: string): Tier2Curve => {
  const nn = norm3(n)
  return { kind: 'circle', origin: c, dir: nn, refX: frameOf(nn).x, majorR: r, minorR: r, closed: true, note }
}
const ellipseCurve = (c: Vec3, n: Vec3, x: Vec3, a: number, b: number, note: string): Tier2Curve => {
  const nn = norm3(n)
  return { kind: 'ellipse', origin: c, dir: nn, refX: norm3(x), majorR: a, minorR: b, closed: true, note }
}

/** 曲線上參數 t 嘅點。 */
export function curvePointAt(c: Tier2Curve, t: number): Vec3 {
  if (c.kind === 'line') return add3(c.origin, mul3(c.dir, t))
  const y = cross3(c.dir, c.refX)
  return add3(c.origin, add3(mul3(c.refX, c.majorR * Math.cos(t)), mul3(y, c.minorR * Math.sin(t))))
}

/** 點 p 喺曲線上嘅參數（唔喺曲線上就係最近點嘅參數近似）。 */
export function curveParamOf(c: Tier2Curve, p: Vec3): number {
  if (c.kind === 'line') return dot3(sub3(p, c.origin), c.dir)
  const y = cross3(c.dir, c.refX)
  const w = sub3(p, c.origin)
  const t = Math.atan2(dot3(w, y) / (c.minorR || 1), dot3(w, c.refX) / (c.majorR || 1))
  return t < 0 ? t + TAU : t
}

/** 點到曲線嘅距離（分支揀選用；橢圓用取樣近似已經夠分辨兩條分支）。 */
function distToCurve(c: Tier2Curve, p: Vec3): number {
  if (c.kind === 'line') {
    const w = sub3(p, c.origin)
    return len3(sub3(w, mul3(c.dir, dot3(w, c.dir))))
  }
  if (c.kind === 'circle') {
    const w = sub3(p, c.origin)
    const a = dot3(w, c.dir)
    const rho = len3(sub3(w, mul3(c.dir, a)))
    return Math.hypot(rho - c.majorR, a)
  }
  let best = Infinity
  const t0 = curveParamOf(c, p)
  for (let k = -4; k <= 4; k++) {
    const d = dist3(p, curvePointAt(c, t0 + k * 0.02))
    if (d < best) best = d
  }
  return best
}

const AX_TOL = 1e-7          // 軸平行/垂直判據（snap 之後應該係機器精度）

/**
 * 兩張解析面嘅【全部交線分支】。冇支援嘅組合返空陣（上層 → declined，退返 M3）。
 * ★ 一定要喺 M1 約束 snap 之後先叫 —— 呢度做嘅係精確幾何，垃圾入 = 垃圾出。
 */
export function intersectSurfaces(a: PrimitiveParams, b: PrimitiveParams): Tier2Curve[] {
  if (a.kind === 'freeform' || b.kind === 'freeform') return []
  // 平面永遠放第一位（下面全部規則都係「平面 × 乜」）
  if (b.kind === 'plane' && a.kind !== 'plane') return intersectSurfaces(b, a)

  if (a.kind === 'plane' && b.kind === 'plane') {
    const d = cross3(a.normal, b.normal)
    const L = len3(d)
    if (L < AX_TOL) return []                                  // 平行 / 重合
    // 線上一點：解 n1·p=d1, n2·p=d2, dir·p=0（第三條純粹係揀個確定嘅代表點）
    const dir = mul3(d, 1 / L)
    const p = solve3([a.normal[0], a.normal[1], a.normal[2], b.normal[0], b.normal[1], b.normal[2], dir[0], dir[1], dir[2]], [a.d, b.d, 0])
    return p ? [lineCurve(p, dir, 'plane∧plane')] : []
  }

  if (a.kind === 'plane' && b.kind === 'sphere') {
    const h = dot3(a.normal, b.centre) - a.d
    const rr = b.radius * b.radius - h * h
    if (!(rr > 1e-18)) return []
    return [circleCurve(sub3(b.centre, mul3(a.normal, h)), a.normal, Math.sqrt(rr), 'plane∧sphere')]
  }

  if (a.kind === 'plane' && b.kind === 'cylinder') {
    const c = dot3(a.normal, b.axis)
    if (Math.abs(c) > 1 - AX_TOL) {
      // 軸 ⟂ 平面 → 正圓（最常見：孔/凸台嘅端面）
      const t = (a.d - dot3(a.normal, b.point)) / c
      return [circleCurve(add3(b.point, mul3(b.axis, t)), b.axis, b.radius, 'plane⟂cyl → circle')]
    }
    if (Math.abs(c) < AX_TOL) {
      // 軸 ∥ 平面 → 0/1/2 條母線（切面 = 1 條，本模組當退化唔用）
      const hs = dot3(a.normal, b.point) - a.d
      const rr = b.radius * b.radius - hs * hs
      if (!(rr > 1e-12)) return []
      const s = Math.sqrt(rr)
      const w = norm3(cross3(b.axis, a.normal))
      const q0 = sub3(b.point, mul3(a.normal, hs))
      return [
        lineCurve(add3(q0, mul3(w, s)), b.axis, 'plane∥cyl → line+'),
        lineCurve(sub3(q0, mul3(w, s)), b.axis, 'plane∥cyl → line−'),
      ]
    }
    // 斜切 → 橢圓：短軸 = r（沿 n×a 方向），長軸 = r/|n·a|
    const t = (a.d - dot3(a.normal, b.point)) / c
    const centre = add3(b.point, mul3(b.axis, t))
    const minorDir = norm3(cross3(a.normal, b.axis))
    const majorDir = norm3(cross3(minorDir, a.normal))
    return [ellipseCurve(centre, a.normal, majorDir, b.radius / Math.abs(c), b.radius, 'plane∠cyl → ellipse')]
  }

  if (a.kind === 'plane' && b.kind === 'cone') {
    const c = dot3(a.normal, b.axis)
    const half = b.halfAngleDeg * Math.PI / 180
    if (Math.abs(c) > 1 - AX_TOL) {
      // ★ M1 嘅 ConeParams 係【半錐】（axis 由頂點指向材料嗰邊，surfValue 帶號）——
      //   t < 0 即係交喺【鏡像嗰葉】上，實體上根本冇呢個圓，一定要拒（唔係就會出條假邊）。
      const t = (a.d - dot3(a.normal, b.apex)) / c
      const r = t * Math.tan(half)
      if (!(r > 1e-12)) return []
      return [circleCurve(add3(b.apex, mul3(b.axis, t)), b.axis, r, 'plane⟂cone → circle')]
    }
    // 一般斜切：|n·a| > sin(半角) 先至係橢圓（否則拋物線/雙曲線 —— v1 唔支援）
    if (Math.abs(c) <= Math.sin(half) + 1e-9) return []
    return coneEllipse(a.normal, a.d, b.apex, b.axis, half)
  }

  if (a.kind === 'plane' && b.kind === 'torus') {
    const c = dot3(a.normal, b.axis)
    if (Math.abs(c) > 1 - AX_TOL) {
      const h = dot3(a.normal, b.centre) - a.d          // 平面沿軸距環心（帶號，n 指向）
      const rr = b.minorRadius * b.minorRadius - h * h
      if (!(rr > 1e-18)) return []
      const dr = Math.sqrt(rr)
      const centre = sub3(b.centre, mul3(a.normal, h))
      const out: Tier2Curve[] = [circleCurve(centre, b.axis, b.majorRadius + dr, 'plane⟂torus → circle+')]
      if (b.majorRadius - dr > 1e-9) out.push(circleCurve(centre, b.axis, b.majorRadius - dr, 'plane⟂torus → circle−'))
      return out
    }
    if (Math.abs(c) < AX_TOL && Math.abs(dot3(a.normal, b.centre) - a.d) < 1e-7) {
      // 平面含軸 → 兩個截面圓（半徑 = minor）
      const u = norm3(cross3(a.normal, b.axis))
      return [
        circleCurve(add3(b.centre, mul3(u, b.majorRadius)), a.normal, b.minorRadius, 'plane∋axis torus → circle+'),
        circleCurve(sub3(b.centre, mul3(u, b.majorRadius)), a.normal, b.minorRadius, 'plane∋axis torus → circle−'),
      ]
    }
    return []
  }

  // ── 非平面對：v1 只做【共軸】（圓角帶 / 階梯軸 / 球端 全部落喺呢度）──
  if (a.kind === 'sphere' && b.kind === 'sphere') {
    const w = sub3(b.centre, a.centre), D = len3(w)
    if (!(D > 1e-12)) return []
    const x = (D * D + a.radius * a.radius - b.radius * b.radius) / (2 * D)
    const rr = a.radius * a.radius - x * x
    if (!(rr > 1e-18)) return []
    return [circleCurve(add3(a.centre, mul3(w, x / D)), w, Math.sqrt(rr), 'sphere∧sphere')]
  }
  const axA = axisOf(a), axB = axisOf(b)
  if (axA && axB) {
    if (Math.abs(dot3(axA.dir, axB.dir)) < 1 - AX_TOL) return []          // 唔平行 → v1 唔做
    const w = sub3(axB.pt, axA.pt)
    const off = len3(sub3(w, mul3(axA.dir, dot3(w, axA.dir))))
    if (off > 1e-6) return []                                             // 平行但唔共軸 → v1 唔做
    return coaxialIntersect(a, b, axA.dir, axA.pt)
  }
  if (axA && b.kind === 'sphere') {
    const w = sub3(b.centre, axA.pt)
    const off = len3(sub3(w, mul3(axA.dir, dot3(w, axA.dir))))
    if (off > 1e-6) return []
    return coaxialIntersect(a, b, axA.dir, axA.pt)
  }
  if (a.kind === 'sphere' && axB) return intersectSurfaces(b, a)
  return []
}

/** 基元嘅特徵方向（平面 = 法向，其餘 = 軸）。冇方向（球/自由曲面）→ null。 */
function dirOfSurf(s: PrimitiveParams): Vec3 | null {
  switch (s.kind) {
    case 'plane': return s.normal
    case 'cylinder': case 'cone': case 'torus': return s.axis
    default: return null
  }
}

/** 有軸嘅基元 → (方向, 軸上一點)。 */
function axisOf(s: PrimitiveParams): { dir: Vec3; pt: Vec3 } | null {
  switch (s.kind) {
    case 'cylinder': return { dir: s.axis, pt: s.point }
    case 'cone': return { dir: s.axis, pt: s.apex }
    case 'torus': return { dir: s.axis, pt: s.centre }
    default: return null
  }
}

/** 共軸二次曲面對 → 圓（全部都係「解 ρ(h) 相等」嘅一維問題）。 */
function coaxialIntersect(a: PrimitiveParams, b: PrimitiveParams, axis: Vec3, origin: Vec3): Tier2Curve[] {
  // 統一寫成「沿軸座標 h → 半徑 ρ」，兩條 ρ 曲線相交 = 交圓
  const hOf = (p: Vec3): number => dot3(sub3(p, origin), axis)
  const at = (h: number): Vec3 => add3(origin, mul3(axis, h))
  const out: Tier2Curve[] = []
  const push = (h: number, r: number, note: string): void => { if (r > 1e-9 && Number.isFinite(h)) out.push(circleCurve(at(h), axis, r, note)) }
  const kinds = `${a.kind}|${b.kind}`
  if (kinds === 'cylinder|cone' || kinds === 'cone|cylinder') {
    const cy = (a.kind === 'cylinder' ? a : b) as Extract<PrimitiveParams, { kind: 'cylinder' }>
    const co = (a.kind === 'cone' ? a : b) as Extract<PrimitiveParams, { kind: 'cone' }>
    const tan = Math.tan(co.halfAngleDeg * Math.PI / 180)
    if (!(tan > 1e-9)) return []
    const hApex = hOf(co.apex)
    const s = dot3(co.axis, axis) >= 0 ? 1 : -1
    push(hApex + s * cy.radius / tan, cy.radius, 'coaxial cyl∧cone')
    return out
  }
  if (kinds === 'cylinder|sphere' || kinds === 'sphere|cylinder') {
    const cy = (a.kind === 'cylinder' ? a : b) as Extract<PrimitiveParams, { kind: 'cylinder' }>
    const sp = (a.kind === 'sphere' ? a : b) as Extract<PrimitiveParams, { kind: 'sphere' }>
    const rr = sp.radius * sp.radius - cy.radius * cy.radius
    if (!(rr > 1e-18)) return []
    const h0 = hOf(sp.centre), dh = Math.sqrt(rr)
    push(h0 + dh, cy.radius, 'coaxial cyl∧sphere+')
    push(h0 - dh, cy.radius, 'coaxial cyl∧sphere−')
    return out
  }
  if (kinds === 'cylinder|torus' || kinds === 'torus|cylinder') {
    const cy = (a.kind === 'cylinder' ? a : b) as Extract<PrimitiveParams, { kind: 'cylinder' }>
    const to = (a.kind === 'torus' ? a : b) as Extract<PrimitiveParams, { kind: 'torus' }>
    const dd = to.minorRadius * to.minorRadius - (cy.radius - to.majorRadius) * (cy.radius - to.majorRadius)
    if (!(dd > 1e-18)) return []
    const h0 = hOf(to.centre), dh = Math.sqrt(dd)
    push(h0 + dh, cy.radius, 'coaxial cyl∧torus+')
    push(h0 - dh, cy.radius, 'coaxial cyl∧torus−')
    return out
  }
  if (kinds === 'cone|torus' || kinds === 'torus|cone') return []          // v1 唔做（要解四次）
  if (kinds === 'cone|sphere' || kinds === 'sphere|cone') {
    const co = (a.kind === 'cone' ? a : b) as Extract<PrimitiveParams, { kind: 'cone' }>
    const sp = (a.kind === 'sphere' ? a : b) as Extract<PrimitiveParams, { kind: 'sphere' }>
    // 錐面上點：ρ = (h−hApex)·tanα（★ 半錐：只有材料嗰邊算數）；球：ρ² + (h−h0)² = R²
    const tan = Math.tan(co.halfAngleDeg * Math.PI / 180)
    const hA = hOf(co.apex), h0 = hOf(sp.centre)
    const s = dot3(co.axis, axis) >= 0 ? 1 : -1
    const A = 1 + tan * tan
    const B = -2 * (h0 + tan * tan * hA)
    const C = h0 * h0 + tan * tan * hA * hA - sp.radius * sp.radius
    const disc = B * B - 4 * A * C
    if (!(disc > 0)) return []
    for (const sgn of [1, -1]) {
      const h = (-B + sgn * Math.sqrt(disc)) / (2 * A)
      const along = (h - hA) * s                                  // 距頂點嘅【材料側】距離
      if (!(along > 1e-12)) continue                              // 鏡像嗰葉 → 實體上冇呢個圓
      push(h, along * tan, `coaxial cone∧sphere${sgn > 0 ? '+' : '−'}`)
    }
    return out
  }
  return []
}

/**
 * 錐 × 斜平面 → 橢圓。走【平面內二次型】路：把錐嘅隱式二次型 F(p)=((p−apex)·a)² − cos²α|p−apex|²
 * 限制喺平面基 (e1,e2) 上 → 2D 圓錐曲線 → 特徵分解攞中心/長短軸。
 * （直接寫 Dandelin 公式都得，但二次型路對「錐軸同平面法向任意夾角」冇 case 分支，唔易寫錯。）
 */
function coneEllipse(n: Vec3, d: number, apex: Vec3, axis: Vec3, half: number): Tier2Curve[] {
  const ca = Math.cos(half), c2 = ca * ca
  // M = aaᵀ − cos²α·I（對稱）
  const M = [
    axis[0] * axis[0] - c2, axis[0] * axis[1], axis[0] * axis[2],
    axis[1] * axis[0], axis[1] * axis[1] - c2, axis[1] * axis[2],
    axis[2] * axis[0], axis[2] * axis[1], axis[2] * axis[2] - c2,
  ]
  const mv = (v: Vec3): Vec3 => [
    M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
    M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
    M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
  ]
  const { x: e1, y: e2 } = frameOf(n)
  const O2: Vec3 = mul3(n, d)                                // 平面上原點（n 單位長 → n·O = d ✓）
  const w0 = sub3(O2, apex)
  const a11 = dot3(e1, mv(e1)), a12 = dot3(e1, mv(e2)), a22 = dot3(e2, mv(e2))
  const b1 = dot3(e1, mv(w0)), b2 = dot3(e2, mv(w0))
  const f0 = dot3(w0, mv(w0))
  // 中心：[[a11,a12],[a12,a22]]·x = −b
  const det = a11 * a22 - a12 * a12
  if (!(Math.abs(det) > 1e-12)) return []
  const cx = (-b1 * a22 + b2 * a12) / det
  const cy = (-b2 * a11 + b1 * a12) / det
  const fc = f0 + b1 * cx + b2 * cy                        // 平移後常數項
  // 2×2 對稱特徵分解
  const tr = a11 + a22, dt = det
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - dt))
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc
  if (!(l1 * l2 > 0) || !(fc * l1 < 0)) return []          // 唔係橢圓（雙曲/虛）
  const s1 = Math.sqrt(-fc / l1), s2 = Math.sqrt(-fc / l2)
  // l1 對應嘅特徵向量
  let ev: [number, number] = Math.abs(a12) > 1e-14 ? [l1 - a22, a12] : [1, 0]
  const evL = Math.hypot(ev[0], ev[1]) || 1
  ev = [ev[0] / evL, ev[1] / evL]
  const centre = add3(O2, add3(mul3(e1, cx), mul3(e2, cy)))
  // ★ 二次型 M 描述嘅係【雙葉】錐；M1 嘅 ConeParams 係半錐 → 橢圓中心要喺材料嗰邊，否則實體上冇呢條邊
  if (!(dot3(sub3(centre, apex), axis) > 1e-12)) return []
  const dirA = norm3(add3(mul3(e1, ev[0]), mul3(e2, ev[1])))
  const dirB = norm3(cross3(n, dirA))
  return s1 >= s2
    ? [ellipseCurve(centre, n, dirA, s1, s2, 'plane∠cone → ellipse')]
    : [ellipseCurve(centre, n, dirB, s2, s1, 'plane∠cone → ellipse')]
}

// ═══════════════════════════════════ 計劃資料結構 ═══════════════════════════════════

/** M5（filletRecover）交嚟嘅圓角壓平指令：把圓角帶區嘅三角【分派返】兩張支撐面。 */
export interface BlendSuppression {
  /** 要壓平嘅 M1 區序號 → 兩張支撐區序號。 */
  strips: { region: number; supports: [number, number] }[]
}

export interface Tier2Arc {
  curve: number            // Tier2Plan.curves 索引
  vStart: number           // Tier2Plan.vertices 索引（-1 = 閉合曲線，全條用）
  vEnd: number
  tStart: number           // 曲線參數（closed 時 = 0）
  tEnd: number
  neighbour: number        // 對面嗰個 group（-1 = 網格開口）
  seam: boolean            // 人造 seam 邊（周期面切半用，唔係真交線）
}

export interface Tier2Loop { arcs: Tier2Arc[]; isOuter: boolean; area: number; ring: boolean }

export interface Tier2Face {
  group: number
  kind: PrimitiveKind
  surf: PrimitiveParams
  /**
   * 'wire'   = 解析邊砌 wire 再 MakeFace(surface, wire, inside)（Tier-2 正路）
   * 'uvRect' = 柱/錐面嘅環【全部都係共軸正圓】→ 直接用 uv 矩形界（M3 已證嘅路，慳一次切半，
   *            而且鑽尖（單環錐）呢類「環數 ≠ 2」嘅情況只有呢條路行得通）
   */
  build: 'wire' | 'uvRect'
  /** MakeAnalyticFace 嘅 params（M2 合約排位）。 */
  hostParams: number[]
  /** build==='uvRect' 時嘅 [u0,u1,v0,v1]。 */
  uvBounds: number[]
  loops: Tier2Loop[]
  meshArea: number
  regions: number[]
  triCount: number
  /** 周期面切半出嚟嘅仔面（同一個 group 會有 2 條記錄）。 */
  patch: number
  note: string
}

export interface Tier2Vertex { p: Vec3; residual: number; ok: boolean; note: string }

export interface Tier2Plan {
  faces: Tier2Face[]
  curves: Tier2Curve[]
  vertices: Tier2Vertex[]
  declined: boolean
  reasons: string[]
  warnings: string[]
  sewTol: number
  diag: number
  stats: {
    groups: number; coalesced: number; absorbedRegions: number; suppressedStrips: number
    lines: number; circles: number; ellipses: number; seams: number
    corners: number; maxVertexResidual: number
    /** M1 已施加嘅約束 snap 條數（Tier-2 完全靠佢 —— 求交一定要喺 snap 之後做）。 */
    snapsApplied: number
    /** 應該 snap 但未 snap 嘅面對之中最大嗰個偏差（°）。> 0 = 交線會歪，落面角點會累積。 */
    worstUnsnappedDeg: number
  }
}

export type Tier2Tier = 'solid' | 'shell' | 'failed' | 'declined'

export interface Tier2Result {
  shape: OCShape | null
  tier: Tier2Tier
  faceCount: number
  valid: boolean | null
  deviation: { max: number; mean: number; samples: number }
  warnings: string[]
  plan: Tier2Plan
  msPlan: number
  msBuild: number
}

export interface Tier2Options {
  /** 縫合容差。默認 max(diag*1e-6, 1e-6)。 */
  sewTol?: number
  /** 三面角點 Newton 收斂判據（mm）。默認 max(diag*1e-12, 1e-10)。 */
  vertexTol?: number
  /** 碎片收編：面積佔比上限。默認 0.02。 */
  absorbAreaFrac?: number
  /** 碎片收編：頂點到宿主面嘅距離上限。默認 max(diag*5e-4, 1e-6)。 */
  absorbTol?: number
  /** 頂點空間去重容差。默認 diag*1e-7。 */
  vertexMergeTol?: number
  /** 面數上限（保險絲）。默認 2000。 */
  maxFaces?: number
  /** M5 圓角壓平。 */
  suppress?: BlendSuppression
  /** 偏差取樣點數。默認 400。 */
  deviationSamples?: number
}

// ═══════════════════════════════════ 分組 ═══════════════════════════════════

interface T2Group {
  id: number
  kind: PrimitiveKind
  surf: PrimitiveParams
  regions: number[]
  tris: number[]
  area: number
  coalesced: boolean
  absorbed: number
}

/** 兩個區係咪同一張解析面（同 M3 一樣【唔理法向符號】—— STL 纏繞唔一致好常見）。 */
function sameSurfaceLoose(a: PrimitiveParams, b: PrimitiveParams, eps: number): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'plane' && b.kind === 'plane') {
    const c = dot3(a.normal, b.normal)
    if (Math.abs(c) < 0.999) return false
    return Math.abs(a.d - (c > 0 ? b.d : -b.d)) <= eps * 2
  }
  if (a.kind === 'cylinder' && b.kind === 'cylinder') {
    if (Math.abs(dot3(a.axis, b.axis)) < 0.999) return false
    if (Math.abs(a.radius - b.radius) > Math.max(eps * 2, a.radius * 0.02)) return false
    const w = sub3(b.point, a.point)
    return len3(sub3(w, mul3(a.axis, dot3(w, a.axis)))) <= Math.max(eps * 2, a.radius * 0.02)
  }
  if (a.kind === 'sphere' && b.kind === 'sphere')
    return dist3(a.centre, b.centre) <= eps * 2 && Math.abs(a.radius - b.radius) <= Math.max(eps * 2, a.radius * 0.02)
  if (a.kind === 'cone' && b.kind === 'cone')
    return Math.abs(dot3(a.axis, b.axis)) > 0.999 && Math.abs(a.halfAngleDeg - b.halfAngleDeg) <= 1 && dist3(a.apex, b.apex) <= Math.max(eps * 4, 1e-3)
  if (a.kind === 'torus' && b.kind === 'torus')
    return Math.abs(dot3(a.axis, b.axis)) > 0.999 && Math.abs(a.majorRadius - b.majorRadius) <= Math.max(eps * 2, a.majorRadius * 0.02)
      && Math.abs(a.minorRadius - b.minorRadius) <= Math.max(eps * 2, a.minorRadius * 0.05) && dist3(a.centre, b.centre) <= eps * 4
  return false
}

/**
 * 分組：① 同面合併（沿網格鄰接）② 碎片收編 ③ 圓角壓平（M5）。
 * ★ 碎片收編係 Tier-2 專有嘅硬需求：M3 淨係收編 freeform 碎區，但內核鑲嵌喺【橢圓交線】附近
 *   會切出 1–2 個三角嘅長條，M1 一定擬成「平面」（3 點必共面）。實測 oblique_boss：區 7（2 三角
 *   面積 7.17）同區 8（1 三角 4.60）其實係柱面嘅一部分（614.4 = 602.6+7.2+4.6 ✓）。
 */
function buildGroups(seg: SegmentationResult, opts: Tier2Options, warnings: string[]): { groups: T2Group[]; triGroup: Int32Array } {
  const R = seg.regions
  const n = R.length
  const eps = seg.diag * 1e-3
  const nt = seg.tris.length / 3
  const parent = new Int32Array(n)
  for (let i = 0; i < n; i++) parent[i] = i
  const find = (x: number): number => { let r = x; while (parent[r] !== r) r = parent[r]; while (parent[x] !== r) { const nx = parent[x]; parent[x] = r; x = nx } return r }

  const suppressed = new Set<number>()
  const supportOf = new Map<number, [number, number]>()
  for (const s of opts.suppress?.strips ?? []) { suppressed.add(s.region); supportOf.set(s.region, s.supports) }

  for (const [a, b] of seg.adjacency) {
    if (suppressed.has(a) || suppressed.has(b)) continue
    if (R[a].kind === 'freeform' || R[b].kind === 'freeform') continue
    if (!sameSurfaceLoose(R[a].paramsSnapped, R[b].paramsSnapped, eps)) continue
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  const members = new Map<number, number[]>()
  for (let i = 0; i < n; i++) {
    if (suppressed.has(i)) continue
    const r = find(i)
    const arr = members.get(r)
    if (arr) arr.push(i); else members.set(r, [i])
  }
  const groups: T2Group[] = []
  const regionGroup = new Int32Array(n).fill(-1)
  for (const mem of members.values()) {
    let best = mem[0]
    for (const m of mem) if (R[m].area > R[best].area) best = m
    const g: T2Group = {
      id: groups.length, kind: R[best].kind, surf: R[best].paramsSnapped,
      regions: mem.slice(), tris: [], area: 0, coalesced: mem.length > 1, absorbed: 0,
    }
    for (const m of mem) { regionGroup[m] = g.id; g.area += R[m].area }
    groups.push(g)
  }

  // ── 幾何收編（組級，多趟；收編完鄰接會變，所以要迭代）──
  //  ★ 判據唔係「細就食」，而係【幾何包含】：細組嘅每一個頂點都喺大組嘅解析面上（≤ absorbTol）
  //    而且每個三角嘅法向都同該面嘅解析法向對得上。喺【網格上相鄰】嘅前提下，呢個條件成立就
  //    等於「佢哋本來就係同一張 B-rep 面」（相切嘅圓角帶/柱面唔會過關 —— 遠端頂點一定飛出容差）。
  //  ★ 點解唔可以淨靠 sameSurfaceLoose：內核鑲嵌喺交線附近會切出 1–3 個三角嘅長條，
  //    M1 擬佢哋嘅時候半徑/軸可以差好遠（實測密網格 oblique_boss：柱面碎成 4 份，
  //    其中兩份互相擬唔埋 → 求交變成 cylinder∧cylinder → Tier-2 直接 declined）。
  const absorbTol = opts.absorbTol ?? Math.max(seg.diag * 5e-4, 1e-6)
  const absorbAngDeg = 25
  const fitsSurface = (regions: number[], prm: PrimitiveParams): boolean => {
    const cosTol = Math.cos(absorbAngDeg * Math.PI / 180)
    for (const ri of regions) {
      for (const t of R[ri].triIndices) {
        const ia = seg.tris[t * 3], ib = seg.tris[t * 3 + 1], ic = seg.tris[t * 3 + 2]
        const A: Vec3 = [seg.verts[ia * 3], seg.verts[ia * 3 + 1], seg.verts[ia * 3 + 2]]
        const B: Vec3 = [seg.verts[ib * 3], seg.verts[ib * 3 + 1], seg.verts[ib * 3 + 2]]
        const C: Vec3 = [seg.verts[ic * 3], seg.verts[ic * 3 + 1], seg.verts[ic * 3 + 2]]
        for (const p of [A, B, C]) if (!(Math.abs(surfValue(prm, p)) <= absorbTol)) return false
        const nrm = cross3(sub3(B, A), sub3(C, A))
        const L = len3(nrm)
        if (!(L > 1e-18)) continue
        const cen: Vec3 = [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3, (A[2] + B[2] + C[2]) / 3]
        const g = surfGrad(prm, cen)
        if (!g) return false
        if (Math.abs(dot3(g, mul3(nrm, 1 / L))) < cosTol) return false
      }
    }
    return true
  }
  for (let pass = 0; pass < 4; pass++) {
    // 組級鄰接（每趟重算）
    const gAdj = new Map<number, Set<number>>()
    for (const [a, b] of seg.adjacency) {
      const ga = regionGroup[a], gb = regionGroup[b]
      if (ga < 0 || gb < 0 || ga === gb) continue
      if (!gAdj.has(ga)) gAdj.set(ga, new Set())
      if (!gAdj.has(gb)) gAdj.set(gb, new Set())
      gAdj.get(ga)!.add(gb); gAdj.get(gb)!.add(ga)
    }
    const order = groups.filter((g) => g.regions.length).sort((a, b) => a.area - b.area)
    let moved = 0
    for (const g of order) {
      if (!g.regions.length) continue
      let host: T2Group | null = null
      for (const hj of gAdj.get(g.id) ?? []) {
        const h = groups[hj]
        if (!h.regions.length || h.kind === 'freeform') continue
        if (h.area < g.area) continue                       // 只可以【細併大】（大嗰個嘅擬合可信啲）
        if (!fitsSurface(g.regions, h.surf)) continue
        if (!host || h.area > host.area) host = h
      }
      if (!host) continue
      host.regions.push(...g.regions)
      host.area += g.area
      host.absorbed += g.regions.length
      for (const ri of g.regions) regionGroup[ri] = host.id
      g.regions = []; g.area = 0
      moved++
    }
    if (!moved) break
  }

  // 壓實（掉走俾人收編走晒嘅空組）
  const compact: T2Group[] = []
  const remap = new Int32Array(groups.length).fill(-1)
  for (const g of groups) {
    if (!g.regions.length) continue
    remap[g.id] = compact.length
    g.id = compact.length
    compact.push(g)
  }
  for (let i = 0; i < n; i++) if (regionGroup[i] >= 0) regionGroup[i] = remap[regionGroup[i]]

  // ── 三角歸組 + 圓角壓平（壓平帶嘅三角逐個分派去【最近】嗰張支撐面）──
  const triGroup = new Int32Array(nt).fill(-1)
  for (let t = 0; t < seg.labels.length; t++) {
    const reg = seg.labels[t]
    if (suppressed.has(reg)) continue
    const gi = regionGroup[reg]
    if (gi >= 0) { triGroup[t] = gi; compact[gi].tris.push(t) }
  }
  let strips = 0
  for (const [reg, sup] of supportOf) {
    const ga = regionGroup[sup[0]], gb = regionGroup[sup[1]]
    if (ga < 0 || gb < 0) { warnings.push(`圓角壓平：區 ${reg} 嘅支撐面 [${sup}] 冇對應組，跳過`); continue }
    strips++
    for (const t of R[reg].triIndices) {
      // 三角重心到兩張支撐面嘅距離 —— 邊個近就歸邊個（等於喺圓角帶【脊線】切開）
      let cx = 0, cy = 0, cz = 0
      for (let k = 0; k < 3; k++) {
        const vi = seg.tris[t * 3 + k]
        cx += seg.verts[vi * 3]; cy += seg.verts[vi * 3 + 1]; cz += seg.verts[vi * 3 + 2]
      }
      const c: Vec3 = [cx / 3, cy / 3, cz / 3]
      const da = Math.abs(surfValue(compact[ga].surf, c)), db = Math.abs(surfValue(compact[gb].surf, c))
      const gi = da <= db ? ga : gb
      triGroup[t] = gi
      compact[gi].tris.push(t)
    }
  }
  void strips
  return { groups: compact, triGroup }
}

// ═══════════════════════════════════ 邊界環 ═══════════════════════════════════

const edgeKey = (a: number, b: number, nv: number): number => (a < b ? a * nv + b : b * nv + a)

/** 由一堆三角重砌邊界環（只用一次嘅無向邊 = 邊界）。同 M3 同款，纏繞唔一致都照計。 */
function loopsFromTris(seg: SegmentationResult, tris: number[]): number[][] {
  const nv = seg.verts.length / 3
  const count = new Map<number, number>()
  const store = new Map<number, [number, number]>()
  for (const t of tris) {
    for (let k = 0; k < 3; k++) {
      const a = seg.tris[t * 3 + k], b = seg.tris[t * 3 + (k + 1) % 3]
      if (a === b) continue
      const key = edgeKey(a, b, nv)
      count.set(key, (count.get(key) ?? 0) + 1)
      if (!store.has(key)) store.set(key, [a, b])
    }
  }
  const adj = new Map<number, number[]>()
  for (const [key, c] of count) {
    if (c !== 1) continue
    const [a, b] = store.get(key)!
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push(b); adj.get(b)!.push(a)
  }
  const used = new Set<number>()
  const loops: number[][] = []
  for (const start of adj.keys()) {
    if ((adj.get(start) ?? []).every((nb) => used.has(edgeKey(start, nb, nv)))) continue
    const chain: number[] = [start]
    let cur = start, prev = -1
    for (let guard = 0; guard < count.size + 4; guard++) {
      const nbs = adj.get(cur) ?? []
      let nxt = -1
      for (const nb of nbs) {
        if (nb === prev && nbs.length > 1) continue
        if (used.has(edgeKey(cur, nb, nv))) continue
        nxt = nb; break
      }
      if (nxt < 0) break
      used.add(edgeKey(cur, nxt, nv))
      if (nxt === start) break
      chain.push(nxt)
      prev = cur; cur = nxt
    }
    if (chain.length >= 3) loops.push(chain)
  }
  return loops
}

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

// ═══════════════════════════════════ planTier2 ═══════════════════════════════════

interface RawArc { nb: number; ids: number[] }
interface RawLoop { arcs: RawArc[]; ring: boolean; pts: Vec3[] }

/** 揀最貼網格點嗰條分支（plane∥cyl 出兩條母線、⟂torus 出兩個圓 …… 都要揀啱）。 */
function pickBranch(brs: Tier2Curve[], pts: Vec3[]): number {
  if (brs.length === 1) return 0
  let best = 0, bestD = Infinity
  const step = Math.max(1, Math.floor(pts.length / 16))
  for (let i = 0; i < brs.length; i++) {
    let s = 0, n = 0
    for (let k = 0; k < pts.length; k += step) { s += distToCurve(brs[i], pts[k]); n++ }
    const d = s / Math.max(1, n)
    if (d < bestD) { bestD = d; best = i }
  }
  return best
}

/** 環喺某平面上嘅投影面積（揀外環用）。 */
function loopAreaOnPlane(pts: Vec3[], n: Vec3): number {
  const { x, y } = frameOf(n)
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    s += dot3(a, x) * dot3(b, y) - dot3(b, x) * dot3(a, y)
  }
  return Math.abs(s) / 2
}

/** PrimitiveParams → FitWrapper.MakeAnalyticFace 嘅 params（M2 合約排位，同 M3 一致）。 */
function hostParamsOf(p: PrimitiveParams): number[] {
  switch (p.kind) {
    case 'plane': {
      const { x } = frameOf(p.normal)
      return [p.point[0], p.point[1], p.point[2], p.normal[0], p.normal[1], p.normal[2], x[0], x[1], x[2]]
    }
    case 'cylinder': return [p.point[0], p.point[1], p.point[2], p.axis[0], p.axis[1], p.axis[2], p.radius, p.refU[0], p.refU[1], p.refU[2]]
    case 'cone': return [p.apex[0], p.apex[1], p.apex[2], p.axis[0], p.axis[1], p.axis[2], p.halfAngleDeg * Math.PI / 180, p.refU[0], p.refU[1], p.refU[2]]
    case 'sphere': return [p.centre[0], p.centre[1], p.centre[2], p.radius]
    case 'torus': return [p.centre[0], p.centre[1], p.centre[2], p.axis[0], p.axis[1], p.axis[2], p.majorRadius, p.minorRadius]
    default: return []
  }
}

/**
 * SegmentationResult → Tier-2 起面計劃（純數據、零內核）。
 * 呢步做晒【全部幾何判斷】：分組、邊界環切弧、逐對解析求交、三面角點、周期面切半。
 * 任何一步做唔到 → declined = true（上層照跑 M3，零回歸律）。
 */
export function planTier2(seg: SegmentationResult, opts: Tier2Options = {}): Tier2Plan {
  const warnings: string[] = []
  const reasons: string[] = []
  const diag = seg.diag || 1
  const sewTol = opts.sewTol ?? Math.max(diag * 1e-6, 1e-6)
  const vertexTol = opts.vertexTol ?? Math.max(diag * 1e-12, 1e-10)
  const mergeTol = opts.vertexMergeTol ?? diag * 1e-7
  const nv = seg.verts.length / 3
  const P = (vi: number): Vec3 => [seg.verts[vi * 3], seg.verts[vi * 3 + 1], seg.verts[vi * 3 + 2]]

  const { groups, triGroup } = buildGroups(seg, opts, warnings)
  const edgeTris = buildEdgeTris(seg)

  const plan: Tier2Plan = {
    faces: [], curves: [], vertices: [], declined: false, reasons, warnings, sewTol, diag,
    stats: {
      groups: groups.length, coalesced: groups.filter((g) => g.coalesced).length,
      absorbedRegions: groups.reduce((s, g) => s + g.absorbed, 0),
      suppressedStrips: opts.suppress?.strips.length ?? 0,
      lines: 0, circles: 0, ellipses: 0, seams: 0, corners: 0, maxVertexResidual: 0,
      snapsApplied: seg.snaps.filter((s) => s.applied).length, worstUnsnappedDeg: 0,
    },
  }
  // ★ 約束 snap 一定要行喺求交【之前】（M1 做，我哋食 paramsSnapped）。呢度只做核對：
  //   兩張面嘅方向如果「差少少就正交/平行」但又唔係精確，即係 M1 嘅 snap 冇 fire（或者關咗）——
  //   咁樣交線會歪，三面角點嘅誤差仲會沿住鏈累積。唔會因此 declined，但一定要講。
  for (let i = 0; i < groups.length; i++) {
    const di = dirOfSurf(groups[i].surf)
    if (!di) continue
    for (let j = i + 1; j < groups.length; j++) {
      const dj = dirOfSurf(groups[j].surf)
      if (!dj) continue
      const ang = Math.acos(Math.min(1, Math.abs(dot3(di, dj)))) * 180 / Math.PI
      const off = Math.min(ang, Math.abs(90 - ang))
      if (off > 1e-4 && off < 0.5 && off > plan.stats.worstUnsnappedDeg) plan.stats.worstUnsnappedDeg = off
    }
  }
  if (plan.stats.worstUnsnappedDeg > 0)
    warnings.push(`有面對「差 ${plan.stats.worstUnsnappedDeg.toExponential(2)}° 就正交/平行」但未 snap —— M1 snap 應該開住（segmentAndFit 嘅 snap:true）`)
  const decline = (why: string): Tier2Plan => { plan.declined = true; reasons.push(why); return plan }
  if (groups.length < 2) return decline(`只有 ${groups.length} 組 —— 唔夠砌實體`)
  for (const g of groups) if (g.kind === 'freeform') return decline(`組 ${g.id} 係 freeform —— Tier-2 只做解析面`)

  // ── 共享曲線表：key =「組對 + 分支」→ 一條曲線，兩張面【共用同一組數字】→ 縫隙 = 0 ──
  const curveCache = new Map<string, Tier2Curve[]>()
  const curveIds = new Map<string, number>()
  const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`)
  const branchesOf = (ga: number, gb: number): Tier2Curve[] => {
    const key = pairKey(ga, gb)
    let c = curveCache.get(key)
    if (!c) { c = intersectSurfaces(groups[ga].surf, groups[gb].surf); curveCache.set(key, c) }
    return c
  }
  const registerCurve = (ga: number, gb: number, bi: number, cv: Tier2Curve): number => {
    const key = `${pairKey(ga, gb)}#${bi}`
    let id = curveIds.get(key)
    if (id === undefined) {
      id = plan.curves.length
      plan.curves.push(cv)
      curveIds.set(key, id)
      if (cv.kind === 'line') plan.stats.lines++
      else if (cv.kind === 'circle') plan.stats.circles++
      else plan.stats.ellipses++
    }
    return id
  }
  const seamIds = new Map<string, number>()
  const registerSeam = (key: string, cv: Tier2Curve): number => {
    let id = seamIds.get(key)
    if (id === undefined) { id = plan.curves.length; plan.curves.push(cv); seamIds.set(key, id); plan.stats.seams++ }
    return id
  }

  // ── 共享頂點表：純空間去重。同一個角點由邊張面去解都收斂到同一個根 → 逐位相同 ──
  const addVertex = (p: Vec3, residual: number, ok: boolean, note: string): number => {
    for (let i = 0; i < plan.vertices.length; i++) if (dist3(plan.vertices[i].p, p) <= mergeTol) return i
    plan.vertices.push({ p, residual, ok, note })
    if (residual > plan.stats.maxVertexResidual) plan.stats.maxVertexResidual = residual
    return plan.vertices.length - 1
  }
  const cornerVertex = (ga: number, gb: number, gc: number, seed: Vec3): number => {
    const r = solveTripleVertex([groups[ga].surf, groups[gb].surf, groups[gc].surf], seed, diag, vertexTol)
    if (!r.ok) {
      warnings.push(`角點 (${ga},${gb},${gc}) Newton 殘差 ${r.residual.toExponential(2)}mm：${r.note}`)
      if (!(r.residual < diag * 1e-6)) { plan.declined = true; reasons.push(`角點 (${ga},${gb},${gc}) 解唔到（殘差 ${r.residual.toExponential(2)}mm）`) }
    }
    plan.stats.corners++
    return addVertex(r.p, r.residual, r.ok, r.note)
  }

  const nbOfEdge = (a: number, b: number, self: number): number => {
    const ts = edgeTris.get(edgeKey(a, b, nv)) ?? []
    for (const t of ts) { const g = triGroup[t]; if (g >= 0 && g !== self) return g }
    return -1
  }

  // ── ① 逐組砌原始環（按鄰組切弧）──
  const groupLoops: RawLoop[][] = []
  for (const g of groups) {
    const loops = loopsFromTris(seg, g.tris)
    const raws: RawLoop[] = []
    for (const lp of loops) {
      const m = lp.length
      const nbs: number[] = []
      for (let i = 0; i < m; i++) nbs.push(nbOfEdge(lp[i], lp[(i + 1) % m], g.id))
      if (nbs.some((x) => x < 0)) return decline(`組 ${g.id} 有邊界邊搵唔到鄰面（網格唔水密 / 有洞）`)
      const pts = lp.map(P)
      if (new Set(nbs).size === 1) { raws.push({ arcs: [{ nb: nbs[0], ids: lp.slice() }], ring: true, pts }); continue }
      let start = 0
      for (let i = 0; i < m; i++) if (nbs[i] !== nbs[(i - 1 + m) % m]) { start = i; break }
      const arcs: RawArc[] = []
      let cur: RawArc | null = null
      for (let k = 0; k < m; k++) {
        const i = (start + k) % m
        if (!cur || cur.nb !== nbs[i]) { cur = { nb: nbs[i], ids: [lp[i]] }; arcs.push(cur) }
        cur.ids.push(lp[(i + 1) % m])
      }
      raws.push({ arcs, ring: false, pts })
    }
    if (!raws.length) return decline(`組 ${g.id} 冇邊界環`)
    groupLoops.push(raws)
  }

  // ── ② uv 矩形快路：柱/錐面嘅環【全部都係共軸正圓】→ 唔使切半，直接 uv 界（M3 已證）。
  //    點解要留呢條路：① 鑽尖（單環錐）根本冇得切半（得一條環）；② 慳一次 seam + UnifySameDomain。
  //    ★ 只可以喺【正圓 + 共軸】時用 —— 斜切出嚟嘅橢圓界唔係 v = 常數，uv 矩形會切錯。
  const ringCurveOf = (gi: number, rl: RawLoop): { cv: Tier2Curve; bi: number; nb: number } | null => {
    const nb = rl.arcs[0].nb
    const brs = branchesOf(gi, nb)
    if (!brs.length) return null
    const bi = pickBranch(brs, rl.pts)
    return { cv: brs[bi], bi, nb }
  }
  const uvRect: (number[] | null)[] = groups.map((g, gi) => {
    if (g.kind !== 'cylinder' && g.kind !== 'cone') return null
    const ls = groupLoops[gi]
    if (!ls.length || !ls.every((l) => l.ring)) return null
    const ax = axisOf(g.surf)
    if (!ax) return null
    const hs: number[] = []
    for (const l of ls) {
      const r = ringCurveOf(gi, l)
      if (!r || r.cv.kind !== 'circle') return null
      if (Math.abs(dot3(r.cv.dir, ax.dir)) < 1 - 1e-7) return null            // 圓平面要 ⟂ 軸
      const w = sub3(r.cv.origin, ax.pt)
      const h = dot3(w, ax.dir)
      if (len3(sub3(w, mul3(ax.dir, h))) > Math.max(1e-7, diag * 1e-9)) return null   // 圓心要喺軸上
      hs.push(h)
    }
    if (g.kind === 'cylinder') {
      if (hs.length !== 2) return null
      return [0, TAU, Math.min(...hs), Math.max(...hs)]
    }
    const half = (g.surf as { halfAngleDeg: number }).halfAngleDeg * Math.PI / 180
    const cosh = Math.cos(half) || 1
    if (hs.some((h) => h < -1e-9)) return null                                 // 環喺頂點另一邊 = 雙葉錐，唔掂
    const sl = hs.map((h) => Math.max(0, h) / cosh)
    const lo = hs.length === 1 ? 0 : Math.min(...sl)
    const hi = Math.max(...sl)
    return hi > lo + 1e-9 ? [0, TAU, lo, hi] : null
  })

  // ── ③ 周期宿主：柱/錐畀【閉環】夾住（但唔係共軸正圓）→ 一定要切半（見檔頭教訓 1）──
  const wrapping = groups.map((g, gi) => {
    if (uvRect[gi]) return false
    if (g.kind !== 'cylinder' && g.kind !== 'cone') return false
    const ls = groupLoops[gi]
    return ls.length === 2 && ls.every((l) => l.ring)
  })
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]
    if (wrapping[gi] || uvRect[gi]) continue
    if (groupLoops[gi].some((l) => l.ring) && (g.kind === 'sphere' || g.kind === 'torus'))
      return decline(`組 ${gi}（${g.kind}）畀閉環夾住 —— v1 只支援柱/錐嘅周期切半`)
    if ((g.kind === 'cylinder' || g.kind === 'cone') && groupLoops[gi].filter((l) => l.ring).length > 0 && groupLoops[gi].length !== 2)
      return decline(`組 ${gi}（${g.kind}）有 ${groupLoops[gi].length} 條環（非共軸正圓），v1 只支援 2`)
  }

  /** 某條組對曲線係咪要跟周期宿主切半（兩邊一定要跟同一組切點）。 */
  const splitHostOf = new Map<string, number>()
  for (let gi = 0; gi < groups.length; gi++) {
    if (!wrapping[gi]) continue
    for (const l of groupLoops[gi]) {
      const key = pairKey(gi, l.arcs[0].nb)
      if (!splitHostOf.has(key)) splitHostOf.set(key, gi)
    }
  }

  /**
   * 閉合曲線 × 周期宿主半平面 → 兩個切點參數（宿主方位角 u = 0 / π）。
   * ★ 切點一定要由【宿主】定，唔可以用曲線自己嘅參數 0/π：否則兩條環嘅切點唔喺同一條母線上，
   *   接縫邊就唔會落喺柱面上（變咗弦）→ 面必爆（檔頭教訓 2）。
   */
  const splitParams = (cv: Tier2Curve, host: PrimitiveParams): [number, number] | null => {
    const ax = axisOf(host)
    const refU = host.kind === 'cylinder' || host.kind === 'cone' ? host.refU : null
    if (!ax || !refU) return null
    const refV = norm3(cross3(ax.dir, refU))
    const az = (t: number): number => {
      const q = sub3(curvePointAt(cv, t), ax.pt)
      return Math.atan2(dot3(q, refV), dot3(q, refU))
    }
    const out: number[] = []
    for (const target of [0, Math.PI]) {
      const wrap = (x: number): number => { let y = x - target; while (y > Math.PI) y -= TAU; while (y < -Math.PI) y += TAU; return y }
      const N = 96
      let lo = 0, flo = wrap(az(0)), found = false
      for (let i = 1; i <= N && !found; i++) {
        const t = i * TAU / N, ft = wrap(az(t))
        if (Math.abs(flo) < 1e-14) { out.push(lo); found = true; break }
        if (flo * ft < 0 && Math.abs(flo - ft) < Math.PI) {
          let a = lo, b = t, fa = flo
          for (let k = 0; k < 64; k++) {
            const mid = (a + b) / 2, fm = wrap(az(mid))
            if (fa * fm <= 0) b = mid; else { a = mid; fa = fm }
          }
          out.push((a + b) / 2); found = true
        }
        lo = t; flo = ft
      }
      if (!found) return null
    }
    return [out[0], out[1]]
  }

  /** 弧嘅方位角區間（切半用）：forward(t0→t1) 覆蓋 u∈[0,π] 定 [π,2π]。 */
  const halfOfArc = (cv: Tier2Curve, host: PrimitiveParams, t0: number, t1: number): number => {
    const ax = axisOf(host)!
    const refU = (host as { refU: Vec3 }).refU
    const refV = norm3(cross3(ax.dir, refU))
    let d = t1 - t0
    while (d <= 0) d += TAU
    const q = sub3(curvePointAt(cv, t0 + d / 2), ax.pt)
    let u = Math.atan2(dot3(q, refV), dot3(q, refU))
    if (u < 0) u += TAU
    return u < Math.PI ? 0 : 1
  }

  const faceOf = (g: T2Group, patch: number, patches: number): Tier2Face => ({
    group: g.id, kind: g.kind, surf: g.surf, build: 'wire', hostParams: hostParamsOf(g.surf), uvBounds: [],
    loops: [], meshArea: g.area / patches, regions: g.regions.slice(), triCount: g.tris.length, patch, note: '',
  })

  /** 一條原始環 → Tier2Loop（解析弧 + 三面角點）。 */
  const buildLoop = (gi: number, rl: RawLoop): Tier2Loop | null => {
    if (rl.ring) {
      const nb = rl.arcs[0].nb
      const brs = branchesOf(gi, nb)
      if (!brs.length) { decline(`組 ${gi} × ${nb}：求交冇解析分支（${groups[gi].kind}∧${groups[nb].kind}）`); return null }
      const bi = pickBranch(brs, rl.pts)
      const cv = brs[bi]
      if (!cv.closed) { decline(`組 ${gi} × ${nb}：閉環對開放曲線`); return null }
      const cid = registerCurve(gi, nb, bi, cv)
      const host = splitHostOf.get(pairKey(gi, nb))
      const area = Math.PI * cv.majorR * cv.minorR
      if (host !== undefined) {
        // 對面係周期宿主 → 跟佢切成兩段（一邊整圓、一邊兩段半圓嘅話縫唔埋）
        const sp = splitParams(cv, groups[host].surf)
        if (!sp) { decline(`組 ${gi}：跟隨切半失敗`); return null }
        const v0 = addVertex(curvePointAt(cv, sp[0]), 0, true, 'seam-split'), v1 = addVertex(curvePointAt(cv, sp[1]), 0, true, 'seam-split')
        return {
          arcs: [
            { curve: cid, vStart: v0, vEnd: v1, tStart: sp[0], tEnd: sp[1], neighbour: nb, seam: false },
            { curve: cid, vStart: v1, vEnd: v0, tStart: sp[1], tEnd: sp[0], neighbour: nb, seam: false },
          ],
          isOuter: false, area, ring: true,
        }
      }
      return { arcs: [{ curve: cid, vStart: -1, vEnd: -1, tStart: 0, tEnd: TAU, neighbour: nb, seam: false }], isOuter: false, area, ring: true }
    }
    const nArc = rl.arcs.length
    const cids: number[] = [], cvs: Tier2Curve[] = []
    for (const a of rl.arcs) {
      const brs = branchesOf(gi, a.nb)
      if (!brs.length) { decline(`組 ${gi} × ${a.nb}：求交冇解析分支（${groups[gi].kind}∧${groups[a.nb].kind}）`); return null }
      const bi = pickBranch(brs, a.ids.map(P))
      cvs.push(brs[bi])
      cids.push(registerCurve(gi, a.nb, bi, brs[bi]))
    }
    const vids: number[] = []
    for (let i = 0; i < nArc; i++) {
      const prev = rl.arcs[(i - 1 + nArc) % nArc]
      vids.push(cornerVertex(gi, prev.nb, rl.arcs[i].nb, P(rl.arcs[i].ids[0])))
    }
    const arcs: Tier2Arc[] = []
    for (let i = 0; i < nArc; i++) {
      const cv = cvs[i]
      const vS = vids[i], vE = vids[(i + 1) % nArc]
      let tS = curveParamOf(cv, plan.vertices[vS].p), tE = curveParamOf(cv, plan.vertices[vE].p)
      if (cv.closed) {
        // 兩個角點之間有兩條弧 —— 用弧中間嘅網格點做裁判揀啱嗰條
        const ids = rl.arcs[i].ids
        const tm = curveParamOf(cv, P(ids[Math.floor(ids.length / 2)]))
        if (((tm - tS + TAU) % TAU) > ((tE - tS + TAU) % TAU)) { const t = tS; tS = tE; tE = t }
      } else if (tE < tS) { const t = tS; tS = tE; tE = t }
      arcs.push({ curve: cids[i], vStart: vS, vEnd: vE, tStart: tS, tEnd: tE, neighbour: rl.arcs[i].nb, seam: false })
    }
    return { arcs, isOuter: false, area: loopAreaOnPlane(rl.pts, groups[gi].kind === 'plane' ? (groups[gi].surf as { normal: Vec3 }).normal : [0, 0, 1]), ring: false }
  }

  // ── ③ 砌面 ──
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]
    const raws = groupLoops[gi]

    if (!wrapping[gi]) {
      const face = faceOf(g, 0, 1)
      const uv = uvRect[gi]
      for (const rl of raws) {
        const loop = buildLoop(gi, rl)
        if (!loop) return plan
        face.loops.push(loop)
      }
      let oi = 0
      for (let i = 1; i < face.loops.length; i++) if (face.loops[i].area > face.loops[oi].area) oi = i
      face.loops[oi].isOuter = true
      if (uv) {
        // uv 快路：環照計（交線要入曲線表、鄰面要攞返同一個圓），但面本身由 uv 界起
        face.build = 'uvRect'
        face.uvBounds = uv
        face.note = `${g.kind} uv 矩形 v=[${uv[2].toFixed(4)},${uv[3].toFixed(4)}]（${face.loops.length} 條共軸正圓環）`
      } else {
        face.note = `${g.kind} ${face.loops.length} loop(s) / ${face.loops.reduce((s, l) => s + l.arcs.length, 0)} arc(s)`
      }
      plan.faces.push(face)
      continue
    }

    // 周期宿主 → 兩條閉環切成兩塊 patch
    const rings: { cid: number; nb: number; vs: [number, number]; half: [[number, number], [number, number]] }[] = []
    for (const rl of raws) {
      const nb = rl.arcs[0].nb
      const brs = branchesOf(gi, nb)
      if (!brs.length) return decline(`組 ${gi} × ${nb}：求交冇解析分支（${g.kind}∧${groups[nb].kind}）`)
      const bi = pickBranch(brs, rl.pts)
      const cv = brs[bi]
      if (!cv.closed) return decline(`組 ${gi} × ${nb}：周期宿主嘅環對開放曲線`)
      const cid = registerCurve(gi, nb, bi, cv)
      const sp = splitParams(cv, g.surf)
      if (!sp) return decline(`組 ${gi}：切半參數解唔到`)
      const v0 = addVertex(curvePointAt(cv, sp[0]), 0, true, 'seam-split'), v1 = addVertex(curvePointAt(cv, sp[1]), 0, true, 'seam-split')
      // 兩條 forward 區間邊條覆蓋 u∈[0,π]？（曲線法向可以同軸反向，唔可以假設）
      const h01 = halfOfArc(cv, g.surf, sp[0], sp[1])
      const half: [[number, number], [number, number]] = h01 === 0
        ? [[sp[0], sp[1]], [sp[1], sp[0]]]
        : [[sp[1], sp[0]], [sp[0], sp[1]]]
      rings.push({ cid, nb, vs: [v0, v1], half })
    }
    // seam 邊 = 兩條環喺同一個 u 嘅切點連線（柱/錐上面呢條係母線 = 直線 ✓）
    const seams: number[] = []
    for (let k = 0; k < 2; k++) {
      const pa = plan.vertices[rings[0].vs[k]].p, pb = plan.vertices[rings[1].vs[k]].p
      if (!(dist3(pa, pb) > 1e-9)) return decline(`組 ${gi}：seam 邊退化（兩條環嘅切點重疊）`)
      seams.push(registerSeam(`${gi}#${k}`, lineCurve(pa, sub3(pb, pa), 'seam(母線)')))
    }
    for (let patch = 0; patch < 2; patch++) {
      const face = faceOf(g, patch, 2)
      const arcs: Tier2Arc[] = []
      for (const [ri, ring] of rings.entries()) {
        const [t0, t1] = ring.half[patch]
        const vS = Math.abs(t0 - curveParamOf(plan.curves[ring.cid], plan.vertices[ring.vs[0]].p)) < 1e-9 ? ring.vs[0] : ring.vs[1]
        const vE = vS === ring.vs[0] ? ring.vs[1] : ring.vs[0]
        arcs.push({ curve: ring.cid, vStart: vS, vEnd: vE, tStart: t0, tEnd: t1, neighbour: ring.nb, seam: false })
        if (ri === 0) arcs.push(seamArcOf(plan, seams[0], rings[0].vs[0], rings[1].vs[0]))
      }
      arcs.push(seamArcOf(plan, seams[1], rings[0].vs[1], rings[1].vs[1]))
      face.loops.push({ arcs, isOuter: true, area: 0, ring: false })
      face.note = `${g.kind} 周期切半 patch ${patch}（2 弧 + 2 seam）`
      plan.faces.push(face)
    }
  }

  const maxFaces = opts.maxFaces ?? 2000
  if (plan.faces.length > maxFaces) return decline(`計劃 ${plan.faces.length} 張面 > maxFaces ${maxFaces}`)
  return plan
}

function seamArcOf(plan: Tier2Plan, curveIdx: number, vA: number, vB: number): Tier2Arc {
  const cv = plan.curves[curveIdx]
  const t0 = curveParamOf(cv, plan.vertices[vA].p), t1 = curveParamOf(cv, plan.vertices[vB].p)
  return { curve: curveIdx, vStart: vA, vEnd: vB, tStart: Math.min(t0, t1), tEnd: Math.max(t0, t1), neighbour: -1, seam: true }
}

// ═══════════════════════════════════ executeTier2（內核）═══════════════════════════════════

const ST_FACE = 4

const nonNull = (s: OCShape): OCShape | null => { try { return s && !s.IsNull() ? s : null } catch { return null } }
function shapeType(s: OCShape): number {
  try { const v = s.ShapeType(); return (v && typeof v === 'object' && 'value' in v) ? v.value : v } catch { return -1 }
}
function faceArea(OC: OCModule, s: OCShape): number {
  try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.SurfaceProperties_1(s, g, false, false); return g.Mass() } catch { return NaN }
}
function countFaces(OC: OCModule, s: OCShape): number {
  try {
    let n = 0
    const ex = new OC.TopExp_Explorer_2(s, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
    for (; ex.More(); ex.Next()) n++
    return n
  } catch { return -1 }
}
function checkValid(OC: OCModule, s: OCShape): boolean | null {
  try { const a = new OC.BRepCheck_Analyzer(s, true, false); return !!(a.IsValid_2 ? a.IsValid_2() : a.IsValid()) } catch { return null }
}
const pnt = (OC: OCModule, p: Vec3): OCShape => new OC.gp_Pnt_3(p[0], p[1], p[2])
const gdir = (OC: OCModule, p: Vec3): OCShape => new OC.gp_Dir_4(p[0], p[1], p[2])

/**
 * 一條解析弧 → TopoDS_Edge。
 * ★ gp_Lin 冇綁定（實測）→ 直線邊行 MakeEdge_3(P1,P2)；兩張面用【同一組頂點坐標】起，
 *   所以出嚟嘅幾何逐位相同，縫合零縫隙。
 */
function edgeOfArc(OC: OCModule, plan: Tier2Plan, arc: Tier2Arc): OCShape | null {
  try {
    const cv = plan.curves[arc.curve]
    if (cv.kind === 'line') {
      if (arc.vStart < 0 || arc.vEnd < 0) return null
      const A = plan.vertices[arc.vStart].p, B = plan.vertices[arc.vEnd].p
      if (!(dist3(A, B) > 1e-9)) return null
      return nonNull(new OC.BRepBuilderAPI_MakeEdge_3(pnt(OC, A), pnt(OC, B)).Edge())
    }
    const ax2 = new OC.gp_Ax2_2(pnt(OC, cv.origin), gdir(OC, cv.dir), gdir(OC, cv.refX))
    const geom = cv.kind === 'circle' ? new OC.gp_Circ_2(ax2, cv.majorR) : new OC.gp_Elips_2(ax2, cv.majorR, cv.minorR)
    if (arc.vStart < 0) {
      const mk = cv.kind === 'circle' ? new OC.BRepBuilderAPI_MakeEdge_8(geom) : new OC.BRepBuilderAPI_MakeEdge_12(geom)
      return nonNull(mk.Edge())
    }
    let d = arc.tEnd - arc.tStart
    while (d <= 1e-12) d += TAU
    if (d > TAU - 1e-12) return null
    const mk = cv.kind === 'circle'
      ? new OC.BRepBuilderAPI_MakeEdge_9(geom, arc.tStart, arc.tStart + d)
      : new OC.BRepBuilderAPI_MakeEdge_13(geom, arc.tStart, arc.tStart + d)
    return nonNull(mk.Edge())
  } catch { return null }
}

function wireOfLoop(OC: OCModule, plan: Tier2Plan, loop: Tier2Loop, reverse: boolean): OCShape | null {
  try {
    const mw = new OC.BRepBuilderAPI_MakeWire_1()
    let n = 0
    for (const arc of loop.arcs) {
      const e = edgeOfArc(OC, plan, arc)
      if (!e) return null
      mw.Add_1(e)
      n++
    }
    if (!n || !mw.IsDone()) return null
    const w = nonNull(mw.Wire())
    if (!w) return null
    return reverse ? OC.TopoDS.Wire_1(w.Reversed()) : w
  } catch { return null }
}

/** 面 + 孔環 → 帶孔面（同 M3 一樣：兩個方向都試，邊個令面積【減少】就要邊個）。 */
function addHole(OC: OCModule, face: OCShape, plan: Tier2Plan, hole: Tier2Loop): OCShape | null {
  const base = faceArea(OC, face)
  for (const rev of [true, false]) {
    const w = wireOfLoop(OC, plan, hole, rev)
    if (!w) continue
    try {
      const f = nonNull(new OC.BRepBuilderAPI_MakeFace_22(OC.TopoDS.Face_1(face), w).Face())
      if (!f) continue
      const a = faceArea(OC, f)
      if (Number.isFinite(a) && a < base - hole.area * 0.5) return f
    } catch { /* 試下一個方向 */ }
  }
  return null
}

/**
 * 一張 Tier2Face → TopoDS_Face。
 *  平面：gp_Pln + MakeFace_16（外環）→ MakeFace_22（孔環）
 *  曲面：借 M2 MakeAnalyticFace 攞 Handle_Geom_Surface → MakeFace_21（gp_Cone/gp_Torus 冇綁定）
 *        → ShapeFix_Face 補 pcurve（MakeFace(surf,wire) 唔會自己投影）
 * 面積閘：同網格面積差太遠 = 揀錯咗 wire 嘅邊 → 反向再試。
 */
function buildFace(OC: OCModule, plan: Tier2Face, all: Tier2Plan, warnings: string[]): OCShape | null {
  const outer = plan.loops.find((l) => l.isOuter) ?? plan.loops[0]
  if (!outer) return null
  const holes = plan.loops.filter((l) => l !== outer)
  const areaOk = (f: OCShape | null): boolean => {
    if (!f) return false
    const a = faceArea(OC, f)
    return Number.isFinite(a) && a > 0 && a < plan.meshArea * 3 + all.diag * all.diag * 1e-3
  }
  let face: OCShape | null = null
  try {
    if (plan.build === 'uvRect') {
      // 柱/錐 + 共軸正圓環：M3 已證嘅路 —— 面由解析參數 + uv 界直接起，邊界圓同鄰面嗰個
      // gp_Circ 出自【同一組數字】，所以接縫逐位相等。
      const kind = ANALYTIC_KIND[plan.kind]
      const cand = kind === undefined ? null : nonNull(OC.FitWrapper.MakeAnalyticFace(kind, plan.hostParams, plan.uvBounds))
      if (!cand) { warnings.push(`組 ${plan.group}: MakeAnalyticFace(${plan.kind}, uv) 返 null`); return null }
      if (!areaOk(cand)) { warnings.push(`組 ${plan.group}: uv 矩形面面積閘唔過（${faceArea(OC, cand).toFixed(3)} vs 網格 ${plan.meshArea.toFixed(3)}）`); return null }
      return cand
    }
    if (plan.kind === 'plane') {
      const s = plan.surf as { normal: Vec3; point: Vec3 }
      for (const rev of [false, true]) {
        const w = wireOfLoop(OC, all, outer, rev)
        if (!w) continue
        const pl = new OC.gp_Pln_3(pnt(OC, s.point), gdir(OC, s.normal))
        const cand = nonNull(new OC.BRepBuilderAPI_MakeFace_16(pl, w, true).Face())
        if (areaOk(cand)) { face = cand; break }
      }
    } else {
      const kind = ANALYTIC_KIND[plan.kind]
      if (kind === undefined) return null
      const host = nonNull(OC.FitWrapper.MakeAnalyticFace(kind, plan.hostParams, []))
      if (!host) { warnings.push(`組 ${plan.group}: MakeAnalyticFace(${plan.kind}) 返 null`); return null }
      const surf = OC.BRep_Tool.Surface_2(OC.TopoDS.Face_1(host))
      if (!surf) { warnings.push(`組 ${plan.group}: 攞唔到 Handle_Geom_Surface`); return null }
      for (const rev of [false, true]) {
        const w = wireOfLoop(OC, all, outer, rev)
        if (!w) continue
        let cand = nonNull(new OC.BRepBuilderAPI_MakeFace_21(surf, w, true).Face())
        if (!cand) continue
        try {
          const fx = new OC.ShapeFix_Face_2(OC.TopoDS.Face_1(cand))
          fx.SetPrecision(Math.max(all.sewTol, 1e-7))
          fx.Perform()
          const fixed = nonNull(fx.Face())
          if (fixed) cand = fixed
        } catch { /* 補 pcurve 失敗 → 照用原面，落面 BRepCheck 閘會攔 */ }
        if (areaOk(cand)) { face = cand; break }
      }
    }
  } catch (e) {
    warnings.push(`組 ${plan.group}: 起面拋異常 ${(e as Error)?.message ?? e}`)
    return null
  }
  if (!face) { warnings.push(`組 ${plan.group}（${plan.kind} patch ${plan.patch}）起唔到面（面積閘唔過）`); return null }
  for (const h of holes) {
    const holed = addHole(OC, face, all, h)
    if (holed) face = holed
    else warnings.push(`組 ${plan.group}: 孔環加唔入，面保持無孔`)
  }
  return face
}

/** 計劃 + 內核 → 實體。縫合策略同 M3：SewSolidify(closed) → 唔得就開放殼。 */
export function executeTier2(seg: SegmentationResult, plan: Tier2Plan, OC: OCModule, opts: Tier2Options = {}): Tier2Result {
  const t0 = performance.now()
  const warnings = plan.warnings.slice()
  const base: Tier2Result = {
    shape: null, tier: 'failed', faceCount: 0, valid: null,
    deviation: { max: NaN, mean: NaN, samples: 0 }, warnings, plan, msPlan: 0, msBuild: 0,
  }
  if (plan.declined) return { ...base, tier: 'declined' }
  const W = OC?.FitWrapper
  if (!W) { warnings.push('OC.FitWrapper 唔存在 —— 內核未重建（_occt-build/_rebuilt）'); return { ...base, tier: 'declined' } }

  const faces: OCShape[] = []
  for (const fp of plan.faces) {
    const f = buildFace(OC, fp, plan, warnings)
    if (f && shapeType(f) === ST_FACE) faces.push(f)
    else { warnings.push(`組 ${fp.group}（${fp.kind}）缺面 → Tier-2 放棄`); return { ...base, tier: 'declined', msBuild: performance.now() - t0 } }
  }
  if (faces.length < 2) { warnings.push('起到嘅面少過 2 張'); return { ...base, tier: 'declined', msBuild: performance.now() - t0 } }

  let shape: OCShape | null = null
  let tier: Tier2Tier = 'failed'
  try { shape = nonNull(W.SewSolidify(faces, plan.sewTol, true)) } catch (e) { warnings.push(`SewSolidify(closed) 拋 ${(e as Error)?.message ?? e}`) }
  if (shape) tier = 'solid'
  if (!shape) {
    try { shape = nonNull(W.SewSolidify(faces, plan.sewTol, false)) } catch (e) { warnings.push(`SewSolidify(open) 拋 ${(e as Error)?.message ?? e}`) }
    if (shape) {
      tier = 'shell'
      let free = -1
      try { free = JSON.parse(W.FreeBoundaryInfo(shape)).freeEdges } catch { /* */ }
      warnings.push(`閉合縫合失敗 → 開放殼（自由邊 ${free}）`)
    }
  }
  if (!shape) { warnings.push('縫合完全失敗'); return { ...base, msBuild: performance.now() - t0 } }

  const valid = checkValid(OC, shape)
  if (valid === false) warnings.push('BRepCheck_Analyzer 報唔有效')
  return {
    shape, tier, faceCount: countFaces(OC, shape), valid,
    deviation: sampleDeviation(seg, OC, shape, opts.deviationSamples ?? 400),
    warnings, plan, msPlan: 0, msBuild: performance.now() - t0,
  }
}

/**
 * 網格頂點 → 重建面嘅最近距離（逐面取 min，繞開 BRepExtrema 喺錐面收斂落錯極值嘅已知陷阱）。
 * ⚠ 呢個數係【診斷】唔係驗收閘：M2 DeviationSample 用 GeomAPI_ProjectPointOnSurf，佢只搵
 *   uv 窗【內部】嘅極值 —— 盒角嘅頂點投影啱啱好落喺面嘅 uv 邊界上，NbPoints()==0，該面會俾跳過，
 *   結果報返「對面嗰塊面」嘅距離（實測密網格 boss：整體量報 60mm，逐面取 min 報 0.51mm，
 *   而同一批點對【原始 fixture 實體】量係 0.0000mm）。真正嘅正確性證據係體積 + BRepCheck + 可鑲嵌。
 */
function sampleDeviation(seg: SegmentationResult, OC: OCModule, shape: OCShape, want: number): { max: number; mean: number; samples: number } {
  const nv = seg.verts.length / 3
  if (!nv) return { max: NaN, mean: NaN, samples: 0 }
  const step = Math.max(1, Math.floor(nv / Math.max(1, want)))
  const pts: number[] = []
  for (let i = 0; i < nv; i += step) pts.push(seg.verts[i * 3], seg.verts[i * 3 + 1], seg.verts[i * 3 + 2])
  const measure = (target: OCShape): number[] | null => {
    try {
      const arr = JSON.parse(OC.FitWrapper.DeviationSample(target, pts)) as number[]
      return Array.isArray(arr) && arr.length === pts.length / 3 ? arr : null
    } catch { return null }
  }
  let best: number[] | null = null
  try {
    const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
    let nf = 0
    for (; ex.More() && nf < 64; ex.Next(), nf++) {
      const arr = measure(ex.Current())
      if (!arr) continue
      if (!best) best = arr.map((d) => Math.abs(d))
      else for (let i = 0; i < arr.length; i++) best[i] = Math.min(best[i], Math.abs(arr[i]))
    }
  } catch { best = null }
  if (!best) best = measure(shape)?.map((d) => Math.abs(d)) ?? null
  if (!best || !best.length) return { max: NaN, mean: NaN, samples: 0 }
  let mx = 0, sum = 0
  for (const a of best) { if (a > mx) mx = a; sum += a }
  return { max: mx, mean: sum / best.length, samples: best.length }
}

/** 一站式：SegmentationResult + 內核 → Tier-2 實體（起唔到 → tier='declined'，上層照跑 M3）。 */
export function reconstructTier2(seg: SegmentationResult, OC: OCModule, opts: Tier2Options = {}): Tier2Result {
  const t0 = performance.now()
  const plan = planTier2(seg, opts)
  const msPlan = performance.now() - t0
  const res = executeTier2(seg, plan, OC, opts)
  res.msPlan = msPlan
  return res
}
