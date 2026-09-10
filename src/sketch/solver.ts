import {prepareNativeTranslation} from './nativeCoordinates'
import {
  make_gcs_wrapper,
  is_sketch_geometry,
  type GcsWrapper,
  type SketchPrimitive,
  type SketchParam,
  type SketchGeometry,
} from '@salusoft89/planegcs'
import wasmUrl from '@salusoft89/planegcs/dist/planegcs_dist/planegcs.wasm?url'

// planegcs (FreeCAD's 2D geometric constraint solver, C++ -> WASM) on the main thread.
// It is small and solves small sketches in well under a millisecond, so it can run
// synchronously inside drag handlers without a worker round-trip.

let wrapperP: Promise<GcsWrapper> | null = null
function wrapper(): Promise<GcsWrapper> {
  if (!wrapperP) wrapperP = make_gcs_wrapper(wasmUrl)
  return wrapperP
}

export type SolveResult = {
  geometry: SketchGeometry[]
  status: number
  conflicts: string[]
  redundant: string[]
  dof: number   // remaining degrees of freedom: 0 = fully defined (draw black), >0 = under-defined (blue)
}

function pushCheckedPrimitives(w:GcsWrapper,primitives:(SketchPrimitive|SketchParam)[]):void {
  w.clear_data()
  w.push_primitives_and_params(primitives)
  // PlaneGCS can report success without evaluating contradictions when every
  // parameter is fixed. Keep identical anchors as explicit equations so that
  // fully fixed projected loops still validate their driving dimensions.
  const nParams=w.gcs.params_size()
  if(nParams>0 && Array.from({length:nParams},(_,i)=>w.gcs.get_is_fixed(i)).every(Boolean)) {
    const locks:SketchPrimitive[]=[]
    const checked=primitives.map(p=>{
      if(p.type!=='point'||!p.fixed)return p
      locks.push({id:`_fixed_check_x_${p.id}`,type:'coordinate_x',p_id:p.id,x:p.x},{id:`_fixed_check_y_${p.id}`,type:'coordinate_y',p_id:p.id,y:p.y})
      return {...p,fixed:false}
    })
    if(locks.length){w.clear_data();w.push_primitives_and_params([...checked,...locks])}
  }
 }

// Feed a full primitive+constraint list, solve, and read the updated geometry back.
async function solveRawSketch(primitives: (SketchPrimitive | SketchParam)[]): Promise<SolveResult> {
  const w = await wrapper()
  pushCheckedPrimitives(w, primitives)
  const status = w.solve()
  w.apply_solution()
  const geometry = w.sketch_index.get_primitives().filter(is_sketch_geometry) as SketchGeometry[]
  const conflicts = w.has_gcs_conflicting_constraints() ? w.get_gcs_conflicting_constraints() : []
  const redundant = w.has_gcs_redundant_constraints() ? w.get_gcs_redundant_constraints() : []
  let dof = -1
  try { dof = w.gcs.dof() } catch { /* dof unavailable */ }
  return { geometry, status, conflicts, redundant, dof }
}

/** Public solver boundary uses the same native coordinate convention for every caller. */
export async function solveSketch(primitives:(SketchPrimitive|SketchParam)[],opts:{offset?:[number,number]}={}):Promise<SolveResult>{
 const normalized=prepareNativeTranslation(primitives,opts.offset)
 if(!normalized.ok)return{geometry:primitives.filter(is_sketch_geometry) as SketchGeometry[],status:2,conflicts:[],redundant:[],dof:-1}
 const result=await solveRawSketch(normalized.primitives)
 return{...result,geometry:normalized.restore(result.geometry)}
}

export async function initSolver(): Promise<void> {
  await wrapper()
}

// ────────────────────────────────────────────────────────────────────────────
// GM-F4 · 逐点 / 逐实体 DOF 诊断（point-level DOF coloring v2）
//
// Fusion 会逐个点/实体上色：完全约束=黑，仍有自由度=蓝。sketch 级 DOF（solveSketch.dof）
// 只讲「整张图仲差几多自由度」，讲唔到「边一个点仲郁得」。planegcs 嘅 binding 冇 per-param
// 嘅 free-list（只有全局 gcs.dof() + 约束级 conflicting/redundant），所以行唔到「planegcs API」
// tier。呢度用 tier-2 扰动探针（perturbation probe）嘅一个变体：
//
//   对每个点嘅 x / y（同每个圆嘅半径），临时加一条「驱动坐标约束」把佢钉去「现值+ε」，再解一次。
//   若几何真系去到嗰个目标（obeys the pin）→ 佢郁得 → 自由度（蓝）；
//   若去唔到（同其它约束打架、被扯返）→ 已被锁死 → 完全约束（黑）。
//
// 点解用「钉去新值 + 睇有冇去到」而唔系「轻推自由变量睇会唔会弹返」：对耦合自由度（例如未标
// 宽度嘅矩形，右边两点嘅 x 共享同一个自由度 x2=x3）后者只会随机认其中一个「郁」而误判另一个
// 已锁；前者对耦合对称——两点钉去新值都去到 → 两点都正确判为蓝。呢个正正系「自由度」嘅定义：
// 「喺满足所有约束嘅前提下,呢个坐标郁唔郁得?」
//
// 诚实局限（详见 tests/csketch-dof.test.mjs 头注）：
//   • 全局分支：ε 取包围盒 ~10%,极端情况一个「已约束」点或有另一支解啱好落喺 目标±tol 内 → 少数
//     误判为蓝（偏安全方向：叫用户加约束,最坏系「其实已完成」显示成蓝,唔会反过来呃人话「完成咗」）。
//   • dof<=0 时行快线：全部判黑,唔逐点探（完全定义草图=最常见「完成」态,零额外成本）。
//   • 逐探针 = 一次 clear+push+solve（重建整个系统）。故封顶 maxPoints（默认 200）,超过就返
//     ok:false → 上层回退到 sketch 级上色（今日行为,零影响）。50 实体 ~42ms,远低于 2s。
// ────────────────────────────────────────────────────────────────────────────
export type SketchDof = {
  ok: boolean                                        // false → 回退 sketch 级上色（数据缺失/点太多/求解异常）
  dof: number                                        // 整张图剩余自由度（= solveSketch.dof）
  ptFull: Record<string, boolean>                    // 点 id → x 同 y 都被约束（黑）
  ptAxis: Record<string, { x: boolean; y: boolean }> // 点 id → 逐轴是否被约束（供实体上色/测试细看）
  circRadFull: Record<string, boolean>               // 圆 id → 半径被约束（黑；圆完全定义仲需圆心 ptFull）
}

const EMPTY_DOF: SketchDof = { ok: false, dof: -1, ptFull: {}, ptAxis: {}, circRadFull: {} }

// 逐点/逐实体诊断。primitives 同 solveSketch 收嘅一样（点/线/圆 + 约束），但唔应该带临时拖曳约束。
// 所有 wasm 操作喺单个 await 之后同步执行（同 solveSketch 一样），避免同并发 solve() 交错污染共享 wrapper。
export async function diagnoseSketchDof(
  primitives: (SketchPrimitive | SketchParam)[],
  opts: { maxPoints?: number } = {},
): Promise<SketchDof> {
  const normalized=prepareNativeTranslation(primitives)
  if(!normalized.ok)return {...EMPTY_DOF}
  primitives=normalized.primitives
  const maxPoints = opts.maxPoints ?? 200
  const points = primitives.filter((o) => (o as SketchPrimitive).type === 'point') as (SketchPrimitive & { id: string; x: number; y: number; fixed?: boolean })[]
  const circles = primitives.filter((o) => (o as SketchPrimitive).type === 'circle') as (SketchPrimitive & { id: string; c_id: string })[]
  if (!points.length) return { ok: true, dof: 0, ptFull: {}, ptAxis: {}, circRadFull: {} } // 空/退化 → 唔崩,冇 flag
  if (points.length > maxPoints) return { ...EMPTY_DOF } // 太多点 → 回退（诚实：探针成本 O(点数)）

  try {
    const w = await wrapper()
    // ---- 基线解 ----
    w.debug_mode = 0 // 收声：钉冲突时 planegcs 会喷 RedundantSolving debug log
    pushCheckedPrimitives(w,primitives)
    const baselineStatus=w.solve()
    if(baselineStatus!==0||w.has_gcs_conflicting_constraints())return {...EMPTY_DOF}
    w.apply_solution()
    const dof = w.gcs.dof()

    // 读返求解后嘅真实几何位置（探针要用现值 + ε 做钉靶）
    const geo = w.sketch_index.get_primitives()
    const ptPos = new Map<string, { x: number; y: number }>()
    const cRad = new Map<string, number>()
    for (const g of geo) {
      if (g.type === 'point') ptPos.set(g.id, { x: (g as { x: number }).x, y: (g as { y: number }).y })
      else if (g.type === 'circle') cRad.set(g.id, (g as { radius: number }).radius)
    }

    const ptAxis: Record<string, { x: boolean; y: boolean }> = {}
    const ptFull: Record<string, boolean> = {}
    const circRadFull: Record<string, boolean> = {}

    // dof<=0 → 全图完全定义,行快线：全部判黑,唔使逐点探（省成本,亦系最常见「完成」态）
    if (dof <= 0) {
      for (const p of points) { ptAxis[p.id] = { x: true, y: true }; ptFull[p.id] = true }
      for (const c of circles) circRadFull[c.id] = true
      return { ok: true, dof, ptFull, ptAxis, circRadFull }
    }

    // ε / tol：按包围盒对角线定尺度。ε=对角 10%（下限 1）；钉靶 = 现值 + ε。
    // 判定：几何去到「目标 ± tol」→ 服从钉 → 自由（蓝）；去唔到 → 锁死（黑）。tol=15%ε 有充分间距。
    let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity
    for (const p of points) { const q = ptPos.get(p.id); if (!q) continue; if (q.x < mnx) mnx = q.x; if (q.x > mxx) mxx = q.x; if (q.y < mny) mny = q.y; if (q.y > mxy) mxy = q.y }
    const diag = Math.hypot(mxx - mnx, mxy - mny) || 1
    const eps = Math.max(1, diag * 0.1)
    const tol = eps * 0.15

    // 钉一条驱动约束,重解,睇目标实体嗰个属性去唔到目标值。
    const reaches = (pin: SketchPrimitive, targetId: string, axis: 'x' | 'y' | 'r', target: number): boolean => {
      w.clear_data()
      w.push_primitives_and_params([...primitives, pin])
      w.solve()
      w.apply_solution()
      const g = w.sketch_index.get_primitives().find((x) => x.id === targetId) as { x?: number; y?: number; radius?: number } | undefined
      if (!g) return false
      const val = axis === 'r' ? g.radius : g[axis]
      return typeof val === 'number' && Math.abs(val - target) <= tol
    }

    for (const p of points) {
      if (p.fixed) { ptAxis[p.id] = { x: true, y: true }; ptFull[p.id] = true; continue } // 固定点 = 两轴锁死
      const q = ptPos.get(p.id)!
      const xFree = reaches({ id: '__probe_x', type: 'coordinate_x', p_id: p.id, x: q.x + eps } as SketchPrimitive, p.id, 'x', q.x + eps)
      const yFree = reaches({ id: '__probe_y', type: 'coordinate_y', p_id: p.id, y: q.y + eps } as SketchPrimitive, p.id, 'y', q.y + eps)
      ptAxis[p.id] = { x: !xFree, y: !yFree }
      ptFull[p.id] = !xFree && !yFree
    }
    for (const c of circles) {
      const r0 = cRad.get(c.id) ?? 0
      const rFree = reaches({ id: '__probe_r', type: 'circle_radius', c_id: c.id, radius: r0 + eps } as SketchPrimitive, c.id, 'r', r0 + eps)
      circRadFull[c.id] = !rFree
    }

    return { ok: true, dof, ptFull, ptAxis, circRadFull }
  } catch (e) {
    // 诚实回退：诊断出任何错都唔可以拖冧草图 → 返 ok:false,上层照 sketch 级上色
    console.error('[csketch] diagnoseSketchDof failed', e)
    return { ...EMPTY_DOF }
  }
}

// Dev hook so the solver can be exercised from the console during testing.
if (typeof import.meta.env !== 'undefined' && import.meta.env.DEV) {
  ;(window as unknown as { solveSketch: typeof solveSketch; diagnoseSketchDof: typeof diagnoseSketchDof }).solveSketch = solveSketch
  ;(window as unknown as { diagnoseSketchDof: typeof diagnoseSketchDof }).diagnoseSketchDof = diagnoseSketchDof
}
