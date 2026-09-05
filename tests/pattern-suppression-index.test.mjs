import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Fusion Pattern's first suppression slot denotes the original seed.  For symmetric
// grids that seed is centred, so raw row-major grid index is not a valid suppression
// index.  Keep this mapping independently specified here.
const suppressionIndex = (i, j, k, cx, cy, cz, sx, sy, sz) => {
  const grid = (i * cy + j) * cz + k
  const seedGrid = (sx * cy + sy) * cz + sz
  return grid === seedGrid ? 0 : grid < seedGrid ? grid + 1 : grid
}

test('symmetric rectangular pattern reserves suppression index zero for its centre seed', () => {
  const seen = []
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    seen.push(suppressionIndex(i, j, 0, 3, 3, 1, 1, 1, 0))
  }
  assert.deepEqual(seen, [1, 2, 3, 4, 0, 5, 6, 7, 8])
  assert.equal(new Set(seen).size, 9)
})

test('worker implements seed-first suppression mapping for symmetric patterns', () => {
  const source = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  assert.match(source, /const seedGridIndex = \(\(sX \* cy \+ sY\) \* cz \+ sZ\)/)
  assert.match(source, /grid === seedGridIndex \? 0 : grid < seedGridIndex \? grid \+ 1 : grid/)
})
