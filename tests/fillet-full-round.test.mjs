// Fusion Full Round kernel regression: replace a planar center face with a full-radius blend
// between its two adjacent side-face sets. The radius is inferred from the selected faces.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox, makeBox, makeCylinder } = await import('replicad')
const { fullRoundFilletFromFaces } = await import('../src/cad/fullRound.ts')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const key = (e) => {
  const q = (p) => [p.x, p.y, p.z].map((v) => Math.round(v * 1e5)).join(',')
  const a = q(e.pointAt(0)), b = q(e.pointAt(1)), m = q(e.pointAt(0.5))
  return `${[a, b].sort().join('|')}|${m}`
}

const volume = (shape) => {
  const { vertices: v, triangles: t } = shape.mesh({ tolerance: 0.05, angularTolerance: 0.2 })
  let sum = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    sum += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) + v[a + 1] * (v[b + 2] * v[c] - v[b] * v[c + 2]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])
  }
  return Math.abs(sum / 6)
}

const box = makeBaseBox(20, 30, 10)
const faces = box.faces
const topId = faces.reduce((a, f, i) => f.center.z > faces[a].center.z ? i : a, 0)
const side1Id = faces.reduce((a, f, i) => f.center.x < faces[a].center.x ? i : a, 0)
const side2Id = faces.reduce((a, f, i) => f.center.x > faces[a].center.x ? i : a, 0)
const top = faces[topId], side1 = faces[side1Id], side2 = faces[side2Id]
const topKeys = new Map(top.edges.map((e) => [key(e), e]))
const selected = [...side1.edges, ...side2.edges].filter((e) => topKeys.has(key(e))).map((e) => topKeys.get(key(e)))
if (selected.length !== 2) throw new Error(`Full Round expected two center/side boundary edges, got ${selected.length}`)

const result = fullRoundFilletFromFaces(box, { side1: [side1Id], center: [topId], side2: [side2Id] }, makeCylinder)
const curved = result.faces.filter((f) => /CYL/i.test(String(f.geomType)))
if (!curved.length) throw new Error('Full Round result has no cylindrical blend face')
if (result.boundingBox.bounds[1][2] < box.boundingBox.bounds[1][2] + 9.9) throw new Error('Full Round did not create the expected outward half-cylinder')
console.log(`PASS Full Round: ${selected.length} boundary edges, ${result.faces.length} faces, ${curved.length} cylindrical face(s)`)

{
  const pocket = makeBaseBox(40, 30, 20).cut(makeBox([-10, -10, 10], [10, 10, 25]))
  const pf = pocket.faces
  const near = (target) => pf.reduce((best, f, i) => {
    const d = Math.hypot(f.center.x - target[0], f.center.y - target[1], f.center.z - target[2])
    return d < best.d ? { i, d } : best
  }, { i: -1, d: Infinity }).i
  const floorId = near([0, 0, 10]), inner1Id = near([-10, 0, 15]), inner2Id = near([10, 0, 15])
  const before = volume(pocket)
  const trough = fullRoundFilletFromFaces(pocket, { side1: [inner1Id], center: [floorId], side2: [inner2Id] }, makeCylinder)
  const after = volume(trough)
  const concaveCurved = trough.faces.filter((f) => /CYL/i.test(String(f.geomType)))
  if (!concaveCurved.length || !(after < before - 100)) throw new Error(`Concave Full Round did not cut a cylindrical trough (${before} → ${after})`)
  console.log(`PASS concave Full Round: volume ${before.toFixed(1)} → ${after.toFixed(1)}, ${concaveCurved.length} cylindrical face(s)`)
}
