import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts'),{hitTest,refPts}=await import('../src/sketch/freesolve.ts'),{ellipseArcWithSweep,ellipseArcSample}=await import('../src/sketch/ellipseArcGeometry.ts'),{importSTEP,measureVolume,getOC}=await import('replicad')
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),all=()=>[...useApp.getState().sketchProfiles,...(useApp.getState().sketchShape?[useApp.getState().sketchShape]:[])]
const independentPoint=(e,t)=>{const r=e.rot*Math.PI/180;return[e.cx+e.rx*Math.cos(t)*Math.cos(r)-e.ry*Math.sin(t)*Math.sin(r),e.cy+e.rx*Math.cos(t)*Math.sin(r)+e.ry*Math.sin(t)*Math.cos(r)]}
const area=sh=>{if(sh.type==='circle')return Math.PI*sh.r**2;if(sh.ell)return Math.PI*sh.ell.rx*sh.ell.ry;const e=sh.earc,t=e.signedSweepDeg*Math.PI/180;return e.rx*e.ry*Math.abs(t-Math.sin(t))/2}
function seed(kind,plane){
 const e={cx:20,cy:30,rx:10,ry:5,rot:30},arc=ellipseArcWithSweep(e,330,270),t=105*Math.PI/180,p=independentPoint(e,t),r=Math.PI/6,d=[-10*Math.sin(t)*Math.cos(r)-5*Math.cos(t)*Math.sin(r),-10*Math.sin(t)*Math.sin(r)+5*Math.cos(t)*Math.cos(r)],L=Math.hypot(...d)
 const shape=kind==='circle'?{type:'circle',c:[20,30],r:10}:kind==='ellipse'?{type:'poly',ell:e,pts:Array.from({length:48},(_,i)=>independentPoint(e,i*Math.PI/24))}:{type:'poly',earc:arc,pts:ellipseArcSample(arc),open:false}
 const dim={id:'radius-source',name:'dSource',kind:'dim',type:kind==='circle'?'rad':'dist',a:kind==='circle'?{kind:'circle',shape:0}:{kind:'ellipse-point',shape:0,idx:0},...(kind==='circle'?{}:{b:{kind:'ellipse-point',shape:0,idx:1}}),value:10,expr:'10',refs:{},tagPos:[40,40]}
 const cons=kind==='circle'?[dim]:[{id:'center-source',kind:'con',type:'fix',a:{kind:'ellipse-point',shape:0,idx:0}},{id:'minor-source',kind:'con',type:'fix',a:{kind:'ellipse-point',shape:0,idx:2}},dim]
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:kind==='circle'?[shape]:[shape,{type:'poly',construction:true,open:true,pts:[-20,20].map(k=>[p[0]+k*d[0]/L,p[1]+k*d[1]/L])}],skCons:cons,skSel:kind==='circle'?[]:[{kind:kind==='ellipse'?'ellipse':'ellipse-arc',shape:0},{kind:'edge',shape:1,idx:0}],extrudeHeight:5,sketchOp:'new',...(plane==='ARB'?{sketchPlane:'XY',sketchArb:{o:[10,20,30],xd:[0,1,0],n:[1,0,0]}}:{sketchPlane:plane})},true)
}
function check(kind,sourceR,copyR,n){
 const shapes=all(),cons=useApp.getState().skCons;assert.equal(shapes.length,n*2);assert.equal(new Set(cons.map(c=>c.id)).size,cons.length);const dims=cons.filter(c=>c.kind==='dim');assert.equal(new Set(dims.map(c=>c.name)).size,dims.length)
 for(const [idx,rx,cx]of[[0,sourceR,20],[n,copyR,90]]){
 const sh=shapes[idx];if(kind==='circle'){near(sh.r,rx);near(sh.c[0],cx);near(sh.c[1],30);continue}
 const e=kind==='ellipse'?sh.ell:sh.earc;assert.ok(e,'analytical metadata must survive Copy');near(e.rx,rx);near(e.ry,5);near(e.cx,cx);near(e.cy,30);near(e.rot,30);if(kind==='earc'){assert.equal(e.version,2);assert.ok(e.signedSweepDeg>0)}
 for(const p of sh.pts){const r=e.rot*Math.PI/180,x=(p[0]-cx)*Math.cos(r)+(p[1]-30)*Math.sin(r),y=-(p[0]-cx)*Math.sin(r)+(p[1]-30)*Math.cos(r);near((x/rx)**2+(y/5)**2,1)}
 const tangent=cons.find(c=>c.type==='tangent'&&c.a.shape===idx);assert.ok(tangent,'copied internal tangent must persist');assert.equal(tangent.ellipseContact.version,1);const t=tangent.ellipseContact.angleDeg*Math.PI/180,p=independentPoint(e,t),line=shapes[idx+1].pts,v=[line[1][0]-line[0][0],line[1][1]-line[0][1]],L=Math.hypot(...v),r=e.rot*Math.PI/180,d=[-rx*Math.sin(t)*Math.cos(r)-5*Math.cos(t)*Math.sin(r),-rx*Math.sin(t)*Math.sin(r)+5*Math.cos(t)*Math.cos(r)]
 near(((p[0]-line[0][0])*v[1]-(p[1]-line[0][1])*v[0])/L,0);near((d[0]*v[1]-d[1]*v[0])/(L*Math.hypot(...d)),0);assert.equal(shapes[idx+1].construction,true)
 if(kind==='earc')assert.ok(((tangent.ellipseContact.angleDeg-e.a0)%360+360)%360<=e.signedSweepDeg+1e-6)
 }
 assert.equal(useApp.getState().skConflict,false,useApp.getState().status);return structuredClone([shapes[0],shapes[n]])
}
async function native(profiles,height,plane){
 const sh=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}
 const expected=profiles.reduce((sum,p)=>sum+area(p),0)*height;assert.ok(Math.abs(measureVolume(sh)-expected)<Math.max(1e-5,expected*5e-8))
 const ps=profiles.flatMap(p=>{if(p.type==='circle')return[[p.c[0]-p.r,p.c[1]],[p.c[0]+p.r,p.c[1]],[p.c[0],p.c[1]-p.r],[p.c[0],p.c[1]+p.r]];const e=p.ell||p.earc,r=e.rot*Math.PI/180,x=Math.atan2(-e.ry*Math.sin(r),e.rx*Math.cos(r))*180/Math.PI,y=Math.atan2(e.ry*Math.cos(r),e.rx*Math.sin(r))*180/Math.PI,angles=p.earc?[e.a0,e.a0+e.signedSweepDeg]:[];for(const t of[x,x+180,y,y+180])if(!p.earc||((t-e.a0)%360+360)%360<=e.signedSweepDeg+1e-9)angles.push(t);return angles.map(t=>independentPoint(e,t*Math.PI/180))})
 const mapping=plane==='XZ'?[[0,0,1,0],[2,1,1,0]]:plane==='YZ'?[[1,0,-1,0],[2,1,1,0]]:plane==='ARB'?[[1,0,1,20],[2,1,1,30]]:[[0,0,1,0],[1,1,-1,0]],bounds=sh.boundingBox.bounds
 for(const[world,local,sign,offset]of mapping){const values=ps.map(p=>p[local]*sign+offset);assert.ok(Math.abs(bounds[0][world]-Math.min(...values))<1e-5);assert.ok(Math.abs(bounds[1][world]-Math.max(...values))<1e-5)}
}
for(const kind of['circle','ellipse','earc'])for(const plane of['XY','XZ','YZ','ARB'])test(`constrained ${kind} Copy ${plane} independent dimensions and native chain`,async()=>{
 seed(kind,plane);if(kind!=='circle')await useApp.getState().addSkCon('tangent');const source=structuredClone({shapes:all(),cons:useApp.getState().skCons}),n=source.shapes.length
 useApp.setState({skSel:kind==='circle'?[{kind:'circle',shape:0}]:[{kind:kind==='ellipse'?'ellipse':'ellipse-arc',shape:0},{kind:'edge',shape:1,idx:0}]})
 useApp.getState().startSkMove();useApp.getState().setSkMoveCopy(true);useApp.getState().skMoveHandleDown('x',[20,30]);useApp.getState().skMoveHandleMove([90,30]);useApp.getState().skMoveHandleUp();await useApp.getState().commitSkMove();check(kind,10,10,n);assert.deepEqual(all().slice(0,n),source.shapes);assert.deepEqual(useApp.getState().skCons.filter(c=>source.cons.some(x=>x.id===c.id)),source.cons)
 const copyDim=useApp.getState().skCons.find(c=>c.kind==='dim'&&c.a.shape===n);assert.ok(copyDim);assert.notEqual(copyDim.id,'radius-source');assert.deepEqual(copyDim.tagPos,[110,40]);assert.equal(copyDim.expr,'10')
 await useApp.getState().commitSkDim('radius-source',{value:12,expr:'12'},'source12');check(kind,12,10,n);await useApp.getState().commitSkDim(copyDim.id,{value:8,expr:'8'},'copy8');let profiles=check(kind,12,8,n)
 await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await native(profiles,5,plane)
 if(plane==='XY'){
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await native(profiles,8,plane);await useApp.getState().undo();await native(profiles,5,plane);await useApp.getState().redo();await native(profiles,8,plane)
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await native(profiles,8,plane)
 const f=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(f.id);check(kind,12,8,n);await useApp.getState().commitSkDim(copyDim.id,{value:9,expr:'9'},'copy9');profiles=check(kind,12,9,n);await useApp.getState().applySketchEdit(f.sketchId);await native(profiles,8,plane)
 }
})
