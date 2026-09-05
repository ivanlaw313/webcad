// Production-kernel regression: the shipped WASM must retain the exact,
// source-face-mapped cylindrical/conical Silhouette Split routes and reject a
// sphere before OCCT SplitShape can fault.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, makeCylinder, makeSphere } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

let failed = 0
const ok = (v, msg) => { console.log(`${v ? 'PASS' : 'FAIL'}  ${msg}`); if (!v) failed++ }
const faceCount = (shape) => {
  const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
  let n = 0; while (ex.More()) { n++; ex.Next() }
  return n
}

const cyl = makeCylinder(10, 30)
const before = faceCount(cyl.wrapped)
const split = OC.DirectEditWrapper.SplitByHlrOutline3dSafe(cyl.wrapped, 0, -1, 0)
ok(typeof OC.DirectEditWrapper?.SplitByHlrOutline3dSafe === 'function', 'production kernel exports guarded silhouette split')
ok(!split.IsNull(), 'cylindrical silhouette split returns a B-rep result')
ok(faceCount(split) > before, `cylindrical silhouette split increases face count (${before} → ${faceCount(split)})`)

const sphere = OC.DirectEditWrapper.SplitByHlrOutline3dSafe(makeSphere(12).wrapped, 0, -1, 0)
ok(sphere.IsNull(), 'sphere is safely rejected instead of entering unsafe SplitShape')

const cone = draw([12, 0]).lineTo([5, 30]).lineTo([0, 30]).lineTo([0, 0]).close().sketchOnPlane('XY').revolve([0, 1, 0])
const coneBefore = faceCount(cone.wrapped)
const coneSplit = OC.DirectEditWrapper.SplitByHlrOutline3dConesOnly(cone.wrapped, 1, 0, 0)
ok(faceCount(cone.wrapped) === 3, 'revolved cone fixture is a closed analytic B-rep with three faces')
ok(typeof OC.DirectEditWrapper?.SplitByHlrOutline3dConesOnly === 'function', 'production kernel exports guarded cone silhouette split')
ok(!coneSplit.IsNull(), 'conical silhouette split returns a B-rep result')
ok(faceCount(coneSplit) > coneBefore, `conical silhouette split increases face count (${coneBefore} -> ${faceCount(coneSplit)})`)
if (failed) process.exitCode = 1
