// BUG(D)：拖動關節子件 → 投影到關節自由度；BUG(B)：顯式固定（Ground）組件。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Matrix4, Vector3 } from 'three'
import { jointDragToValue, computeFK, cadAxisToWorld } from '../src/assembly/kinematics.ts'

const rev = { id: 'J1', name: 'j', type: 'revolute', parent: 'P', child: 'S', anchor: [0, 0, 0], axis: cadAxisToWorld('Z'), angle: 10, slide: 0 }
const I = new Matrix4()
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e

test('revolute: rotation drag keeps only the twist about the joint axis', () => {
  // world delta = 30° about joint axis (three Y) combined with a tilt about X — tilt must be dropped
  const d = new Matrix4().makeRotationAxis(new Vector3(0, 1, 0), Math.PI / 6)
  assert.ok(near(jointDragToValue(rev, I, d, [20, 0, 0]).angle, 40))
  const tilt = new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), 0.4)
  assert.ok(near(jointDragToValue(rev, I, tilt, [20, 0, 0]).angle, 10), 'pure off-axis tilt → no angle change')
  const v = jointDragToValue(rev, I, d, [20, 0, 0])
  assert.equal(v.slide, undefined, 'revolute never translates')
})

test('revolute: translate-arrow drag sweeps the pivot around the axis', () => {
  // pivot at (20,0,0) dragged to (0,0,-20) → +90° about +Y
  const d = new Matrix4().makeTranslation(-20, 0, -20)
  assert.ok(near(jointDragToValue(rev, I, d, [20, 0, 0]).angle, 100))
})

test('resulting pose keeps the child on the joint axis (height preserved)', () => {
  const d = new Matrix4().makeTranslation(-20, 0, -20)
  const v = jointDragToValue(rev, I, d, [20, 0, 0])
  const fk = computeFK(['P', 'S'], [{ ...rev, angle: v.angle }]).get('S')
  const top = new Vector3(5, 40, 5).applyMatrix4(fk)
  assert.ok(near(top.y, 40), 'height unchanged under revolute drag')
})

test('slider/cylindrical take the axial component; parent FK axis respected; rigid refused', () => {
  const sl = { ...rev, type: 'slider', slide: 0 }
  assert.ok(near(jointDragToValue(sl, I, new Matrix4().makeTranslation(3, 7, 4), [0, 0, 0]).slide, 7))
  const parentRot = new Matrix4().makeRotationZ(Math.PI / 2)   // parent tipped: joint axis now along -X
  assert.ok(near(jointDragToValue(sl, parentRot, new Matrix4().makeTranslation(-5, 0, 0), [0, 0, 0]).slide, 5))
  const cyl = jointDragToValue({ ...rev, type: 'cylindrical' }, I, new Matrix4().makeTranslation(0, 2, 0), [0, 0, 0])
  assert.ok(near(cyl.slide, 2) && near(cyl.angle, 10))
  assert.equal(jointDragToValue({ ...rev, type: 'rigid' }, I, new Matrix4(), [0, 0, 0]), null)
})

test('gumball routes jointed-child drags through jointDragToValue (no free pos write)', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /jointDragLiveValue\(d\.j0/)   // RETEST17 #2：即時驅動（jointDragLiveValue 內部用 jointDragToValue）
  assert.match(vp, /st\.setJointValue\(childJoint\.id, v\)/)
  const gb = readFileSync(new URL('../src/components/ComponentGumball.tsx', import.meta.url), 'utf8')
  assert.match(gb, /if \(jointDrag\) \{[\s\S]*?return\s*\n\s*\}/)
})

test('ground: component flag, guards, tree badge, ribbon entry', () => {
  const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(st, /grounded\?: boolean/)
  assert.match(st, /toggleComponentGround: \(id\) => set\(/)
  assert.match(st, /setComponentPos: \(id, pos\) => \{ if \(isCompGrounded\(get\(\), id\)\)/)
  assert.match(st, /setComponentRot: \(id, rot\) => \{ if \(isCompGrounded\(get\(\), id\)\)/)
  assert.match(st, /addJoint: \(j\) => set\(\(s\) => \{\n\s*if \(isCompGrounded\(s, j\.child\)\)/)
  assert.match(st, /case 'groundcomp':/)
  assert.match(st, /\.\.\.s\.components\.filter\(\(c\) => c\.grounded\)/, 'mate solver treats grounded parts as fixed')
  const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  assert.match(tree, /\(已固定\)/)
  assert.match(tree, /toggleComponentGround\(c\.id\)/)
  const rb = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
  assert.match(rb, /id: 'groundcomp', label: '固定組件'/)
})
