// Boundary Fill v1 real-kernel regression: two overlapping closed solids must produce
// three disjoint B-rep cells (A-only, overlap, B-only). This deliberately exercises
// the same independent clone + cut/intersect algebra used by cad.worker.ts.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const volume = (shape) => {
  const props = new OC.GProp_GProps_1()
  OC.BRepGProp.VolumeProperties_1(shape.wrapped, props, false, false, false)
  return Math.abs(props.Mass())
}
const near = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol
let failed = 0
const ok = (condition, message, detail = '') => { console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}${detail ? ` (${detail})` : ''}`); if (!condition) failed++ }

// A=[0,20]^3, B=[10,30]^3. Each cell has 10×20×20 = 4000 mm³.
const source = makeBaseBox(20, 20, 20)
const tool = makeBaseBox(20, 20, 20).translate([10, 0, 0])
const targetOnly = source.clone().cut(tool.clone())
const overlap = source.clone().intersect(tool.clone())
const toolOnly = tool.clone().cut(source.clone())
const va = volume(targetOnly), vi = volume(overlap), vb = volume(toolOnly)

ok(near(va, 4000), 'target-only cell has expected B-rep volume', va.toFixed(6))
ok(near(vi, 4000), 'overlap cell has expected B-rep volume', vi.toFixed(6))
ok(near(vb, 4000), 'tool-only cell has expected B-rep volume', vb.toFixed(6))
ok(near(va + vi, volume(source)), 'target-only plus overlap reconstructs the source volume', `${(va + vi).toFixed(6)} vs ${volume(source).toFixed(6)}`)
ok(near(vb + vi, volume(tool)), 'tool-only plus overlap reconstructs the tool volume', `${(vb + vi).toFixed(6)} vs ${volume(tool).toFixed(6)}`)
ok(near(va + vi + vb, volume(source.fuse(tool))), 'three Boundary Fill cells reconstruct the union volume', `${(va + vi + vb).toFixed(6)} vs ${volume(source.fuse(tool)).toFixed(6)}`)

if (failed) process.exitCode = 1
