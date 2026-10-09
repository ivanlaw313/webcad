// RETEST18 #1：真滑鼠拖關節子件嘅旋轉環 / 滑動箭頭要驅動關節值，唔可以轉鏡頭；簡單 2 件滑動/旋轉唔可以行閉環求解器。
// 無瀏覽器：① 純函數（把手命中排序 / 撳中把手先停 Orbit）② three 真 raycast ③ 照抄 drei 10.7.9 AxisRotator /
// AxisArrow 嘅 pointer→delta 數學，經 PivotControls onDrag(mdW) → Viewport jointDrag 同款 jointDragLiveValue → store.setJointValue。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Matrix4, Vector3, Vector2, Mesh, BoxGeometry, CylinderGeometry, Group, PerspectiveCamera, Raycaster, Plane, Ray } from 'three'
import { gumballFirst, isGumballObject, claimGumballPointer, registerGumballHitTester, gumballHitAt, GUMBALL_USERDATA } from '../src/assembly/gumballPick.ts'
import { jointDragFrame, jointDragLiveValue, computeFK, drivingJointOf, cadAxisToWorld } from '../src/assembly/kinematics.ts'
import { findLoops, isMechanismLoop } from '../src/assembly/linkage.ts'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()
const near = (a, b, e = 1e-3) => Math.abs(a - b) < e

test('handle hits are ordered before the part in front of them (R3F filter)', () => {
  const cam = new PerspectiveCamera(30, 1, 0.5, 5000); cam.position.set(0, 0, 400); cam.lookAt(0, 0, 0); cam.updateMatrixWorld()
  const part = new Mesh(new BoxGeometry(200, 200, 200)); part.updateMatrixWorld()          // big part in front
  const gizmo = new Group(); const hit = new Mesh(new CylinderGeometry(3, 3, 60)); hit.userData = { ...GUMBALL_USERDATA }; hit.visible = false
  gizmo.add(hit); gizmo.position.set(0, 0, -50); gizmo.updateMatrixWorld(true)                // handle is INSIDE / behind the part surface
  const rc = new Raycaster(); rc.setFromCamera(new Vector2(0, 0), cam)
  const hits = rc.intersectObjects([part, gizmo], true)
  assert.ok(hits.length >= 2 && hits[0].object === part, 'raw R3F order: part first (closer)')
  const f = gumballFirst(hits)
  assert.equal(f[0].object, hit, 'filter puts the invisible handle hit first → drei AxisArrow/AxisRotator get pointerdown')
  assert.ok(isGumballObject(hit) && !isGumballObject(part))
  assert.equal(gumballFirst([{ object: part }]).length, 1)
})

test('pointerdown on a handle disables OrbitControls before Orbit sees it, restores on pointerup; elsewhere untouched', () => {
  const controls = { enabled: true }
  const ls = new Map()
  const win = { addEventListener: (n, f) => ls.set(n, f), removeEventListener: (n) => ls.delete(n) }
  registerGumballHitTester((x, y) => Math.hypot(x - 100, y - 100) < 8, () => controls)
  assert.equal(claimGumballPointer(300, 300, win), false)
  assert.equal(controls.enabled, true, 'miss → orbit/marquee as usual')
  assert.equal(claimGumballPointer(102, 99, win), true)
  assert.equal(controls.enabled, false, 'hit → orbit disabled for the whole drag')
  ls.get('pointerup')()
  assert.equal(controls.enabled, true, 'released → orbit back')
  registerGumballHitTester(null)
  assert.equal(gumballHitAt(100, 100), false, 'unmounted gumball never claims')
})

// ── drei 10.7.9 AxisRotator：click point → intersection on the ring plane → deltaAngle → rotMatrix about origin ──
function axisRotatorDelta(origin, e1, e2, normal, clickPoint, intersection) {
  const ang = (p) => { const d = p.clone().sub(origin); return Math.atan2(d.dot(e2), d.dot(e1)) }
  const delta = ang(intersection) - ang(clickPoint)
  const rot = new Matrix4().makeRotationAxis(normal, delta)
  const posNew = origin.clone().applyMatrix4(rot).sub(origin).negate()
  return rot.setPosition(posNew)
}
// ── drei AxisArrow：沿方向投影嘅位移 → makeTranslation ──
const axisArrowDelta = (dir, mm) => new Matrix4().makeTranslation(dir.x * mm, dir.y * mm, dir.z * mm)

const mesh = () => ({ vertices: new Float32Array([-5, -5, 0, 5, -5, 0, 0, 5, 20]), triangles: [0, 1, 2], normals: new Float32Array(9) })
const comp = (id) => ({ id, name: id, mesh: mesh(), pos: [0, 0, 0], rot: [0, 0, 0], color: '#888' })
// Viewport ComponentGizmo.jointDrag 同款：start 快照 j0/parentM，之後每幀 jointDragLiveValue → setJointValue
function dragGesture(childId, deltas) {
  const st = g()
  const j = drivingJointOf(childId, st.joints)
  const fk = computeFK(st.components.map((c) => c.id), st.joints)
  const parentM = fk.get(j.parent) ?? new Matrix4()
  const frame = jointDragFrame(j, parentM, [0, 0, 0])
  const j0 = { ...j }; let last = { angle: j.angle, slide: j.slide }
  st.beginJointDrive()
  for (const mk of deltas) {
    const v = jointDragLiveValue(j0, parentM, mk(frame), frame.origin, last)
    g().setJointValue(j.id, v); last = v
  }
  g().endJointDrive()
  return { j: g().joints.find((x) => x.id === j.id), frame }
}

test('ring drag (pointer math) drives a plain 2-part revolute — angle follows the mouse, not 0°', () => {
  const rev = { id: 'J1', name: '關節1', type: 'revolute', parent: 'P', child: 'S', anchor: [0, 0, 0], axis: cadAxisToWorld('Z'), angle: 0, slide: 0 }
  useApp.setState({ components: [comp('P'), comp('S')], joints: [rev], undoStack: [], redoStack: [], contactSets: false, contactPairs: [], grounded: null, status: '' })
  const ring = (deg) => (f) => {
    const o = new Vector3(...f.origin), m = f.matrix
    const e1 = new Vector3().setFromMatrixColumn(m, 0).normalize(), e2 = new Vector3().setFromMatrixColumn(m, 1).normalize(), n = new Vector3().setFromMatrixColumn(m, 2).normalize()
    const r = 58.5   // 0.65 × scale 90
    const click = o.clone().add(e1.clone().multiplyScalar(r * Math.cos(0.3))).add(e2.clone().multiplyScalar(r * Math.sin(0.3)))
    // mouse ray hits the ring plane at the click rotated by `deg` (as the drei Ray.intersectPlane does)
    const a = 0.3 + deg * Math.PI / 180
    const tgt = o.clone().add(e1.clone().multiplyScalar(r * Math.cos(a))).add(e2.clone().multiplyScalar(r * Math.sin(a)))
    const ray = new Ray(tgt.clone().add(n.clone().multiplyScalar(300)), n.clone().negate()), hitP = new Vector3()
    ray.intersectPlane(new Plane().setFromNormalAndCoplanarPoint(n, o), hitP)
    return axisRotatorDelta(o, e1, e2, n, click, hitP)
  }
  const { j } = dragGesture('S', [ring(5), ring(15), ring(30), ring(42)])
  assert.ok(near(j.angle, 42), `angle ${j.angle}`)
  assert.equal(g().undoStack.length, 1, 'one undo step for the gesture')
})

test('slider arrow drag on a 2-part assembly with a redundant revolute does NOT hit the closed-loop solver', () => {
  const rev = { id: 'J1', name: '關節1', type: 'revolute', parent: 'P', child: 'S', anchor: [0, 0, 0], axis: cadAxisToWorld('Z'), angle: 0, slide: 0 }
  const sld = { id: 'J2', name: '關節2', type: 'slider', parent: 'P', child: 'S', anchor: [0, 0, 0], axis: cadAxisToWorld('Z'), angle: 0, slide: 0 }
  useApp.setState({ components: [comp('P'), comp('S')], joints: [rev, sld], undoStack: [], redoStack: [], contactSets: false, contactPairs: [], grounded: null, status: '' })
  const loops = findLoops(['P', 'S'], [rev, sld])
  assert.equal(loops.length, 1, 'graph-wise the parallel pair is a cycle…')
  assert.equal(isMechanismLoop(loops[0]), false, '…but not a mechanism loop (only 2 bodies)')
  assert.equal(drivingJointOf('S', g().joints).id, 'J2', 'gumball drives the joint FK actually uses (last edge)')
  const arrow = (mm) => (f) => axisArrowDelta(new Vector3(...f.axisW), mm)
  const { j } = dragGesture('S', [arrow(2), arrow(6), arrow(12.5)])
  assert.ok(near(j.slide, 12.5), `slide ${j.slide}`)
  assert.doesNotMatch(g().status, /閉環|回路|平面/, g().status)
  // the part really moves along the axis (FK uses J2)
  const p = new Vector3().setFromMatrixPosition(computeFK(['P', 'S'], g().joints).get('S'))
  assert.ok(near(p.y, 12.5), `child moved ${p.toArray()}`)
  // driving the shadowed joint is honest about it
  g().setJointValue('J1', { angle: 10 })
  assert.match(g().status, /冗餘關節/)
})

test('a real ≥3-body loop still goes through the loop solver', () => {
  const mk = (id, p, c, x) => ({ id, name: id, type: 'revolute', parent: p, child: c, anchor: [x, 0, 0], axis: [0, 1, 0], angle: 0, slide: 0 })
  const loops = findLoops(['G', 'A', 'B'], [mk('a', 'G', 'A', 0), mk('b', 'A', 'B', 10), mk('c', 'B', 'G', 20)])
  assert.equal(loops.length, 1); assert.equal(isMechanismLoop(loops[0]), true)
})

test('wiring: viewport capture lets handle presses through + disables orbit; gumball tags handles + registers tester + filter', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  const cap = vp.slice(vp.indexOf('onPointerDownCapture={(e) => {'), vp.indexOf('e.stopPropagation()', vp.indexOf('onPointerDownCapture={(e) => {')))
  assert.match(cap, /claimGumballPointer\(e\.clientX, e\.clientY\)\) return/, 'gumball check runs before the select-tool marquee stopPropagation')
  assert.ok(cap.indexOf('claimGumballPointer') < cap.indexOf("navTool !== 'select'"))
  assert.match(vp, /const childJoint = c \? drivingJointOf\(c\.id, joints\) : undefined/)
  const gb = readFileSync(new URL('../src/components/ComponentGumball.tsx', import.meta.url), 'utf8')
  assert.equal((gb.match(/userData=\{GUMBALL_USERDATA\}/g) ?? []).length, 2, 'joint handles and the plain move gumball are both tagged')
  assert.match(gb, /registerGumballHitTester\(\(x, y\) =>/)
  assert.match(gb, /setEvents\(\{ filter: \(hits: Intersection\[\], st\) => gumballFirst\(/)
  assert.match(gb, /return \(\) => \{ registerGumballHitTester\(null\); setEvents\(\{ filter: prevFilter \}\) \}/)
})
