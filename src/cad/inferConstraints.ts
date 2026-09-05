// inferConstraints.ts — 草图「画即约束」推断（Fusion as-you-draw auto-constraint 对标）
//
// 用户每画一笔（line / point / circle），Fusion 会即时猜你想要嘅几何关系并落约束：
// 边几乎水平 → 水平；几乎竖直 → 竖直；端点啱啱搭到既有端点 → 重合；新线同既有线
// 平行/垂直 → 平行/垂直；线端搭住圆且方向⊥半径 → 相切；新圆半径同既有圆相等 → 相等。
// 本模块就系呢套规则嘅【纯几何】实现 —— 喂一条刚画好嘅 primitive + 一组既有 primitive，
// 返回一串推断到嘅约束（连人话 reason）。
//
// 同既有推断嘅关系（本模块系【超集 SUPERSET，唔系重复】）：
//   • store.ts 嘅 S43（commitPoly 收尾）：闭合折线时逐段落 h/v —— 只有 h/v，且只喺收尾、
//     只食 SkRef edge 地址。本模块覆盖 h/v + coincident/parallel/perp/tangent/equal，
//     且系画【每一笔】即时跑、食通用 {kind,...} primitive、零 store 耦合。
//   • freesolve.ts 嘅 inferCoincident：只做 coincident，且食 FShape[]+SkCon[]+SkRef（同 store 绑死）。
//     本模块嘅 coincident 系其纯几何对应物，外加埋其余 6 类关系。
//   故本模块系一个【独立、可单测】嘅推断核心；UI/store 可将其结果映射成 SkCon 落约束。
//
// ── 输入形状 ──（皆 2D，单位同草图一致，通常 mm）
//   line   {kind:'line',   a:[x,y], b:[x,y]}                 —— 两端点
//   point  {kind:'point',  p:[x,y]}                          —— 单点（草图点）
//   circle {kind:'circle', c:[x,y], r:number}                —— 圆心 + 半径
//   `existing` 入面每个 primitive 多一个 `id`（string），约束 refs 会引用呢个 id。
//
// ── 输出约束 ──
//   {type, refs, reason}
//     type   : 'horizontal'|'vertical'|'coincident'|'parallel'|'perpendicular'|'tangent'|'equal'
//     refs   : 受约束对象嘅标识 —— self 笔嘅端点写成 'self' / 'self:a' / 'self:b'；
//              既有对象写其 id（重合时写到端点：`${id}:a` / `${id}:b` / `${id}:p` / `${id}:c`）。
//     reason : 一句人话解释（点解推断到 / 量到几多度·几多距离），方便 UI 提示同调试。
//
// ── 容差 opts ──
//   angTolDeg  角度容差（度，default 3）  —— h/v、parallel、perp、tangent 嘅方向判定
//   posTol     位置容差（长度，default 1.5）—— coincident（端点距离）、equal（半径差）、tangent（点到圆距离）
//
// ── 设计取向：保守（only strong matches）──
//   推断系「猜意图」，错猜会激嬲用户（落咗你唔想要嘅约束）。所以全部判定都【严格】：
//   方向类一律用真实夹角同容差比，重合/相等用绝对距离比，唔够强就唔出。degenerate
//   （零长线、零半径圆、NaN）一律静默跳过。返回数组可为空（= 冇强匹配，唔落任何约束）。
//
// 纯函数、零 import、无副作用、唔掂 React/store/worker —— 任何模块可安全引用。

export type Pt2 = [number, number]

// 输入 / 既有形状（既有形状多一个 id）。
export type Prim =
  | { kind: 'line'; a: Pt2; b: Pt2 }
  | { kind: 'point'; p: Pt2 }
  | { kind: 'circle'; c: Pt2; r: number }
export type ExistingPrim = Prim & { id: string }

export type InferType =
  | 'horizontal' | 'vertical' | 'coincident'
  | 'parallel' | 'perpendicular' | 'tangent' | 'equal'

export interface InferredConstraint {
  type: InferType
  refs: string[]   // 'self' / 'self:a' / 'self:b' / '<id>' / '<id>:a' …
  reason: string
}

export interface InferOpts {
  angTolDeg?: number   // 角度容差，default 3°
  posTol?: number      // 位置容差，default 1.5
}

// ── 小工具（全部纯函数）──
const sub = (p: Pt2, q: Pt2): Pt2 => [p[0] - q[0], p[1] - q[1]]
const len = (v: Pt2): number => Math.hypot(v[0], v[1])
const dist = (p: Pt2, q: Pt2): number => Math.hypot(p[0] - q[0], p[1] - q[1])
const finite2 = (p: Pt2): boolean => Number.isFinite(p[0]) && Number.isFinite(p[1])

// 一条线段嘅【方向角】，规整到 [0,180)：方向同反方向算同一条直线（平行/垂直/水平/竖直
// 都系无向关系）。返回 NaN 表示零长（退化）。单位：度。
function lineAngle0to180(a: Pt2, b: Pt2): number {
  const dx = b[0] - a[0], dy = b[1] - a[1]
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return NaN
  if (Math.hypot(dx, dy) < 1e-9) return NaN          // 零长 → 方向无定义
  let deg = Math.atan2(dy, dx) * 180 / Math.PI       // (−180,180]
  if (deg < 0) deg += 180                              // 折到 [0,180)
  if (deg >= 180) deg -= 180                           // atan2=180 嘅边界
  return deg
}

// 两个 [0,180) 方向之间嘅【最小无向夹角】，结果落 [0,90]。
function angBetween(d1: number, d2: number): number {
  let d = Math.abs(d1 - d2) % 180
  if (d > 90) d = 180 - d
  return d
}

/**
 * inferConstraints —— 对一笔刚画好嘅 primitive 推断自动约束。
 *
 * @param seg      刚画好嘅 primitive（line / point / circle），唔需 id（用 'self' 引用）。
 * @param existing 一组已落地嘅 primitive（每个带 id）。
 * @param opts     容差（见 InferOpts）。
 * @returns        推断到嘅约束数组（保守 —— 只出强匹配；可为空）。
 */
export function inferConstraints(
  seg: Prim,
  existing: ExistingPrim[] = [],
  opts: InferOpts = {},
): InferredConstraint[] {
  const angTol = opts.angTolDeg ?? 3      // 度
  const posTol = opts.posTol ?? 1.5       // 长度
  const out: InferredConstraint[] = []

  // ── A. 自身方向类（只对 line）：水平 / 竖直 ──
  // 用真实方向角同 0°/90° 比。near-horizontal → horizontal；near-vertical → vertical。
  // 互斥：一条线唔可能同时水平又竖直（angTol < 45 时天然互斥）。
  if (seg.kind === 'line' && finite2(seg.a) && finite2(seg.b)) {
    const ang = lineAngle0to180(seg.a, seg.b)   // [0,180) 或 NaN
    if (Number.isFinite(ang)) {
      // 离 0°（=180°）嘅距离：水平。离 90° 嘅距离：竖直。
      const offH = Math.min(ang, 180 - ang)     // 到水平轴嘅夹角 [0,90]
      const offV = Math.abs(ang - 90)            // 到竖直轴嘅夹角 [0,90]
      if (offH < angTol) {
        out.push({ type: 'horizontal', refs: ['self'], reason: `线方向偏离水平仅 ${offH.toFixed(2)}°（< ${angTol}°）` })
      } else if (offV < angTol) {
        out.push({ type: 'vertical', refs: ['self'], reason: `线方向偏离竖直仅 ${offV.toFixed(2)}°（< ${angTol}°）` })
      }
    }
  }

  // ── B. 端点重合 coincident ──
  // self 嘅每个端点同既有形状嘅每个【可吸附点】（线端点、点、圆心）比距离；< posTol → 重合。
  // 偏向最近匹配（逐 self 端点只取最近嘅一个既有点），保守。
  const selfPts: { tag: string; p: Pt2 }[] =
    seg.kind === 'line' ? [{ tag: 'self:a', p: seg.a }, { tag: 'self:b', p: seg.b }]
      : seg.kind === 'point' ? [{ tag: 'self', p: seg.p }]
        : seg.kind === 'circle' ? [{ tag: 'self:c', p: seg.c }]   // 圆心可同既有点重合（→ 同心嘅前身）
          : []

  // 收集既有形状嘅可吸附点。
  const existPts: { ref: string; p: Pt2 }[] = []
  for (const e of existing) {
    if (e.kind === 'line' && finite2(e.a) && finite2(e.b)) {
      existPts.push({ ref: `${e.id}:a`, p: e.a }, { ref: `${e.id}:b`, p: e.b })
    } else if (e.kind === 'point' && finite2(e.p)) {
      existPts.push({ ref: `${e.id}:p`, p: e.p })
    } else if (e.kind === 'circle' && finite2(e.c)) {
      existPts.push({ ref: `${e.id}:c`, p: e.c })
    }
  }

  for (const sp of selfPts) {
    if (!finite2(sp.p)) continue
    let best: { ref: string; d: number } | null = null
    for (const ep of existPts) {
      const d = dist(sp.p, ep.p)
      if (d < posTol && (!best || d < best.d)) best = { ref: ep.ref, d }
    }
    if (best) {
      out.push({ type: 'coincident', refs: [sp.tag, best.ref], reason: `端点距离 ${best.d.toFixed(3)} < ${posTol} —— 吸附为重合` })
    }
  }

  // ── C. 线对线方向类：平行 parallel / 垂直 perpendicular ──
  // self 系线时，同每条既有线比方向角：夹角 < angTol → 平行；|夹角 − 90| < angTol → 垂直。
  // 互斥（每对只出其一）。注意：呢度【唔】因为 self 已判 horizontal/vertical 就跳过 —— 同既有
  // 线嘅平行/垂直系独立关系（两条都水平时，「平行」依然系有用嘅显式约束，同 Fusion 一致）。
  if (seg.kind === 'line') {
    const selfAng = lineAngle0to180(seg.a, seg.b)
    if (Number.isFinite(selfAng)) {
      for (const e of existing) {
        if (e.kind !== 'line' || !finite2(e.a) || !finite2(e.b)) continue
        const eAng = lineAngle0to180(e.a, e.b)
        if (!Number.isFinite(eAng)) continue
        const between = angBetween(selfAng, eAng)   // [0,90]
        if (between < angTol) {
          out.push({ type: 'parallel', refs: ['self', e.id], reason: `两线夹角 ${between.toFixed(2)}° < ${angTol}° —— 平行` })
        } else if (Math.abs(between - 90) < angTol) {
          out.push({ type: 'perpendicular', refs: ['self', e.id], reason: `两线夹角 ${between.toFixed(2)}°（≈90°）—— 垂直` })
        }
      }
    }
  }

  // ── D. 线↔圆相切 tangent ──
  // self 系线、既有有圆：判线段【某一端】搭住圆 —— 即端点到圆心距离 ≈ r（|d−r| < posTol）
  // 且喺该端点处，线方向【⊥ 半径】（半径 = 圆心→端点；线⊥半径即相切方向）。两者皆满足 → 相切。
  // 严格用「端点贴圆 + 方向垂直」双条件，避免把「随便一条穿过圆附近嘅线」误判成相切。
  if (seg.kind === 'line' && finite2(seg.a) && finite2(seg.b)) {
    const lineDir = lineAngle0to180(seg.a, seg.b)   // [0,180)
    if (Number.isFinite(lineDir)) {
      for (const e of existing) {
        if (e.kind !== 'circle' || !finite2(e.c) || !(e.r > 1e-9)) continue
        for (const tip of [seg.a, seg.b] as Pt2[]) {
          const radial = sub(tip, e.c)              // 圆心 → 端点
          const dC = len(radial)
          if (Math.abs(dC - e.r) >= posTol) continue          // 端点未贴喺圆周上
          if (dC < 1e-9) continue                              // 端点喺圆心 → 半径方向无定义
          const radDir = lineAngle0to180(e.c, tip)            // 半径方向 [0,180)
          if (!Number.isFinite(radDir)) continue
          const between = angBetween(lineDir, radDir)          // 线 vs 半径 [0,90]
          if (Math.abs(between - 90) < angTol) {               // ⊥ 半径 → 相切
            out.push({ type: 'tangent', refs: ['self', e.id], reason: `端点贴圆周(|d−r|=${Math.abs(dC - e.r).toFixed(3)}) 且线⊥半径(夹角 ${between.toFixed(2)}°)—— 相切` })
            break   // 一条线对同一个圆最多出一次相切（两端都满足时取先到嘅）
          }
        }
      }
    }
  }

  // ── E. 圆↔圆半径相等 equal ──
  // self 系圆、既有有圆：半径差 < posTol → 相等。保守用绝对差（同 posTol 同量纲，都系长度）。
  if (seg.kind === 'circle' && Number.isFinite(seg.r) && seg.r > 1e-9) {
    for (const e of existing) {
      if (e.kind !== 'circle' || !(e.r > 1e-9)) continue
      const dr = Math.abs(seg.r - e.r)
      if (dr < posTol) {
        out.push({ type: 'equal', refs: ['self', e.id], reason: `半径差 |${seg.r}−${e.r}| = ${dr.toFixed(3)} < ${posTol} —— 半径相等` })
      }
    }
  }

  return out
}

export default inferConstraints
