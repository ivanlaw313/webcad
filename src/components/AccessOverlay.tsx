import { useMemo, useEffect } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { useApp } from '../store'

// #174-7 脱模可达性 overlay（Fusion Inspect › Accessibility / undercut）：逐三角沿脱模方向射线，
// 被自身网格挡=倒扣不可脱(红)、通=可脱(绿)。accessResult 由 store.runAccessibility（纯函数 analyzeAccessibility）
// 算好 去索引 position + 逐三角色 buffer。同 DraftOverlay 一样喺 −90°X 组（bodyMesh 系 CAD Z-up）；raycast 关。
export function AccessOverlay() {
  const access = useApp((s) => s.accessResult)
  const geo = useMemo(() => {
    if (!access || !access.positions.length) return null
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(access.positions.slice(), 3))
    g.setAttribute('color', new Float32BufferAttribute(access.colors.slice(), 3))
    g.computeVertexNormals()
    return g
  }, [access])
  useEffect(() => () => { geo?.dispose() }, [geo])
  if (!geo) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geo} renderOrder={6} raycast={() => null}>
        <meshStandardMaterial vertexColors metalness={0.1} roughness={0.72} polygonOffset polygonOffsetFactor={-2} />
      </mesh>
    </group>
  )
}
