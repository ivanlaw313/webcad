import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('../../tests/native-car-loader.mjs',import.meta.url)
await import('../../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../../src/store.ts'),{hitTest,refPts}=await import('../../src/sketch/freesolve.ts'),{ellipseArcWithSweep,ellipseArcSample}=await import('../../src/sketch/ellipseArcGeometry.ts'),{importSTEP,measureVolume,getOC}=await import('replicad')
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`),all=()=>[...useApp.getState().sketchProfiles,...(useApp.getState().sketchShape?[useApp.getState().sketchShape]:[])]
const independentPoint=(e,t)=>{const r=e.rot*Math.PI/180;return[e.cx+e.rx*Math.cos(t)*Math.cos(r)-e.ry*Math.sin(t)*Math.sin(r),e.cy+e.rx*Math.cos(t)*Math.sin(r)+e.ry*Math.sin(t)*Math.cos(r)]}
const area=sh=>{if(sh.type==='circle')return Math.PI*sh.r**2;if(sh.ell)return Math.PI*sh.ell.rx*sh.ell.ry;const e=sh.earc,t=e.signedSweepDeg*Math.PI/180;return e.rx*e.ry*Math.abs(t-Math.sin(t))/2}
// Prepared for Phase33; intentionally outside tests/ and not executed during Phase32 freeze.
const xf=p=>{const a=Math.PI/6;return[30+(p[0]-30)*Math.cos(a)-(p[1]-30)*Math.sin(a)+70,30+(p[0]-30)*Math.sin(a)+(p[1]-30)*Math.cos(a)]}
function fixture(kind){const e={cx:30,cy:30,rx:10,ry:5,rot:30};return kind==='ellipse'?{type:'poly',ell:e,pts:Array.from({length:48},(_,i)=>independentPoint(e,i*Math.PI/24))}:kind==='earc'?{type:'poly',earc:ellipseArcWithSweep(e,330,270),pts:ellipseArcSample(ellipseArcWithSweep(e,330,270)),open:false}:{type:'rect',a:[20,25],b:[40,35]}}
async function move(path){useApp.setState({skSel:[{kind:'edge',shape:0,idx:0}]});useApp.getState().startSkMove();const mv=useApp.getState().skMove;if(path==='numeric'){useApp.setState({appPrompt:async()=> '70,0,30,0'});await useApp.getState().skMovePrompt()}else{useApp.setState({skMove:{...mv,dx:70,dy:0,ang:30,copy:false}});await useApp.getState().commitSkMove()}return mv}
async function volume(expected){const sh=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}assert.ok(Math.abs(measureVolume(sh)-expected)<Math.max(1e-5,expected*5e-8))}
for(const kind of['ellipse','earc','rect'])for(const path of['gizmo','numeric'])for(const plane of['XY','XZ','YZ','ARB'])test(`prepared ${path} noncopy ${kind} Move ${plane} analytic native/history`,async()=>{
 const original=fixture(kind);useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:[original],extrudeHeight:5,sketchOp:'new',...(plane==='ARB'?{sketchPlane:'XY',sketchArb:{o:[10,20,30],xd:[0,1,0],n:[1,0,0]}}:{sketchPlane:plane})},true)
 const pivot=await move(path);assert.equal(all().length,1);const moved=all()[0];if(kind==='ellipse'){assert.ok(moved.ell);near(moved.ell.cx,100);near(moved.ell.cy,30);near(moved.ell.rot,60);near(moved.ell.rx,10);near(moved.ell.ry,5)}if(kind==='earc'){assert.ok(moved.earc);near(moved.earc.signedSweepDeg,270);assert.equal(moved.earc.version,2);assert.equal(moved.open,false);const r=Math.PI/6;near(moved.earc.cx,pivot.cx+(30-pivot.cx)*Math.cos(r)-(30-pivot.cy)*Math.sin(r)+70);near(moved.earc.cy,pivot.cy+(30-pivot.cx)*Math.sin(r)+(30-pivot.cy)*Math.cos(r));near(moved.earc.rot,60)}
 assert.equal(useApp.getState().sketchUndo.length,1);await useApp.getState().undo();assert.deepEqual(all(),[original]);await useApp.getState().redo();assert.deepEqual(all(),[moved]);const a=kind==='rect'?200:area(original);await useApp.getState().extrudeSketch();await volume(a*5)
 if(plane==='XY'){const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(a*5);assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await volume(a*8)}
})
for(const path of['gizmo','numeric'])test(`prepared ${path} fixed whole circle Move preserves original anchor and both histories`,async()=>{
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:[{type:'circle',c:[5,7],r:10}],skCons:[{id:'fixed',kind:'con',type:'fix',a:{kind:'circle',shape:0}}],skSel:[{kind:'circle',shape:0}],sketchRedo:[{sketchProfiles:[],skCons:[]}]},true)
 useApp.getState().startSkMove();const snapshot=()=>structuredClone({shapes:all(),cons:useApp.getState().skCons,undo:useApp.getState().sketchUndo,redo:useApp.getState().sketchRedo}),before=snapshot()
 if(path==='numeric'){useApp.setState({appPrompt:async()=> '20,10,0,0'});await useApp.getState().skMovePrompt()}else{useApp.setState({skMove:{...useApp.getState().skMove,dx:20,dy:10,ang:0,copy:false}});await useApp.getState().commitSkMove()}
 assert.deepEqual(snapshot(),before,'Move must not recreate a Fix anchor from the transformed candidate')
})
