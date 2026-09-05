import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chamferAngleFromDrag, chamferDistanceFromDrag, filletRadiusFromDrag } from '../src/cad/chamferDrag.ts'

const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('Chamfer canvas distance uses Fusion-style 5 mm coarse snap', () => {
  assert.equal(chamferDistanceFromDrag(0, 0.2), 5)
  assert.equal(chamferDistanceFromDrag(0, 7.4), 5)
  assert.equal(chamferDistanceFromDrag(0, 7.6), 10)
  assert.equal(chamferDistanceFromDrag(5, -3), 0)
})

test('Distance and Angle arc decreases rightward in whole degrees', () => {
  assert.equal(chamferAngleFromDrag(45, 10), 35)
  assert.equal(chamferAngleFromDrag(45, -10), 55)
  assert.equal(chamferAngleFromDrag(45, 50), 0)
  assert.equal(chamferAngleFromDrag(45, -50), 90)
  assert.equal(chamferAngleFromDrag(45, 0.4), 45)
})

test('Fillet canvas radius keeps its existing 0.1 mm precision', () => {
  assert.equal(filletRadiusFromDrag(2, 0.26), 2.3)
  assert.equal(filletRadiusFromDrag(0.5, -10), 0.5)
})

test('Chamfer modes expose distinct manipulators and endpoint validation', () => {
  assert.match(viewport, /chamferMode === 'two'.*beginDistance\('secondary'\)/s)
  assert.match(viewport, /slot === 'secondary' \? ev\.clientY - sy : sy - ev\.clientY/)
  assert.match(viewport, /chamferMode === 'angle'.*beginAngle/s)
  assert.match(viewport, /aria-label="Chamfer angle deg" min=\{0\} max=\{90\}/)
  assert.match(store, /chamferAngle > 0 && get\(\)\.chamferAngle < 90/)
  assert.match(store, /s\.chamferAngle > 0 && s\.chamferAngle < 90/)
})
