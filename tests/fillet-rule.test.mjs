// Fusion Rule Fillet kernel regression: All Edges and Between Faces/Features.
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox, cast } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const key = (e) => {
  const q = (p) => [p.x, p.y, p.z].map((v) => Math.round(v * 1e5)).join(',')
  const a = q(e.pointAt(0)), b = q(e.pointAt(1)), m = q(e.pointAt(0.5))
  return `${[a, b].sort().join('|')}|${m}`
}
const build = (shape, edges, radius) => {
  const filShape = (OC.ChFi3d_FilletShape && (OC.ChFi3d_FilletShape.ChFi3d_Rational ?? 0)) ?? 0
  let mk = null
  for (const name of ['BRepFilletAPI_MakeFillet_2', 'BRepFilletAPI_MakeFillet_1', 'BRepFilletAPI_MakeFillet']) {
    const C = OC[name]; if (!C) continue
    try { mk = new C(shape.wrapped, filShape); break } catch { try { mk = new C(shape.wrapped); break } catch {} }
  }
  if (!mk) throw new Error('no fillet constructor')
  for (const e of edges) mk.Add_2(radius, e.wrapped)
  try { mk.Build(new OC.Message_ProgressRange_1()) } catch { mk.Build() }
  if (!mk.IsDone()) throw new Error(`rule fillet failed for ${edges.length} edges`)
  return cast(mk.Shape())
}

{
  const box = makeBaseBox(40, 30, 20)
  const top = box.faces.reduce((a, f) => f.center.z > a.center.z ? f : a)
  const all = build(box, top.edges, 2)
  if (top.edges.length !== 4 || all.faces.length <= box.faces.length) throw new Error('All Edges rule did not fillet the selected face boundary')
  console.log(`PASS Rule All Edges: selected face ${top.edges.length} boundary edges → ${all.faces.length} faces`)
}

{
  const box = makeBaseBox(40, 30, 20)
  const top = box.faces.reduce((a, f) => f.center.z > a.center.z ? f : a)
  const side = box.faces.filter((f) => Math.abs(f.center.z - top.center.z) > 1).reduce((a, f) => f.center.x > a.center.x ? f : a)
  const sideKeys = new Set(side.edges.map(key))
  const shared = top.edges.filter((e) => sideKeys.has(key(e)))
  if (shared.length !== 1) throw new Error(`Between rule expected one shared edge, got ${shared.length}`)
  const between = build(box, shared, 3)
  if (between.faces.length <= box.faces.length) throw new Error('Between Faces rule did not fillet the common edge')
  console.log(`PASS Rule Between Faces: ${shared.length} common edge → ${between.faces.length} faces`)
}
