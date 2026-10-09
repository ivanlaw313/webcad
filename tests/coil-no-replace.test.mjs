import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveCoilOp, fuseLostMaterial } from '../src/cad/coilOp.ts'

test('coil defaults to a new body when a solid exists (never silently replaces)', () => {
  assert.equal(resolveCoilOp(undefined, true), 'newbody')
  assert.equal(resolveCoilOp('', true), 'newbody')
  assert.equal(resolveCoilOp('newbody', true), 'newbody')
})
test('explicit join/cut/intersect choices are honoured', () => {
  assert.equal(resolveCoilOp('new', true), 'new')
  assert.equal(resolveCoilOp('cut', true), 'cut')
  assert.equal(resolveCoilOp('intersect', true), 'intersect')
  assert.equal(resolveCoilOp(undefined, true, true), 'cut')   // global cut mode
})
test('no solid → coil becomes the first body', () => {
  assert.equal(resolveCoilOp('newbody', false), 'new')
  assert.equal(resolveCoilOp('cut', false), 'new')
})
test('join that loses the original body is detected', () => {
  assert.equal(fuseLostMaterial(1000, 300, 300), true)     // only the coil left
  assert.equal(fuseLostMaterial(1000, 300, 1250), false)   // proper union
  assert.equal(fuseLostMaterial(0, 300, 300), false)
})
test('dialog default + worker guard are wired', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(store, /coil: \{ d: 60, pitch: 12, h: 80, wire: 10, op: 'newbody' \}/)
  assert.match(store, /d\.kind === 'coil' \? resolveCoilOp\(rawOp/)
  const w = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  assert.match(w, /fuseLostMaterial\(v0, vt, _solidVolume\(shape\)\)/)
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /data-testid="coil-op"/)
})
