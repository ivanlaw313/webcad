import { useMemo } from 'react'
import { BufferGeometry, Float32BufferAttribute } from 'three'
import { useApp, faceGroupTris } from '../store'

// Per-face appearance overlay (Fusion-style): for every B-rep face in `s.faceColors` we rebuild the face's
// triangle fan from the active body mesh (`faceGroupTris`, CAD-space verts) and draw it as a solid standard
// material in the painted color. Same −90°X group as FaceHoverView (bodyMesh is CAD Z-up). raycast disabled
// so these overlays never steal face/edge picks. polygonOffset pulls them in front of the base body shading.
export function PaintedFacesView() {
  const faceColors = useApp((s) => s.faceColors)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const material = useApp((s) => s.material)

  const items = useMemo(() => {
    if (!bodyMesh?.faceGroups) return []
    const out: { geo: BufferGeometry; col: string }[] = []
    for (const [fidStr, col] of Object.entries(faceColors)) {
      const g0 = bodyMesh.faceGroups.find((g) => String(g.faceId) === fidStr)
      if (!g0) continue
      const tris = faceGroupTris(bodyMesh, g0.start / 3)
      if (!tris.length) continue
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(tris, 3))
      geo.computeVertexNormals()
      out.push({ geo, col })
    }
    return out
  }, [faceColors, bodyMesh])

  if (!bodyMesh?.faceGroups || !items.length) return null
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      {items.map((it, i) => (
        <mesh key={i} geometry={it.geo} renderOrder={5} raycast={() => null}>
          <meshStandardMaterial color={it.col} metalness={material.metalness} roughness={material.roughness} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
    </group>
  )
}
