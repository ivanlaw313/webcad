// ucsBuilder.ts — #174-1 用户坐标系 UCS（对标 Fusion CONSTRUCT 一次生成一组正交基准）。
//
// 畀一个【帧】：原点 origin + 法向 normal（+ 可选面内 x 提示 xHint），生成一套完整局部坐标系：
//   • 3 个正交参考平面（arb 形式 { o, xd, n }）：XY 面(n=Z)、XZ 面(n=Y)、YZ 面(n=X)
//   • 3 条构造轴（沿 X / Y / Z，dirV 精确方向）
//   • 1 个构造点（原点）
// 全部纯几何组合（datum 原语内核已全在）—— 调用方把呢批喂 addDatumFeature / caxes / cpoints，
// 打同一 ucsGroup 标，浏览器树成「UCS」组。
//
// 坐标系 CAD（Z-up）。返回值单位向量正交（右手：Z=normal, X=orthonormalized xHint, Y=Z×X）。
// 纯函数、零依赖、无副作用。

export type Vec3 = [number, number, number]
export type ArbPlane = { o: Vec3; xd: Vec3; n: Vec3 }
export type UcsAxis = { dir: 'X' | 'Y' | 'Z'; at: Vec3; dirV: Vec3 }
export type UcsResult = {
  origin: Vec3
  x: Vec3; y: Vec3; z: Vec3           // 正交单位基
  planes: [ArbPlane, ArbPlane, ArbPlane]   // [XY(n=z), XZ(n=y), YZ(n=x)]
  axes: [UcsAxis, UcsAxis, UcsAxis]        // [X, Y, Z]
  point: Vec3
}

function norm(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / l, v[1] / l, v[2] / l]
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}
function dot(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] }

/**
 * 由 origin + normal（+ 可选 xHint）建 UCS。
 * @param origin CAD 原点
 * @param normal Z 轴方向（会归一化）；零向量退回世界 +Z
 * @param xHint  面内 X 参考（会正交化去除 normal 分量）；缺省 / 与 normal 平行时自动取稳定参考
 */
export function buildUCS(origin: Vec3, normal: Vec3, xHint?: Vec3): UcsResult {
  let z = norm(normal)
  if (!Number.isFinite(z[0]) || Math.hypot(normal[0], normal[1], normal[2]) < 1e-12) z = [0, 0, 1]
  // 选面内 X：优先 xHint，去 normal 分量；退化 → 用世界轴中同 z 最不平行者
  let xd = xHint ? [...xHint] as Vec3 : (Math.abs(z[2]) < 0.9 ? [0, 0, 1] as Vec3 : [1, 0, 0] as Vec3)
  const d = dot(xd, z)
  xd = [xd[0] - d * z[0], xd[1] - d * z[1], xd[2] - d * z[2]]
  if (Math.hypot(xd[0], xd[1], xd[2]) < 1e-9) {
    // xHint 平行 z → fallback
    const alt: Vec3 = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]
    const d2 = dot(alt, z)
    xd = [alt[0] - d2 * z[0], alt[1] - d2 * z[1], alt[2] - d2 * z[2]]
  }
  const x = norm(xd)
  const y = norm(cross(z, x))   // 右手

  const planes: [ArbPlane, ArbPlane, ArbPlane] = [
    { o: origin, xd: x, n: z },   // XY 面（法向 = Z）
    { o: origin, xd: x, n: y },   // XZ 面（法向 = Y），面内 x = X
    { o: origin, xd: y, n: x },   // YZ 面（法向 = X），面内 x = Y
  ]
  const axes: [UcsAxis, UcsAxis, UcsAxis] = [
    { dir: 'X', at: origin, dirV: x },
    { dir: 'Y', at: origin, dirV: y },
    { dir: 'Z', at: origin, dirV: z },
  ]
  return { origin, x, y, z, planes, axes, point: origin }
}
