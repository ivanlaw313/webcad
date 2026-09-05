// Rebuild 后验证：LoadInitSurface 种子面是否修好过冲。用 worker 实际参数 (true,3,15,3,1e-4,1e-2)。
// 判据：box 顶盖 + 锥台顶盖 都要【有界】(x跨度≈边界尺寸, z不爆) 且过冲/拱起合理(<25mm)。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const replicad = await import('replicad')
const { setOC, draw, makeBaseBox } = replicad
const { default: opencascade } = await import('../_occt-build/_rebuilt/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../_occt-build/_rebuilt/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)
function span(shp){ const bb=new OC.Bnd_Box_1(); OC.BRepBndLib.Add(shp,bb,false); const lo=bb.CornerMin(),hi=bb.CornerMax(); return {zmin:lo.Z(),zmax:hi.Z(),zr:hi.Z()-lo.Z(),xr:hi.X()-lo.X(),yr:hi.Y()-lo.Y()} }
function edgesFaces(topF, allFaces){
  const te = topF.edges
  const sf = te.map(e => { const em=e.pointAt(0.5); return allFaces.find(f=>f!==topF && (()=>{try{for(const fe of f.edges){const m=fe.pointAt(0.5); if(Math.hypot(m.x-em.x,m.y-em.y,m.z-em.z)<1e-6)return true}}catch{}return false})()) })
  return { edgeW: te.map(e=>e.wrapped), faceW: sf.map(f=>f&&f.wrapped?f.wrapped:null), n: te.length }
}
const P = (g1)=>[g1, 3, 15, 3, 1e-4, 1e-2]  // worker 参数

// A) box 40³ 顶盖（顶边 z=20，垂直壁）— 病态：切 90° 壁
{
  const box = makeBaseBox(40,40,20); const F=box.faces
  const top=F.find(f=>{try{return Math.abs(f.center.z-20)<0.5}catch{return false}})
  const {edgeW,faceW,n}=edgesFaces(top,F)
  const r=OC.PlateWrapper.BridgeG1(edgeW,faceW,...P(true))
  const s=r.IsNull()?null:span(r)
  console.log(`[box] edges=${n} G1 ${r.IsNull()?'NULL':''}`, s?`z[${s.zmin.toFixed(1)},${s.zmax.toFixed(1)}] z跨=${s.zr.toFixed(1)} xy跨=${s.xr.toFixed(0)}×${s.yr.toFixed(0)} (口=40)`:'', s?(s.xr<70&&s.zr<40?'✓有界':'✗超大/爆'):'')
}
// B) 锥台顶盖（顶口方 30，斜壁 ~31°）— 良置
{
  const bottom=draw().movePointerTo([-30,-30]).lineTo([30,-30]).lineTo([30,30]).lineTo([-30,30]).close().sketchOnPlane('XY',0)
  const topS=draw().movePointerTo([-15,-15]).lineTo([15,-15]).lineTo([15,15]).lineTo([-15,15]).close().sketchOnPlane('XY',25)
  const fr=bottom.loftWith(topS,{ruled:true}); const F=fr.faces
  const top=F.find(f=>{try{return Math.abs(f.center.z-25)<0.6}catch{return false}})
  const {edgeW,faceW,n}=edgesFaces(top,F)
  const r=OC.PlateWrapper.BridgeG1(edgeW,faceW,...P(true))
  const s=r.IsNull()?null:span(r)
  const dome=s?s.zmax-25:0
  console.log(`[锥台] edges=${n} G1 ${r.IsNull()?'NULL':''}`, s?`z[${s.zmin.toFixed(1)},${s.zmax.toFixed(1)}] z跨=${s.zr.toFixed(1)} xy跨=${s.xr.toFixed(0)}×${s.yr.toFixed(0)} 拱=${dome.toFixed(1)} (口=30)`:'', s?(s.xr<45&&s.xr>20&&s.zr<25?'✓★有界缓拱':'✗超大/爆冲'):'')
  const c0=OC.PlateWrapper.BridgeG1(edgeW,faceW,...P(false)); const cs=c0.IsNull()?null:span(c0)
  console.log(`[锥台] C0 对照 z跨=${cs?cs.zr.toFixed(1):'null'} xy跨=${cs?cs.xr.toFixed(0):''}`)
}
// kernel 存活
try{ const b=makeBaseBox(5,5,5); console.log('kernel ALIVE:', !!b) }catch(e){ console.log('kernel DEAD', e&&e.message) }
