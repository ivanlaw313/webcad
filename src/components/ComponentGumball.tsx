// ComponentGumball — Fusion-style move+rotate gumball for the selected assembly component.
//
// Upgrade over <ComponentGizmo/> (Viewport.tsx ~line 1315), which uses drei <TransformControls mode="translate">
// and only supports translation. This uses drei <PivotControls> (matrix mode) to give BOTH translation arrows
// AND rotation rings in one gizmo, anchored at the component's world centre.
//
// Math (verified against drei PivotControls/index.js):
//   PivotControls calls onDrag(mL, mdL, mW, mdW). The 4th arg `mdW` is the WORLD-space delta transform
//   accumulated since drag start (mW = mdW · mW0, where mW0 is the gizmo's world matrix at drag start).
//   We capture `mdW` on every onDrag, and on onDragEnd compute the component's new world matrix as
//       Mnew = mdW · compWorldMatrix(c, fk)
//   then decode it back to the stored {pos, rot°} via worldToPose() (the exact inverse of compWorldMatrix).
//   This is anchor-independent: where we visually place the gizmo never enters the committed transform, so
//   the geometric anchor below is purely cosmetic and any small inaccuracy in it is harmless.
//
// On commit we setComponentPos + setComponentRot (one undo entry each — see wiring notes) and then
// resolveMates() so any follower parts re-snap. Grounded part shows NO gumball (it is the fixed datum).
//
// Pure presentation: all state comes via props from the Viewport (see WIRING block at the bottom of this file).
// This component renders inside the R3F <Canvas> tree (same place <ComponentGizmo/> is mounted today).

import { useRef, useState, useMemo, useEffect } from 'react'
import { PivotControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Matrix4, Vector2, Vector3, Raycaster, type Group, type Intersection } from 'three'
import { GUMBALL_USERDATA, gumballFirst, isGumballObject, registerGumballHitTester } from '../assembly/gumballPick'
import { compWorldMatrix, meshCenter3 } from '../store'
import { worldToPose } from '../assembly/faceMate'
import type { MeshData } from '../worker/cad.worker'

// Minimal shape of an assembly component we depend on (subset of the store's component type).
export type GumballComponent = {
  id: string
  mesh: MeshData
  pos: [number, number, number]
  rot?: [number, number, number]
}

export type ComponentGumballProps = {
  /** The currently-selected component, or null/undefined when nothing is selected. */
  component: GumballComponent | null | undefined
  /** Forward-kinematics world matrix for this component (computeFK(...).get(component.id)). Optional. */
  fkMat?: Matrix4
  /** Grounded component id — when it equals component.id the gumball is hidden (fixed datum). */
  grounded?: string | null
  /** Write the decoded translation to the store (store.setComponentPos). */
  setComponentPos: (id: string, pos: [number, number, number]) => void
  /** Write the decoded rotation° to the store (store.setComponentRot). */
  setComponentRot: (id: string, rot: [number, number, number]) => void
  /** Re-snap follower parts after the move (store.resolveMates). */
  resolveMates: () => void
  /** Hide the gumball outside model mode (pass `mode === 'model'`). Defaults to true. */
  enabled?: boolean
  /** BUG(D)：關節子件 — 拖動改由關節自由度承接（delta=世界增量，pivot=gizmo 世界支點），唔再寫 pos/rot。
   *  RETEST17 #2：phase='start'|'move'|'end' — 拖動中逐幀即時驅動關節值（唔係放手先算）。 */
  jointDrag?: (delta: Matrix4, pivot: [number, number, number], phase: 'start' | 'move' | 'end') => void
  /** RETEST17 #2：關節自由度 frame（局部 Z = 關節軸）+ 要顯示嘅把手；有就只顯示旋轉環 / 軸向箭頭（Fusion 式受約束拖動）。 */
  jointFrame?: { matrix: Matrix4; handles: ('rotate' | 'translate')[] } | null
}

// World-space AABB centre of the part (strided over vertices for perf) — used only as the gizmo anchor.
function worldCentre(c: GumballComponent, M: Matrix4): [number, number, number] {
  const v = c.mesh.vertices
  if (!v.length) return new Vector3().setFromMatrixPosition(M).toArray() as [number, number, number]
  const nv = v.length / 3
  const stride = Math.max(1, Math.ceil(nv / 600)) * 3
  const p = new Vector3()
  const mn = [Infinity, Infinity, Infinity]
  const mx = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < v.length; i += stride) {
    p.set(v[i], v[i + 1], v[i + 2]).applyMatrix4(M)
    if (p.x < mn[0]) mn[0] = p.x; if (p.x > mx[0]) mx[0] = p.x
    if (p.y < mn[1]) mn[1] = p.y; if (p.y > mx[1]) mx[1] = p.y
    if (p.z < mn[2]) mn[2] = p.z; if (p.z > mx[2]) mx[2] = p.z
  }
  return [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2]
}

export default function ComponentGumball({
  component,
  fkMat,
  grounded,
  setComponentPos,
  setComponentRot,
  resolveMates,
  enabled = true,
  jointDrag,
  jointFrame,
}: ComponentGumballProps) {
  // Latest WORLD-space delta transform captured during the drag (drei onDrag 4th arg). Ref so we read the
  // freshest value in onDragEnd without re-rendering on every drag frame.
  const deltaW = useRef(new Matrix4())
  // Remount key — bump after each committed drag so PivotControls re-seeds at the part's NEW centre with a
  // fresh identity matrix (otherwise the gizmo keeps its accumulated transform and drifts on the next drag).
  const [gen, setGen] = useState(0)

  const isGrounded = !!component && grounded === component.id
  const show = enabled && !!component && !isGrounded

  // Seed matrix: pure translation to the part's world centre (no rotation → clean world-axis-aligned gumball).
  // Recomputed whenever the part / its transform / fk changes, so the gizmo tracks the part between drags.
  const seed = useMemo(() => {
    if (!component) return new Matrix4()
    const M = compWorldMatrix(component, fkMat)
    const ctr = worldCentre(component, M)
    return new Matrix4().makeTranslation(ctr[0], ctr[1], ctr[2])
    // gen forces a fresh Matrix4 instance after each commit so PivotControls' matrix prop identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [component, component?.id, component?.pos, component?.rot, fkMat, gen])

  // RETEST17 #2：拖動期間凍結 seed（drei 會就地改寫 matrix 物件；即時驅動關節會令 component/fk 每幀變 → 唔可以換新 seed）。
  const dragSeed = useRef<Matrix4 | null>(null)
  const jointSeed = useMemo(() => (jointFrame ? jointFrame.matrix.clone() : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jointFrame, gen])

  // RETEST18 #1：把手指標路徑 — 註冊 hit tester（Viewport 外層 capture 先問：撳中把手 → 唔開框選 + 即刻停 Orbit），
  // 同埋 R3F filter 將把手命中排最前（零件喺把手前面都拎得到）。卸載時還原。
  const grp = useRef<Group>(null)
  const getR3F = useThree((st) => st.get)
  const setEvents = useThree((st) => st.setEvents)
  useEffect(() => {
    if (!show) return
    const rc = new Raycaster()
    const ndc = new Vector2()
    registerGumballHitTester((x, y) => {
      const g = grp.current
      const st = getR3F()
      if (!g) return false
      const r = st.gl.domElement.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0 || x < r.left || x > r.right || y < r.top || y > r.bottom) return false
      ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
      rc.setFromCamera(ndc, st.camera)
      g.updateWorldMatrix(true, true)
      return rc.intersectObject(g, true).some((h) => isGumballObject(h.object))
    }, () => getR3F().controls as unknown as { enabled: boolean } | null)
    const prevFilter = getR3F().events.filter
    setEvents({ filter: (hits: Intersection[], st) => gumballFirst(prevFilter ? prevFilter(hits, st) : hits) })
    return () => { registerGumballHitTester(null); setEvents({ filter: prevFilter }) }
  }, [show, getR3F, setEvents])

  if (!show || !component) return null
  const c = component

  if (jointDrag && jointFrame && jointSeed) {
    // 受約束拖動：每種把手一個 PivotControls（同一 frame）— rotate = 只有繞局部 Z 嘅旋轉環；translate = 只有局部 Z 箭頭。
    const pv = new Vector3().setFromMatrixPosition(jointSeed)
    const pivot: [number, number, number] = [pv.x, pv.y, pv.z]
    return (
      <group ref={grp}>
        {jointFrame.handles.map((h) => (
          <PivotControls
            userData={GUMBALL_USERDATA}
            key={c.id + ':' + h + ':' + gen}
            matrix={dragSeed.current ?? jointSeed}
            autoTransform
            disableScaling
            disableSliders
            disableAxes={h === 'rotate'}
            disableRotations={h === 'translate'}
            activeAxes={h === 'rotate' ? [true, true, false] : [false, false, true]}
            depthTest={false}
            lineWidth={3}
            scale={90}
            fixed={false}
            onDragStart={() => { deltaW.current.identity(); dragSeed.current = jointSeed; jointDrag(new Matrix4(), pivot, 'start') }}
            onDrag={(_mL, _mdL, _mW, mdW) => { deltaW.current.copy(mdW); jointDrag(deltaW.current.clone(), pivot, 'move') }}
            onDragEnd={() => {
              jointDrag(deltaW.current.clone(), pivot, 'end')
              deltaW.current.identity()
              dragSeed.current = null
              setGen((g) => g + 1)
            }}
          />
        ))}
      </group>
    )
  }

  return (
    <group ref={grp}>
    <PivotControls
      // key change on commit fully remounts → re-seed at new centre, delta back to identity.
      key={c.id + ':' + gen}
      userData={GUMBALL_USERDATA}
      matrix={seed}
      // autoTransform lets the gizmo visually follow the drag; we still commit via the captured world delta.
      autoTransform
      disableScaling
      depthTest={false}
      lineWidth={3}
      scale={90}
      fixed={false}
      onDragStart={() => { deltaW.current.identity() }}
      onDrag={(_mL, _mdL, _mW, mdW) => { deltaW.current.copy(mdW) }}
      onDragEnd={() => {
        if (jointDrag) {
          // BUG(D)：關節子件唔可以自由移動（會離開關節軸）→ 交俾關節投影（旋轉角／滑動量）。
          const pv = new Vector3().setFromMatrixPosition(seed)
          jointDrag(deltaW.current.clone(), [pv.x, pv.y, pv.z], 'end')
          deltaW.current.identity()
          setGen((g) => g + 1)
          return
        }
        // Apply the captured world delta to the part's ORIGINAL world matrix, then decode to {pos, rot°}.
        const Mnew = deltaW.current.clone().multiply(compWorldMatrix(c, fkMat))
        const pose = worldToPose(Mnew, meshCenter3(c.mesh))
        const rPos: [number, number, number] = [
          Math.round(pose.pos[0] * 1000) / 1000,
          Math.round(pose.pos[1] * 1000) / 1000,
          Math.round(pose.pos[2] * 1000) / 1000,
        ]
        const rRot: [number, number, number] = [
          Math.round(pose.rot[0] * 1000) / 1000,
          Math.round(pose.rot[1] * 1000) / 1000,
          Math.round(pose.rot[2] * 1000) / 1000,
        ]
        setComponentPos(c.id, rPos)
        setComponentRot(c.id, rRot)
        resolveMates()
        deltaW.current.identity()
        setGen((g) => g + 1)
      }}
    />
    </group>
  )
}
