import { useMemo, useEffect } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { useApp, faceGroupTris } from '../store'

// S187 斜度分析 overlay（Inspect › Slope）：逐 B-rep 面按相对参考平面嘅倾角分类着色 —
//   绿 flat       = 平面/近水平（法向 ∥ 参考方向，倾角 ≤ flatDeg）— 可俯视加工 / 地板顶面
//   黄 transition = 斜过渡面（flatDeg < 倾角 < steepDeg）
//   蓝 steep      = 陡 / 竖直壁（法向 ⊥ 参考方向，倾角 ≥ steepDeg）
// 同 DraftOverlay/PaintedFacesView 一样喺 −90°X 组（bodyMesh 系 CAD Z-up）逐面重建三角扇；
// raycast 关，唔抢拣面/棱；polygonOffset 拉前盖底层着色。slopeResult 由 store.runSlopeAnalysis（纯函数 analyzeSlope）算。
const SLOPE_COL: Record<string, string> = { flat: '#2e9e5b', transition: '#e0b020', steep: '#3b7fd2' }

export function SlopeOverlay() {
  const slopeResult = useApp((s) => s.slopeResult)
  const bodyMesh = useApp((s) => s.bodyMesh)

  const items = useMemo(() => {
    if (!slopeResult || !bodyMesh?.faceGroups) return []
    const out: { geo: BufferGeometry; col: string }[] = []
    for (const f of slopeResult.faces) {
      const g0 = bodyMesh.faceGroups.find((g) => g.faceId === f.faceId)
      if (!g0) continue
      const tris = faceGroupTris(bodyMesh, g0.start / 3)   // start 系 triangles 下标（3/三角）→ /3 = 首三角序号
      if (!tris.length) continue
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(tris, 3))
      geo.computeVertexNormals()
      out.push({ geo, col: SLOPE_COL[f.cls] || '#888888' })
    }
    return out
  }, [slopeResult, bodyMesh])
  // S187 audit LOW：每次重算（X/Y/Z 切基准、清除、xray/线框）都重建逐面 BufferGeometry；three 唔 GC 释放 GPU VBO/IBO，必须显式 dispose（同 SketchLayer/ParkedBody 一致）。
  useEffect(() => () => { items.forEach((it) => it.geo.dispose()) }, [items])

  if (!slopeResult || !items.length) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {items.map((it, i) => (
        <mesh key={i} geometry={it.geo} renderOrder={6} raycast={() => null}>
          <meshStandardMaterial color={it.col} metalness={0.1} roughness={0.72} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
    </group>
  )
}
