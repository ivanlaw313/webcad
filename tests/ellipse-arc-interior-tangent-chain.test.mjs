import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts'),{hitTest,refPts}=await import('../src/sketch/freesolve.ts'),{ellipseArcWithSweep,ellipseArcSample}=await import('../src/sketch/ellipseArcGeometry.ts'),{importSTEP,measureVolume,getOC}=await import('replicad')
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),all=()=>[...useApp.getState().sketchProfiles,...(useApp.getState().sketchShape?[useApp.getState().sketchShape]:[])]
const independentPoint=(e,t)=>{const r=e.rot*Math.PI/180;return[e.cx+e.rx*Math.cos(t)*Math.cos(r)-e.ry*Math.sin(t)*Math.sin(r),e.cy+e.rx*Math.cos(t)*Math.sin(r)+e.ry*Math.sin(t)*Math.cos(r)]}
async function volume(expected,e,plane){const sh=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}const v=measureVolume(sh);assert.ok(Math.abs(v-expected)<Math.max(1e-5,Math.abs(expected)*5e-8),`${v} != ${expected}`);if(e&&plane){const r=e.rot*Math.PI/180,candidates=[e.a0,e.a0+e.signedSweepDeg],x=Math.atan2(-e.ry*Math.sin(r),e.rx*Math.cos(r))*180/Math.PI,y=Math.atan2(e.ry*Math.cos(r),e.rx*Math.sin(r))*180/Math.PI;for(const t of [x,x+180,y,y+180]){const delta=e.signedSweepDeg>0?((t-e.a0)%360+360)%360:((e.a0-t)%360+360)%360;if(delta<=Math.abs(e.signedSweepDeg)+1e-9)candidates.push(t)}const ps=candidates.map(t=>independentPoint(e,t*Math.PI/180)),bounds=sh.boundingBox.bounds,mapping=plane==='XZ'?[[0,0,1,0],[2,1,1,0]]:plane==='YZ'?[[1,0,-1,0],[2,1,1,0]]:plane==='ARB'?[[1,0,1,20],[2,1,1,30]]:[[0,0,1,0],[1,1,-1,0]];for(const[world,local,sign,offset]of mapping){const values=ps.map(p=>p[local]*sign+offset);assert.ok(Math.abs(bounds[0][world]-Math.min(...values))<1e-5,`${plane} min axis${world}: ${bounds[0][world]} != ${Math.min(...values)}`);assert.ok(Math.abs(bounds[1][world]-Math.max(...values))<1e-5,`${plane} max axis${world}: ${bounds[1][world]} != ${Math.max(...values)}`)}}}

function setup(rx,ry,plane,sweep,complement=false){
 const e=ellipseArcWithSweep({cx:20,cy:30,rx,ry,rot:30},330,sweep),t=(330+sweep/2+(complement?180:0))*Math.PI/180,r=e.rot*Math.PI/180,p=independentPoint(e,t),d=[-rx*Math.sin(t)*Math.cos(r)-ry*Math.cos(t)*Math.sin(r),-rx*Math.sin(t)*Math.sin(r)+ry*Math.cos(t)*Math.cos(r)],L=Math.hypot(...d),pts=ellipseArcSample(e),line=[-20,20].map(k=>[p[0]+k*d[0]/L,p[1]+k*d[1]/L])
 if(sweep<0)line.reverse()
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:[{type:'poly',earc:e,pts,open:false},{type:'poly',construction:true,open:true,pts:line}],skCons:[{id:'center',kind:'con',type:'fix',a:{kind:'ellipse-point',shape:0,idx:0}},{id:'minor',kind:'con',type:'fix',a:{kind:'ellipse-point',shape:0,idx:2}},{id:'major',kind:'dim',type:'dist',a:{kind:'ellipse-point',shape:0,idx:0},b:{kind:'ellipse-point',shape:0,idx:1},value:rx,expr:String(rx),name:'dMajor',refs:{}}],skSel:[{kind:'ellipse-arc',shape:0},{kind:'edge',shape:1,idx:0}],extrudeHeight:5,sketchOp:'new',...(plane==='ARB'?{sketchPlane:'XY',sketchArb:{o:[10,20,30],xd:[0,1,0],n:[1,0,0]}}:{sketchPlane:plane})},true)
}
function check(rx,ry){
 const shapes=all(),e=shapes[0].earc,line=shapes[1].pts,v=[line[1][0]-line[0][0],line[1][1]-line[0][1]],L=Math.hypot(...v),n=[-v[1]/L,v[0]/L],r=e.rot*Math.PI/180,nlocal=[n[0]*Math.cos(r)+n[1]*Math.sin(r),-n[0]*Math.sin(r)+n[1]*Math.cos(r)],offset=n[0]*(line[0][0]-e.cx)+n[1]*(line[0][1]-e.cy),h=Math.hypot(rx*nlocal[0],ry*nlocal[1])
 assert.equal(useApp.getState().skConflict,false,useApp.getState().status);near(e.rx,rx);near(e.ry,ry);near(e.cx,20);near(e.cy,30);near(e.rot,30);assert.ok(L>1);near(Math.abs(offset),h)
 const q=[Math.sign(offset)*rx*rx*nlocal[0]/h,Math.sign(offset)*ry*ry*nlocal[1]/h],t=Math.atan2(q[1]/ry,q[0]/rx),p=independentPoint(e,t),der=[-rx*Math.sin(t)*Math.cos(r)-ry*Math.cos(t)*Math.sin(r),-rx*Math.sin(t)*Math.sin(r)+ry*Math.cos(t)*Math.cos(r)]
 near((p[0]-line[0][0])*n[0]+(p[1]-line[0][1])*n[1],0);assert.ok(Math.abs(der[0]*v[1]-der[1]*v[0])/(Math.hypot(...der)*L)<1e-7)
 assert.ok(line.every(end=>Math.hypot(end[0]-p[0],end[1]-p[1])>1),'whole-ellipse tangency must not impose endpoint coincidence')
 for(const p of shapes[0].pts){const x=(p[0]-e.cx)*Math.cos(r)+(p[1]-e.cy)*Math.sin(r),y=-(p[0]-e.cx)*Math.sin(r)+(p[1]-e.cy)*Math.cos(r);near((x/rx)**2+(y/ry)**2,1)}
 const contact=useApp.getState().skCons.find(c=>c.type==='tangent').ellipseContact;assert.equal(contact?.version,1);const cp=independentPoint(e,contact.angleDeg*Math.PI/180);near(cp[0],p[0]);near(cp[1],p[1]);const progress=((Math.sign(e.signedSweepDeg)*(contact.angleDeg-e.a0))%360+360)%360;assert.ok(progress<=Math.abs(e.signedSweepDeg)+1e-6,'contact must remain inside actual signed arc');assert.equal(useApp.getState().skConflict,false,useApp.getState().status);assert.equal(shapes[1].construction,true);return e
}

const area=e=>{const t=e.signedSweepDeg*Math.PI/180;return e.rx*e.ry*Math.abs(t-Math.sin(t))/2}
const cases=[...[80,-80,270,-270,360,-360].flatMap(sweep=>['XY','XZ','YZ','ARB'].map(plane=>({rx:10,ry:5,sweep,plane}))),...[80,-270,360].flatMap(sweep=>[{rx:5,ry:5,sweep,plane:'XY'},{rx:5,ry:10,sweep,plane:'XY'}])]
for(const {rx,ry,sweep,plane} of cases)test(`native interior arc tangent rx${rx}/ry${ry} sweep${sweep} ${plane}`,async()=>{
 setup(rx,ry,plane,sweep);await useApp.getState().addSkCon('tangent');const con=structuredClone(useApp.getState().skCons.find(c=>c.type==='tangent'));assert.ok(con,useApp.getState().status);assert.equal(con.tangentLineEnd,undefined)
 const initial=check(rx,ry);near(initial.signedSweepDeg,sweep);await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await volume(area(initial)*5,initial,plane)
 let f=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(f.id);useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id==='major'?{...c,value:rx+2,expr:String(rx+2)}:c)});await useApp.getState().resolveSk();const solved=check(rx+2,ry);assert.equal(Math.sign(solved.signedSweepDeg),Math.sign(sweep));if(Math.abs(sweep)===360)near(solved.signedSweepDeg,sweep);assert.deepEqual({...useApp.getState().skCons.find(c=>c.id===con.id),ellipseContact:null},{...con,ellipseContact:null});await useApp.getState().applySketchEdit(f.sketchId);await volume(area(solved)*5,solved,plane)
 if(plane==='XY'){
 await useApp.getState().undo();await volume(area(initial)*5,initial,plane);await useApp.getState().redo();await volume(area(solved)*5,solved,plane)
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await volume(area(solved)*8,solved,plane)
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(area(solved)*8,solved,plane)
 f=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(f.id);check(rx+2,ry);await useApp.getState().applySketchEdit(f.sketchId);await volume(area(solved)*8,solved,plane)
 }
})
for(const sweep of [80,-80,270,-270])test(`fixed complementary tangent ${sweep} rejects without mutating source or history`,async()=>{
 setup(10,5,'XY',sweep,true);useApp.setState({skCons:[{id:'fixedArc',kind:'con',type:'fix',a:{kind:'ellipse-arc',shape:0}},{id:'fixedLine',kind:'con',type:'fix',a:{kind:'edge',shape:1,idx:0}}]})
 const snapshot=()=>structuredClone({shapes:all(),cons:useApp.getState().skCons,undo:useApp.getState().sketchUndo,redo:useApp.getState().sketchRedo}),before=snapshot()
 await useApp.getState().addSkCon('tangent');assert.deepEqual(snapshot(),before);assert.ok(!useApp.getState().skCons.some(c=>c.type==='tangent'))
})
