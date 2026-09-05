import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { default: opencascade } = await import('../_occt-build/_rebuilt/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../_occt-build/_rebuilt/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
console.log('kernel loaded OK; OC keys:', Object.keys(OC).length)
console.log('PlateWrapper bound?', typeof OC.PlateWrapper)
if (OC.PlateWrapper) console.log('  BridgeG1?', typeof OC.PlateWrapper.BridgeG1)
console.log('PatchWrapper (对照)?', typeof OC.PatchWrapper, OC.PatchWrapper ? typeof OC.PatchWrapper.FillThicken : '')
console.log('DirectEditWrapper (对照)?', typeof OC.DirectEditWrapper)
// GeomPlate 类本身绑定咗？
console.log('GeomPlate_BuildPlateSurface?', typeof OC.GeomPlate_BuildPlateSurface)
console.log('BRepFill_CurveConstraint?', typeof OC.BRepFill_CurveConstraint)
console.log('Adaptor3d_CurveOnSurface?', typeof OC.Adaptor3d_CurveOnSurface)
