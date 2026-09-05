// 零 rebuild 实验：调 BRepOffsetAPI_MakeFilling 的 G1 参数，看能否在锥台顶盖得【有界合理拱】。
// MakeFilling 内部 BRepFill_Filling 条件性比 raw GeomPlate 稳健。若得，#15 两边受惠、零内核。
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
function span(shp){ const bb=new OC.Bnd_Box_1(); OC.BRepBndLib.Add(shp,bb,false); const lo=bb.CornerMin(),hi=bb.CornerMax(); return {zmin:lo.Z(),zmax:hi.Z(),zr:hi.Z()-lo.Z(),xr:hi.X()-lo.X()} }

const bottom=draw().movePointerTo([-30,-30]).lineTo([30,-30]).lineTo([30,30]).lineTo([-30,30]).close().sketchOnPlane('XY',0)
const topS=draw().movePointerTo([-15,-15]).lineTo([15,-15]).lineTo([15,15]).lineTo([-15,15]).close().sketchOnPlane('XY',25)
const fr=bottom.loftWith(topS,{ruled:true}); const F=fr.faces
const top=F.find(f=>{try{return Math.abs(f.center.z-25)<0.6}catch{return false}})
const te=top.edges
const sf=te.map(e=>{const em=e.pointAt(0.5); return F.find(f=>f!==top&&(()=>{try{for(const fe of f.edges){const m=fe.pointAt(0.5); if(Math.hypot(m.x-em.x,m.y-em.y,m.z-em.z)<1e-6)return true}}catch{}return false})())})
console.log('顶边',te.length,'邻壁',sf.filter(Boolean).length,' 斜壁~59°离水平 → 合理 G1 拱约 +10~25mm, 口=30')
const C0=OC.GeomAbs_Shape.GeomAbs_C0, G1=OC.GeomAbs_Shape.GeomAbs_G1

function tryFill(order, deg, nbIter, tolAng, tolCurv){
  try{
    const fill=new OC.BRepOffsetAPI_MakeFilling(deg,15,nbIter,false,1e-5,1e-4,tolAng,tolCurv,8,9)
    for(let i=0;i<te.length;i++){ const f=sf[i]; if(order===G1&&f&&f.wrapped) fill.Add_2(te[i].wrapped,f.wrapped,G1,true); else fill.Add_1(te[i].wrapped,C0,true) }
    fill.Build(new OC.Message_ProgressRange_1())
    if(!fill.IsDone()) return 'notDone'
    const sh=fill.Shape(); if(!sh||sh.IsNull()) return 'null'
    return span(sh)
  }catch(e){ return 'THROW:'+(e&&e.message||e) }
}
// C0 基准
const c0=tryFill(C0,3,2,1e-2,0.1)
console.log('C0 基准:', typeof c0==='string'?c0:`拱=${(c0.zmax-25).toFixed(1)} z跨=${c0.zr.toFixed(1)} x跨=${c0.xr.toFixed(0)}`)
console.log('--- G1 调参 ---')
for(const deg of [3]) for(const it of [2,4,8]) for(const ta of [1e-2,1e-3]) for(const tc of [0.1,0.01]){
  const r=tryFill(G1,deg,it,ta,tc)
  if(typeof r==='string'){ console.log(`G1 deg${deg} it${it} ta${ta} tc${tc}: ${r}`); continue }
  const dome=r.zmax-25
  const good = r.xr<45&&r.xr>20&&r.zr<40&&dome>3&&dome<40
  console.log(`G1 deg${deg} it${it} ta${ta} tc${tc}: 拱=${dome.toFixed(1)} z跨=${r.zr.toFixed(1)} x跨=${r.xr.toFixed(0)} ${good?'★有界合理拱':(r.xr<45&&r.zr<40?'~有界(拱小/大)':'✗爆')}`)
}
