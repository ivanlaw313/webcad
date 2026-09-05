// Adjacent-face Face Fillet resolves the faces' shared topological edge and
// delegates to the proven B-rep edge-fillet kernel.  It must create material
// change, remain tessellatable, and never rely on a display-mesh approximation.
import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const volume = (shape) => { const p = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape.wrapped, p, false, false, false); return Math.abs(p.Mass()) }

test('adjacent planar faces resolve to a shared edge and make a real B-rep fillet', () => {
  const box = makeBaseBox(50, 40, 30)
  const sharedMid = [25, 0, 30]
  const result = box.fillet(4, (edge) => edge.containsPoint(sharedMid))
  assert.ok(!result.wrapped.IsNull() && volume(result) > 1, 'shared-edge face fillet is a non-empty B-rep')
  assert.ok(volume(result) < volume(box), 'fillet removes material from the shared edge')
  assert.ok(result.mesh({ tolerance: 0.15, angularTolerance: 0.5 }).triangles.length > 0, 'result tessellates for the viewport')
})

test('Face Fillet preflights adjacency before a timeline feature is submitted', () => {
  const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(worker, /async sharedFaceEdgeAt\(a: \[number, number, number\], b: \[number, number, number\]\)/)
  assert.match(worker, /两张面没有共同 B-rep 边/)
  assert.match(worker, /shape\.fillet\(rr, \(edge: any\) => edge\.containsPoint\(sharedMid\)\)/)
  assert.match(store, /const shared = await cad\.sharedFaceEdgeAt\(pts\[0\], pts\[1\]\)/)
  assert.match(store, /const refs = await cad\.captureFaceRefs\(pts\)/)
  assert.match(store, /type: 'facefillet', radius: r, near1: pts\[0\], near2: pts\[1\], faceFp: refs\.v1/)
  assert.match(worker, /_ffSelectPts\(shape, f\.faceFp, \[f\.near1, f\.near2\], f\.faceFpV2, f\.faceFpTopo\)/)
})
