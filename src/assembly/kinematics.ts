import { Matrix4, Vector3 } from 'three'

export type JointType = 'rigid' | 'revolute' | 'slider' | 'cylindrical' | 'ball' | 'planar' | 'screw' | 'pinslot'

// A joint positions its `child` component relative to its `parent` component.
// anchor/axis are in three.js world coords (what you see in the viewport).
export type Joint = {
  id: string
  name: string
  type: JointType
  parent: string
  child: string
  anchor: [number, number, number]
  axis: [number, number, number]
  angle: number // degrees (revolute / cylindrical / ball-Z / planar-about-axis)
  slide: number // mm (slider / cylindrical / planar-U)
  angle2?: number; angle3?: number // ball: extra rotations about Y, X (deg)
  slide2?: number // planar: translation along in-plane V (mm)
  aMin?: number; aMax?: number // angle limits (deg)
  sMin?: number; sMax?: number // slide limits (mm)
  lead?: number // screw joint: axial travel per full revolution (mm/rev); slide = angle/360 · lead
  axis2?: [number, number, number] // T782 pinslot: slot slide direction (world)；缺省 = axis×ref 推导（⊥ 销轴，同 planar U 同约定）
  // GM-3DV4 A3：Rest（rest/neutral position）—— 归零/回复即回到此值（缺省 undefined=0 → 逐字节旧行为）。
  //   主自由度：slider=slide、其余转动类=angle。JointsPanel 显示；homeJoints 驱动到此。
  rest?: number
  // GM-3DV4 A2：两 joint-origin 之间嘅【静止偏移】（Fusion Joint Position tab 的 Offset X/Y/Z + Angle + Flip）。
  //   offset 喺关节基（u/v/axis）表达 = [沿U, 沿V, 沿轴]；originAngle 绕轴嘅静止转角°；flip 反转关节轴向。
  //   全缺省（无 offset/originAngle/flip）→ restOffset=单位、axis 不反 → jointMotion/FK 逐字节旧行为（旧档零回归）。
  offset?: [number, number, number]
  originAngle?: number
  flip?: boolean
  // GM-3DV4 A1：引用可复用 Joint Origin 实体 id（浏览器 provenance / 重解锚点用；kinematics 唔直接读 —
  //   建关节时已把 origin 解算入 anchor/axis/offset）。
  originRef?: string
  // The child-side Joint Origin used when a Fusion-style pair is selected.
  // anchor/axis remain the resolved parent frame for backward compatibility.
  originRef2?: string
  // GM-3DV4 A8：所属刚性组节点 id（rigidGroupChecked 建嘅底层 rigid 关节打此标；抑制刚性组即删呢批）。
  groupRef?: string
}

// GM-3DV4 A1：可复用命名 Joint Origin 实体（Fusion CREATE > Joint Origin，唯一实证 live 嘅装配特性）。
//   snap 点 + Mode(Simple/Between-2-Faces/2-Edge-Intersection) + Angle + X/Y/Z Offset + Flip + 可选轴对齐。
//   存自己嘅数组 + 浏览器「Joint Origins」组；关节可引用之取代硬编码 componentCenter。
export type JointOriginMode = 'simple' | 'twoFaces' | 'twoEdges'
export type JointOrigin = {
  id: string
  name: string
  point: [number, number, number]        // snap 点（three.js world）
  mode: JointOriginMode
  angle: number                          // 绕法向嘅帧旋转°（存储；关节引用时喂 originAngle）
  offset: [number, number, number]       // X/Y/Z 偏移（world）
  flip: boolean
  axis?: [number, number, number]        // 轴对齐（缺省 = 世界 +Z）
  compId?: string                        // 归属组件（可选，供浏览器分组）
}

// Resolve a Joint Origin frame.  Visual/pairing callers use the effective
// (flipped) axis; when writing a Joint, request the raw axis and let the
// Joint's own flip flag be the single source of motion-direction reversal.
export function resolveJointOrigin(jo: JointOrigin, applyFlip = true): { anchor: [number, number, number]; axis: [number, number, number] } {
  const anchor: [number, number, number] = [jo.point[0] + jo.offset[0], jo.point[1] + jo.offset[1], jo.point[2] + jo.offset[2]]
  const ax = new Vector3(jo.axis?.[0] ?? 0, jo.axis?.[1] ?? 0, jo.axis?.[2] ?? 1)
  if (ax.lengthSq() < 1e-9) ax.set(0, 0, 1)
  ax.normalize()
  if (applyFlip && jo.flip) ax.multiplyScalar(-1)
  return { anchor, axis: [ax.x, ax.y, ax.z] }
}

export const JOINT_DOF: Record<JointType, number> = { rigid: 0, revolute: 1, slider: 1, cylindrical: 2, ball: 3, planar: 3, screw: 1, pinslot: 2 }
export const JOINT_LABEL: Record<JointType, string> = { rigid: '刚性', revolute: '旋转', slider: '滑动', cylindrical: '圆柱', ball: '球', planar: '平面', screw: '螺旋', pinslot: '销槽' }

// The local motion A_J(v) of a joint, expressed in rest-world coords.
function jointMotion(j: Joint): Matrix4 {
  const axis = new Vector3(j.axis[0], j.axis[1], j.axis[2])
  if (!Number.isFinite(axis.lengthSq()) || axis.lengthSq() < 1e-9) axis.set(0, 1, 0)   // bt4: NaN axis(NaN<x=false 绕过原守卫)→ 显式 finite 守卫,免 normalize 传播 NaN
  axis.normalize()
  if (j.flip) axis.multiplyScalar(-1)   // GM-3DV4 A2：Flip 反转关节轴向（旋转/滑动方向反转）；缺省不反 → 逐字节旧行为
  const a = new Vector3(j.anchor[0], j.anchor[1], j.anchor[2])
  const m = new Matrix4()
  const rad = (d: number) => (d * Math.PI) / 180
  // Enforce joint limits HERE — the single source of truth — so every consumer (FK, motion trace, envelope,
  // spin animation, save/load) respects them, not just the UI sliders' min/max. Undefined limit = unbounded.
  const clampA = (x: number) => Math.min(j.aMax ?? Infinity, Math.max(j.aMin ?? -Infinity, x))
  const clampS = (x: number) => Math.min(j.sMax ?? Infinity, Math.max(j.sMin ?? -Infinity, x))
  const ang = clampA(j.angle), ang2 = clampA(j.angle2 ?? 0), ang3 = clampA(j.angle3 ?? 0)
  const sld = clampS(j.slide), sld2 = clampS(j.slide2 ?? 0)
  const Ta = new Matrix4().makeTranslation(a.x, a.y, a.z)
  const Tna = new Matrix4().makeTranslation(-a.x, -a.y, -a.z)
  if (j.type === 'revolute' || j.type === 'cylindrical') {
    const R = new Matrix4().makeRotationAxis(axis, rad(ang))
    // rotate about the anchor point: T(a) · R · T(-a)
    m.multiply(Ta).multiply(R).multiply(Tna)
  }
  if (j.type === 'slider' || j.type === 'cylindrical') {
    m.premultiply(new Matrix4().makeTranslation(axis.x * sld, axis.y * sld, axis.z * sld))
  }
  if (j.type === 'screw') {
    // Helical 1-DOF: rotate about the axis by `ang`, and advance along it by (ang/360)·lead (bolt / lead-screw).
    const R = new Matrix4().makeRotationAxis(axis, rad(ang))
    m.multiply(Ta).multiply(R).multiply(Tna)
    const adv = (ang / 360) * (j.lead ?? 0)
    m.premultiply(new Matrix4().makeTranslation(axis.x * adv, axis.y * adv, axis.z * adv))
  }
  if (j.type === 'ball') {
    // 3 rotations about world Z, Y, X (angle, angle2, angle3), all about the anchor
    const R = new Matrix4().makeRotationAxis(new Vector3(0, 0, 1), rad(ang))
      .multiply(new Matrix4().makeRotationAxis(new Vector3(0, 1, 0), rad(ang2)))
      .multiply(new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), rad(ang3)))
    m.multiply(Ta).multiply(R).multiply(Tna)
  }
  if (j.type === 'pinslot') {
    // T782 pin-slot（销槽，Fusion 同款 2-DOF）：绕销轴转 angle + 沿槽向滑 slide。
    // 槽向 = axis2（显式设定）或 axis×ref 推导（⊥ 销轴，同 planar U 基同一确定性约定）。
    const R = new Matrix4().makeRotationAxis(axis, rad(ang))
    m.multiply(Ta).multiply(R).multiply(Tna)
    let u: Vector3
    if (j.axis2 && Math.hypot(j.axis2[0], j.axis2[1], j.axis2[2]) > 1e-9) u = new Vector3(j.axis2[0], j.axis2[1], j.axis2[2]).normalize()
    else { const ref = Math.abs(axis.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0); u = new Vector3().crossVectors(axis, ref).normalize() }
    m.premultiply(new Matrix4().makeTranslation(u.x * sld, u.y * sld, u.z * sld))
  }
  if (j.type === 'planar') {
    // rotation about axis (angle) + translation in the plane ⊥ axis along basis U,V
    const ref = Math.abs(axis.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
    const u = new Vector3().crossVectors(axis, ref).normalize()
    const v = new Vector3().crossVectors(axis, u).normalize()
    const R = new Matrix4().makeRotationAxis(axis, rad(ang))
    m.multiply(Ta).multiply(R).multiply(Tna)
    m.premultiply(new Matrix4().makeTranslation(u.x * sld + v.x * sld2, u.y * sld + v.y * sld2, u.z * sld + v.z * sld2))
  }
  return m // rigid → identity
}

// GM-3DV4 A2：两 joint-origin 之间嘅【静止偏移】矩阵（同 jointMotion 一样喺 rest-world 表达，绕 anchor）。
//   offset 喺关节基（u/v/axis）表达；originAngle 绕轴静止转°。全缺省 → 返单位（旧关节 FK 逐字节不变）。
//   FK 复合次序 M_child = M_parent · jointMotion(v) · restOffset —— 静止偏移嵌喺驱动之内，
//   即「子件坐喺一条偏移臂上、绕关节轴摆动」（偏置铰链门嘅日常语义）。
function restOffset(j: Joint): Matrix4 {
  const off = j.offset, oa = j.originAngle ?? 0
  const hasOff = !!off && (off[0] !== 0 || off[1] !== 0 || off[2] !== 0)
  if (!hasOff && oa === 0) return new Matrix4()   // 单位 → 旧关节零回归
  const axis = new Vector3(j.axis[0], j.axis[1], j.axis[2])
  if (!Number.isFinite(axis.lengthSq()) || axis.lengthSq() < 1e-9) axis.set(0, 1, 0)
  axis.normalize()
  if (j.flip) axis.multiplyScalar(-1)
  const a = new Vector3(j.anchor[0], j.anchor[1], j.anchor[2])
  // 关节基（同 jointMotion planar / JointGizmo 同一确定性约定）
  const ref = Math.abs(axis.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0)
  const u = new Vector3().crossVectors(axis, ref).normalize()
  const v = new Vector3().crossVectors(axis, u).normalize()
  const m = new Matrix4()
  if (oa !== 0) {
    const R = new Matrix4().makeRotationAxis(axis, (oa * Math.PI) / 180)
    const Ta = new Matrix4().makeTranslation(a.x, a.y, a.z)
    const Tna = new Matrix4().makeTranslation(-a.x, -a.y, -a.z)
    m.multiply(Ta).multiply(R).multiply(Tna)
  }
  if (hasOff) {
    const d = new Vector3(
      u.x * off![0] + v.x * off![1] + axis.x * off![2],
      u.y * off![0] + v.y * off![1] + axis.y * off![2],
      u.z * off![0] + v.z * off![1] + axis.z * off![2],
    )
    m.premultiply(new Matrix4().makeTranslation(d.x, d.y, d.z))
  }
  return m
}

// Forward kinematics over the joint tree: world motion matrix per component.
// M_child = M_parent · A_joint(value) · restOffset.  Roots (no incoming joint) stay at identity.
export function computeFK(componentIds: string[], joints: Joint[]): Map<string, Matrix4> {
  const M = new Map<string, Matrix4>()
  componentIds.forEach((id) => M.set(id, new Matrix4()))
  const childJoint = new Map<string, Joint>()
  joints.forEach((j) => childJoint.set(j.child, j))

  const done = new Set<string>()
  const visiting = new Set<string>()
  const resolve = (id: string): Matrix4 => {
    if (done.has(id)) return M.get(id)!
    if (visiting.has(id)) return M.get(id) ?? new Matrix4() // cycle guard
    visiting.add(id)
    const j = childJoint.get(id)
    if (j && M.has(j.parent)) {
      const Mp = resolve(j.parent)
      M.set(id, Mp.clone().multiply(jointMotion(j)).multiply(restOffset(j)))   // GM-3DV4 A2：驱动后叠静止偏移（缺省=单位）
    }
    visiting.delete(id)
    done.add(id)
    return M.get(id)!
  }
  componentIds.forEach(resolve)
  return M
}

export function totalDOF(joints: Joint[]): number {
  return joints.reduce((n, j) => n + JOINT_DOF[j.type], 0)
}

// ── Closed-loop kinematics: planar 4-bar linkage (constraint solver) ─────────────────────────────
// A 4-bar is a closed loop: ground·A → crank → (B) → coupler → (C) → rocker → (D) ground. All joints
// revolute about +Z (planar, in the XY plane). Driving the crank angle θ, the coupler/rocker poses are
// DETERMINED by loop closure — tree-FK can't do this; we solve C as the intersection of two circles.
type V2 = [number, number]
const v2 = (p: [number, number, number]): V2 => [p[0], p[1]]
const sub2 = (a: V2, b: V2): V2 => [a[0] - b[0], a[1] - b[1]]
const len2 = (a: V2): number => Math.hypot(a[0], a[1])
const dist2 = (a: V2, b: V2): number => len2(sub2(a, b))
// Intersection of circles (c0,r0)·(c1,r1). branch ±1 picks which of the two solutions. null if unreachable.
function circleCircle(c0: V2, r0: number, c1: V2, r1: number, branch: 1 | -1): V2 | null {
  const dx = c1[0] - c0[0], dy = c1[1] - c0[1], d = Math.hypot(dx, dy)
  if (d < 1e-9 || d > r0 + r1 + 1e-6 || d < Math.abs(r0 - r1) - 1e-6) return null  // coincident / unreachable
  const a = (r0 * r0 - r1 * r1 + d * d) / (2 * d)
  const h2 = r0 * r0 - a * a, h = h2 > 0 ? Math.sqrt(h2) : 0
  const mx = c0[0] + (a * dx) / d, my = c0[1] + (a * dy) / d
  return [mx + branch * (h * dy) / d, my - branch * (h * dx) / d]
}
// A 2D rotation by `ang` (rad) about world-Z through centre `c` (z preserved), as a Matrix4.
function rotZAbout(c: V2, ang: number): Matrix4 {
  return new Matrix4().makeTranslation(c[0], c[1], 0)
    .multiply(new Matrix4().makeRotationZ(ang))
    .multiply(new Matrix4().makeTranslation(-c[0], -c[1], 0))
}
export type FourBar = { A: V2; D: V2; B0: V2; C0: V2 }  // rest geometry (XY): A,D ground pivots; B0 crank end; C0 coupler·rocker joint
export type FourBarSolution = { B: V2; C: V2; crank: Matrix4; coupler: Matrix4; rocker: Matrix4; ok: boolean }
// Solve the 4-bar at crank angle θ (deg). branch keeps the assembly mode continuous (default +1, matching rest).
export function solve4Bar(g: FourBar, thetaDeg: number, branch: 1 | -1 = 1): FourBarSolution {
  const th = (thetaDeg * Math.PI) / 180
  const L2 = dist2(g.B0, g.C0)   // coupler length
  const L3 = dist2(g.D, g.C0)    // rocker length
  // crank end after rotating B0 about A by θ
  const cs = Math.cos(th), sn = Math.sin(th)
  const bx = g.A[0] + cs * (g.B0[0] - g.A[0]) - sn * (g.B0[1] - g.A[1])
  const by = g.A[1] + sn * (g.B0[0] - g.A[0]) + cs * (g.B0[1] - g.A[1])
  const B: V2 = [bx, by]
  const C = circleCircle(B, L2, g.D, L3, branch)
  if (!C) return { B, C: g.C0, crank: rotZAbout(g.A, th), coupler: new Matrix4(), rocker: new Matrix4(), ok: false }
  const crank = rotZAbout(g.A, th)
  // rocker: rotate about D so C0 → C
  const rockAng = Math.atan2(C[1] - g.D[1], C[0] - g.D[0]) - Math.atan2(g.C0[1] - g.D[1], g.C0[0] - g.D[0])
  const rocker = rotZAbout(g.D, rockAng)
  // coupler: rigid map B0→B, C0→C  ⇒  T(B)·Rz(coupAng)·T(−B0)
  const coupAng = Math.atan2(C[1] - B[1], C[0] - B[0]) - Math.atan2(g.C0[1] - g.B0[1], g.C0[0] - g.B0[0])
  const coupler = new Matrix4().makeTranslation(B[0], B[1], 0)
    .multiply(new Matrix4().makeRotationZ(coupAng))
    .multiply(new Matrix4().makeTranslation(-g.B0[0], -g.B0[1], 0))
  return { B, C, crank, coupler, rocker, ok: true }
}

// S193：四连杆【速度比 + 传动角】分析（Fusion Motion Study 机构指标）。纯函数（reuse solve4Bar），Node-testable。
//   velocityRatio = ω_摇杆/ω_曲柄 = dφ/dθ（数值中心差分 rocker 角 φ 对 crank 角 θ）。
//   transmission = 传动角 μ = C 处【连杆 CB】同【摇杆 CD】嘅夹角（理想 90°；<40° 或 >140° 力传递差、机构发卡）。
//   死点（toggle）处 |velocityRatio|→∞ / μ→0/180（机构瞬时锁死）。ok=false 时该角度装配唔闭合。
export type FourBarKinematics = { ratio: number; transmission: number; mech: number; ok: boolean }
export function fourBarVelocity(g: FourBar, thetaDeg: number, branch: 1 | -1 = 1): FourBarKinematics {
  const s0 = solve4Bar(g, thetaDeg, branch)
  const dth = 0.02
  const s1 = solve4Bar(g, thetaDeg + dth, branch)
  if (!s0.ok || !s1.ok) return { ratio: NaN, transmission: NaN, mech: NaN, ok: false }
  // rocker 角 φ = atan2(C − D)；中心差分（带 2π unwrap）
  const phi0 = Math.atan2(s0.C[1] - g.D[1], s0.C[0] - g.D[0])
  const phi1 = Math.atan2(s1.C[1] - g.D[1], s1.C[0] - g.D[0])
  let dphi = phi1 - phi0
  while (dphi > Math.PI) dphi -= 2 * Math.PI
  while (dphi < -Math.PI) dphi += 2 * Math.PI
  const ratio = dphi / ((dth * Math.PI) / 180)   // ω_摇杆/ω_曲柄（无量纲）
  // 传动角 μ：C 处 CB 同 CD 嘅夹角
  const cbx = s0.B[0] - s0.C[0], cby = s0.B[1] - s0.C[1]
  const cdx = g.D[0] - s0.C[0], cdy = g.D[1] - s0.C[1]
  const mag = Math.hypot(cbx, cby) * Math.hypot(cdx, cdy) || 1e-12
  const mu = (Math.acos(Math.max(-1, Math.min(1, (cbx * cdx + cby * cdy) / mag))) * 180) / Math.PI
  // 机械利益 MA = ω_in/ω_out = 1/|ratio|（理想无摩擦；力放大）
  const mech = Math.abs(ratio) > 1e-9 ? 1 / Math.abs(ratio) : Infinity
  return { ratio, transmission: mu, mech, ok: true }
}
// 扫曲柄 0–360° 出 {θ, 速度比, 传动角, 机械利益} 曲线（绘图/找死点/最差传动角）。
export function fourBarVelocityProfile(g: FourBar, branch: 1 | -1 = 1, steps = 72): { theta: number; ratio: number; transmission: number; mech: number; ok: boolean }[] {
  const out: { theta: number; ratio: number; transmission: number; mech: number; ok: boolean }[] = []
  const n = Math.max(8, Math.floor(steps))
  for (let i = 0; i <= n; i++) { const th = (360 * i) / n; const v = fourBarVelocity(g, th, branch); out.push({ theta: th, ...v }) }
  return out
}
// S98：1-DOF「扫到接触」通用工具（角=°/移=mm 共用）。由 start 沿 dir 等步扫，collides(v) 命中即
// 二分 9 次逼近接触前，再退 backoff 企稳喺非碰撞区。hit=false = 整段都冇撞。纯函数、无 store 依赖。
export type SweepKey = 'angle' | 'slide'
export function sweepToContact(opts: { start: number; dir: 1 | -1; stepSize: number; maxSpan: number; backoff: number; collides: (v: number) => boolean }): { hit: boolean; stop: number } {
  const { start, dir, stepSize, maxSpan, backoff, collides } = opts
  if (collides(start)) return { hit: false, stop: start }
  const steps = Math.max(1, Math.ceil(maxSpan / stepSize))
  let prev = start, hit: number | null = null
  for (let i = 1; i <= steps; i++) { const v = start + dir * stepSize * i; if (collides(v)) { hit = v; break } prev = v }
  if (hit == null) return { hit: false, stop: prev }
  let lo = prev, hi = hit
  for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (collides(mid)) hi = mid; else lo = mid }
  let stop = lo - dir * backoff
  if ((dir > 0 && stop < start) || (dir < 0 && stop > start)) stop = start
  return { hit: true, stop }
}

// Expose helpers for the test harness / self-check (DEV).
export const _fourbar = { circleCircle, dist2, v2 }

// ── General planar (2D) pin-jointed linkage solver (C4) ──────────────────────────────────────────
// Newton–Raphson (Gauss-Newton + Levenberg damping) on SQUARED rigid-link residuals |Pi−Pj|²−L²=0.
// Solves the FREE points so every link keeps its length, with `fixed` points pinned (ground + the driven
// crank end). General — subsumes 4-bar / slider-crank / six-bar / any 2D pin linkage that tree-FK can't close.
export type Link = { i: number; j: number; len: number }
// Solve a small dense linear system A·x=b by Gaussian elimination with partial pivoting. Returns null if singular.
export function gaussSolve(A: number[][], b: number[]): number[] | null {
  const n = b.length
  const M = A.map((row, k) => [...row, b[k]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-12) return null
    ;[M[c], M[piv]] = [M[piv], M[c]]
    for (let r = 0; r < n; r++) {
      if (r === c) continue
      const f = M[r][c] / M[c][c]
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  return M.map((row, c) => row[n] / row[c])
}
export function solveLinkage(points: V2[], links: Link[], fixed: number[], iters = 200, tol = 1e-8): { points: V2[]; residual: number; iters: number; ok: boolean } {
  const P: V2[] = points.map((p) => [p[0], p[1]])
  const isFixed = new Set(fixed)
  const free: number[] = []
  for (let k = 0; k < P.length; k++) if (!isFixed.has(k)) free.push(k)
  const colOf = new Map<number, number>(); free.forEach((idx, c) => colOf.set(idx, c))
  const n = free.length * 2
  let res = Infinity, it = 0
  if (n === 0) { // fully constrained → just report residual
    let mr = 0; for (const { i, j, len } of links) { const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1]; mr = Math.max(mr, Math.abs(dx * dx + dy * dy - len * len)) }
    return { points: P, residual: mr, iters: 0, ok: mr < 1e-4 }
  }
  for (; it < iters; it++) {
    const m = links.length, r = new Float64Array(m)
    let maxr = 0
    for (let e = 0; e < m; e++) { const { i, j, len } = links[e]; const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1]; r[e] = dx * dx + dy * dy - len * len; if (Math.abs(r[e]) > maxr) maxr = Math.abs(r[e]) }
    res = maxr
    if (maxr < tol) break
    const JTJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0))
    const JTr = new Array(n).fill(0)
    for (let e = 0; e < m; e++) {
      const { i, j } = links[e]; const dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1]
      const rows: [number, number][] = []
      const ci = colOf.get(i); if (ci !== undefined) { rows.push([ci * 2, 2 * dx], [ci * 2 + 1, 2 * dy]) }
      const cj = colOf.get(j); if (cj !== undefined) { rows.push([cj * 2, -2 * dx], [cj * 2 + 1, -2 * dy]) }
      for (const [c, v] of rows) { JTr[c] += v * r[e]; for (const [c2, v2] of rows) JTJ[c][c2] += v * v2 }
    }
    for (let d = 0; d < n; d++) JTJ[d][d] += 1e-6 // Levenberg damping for stability near singular configs
    const delta = gaussSolve(JTJ, JTr.map((v) => -v))
    if (!delta) break
    // Step cap (line-search-lite): Gauss-Newton on squared residuals can overshoot from a far guess and
    // diverge; clamp the per-iteration move so the solver takes safe steps (more iters, but stable).
    let maxStep = 0; for (const dv of delta) maxStep = Math.max(maxStep, Math.abs(dv))
    const CAP = 5, scale = maxStep > CAP ? CAP / maxStep : 1
    free.forEach((idx, c) => { P[idx][0] += scale * delta[c * 2]; P[idx][1] += scale * delta[c * 2 + 1] })
  }
  return { points: P, residual: res, iters: it, ok: res < 1e-4 }
}

// Verified non-locking Stephenson-III six-bar (C4b), posed by the general solveLinkage (loop closure — NOT
// analytic): 4-bar A·D·B·C + coupler-triangle apex P + a dyad P→E→ground G. Driven by crank angle θ. Link
// lengths are tuned (Node-verified) so the dyad never locks over a full 0–360° crank rotation. The earlier
// G=[-13.6,-60.1]/E=[-4,25] tuning actually DID lock over ~326–359° (dyad out of reach); this G/E pair sweeps
// 0–360° at 0.25° steps with zero lock and machine-ε rigidity, and keeps a rich E output trace (~64mm span).
// Points: 0=A 1=D (ground) · 2=B (crank end, driven) · 3=C (coupler/rocker) · 4=P (coupler pt) · 5=G (ground) · 6=E (output).
const SIXBAR_REST: V2[] = [[-30, 0], [30, 0], [-30, 20], [20, 30], [-5, 45], [14, -55], [20, 50]]
const SIXBAR_LINKS: Link[] = (() => {
  const d = (a: V2, b: V2) => Math.hypot(a[0] - b[0], a[1] - b[1]); const R = SIXBAR_REST
  const e: [number, number][] = [[0, 2], [2, 3], [1, 3], [2, 4], [3, 4], [4, 6], [5, 6]]
  return e.map(([i, j]) => ({ i, j, len: d(R[i], R[j]) }))
})()
export const SIXBAR = { rest: SIXBAR_REST, links: SIXBAR_LINKS }
// Solve the six-bar at crank angle θ (deg). Steps incrementally from rest so the iterative solver stays in
// its convergence basin regardless of how far θ jumps. Returns solved points (rendering frame) + ok flag.
export function solveSixBar(thetaDeg: number): { pts: V2[]; ok: boolean } {
  const A = SIXBAR_REST[0], B0 = SIXBAR_REST[2]
  const r = Math.hypot(B0[0] - A[0], B0[1] - A[1]), phi0 = Math.atan2(B0[1] - A[1], B0[0] - A[0])
  let cur: V2[] = SIXBAR_REST.map((p) => [p[0], p[1]])
  let okAll = true
  // ok reflects the FINAL pose only — an intermediate path step blipping above tol doesn't matter if the
  // mechanism closes at the requested angle (avoids over-pessimistic flagging over a long incremental path).
  const driveTo = (deg: number) => { const phi = phi0 + (deg * Math.PI) / 180; cur = cur.map((p, k) => (k === 2 ? [A[0] + r * Math.cos(phi), A[1] + r * Math.sin(phi)] : [p[0], p[1]])); const s = solveLinkage(cur, SIXBAR_LINKS, [0, 1, 2, 5]); cur = s.points; okAll = s.ok }
  const tgt = ((thetaDeg % 360) + 360) % 360
  for (let d = 3; d < tgt; d += 3) driveTo(d) // 3° sub-steps keep each Newton solve well inside its basin
  driveTo(tgt)
  return { pts: cur, ok: okAll }
}

// ── Slider-crank (piston) mechanism ──────────────────────────────────────────────────────────
// Crank pivot at origin A. Crank radius r rotates by θ → crank pin B. A connecting rod of length L
// links B to the piston pin C, which slides along the horizontal line y = e (offset). Driving θ,
// the piston position is determined by loop closure: C = [Bx + √(L²−(e−By)²), e]  (in-line when e=0).
export type SliderCrank = { r: number; L: number; e: number; theta: number }
export type SliderCrankSolution = { A: V2; B: V2; C: V2; ok: boolean }
export function solveSliderCrank(sc: SliderCrank): SliderCrankSolution {
  const th = (sc.theta * Math.PI) / 180
  const A: V2 = [0, 0]
  const B: V2 = [sc.r * Math.cos(th), sc.r * Math.sin(th)]
  const dy = sc.e - B[1]
  const disc = sc.L * sc.L - dy * dy
  if (disc < 0) return { A, B, C: [0, sc.e], ok: false } // rod too short to reach the slide line
  const cx = B[0] + Math.sqrt(disc) // piston on the +X side of the crank pin
  return { A, B, C: [cx, sc.e], ok: true }
}

// #92 滑块曲柄【可达性】扫描：偏置 e 过大（|e−B_y|>L）时部分曲柄角 disc<0 无解，描边只 skip → 轨迹静默断裂。
// 呢个纯函数扫一圈 0–360°，畀出【逐角可达掩码 + 整体可达比例】，caller 可据此显示「部分曲柄角不可达 (X%)」而唔系静默断。
// reachable[i] 对应 thetas[i]=360·i/steps；fraction=可达角占比（1=全程可达）；allReachable=fraction===1。
export type SliderCrankReach = { thetas: number[]; reachable: boolean[]; fraction: number; allReachable: boolean }
export function sliderCrankReachability(sc: { r: number; L: number; e: number }, steps = 360): SliderCrankReach {
  const n = Math.max(1, Math.floor(steps))
  const thetas: number[] = []
  const reachable: boolean[] = []
  let hit = 0
  for (let i = 0; i <= n; i++) {
    const theta = (360 * i) / n
    const ok = solveSliderCrank({ r: sc.r, L: sc.L, e: sc.e, theta }).ok
    thetas.push(theta); reachable.push(ok); if (ok) hit++
  }
  const fraction = hit / (n + 1)
  return { thetas, reachable, fraction, allReachable: hit === n + 1 }
}

// ── Trend-level 1-DOF rigid-body dynamics (motion simulation) ─────────────────────────────────────
// Symplectic (semi-implicit) Euler integration of a single generalized coordinate q for a revolute or
// slider joint under gravity + a linear spring + viscous damping. NOT a full multibody solver — this is
// a "what does this joint roughly do when you let go" trend trace, e.g. a pendulum swing or a spring
// settling to equilibrium. Pure function: no store/three-scene dependency.
//
// UNITS — SI-mm consistent set (N, mm, s, tonne):
//   mass:  TONNE (1 tonne·mm/s² = 1 N). Caller converts kg→tonne with ×1e-3.
//   g:     mm/s² (default earth gravity [0,-9810,0]).
//   revolute: q is an ANGLE. spring k is N·mm per RADIAN, c is N·mm·s per radian, q0/q0v in DEGREES
//             (converted to rad internally). Output q[] is in DEGREES.
//   slider:   q is a SLIDE. spring k is N per mm, c is N·s per mm, q0/q0v in mm. Output q[] is in mm.
// The revolute integration runs ENTIRELY IN RADIANS internally — mixing °/rad domains gives a ~57× error.
export type MotionSpec = {
  kind: 'revolute' | 'slider'
  mass: number          // tonne (SI-mm: N, mm, s, tonne). Caller converts kg→tonne (×1e-3).
  k: number; c: number; q0: number   // spring stiffness / damping / spring rest position (° or mm)
  anchor: [number, number, number]; axis: [number, number, number]
  com: [number, number, number]        // child centre-of-mass (world, three coords)
  g?: [number, number, number]         // gravity accel mm/s², default [0,-9810,0]
  q0v?: number                       // initial generalized coordinate (° or mm), default 0
  dt?: number; tEnd?: number; sample?: number  // default 0.001s / 4s / every 16 steps
}
export type MotionResult = { key: 'angle' | 'slide'; q: number[]; dt: number; tEnd: number }
export function simulateMotion(spec: MotionSpec): MotionResult {
  const revolute = spec.kind === 'revolute'
  const dt = spec.dt ?? 0.001
  const tEnd = spec.tEnd ?? 4
  const samp = Math.max(1, Math.round(spec.sample ?? 16))
  const DEG = Math.PI / 180

  // Normalize the joint axis; degenerate axis falls back to world +Y.
  const axis = new Vector3(spec.axis[0], spec.axis[1], spec.axis[2])
  if (!Number.isFinite(axis.lengthSq()) || axis.lengthSq() < 1e-9) axis.set(0, 1, 0)   // bt4: NaN axis(NaN<x=false 绕过原守卫)→ 显式 finite 守卫,免 normalize 传播 NaN
  axis.normalize()

  const anchor = new Vector3(spec.anchor[0], spec.anchor[1], spec.anchor[2])
  const com = new Vector3(spec.com[0], spec.com[1], spec.com[2])
  const rVec = new Vector3().subVectors(com, anchor)          // anchor → COM
  const rPerp = rVec.clone().sub(axis.clone().multiplyScalar(rVec.dot(axis)))  // perpendicular lever arm
  const gVec = new Vector3(...(spec.g ?? [0, -9810, 0]))

  // Generalized inertia: revolute = m·r⊥² (moment of inertia of a point mass), slider = m.
  const Igen = revolute ? Math.max(1e-9, spec.mass * rPerp.lengthSq()) : spec.mass

  // State in the integration domain (rad for revolute, mm for slider).
  let q = (spec.q0v ?? 0) * (revolute ? DEG : 1)
  let qd = 0
  const q0r = spec.q0 * (revolute ? DEG : 1)   // spring rest, same domain as q

  const out: number[] = []
  const steps = Math.round(tEnd / dt)
  const rot = new Matrix4()
  const rNow = new Vector3()
  const Fg = new Vector3()
  const tau = new Vector3()
  for (let i = 0; i <= steps; i++) {
    if (i % samp === 0) out.push(revolute ? q / DEG : q)
    let F: number
    if (revolute) {
      // Lever arm rotated to the current angle q (rad) about the joint axis.
      rot.makeRotationAxis(axis, q)
      rNow.copy(rVec).applyMatrix4(rot)
      Fg.copy(gVec).multiplyScalar(spec.mass)            // gravity force on the mass (N)
      tau.crossVectors(rNow, Fg)                          // torque = r × F
      const tGrav = tau.dot(axis)                         // about the joint axis
      const tSpring = -spec.k * (q - q0r)                 // k is N·mm/rad → q in rad, clean
      const tDamp = -spec.c * qd
      F = tGrav + tSpring + tDamp
    } else {
      const Fgrav = spec.mass * gVec.dot(axis)            // gravity projected onto the slide axis (N)
      const Fspring = -spec.k * (q - q0r)                 // k is N/mm → q in mm, clean
      const Fdamp = -spec.c * qd
      F = Fgrav + Fspring + Fdamp
    }
    const qdd = F / Igen
    qd += qdd * dt   // semi-implicit Euler: velocity first…
    q += qd * dt     // …then position with the updated velocity.
  }
  return { key: revolute ? 'angle' : 'slide', q: out, dt: dt * samp, tEnd }
}
