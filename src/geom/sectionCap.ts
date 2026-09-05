// sectionCap.ts — S186：剖面「实心封盖」切面三角抽取（Fusion section view 切面上色用）。
//
// 实心剖面（refreshSectionCap → splitBuild 布尔交集）出嘅半实体网格，其【切面】= 剖切平面
// （axis 坐标 = offset）上嘅一张平整面。该面嘅三角【三个顶点全部贴喺该平面】—— 纯几何筛选
// （唔需 faceGroup / 法线：三顶点都喺 coord=offset ⇒ 三角必与平面共面 ⇒ 法向 = ±axis）。
// 返回独立重索引嘅 {vertices, triangles}，供 Viewport 用另一种材质（醒目切面色）渲染；冇切面三角返 null。
//
// 纯函数、零 import、无副作用 —— Node-testable（npx tsx）。

export function cutFaceGeom(
  mesh: { vertices: ArrayLike<number>; triangles: ArrayLike<number> },
  axis: 'X' | 'Y' | 'Z',
  offset: number,
  eps = 0.05,
): { vertices: Float32Array; triangles: Uint32Array } | null {
  const ai = axis === 'X' ? 0 : axis === 'Y' ? 1 : 2
  const v = mesh.vertices, t = mesh.triangles
  if (!v || !t || !t.length) return null
  const onPlane = (vi: number) => Math.abs(v[vi * 3 + ai] - offset) <= eps
  const outV: number[] = []
  const outT: number[] = []
  const remap = new Map<number, number>()
  const idx = (vi: number): number => {
    let m = remap.get(vi)
    if (m === undefined) { m = outV.length / 3; remap.set(vi, m); outV.push(v[vi * 3], v[vi * 3 + 1], v[vi * 3 + 2]) }
    return m
  }
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i], b = t[i + 1], c = t[i + 2]
    if (onPlane(a) && onPlane(b) && onPlane(c)) outT.push(idx(a), idx(b), idx(c))
  }
  if (!outT.length) return null
  return { vertices: new Float32Array(outV), triangles: new Uint32Array(outT) }
}

// 切面面积（投影到剖切平面内 2D，鞋带和）—— 供测试/读出；axis 决定投影平面。
export function cutFaceArea(geom: { vertices: Float32Array; triangles: Uint32Array }, axis: 'X' | 'Y' | 'Z'): number {
  const v = geom.vertices, t = geom.triangles
  // 投影到平面：丢弃 axis 分量，用另两轴
  const u = axis === 'X' ? 1 : 0, w = axis === 'Z' ? 1 : 2
  let s = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    const ax = v[a + u], ay = v[a + w], bx = v[b + u], by = v[b + w], cx = v[c + u], cy = v[c + w]
    s += Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2
  }
  return s
}
