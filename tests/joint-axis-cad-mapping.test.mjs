// BUG(D-axis)：JOINTS 面板「Z 軸」= CAD Z（向上）。旋轉 Z 90° 直立軸保持直立；滑動 Z 50 向上 +Z。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Matrix4, Vector3 } from 'three'
import { computeFK, cadAxisToWorld, jointTypeMenu, ALL_JOINT_TYPES, JOINT_LABEL_TC } from '../src/assembly/kinematics.ts'

// upright shaft in CAD coords (Z-up): 10×10×40
const shaft = []
for (const x of [-5, 5]) for (const y of [-5, 5]) for (const z of [0, 40]) shaft.push([x, y, z])
const toThree = new Matrix4().makeRotationX(-Math.PI / 2)   // same as compWorldMatrix tail
const toCad = new Matrix4().makeRotationX(Math.PI / 2)
function cadBox(fkM) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]
  for (const p of shaft) {
    const v = new Vector3(...p).applyMatrix4(toThree).applyMatrix4(fkM).applyMatrix4(toCad)
    const a = v.toArray(); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], a[k]); mx[k] = Math.max(mx[k], a[k]) }
  }
  return { mn, mx }
}
const anchor = new Vector3(0, 0, 20).applyMatrix4(toThree).toArray()
const J = (type, extra) => ({ id: 'J1', name: 'j', type, parent: 'P', child: 'S', anchor, axis: cadAxisToWorld('Z'), angle: 0, slide: 0, ...extra })

test('cadAxisToWorld maps CAD axes into three world (Y-up)', () => {
  assert.deepEqual(cadAxisToWorld('Z'), [0, 1, 0])
  assert.deepEqual(cadAxisToWorld('X'), [1, 0, 0])
  assert.deepEqual(cadAxisToWorld('Y'), [0, 0, -1])
})

test('revolute about Z: 90° and 180° keep the shaft upright (height stays 40)', () => {
  for (const angle of [0, 90, 180]) {
    const b = cadBox(computeFK(['P', 'S'], [J('revolute', { angle })]).get('S'))
    assert.ok(Math.abs(b.mx[2] - b.mn[2] - 40) < 1e-9, `height @${angle}°`)
    assert.ok(Math.abs(b.mn[2]) < 1e-9, `base stays on z=0 @${angle}°`)
  }
})

test('slider along Z by 50 moves the shaft straight up +Z', () => {
  const b = cadBox(computeFK(['P', 'S'], [J('slider', { slide: 50 })]).get('S'))
  assert.ok(Math.abs(b.mn[2] - 50) < 1e-9 && Math.abs(b.mx[2] - 90) < 1e-9)
  assert.ok(Math.abs(b.mn[0] + 5) < 1e-9 && Math.abs(b.mn[1] + 5) < 1e-9, 'no horizontal drift')
})

test('JointsPanel uses CAD axis mapping; joint-pick popup lists all 8 types in Traditional', () => {
  const jp = readFileSync(new URL('../src/components/JointsPanel.tsx', import.meta.url), 'utf8')
  assert.match(jp, /cadAxisToWorld\(k\)/)
  assert.equal(jointTypeMenu(['rigid', 'planar']).length, 8)
  assert.deepEqual(jointTypeMenu(['rigid', 'planar']).slice(0, 2), ['rigid', 'planar'])
  assert.equal(new Set(jointTypeMenu(['revolute'])).size, ALL_JOINT_TYPES.length)
  assert.deepEqual(ALL_JOINT_TYPES.map((t) => JOINT_LABEL_TC[t]), ['轉動', '滑動', '圓柱', '銷槽', '球', '平面', '螺旋', '剛性'])
})
