// surfaceWrap.ts — #174-9 可展面（圆柱）参数映射：Wrap / Emboss-on-Cylinder + Project-to-Surface。
//
// 圆柱系【可展面】：平面草图可无畸变卷上去。约定圆柱轴 = CAD +Y（竖直），半径 R。
//   平面草图点 (x, y) → 圆柱面点：θ = x / R（弧长守恒，x=沿周长），轴向 = y。
//     3D = (R·sinθ, y, R·cosθ)    —— 轴 = Y；θ=0 落 (0,y,R)（正 Z 顶点）。
//   （亦提供绕任意轴/中心嘅一般式 wrapPointToCylinderAxis。）
//
// 诚实边界：只对【可展面】（圆柱 / 圆锥）成立 —— 弧长守恒卷绕。任意自由曲面投影需内核 BRepProj_Projection
//   （真豁免，唔喺纯 JS 范围）。本模块畀圆柱 Emboss / Project-to-Surface 嘅点云映射。
//
// 纯函数、零依赖。

export type Vec3 = [number, number, number]

/**
 * 平面点 (x,y) → 半径 R 圆柱面（轴 = CAD +Y）。θ=x/R 弧长守恒。
 * @param x 沿周长坐标（草图 x）
 * @param y 轴向坐标（草图 y）
 * @param R 圆柱半径（>0）
 * @returns 圆柱面上 3D 点 (R·sinθ, y, R·cosθ)
 */
export function wrapPointToCylinder(x: number, y: number, R: number): Vec3 {
  const theta = x / R
  return [R * Math.sin(theta), y, R * Math.cos(theta)]
}

/** 一串平面草图点卷上圆柱（轴 = +Y）。 */
export function projectCurveToCylinder(pts: [number, number][], R: number): Vec3[] {
  return pts.map(([x, y]) => wrapPointToCylinder(x, y, R))
}

/**
 * 一般式：把平面点 (u,v) 卷到【任意轴 axis、过 center、半径 R】嘅圆柱面。
 *   u = 沿周长（θ=u/R），v = 轴向。面内基 = (radialRef 去轴分量, axis×radialRef)。
 * @returns 圆柱面上 3D 点（CAD）
 */
export function wrapPointToCylinderAxis(u: number, v: number, R: number, center: Vec3, axis: Vec3, radialRef: Vec3): Vec3 {
  const al = Math.hypot(axis[0], axis[1], axis[2]) || 1
  const a: Vec3 = [axis[0] / al, axis[1] / al, axis[2] / al]
  // radialRef 去轴分量 → 单位径向基 e0
  const d = radialRef[0] * a[0] + radialRef[1] * a[1] + radialRef[2] * a[2]
  let e0: Vec3 = [radialRef[0] - d * a[0], radialRef[1] - d * a[1], radialRef[2] - d * a[2]]
  const e0l = Math.hypot(e0[0], e0[1], e0[2]) || 1
  e0 = [e0[0] / e0l, e0[1] / e0l, e0[2] / e0l]
  // e1 = a × e0（周向）
  const e1: Vec3 = [a[1] * e0[2] - a[2] * e0[1], a[2] * e0[0] - a[0] * e0[2], a[0] * e0[1] - a[1] * e0[0]]
  const theta = u / R
  const cr = R * Math.cos(theta), sr = R * Math.sin(theta)
  return [
    center[0] + cr * e0[0] + sr * e1[0] + v * a[0],
    center[1] + cr * e0[1] + sr * e1[1] + v * a[1],
    center[2] + cr * e0[2] + sr * e1[2] + v * a[2],
  ]
}
