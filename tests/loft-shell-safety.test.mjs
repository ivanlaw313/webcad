import test from 'node:test'
import assert from 'node:assert/strict'
import { hasUnsafeLoftShellAdjacency } from '../src/cad/loftShellSafety.ts'

const rect = (width) => ({ kind: 'rect', a: [0, 0], b: [width, 10] })

test('constant-section two-profile loft remains eligible for Shell', () => {
  assert.equal(hasUnsafeLoftShellAdjacency({ type: 'loft', bottom: rect(10), top: rect(10) }), false)
})

test('tapered, guided, multi-section, and continuity lofts are protected before Shell', () => {
  assert.equal(hasUnsafeLoftShellAdjacency({ type: 'loft', bottom: rect(10), top: rect(20) }), true)
  assert.equal(hasUnsafeLoftShellAdjacency({ type: 'loft', sections: [{ profile: rect(10) }, { profile: rect(10) }, { profile: rect(10) }] }), true)
  assert.equal(hasUnsafeLoftShellAdjacency({ type: 'loft', bottom: rect(10), top: rect(10), rails: [[[0, 0], [1, 1]]] }), true)
  assert.equal(hasUnsafeLoftShellAdjacency({ type: 'loft', bottom: rect(10), top: rect(10), continuity: 'C1' }), true)
})

test('non-loft predecessors never block Shell', () => {
  assert.equal(hasUnsafeLoftShellAdjacency({ type: 'extrude' }), false)
  assert.equal(hasUnsafeLoftShellAdjacency(undefined), false)
})
