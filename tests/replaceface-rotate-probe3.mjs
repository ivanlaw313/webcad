// probe3 — 究竟能唔能得到「保留大body、顶面绕远边 hinge 倾 15°」嘅 Fusion 语义？
// 关键：ReplaceFaceNear 保留 pick-point 嗰侧。若 hinge 喺远边、plane 微微向下倾、
// pick 点喺实体主体内 → 应保留大 body（顶面变斜）。测下。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)
const W = OC.DirectEditWrapper
function vol(s) { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(s, g, false, false, false); return g.Mass() } catch { return NaN } }
function nf(s) { try { let n = 0; const e = new OC.TopExp_Explorer_2(s, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; e.More(); e.Next()) n++; return n } catch { return -1 } }
function excMsg(e) { if (typeof e !== 'number') return e?.message || String(e); try { return OC.getExceptionMessage ? OC.getExceptionMessage(e) : 'C++#' + e } catch { return 'C++#' + e } }
const box = makeBaseBox(40, 40, 40)
const bb = box.boundingBox.bounds
const zmax = bb[1][2], ymin = bb[0][1], ymax = bb[1][1]
function run(label, pick, org, nrm) {
  try {
    const r = W.ReplaceFaceNear(box.wrapped, ...pick, ...org, ...nrm)
    if (!r || r.IsNull()) { console.log(`  NULL   ${label}`); return }
    let zlo = 1e9, zhi = -1e9
    const ex = new OC.TopExp_Explorer_2(r, OC.TopAbs_ShapeEnum.TopAbs_VERTEX, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
    for (; ex.More(); ex.Next()) { const p = OC.BRep_Tool.Pnt(OC.TopoDS.Vertex_1(ex.Current())); zlo = Math.min(zlo, p.Z()); zhi = Math.max(zhi, p.Z()) }
    console.log(`  vol=${vol(r).toFixed(0).padStart(6)} faces=${nf(r)} zrange=[${zlo.toFixed(1)},${zhi.toFixed(1)}]  ${label}`)
  } catch (e) { console.log(`  ABORT  ${label} :: ${excMsg(e)}`) }
}
console.log('box vol 64000. Goal: keep LARGE body, top face tilted, hinge on FAR (ymax) edge.')
// Hinge on far edge (y=ymax). Tilt plane so it dips DOWN toward ymin. Pick a point INSIDE the main body
// near the near edge but LOWER, so the kept side is the big body.
{
  const t = 15 * Math.PI / 180
  // plane thru far-top edge (0,ymax,zmax), normal tilted so near side goes down.
  // normal that points "up and toward +y": (0, sin, cos) => plane dips down as y decreases.
  const nrm = [0, Math.sin(t), Math.cos(t)]
  run('hinge@ymax, n=(0,+sin,cos), pick topCtr', [0, 0, zmax], [0, ymax, zmax], nrm)
  run('hinge@ymax, n=(0,+sin,cos), pick body-interior (0,0,zmax-1)', [0, 0, zmax - 1], [0, ymax, zmax], nrm)
  run('hinge@ymax, n=(0,-sin,-cos) flipped, pick topCtr', [0, 0, zmax], [0, ymax, zmax], [0, -Math.sin(t), -Math.cos(t)])
}
// The "expected" tilted-top big body: hinge at far edge, near edge (ymin) drops by e.g. 10.7mm (=40*tan15).
// Ideal kept volume = box - triangular wedge = 64000 - 0.5*40(dy)*10.7(dz)*40(dx) ... let's just see max vol achievable.
process.exit(0)
