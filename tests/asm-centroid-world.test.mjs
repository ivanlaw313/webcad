// BUG(C)：装配质心必须用组件世界变换（pos/rot/关节 FK），质心必须落喺世界 bbox 内。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Matrix4 } from 'three'
import { assemblyMassSummary, transformVertices } from '../src/assembly/asmMass.ts'
import { computeFK } from '../src/assembly/kinematics.ts'

function box(x0, y0, z0, dx, dy, dz) {
  const v = [], t = []
  const P = [[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]]
  for (const [a,b,c] of P) v.push(x0 + a*dx, y0 + b*dy, z0 + c*dz)
  const F = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]
  for (const f of F) t.push(...f)
  return { vertices: v, triangles: t }
}

test('transformVertices applies column-major matrix', () => {
  const M = new Matrix4().makeTranslation(1, 2, 3).elements
  assert.deepEqual(transformVertices([0, 0, 0, 1, 1, 1], M), [1, 2, 3, 2, 3, 4])
})

test('centroid follows component world transforms and stays inside the assembly bbox', () => {
  // plate 50×40×10 at origin; shaft modelled far away (x≈260) but placed onto the plate by its world matrix
  const plate = box(0, 0, 0, 50, 40, 10)
  const shaft = box(255, 15, 0, 10, 10, 40)
  const Mshaft = new Matrix4().makeTranslation(-235, 0, 0).elements   // shaft now x∈[20,30]
  const r = assemblyMassSummary([{ meshes: [plate], M: new Matrix4().elements }, { meshes: [shaft], M: Mshaft }])
  assert.ok(r.centroid)
  for (let k = 0; k < 3; k++) assert.ok(r.centroid[k] >= r.min[k] - 1e-6 && r.centroid[k] <= r.max[k] + 1e-6, `axis ${k} inside bbox`)
  assert.ok(Math.abs(r.max[0] - r.min[0] - 50) < 1e-9)
  assert.ok(r.centroid[0] < 50, 'not reported at the un-transformed x≈260')
})

test('FK matrices are used: a driven child contributes at its joint pose', () => {
  const joints = [{ id: 'J1', name: 'j', type: 'slider', parent: 'A', child: 'B', anchor: [0, 0, 0], axis: [1, 0, 0], angle: 0, slide: -100 }]
  const fk = computeFK(['A', 'B'], joints)
  const b = box(100, 0, 0, 10, 10, 10)
  const r = assemblyMassSummary([{ meshes: [b], M: fk.get('B').elements }])
  assert.ok(Math.abs(r.centroid[0] - 5) < 1e-9)
})

test('viewport HUD / CoM marker and component properties use FK world matrices', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /compWorldMatrix\(c, asmFk\.get\(c\.id\)\)\.elements/)
  assert.match(vp, /assemblyMassSummary\(vis\.map/)
  const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const body = st.slice(st.indexOf('  openPropertiesDialog: async'), st.indexOf('  closePropertiesDialog:', st.indexOf('  openPropertiesDialog: async')))
  assert.match(body, /compWorldMatrix\(c, fkP\.get\(c\.id\)\)/)
})
