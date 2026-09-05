import { useMemo, useEffect } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { useApp, faceGroupTris } from '../store'
import { analyzeDraftGradient } from '../cad/draftAnalysis'   // #174-4：逐三角梯度

// S118 拔模分析 overlay（Fusion Inspect › Draft）：逐 B-rep 面按拔模角 vs 脱模方向分类着色 —
//   绿 positive = 正拔模（动模拉出方向有正角度，可脱模）
//   红 negative = 倒扣 undercut（负角度，硬开模会拉伤 / 模具开唔到，要侧抽或拆件）
//   黄 vertical = 平行脱模方向（≈0°，竖直壁，无拔模，紧贴模壁要侧抽芯或加拔模）
// 同 PaintedFacesView 一样喺 −90°X 组（bodyMesh 系 CAD Z-up）逐面重建三角扇；raycast 关，唔抢拣面/棱。
// polygonOffset 拉前，盖住底层本体着色。draftResult 由 store.runDraftAnalysis 算（纯函数 analyzeDraft）。
const DRAFT_COL: Record<string, string> = { positive: '#2e9e5b', negative: '#d23b30', vertical: '#e0b020' }

export function DraftOverlay() {
  const draftResult = useApp((s) => s.draftResult)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const draftGradient = useApp((s) => s.draftGradient)
  const draftPull = useApp((s) => s.draftPull)

  // #174-4：逐三角连续梯度（绿→黄→红）。补足逐面平均掩盖【面内】最差点（自由曲面一张面法向变化大时）。
  const gradGeo = useMemo(() => {
    if (!draftResult || !draftGradient || !bodyMesh?.vertices?.length || !bodyMesh.triangles?.length) return null
    const g = analyzeDraftGradient(bodyMesh.vertices, bodyMesh.triangles, draftPull)
    const geo = new BufferGeometry()
    geo.setAttribute('position', new Float32BufferAttribute(g.positions, 3))
    geo.setAttribute('color', new Float32BufferAttribute(g.colors, 3))
    geo.computeVertexNormals()
    return geo
  }, [draftResult, draftGradient, bodyMesh, draftPull])
  useEffect(() => () => { gradGeo?.dispose() }, [gradGeo])

  const items = useMemo(() => {
    if (!draftResult || !bodyMesh?.faceGroups) return []
    const out: { geo: BufferGeometry; col: string }[] = []
    for (const f of draftResult.faces) {
      const g0 = bodyMesh.faceGroups.find((g) => g.faceId === f.faceId)
      if (!g0) continue
      const tris = faceGroupTris(bodyMesh, g0.start / 3)   // start 系 triangles 下标（3/三角）→ /3 = 首三角序号
      if (!tris.length) continue
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(tris, 3))
      geo.computeVertexNormals()
      out.push({ geo, col: DRAFT_COL[f.cls] || '#888888' })
    }
    return out
  }, [draftResult, bodyMesh])
  // S187 audit LOW：重建逐面 BufferGeometry 时显式 dispose 旧批（three 唔 GC GPU VBO/IBO）— 修 DraftOverlay 既有泄漏，同 SlopeOverlay 一致。
  useEffect(() => () => { items.forEach((it) => it.geo.dispose()) }, [items])

  if (!draftResult) return null
  // #174-4：梯度模式 → 单个逐三角上色 mesh 取代逐面分类色。
  if (draftGradient && gradGeo) {
    return (
      <group rotation={[-Math.PI / 2, 0, 0]}>
        <mesh geometry={gradGeo} renderOrder={6} raycast={() => null}>
          <meshStandardMaterial vertexColors metalness={0.1} roughness={0.72} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      </group>
    )
  }
  if (!items.length) return null
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
