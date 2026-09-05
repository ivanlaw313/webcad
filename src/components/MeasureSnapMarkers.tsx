import { useMemo, useEffect } from 'react'
import { BufferGeometry, Float32BufferAttribute, EdgesGeometry } from 'three'
import { useApp } from '../store'

// #174-6：测量「Show Snap Points」标记（Fusion Measure ▸ Snap Points）。measureSnapMarkers 状态早已在（GM-X1 #3，
// 但明标「视觉留后续」）。呢度补渲染 —— 量测任一模式开住 + 开关打钩 → 喺活动实体【特征边端点 + 边中点】画细点，
// 畀用户睇清有边啲可捕捉点。特征边复用 three EdgesGeometry（同视口 <Edges> 一致嘅二面角阈值）抽。
//   诚实边界：顶点/中点已画；「圆心」（圆柱面轴心）呢版未含（需逐面圆柱拟合）—— 用构造几何「圆边取心」补。
//   同 bodyMesh 一样喺 −90°X 组（CAD Z-up）；raycast 关，唔抢量测拾取。封顶点数防大网格卡。

const MAX_MARKERS = 1200

export function MeasureSnapMarkers() {
  const on = useApp((s) => s.measureSnapMarkers)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const mMode = useApp((s) => s.measureMode)
  const mEdge = useApp((s) => s.measureEdgeMode)
  const mFace = useApp((s) => s.measureFaceMode)
  const mAngle = useApp((s) => s.measureAngleMode)
  const mUni = useApp((s) => s.measureUniMode)
  const active = on && (mMode || mEdge || mFace || mAngle || mUni)

  const geo = useMemo(() => {
    if (!active || !bodyMesh?.vertices?.length || !bodyMesh.triangles?.length) return null
    const base = new BufferGeometry()
    base.setAttribute('position', new Float32BufferAttribute(bodyMesh.vertices.slice(), 3))
    base.setIndex(bodyMesh.triangles.slice())
    const eg = new EdgesGeometry(base, 24)   // 24° 二面角 = 同视口 <Edges> 特征边一致
    const pos = eg.getAttribute('position')
    base.dispose(); eg.dispose()
    // 收唯一端点（量化去重）+ 每条边中点
    const q = 1e-3
    const key = (x: number, y: number, z: number) => `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`
    const seen = new Set<string>()
    const pts: number[] = []
    const push = (x: number, y: number, z: number) => {
      const k = key(x, y, z)
      if (seen.has(k)) return
      seen.add(k); pts.push(x, y, z)
    }
    for (let i = 0; i + 1 < pos.count && pts.length < MAX_MARKERS * 3; i += 2) {
      const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i)
      const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1)
      push(ax, ay, az); push(bx, by, bz)                       // 端点
      push((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)        // 中点
    }
    if (!pts.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(pts, 3))
    return g
  }, [active, bodyMesh])

  useEffect(() => () => { geo?.dispose() }, [geo])
  if (!geo) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <points geometry={geo} renderOrder={998} raycast={() => null}>
        <pointsMaterial size={5} sizeAttenuation={false} color="#f0a020" depthTest={false} toneMapped={false} />
      </points>
    </group>
  )
}
