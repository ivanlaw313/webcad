// 参数扫描（无需 rebuild — wrapper 已参数化）：找能产出【有界缓拱】的 tolAng/nbIter/degree。
// 良置锥顶盖：好 G1 应沿 31° 斜壁适度拱起（zmax-25 约 +5~15mm），而非过冲 ±100mm。
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

const bottom = draw().movePointerTo([-30,-30]).lineTo([30,-30]).lineTo([30,30]).lineTo([-30,30]).close().sketchOnPlane('XY', 0)
const top = draw().movePointerTo([-15,-15]).lineTo([15,-15]).lineTo([15,15]).lineTo([-15,15]).close().sketchOnPlane('XY', 25)
const frustum = bottom.loftWith(top, { ruled: true })
const faces = frustum.faces
const topF = faces.find(f => { try { return Math.abs(f.center.z - 25) < 0.6 } catch { return false } })
const topEdges = topF.edges
const side = topEdges.map(e => { const em = e.pointAt(0.5); return faces.find(f => f !== topF && (() => { try { for (const fe of f.edges){ const m = fe.pointAt(0.5); if (Math.hypot(m.x-em.x,m.y-em.y,m.z-em.z) < 1e-6) return true } } catch{} return false })()) })
const edgeW = topEdges.map(e => e.wrapped)
const faceW = side.map(f => f && f.wrapped ? f.wrapped : null)
function span(shp){ const bb=new OC.Bnd_Box_1(); OC.BRepBndLib.Add(shp,bb,false); const lo=bb.CornerMin(),hi=bb.CornerMax(); return {zr:hi.Z()-lo.Z(),zmax:hi.Z(),xr:hi.X()-lo.X()} }

// C0 参考包络
const c0 = OC.PlateWrapper.BridgeG1(edgeW, faceW, false, 3, 15, 3, 1e-4, 1e-2)
const c0s = c0.IsNull()? null : span(c0)
console.log('C0 参考: z跨度', c0s?c0s.zr.toFixed(2):'null', ' x跨度', c0s?c0s.xr.toFixed(1):'')
console.log('目标：有界缓拱 zmax-25 约 +2~20mm, x跨度≈30. 过冲/发散=坏\n')

const degs=[2,3], iters=[2,3,6], angs=[1e-2,5e-2,1.5e-1,3e-1,6e-1], pts=[10,20]
for (const d of degs) for (const it of iters) for (const ta of angs) for (const np of pts){
  let r; try { r = OC.PlateWrapper.BridgeG1(edgeW, faceW, true, d, np, it, 1e-4, ta) } catch(e){ console.log(`deg${d} it${it} ang${ta} np${np}: THROW`); continue }
  if (!r || r.IsNull()){ console.log(`deg${d} it${it} ang${ta} np${np}: NULL`); continue }
  const s = span(r)
  const dome = s.zmax-25
  const bounded = s.zr < 40 && s.xr < 45 && s.xr > 20
  const tag = bounded && dome > 1 && dome < 25 ? '  ★★ 有界缓拱' : (bounded ? '  ~有界' : '  ✗过冲')
  console.log(`deg${d} it${it} ang${ta.toFixed(3)} np${np}: z跨度=${s.zr.toFixed(1)} 拱=${dome.toFixed(1)} x跨度=${s.xr.toFixed(1)}${tag}`)
}
