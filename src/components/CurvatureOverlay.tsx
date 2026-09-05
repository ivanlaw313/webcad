import { useMemo, useEffect } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { useApp } from '../store'
import { meshCurvature, principalCurvaturesHK } from '../cad/curvatureAnalysis'
import { principalCurvature } from '../cad/curvatureComb'   // S190：曲率梳主方向

// S118b 真曲率分析 overlay（Fusion Inspect › Curvature）：升级原 inspectShade:'curv' 嘅【屏幕空间
// fwidth(N) 近似】为【真·逐顶点平均曲率】(cotangent Laplace-Beltrami + 混合 Voronoi 面积，Meyer 2003)。
// 逐顶点 |H| → 冷暖配色（蓝=平坦 → 红=高曲率/尖）。B-rep 锐边顶点跨面去重 = 边界 → H=0（诚实：
// 锐棱唔系光滑曲率，平/柱/球/圆角面内共享顶点先算到真曲率）。同 PaintedFacesView 一样喺 −90°X 组。
// 唔接 zebra（zebra 仍走原 shader）；inspectShade==='curv' 时由本 overlay 取代屏幕空间近似。

// jet 冷暖（蓝→青→绿→黄→红），t∈[0,1]，红=高曲率
function curvColor(t: number): [number, number, number] {
  const c = (x: number) => Math.max(0, Math.min(1, 1.5 - Math.abs(x)))
  return [c(4 * t - 3), c(4 * t - 2), c(4 * t - 1)]
}
// S179 高斯曲率 K 发散色阶（蓝=鞍 K<0 · 白=可展 K≈0 · 红=凸 K>0），t∈[−1,1]
function gaussColor(t: number): [number, number, number] {
  const u = Math.max(-1, Math.min(1, t))
  const r = u >= 0 ? 1 : 1 + u
  const b = u <= 0 ? 1 : 1 - u
  const g = 1 - Math.abs(u)
  return [r, g, b]
}

export function CurvatureOverlay() {
  const inspectShade = useApp((s) => s.inspectShade)
  const bodyMesh = useApp((s) => s.bodyMesh)

  const geo = useMemo(() => {
    const gauss = inspectShade === 'gausscurv'
    // #174-3：kmax（≥0，jet 蓝→红）/ kmin（有符号，发散色阶蓝鞍→白→红凸）派生主曲率
    const kmax = inspectShade === 'kmax', kmin = inspectShade === 'kmin'
    const diverging = gauss || kmin   // 有符号场用发散色阶（gaussColor）
    if ((inspectShade !== 'curv' && !gauss && !kmax && !kmin) || !bodyMesh?.vertices?.length || !bodyMesh.triangles?.length) return null
    let field: Float64Array
    if (kmax || kmin) {
      const pc = principalCurvaturesHK(bodyMesh.vertices as number[], bodyMesh.triangles as number[])
      field = kmax ? pc.kmax : pc.kmin
    } else {
      const cur = meshCurvature(bodyMesh.vertices, bodyMesh.triangles)
      field = gauss ? cur.gaussian : cur.mean   // K(有符号) / |H|(非负)；边界=0
    }
    const nV = field.length
    if (!nV) return null
    // 稳健归一：用 95 分位 |值| 避免单条锐边顶点拉爆色阶
    const sorted = Array.from(field).map(Math.abs).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
    const hi = sorted.length ? (sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1]) : 0
    // S179 audit HIGH：高斯曲率绝对地板 —— 可展面（圆柱/圆锥，K≈0）只剩数值噪声，若纯按 95 分位归一会把噪声放大成红/蓝麻点。
    // kRef = 「整模一个弯」量级 1/L²（L=包围盒对角）；K 远细过佢 → 落白（可展/平面正确显示为白）。仅高斯模式用，平均曲率沿用旧归一。
    let kRef = 0
    if (gauss) {
      const vv = bodyMesh.vertices; let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
      for (let i = 0; i < vv.length; i += 3) { const x = vv[i], y = vv[i + 1], z = vv[i + 2]; if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z; if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z }
      const L = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) || 1
      kRef = 0.5 / (L * L)
    }
    const scale = Math.max(hi, kRef, 1e-12)
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(bodyMesh.vertices.slice(), 3))
    g.setIndex(bodyMesh.triangles.slice())
    const colors = new Float32Array(nV * 3)
    for (let i = 0; i < nV; i++) {
      // #174-3：kmin 走发散色阶（有符号，鞍<0 蓝 / 凸>0 红）；kmax/curv 走 jet 单向（0 蓝 → 高 红）
      const [r, gg, b] = diverging ? gaussColor(field[i] / scale) : curvColor(Math.min(1, Math.max(0, field[i] / scale)))
      colors[i * 3] = r; colors[i * 3 + 1] = gg; colors[i * 3 + 2] = b
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3))
    return g
  }, [inspectShade, bodyMesh])

  // GPU 资源清理（gotcha d）：three 唔自动 GC VBO/IBO；inspectShade 喺 curv↔gausscurv 切换 / 卸载时 dispose 旧 geo，免每次切模式泄漏。对齐同档 DraftOverlay/SlopeOverlay/CurvatureCombOverlay。
  useEffect(() => () => { geo?.dispose() }, [geo])

  if (!geo) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geo} renderOrder={5} raycast={() => null}>
        <meshBasicMaterial vertexColors toneMapped={false} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  )
}

// S190：曲率梳 Curvature Comb（Fusion Inspect）—— 逐点画主曲率方向【十字梳齿】：黄=最大主曲率方向 e₁、
// 青=最小主曲率方向 e₂，梳齿长度 ∝ 该方向曲率强度（越弯越长）。睇曲面主流向 + 光顺度（A 级曲面检查）。
// principalCurvature（curvatureComb.ts，Node 测过：柱面 κ₁=1/R）逐点曲率张量；同 −90°X group、raycast 关、depthTest 关浮面上。
export function CurvatureCombOverlay() {
  const inspectShade = useApp((s) => s.inspectShade)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const geo = useMemo(() => {
    if (inspectShade !== 'comb' || !bodyMesh?.vertices?.length || !bodyMesh.triangles?.length) return null
    const V = bodyMesh.vertices
    const pc = principalCurvature(V, bodyMesh.triangles)
    const nv = pc.k1.length
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity
    for (let i = 0; i < V.length; i += 3) { const x = V[i], y = V[i + 1], z = V[i + 2]; if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z; if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z }
    const diag = Math.hypot(mxx - mnx, mxy - mny, mxz - mnz) || 1
    const baseLen = diag * 0.022
    const ks: number[] = []; for (let i = 0; i < nv; i++) if (!pc.boundary[i]) ks.push(Math.abs(pc.k1[i]))
    ks.sort((a, b) => a - b); const hi = ks.length ? (ks[Math.floor(ks.length * 0.92)] || ks[ks.length - 1]) : 1
    const stride = Math.max(1, Math.floor(nv / 2500))   // 封顶 ~2500 十字 → 5000 段
    const pos: number[] = [], col: number[] = []
    const Y = [0.96, 0.84, 0.12], C = [0.13, 0.82, 0.92]   // 黄 e₁ / 青 e₂
    for (let i = 0; i < nv; i += stride) {
      if (pc.boundary[i]) continue
      const o = i * 3, x = V[o], y = V[o + 1], z = V[o + 2]
      const L1 = baseLen * Math.max(0.18, Math.min(1, Math.abs(pc.k1[i]) / (hi || 1)))
      const L2 = baseLen * Math.max(0.08, Math.min(1, Math.abs(pc.k2[i]) / (hi || 1)))
      pos.push(x - pc.e1[o] * L1, y - pc.e1[o + 1] * L1, z - pc.e1[o + 2] * L1, x + pc.e1[o] * L1, y + pc.e1[o + 1] * L1, z + pc.e1[o + 2] * L1); col.push(Y[0], Y[1], Y[2], Y[0], Y[1], Y[2])
      pos.push(x - pc.e2[o] * L2, y - pc.e2[o + 1] * L2, z - pc.e2[o + 2] * L2, x + pc.e2[o] * L2, y + pc.e2[o + 1] * L2, z + pc.e2[o + 2] * L2); col.push(C[0], C[1], C[2], C[0], C[1], C[2])
    }
    if (!pos.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new Float32BufferAttribute(col, 3))
    return g
  }, [inspectShade, bodyMesh])
  useEffect(() => () => geo?.dispose(), [geo])
  if (!geo) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <lineSegments geometry={geo} renderOrder={6} raycast={() => null}>
        <lineBasicMaterial vertexColors transparent opacity={0.95} toneMapped={false} depthTest={false} />
      </lineSegments>
    </group>
  )
}

// S180：最小曲率半径「最弯处」红球标记（Fusion Inspect Minimum Radius）。inspectInfo.center 系 CAD 坐标 → CAD→three [x,z,−y]（同 revolve 轴球）。
export function MinRadiusMarker() {
  const info = useApp((s) => s.inspectInfo)
  const on = useApp((s) => s.inspectMode)
  if (!on || !info || info.kind !== '最小曲率半径' || !info.center) return null
  const c = info.center
  return (
    <mesh position={[c[0], c[2], -c[1]]} renderOrder={999} raycast={() => null}>
      <sphereGeometry args={[2.4, 18, 18]} />
      <meshBasicMaterial color="#e0322a" depthTest={false} />
    </mesh>
  )
}
