// Narrow real-kernel probe for Fusion Asymmetric Fillet on a straight convex planar edge.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { asymmetricFilletNearPoints } = await import('../src/cad/asymmetricFillet.ts')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const volume = (shape) => {
  const { vertices: v, triangles: t } = shape.mesh({ tolerance: 0.025, angularTolerance: 0.15 })
  let sum = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    sum += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1]) + v[a + 1] * (v[b + 2] * v[c] - v[b] * v[c + 2]) + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])
  }
  return Math.abs(sum / 6)
}

const box = makeBaseBox(20, 30, 10)
const d1 = 6, d2 = 3, len = 30
const result = asymmetricFilletNearPoints(box, [[10, 0, 10]], d1, d2)
const flipped = asymmetricFilletNearPoints(box, [[10, 0, 10]], d1, d2, true)
const expectedRemoved = d1 * d2 * (1 - Math.PI / 4) * len
const removed = volume(box) - volume(result)
const removedFlip = volume(box) - volume(flipped)
if (Math.abs(removed - expectedRemoved) > 2) throw new Error(`Asymmetric fillet volume mismatch: ${removed} vs ${expectedRemoved}`)
if (Math.abs(removedFlip - expectedRemoved) > 2) throw new Error(`Flipped asymmetric fillet volume mismatch: ${removedFlip} vs ${expectedRemoved}`)
if (Math.abs(d1 - d2) < 1e-9 || result.faces.length <= box.faces.length) throw new Error('Asymmetric fillet did not create a distinct curved blend face')
console.log(`PASS Asymmetric Fillet: offsets ${d1}/${d2}, removed ${removed.toFixed(2)} mm³; flipped ${removedFlip.toFixed(2)} mm³ (expected ${expectedRemoved.toFixed(2)})`)
