// Fusion Fillet continuity probe: both G1 and G2 must build through BRepFilletAPI_MakeFillet,
// and G2 must be passed to SetContinuity rather than being relabelled default geometry.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox, cast } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const make = (continuity) => {
  const box = makeBaseBox(40, 30, 20)
  const edge = box.edges.find((e) => Math.abs(e.length - 40) < 0.1) ?? box.edges[0]
  const filShape = (OC.ChFi3d_FilletShape && (OC.ChFi3d_FilletShape.ChFi3d_Rational ?? 0)) ?? 0
  let mk = null
  for (const name of ['BRepFilletAPI_MakeFillet_2', 'BRepFilletAPI_MakeFillet_1', 'BRepFilletAPI_MakeFillet']) {
    const C = OC[name]; if (!C) continue
    try { mk = new C(box.wrapped, filShape); break } catch { try { mk = new C(box.wrapped); break } catch {} }
  }
  if (!mk) throw new Error(`${continuity}: no fillet constructor`)
  const enumValue = OC.GeomAbs_Shape[`GeomAbs_${continuity}`]
  if (enumValue == null || typeof mk.SetContinuity !== 'function') throw new Error(`${continuity}: SetContinuity unavailable`)
  mk.SetContinuity(enumValue, 1e-3)
  mk.Add_2(3, edge.wrapped)
  try { mk.Build(new OC.Message_ProgressRange_1()) } catch { mk.Build() }
  if (!mk.IsDone()) throw new Error(`${continuity}: build failed`)
  const out = cast(mk.Shape())
  const b = out.boundingBox.bounds
  if (!b.flat().every(Number.isFinite)) throw new Error(`${continuity}: invalid bounds`)
  return { faces: out.faces.length, edges: out.edges.length, bounds: b }
}

for (const continuity of ['G1', 'G2']) {
  const out = make(continuity)
  console.log(`PASS ${continuity}: ${out.faces} faces, ${out.edges} edges`)
}

// Mixed radius-group path mirrors the worker: solve one G1 group, then resolve the untouched second
// edge on the evolving B-rep and solve that group with G2. Both remain part of one logical feature.
const buildOne = (shape, near, continuity, radius) => {
  let edge = null, best = Infinity
  for (const e of shape.edges) {
    const q = e.pointAt(0.5)
    const d = (q.x - near[0]) ** 2 + (q.y - near[1]) ** 2 + (q.z - near[2]) ** 2
    if (d < best) { best = d; edge = e }
  }
  if (!edge) throw new Error(`${continuity}: selected edge disappeared`)
  const filShape = (OC.ChFi3d_FilletShape && (OC.ChFi3d_FilletShape.ChFi3d_Rational ?? 0)) ?? 0
  let mk = null
  for (const name of ['BRepFilletAPI_MakeFillet_2', 'BRepFilletAPI_MakeFillet_1', 'BRepFilletAPI_MakeFillet']) {
    const C = OC[name]; if (!C) continue
    try { mk = new C(shape.wrapped, filShape); break } catch { try { mk = new C(shape.wrapped); break } catch {} }
  }
  if (!mk) throw new Error(`${continuity}: no mixed-group constructor`)
  mk.SetContinuity(OC.GeomAbs_Shape[`GeomAbs_${continuity}`], 1e-3)
  mk.Add_2(radius, edge.wrapped)
  try { mk.Build(new OC.Message_ProgressRange_1()) } catch { mk.Build() }
  if (!mk.IsDone()) throw new Error(`${continuity}: mixed-group build failed`)
  return cast(mk.Shape())
}

{
  const base = makeBaseBox(40, 30, 20)
  const e0 = base.edges[0], m0 = e0.pointAt(0.5)
  let e1 = base.edges[1], far = -1
  for (const e of base.edges) {
    const q = e.pointAt(0.5), d = (q.x - m0.x) ** 2 + (q.y - m0.y) ** 2 + (q.z - m0.z) ** 2
    if (d > far) { far = d; e1 = e }
  }
  const m1 = e1.pointAt(0.5)
  const g1 = buildOne(base, [m0.x, m0.y, m0.z], 'G1', 2)
  const mixed = buildOne(g1, [m1.x, m1.y, m1.z], 'G2', 4)
  const b = mixed.boundingBox.bounds
  if (!b.flat().every(Number.isFinite) || mixed.faces.length <= base.faces.length) throw new Error('mixed G1/G2 radius groups produced invalid geometry')
  console.log(`PASS mixed radius groups: G1 R2 + G2 R4 → ${mixed.faces.length} faces, ${mixed.edges.length} edges`)
}
