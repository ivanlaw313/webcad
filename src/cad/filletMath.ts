// filletMath.ts — R1「修改圆角」纯数学核（无 OCCT / replicad 依赖，可喺 Node/tsx 直接 import 测试）。
//
// 点解抽出嚟做独立模块：cad.worker.ts 用咗 Vite 专属 `?url` / wasm import，喺 Node/tsx 跑唔起
//   （同 edgeFingerprint.ts / faceFingerprint.ts / moveFacePlan.ts 一样嘅切法）。故把「圆角究竟点换算 /
//   点起 (U,r) 律 / 面圆角切点点解」嘅纯逻辑放呢度：worker 真行嘅决策同 tests/filletr1.test.mjs 测嘅
//   系【同一段码】，保证证过嘅数学同上线行为一致。
//
// 三种圆角对应（详见 _fusion_r1_fillet_plan.md）：
//   1. 弦高圆角 chord — chordToRadius / betaFromNormals / buildChordRadiusLaw
//   2. 收进圆角 setback — buildSetbackLaw
//   3. 面圆角 face-fillet 切点解析 — planePlaneFilletSetback / planeCylinderFilletContacts + bboxExtentsSane（HARD FLOOR 判据）

export type Vec3 = [number, number, number]

const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// ─────────────────────────────────────────────────────────────────────────────
// 1. 弦高圆角 chord-length
// ─────────────────────────────────────────────────────────────────────────────
//
// 几何：两个平面沿一条棱相交，材料侧二面角 = β（interior/material dihedral）。半径 r 嘅圆弧圆角
//   同两面相切，两切点之间嘅【弦】长 = c。圆弧中心角 = π − β，故
//     c = 2r·sin((π−β)/2) = 2r·cos(β/2)   ⇒   r = c / (2·cos(β/2))
//   盒边 β=90° ⇒ r = c/(2·cos45°) = c/√2（与 plan 一致）。
//
// betaRad 逼近 π（面近乎共面 = 几乎无棱）时 cos(β/2)→0、r→∞ → clamp 分母下限，返有限值（caller
//   再按弦长上限钳）。betaRad ≤ 0（退化）→ 返 chord/2（当作纯平弦，半径 = 半弦）。
export function chordToRadius(chord: number, betaRad: number): number {
  const c = Math.max(0, chord)
  if (!(betaRad > 0)) return c / 2
  const cosHalf = Math.cos(betaRad / 2)
  const denom = 2 * Math.max(cosHalf, 1e-3)   // clamp 防 β→π 爆掉
  return c / denom
}

// 由两【外向】面法向算材料侧二面角 β。
//   两外法向夹角 θ = acos(n1·n2)；凸棱：外法向夹角 = π − β ⇒ β = π − θ。
//   盒边（两外法向 ⟂）θ=90° ⇒ β = 90°（与手算一致）。
//   n1/n2 会先归一化；退化（零向量）→ 返 π/2（当直角，安全缺省）。
export function betaFromNormals(n1: Vec3, n2: Vec3): number {
  const l1 = Math.hypot(n1[0], n1[1], n1[2])
  const l2 = Math.hypot(n2[0], n2[1], n2[2])
  if (l1 < 1e-9 || l2 < 1e-9) return Math.PI / 2
  const u1: Vec3 = [n1[0] / l1, n1[1] / l1, n1[2] / l1]
  const u2: Vec3 = [n2[0] / l2, n2[1] / l2, n2[2] / l2]
  const theta = Math.acos(clamp(dot3(u1, u2), -1, 1))
  return Math.PI - theta
}

// 便捷组合：直接由弦 + 两外法向 → 半径。
export function chordRadiusFromNormals(chord: number, n1: Vec3, n2: Vec3): number {
  return chordToRadius(chord, betaFromNormals(n1, n2))
}

// 变角边（曲棱，β 沿棱变）：逐采样点 (u, β) → (u, r)。粗版取端点两元组做线性锥变，精版喂内核 (U,r) 律。
//   samples 需按 u 升序；空 → 空数组。r 用 chordToRadius 逐点换算（弦长恒定，β 变 → r 变）。
export function buildChordRadiusLaw(
  samples: { u: number; beta: number }[],
  chord: number,
): { u: number; r: number }[] {
  return samples.map((s) => ({ u: s.u, r: chordToRadius(chord, s.beta) }))
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. 收进圆角 setback（诚实窄版：半径向共享顶点递减 radius-taper recession）
// ─────────────────────────────────────────────────────────────────────────────
//
// 一条邻接共享顶点嘅棱：中段用目标半径 r，靠近顶点嗰段线性降到 r·(1−setbackRatio)。
//   touchLo / touchHi = 该棱系咪喺 u=0 / u=1 端接触共享顶点（只 taper 接触嗰端）。
//   setbackRatio ∈ [0,1)（0 = 无收进 = 全程 r）；taperFrac = 收进过渡占棱长比例（缺省 0.28）。
//   返回按 u 升序嘅 (u,r) 控制点数组（≥2 点），可直接喂内核 Add_5(TColgp_Array1OfPnt2d)。
export function buildSetbackLaw(
  r: number,
  setbackRatio: number,
  touchLo: boolean,
  touchHi: boolean,
  taperFrac = 0.28,
): { u: number; r: number }[] {
  const rr = Math.max(1e-3, r)
  const sb = clamp(setbackRatio || 0, 0, 0.95)
  const tf = clamp(taperFrac, 0.05, 0.45)
  const rEnd = rr * (1 - sb)
  // 无收进 或 两端都唔接触 → 平律（两点即可）。
  if (sb < 1e-6 || (!touchLo && !touchHi)) return [{ u: 0, r: rr }, { u: 1, r: rr }]
  const pts: { u: number; r: number }[] = []
  pts.push({ u: 0, r: touchLo ? rEnd : rr })
  pts.push({ u: tf, r: rr })
  pts.push({ u: 1 - tf, r: rr })
  pts.push({ u: 1, r: touchHi ? rEnd : rr })
  return pts
}

// 两条棱系咪共享一个顶点（端点几何重合，容差内）。ep = 每条棱两端点（u=0,u=1 世界坐标）。
export function edgesShareVertex(
  a: { p0: Vec3; p1: Vec3 },
  b: { p0: Vec3; p1: Vec3 },
  tol = 1e-4,
): { share: boolean; aTouchLo: boolean; aTouchHi: boolean } {
  const close = (p: Vec3, q: Vec3) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) <= tol
  const a0 = close(a.p0, b.p0) || close(a.p0, b.p1)
  const a1 = close(a.p1, b.p0) || close(a.p1, b.p1)
  return { share: a0 || a1, aTouchLo: a0, aTouchHi: a1 }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. 面圆角 face-fillet 切点解析（clean-room 窄版：平面/柱面对）
// ─────────────────────────────────────────────────────────────────────────────
//
// 平面-平面：两面延伸相交于一条虚交线，半径 r 圆角同两面相切，切点线平行虚交线、由交线沿各面
//   收进 setback = r / tan(β/2)（β = 两面之间圆角侧二面角）。β→0（近共面）→ setback→∞ → clamp。
export function planePlaneFilletSetback(r: number, dihedralRad: number): number {
  const rr = Math.max(0, r)
  const half = clamp(dihedralRad, 1e-3, Math.PI - 1e-3) / 2
  return rr / Math.max(Math.tan(half), 1e-3)
}

// 平面-柱面（柱轴 ⟂ 平面，凸台根部圆角常见工况）：半径 r 球滚喺平面与柱之凹角。
//   external=true（柱企喺平面上、外圆角）：球心距轴 = R + r、离平面高 r。
//     平面上切点 = 轴脚正下、半径 (R + r) 嘅圆；柱面上切点 = 高 r、半径 R 嘅圆。
//   external=false（孔内圆角）：平面切圆半径 = R − r。
//   返回 { planeCircleR, cylContactHeight, cylContactR }。R−r<0（r 过大）→ planeCircleR 钳 0。
export function planeCylinderFilletContacts(
  R: number,
  r: number,
  external = true,
): { planeCircleR: number; cylContactHeight: number; cylContactR: number } {
  const RR = Math.max(0, R)
  const rr = Math.max(0, r)
  const planeCircleR = external ? RR + rr : Math.max(0, RR - rr)
  return { planeCircleR, cylContactHeight: rr, cylContactR: RR }
}

// 面对分类（供 worker 拣解析路径）：由两面几何类型 + r 判定用边条切点解析、定诚实降级。
export type FacePairKind = 'plane-plane' | 'plane-cylinder' | 'cylinder-cylinder' | 'general'
export function classifyFacePair(t1: string, t2: string): FacePairKind {
  // replicad geomType 系大写（'PLANE' / 'CYLINDRE'）；大小写不敏感匹配（'plane'/'cylinder' 亦收）。
  const norm = (t: string) => { const u = String(t).toUpperCase(); return u.includes('PLANE') ? 'plane' : u.includes('CYLIND') ? 'cyl' : 'other' }
  const a = norm(t1), b = norm(t2)
  if (a === 'plane' && b === 'plane') return 'plane-plane'
  if ((a === 'plane' && b === 'cyl') || (a === 'cyl' && b === 'plane')) return 'plane-cylinder'
  if (a === 'cyl' && b === 'cyl') return 'cylinder-cylinder'
  return 'general'
}

// ─────────────────────────────────────────────────────────────────────────────
// HARD FLOOR 判据（三种圆角共用）：候选结果 bbox 各维 extent 须【有界】且相对参考包络【无爆冲】。
//   allowGrowDiagFrac = 容许候选比参考大出（参考对角 × 该比例 + 1mm）—— 圆角/补面适度拱起容许，
//   拒收 GeomPlate 未收敛式 ±100mm 过冲。任一维非有限 / 超界 → 返 false（caller 退回操作前实体）。
// ─────────────────────────────────────────────────────────────────────────────
export function bboxExtentsSane(
  cand: [Vec3, Vec3] | null | undefined,
  ref: [Vec3, Vec3] | null | undefined,
  allowGrowDiagFrac = 0.6,
): boolean {
  if (!cand || !ref) return false
  const ext = (bb: [Vec3, Vec3], i: number) => bb[1][i] - bb[0][i]
  const refDiag = Math.hypot(ext(ref, 0), ext(ref, 1), ext(ref, 2)) || 1
  for (let i = 0; i < 3; i++) {
    const a0 = cand[0][i], a1 = cand[1][i]
    if (!Number.isFinite(a0) || !Number.isFinite(a1)) return false
    const ce = a1 - a0
    if (!(ce >= -1e-9)) return false                                   // 反转/退化
    if (ce > ext(ref, i) + refDiag * allowGrowDiagFrac + 1) return false // 爆冲
  }
  return true
}
