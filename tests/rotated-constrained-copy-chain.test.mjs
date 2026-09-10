import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts'),{hitTest,refPts}=await import('../src/sketch/freesolve.ts'),{ellipseArcWithSweep,ellipseArcSample}=await import('../src/sketch/ellipseArcGeometry.ts'),{importSTEP,measureVolume,getOC}=await import('replicad')
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),all=()=>[...useApp.getState().sketchProfiles,...(useApp.getState().sketchShape?[useApp.getState().sketchShape]:[])]
const independentPoint=(e,t)=>{const r=e.rot*Math.PI/180;return[e.cx+e.rx*Math.cos(t)*Math.cos(r)-e.ry*Math.sin(t)*Math.sin(r),e.cy+e.rx*Math.cos(t)*Math.sin(r)+e.ry*Math.sin(t)*Math.cos(r)]}
const vertices=sh=>sh.type==='rect'?[sh.a,[sh.b[0],sh.a[1]],sh.b,[sh.a[0],sh.b[1]]]:sh.pts
const rotate=(p,c,angle,dx)=>{const a=angle*Math.PI/180;return[c[0]+(p[0]-c[0])*Math.cos(a)-(p[1]-c[1])*Math.sin(a)+dx,c[1]+(p[0]-c[0])*Math.sin(a)+(p[1]-c[1])*Math.cos(a)]}
function seed(plane){
 const cons=[0,1,2,3].map(i=>({id:'axis'+i,kind:'con',type:i%2?'v':'h',a:{kind:'edge',shape:0,idx:i}}))
 cons.push({id:'anchor',kind:'con',type:'fix',a:{kind:'pt',shape:0,idx:0}},{id:'width',kind:'dim',type:'hdist',a:{kind:'pt',shape:0,idx:0},b:{kind:'pt',shape:0,idx:1},name:'dWidth',value:20,expr:'20',refs:{}},{id:'height',kind:'dim',type:'vdist',a:{kind:'pt',shape:0,idx:1},b:{kind:'pt',shape:0,idx:2},name:'dHeight',value:10,expr:'dWidth/2',refs:{dWidth:'dimension:width'}})
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:[{type:'rect',a:[20,30],b:[40,40]}],skCons:cons,extrudeHeight:5,sketchOp:'new',...(plane==='ARB'?{sketchPlane:'XY',sketchArb:{o:[10,20,30],xd:[0,1,0],n:[1,0,0]}}:{sketchPlane:plane})},true)
}
async function copy(index,angle,dx){
 useApp.setState({skSel:[{kind:'edge',shape:index,idx:0}]});useApp.getState().startSkMove();useApp.getState().setSkMoveCopy(true)
 const {cx,cy}=useApp.getState().skMove;useApp.getState().skMoveHandleDown('x',[cx,cy]);useApp.getState().skMoveHandleMove([cx+dx,cy]);useApp.getState().skMoveHandleUp()
 useApp.getState().skMoveHandleDown('rot',[cx+dx+10,cy]);useApp.getState().skMoveHandleMove([cx+dx+10*Math.cos(angle*Math.PI/180),cy+10*Math.sin(angle*Math.PI/180)]);useApp.getState().skMoveHandleUp();await useApp.getState().commitSkMove()
 return [cx,cy]
}
function check(index,width,angle,anchor){
 const ps=vertices(all()[index]),a=angle*Math.PI/180,u=[Math.cos(a),Math.sin(a)],v=[-Math.sin(a),Math.cos(a)],expected=[anchor,[anchor[0]+width*u[0],anchor[1]+width*u[1]],[anchor[0]+width*u[0]+width/2*v[0],anchor[1]+width*u[1]+width/2*v[1]],[anchor[0]+width/2*v[0],anchor[1]+width/2*v[1]]]
 for(let i=0;i<4;i++){near(ps[i][0],expected[i][0]);near(ps[i][1],expected[i][1])}assert.equal(useApp.getState().skConflict,false,useApp.getState().status)
 for(const c of useApp.getState().skCons.filter(c=>c.a.shape===index&&['h','v','hdist','vdist'].includes(c.type))){const frame=(c.frameAngleDeg??0)*Math.PI/180;near(Math.cos(frame),Math.cos(a));near(Math.sin(frame),Math.sin(a))}
 const dims=useApp.getState().skCons.filter(c=>c.kind==='dim'&&c.a.shape===index),w=dims.find(c=>c.type==='hdist'),h=dims.find(c=>c.type==='vdist');assert.ok(w&&h);assert.equal(h.expr,w.name+'/2');assert.equal(h.refs[w.name],'dimension:'+w.id);near(w.value,width);near(h.value,width/2)
 return {w,h,ps:structuredClone(ps)}
}
async function native(polys,widths,height,plane){
 const sh=await importSTEP(new Blob([await w.exportSTEP()])),checker=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(checker.IsValid_2())}finally{checker.delete()}
 const expected=widths.reduce((sum,w)=>sum+w*w/2,0)*height;assert.ok(Math.abs(measureVolume(sh)-expected)<1e-5)
 const ps=polys.flat(),mapping=plane==='XZ'?[[0,0,1,0],[2,1,1,0]]:plane==='YZ'?[[1,0,-1,0],[2,1,1,0]]:plane==='ARB'?[[1,0,1,20],[2,1,1,30]]:[[0,0,1,0],[1,1,-1,0]],bounds=sh.boundingBox.bounds
 for(const[world,local,sign,offset]of mapping){const vals=ps.map(p=>p[local]*sign+offset);assert.ok(Math.abs(bounds[0][world]-Math.min(...vals))<1e-5);assert.ok(Math.abs(bounds[1][world]-Math.max(...vals))<1e-5)}
}
for(const angle of[30,-30,125])for(const plane of['XY','XZ','YZ','ARB'])test(`rotated constrained copy ${angle}deg ${plane} local dimensions/formula/native chain`,async()=>{
 seed(plane);const source=structuredClone({shapes:all(),cons:useApp.getState().skCons}),pivot=await copy(0,angle,80),anchor=rotate([20,30],pivot,angle,80);assert.equal(all().length,2,useApp.getState().status);assert.deepEqual(all()[0],source.shapes[0]);assert.deepEqual(useApp.getState().skCons.filter(c=>source.cons.some(x=>x.id===c.id)),source.cons)
 let copied=check(1,20,angle,anchor);await useApp.getState().commitSkDim('width',{value:24,expr:'24'},'source24');check(0,24,0,[20,30]);check(1,20,angle,anchor);await useApp.getState().commitSkDim(copied.w.id,{value:28,expr:'28'},'copy28');let result=check(1,28,angle,anchor),original=check(0,24,0,[20,30]);
 let polys=[original.ps,result.ps],widths=[24,28]
 if(plane==='XY'){
 const before=structuredClone(all()),pivot2=await copy(1,-15,100),anchor2=rotate(anchor,pivot2,-15,100);assert.deepEqual(all().slice(0,2),before);let third=check(2,28,angle-15,anchor2);await useApp.getState().commitSkDim(third.w.id,{value:32,expr:'32'},'third32');third=check(2,32,angle-15,anchor2);check(1,28,angle,anchor);polys.push(third.ps);widths.push(32)
 }
 await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await native(polys,widths,5,plane)
 if(plane==='XY'){
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await native(polys,widths,8,plane);await useApp.getState().undo();await native(polys,widths,5,plane);await useApp.getState().redo();await native(polys,widths,8,plane)
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await native(polys,widths,8,plane);const f=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(f.id);check(0,24,0,[20,30]);check(1,28,angle,anchor);await useApp.getState().applySketchEdit(f.sketchId);await native(polys,widths,8,plane)
 }
})
