// Kernel feasibility probe for Fusion-style Silhouette Split.
// It verifies that the shipped OCCT build can produce exact HLR outline edges
// from smooth analytic B-reps. It does NOT claim those edges can yet split a
// face, nor that HLR OutLine includes sharp-box projection boundaries.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox, makeCylinder, makeSphere } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const outlineEdges = (shape, viewDir) => {
  const p = new OC.gp_Pnt_3(0, 0, 200)
  const n = new OC.gp_Dir_4(viewDir[0], viewDir[1], viewDir[2])
  const x = new OC.gp_Dir_4(1, 0, 0)
  const projector = new OC.HLRAlgo_Projector_2(new OC.gp_Ax2_2(p, n, x))
  const algo = new OC.HLRBRep_Algo_1()
  algo.Add_2(shape.wrapped, 0)
  algo.Projector_1(projector)
  algo.Update()
  algo.Hide_1()
  const out = new OC.HLRBRep_HLRToShape(new OC.Handle_HLRBRep_Algo_2(algo)).OutLineVCompound3d()
  let count = 0
  const ex = new OC.TopExp_Explorer_2(out, OC.TopAbs_ShapeEnum.TopAbs_EDGE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
  while (ex.More()) { count++; ex.Next() }
  return count
}

let failures = 0
const ok = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`)
  if (!condition) failures++
}

const boxOutlines = outlineEdges(makeBaseBox(30, 20, 10), [0, 1, 0])
// HLR OutLine intentionally reports smooth tangent silhouettes; a box has no
// tangent contour. Sharp projection boundaries require VCompound/edge routing.
ok(boxOutlines === 0, `box has no smooth HLR OutLine edges (${boxOutlines}); sharp boundaries need a separate path`)

for (const [label, shape] of [
  ['cylinder', makeCylinder(10, 30)],
  ['sphere', makeSphere(12)],
]) {
  let n = 0
  try { n = outlineEdges(shape, [0, 1, 0]) } catch (error) { console.log(`INFO  ${label} probe threw: ${error?.message || error}`) }
  ok(n > 0, `${label} has exact HLR outline edges for an orthographic side view (${n})`)
}

if (failures) process.exitCode = 1
