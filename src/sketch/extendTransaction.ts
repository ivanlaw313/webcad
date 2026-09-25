import type { SketchShape } from '../store'
import { solveMoveCandidate } from './moveRelations'
import { applyRelationUpdates, solveFree, type FShape, type FPt, type SkCon, type FreeSolveResult } from './freesolve'

export type ExtendTarget = { shape: number; end: 'start' | 'end'; point: FPt }
export type ExtendResult =
  | { ok: true; result: FreeSolveResult }
  | { ok: false; reason: string }

/** Validate the intended endpoint after applying all existing driving constraints.
 * No history or caller-owned geometry is mutated; the caller must reject stale results.
 */
export async function solveExtension(
  candidates: FShape[], cons: SkCon[], target: ExtendTarget, tolerance = 1e-5,
  solve: typeof solveFree = solveFree,
  original?: FShape[],
): Promise<ExtendResult> {
  if (!Number.isFinite(tolerance) || tolerance <= 0 || !target.point.every(Number.isFinite)) {
    return { ok: false, reason: '延伸目標無效，草圖未更改' }
  }
  const shape = candidates[target.shape]
  if (shape?.type !== 'poly' || !shape.open) return { ok: false, reason: '延伸目標路徑不可用，草圖未更改' }
  let solved: FreeSolveResult | null
  try { solved = await solve(structuredClone(candidates), structuredClone(cons)) }
  catch { return { ok: false, reason: '延伸求解失敗，草圖未更改' } }
  if (!solved || solved.conflict) return { ok: false, reason: '現有約束阻止延伸，草圖未更改；請先調整相關尺寸或約束' }
  // An implicit Fix must retain the pre-extension anchor, not the candidate seed.
  if(original){
    const checked=await solveMoveCandidate(original as SketchShape[],{ok:true,shapes:solved.shapes as SketchShape[],cons:applyRelationUpdates(cons,solved),selectedIndices:[],targetShapes:[]})
    if(!checked.ok)return {ok:false,reason:checked.reason}
    solved={...solved,shapes:checked.shapes,dof:checked.dof}
  }
  const result = solved.shapes[target.shape]
  const points = result?.type === 'poly' ? result.arc ? [result.arc.a, result.arc.b] : result.verts ?? result.pts : []
  const endpoint = target.end === 'start' ? points[0] : points.at(-1)
  if (!endpoint || !endpoint.every(Number.isFinite) || Math.hypot(endpoint[0] - target.point[0], endpoint[1] - target.point[1]) > tolerance) {
    return { ok: false, reason: '現有尺寸或約束使端點無法到達延伸目標，草圖未更改；請先調整相關尺寸或約束' }
  }
  // Preserve non-geometric provenance/flags not represented in the solver's public type.
  const shapes = solved.shapes.map((sh, i) => ({ ...candidates[i], ...sh })) as FShape[]
  return { ok: true, result: { ...solved, shapes } }
}
