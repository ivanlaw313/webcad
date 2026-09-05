// toObjectPick.ts — #174-5 拉伸/孔「To-Object」目标面拾取纯逻辑。
//
// Fusion「To Object」：拉伸/孔延伸到拾中嘅目标几何。webcad 内核路径系【单一距离 extrude】沿草图法向，
// 所以窄版语义 = 延伸到【拾取点】喺草图法向轴上嘅深度（该点喺目标面上嘅位置），做平盖。
//   诚实边界：目标限【平面】或【可射线命中嘅面】；非平行平面亦准拾（取拾取点深度，非整面），
//   真斜切盖需内核。
//
// 纯函数、零依赖。

export type SketchPlane = 'XY' | 'XZ' | 'YZ'
export type Vec3 = [number, number, number]

/** 草图平面 → 法向轴。XY→Z、XZ→Y、YZ→X。 */
export function sketchNormalAxis(plane: SketchPlane): 0 | 1 | 2 {
  return plane === 'XY' ? 2 : plane === 'XZ' ? 1 : 0
}

/** 拾取点（CAD）喺草图法向轴上嘅坐标 = To-Object 目标深度。 */
export function targetDepthAlongSketchNormal(plane: SketchPlane, pickCAD: Vec3): number {
  return pickCAD[sketchNormalAxis(plane)]
}

/** 目标面法向是否与草图平面法向平行（同轴）。窄版 v1 只对平行面出平盖；非平行 = 拾点深度盖。 */
export function isParallelTarget(plane: SketchPlane, faceNormal: Vec3, tol = 0.985): boolean {
  const a = Math.abs(faceNormal[0]), b = Math.abs(faceNormal[1]), c = Math.abs(faceNormal[2])
  return plane === 'XY' ? c >= tol : plane === 'XZ' ? b >= tol : a >= tol
}
