// 缓切线（well-conditioned）案例：浅喇叭锥，壁~5.4°离水平（近水平）。这是 tangent-fill 真实用途
// （补缓曲面板的窿）。G1 应出细有界拱(~1~4mm)且随迭代【收敛】(非发散)。用种子核 + worker 参数。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const replicad = await import('replicad')
const { setOC, draw } = replicad
const { default: opencascade } = await import('../_occt-build/_rebuilt/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../_occt-build/_rebuilt/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath }); setOC(OC)
function span(shp){ const bb=new OC.Bnd_Box_1(); OC.BRepBndLib.Add(shp,bb,false); const lo=bb.CornerMin(),hi=bb.CornerMax(); return {zmin:lo.Z(),zmax:hi.Z(),zr:hi.Z()-lo.Z(),xr:hi.X()-lo.X()} }

// 浅喇叭：底 200 顶 30 高 8 → 壁 atan(8/85)=5.4°离水平（近平）
const bottom=draw().movePointerTo([-100,-100]).lineTo([100,-100]).lineTo([100,100]).lineTo([-100,100]).close().sketchOnPlane('XY',0)
const topS=draw().movePointerTo([-15,-15]).lineTo([15,-15]).lineTo([15,15]).lineTo([-15,15]).close().sketchOnPlane('XY',8)
const fr=bottom.loftWith(topS,{ruled:true}); const F=fr.faces
const top=F.find(f=>{try{return Math.abs(f.center.z-8)<0.4}catch{return false}})
const te=top.edges
const sf=te.map(e=>{const em=e.pointAt(0.5); return F.find(f=>f!==top&&(()=>{try{for(const fe of f.edges){const m=fe.pointAt(0.5); if(Math.hypot(m.x-em.x,m.y-em.y,m.z-em.z)<1e-6)return true}}catch{}return false})())})
console.log('浅喇叭顶口=30, 壁5.4°离水平; 期望 G1 细拱~+1~4mm 且随迭代收敛')
const edgeW=te.map(e=>e.wrapped), faceW=sf.map(f=>f&&f.wrapped?f.wrapped:null)

// raw GeomPlate wrapper（种子核），扫 nbIter 看收敛/发散
console.log('--- raw GeomPlate BridgeG1（种子核）---')
for(const it of [1,2,3,5]){
  const r=OC.PlateWrapper.BridgeG1(edgeW,faceW,true,3,15,it,1e-4,1e-2)
  if(r.IsNull()){ console.log(`nbIter${it}: NULL`); continue }
  const s=span(r); const dome=s.zmax-8
  console.log(`nbIter${it}: 拱=${dome.toFixed(2)} z跨=${s.zr.toFixed(2)} x跨=${s.xr.toFixed(0)} ${s.xr<45&&s.xr>20&&Math.abs(dome)<8?'✓有界':'✗爆'}`)
}
// MakeFilling G1 对照
console.log('--- MakeFilling G1 ---')
const C0=OC.GeomAbs_Shape.GeomAbs_C0, G1=OC.GeomAbs_Shape.GeomAbs_G1
for(const it of [1,2,4]){
  try{
    const fill=new OC.BRepOffsetAPI_MakeFilling(3,15,it,false,1e-5,1e-4,1e-2,0.1,8,9)
    for(let i=0;i<te.length;i++){ const f=sf[i]; if(f&&f.wrapped) fill.Add_2(te[i].wrapped,f.wrapped,G1,true); else fill.Add_1(te[i].wrapped,C0,true) }
    fill.Build(new OC.Message_ProgressRange_1())
    if(!fill.IsDone()){ console.log(`MF it${it}: notDone`); continue }
    const s=span(fill.Shape()); const dome=s.zmax-8
    console.log(`MF it${it}: 拱=${dome.toFixed(2)} z跨=${s.zr.toFixed(2)} x跨=${s.xr.toFixed(0)} ${s.xr<45&&Math.abs(dome)<8?'✓有界':'✗爆'}`)
  }catch(e){ console.log(`MF it${it}: THROW ${e&&e.message}`) }
}
