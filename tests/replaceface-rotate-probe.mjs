// replaceface-rotate-probe.mjs — 决定性实验：现有 plus 内核 DirectEditWrapper.ReplaceFaceNear
// 系咪接受一个【旋转过（非平行）】嘅目标平面，仍出 valid solid？
//   若 PASS → Move Face ROTATE 可零内核重建，重用 replaceface 路径（只喂旋转法向）。
//   若 FAIL/abort → 诚实报，真需内核。
// 跑法: npx -y tsx tests/replaceface-rotate-probe.mjs   (在 C:\ClaudeCode\webcad)
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, cast, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)
console.log('kernel loaded OK; OC keys:', Object.keys(OC).length)

const W = (OC).DirectEditWrapper
console.log('DirectEditWrapper present:', !!W, 'ReplaceFaceNear bound:', !!(W && W.ReplaceFaceNear))
if (W) console.log('  DirectEditWrapper methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(W)).filter(k => /Face|Near|Surface/i.test(k)).join(', ') || '(scan proto failed) keys=' + Object.keys(W).join(','))

function vol(shape) { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape, g, false, false, false); return g.Mass() } catch { return NaN } }
function nfaces(shape) { try { let n = 0; const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; ex.More(); ex.Next()) n++; return n } catch { return -1 } }
function tris(shape) {
  try {
    new OC.BRepMesh_IncrementalMesh_2(shape, 0.1, false, 0.5, false)
    let t = 0; const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
    for (; ex.More(); ex.Next()) {
      const loc = new OC.TopLoc_Location_1()
      const h = OC.BRep_Tool.Triangulation(OC.TopoDS.Face_1(ex.Current()), loc, 0)
      if (!h.IsNull()) t += h.get().NbTriangles()
    }
    return t
  } catch (e) { return 'meshTHREW:' + excMsg(e) }
}
function excMsg(e) {
  if (typeof e !== 'number') return e?.message || String(e)
  for (const fn of ['getExceptionMessage']) { try { if (typeof OC[fn] === 'function') return OC[fn](e) } catch { /**/ } }
  return 'C++exc#' + e
}

// box 40x40x40 centered? makeBaseBox is corner-at-origin-ish; replicad makeBaseBox(dx,dy,dz) centered on origin in XY, from -dz? test empirically.
const box = makeBaseBox(40, 40, 40)
const bb = box.boundingBox.bounds
console.log('box bounds:', JSON.stringify(bb), 'vol=', vol(box.wrapped).toFixed(0))
// top face center = (0,0, zmax); its normal = +Z
const zmax = bb[1][2]
const topCtr = [0, 0, zmax]
console.log('top face center pick pt:', JSON.stringify(topCtr), 'zmax=', zmax)

const rows = []
function rec(name, pass, info) { rows.push({ name, pass }); console.log(`  ${pass ? 'PASS' : 'FAIL'} ${name} :: ${info}`) }

function tryReplace(label, pick, org, nrm) {
  try {
    const res = W.ReplaceFaceNear(box.wrapped, pick[0], pick[1], pick[2], org[0], org[1], org[2], nrm[0], nrm[1], nrm[2])
    if (!res || res.IsNull()) { rec(label, false, 'returned NULL (no intersection/degenerate)'); return }
    const v = vol(res), nf = nfaces(res), tr = tris(res)
    // valid = positive finite volume + a mesh came out
    const ok = Number.isFinite(v) && v > 1 && typeof tr === 'number' && tr > 0
    rec(label, ok, `vol=${Number.isFinite(v) ? v.toFixed(1) : v}  faces=${nf}  tris=${tr}`)
  } catch (e) { rec(label, false, 'THREW/ABORT ' + excMsg(e)) }
}

// --- A) SANITY: parallel plane push-in 10mm (exactly what current UI does) ---
tryReplace('A) parallel push-in 10mm (current UI)', topCtr, [0, 0, zmax - 10], [0, 0, 1])

// --- B) ROTATED plane: tilt top face 15° about X axis, plane passes through top center ---
{
  const t = 15 * Math.PI / 180
  // rotate +Z about X by 15°: (0,0,1) -> (0, -sin, cos)
  const nrm = [0, -Math.sin(t), Math.cos(t)]
  tryReplace('B) ROTATE 15° about X (plane thru top ctr)', topCtr, topCtr, nrm)
}

// --- C) ROTATED 30° about X, plane thru top center ---
{
  const t = 30 * Math.PI / 180
  const nrm = [0, -Math.sin(t), Math.cos(t)]
  tryReplace('C) ROTATE 30° about X', topCtr, topCtr, nrm)
}

// --- D) ROTATED 15° about Y ---
{
  const t = 15 * Math.PI / 180
  const nrm = [Math.sin(t), 0, Math.cos(t)]
  tryReplace('D) ROTATE 15° about Y', topCtr, topCtr, nrm)
}

// --- E) ROTATE about a hinge EDGE (front top edge), not center — like a real "hinge" rotate ---
{
  const t = 15 * Math.PI / 180
  const nrm = [0, -Math.sin(t), Math.cos(t)]
  const ymin = bb[0][1]
  // hinge on front-top edge: plane passes through (0, ymin, zmax)
  tryReplace('E) ROTATE 15°/X hinge on front-top edge', topCtr, [0, ymin, zmax], nrm)
}

const passed = rows.filter(r => r.pass).length
console.log(`\n==== ${passed}/${rows.length} PASS ====`)
process.exit(0)
