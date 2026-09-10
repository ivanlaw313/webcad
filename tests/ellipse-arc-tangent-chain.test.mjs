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
async function volume(expected,e,plane){const sh=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}const v=measureVolume(sh);assert.ok(Math.abs(v-expected)<Math.max(1e-5,Math.abs(expected)*5e-8),`${v} != ${expected}`);if(e&&plane){const r=e.rot*Math.PI/180,candidates=[e.a0,e.a0+e.signedSweepDeg],x=Math.atan2(-e.ry*Math.sin(r),e.rx*Math.cos(r))*180/Math.PI,y=Math.atan2(e.ry*Math.cos(r),e.rx*Math.sin(r))*180/Math.PI;for(const t of [x,x+180,y,y+180]){const delta=e.signedSweepDeg>0?((t-e.a0)%360+360)%360:((e.a0-t)%360+360)%360;if(delta<=Math.abs(e.signedSweepDeg)+1e-9)candidates.push(t)}const ps=candidates.map(t=>independentPoint(e,t)),bounds=sh.boundingBox.bounds,mapping=plane==='XZ'?[[0,0,1,0],[2,1,1,0]]:plane==='YZ'?[[1,0,-1,0],[2,1,1,0]]:plane==='ARB'?[[1,0,1,20],[2,1,1,30]]:[[0,0,1,0],[1,1,-1,0]];for(const[world,local,sign,offset]of mapping){const values=ps.map(p=>p[local]*sign+offset);assert.ok(Math.abs(bounds[0][world]-Math.min(...values))<1e-5,`${plane} min axis${world}: ${bounds[0][world]} != ${Math.min(...values)}`);assert.ok(Math.abs(bounds[1][world]-Math.max(...values))<1e-5,`${plane} max axis${world}: ${bounds[1][world]} != ${Math.max(...values)}`)}}}

function derivative(e,tDeg){const r=e.rot*Math.PI/180,t=tDeg*Math.PI/180;return[-e.rx*Math.sin(t)*Math.cos(r)-e.ry*Math.cos(t)*Math.sin(r),-e.rx*Math.sin(t)*Math.sin(r)+e.ry*Math.cos(t)*Math.cos(r)]}
function setup(rx,ry,sweep,plane){
 const e=ellipseArcWithSweep({cx:20,cy:30,rx,ry,rot:30},330,sweep),p=independentPoint(e,e.a0+sweep),d=derivative(e,e.a0+sweep),len=Math.hypot(...d)
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:[{type:'poly',earc:e,pts:ellipseArcSample(e),open:false},{type:'poly',construction:true,open:true,pts:[p,[p[0]+20*d[0]/len,p[1]+20*d[1]/len]]}],skCons:[
 {id:'center',kind:'con',type:'fix',a:{kind:'ellipse-point',shape:0,idx:0}},
 {id:'minor',kind:'con',type:'fix',a:{kind:'ellipse-point',shape:0,idx:2}},
 {id:'major',kind:'dim',type:'dist',a:{kind:'ellipse-point',shape:0,idx:0},b:{kind:'ellipse-point',shape:0,idx:1},value:rx,expr:String(rx),name:'dMajor',refs:{}}
 ],skSel:[{kind:'ellipse-arc-end',shape:0,idx:1},{kind:'edge',shape:1,idx:0}],extrudeHeight:5,sketchOp:'new',...(plane==='ARB'?{sketchPlane:'XY',sketchArb:{o:[10,20,30],xd:[0,1,0],n:[1,0,0]}}:{sketchPlane:plane})},true)
}
function check(rx,ry){
 const shapes=all(),e=shapes[0].earc,p=independentPoint(e,e.a0+e.signedSweepDeg),line=shapes[1].pts,d=derivative(e,e.a0+e.signedSweepDeg),v=[line[1][0]-line[0][0],line[1][1]-line[0][1]]
 near(e.rx,rx);near(e.ry,ry);near(e.cx,20);near(e.cy,30);near(e.rot,30);near(line[0][0],p[0]);near(line[0][1],p[1]);assert.ok(Math.hypot(...v)>1e-3)
 assert.ok(Math.abs(d[0]*v[1]-d[1]*v[0])/(Math.hypot(...d)*Math.hypot(...v))<1e-7,'independent derivative must be parallel to the contact line')
 shapes[0].pts.forEach((q,i)=>{const expected=independentPoint(e,e.a0+e.signedSweepDeg*i/(shapes[0].pts.length-1));near(q[0],expected[0]);near(q[1],expected[1])})
 assert.equal(useApp.getState().skConflict,false,useApp.getState().status);assert.equal(shapes[1].construction,true);return e
}

const cases=[...[80,-80,270,-270].flatMap(sweep=>['XY','XZ','YZ','ARB'].map(plane=>({rx:10,ry:5,sweep,plane}))),...[80,-270].flatMap(sweep=>[{rx:5,ry:5,sweep,plane:'XY'},{rx:5,ry:10,sweep,plane:'XY'}])]
for(const {rx,ry,sweep,plane} of cases)test(`native endpoint tangent rx${rx}/ry${ry} sweep${sweep} ${plane} dimension/JSON/history`,async()=>{
 setup(rx,ry,sweep,plane);await useApp.getState().addSkCon('tangent');await useApp.getState().resolveSk()
 const con=useApp.getState().skCons.find(c=>c.type==='tangent');assert.ok(con,useApp.getState().status);assert.equal(con.tangentLineEnd,0);assert.deepEqual(con.a,{kind:'ellipse-arc-end',shape:0,idx:1});assert.deepEqual(con.b,{kind:'edge',shape:1,idx:0})
 const initial=check(rx,ry);near(initial.signedSweepDeg,sweep);await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await volume(area(rx,ry,sweep)*5,initial,plane)
 let f=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(f.id);useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id==='major'?{...c,value:rx+2,expr:String(rx+2)}:c)});await useApp.getState().resolveSk();const solved=check(rx+2,ry),a=area(rx+2,ry,solved.signedSweepDeg);assert.deepEqual(useApp.getState().skCons.find(c=>c.id===con.id),con);await useApp.getState().applySketchEdit(f.sketchId);await volume(a*5,solved,plane)
 if(plane==='XY'){
 await useApp.getState().undo();await volume(area(rx,ry,sweep)*5,initial,plane);await useApp.getState().redo();await volume(a*5,solved,plane)
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await volume(a*8,solved,plane)
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(a*8,solved,plane)
 f=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(f.id);check(rx+2,ry);assert.deepEqual(useApp.getState().skCons.find(c=>c.id===con.id),con);await useApp.getState().applySketchEdit(f.sketchId);await volume(a*8,solved,plane)
 }
})
