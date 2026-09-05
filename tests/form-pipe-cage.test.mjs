import assert from 'node:assert/strict'
import { makeFormPipeCage } from '../src/cad/subdiv.ts'

// FORM Pipe is a T-spline-style open quad cage, not a SOLID sweep.
const path = [[0, 0, 0], [20, 0, 0], [20, 15, 8]]
const cage = makeFormPipeCage(path, 4, 8)
assert.equal(cage.verts.length, 24, 'one editable circular control ring per path point')
assert.equal(cage.quads.length, 16, 'adjacent rings connect only with quads')
assert.ok(cage.quads.every((q) => q.length === 4), 'no triangle caps or B-Rep faces')
assert.ok(cage.verts.every((p) => p.every(Number.isFinite)), 'bent path yields finite cage vertices')

// First ring sits radius 4 from the first spine point; this confirms a genuine profile frame.
for (let i = 0; i < 8; i++) assert.ok(Math.abs(Math.hypot(...cage.verts[i]) - 4) < 1e-8)

assert.throws(() => makeFormPipeCage([[0, 0, 0]], 4, 8), /at least two/)
assert.throws(() => makeFormPipeCage([[0, 0, 0], [0, 0, 0]], 4, 8), /distinct/)
assert.throws(() => makeFormPipeCage([[0, 0, 0], [1, 0, 0]], 4, 2), /at least 3/)
console.log('form pipe cage: ok')
