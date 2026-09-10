import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const {importSTEP,measureVolume,getOC}=await import('replicad')
const base={id:'base',type:'extrude',profile:{kind:'rect',a:[-10,-10],b:[10,10]},height:10,operation:'new'}
async function volume(expected){const shape=await importSTEP(new Blob([await w.exportSTEP()]));const check=new (getOC().BRepCheck_Analyzer)(shape.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}const v=measureVolume(shape);if(expected!=null)assert.ok(Math.abs(v-expected)<.001,`volume ${v}, expected ${expected}`);return v}
async function apply(fs){assert.equal(await useApp.getState().applyFeatures(fs,'face chain'),true,useApp.getState().status)}
async function save(expected){const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(expected)}
test('top face sketch → boss → upstream height → undo/redo → JSON/STEP keeps five millimetre boss',async()=>{
 useApp.setState({...useApp.getInitialState()},true);await apply([base]);await useApp.getState().startSketchOnFace([0,10,0],[0,0,1]);assert.equal(useApp.getState().pendingSketchFaceBinding?.sourceId,'base',useApp.getState().status)
 useApp.setState({sketchShape:{type:'rect',a:[-5,-5],b:[5,5]},extrudeHeight:5,sketchOp:'new'});await useApp.getState().extrudeSketch();await volume(4500)
 assert.ok(Object.values(useApp.getState().sketchSources)[0].faceBinding)
 await apply(useApp.getState().features.map(f=>f.id==='base'?{...f,height:15}:f));await volume(6500)
 assert.ok(!(useApp.getState().lastBuildWarnings ?? []).some(message=>/近点|近點/.test(message)), 'strict source-face resolution must not report a nearest-point fallback')
 assert.equal(Object.values(useApp.getState().sketchSources)[0].baseZ,15)
 assert.equal(Math.max(...useApp.getState().bodyMesh.vertices.filter((_,i)=>i%3===2)),20)
 await useApp.getState().undo();await volume(4500);await useApp.getState().redo();await volume(6500);await save(6500)
 const before=useApp.getState();assert.equal(await before.applyFeatures(before.features.filter(f=>f.id!=='base'),'deleted'),false);assert.deepEqual(useApp.getState().features,before.features);assert.deepEqual(useApp.getState().undoStack,before.undoStack);await volume(6500)
})
test('side face binding follows source width without looking at final Z',async()=>{
 useApp.setState({...useApp.getInitialState()},true);await apply([base]);await useApp.getState().startSketchOnFace([10,5,0],[1,0,0]);assert.ok(useApp.getState().pendingSketchFaceBinding,useApp.getState().status)
 useApp.setState({sketchShape:{type:'rect',a:[-3,2],b:[3,8]},extrudeHeight:5,sketchOp:'new'});await useApp.getState().extrudeSketch();await volume(4180)
 await apply(useApp.getState().features.map(f=>f.id==='base'?{...f,profile:{...f.profile,b:[15,10]}}:f));await volume(5180);assert.equal(Object.values(useApp.getState().sketchSources)[0].baseZ,15)
 await useApp.getState().undo();await volume(4180);await useApp.getState().redo();await volume(5180);await save(5180)
})
test('standalone face sketch follows upstream edit before later extrusion hydration',async()=>{
 useApp.setState({...useApp.getInitialState()},true);await apply([base]);await useApp.getState().startSketchOnFace([0,10,0],[0,0,1]);useApp.setState({sketchShape:{type:'rect',a:[-5,-5],b:[5,5]}});await useApp.getState().commitStandaloneSketch()
 await apply(useApp.getState().features.map(f=>f.id==='base'?{...f,height:15}:f));assert.equal(Object.values(useApp.getState().sketchSources)[0].baseZ,15)
 await useApp.getState().hydrateSketchForFeature();useApp.setState({extrudeHeight:5,sketchOp:'new'});await useApp.getState().extrudeSketch();await volume(6500);await save(6500)
})
test('cancelled asynchronous face capture cannot open a stale sketch',async()=>{
 useApp.setState({...useApp.getInitialState()},true);await apply([base]);useApp.setState({mode:'pickplane'});const original=w.captureSketchFaceBinding;let release;w.captureSketchFaceBinding=()=>new Promise(r=>release=r)
 try {const pending=useApp.getState().startSketchOnFace([0,10,0],[0,0,1]);useApp.getState().exitSketchMode();release(await original('base',[0,0,10],[0,0,1]));await pending;assert.equal(useApp.getState().mode,'model');assert.equal(useApp.getState().pendingSketchFaceBinding,null)}finally{w.captureSketchFaceBinding=original}
})
test('source face boundary resize retains the exact support plane and picked interior anchor',async()=>{
 useApp.setState({...useApp.getInitialState()},true);await apply([base]);await useApp.getState().startSketchOnFace([0,10,0],[0,0,1]);useApp.setState({sketchShape:{type:'rect',a:[-5,-5],b:[5,5]},extrudeHeight:5,sketchOp:'new'});await useApp.getState().extrudeSketch();await apply(useApp.getState().features.map(f=>f.id==='base'?{...f,profile:{...f.profile,b:[12,10]}}:f));await volume(4900);await save(4900)
})
for(const [plane,p,n,profile,expected] of [
 ['XY',[0,10,0],[0,0,1],{type:'rect',a:[-5,-5],b:[5,5]},4500],
 ['YZ',[10,5,0],[1,0,0],{type:'rect',a:[-3,2],b:[3,8]},4180],
 ['XZ',[0,5,10],[0,-1,0],{type:'rect',a:[-3,2],b:[3,8]},4180]
])test(`${plane} face follows X/Y/Z source translation with fixed geometry, history and STEP`,async()=>{
 useApp.setState({...useApp.getInitialState()},true);const move={id:'move',type:'transform',dx:0,dy:0,dz:0,rz:0};await apply([base,move]);await useApp.getState().startSketchOnFace(p,n);assert.ok(useApp.getState().pendingSketchFaceBinding,useApp.getState().status)
 const fixed={id:'fix-corner',kind:'con',type:'fix',a:{kind:'pt',shape:0,idx:0}}
 useApp.setState({sketchShape:profile,skCons:[fixed],extrudeHeight:5,sketchOp:'new',skDimLabelOff:{'dim-label':[13,17]}});await useApp.getState().extrudeSketch();await volume(expected)
 const beforeShape=await importSTEP(new Blob([await w.exportSTEP()])),bounds=beforeShape.boundingBox.bounds,delta=[4,3,2]
 await apply(useApp.getState().features.map(f=>f.id==='move'?{...f,dx:4,dy:3,dz:2}:f));await volume(expected)
 const moved=await importSTEP(new Blob([await w.exportSTEP()]));moved.boundingBox.bounds.forEach((b,i)=>b.forEach((x,k)=>assert.ok(Math.abs(x-bounds[i][k]-delta[k])<1e-5,`bbox ${i}/${k}`)))
 assert.deepEqual(Object.values(useApp.getState().sketchSources)[0].cons,[fixed]);assert.deepEqual(useApp.getState().skDimLabelOff['dim-label'],[13,17])
 await useApp.getState().undo();await volume(expected);await useApp.getState().redo();await volume(expected);await save(expected)
 const latest=await importSTEP(new Blob([await w.exportSTEP()]));latest.boundingBox.bounds.forEach((b,i)=>b.forEach((x,k)=>assert.ok(Math.abs(x-bounds[i][k]-delta[k])<1e-5)))
 const boss=useApp.getState().features.at(-1);await useApp.getState().editSketchOf(boss.id);await useApp.getState().applySketchEdit(boss.sketchId);await volume(expected);const edited=await importSTEP(new Blob([await w.exportSTEP()]));edited.boundingBox.bounds.forEach((b,i)=>b.forEach((x,k)=>assert.ok(Math.abs(x-bounds[i][k]-delta[k])<1e-5)))
})
test('external-origin constrained face translation is rejected atomically until its frame references can follow',async()=>{
 useApp.setState({...useApp.getInitialState()},true);await apply([base]);await useApp.getState().startSketchOnFace([0,10,0],[0,0,1]);useApp.setState({sketchShape:{type:'circle',c:[0,0],r:2},skCons:[{id:'origin',kind:'con',type:'coincident',a:{kind:'pt',shape:0,idx:0},b:{kind:'origin'}}],extrudeHeight:5,sketchOp:'new'});await useApp.getState().extrudeSketch();const before=useApp.getState(),v=await volume();assert.equal(await before.applyFeatures(before.features.map(f=>f.id==='base'?{...f,profile:{...f.profile,a:[-8,-10],b:[12,10]}}:f),'translate'),false);assert.deepEqual(useApp.getState().features,before.features);assert.deepEqual(useApp.getState().sketchSources,before.sketchSources);assert.deepEqual(useApp.getState().undoStack,before.undoStack);await volume(v)
})
test('compound extrusion source uses its final expanded timeline child and survives edits',async()=>{
 useApp.setState({...useApp.getInitialState()},true);const compound={id:'compound',type:'extgroup',height:10,subs:[{profile:{kind:'rect',a:[-10,-10],b:[0,10]},operation:'new'},{profile:{kind:'rect',a:[0,-10],b:[10,10]},operation:'new'}]};await apply([compound]);await useApp.getState().startSketchOnFace([0,10,0],[0,0,1]);assert.ok(useApp.getState().pendingSketchFaceBinding,useApp.getState().status);useApp.setState({sketchShape:{type:'rect',a:[-5,-5],b:[5,5]},extrudeHeight:5,sketchOp:'new'});await useApp.getState().extrudeSketch();await volume(4500)
 await apply(useApp.getState().features.map(f=>f.id==='compound'?{...f,height:15}:f));await volume(6500);await save(6500)
})
test('multiple equal planar faces remain pickable using an exact unique fingerprint',async()=>{
 useApp.setState({...useApp.getInitialState()},true);const floor={...base,profile:{kind:'rect',a:[-20,-10],b:[20,10]},height:5},left={...base,id:'left',profile:{kind:'rect',a:[-15,-5],b:[-5,5]},height:5,baseZ:5},right={...left,id:'right',profile:{kind:'rect',a:[5,-5],b:[15,5]}};await apply([floor,left,right]);await useApp.getState().startSketchOnFace([-10,10,0],[0,0,1]);assert.ok(useApp.getState().pendingSketchFaceBinding,useApp.getState().status);useApp.setState({sketchShape:{type:'circle',c:[-10,0],r:1},extrudeHeight:2,sketchOp:'new'});await useApp.getState().extrudeSketch();await volume(5000+Math.PI*2);await apply(useApp.getState().features);await volume(5000+Math.PI*2)
})

test('attachment translation preserves construction, projected metadata and analytic nested profiles',async()=>{
 const {translateBoundShape,translateBoundProfile}=await import('../src/cad/sketchFaceBinding.ts')
 const shape={type:'poly',pts:[[1,2],[3,4]],ctrl:[[5,6],[7,8]],verts:[[1,2],[3,4]],bulges:[.5,0],construction:true,centerline:true,projected:true,projectLink:'all',projectLinkIssue:'missing-source',open:true,arc:{a:[1,2],b:[3,4],m:[2,4]},ell:{cx:2,cy:3,rx:4,ry:2,rot:25},earc:{cx:2,cy:3,rx:4,ry:2,rot:25,a0:10,a1:80}}
 const moved=translateBoundShape(shape,[4,-3]);assert.deepEqual(moved.pts,[[5,-1],[7,1]]);assert.deepEqual(moved.ctrl,[[9,3],[11,5]]);assert.deepEqual(moved.arc.m,[6,1]);assert.deepEqual(moved.verts,[[5,-1],[7,1]]);assert.equal(moved.ell.cx,6);assert.equal(moved.earc.cy,0);for(const key of ['bulges','construction','centerline','projected','projectLink','projectLinkIssue','open'])assert.deepEqual(moved[key],shape[key]);assert.deepEqual(shape.pts,[[1,2],[3,4]])
 const profile={kind:'rect',a:[-5,-5],b:[5,5],holes:[{kind:'ellipse',c:[1,2],rx:2,ry:1,rot:30}],islands:[{kind:'circle',c:[1,2],r:.2}]},shifted=translateBoundProfile(profile,[3,4]);assert.deepEqual(shifted.a,[-2,-1]);assert.deepEqual(shifted.holes[0],{kind:'ellipse',c:[4,6],rx:2,ry:1,rot:30});assert.deepEqual(shifted.islands[0],{kind:'circle',c:[4,6],r:.2})
})
