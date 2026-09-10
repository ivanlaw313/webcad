import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts'),{hitTest,refPts}=await import('../src/sketch/freesolve.ts'),{ellipseArcWithSweep,ellipseArcSample}=await import('../src/sketch/ellipseArcGeometry.ts'),{importSTEP,measureVolume,getOC}=await import('replicad')
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),all=()=>[...useApp.getState().sketchProfiles,...(useApp.getState().sketchShape?[useApp.getState().sketchShape]:[])]
const area=(rx,ry,sweep)=>{const t=sweep*Math.PI/180;return rx*ry*Math.abs(t-Math.sin(t))/2}
const independentPoint=(e,tDeg)=>{const a=e.rot*Math.PI/180,t=tDeg*Math.PI/180;return[e.cx+e.rx*Math.cos(t)*Math.cos(a)-e.ry*Math.sin(t)*Math.sin(a),e.cy+e.rx*Math.cos(t)*Math.sin(a)+e.ry*Math.sin(t)*Math.cos(a)]}
async function volume(expected,e,plane){const sh=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}const v=measureVolume(sh);assert.ok(Math.abs(v-expected)<Math.max(1e-5,Math.abs(expected)*5e-8),`${v} != ${expected}`);if(e&&plane){const r=e.rot*Math.PI/180,candidates=[e.a0,e.a0+e.signedSweepDeg],x=Math.atan2(-e.ry*Math.sin(r),e.rx*Math.cos(r))*180/Math.PI,y=Math.atan2(e.ry*Math.cos(r),e.rx*Math.sin(r))*180/Math.PI;for(const t of [x,x+180,y,y+180]){const delta=e.signedSweepDeg>0?((t-e.a0)%360+360)%360:((e.a0-t)%360+360)%360;if(delta<=Math.abs(e.signedSweepDeg)+1e-9)candidates.push(t)}const sourcePoints=candidates.map(t=>independentPoint(e,t)),ps=[...sourcePoints,...sourcePoints.map(p=>[140-p[0],p[1]])],bounds=sh.boundingBox.bounds,mapping=plane==='XZ'?[[0,0,1,0],[2,1,1,0]]:plane==='YZ'?[[1,0,-1,0],[2,1,1,0]]:plane==='ARB'?[[1,0,1,20],[2,1,1,30]]:[[0,0,1,0],[1,1,-1,0]];for(const[world,local,sign,offset]of mapping){const values=ps.map(p=>p[local]*sign+offset);assert.ok(Math.abs(bounds[0][world]-Math.min(...values))<1e-5,`${plane} min axis${world}: ${bounds[0][world]} != ${Math.min(...values)}`);assert.ok(Math.abs(bounds[1][world]-Math.max(...values))<1e-5,`${plane} max axis${world}: ${bounds[1][world]} != ${Math.max(...values)}`)}}}

function setup(sweep,plane){
 const e=ellipseArcWithSweep({cx:20,cy:30,rx:10,ry:5,rot:30},330,sweep)
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'mirror',sketchProfiles:[{type:'poly',earc:e,pts:ellipseArcSample(e),open:false},{type:'poly',construction:true,open:true,pts:[[70,0],[70,70]]}],skCons:[
 {id:'center',kind:'con',type:'fix',a:{kind:'ellipse-point',shape:0,idx:0}},
 {id:'minor',kind:'con',type:'fix',a:{kind:'ellipse-point',shape:0,idx:2}},
 {id:'axis',kind:'con',type:'fix',a:{kind:'edge',shape:1,idx:0}},
 {id:'major',kind:'dim',type:'dist',a:{kind:'ellipse-point',shape:0,idx:0},b:{kind:'ellipse-point',shape:0,idx:1},value:10,expr:'10',name:'dMajor',refs:{}}
 ],mirrorPick:{shapes:[0],stage:'line',p1:null},extrudeHeight:5,sketchOp:'new',...(plane==='ARB'?{sketchPlane:'XY',sketchArb:{o:[10,20,30],xd:[0,1,0],n:[1,0,0]}}:{sketchPlane:plane})},true)
}
function check(rx){
 const shapes=all(),es=shapes.filter(s=>s.earc);assert.equal(es.length,2,useApp.getState().status)
 const e=es[0].earc,m=es[1].earc;near(e.cx,20);near(e.cy,30);near(m.cx,120);near(m.cy,30)
 for(const sh of es){near(sh.earc.rx,rx);near(sh.earc.ry,5);sh.pts.forEach((p,i)=>{const q=independentPoint(sh.earc,sh.earc.a0+sh.earc.signedSweepDeg*i/(sh.pts.length-1));near(p[0],q[0]);near(p[1],q[1])})}
 near(m.signedSweepDeg,-e.signedSweepDeg)
 for(let i=0;i<es[0].pts.length;i++){near(es[1].pts[i][0],140-es[0].pts[i][0]);near(es[1].pts[i][1],es[0].pts[i][1])}
 const con=useApp.getState().skCons.find(c=>c.id==='attached');if(con){const p=refPts(shapes,con.a)[0],q=refPts(shapes,con.b)[0];near(p[0],q[0]);near(p[1],q[1])}
 assert.equal(useApp.getState().skConflict,false,useApp.getState().status);return e
}
for(const sweep of [80,-80,270,-270])for(const plane of ['XY','XZ','YZ','ARB'])test(`persistent elliptical arc mirror ${sweep}deg ${plane}: dimensions, endpoint association and native history`,async()=>{
 setup(sweep,plane);await useApp.getState().skMirrorAt([70,30]);const initial=check(10);near(initial.signedSweepDeg,sweep)
 const shapes=all(),mirrorIndex=shapes.findIndex((s,i)=>i>0&&s.earc),end=refPts(shapes,{kind:'ellipse-arc-end',shape:mirrorIndex,idx:1})[0],lineIndex=shapes.length
 useApp.setState({sketchShape:null,sketchProfiles:[...shapes,{type:'poly',open:true,construction:true,pts:[end,[end[0]+20,end[1]+20]]}],skCons:[...useApp.getState().skCons,{id:'attached',kind:'con',type:'coincident',a:{kind:'ellipse-arc-end',shape:mirrorIndex,idx:1},b:{kind:'pt',shape:lineIndex,idx:0}}]})
 await useApp.getState().resolveSk();check(10);await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await volume(2*area(10,5,sweep)*5,initial,plane)
 let f=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(f.id)
 useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id==='major'?{...c,value:12,expr:'12'}:c)});await useApp.getState().resolveSk();const solved=check(12),a=2*area(12,5,solved.signedSweepDeg);await useApp.getState().applySketchEdit(f.sketchId);await volume(a*5,solved,plane)
 if(plane==='XY'){
 await useApp.getState().undo();await volume(2*area(10,5,sweep)*5,initial,plane);await useApp.getState().redo();await volume(a*5,solved,plane)
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await volume(a*8,solved,plane)
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(a*8,solved,plane)
 f=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(f.id);check(12);await useApp.getState().applySketchEdit(f.sketchId);await volume(a*8,solved,plane)
 }
})

test('actual snapped construction-line completion on closed mirrored arc survives native dimension/history/JSON chain',async()=>{
 setup(270,'XY');await useApp.getState().skMirrorAt([70,30]);check(10)
 useApp.setState({sketchTool:'polyline',mirrorPick:null,drawConstruction:true,autoConstrain:true});useApp.getState().setSnapSize(0);useApp.getState().setGeoSnap(true)
 const shapes=all(),mirrorIndex=shapes.findIndex((s,i)=>i>0&&s.earc),end=refPts(shapes,{kind:'ellipse-arc-end',shape:mirrorIndex,idx:1})[0]
 await useApp.getState().onSketchClick([end[0]+.01,end[1]+.01]);await useApp.getState().onSketchClick([180,100]);await useApp.getState().finishOpenPolyline()
 const lineIndex=all().length-1,line=all()[lineIndex];assert.equal(line.construction,true);assert.equal(line.open,true)
 const con=useApp.getState().skCons.find(c=>c.type==='coincident'&&[c.a,c.b].some(r=>r?.kind==='ellipse-arc-end'&&r.shape===mirrorIndex));assert.ok(con,'actual Finish Open Polyline must infer true endpoint coincidence')
 const verify=rx=>{const e=check(rx),a=refPts(all(),con.a)[0],b=refPts(all(),con.b)[0];near(a[0],b[0]);near(a[1],b[1]);assert.equal(all()[lineIndex].construction,true);return e}
 useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id==='major'?{...c,value:12,expr:'12'}:c)});await useApp.getState().resolveSk();let e=verify(12),a=2*area(12,5,e.signedSweepDeg)
 await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await volume(a*5,e,'XY')
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await volume(a*8,e,'XY');await useApp.getState().undo();await volume(a*5,e,'XY');await useApp.getState().redo();await volume(a*8,e,'XY')
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(a*8,e,'XY')
 const f=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(f.id);verify(12);useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id==='major'?{...c,value:14,expr:'14'}:c)});await useApp.getState().resolveSk();e=verify(14);a=2*area(14,5,e.signedSweepDeg);await useApp.getState().applySketchEdit(f.sketchId);await volume(a*8,e,'XY')
})
