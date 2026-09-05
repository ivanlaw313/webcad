// GM-3DV3 M1：Move/Copy 五模式纯决策核（Free / Translate / Rotate / Point-to-Point / Point-to-Position）。
// 抽离成纯模块（同 moveFacePlan / datumGeom 切法）以便 Node 单测 —— worker 唔参与，commitFeatDlg 用呢个把
// 五模式统一解成既有 `transform` 特征词汇 {dx,dy,dz,rx,ry,rz}（＋ copy 勾／pivot 由 commit 另贴），故 worker 几乎零改动。
//
// 坐标约定：所有输入字段（dx/dy/dz、p1*/p2*）都系【CAD 世界坐标】—— 同 move 对话框 dx/dy/dz 一致（replicad 直接消费），
// 唔做 three→CAD 转换（画布拾点先要转，字段唔使）。

export type MoveType = 'free' | 'translate' | 'rotate' | 'ptp' | 'ptpos'
export type MoveObject = 'bodies' | 'components' | 'faces' | 'sketch'

export interface MoveParams {
  moveType?: string
  // free / translate
  dx?: number | string; dy?: number | string; dz?: number | string
  // free（旋转分量，绕件中心欧拉）
  rx?: number | string; ry?: number | string; rz?: number | string
  // rotate（单轴＋角度）
  raxis?: string; angle?: number | string
  // point-to-point：p1=原点 → p2=目标点；point-to-position：p1=点 → p2=目的坐标
  p1x?: number | string; p1y?: number | string; p1z?: number | string
  p2x?: number | string; p2y?: number | string; p2z?: number | string
}

export interface MoveSolution { dx: number; dy: number; dz: number; rx: number; ry: number; rz: number }

const n = (v: unknown): number => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

// 把五种 Move Type 统一解成 transform 词汇（平移 + 绕件中心欧拉旋转）。
export function solveMove(p: MoveParams): MoveSolution {
  const mt = (String(p.moveType || 'free')) as MoveType
  if (mt === 'ptp' || mt === 'ptpos') {
    // 两者都系「把 p1 搬去 p2」→ 纯平移 = p2 − p1（point-to-position 嘅 p2 = 打字目的坐标）
    return { dx: n(p.p2x) - n(p.p1x), dy: n(p.p2y) - n(p.p1y), dz: n(p.p2z) - n(p.p1z), rx: 0, ry: 0, rz: 0 }
  }
  if (mt === 'rotate') {
    const ax = String(p.raxis || 'Z').toUpperCase()
    const a = n(p.angle)
    return { dx: 0, dy: 0, dz: 0, rx: ax === 'X' ? a : 0, ry: ax === 'Y' ? a : 0, rz: ax === 'Z' ? a : 0 }
  }
  if (mt === 'translate') {
    return { dx: n(p.dx), dy: n(p.dy), dz: n(p.dz), rx: 0, ry: 0, rz: 0 }
  }
  // free：六自由度一齐（旧 move 对话框行为逐字节）
  return { dx: n(p.dx), dy: n(p.dy), dz: n(p.dz), rx: n(p.rx), ry: n(p.ry), rz: n(p.rz) }
}

// 有冇真正嘅移动/旋转（commit 时用嚟拦「零变换」）。
export function isNonZeroMove(s: MoveSolution): boolean {
  return !!(s.dx || s.dy || s.dz || s.rx || s.ry || s.rz)
}
