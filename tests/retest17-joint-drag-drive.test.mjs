// RETEST17 #2：拖動關節子件要真係驅動關節值（旋轉角 / 滑動偏移），唔再報「轉到 0.0°」但角度唔郁。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Matrix4, Vector3 } from 'three'
import { jointDragFrame, jointDragLiveValue, jointDragStatus, computeFK, cadAxisToWorld } from '../src/assembly/kinematics.ts'

const near = (a, b, e = 1e-6) => Math.abs(a - b) < e
const I = new Matrix4()
// 輪轂套喺軸上：子件中心正正喺關節軸上（舊 gumball 平移拖動掃角 = 0 → 「轉到 0.0°」嘅根因）
const rev = { id: 'J1', name: '關節1', type: 'revolute', parent: 'P', child: 'S', anchor: [0, 0, 0], axis: cadAxisToWorld('Z'), angle: 0, slide: 0 }

test('frame: local Z = joint world axis, origin on the axis (child centre projected), DOF handles', () => {
  const f = jointDragFrame(rev, I, [0, 25, 0])
  const z = new Vector3().setFromMatrixColumn(f.matrix, 2)
  assert.ok(near(z.x, rev.axis[0]) && near(z.y, rev.axis[1]) && near(z.z, rev.axis[2]))
  assert.deepEqual(f.handles, ['rotate'])
  const off = jointDragFrame(rev, I, [30, 12, -4])
  assert.ok(near(off.origin[0], 0) && near(off.origin[1], 12) && near(off.origin[2], 0), 'origin = projection onto the axis line')
  assert.deepEqual(jointDragFrame({ ...rev, type: 'slider' }, I, [3, 4, 5]).handles, ['translate'])
  assert.deepEqual(jointDragFrame({ ...rev, type: 'slider' }, I, [3, 4, 5]).origin, [3, 4, 5])
  assert.deepEqual(jointDragFrame({ ...rev, type: 'cylindrical' }, I, [0, 0, 0]).handles, ['rotate', 'translate'])
  assert.equal(jointDragFrame({ ...rev, type: 'ball' }, I, [0, 0, 0]), null)
  // parent tipped → frame follows parent FK
  const pr = new Matrix4().makeRotationZ(Math.PI / 2)
  const zt = new Vector3().setFromMatrixColumn(jointDragFrame(rev, pr, [0, 0, 0]).matrix, 2)
  assert.ok(near(zt.x, -1) && near(zt.y, 0), 'axis +Y rotated 90° about Z → −X')
})

test('ring drag about the frame axis drives the revolute angle (on-axis child, not 0°)', () => {
  const f = jointDragFrame(rev, I, [0, 25, 0])
  const axisW = new Vector3(...f.axisW)
  // drei AxisRotator delta: rotation about the ring normal through the gizmo origin
  const rotAbout = (deg) => { const o = new Vector3(...f.origin); return new Matrix4().makeTranslation(o.x, o.y, o.z).multiply(new Matrix4().makeRotationAxis(axisW, deg * Math.PI / 180)).multiply(new Matrix4().makeTranslation(-o.x, -o.y, -o.z)) }
  const v = jointDragLiveValue(rev, I, rotAbout(35), f.origin, { angle: 0 })
  assert.ok(near(v.angle, 35), `angle ${v.angle}`)
  assert.equal(v.slide, undefined)
  // the FK pose actually turns: a point 20 mm off-axis sweeps 35°
  const fk = computeFK(['P', 'S'], [{ ...rev, angle: v.angle }]).get('S')
  const p = new Vector3(20, 0, 0).applyMatrix4(fk)
  assert.ok(near(Math.atan2(-p.z, p.x) * 180 / Math.PI, 35, 1e-4))
})

test('live drag unwraps across ±180° relative to the previous frame and honours limits', () => {
  const f = jointDragFrame(rev, I, [0, 0, 0])
  const axisW = new Vector3(...f.axisW)
  const R = (deg) => new Matrix4().makeRotationAxis(axisW, deg * Math.PI / 180)
  const j0 = { ...rev, angle: 170 }
  // cumulative drag of +30° from 170 → 200 (raw twist wraps to −150 → 20°; unwrap near prev 190 → 200)
  assert.ok(near(jointDragLiveValue(j0, I, R(30), f.origin, { angle: 190 }).angle, 200))
  const lim = { ...rev, angle: 0, aMin: -45, aMax: 45 }
  assert.equal(jointDragLiveValue(lim, I, R(80), f.origin, { angle: 40 }).angle, 45)
  assert.equal(jointDragLiveValue(lim, I, R(-80), f.origin, { angle: -40 }).angle, -45)
})

test('slider arrow drag drives the offset along the axis; cylindrical gets both; status reports written values', () => {
  const sl = { ...rev, type: 'slider', slide: 2, sMin: -10, sMax: 10 }
  const f = jointDragFrame(sl, I, [0, 0, 0])
  const a = new Vector3(...f.axisW)
  assert.ok(near(jointDragLiveValue(sl, I, new Matrix4().makeTranslation(a.x * 5, a.y * 5, a.z * 5), f.origin).slide, 7))
  assert.equal(jointDragLiveValue(sl, I, new Matrix4().makeTranslation(a.x * 50, a.y * 50, a.z * 50), f.origin).slide, 10, 'clamped to sMax')
  const cyl = jointDragLiveValue({ ...rev, type: 'cylindrical' }, I, new Matrix4().makeTranslation(a.x * 3, a.y * 3, a.z * 3), f.origin, { angle: 0, slide: 0 })
  assert.ok(near(cyl.slide, 3) && near(cyl.angle, 0))
  assert.equal(jointDragStatus('關節1', 35, undefined, true), '已沿關節「關節1」驅動：角度 35.0°（受關節約束）')
  assert.equal(jointDragStatus('關節2', undefined, 7, false), '拖動中 · 沿關節「關節2」驅動：偏移 7.00 mm（受關節約束）')
})

test('gumball wiring: DOF-only handles, live per-frame drive, frozen seed during drag', () => {
  const gb = readFileSync(new URL('../src/components/ComponentGumball.tsx', import.meta.url), 'utf8')
  assert.match(gb, /disableAxes=\{h === 'rotate'\}/)
  assert.match(gb, /disableRotations=\{h === 'translate'\}/)
  assert.match(gb, /activeAxes=\{h === 'rotate' \? \[true, true, false\] : \[false, false, true\]\}/)
  assert.match(gb, /onDrag=\{\(_mL, _mdL, _mW, mdW\) => \{ deltaW\.current\.copy\(mdW\); jointDrag\(deltaW\.current\.clone\(\), pivot, 'move'\) \}\}/)
  assert.match(gb, /matrix=\{dragSeed\.current \?\? jointSeed\}/)
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /jointDragFrame\(childJoint, fk\.get\(childJoint\.parent\)/)
  assert.match(vp, /jointDragLiveValue\(d\.j0, d\.parentM, delta, pivot, d\.last\)/)
  assert.match(vp, /st\.setJointValue\(childJoint\.id, v\)/)
  assert.match(vp, /jointFrame=\{jointFrame\}/)
  assert.doesNotMatch(vp, /（拖動受關節約束）/)
})
