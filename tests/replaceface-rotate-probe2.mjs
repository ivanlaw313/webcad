// probe2 — 精确刻画 ReplaceFaceNear 对旋转平面「保留边」行为，及 hinge-on-edge 何时 NULL。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)
const W = OC.DirectEditWrapper
function vol(s) { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(s, g, false, false, false); return g.Mass() } catch { return NaN } }
function nf(s) { try { let n = 0; const e = new OC.TopExp_Explorer_2(s, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; e.More(); e.Next()) n++; return n } catch { return -1 } }
function bbz(s) { try { const c = (await0(s)); return c } catch { return '?' } }
function excMsg(e) { if (typeof e !== 'number') return e?.message || String(e); try { return OC.getExceptionMessage ? OC.getExceptionMessage(e) : 'C++#' + e } catch { return 'C++#' + e } }

const box = makeBaseBox(40, 40, 40)
const bb = box.boundingBox.bounds
const zmax = bb[1][2], zmin = bb[0][2], ymin = bb[0][1], ymax = bb[1][2]
const topCtr = [0, 0, zmax]
console.log('box vol', vol(box.wrapped).toFixed(0), 'zmax', zmax.toFixed(1))

function run(label, pick, org, nrm) {
  try {
    const r = W.ReplaceFaceNear(box.wrapped, ...pick, ...org, ...nrm)
    if (!r || r.IsNull()) { console.log(`  NULL   ${label}`); return }
    // z-extent of result
    let zlo = 1e9, zhi = -1e9
    const ex = new OC.TopExp_Explorer_2(r, OC.TopAbs_ShapeEnum.TopAbs_VERTEX, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
    for (; ex.More(); ex.Next()) { const p = OC.BRep_Tool.Pnt(OC.TopoDS.Vertex_1(ex.Current())); zlo = Math.min(zlo, p.Z()); zhi = Math.max(zhi, p.Z()) }
    console.log(`  vol=${vol(r).toFixed(0).padStart(6)} faces=${nf(r)} zrange=[${zlo.toFixed(1)},${zhi.toFixed(1)}]  ${label}`)
  } catch (e) { console.log(`  ABORT  ${label} :: ${excMsg(e)}`) }
}

// tilt angles about X, plane always thru top center
for (const deg of [0, 5, 10, 15, 30, 45]) {
  const t = deg * Math.PI / 180
  run(`tilt ${deg}° /X thru topCtr`, topCtr, topCtr, [0, -Math.sin(t), Math.cos(t)])
}
console.log('--- flip normal sign (see if it keeps the other side) ---')
for (const deg of [15, 30]) {
  const t = deg * Math.PI / 180
  run(`tilt ${deg}° /X thru topCtr, NORMAL FLIPPED`, topCtr, topCtr, [0, Math.sin(t), -Math.cos(t)])
}
console.log('--- hinge on edge, tiny tilt, plane origin AT edge exactly vs nudged inward ---')
{
  const t = 15 * Math.PI / 180, nrm = [0, -Math.sin(t), Math.cos(t)]
  run('hinge exactly on front-top edge (y=ymin)', topCtr, [0, ymin, zmax], nrm)
  run('hinge nudged inward 0.5 (y=ymin+0.5)', topCtr, [0, ymin + 0.5, zmax], nrm)
  run('hinge nudged inward 5 (y=ymin+5)', topCtr, [0, ymin + 5, zmax], nrm)
}
process.exit(0)
