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
function pick(p){const ref=hitTest(all(),p,.01);assert.ok(ref,`true arc handle missing at ${p}`);const q=refPts(all(),ref)[0];near(q[0],p[0]);near(q[1],p[1]);return ref}
function seed(sweep,plane){const e=ellipseArcWithSweep({cx:20,cy:30,rx:10,ry:5,rot:30},330,sweep),pts=ellipseArcSample(e),end=independentPoint(e,330+sweep);useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:[{type:'poly',earc:e,pts,open:false},{type:'poly',open:true,construction:true,pts:[end,[end[0]+20,end[1]+20]]}],extrudeHeight:5,sketchOp:'new',...(plane==='ARB'?{sketchPlane:'XY',sketchArb:{o:[10,20,30],xd:[0,1,0],n:[1,0,0]}}:{sketchPlane:plane})},true);const c=pick([20,30]),u=pick(independentPoint(e,0)),v=pick(independentPoint(e,90)),b=pick(end);useApp.setState({skCons:[{id:'center',kind:'con',type:'fix',a:c},{id:'minor',kind:'con',type:'fix',a:v},{id:'major',name:'dMajor',kind:'dim',type:'dist',a:c,b:u,value:10,expr:'10',refs:{}},{id:'endpoint',kind:'con',type:'coincident',a:b,b:{kind:'pt',shape:1,idx:0}}]});return e}
function verify(rx){const a=all(),sh=a.find(s=>s.earc),e=sh.earc;near(e.rx,rx);near(e.ry,5);near(e.cx,20);near(e.cy,30);near(e.rot,30);assert.equal(e.version,2);assert.ok(Number.isFinite(e.signedSweepDeg)&&Math.abs(e.signedSweepDeg)>0);sh.pts.forEach((p,i)=>{const expected=independentPoint(e,e.a0+e.signedSweepDeg*i/(sh.pts.length-1));near(p[0],expected[0]);near(p[1],expected[1])});const con=useApp.getState().skCons.find(c=>c.id==='endpoint'),end=refPts(a,con.a)[0],line=refPts(a,con.b)[0];near(end[0],line[0]);near(end[1],line[1]);assert.equal(useApp.getState().skConflict,false,useApp.getState().status);return e}
async function volume(expected,e,plane){const sh=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}const v=measureVolume(sh);assert.ok(Math.abs(v-expected)<Math.max(1e-5,Math.abs(expected)*5e-8),`${v} != ${expected}`);if(e&&plane){const r=e.rot*Math.PI/180,candidates=[e.a0,e.a0+e.signedSweepDeg],x=Math.atan2(-e.ry*Math.sin(r),e.rx*Math.cos(r))*180/Math.PI,y=Math.atan2(e.ry*Math.cos(r),e.rx*Math.sin(r))*180/Math.PI;for(const t of [x,x+180,y,y+180]){const delta=e.signedSweepDeg>0?((t-e.a0)%360+360)%360:((e.a0-t)%360+360)%360;if(delta<=Math.abs(e.signedSweepDeg)+1e-9)candidates.push(t)}const ps=candidates.map(t=>independentPoint(e,t)),bounds=sh.boundingBox.bounds,mapping=plane==='XZ'?[[0,0,1,0],[2,1,1,0]]:plane==='YZ'?[[1,0,-1,0],[2,1,1,0]]:plane==='ARB'?[[1,0,1,20],[2,1,1,30]]:[[0,0,1,0],[1,1,-1,0]];for(const[world,local,sign,offset]of mapping){const values=ps.map(p=>p[local]*sign+offset);assert.ok(Math.abs(bounds[0][world]-Math.min(...values))<1e-5,`${plane} min axis${world}: ${bounds[0][world]} != ${Math.min(...values)}`);assert.ok(Math.abs(bounds[1][world]-Math.max(...values))<1e-5,`${plane} max axis${world}: ${bounds[1][world]} != ${Math.max(...values)}`)}}}
for(const sweep of [80,-80,270,-270])for(const plane of ['XY','XZ','YZ','ARB'])test(`signed ellipse arc ${sweep}deg ${plane} native segment and true endpoint dimension chain`,async()=>{
 seed(sweep,plane);await useApp.getState().resolveSk();const initial=verify(10);near(initial.signedSweepDeg,sweep);await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await volume(area(10,5,sweep)*5,initial,plane)
 const feat=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(feat.id);useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id==='major'?{...c,value:12,expr:'12'}:c)});await useApp.getState().resolveSk();const solved=verify(12),a=area(12,5,solved.signedSweepDeg);console.log('EARC DIM ANGLES',JSON.stringify({plane,sweep,after:solved.signedSweepDeg,a0:solved.a0}));await useApp.getState().applySketchEdit(feat.sketchId);await volume(a*5,solved,plane)
 if(plane==='XY'){assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await volume(a*8,solved,plane);await useApp.getState().undo();await volume(a*5,solved,plane);await useApp.getState().redo();await volume(a*8,solved,plane);const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(a*8,solved,plane);const f=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(f.id);verify(12);await useApp.getState().applySketchEdit(f.sketchId);await volume(a*8,solved,plane)}
})

for(const [label,rx,ry,sweep,legacy] of [
 ['legacy full CCW',10,5,360,true],['legacy full CW',10,5,-360,true],
 ['signed full CCW',10,5,360,false],['signed full CW',10,5,-360,false],
 ['equal axes CCW',5,5,270,false],['equal axes CW',5,5,-270,false],
 ['minor larger CCW',5,10,270,false],['minor larger CW',5,10,-270,false],
])test(`ellipse arc native exact special branch: ${label}`,async()=>{
 const signed=ellipseArcWithSweep({cx:20,cy:30,rx,ry,rot:30},330,sweep)
 const e=legacy?{cx:20,cy:30,rx,ry,rot:30,a0:330,a1:330,sweep:sweep>0}:signed
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:[{type:'poly',earc:e,pts:ellipseArcSample(e),open:false}],extrudeHeight:5,sketchOp:'new',sketchPlane:'XY'},true)
 await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status)
 await volume(area(rx,ry,sweep)*5,signed,'XY')
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())))
 useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload)
 await volume(area(rx,ry,sweep)*5,signed,'XY')
})

for(const sweep of [80,-270])test(`open signed ellipse arc ${sweep}deg store surface extrusion has one analytic face`,async()=>{
 const e=ellipseArcWithSweep({cx:20,cy:30,rx:10,ry:5,rot:30},330,sweep)
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:[{type:'poly',earc:e,pts:ellipseArcSample(e),open:true}],sketchPlane:'XY',appPrompt:async()=> '5'},true)
 await useApp.getState().addSurfExtrude()
 assert.equal(useApp.getState().features.at(-1).type,'surfextrude',useApp.getState().status)
 const mesh=await w.rebuild(useApp.getState().features);assert.ok(!mesh.failed?.length);assert.equal(mesh.parked?.length,1)
 const m=mesh.parked[0];assert.equal(m.faceGroups.length,1,'sampled fallback would produce many planar faces')
 const t0=e.a0*Math.PI/180,dt=sweep*Math.PI/180/4096,speed=t=>Math.hypot(e.rx*Math.sin(t),e.ry*Math.cos(t));let sum=speed(t0)+speed(t0+dt*4096)
 for(let i=1;i<4096;i++)sum+=(i%2?4:2)*speed(t0+dt*i)
 const expected=Math.abs(sum*dt/3)*5;let observed=0
 for(let i=0;i<m.triangles.length;i+=3){const p=m.triangles.slice(i,i+3).map(j=>m.vertices.slice(j*3,j*3+3)),a=p[1].map((v,k)=>v-p[0][k]),b=p[2].map((v,k)=>v-p[0][k]);observed+=Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])/2}
 assert.ok(Math.abs(observed-expected)/expected<0.005,`surface mesh area ${observed} != independent arc length × height ${expected}`)
 for(const angle of [e.a0,e.a0+sweep])for(const z of [0,5]){const p=independentPoint(e,angle);let best=Infinity;for(let i=0;i<m.vertices.length;i+=3)best=Math.min(best,Math.hypot(m.vertices[i]-p[0],m.vertices[i+1]+p[1],m.vertices[i+2]-z));assert.ok(best<1e-6,`true surface endpoint missing: ${best}`)}
})
