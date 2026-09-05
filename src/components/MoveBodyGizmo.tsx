// Fusion-style Move/Copy triad for the active solid body.
// It updates the dialog fields while dragging, keeping the triad, preview and committed feature in sync.
import { useMemo, useRef } from 'react'
import { PivotControls } from '@react-three/drei'
import { Euler, Matrix4, Quaternion, Vector3 } from 'three'
import { useApp } from '../store'

const round3 = (n: number) => Math.round(n * 1000) / 1000

function meshCentre(v: ArrayLike<number>): [number, number, number] {
  let xmin = Infinity, ymin = Infinity, zmin = Infinity
  let xmax = -Infinity, ymax = -Infinity, zmax = -Infinity
  for (let i = 0; i + 2 < v.length; i += 3) {
    const x = v[i], y = v[i + 1], z = v[i + 2]
    if (x < xmin) xmin = x; if (x > xmax) xmax = x
    if (y < ymin) ymin = y; if (y > ymax) ymax = y
    if (z < zmin) zmin = z; if (z > zmax) zmax = z
  }
  return Number.isFinite(xmin) ? [(xmin + xmax) / 2, (ymin + ymax) / 2, (zmin + zmax) / 2] : [0, 0, 0]
}

export default function MoveBodyGizmo() {
  const featDlg = useApp((s) => s.featDlg)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const deltaW = useRef(new Matrix4())
  const visible = !!featDlg && featDlg.kind === 'move' && String(featDlg.params.objectType ?? 'bodies') === 'bodies' && !!bodyMesh?.vertices?.length
  const moveType = String(featDlg?.params.moveType ?? 'free')
  const raxis = String(featDlg?.params.raxis ?? 'Z').toUpperCase()

  // CAD(x,y,z) is rendered under rotationX(-90deg), therefore its THREE anchor is (x,z,-y).
  // The seed is independent of dialog values so live field updates never reset a running drag.
  const seed = useMemo(() => {
    const [x, y, z] = bodyMesh?.vertices?.length ? meshCentre(bodyMesh.vertices) : [0, 0, 0]
    return new Matrix4().makeTranslation(x, z, -y)
  }, [bodyMesh])

  if (!visible || !featDlg || moveType === 'ptp' || moveType === 'ptpos') return null
  const rotateOnly = moveType === 'rotate'
  // A PivotControls rotation ring is defined by its plane's two axes.  Keep only the pair needed for
  // the requested CAD axis, and hide translation arrows in rotate-only mode.
  const activeAxes: [boolean, boolean, boolean] = rotateOnly
    ? (raxis === 'X' ? [false, true, true] : raxis === 'Y' ? [true, false, true] : [true, true, false])
    : [true, true, true]

  const writeDelta = (worldDelta: Matrix4) => {
    // Conjugate the THREE world delta back through the CAD-to-THREE display rotation.
    const cadToThree = new Matrix4().makeRotationX(-Math.PI / 2)
    const cadDelta = cadToThree.clone().invert().multiply(worldDelta).multiply(cadToThree)
    const pos = new Vector3(), quat = new Quaternion(), scale = new Vector3()
    cadDelta.decompose(pos, quat, scale)
    const e = new Euler().setFromQuaternion(quat, 'XYZ')
    const st = useApp.getState()
    if (moveType === 'rotate') {
      st.setFeatParam('angle', round3((raxis === 'X' ? e.x : raxis === 'Y' ? e.y : e.z) * 180 / Math.PI))
      return
    }
    st.setFeatParam('dx', round3(pos.x)); st.setFeatParam('dy', round3(pos.y)); st.setFeatParam('dz', round3(pos.z))
    if (moveType === 'free') {
      st.setFeatParam('rx', round3(e.x * 180 / Math.PI)); st.setFeatParam('ry', round3(e.y * 180 / Math.PI)); st.setFeatParam('rz', round3(e.z * 180 / Math.PI))
    }
  }

  return <PivotControls matrix={seed} autoTransform disableScaling disableAxes={rotateOnly} disableSliders={rotateOnly} disableRotations={moveType === 'translate'} activeAxes={activeAxes} depthTest={false} lineWidth={3} scale={90} fixed={false} onDragStart={() => { deltaW.current.identity() }} onDrag={(_local, _localDelta, _world, worldDelta) => { deltaW.current.copy(worldDelta); writeDelta(worldDelta) }} onDragEnd={() => { writeDelta(deltaW.current); deltaW.current.identity() }} />
}
