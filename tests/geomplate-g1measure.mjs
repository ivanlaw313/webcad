// 量化实证：GeomPlate BridgeG1 真 G1 相切 vs MakeFilling 假 G1（C0 平盖）。
// 取 40×40×20 box 顶面 4 边 + 相邻【垂直】侧面。G1 相切封盖必须在边界处竖直起翹（切平面=侧壁）→ 面拱出顶平面 z=20。
// 平 C0 盖停在 z=20（z 跨度≈0）。量 BridgeG1 结果 bbox 的 z 跨度 → >阈值即证真切。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../_occt-build/_rebuilt/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../_occt-build/_rebuilt/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)

const box = makeBaseBox(40, 40, 20)
const faces = box.faces
const top = faces.find(f => { try { return Math.abs(f.center.z - 20) < 0.5 } catch { return false } })
const topEdges = top.edges
const adjFaces = topEdges.map(e => {
  const em = e.pointAt(0.5)
  return faces.find(f => f !== top && (() => { try { for (const fe of f.edges) { const m = fe.pointAt(0.5); if (Math.hypot(m.x-em.x,m.y-em.y,m.z-em.z) < 1e-6) return true } } catch{} return false })())
})
const edgeW = topEdges.map(e => e.wrapped)
const faceW = adjFaces.map(f => f && f.wrapped ? f.wrapped : null)

// bbox z 跨度量测器（用 Bnd_Box + BRepBndLib）
function zSpan(shp) {
  const bb = new OC.Bnd_Box_1()
  OC.BRepBndLib.Add(shp, bb, false)
  // Bnd_Box.Get 出参难绑 → 用 CornerMin/CornerMax（返 gp_Pnt）
  const lo = bb.CornerMin(), hi = bb.CornerMax()
  return { zmin: lo.Z(), zmax: hi.Z(), zrange: hi.Z() - lo.Z(), xrange: hi.X()-lo.X(), yrange: hi.Y()-lo.Y() }
}

// 1) 真 G1
const g1 = OC.PlateWrapper.BridgeG1(edgeW, faceW, true, 3, 15, 2, 1e-4, 1e-2)
console.log('BridgeG1 IsNull?', g1.IsNull())
if (!g1.IsNull()) {
  const s = zSpan(g1)
  console.log('  真 G1 bbox: z', s.zmin.toFixed(3), '→', s.zmax.toFixed(3), ' z跨度=', s.zrange.toFixed(3), ' (xy跨度', s.xrange.toFixed(1), s.yrange.toFixed(1), ')')
  console.log('  顶面平面 z=20；zmax-20 =', (s.zmax-20).toFixed(3), 'mm 起翹（>1mm ⇒ 边界竖直相切→真 G1 拱盖，非平 C0）')
}
