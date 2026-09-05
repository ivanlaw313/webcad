// 最终表征：nbIter=1（甜蜜点）跨 3 案例 + 模拟 worker 理智闸，确认 cad2 实际行为。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const replicad = await import('replicad')
const { setOC, draw, makeBaseBox } = replicad
const { default: opencascade } = await import('../_occt-build/_rebuilt/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../_occt-build/_rebuilt/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath }); setOC(OC)
const C0=OC.GeomAbs_Shape.GeomAbs_C0, G1=OC.GeomAbs_Shape.GeomAbs_G1
function bnds(shp){ const bb=new OC.Bnd_Box_1(); OC.BRepBndLib.Add(shp,bb,false); const lo=bb.CornerMin(),hi=bb.CornerMax(); return [[lo.X(),lo.Y(),lo.Z()],[hi.X(),hi.Y(),hi.Z()]] }
function ext(b,i){ return b[1][i]-b[0][i] }
// 模拟 worker 理智闸：真 G1 结果 bbox 各维 ≤ MakeFilling 参考 + refDiag*0.6 + 1
function gate(g1shp, mfshp){
  const a=bnds(g1shp), b=bnds(mfshp)
  const refDiag=Math.hypot(ext(b,0),ext(b,1),ext(b,2))||1
  return [0,1,2].every(i=>Number.isFinite(a[0][i])&&Number.isFinite(a[1][i])&&ext(a,i)<=ext(b,i)+refDiag*0.6+1)
}
function topEdgesFaces(topF, F){
  const te=topF.edges
  const sf=te.map(e=>{const em=e.pointAt(0.5); return F.find(f=>f!==topF&&(()=>{try{for(const fe of f.edges){const m=fe.pointAt(0.5); if(Math.hypot(m.x-em.x,m.y-em.y,m.z-em.z)<1e-6)return true}}catch{}return false})())})
  return {edgeW:te.map(e=>e.wrapped), faceW:sf.map(f=>f&&f.wrapped?f.wrapped:null)}
}
function makeFill(edgeW, faceW){
  const fill=new OC.BRepOffsetAPI_MakeFilling(3,15,2,false,1e-5,1e-4,1e-2,0.1,8,9)
  for(let i=0;i<edgeW.length;i++){ const f=faceW[i]; if(f) fill.Add_2(edgeW[i],f,G1,true); else fill.Add_1(edgeW[i],C0,true) }
  fill.Build(new OC.Message_ProgressRange_1())
  return fill.IsDone()?fill.Shape():null
}
function run(name, topZ, F, expect){
  const topF=F.find(f=>{try{return Math.abs(f.center.z-topZ)<0.6}catch{return false}})
  const {edgeW,faceW}=topEdgesFaces(topF,F)
  const g1=OC.PlateWrapper.BridgeG1(edgeW,faceW,true,3,15,1,1e-4,1e-2)  // nbIter=1
  const mf=makeFill(edgeW,faceW)
  if(g1.IsNull()||!mf){ console.log(`[${name}] G1或MF null`); return }
  const a=bnds(g1); const dome=a[1][2]-topZ; const passed=gate(g1,mf)
  console.log(`[${name}] 拱=${dome.toFixed(2)}mm x跨=${ext(a,0).toFixed(0)} z跨=${ext(a,2).toFixed(1)} → 理智闸:${passed?'✓收货(真G1)':'✗退回MakeFilling'}  期望:${expect}`)
}
// 1) 缓喇叭（真实用途：补缓面窿）— 期望真 G1
{ const b=draw().movePointerTo([-100,-100]).lineTo([100,-100]).lineTo([100,100]).lineTo([-100,100]).close().sketchOnPlane('XY',0)
  const t=draw().movePointerTo([-15,-15]).lineTo([15,-15]).lineTo([15,15]).lineTo([-15,15]).close().sketchOnPlane('XY',8)
  run('缓喇叭5°', 8, b.loftWith(t,{ruled:true}).faces, '真G1细拱') }
// 2) 陡锥（病态）— 期望退回
{ const b=draw().movePointerTo([-30,-30]).lineTo([30,-30]).lineTo([30,30]).lineTo([-30,30]).close().sketchOnPlane('XY',0)
  const t=draw().movePointerTo([-15,-15]).lineTo([15,-15]).lineTo([15,15]).lineTo([-15,15]).close().sketchOnPlane('XY',25)
  run('陡锥59°', 25, b.loftWith(t,{ruled:true}).faces, '退回(病态)') }
// 3) box 顶（垂直壁，无解）— 期望退回或平
{ run('box垂直', 20, makeBaseBox(40,40,20).faces, '平/退回') }
try{ makeBaseBox(3,3,3); console.log('kernel ALIVE') }catch{ console.log('kernel DEAD') }
