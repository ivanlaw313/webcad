// src/assembly/linkage.ts — 闭环平面连杆纯数学求解器（净喺关节值空间做嘢，唔掂渲染/store）
//
// 核心洞察（recon 结论，设计就系围住佢）：computeFK（kinematics.ts:79-102）按 child 起生成树 ——
// 同一 child 嘅第二条入边会被静默丢弃（82-83 childJoint Map 覆写），即闭环嘅「多余」边根本唔参与
// 树 FK。咁只要关节值「环一致」（闭合残差 ≈ 0），无论树拣咗边几条边，FK 出嚟嘅姿态都一样 ——
// 所以本模块净系解关节值，解完写值返去，渲染零改动。
//
// 诚实范围（locked）：平面机构 only ——
//   · 环内全部 revolute 轴互相平行：|n̂ᵢ·n̂| > 0.9999（n̂ = 环内第一个 revolute 嘅轴）
//   · slider 轴要喺平面内：|axis·n̂| < 1e-3
//   · rigid 容许（恒等变换，0 个未知数）
//   · 环含 ball / planar / cylindrical / screw、或轴唔平行 → solveLoop 返 null
//     （caller 跌返树 FK + 诚实状态提示，绝唔静默出错误姿态）
//
// 绝不夹帽：解出嘅值违反 aMin/aMax/sMin/sMax → 直接 null。如果照写值落去，渲染端 jointMotion
// 嘅 clamp（kinematics.ts:37-40，单一真相源）会单独夹住嗰个关节，令成个回路俾人撑开 —— 宁愿唔郁。

import { gaussSolve } from './kinematics'
import type { Joint } from './kinematics'

export type V2 = [number, number]
type V3 = [number, number, number]

// ── 细 3D 向量工具（本模块承诺纯 2D/标量数学，唔 import three.js）────────────────────────────
const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
// 零向量 fallback (0,1,0)，对齐 jointMotion 嘅 axis.lengthSq()<1e-9 处理（kinematics.ts:30）
const norm3 = (a: V3): V3 => {
  const l2 = a[0] * a[0] + a[1] * a[1] + a[2] * a[2]
  if (l2 < 1e-9) return [0, 1, 0]
  const l = Math.sqrt(l2)
  return [a[0] / l, a[1] / l, a[2] / l]
}

const DEG = Math.PI / 180

// ── 2D 刚体变换 p ↦ R(th)·p + t（th 累加唔取 mod，方便剪开关节由朝向反推角度）──────────────
type T2 = { th: number; tx: number; ty: number }
const rot2 = (th: number, p: V2): V2 => {
  const c = Math.cos(th), s = Math.sin(th)
  return [c * p[0] - s * p[1], s * p[0] + c * p[1]]
}
const apply2 = (T: T2, p: V2): V2 => {
  const q = rot2(T.th, p)
  return [q[0] + T.tx, q[1] + T.ty]
}

// ── 环检测 ─────────────────────────────────────────────────────────────────────────────────
// 无向多重图：顶点 = 组件 id，边 = 关节（parent↔child，唔理方向）。BFS 生成森林；每条 back-edge
// （正正就系 computeFK「同 child 第二条入边」静默丢弃嗰啲，或者任何驶唔入树嘅边）= 一个基本环。
// cut 优先拣 revolute back-edge（back-edge 净属于自己嗰个基本环，做 cut 唔会污染第二个环嘅链）；
// back-edge 唔系 revolute 就退而求其次拣环内任一 revolute；环内完全冇 revolute → 照返回但 cut=''，
// 等 solveLoop 拒绝 —— caller 仍然知道「有环但唔可解」。
export interface Loop { joints: Joint[]; bodies: string[]; cut: string }

export function findLoops(componentIds: string[], joints: Joint[]): Loop[] {
  const inComp = new Set(componentIds)
  // 自环（parent===child）无运动学意义，跳过；缺端点嘅关节照 computeFK 一样唔入图
  const edges = joints.filter((j) => j.parent !== j.child && inComp.has(j.parent) && inComp.has(j.child))
  const adj = new Map<string, { j: Joint; other: string }[]>()
  componentIds.forEach((id) => adj.set(id, []))
  edges.forEach((j) => {
    adj.get(j.parent)!.push({ j, other: j.child })
    adj.get(j.child)!.push({ j, other: j.parent })
  })
  const visited = new Set<string>()
  const parentOf = new Map<string, { via: Joint; up: string }>() // BFS 树：body → (入树关节, 上级 body)
  const depth = new Map<string, number>()
  const treeUsed = new Set<string>() // 入咗树嘅关节 id
  for (const root of componentIds) {
    if (visited.has(root)) continue
    visited.add(root)
    depth.set(root, 0)
    const queue = [root]
    for (let h = 0; h < queue.length; h++) {
      const cur = queue[h]
      for (const { j, other } of adj.get(cur)!) {
        if (visited.has(other)) continue
        visited.add(other)
        treeUsed.add(j.id)
        parentOf.set(other, { via: j, up: cur })
        depth.set(other, depth.get(cur)! + 1)
        queue.push(other)
      }
    }
  }
  const loops: Loop[] = []
  for (const j of edges) {
    if (treeUsed.has(j.id)) continue
    // back-edge → 基本环 = j.parent↔j.child 嘅树路径 + j 自己（放最后，bodies[i]—bodies[(i+1)%K] 由 joints[i] 连）
    let a = j.parent, b = j.child
    const upA: string[] = [a], upB: string[] = [b]
    const jA: Joint[] = [], jB: Joint[] = []
    while (depth.get(a)! > depth.get(b)!) { const t = parentOf.get(a)!; jA.push(t.via); a = t.up; upA.push(a) }
    while (depth.get(b)! > depth.get(a)!) { const t = parentOf.get(b)!; jB.push(t.via); b = t.up; upB.push(b) }
    while (a !== b) {
      const ta = parentOf.get(a)!; jA.push(ta.via); a = ta.up; upA.push(a)
      const tb = parentOf.get(b)!; jB.push(tb.via); b = tb.up; upB.push(b)
    }
    // 环序：j.parent → … → LCA → … → j.child，back-edge 收尾闭返去 j.parent
    const bodies = [...upA, ...upB.slice(0, -1).reverse()]
    const loopJoints = [...jA, ...jB.slice().reverse(), j]
    const cut = j.type === 'revolute' ? j.id : loopJoints.find((q) => q.type === 'revolute')?.id ?? ''
    loops.push({ joints: loopJoints, bodies, cut })
  }
  return loops
}

// ── 平面检查 + 正交基 ──────────────────────────────────────────────────────────────────────
// n̂ = 环内第一个 revolute 嘅轴；逐个关节核对诚实范围。基向量构造照搬 jointMotion planar 基模式
// （kinematics.ts:67-69）：ref 拣同 n̂ 唔近平行嘅坐标轴，u = n̂×ref，v = n̂×u ⇒ u×v = n̂（右手系，
// 绕 n̂ 嘅 +角 喺 (u,v) 坐标入面就系标准 CCW —— 关节角本身系内禀量，基点对称选择唔影响解值）。
export function loopPlane(loop: Loop): { n: [number, number, number]; u: [number, number, number]; v: [number, number, number] } | null {
  const rev = loop.joints.find((j) => j.type === 'revolute')
  if (!rev) return null
  const n = norm3(rev.axis)
  for (const j of loop.joints) {
    if (j.type === 'rigid') continue
    const ax = norm3(j.axis)
    if (j.type === 'revolute') {
      if (Math.abs(dot3(ax, n)) <= 0.9999) return null // 轴唔平行 → 非平面
      continue
    }
    if (j.type === 'slider') {
      if (Math.abs(dot3(ax, n)) >= 1e-3) return null // slider 轴要喺平面内
      continue
    }
    return null // ball / planar / cylindrical / screw → 超出诚实范围
  }
  const ref: V3 = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = norm3(cross3(n, ref))
  const v = norm3(cross3(n, u))
  return { n, u, v }
}

// ── 闭环求解 ───────────────────────────────────────────────────────────────────────────────
// 求解包含 driveId 嘅环（经共享关节耦合埋嘅其它环成员一并联立解）。纯函数 —— 唔会改 input joints；
// 成功返 Map(关节 id → 新值)，包括驱动关节、全部未知数、同剪开关节；失败（非平面 / 唔收敛 / 不可达 /
// 违反限位）→ null。
export function solveLoop(
  joints: Joint[],
  componentIds: string[],
  driveId: string,
  driveVal: { angle?: number; slide?: number },
): Map<string, { angle?: number; slide?: number }> | null {
  const jmap = new Map<string, Joint>(joints.map((j) => [j.id, j]))
  const drive = jmap.get(driveId)
  if (!drive || (drive.type !== 'revolute' && drive.type !== 'slider')) return null

  // 1. 揾环；由驱动环按「共享关节」传递闭包扩展 union —— 共享关节令两个环嘅闭合方程耦合，
  //    一齐解先啱（净共享 body 唔共享关节嘅环互不影响，闭合残差只睇自己环内嘅关节值）。
  const loops = findLoops(componentIds, joints)
  const union: Loop[] = loops.filter((L) => L.joints.some((j) => j.id === driveId))
  if (union.length === 0) return null // 驱动关节唔喺任何环 → 树 FK 本身已精确，caller fallback 即可
  for (let grew = true; grew; ) {
    grew = false
    const ids = new Set<string>()
    union.forEach((L) => L.joints.forEach((j) => ids.add(j.id)))
    for (const L of loops) {
      if (union.includes(L)) continue
      if (L.joints.some((j) => ids.has(j.id))) { union.push(L); grew = true }
    }
  }
  const unionJointIds = new Set<string>()
  const unionJoints: Joint[] = []
  union.forEach((L) => L.joints.forEach((j) => {
    if (!unionJointIds.has(j.id)) { unionJointIds.add(j.id); unionJoints.push(j) }
  }))

  // 2. 平面检查 —— 成个 union 用同一个 (u,v,n̂) 基（跨环残差入同一条方程组，基要一致）
  const plane = loopPlane({ joints: unionJoints, bodies: [], cut: '' })
  if (!plane) return null
  const { n, u, v } = plane
  const proj = (p: [number, number, number]): V2 => [dot3(p, u), dot3(p, v)]

  // 3. 逐环定 cut（剪开关节）：优先用 findLoops 拣好嘅 revolute back-edge；唔得（cut=''、
  //    撞正 driveId、或者关节出现喺第二个 union 环 —— cut 唔可以喺其它环嘅链度做未知数）
  //    就环内另拣一个合规 revolute；揾唔到 → null（诚实拒绝）。
  const cutIds = new Set<string>()
  const cutOf = new Map<Loop, Joint>()
  const inOther = (id: string, L: Loop) => union.some((L2) => L2 !== L && L2.joints.some((j) => j.id === id))
  for (const L of union) {
    const okCut = (j: Joint | undefined): j is Joint =>
      !!j && j.type === 'revolute' && j.id !== driveId && !cutIds.has(j.id) && !inOther(j.id, L)
    let cj = L.joints.find((j) => j.id === L.cut)
    if (!okCut(cj)) cj = L.joints.find((j) => okCut(j))
    if (!cj) return null
    cutOf.set(L, cj)
    cutIds.add(cj.id)
  }

  // 4. 未知数 = union 内非驱动非剪开嘅 1-DOF 关节值（rigid 0 DOF 跳过）
  const unknowns: { j: Joint; kind: 'rev' | 'sli' }[] = []
  const uiOf = new Map<string, number>()
  for (const j of unionJoints) {
    if (j.id === driveId || cutIds.has(j.id) || j.type === 'rigid') continue
    uiOf.set(j.id, unknowns.length)
    unknowns.push({ j, kind: j.type === 'revolute' ? 'rev' : 'sli' })
  }
  const nUnk = unknowns.length

  // 5. 逐环预编译「链」：环减走 cut = 一条 path，由 cut 一边 body（w0，定为 2D 恒等帧）行到另一边
  //    （bodies[m]）。每步记低行进方向 dir（顺 parent→child 为 +1，逆行用逆变换 −1）、2D 锚点、
  //    slider 2D 轴、同旋向 σ = sign(axis·n̂)。锚点喺 n̂ 方向嘅高度差唔影响闭合（绕 n̂ 转 + 面内移
  //    都保持 n̂ 坐标不变），所以投影落 (u,v) 系无损嘅。
  type Step = { id: string; kind: 'rev' | 'sli' | 'rig'; dir: 1 | -1; ui: number; a2: V2; d2: V2; sigma: 1 | -1 }
  type Sys = { steps: Step[]; cutId: string; cutA2: V2; cutCoef: 1 | -1; prevCut: number }
  const sys: Sys[] = []
  for (const L of union) {
    const cut = cutOf.get(L)!
    const K = L.joints.length
    const m = L.joints.findIndex((j) => j.id === cut.id)
    const steps: Step[] = []
    for (let t = 0; t < K - 1; t++) {
      const idx = (m + 1 + t) % K
      const j = L.joints[idx]
      const from = L.bodies[idx] // joints[idx] 连 bodies[idx]—bodies[(idx+1)%K]，行进起点就系 bodies[idx]
      const ax = norm3(j.axis)
      steps.push({
        id: j.id,
        kind: j.type === 'revolute' ? 'rev' : j.type === 'slider' ? 'sli' : 'rig',
        dir: j.parent === from ? 1 : -1,
        ui: uiOf.get(j.id) ?? -1,
        a2: proj(j.anchor),
        d2: [dot3(ax, u), dot3(ax, v)],
        sigma: dot3(ax, n) >= 0 ? 1 : -1,
      })
    }
    const w0 = L.bodies[(m + 1) % K]
    const cutAx = norm3(cut.axis)
    sys.push({
      steps,
      cutId: cut.id,
      cutA2: proj(cut.anchor),
      // 剪开关节值反推系数：M_child = M_parent·A_cut ⇒ 链末端朝向 θX 满足 φ_cut = ±σ·deg(θX)，
      // 正负睇 w0 系 cut 嘅 parent 定 child（两边 body 相对朝向 —— 保证之后任何生成树 FK 一致）
      cutCoef: ((cut.parent === w0 ? 1 : -1) * (dot3(cutAx, n) >= 0 ? 1 : -1)) as 1 | -1,
      prevCut: cut.angle,
    })
  }

  // 6. 残差 + 解析 Jacobian。残差 = 剪开关节两侧 body 上嘅锚点 2D 位置差（2 式/环）：
  //    w0 帧恒等 ⇒ r = T_X(a_cut) − a_cut。旋转闭合唔使另立方程 —— 相对朝向正正系 cut revolute
  //    嘅自由度，解完先反推写返。
  //    Jacobian（解析，唔用数值差分）：
  //      revolute：∂e/∂θdeg = dir·σ·(π/180)·perp(e − p)，p = T_t(a2) 即关节当前 2D 锚点
  //      slider：  ∂e/∂s   = dir·R(θt)·axis2D（轴方向旋到当前帧）
  const x = unknowns.map((q) => (q.kind === 'rev' ? q.j.angle : q.j.slide))
  const nLoop = sys.length
  const r = new Float64Array(nLoop * 2)
  const thetas = new Float64Array(nLoop)
  const evalAll = (driveCur: number, J: number[][] | null): number => {
    let maxAbs = 0
    for (let li = 0; li < nLoop; li++) {
      const L = sys[li]
      const pre: T2[] = []
      let T: T2 = { th: 0, tx: 0, ty: 0 }
      for (const st of L.steps) {
        pre.push(T)
        if (st.kind === 'rev') {
          const val = st.ui >= 0 ? x[st.ui] : st.id === driveId ? driveCur : 0
          const psi = st.dir * st.sigma * val * DEG
          // T ∘ Rot(a2, ψ)：新平移 = T(a2) − R(th+ψ)·a2
          const ra = rot2(T.th, st.a2)
          const rp = rot2(T.th + psi, st.a2)
          T = { th: T.th + psi, tx: ra[0] + T.tx - rp[0], ty: ra[1] + T.ty - rp[1] }
        } else if (st.kind === 'sli') {
          const val = st.ui >= 0 ? x[st.ui] : st.id === driveId ? driveCur : 0
          const dv = rot2(T.th, st.d2)
          T = { th: T.th, tx: T.tx + st.dir * val * dv[0], ty: T.ty + st.dir * val * dv[1] }
        } // rigid → 恒等，T 不变
      }
      const e = apply2(T, L.cutA2)
      const rx = e[0] - L.cutA2[0], ry = e[1] - L.cutA2[1]
      r[li * 2] = rx
      r[li * 2 + 1] = ry
      thetas[li] = T.th
      maxAbs = Math.max(maxAbs, Math.abs(rx), Math.abs(ry))
      if (J) {
        for (let t = 0; t < L.steps.length; t++) {
          const st = L.steps[t]
          if (st.ui < 0) continue // 驱动 / rigid 唔系未知数
          const Tt = pre[t]
          if (st.kind === 'rev') {
            const p = apply2(Tt, st.a2)
            const f = st.dir * st.sigma * DEG
            J[li * 2][st.ui] += f * -(e[1] - p[1]) // perp(e−p) = (−Δy, Δx)
            J[li * 2 + 1][st.ui] += f * (e[0] - p[0])
          } else {
            const dv = rot2(Tt.th, st.d2)
            J[li * 2][st.ui] += st.dir * dv[0]
            J[li * 2 + 1][st.ui] += st.dir * dv[1]
          }
        }
      }
    }
    return maxAbs
  }

  // 7. Gauss-Newton + Levenberg：法方程 (JᵀJ + λI)δ = −Jᵀr，λ=1e-6 对角阻尼 + 步长帽 ——
  //    照搬 solveLinkage 先例（kinematics.ts:209-215），线性解用 export 咗嘅 gaussSolve。
  const M2 = nLoop * 2
  const solveAt = (driveCur: number): boolean => {
    for (let it = 0; it < 80; it++) {
      const J: number[][] = Array.from({ length: M2 }, () => new Array<number>(nUnk).fill(0))
      if (evalAll(driveCur, J) < 1e-10) return true
      const JTJ: number[][] = Array.from({ length: nUnk }, () => new Array<number>(nUnk).fill(0))
      const JTr = new Array<number>(nUnk).fill(0)
      for (let row = 0; row < M2; row++) {
        for (let a = 0; a < nUnk; a++) {
          const ja = J[row][a]
          if (ja === 0) continue
          JTr[a] += ja * r[row]
          for (let b = 0; b < nUnk; b++) JTJ[a][b] += ja * J[row][b]
        }
      }
      for (let d = 0; d < nUnk; d++) JTJ[d][d] += 1e-6 // Levenberg 阻尼（近奇异位形保稳）
      const delta = gaussSolve(JTJ, JTr.map((q) => -q))
      if (!delta) return false
      let mx = 0
      for (const dv of delta) mx = Math.max(mx, Math.abs(dv))
      const CAP = 10 // 步长帽（度/毫米）：远初值时 GN 会过冲，宁愿多几轮都唔好乱跳
      const scale = mx > CAP ? CAP / mx : 1
      for (let k = 0; k < nUnk; k++) x[k] += scale * delta[k]
      if (mx * scale < 1e-13) break // 步长停滞 —— 残差落唔到零（典型：Grashof 锁死/不可达），交畀末检
    }
    return evalAll(driveCur, null) < 1e-7
  }

  // 8. 子步延续：由当前驱动值行到目标，每步 ≤5°/≤5mm（solveSixBar 3° 子步先例，kinematics.ts:244-246
  //    —— 保证每轮 Newton 都喺收敛域内，亦保证分支连续唔会跳装配模式）。任一子步唔收敛 → null。
  const start = drive.type === 'revolute' ? drive.angle : drive.slide
  const target = drive.type === 'revolute' ? driveVal.angle ?? drive.angle : driveVal.slide ?? drive.slide
  const span = target - start
  const nSub = Math.max(1, Math.ceil(Math.abs(span) / 5))
  for (let k = 1; k <= nSub; k++) {
    if (!solveAt(start + (span * k) / nSub)) return null
  }

  // 9. 收敛后写埋剪开关节值（由两侧 body 相对朝向反推），展开（unwrap）到最贴近原值嘅 360° 分支
  //    保持连续性；驱动关节都入埋 Map，store 一次过原子写晒。
  const out = new Map<string, { angle?: number; slide?: number }>()
  out.set(driveId, drive.type === 'revolute' ? { angle: target } : { slide: target })
  unknowns.forEach((q, i) => out.set(q.j.id, q.kind === 'rev' ? { angle: x[i] } : { slide: x[i] }))
  for (let li = 0; li < nLoop; li++) {
    const L = sys[li]
    let phi = (L.cutCoef * thetas[li]) / DEG
    phi += 360 * Math.round((L.prevCut - phi) / 360)
    out.set(L.cutId, { angle: phi })
  }

  // 10. 限位检查 —— 全部解值核对 aMin/aMax/sMin/sMax，违反即 null（绝不夹帽，理由见文件头）
  for (const [id, val] of out) {
    const j = jmap.get(id)!
    if (val.angle !== undefined) {
      if ((j.aMin !== undefined && val.angle < j.aMin - 1e-9) || (j.aMax !== undefined && val.angle > j.aMax + 1e-9)) return null
    }
    if (val.slide !== undefined) {
      if ((j.sMin !== undefined && val.slide < j.sMin - 1e-9) || (j.sMax !== undefined && val.slide > j.sMax + 1e-9)) return null
    }
  }
  return out
}
