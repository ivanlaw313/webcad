import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveJointOrigin } from '../src/assembly/kinematics.ts'

test('Joint Origin Flip has one effective visual axis and one raw Joint axis', () => {
  const origin = {
    id: 'JO1', name: 'flip test', point: [10, 20, 30], mode: 'simple',
    angle: 0, offset: [1, -2, 3], flip: true, axis: [0, 0, 1],
  }
  const close = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-12))
  close(resolveJointOrigin(origin).axis, [0, 0, -1])
  close(resolveJointOrigin(origin, false).axis, [0, 0, 1])
  assert.deepEqual(resolveJointOrigin(origin, false).anchor, [11, 18, 33])
})

test('switching commands cancels a pending Joint Origin pick instead of leaving a hidden picker armed', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const start = store.indexOf('const anyArmed =')
  const end = store.indexOf("set({ lastCommand", start)
  const cancel = store.slice(start, end)
  assert.match(cancel, /s0\.jointOriginPickMode/)
  assert.match(cancel, /jointOriginPickMode: false/)
  assert.match(cancel, /jointOriginFirst: null/)
})
