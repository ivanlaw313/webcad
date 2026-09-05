// 良置 G1 测试：截头锥（4 斜壁 + 方顶口）。斜壁切线是缓续（非 90°）。
// G1 顶盖必须沿斜度起翹拱起 → bbox z跨度 > 0；C0 平盖停在顶 z → z跨度 = 0。
// 用现核（未 rebuild）验证 G1 数学本身是否生效，再决定投不投资裁剪修复。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const replicad = await import('replicad')
const { setOC, draw } = replicad
const { default: opencascade } = await import('../_occt-build/_rebuilt/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../_occt-build/_rebuilt/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)

// 截头锥：底大方 60、顶小方 30、高 25 → 侧壁向内斜 ~31°（缓续，良置）
const bottom = draw().movePointerTo([-30,-30]).lineTo([30,-30]).lineTo([30,30]).lineTo([-30,30]).close().sketchOnPlane('XY', 0)
const top = draw().movePointerTo([-15,-15]).lineTo([15,-15]).lineTo([15,15]).lineTo([-15,15]).close().sketchOnPlane('XY', 25)
let frustum
try { frustum = bottom.loftWith(top, { ruled: true }) } catch(e){ console.log('loft FAIL', e&&e.message); process.exit(1) }
const faces = frustum.faces
const topF = faces.find(f => { try { return Math.abs(f.center.z - 25) < 0.6 } catch { return false } })
console.log('faces', faces.length, 'topFace?', !!topF)
if (!topF) process.exit(1)
const topEdges = topF.edges
// 每条顶边相邻的斜侧壁
const side = topEdges.map(e => {
  const em = e.pointAt(0.5)
  return faces.find(f => f !== topF && (() => { try { for (const fe of f.edges){ const m = fe.pointAt(0.5); if (Math.hypot(m.x-em.x,m.y-em.y,m.z-em.z) < 1e-6) return true } } catch{} return false })())
})
console.log('topEdges', topEdges.length, 'sides resolved', side.filter(Boolean).length)
const edgeW = topEdges.map(e => e.wrapped)
const faceW = side.map(f => f && f.wrapped ? f.wrapped : null)

function zSpan(shp){ const bb=new OC.Bnd_Box_1(); OC.BRepBndLib.Add(shp,bb,false); const lo=bb.CornerMin(),hi=bb.CornerMax(); return {zmin:lo.Z(),zmax:hi.Z(),zr:hi.Z()-lo.Z(),xr:hi.X()-lo.X()} }

// G1 真切
const g1 = OC.PlateWrapper.BridgeG1(edgeW, faceW, true, 3, 15, 3, 1e-4, 1e-2)
console.log('G1 IsNull?', g1.IsNull ? g1.IsNull() : g1)
if (g1.IsNull && !g1.IsNull()){ const s=zSpan(g1); console.log(`  G1 顶盖: z ${s.zmin.toFixed(2)}→${s.zmax.toFixed(2)}  z跨度=${s.zr.toFixed(3)}  x跨度=${s.xr.toFixed(1)} (顶口方边=30)`); console.log(`  zmax-25 = ${(s.zmax-25).toFixed(3)}mm 起翹（>0.5 ⇒ 沿斜壁相切拱起 = G1 数学生效）`) }
// C0 对照
const c0 = OC.PlateWrapper.BridgeG1(edgeW, faceW, false, 3, 15, 3, 1e-4, 1e-2)
if (c0.IsNull && !c0.IsNull()){ const s=zSpan(c0); console.log(`  C0 对照: z跨度=${s.zr.toFixed(3)}（应≈0 平盖）`) }
