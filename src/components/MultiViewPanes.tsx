import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei'
import { BufferGeometry, Float32BufferAttribute, type Camera } from 'three'
import { useApp } from '../store'
import type { MeshData } from '../worker/cad.worker'
import { tStatus, type Lang } from '../i18n'

/** Standard orthographic / iso camera presets for Fusion-style viewport layout. */
export type MultiViewPreset = 'front' | 'right' | 'top' | 'iso'

export const SPLIT_PANES: { view: MultiViewPreset; label: string }[] = [
  { view: 'front', label: '前視' },
  { view: 'right', label: '右視' },
]
export const QUAD_PANES: { view: MultiViewPreset; label: string }[] = [
  { view: 'top', label: '上視' },
  { view: 'front', label: '前視' },
  { view: 'right', label: '右視' },
  { view: 'iso', label: '等角' },
]

function PaneBody({ mesh, color, pos }: { mesh: MeshData; color?: string; pos?: [number, number, number] }) {
  const geom = useMemo(() => {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(mesh.vertices, 3))
    g.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3))
    g.setIndex(mesh.triangles)
    return g
  }, [mesh])
  useEffect(() => () => { geom.dispose() }, [geom])
  // Match KernelBody: OCCT Z-up → Three Y-up via −90° about X.
  return (
    <group position={pos ?? [0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh geometry={geom}>
        <meshStandardMaterial color={color || '#4a7296'} metalness={0.12} roughness={0.55} />
      </mesh>
    </group>
  )
}

function sceneBounds(body: MeshData | null, comps: { mesh: MeshData; pos: [number, number, number]; hidden?: boolean }[]) {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity, has = false
  const push = (mesh: MeshData, off: [number, number, number]) => {
    const v = mesh.vertices
    for (let i = 0; i < v.length; i += 3) {
      // Same swizzle as ViewRig / FitView (CAD → three).
      const tx = v[i] + off[0], ty = v[i + 2] + off[1], tz = -v[i + 1] + off[2]
      if (tx < minX) minX = tx; if (tx > maxX) maxX = tx
      if (ty < minY) minY = ty; if (ty > maxY) maxY = ty
      if (tz < minZ) minZ = tz; if (tz > maxZ) maxZ = tz
      has = true
    }
  }
  if (body) push(body, [0, 0, 0])
  for (const c of comps) if (!c.hidden) push(c.mesh, c.pos)
  if (!has) return { cx: 0, cy: 20, cz: 0, r: 100 }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    cz: (minZ + maxZ) / 2,
    r: Math.max(maxX - minX, maxY - minY, maxZ - minZ, 20) * 0.5,
  }
}

function CameraFramer({ view }: { view: MultiViewPreset }) {
  const camera = useThree((s) => s.camera) as Camera & {
    isOrthographicCamera?: boolean
    left: number; right: number; top: number; bottom: number
    zoom: number; updateProjectionMatrix: () => void
    position: { set: (x: number, y: number, z: number) => void }
    lookAt: (x: number, y: number, z: number) => void
  }
  const controls = useThree((s) => s.controls) as unknown as
    | { target: { set: (x: number, y: number, z: number) => void }; update: () => void }
    | null
  const bodyMesh = useApp((s) => s.bodyMesh)
  const components = useApp((s) => s.components)
  const bodyColor = useApp((s) => s.bodyColor)
  // bodyColor read keeps pane materials in sync when appearance changes (parent re-renders scene too).
  void bodyColor
  useEffect(() => {
    const { cx, cy, cz, r } = sceneBounds(bodyMesh, components)
    const d = r * 3.2
    const p =
      view === 'top' ? [cx + 0.01, cy + d, cz]
        : view === 'front' ? [cx, cy, cz + d]
          : view === 'right' ? [cx + d, cy, cz]
            : [cx + d * 0.7, cy + d * 0.7, cz + d * 0.9]
    camera.position.set(p[0], p[1], p[2])
    if (camera.isOrthographicCamera) {
      const fr = Math.min(camera.right - camera.left, camera.top - camera.bottom) / 2
      if (fr > 0 && r > 0) { camera.zoom = fr / (r * 1.15); camera.updateProjectionMatrix() }
    }
    if (controls) { controls.target.set(cx, cy, cz); controls.update() }
    else camera.lookAt(cx, cy, cz)
  }, [view, camera, controls, bodyMesh, components])
  return null
}

function PaneScene() {
  const bodyMesh = useApp((s) => s.bodyMesh)
  const components = useApp((s) => s.components)
  const bodyColor = useApp((s) => s.bodyColor)
  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#ffffff', '#9aa4ad', 0.5]} />
      <directionalLight position={[120, 200, 140]} intensity={0.7} />
      <directionalLight position={[-150, 90, -60]} intensity={0.4} color="#cfe0f0" />
      {components.filter((c) => !c.hidden).map((c) => (
        <PaneBody key={c.id} mesh={c.mesh} color={c.color || bodyColor} pos={c.pos} />
      ))}
      {bodyMesh && bodyMesh.triangles.length > 0 && <PaneBody mesh={bodyMesh} color={bodyColor} />}
    </>
  )
}

function OnePane({ view, label, lang, empty }: { view: MultiViewPreset; label: string; lang: Lang; empty: boolean }) {
  const ortho = view !== 'iso'
  return (
    <div className="vp-pane" data-testid={`vp-pane-${view}`} data-view={view}>
      <div className="vp-pane-label">{tStatus(label, lang)} · {tStatus('預覽／環視', lang)}</div>
      {empty && (
        <div className="vp-pane-empty" data-testid={`vp-pane-empty-${view}`} role="status">
          {tStatus('此窗格暫無實體 — 請在「單一視圖」建模後再切回二／四視圖預覽', lang)}
        </div>
      )}
      <Canvas
        style={{ position: 'absolute', inset: 0, touchAction: 'none' }}
        gl={{ antialias: true, alpha: true }}
        camera={ortho ? undefined : { position: [240, 190, 270], fov: 28, near: 0.5, far: 100000 }}
      >
        {ortho
          ? <OrthographicCamera makeDefault position={[240, 190, 270]} near={-100000} far={200000} zoom={4} />
          : <PerspectiveCamera makeDefault position={[240, 190, 270]} fov={28} near={0.5} far={100000} />}
        <PaneScene />
        <CameraFramer view={view} />
        <OrbitControls makeDefault enableDamping={false} />
      </Canvas>
    </div>
  )
}

/** Live multi-camera grid: split = front|right, quad = top|front|right|iso.
 *  Honesty: panes are preview/orbit only — full sketch/feature tooling stays on single layout. */
export default function MultiViewPanes({ layout }: { layout: 'split' | 'quad' }) {
  const lang = useApp((s) => s.lang)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const components = useApp((s) => s.components)
  const panes = layout === 'split' ? SPLIT_PANES : QUAD_PANES
  const empty = !(bodyMesh && bodyMesh.triangles.length > 0) && !components.some((c) => !c.hidden && c.mesh?.triangles?.length)
  return (
    <div
      className={`vp-multiview vp-multiview-${layout}`}
      data-testid="vp-multiview"
      data-layout={layout}
      data-multiview-preview="true"
    >
      <div className="vp-multiview-banner" data-testid="vp-multiview-honesty" role="status">
        {tStatus(layout === 'split' ? '二視圖 · 預覽／環視（完整工具請切回「單一視圖」）' : '四視圖 · 預覽／環視（完整工具請切回「單一視圖」）', lang)}
      </div>
      {panes.map((p) => <OnePane key={p.view + layout} view={p.view} label={p.label} lang={lang} empty={empty} />)}
    </div>
  )
}
