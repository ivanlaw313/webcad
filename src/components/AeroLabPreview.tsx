// Aero Design Lab — small 3D preview of a candidate (pure-TS mesh, no kernel needed).
import { useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { TriMesh } from '../aero/geometry'

export default function AeroLabPreview({ mesh }: { mesh: TriMesh }) {
  const { geo, radius } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    // CAD is Z-up; three is Y-up → rotate so the preview reads like the main viewport
    g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3))
    g.setIndex(mesh.triangles)
    g.rotateX(-Math.PI / 2)
    g.computeVertexNormals()
    g.computeBoundingSphere()
    const bs = g.boundingSphere!
    g.translate(-bs.center.x, -bs.center.y, -bs.center.z)
    return { geo: g, radius: Math.max(bs.radius, 1) }
  }, [mesh])
  return (
    <div style={{ height: 220, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', background: 'linear-gradient(#e9eef3,#cfd8e1)' }}>
      <Canvas camera={{ position: [radius * 1.6, radius * 1.1, radius * 1.9], near: radius / 100, far: radius * 50 }} dpr={[1, 2]}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[radius * 2, radius * 3, radius * 2]} intensity={1.1} />
        <directionalLight position={[-radius * 2, -radius, -radius]} intensity={0.35} />
        <mesh geometry={geo}>
          <meshStandardMaterial color="#8fb3d9" metalness={0.15} roughness={0.45} side={THREE.DoubleSide} />
        </mesh>
        <OrbitControls makeDefault enableDamping={false} />
      </Canvas>
    </div>
  )
}
