// BUG(A)：「新建組件」喺多實體（plate + shaft）時唔可以丟走泊車實體。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { splitLiveBodies, makeDefOcc } from '../src/assembly/occurrence.ts'

const tri = (x) => ({ vertices: [x, 0, 0, x + 1, 0, 0, x, 1, 0], triangles: [0, 1, 2], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1] })

test('active body + every parked body become separate components (no body dropped)', () => {
  const shaft = tri(10), plate = tri(0)
  const live = { ...shaft, parked: [{ name: '实体1', ...plate }] }
  const out = splitLiveBodies(live)
  assert.equal(out.length, 2)
  assert.equal(out[0].active, true)
  assert.deepEqual(out[0].mesh.vertices, shaft.vertices)
  assert.equal(out[0].mesh.parked, undefined, 'active component mesh no longer carries parked bodies')
  assert.equal(out[1].active, false)
  assert.equal(out[1].name, '实体1')
  assert.deepEqual(out[1].mesh.vertices, plate.vertices)
  // ids/defs are distinct when accumulated
  let defs = []
  const ids = out.map((lb, i) => { const { def } = makeDefOcc(defs, 'C' + (i + 1), 'x', lb.mesh, [0, 0, 0]); defs = [...defs, def]; return def.id })
  assert.equal(new Set(ids).size, 2)
})

test('single body is passed through by reference; empty active body is skipped', () => {
  const m = tri(0)
  assert.equal(splitLiveBodies(m)[0].mesh, m)
  const allParked = { vertices: [], triangles: [], normals: [], parked: [{ name: 'a', ...tri(0) }, { name: 'b', ...tri(5) }] }
  const out = splitLiveBodies(allParked)
  assert.deepEqual(out.map((o) => o.name), ['a', 'b'])
})

test('store.newComponent freezes all live bodies via splitLiveBodies', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const body = store.slice(store.indexOf('  newComponent: () => {'), store.indexOf('  importStl: async'))
  assert.match(body, /splitLiveBodies\(b\)/)
  assert.match(body, /components: \[\.\.\.comps, \.\.\.newComps\]/)
})
