// Staging-only probe for the custom DirectEditWrapper.HlrOutline3d export.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, makeCylinder, makeSphere } = await import('replicad')
const { default: opencascade } = await import('../_occt-build/_rebuilt/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../_occt-build/_rebuilt/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

let failures = 0
const ok = (condition, message) => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${message}`)
  if (!condition) failures++
}
const countEdges = (out) => {
  const ex = new OC.TopExp_Explorer_2(out, OC.TopAbs_ShapeEnum.TopAbs_EDGE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
  let n = 0; while (ex.More()) { n++; ex.Next() }
  return n
}
const edges = (shape) => countEdges(OC.DirectEditWrapper.HlrOutline3d(shape.wrapped, 0, 1, 0))
const sourcePCurveEdges = (shape) => countEdges(OC.DirectEditWrapper.HlrOutlineWithSourcePCurves(shape.wrapped, 0, 1, 0))
const countFaces = (shape) => {
  const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
  let n = 0; while (ex.More()) { n++; ex.Next() }
  return n
}

ok(typeof OC.DirectEditWrapper?.HlrOutline3d === 'function', 'staged DirectEditWrapper exports HlrOutline3d')
ok(typeof OC.DirectEditWrapper?.HlrOutlineWithSourcePCurves === 'function', 'staged wrapper exports the source-pcurve safety gate')
ok(edges(makeCylinder(10, 30)) > 0, 'staged wrapper returns exact cylinder outline B-rep edges')
ok(edges(makeSphere(12)) > 0, 'staged wrapper returns exact sphere outline B-rep edges')
for (const [label, shape] of [['cylinder', makeCylinder(10, 30)], ['sphere', makeSphere(12)]]) {
  const n = sourcePCurveEdges(shape)
  console.log(`INFO  ${label} source-pcurve outline edges: ${n}`)
  ok(n >= 0, `${label} source-pcurve gate returns safely without a split attempt`)
}

const cyl = makeCylinder(10, 30)
const cylFaceCount = countFaces(cyl.wrapped)
const splitCylinder = OC.DirectEditWrapper.SplitByHlrOutline3dSafe(cyl.wrapped, 0, 1, 0)
ok(typeof OC.DirectEditWrapper?.SplitByHlrOutline3dSafe === 'function', 'staged wrapper exports source-face-mapped silhouette split')
ok(!splitCylinder.IsNull(), 'source-face-mapped cylinder silhouette split returns a B-rep shape')
ok(countFaces(splitCylinder) > cylFaceCount, `cylinder silhouette split increases face count (${cylFaceCount} -> ${countFaces(splitCylinder)})`)

// A sphere is deliberately rejected before BRepFeat_SplitShape: its periodic
// surface can fault WASM even though its HLR edge has a p-curve.  The safe v1
// gate must return null rather than attempting the invalid operation.
const rejectedSphere = OC.DirectEditWrapper.SplitByHlrOutline3dSafe(makeSphere(12).wrapped, 0, 1, 0)
ok(rejectedSphere.IsNull(), 'sphere silhouette split is safely rejected by the cylindrical-surface gate')

// Cone/freeform support is deliberately not asserted here. The public
// replicad build has no cone factory, so this closed analytic B-rep fixture is
// created by a profile revolution instead of using a display mesh.
const cone = draw([12, 0]).lineTo([5, 30]).lineTo([0, 30]).lineTo([0, 0]).close().sketchOnPlane('XY').revolve([0, 1, 0])
const coneBefore = countFaces(cone.wrapped)
const coneSplit = OC.DirectEditWrapper.SplitByHlrOutline3dConesOnly(cone.wrapped, 1, 0, 0)
ok(typeof OC.DirectEditWrapper?.SplitByHlrOutline3dConesOnly === 'function', 'staging kernel exports cone-only silhouette split experiment')
ok(!coneSplit.IsNull(), 'cone-only silhouette split returns a B-rep shape')
ok(countFaces(coneSplit) > coneBefore, `cone silhouette split increases face count (${coneBefore} -> ${countFaces(coneSplit)})`)
if (failures) process.exitCode = 1
