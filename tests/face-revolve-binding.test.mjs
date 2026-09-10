import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const {importSTEP,measureVolume,getOC}=await import('replicad')
const base={id:'base',type:'extrude',profile:{kind:'rect',a:[-10,-10],b:[10,10]},height:10,operation:'new'},move={id:'move',type:'transform',dx:0,dy:0,dz:0,rz:0}
async function check(expected){const shape=await importSTEP(new Blob([await w.exportSTEP()]));const a=new (getOC().BRepCheck_Analyzer)(shape.wrapped,true,false);try{assert.ok(a.IsValid_2())}finally{a.delete()}const volume=measureVolume(shape);assert.ok(Math.abs(volume-expected)<.002,`volume ${volume}, expected ${expected}`);return shape}
async function apply(fs){assert.equal(await useApp.getState().applyFeatures(fs,'revolve binding'),true,useApp.getState().status)}
async function reopen(expected){const saved=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(saved);await check(expected)}
async function make({features=[base,move],point=[4,10,0],normal=[0,0,1],circle=[4,0],params={}}={}){
 useApp.setState({...useApp.getInitialState()},true);await apply(features);await useApp.getState().startSketchOnFace(point,normal);assert.ok(useApp.getState().pendingSketchFaceBinding,useApp.getState().status)
 useApp.setState({sketchShape:{type:'circle',c:circle,r:1},sketchOp:'new'});await useApp.getState().runCommand('revolve');const d=useApp.getState().featDlg;assert.ok(d.payload.bundle.faceBinding);useApp.setState({featDlg:{...d,params:{...d.params,...params}}});await useApp.getState().commitFeatDlg();const f=useApp.getState().features.at(-1);assert.equal(f.type,'revolve',useApp.getState().status);assert.ok(f.sketchFaceBinding);assert.ok(useApp.getState().sketchSources[f.sketchId].faceBinding);return f
}
test('face Revolve follows height, keeps frame during no-op edit and survives Undo/Redo/JSON/STEP',async()=>{
 const f=await make();const first=4000+4*Math.PI*Math.PI;await check(first);assert.equal(f.axisReference,'sketch');assert.deepEqual(f.axisOrigin,[0,0,10])
 await useApp.getState().editSketchOf(f.id);await useApp.getState().applySketchEdit(f.sketchId);await check(first);assert.equal(useApp.getState().features.at(-1).baseZ,10)
 await apply(useApp.getState().features.map(f=>f.id==='base'?{...f,height:15}:f));await check(6000+4*Math.PI*Math.PI);assert.equal(useApp.getState().sketchSources[f.sketchId].baseZ,15);assert.deepEqual(useApp.getState().features.at(-1).axisOrigin,[0,0,15])
 await useApp.getState().undo();await check(first);await useApp.getState().redo();await check(6000+4*Math.PI*Math.PI);await reopen(6000+4*Math.PI*Math.PI)
 const before=useApp.getState();assert.equal(await before.applyFeatures(before.features.filter(f=>f.id!=='move'),'missing source'),false);assert.deepEqual(useApp.getState().features,before.features);assert.deepEqual(useApp.getState().undoStack,before.undoStack);await check(6000+4*Math.PI*Math.PI)
})
for(const [name,args] of [
 ['XY',{}],
 ['XZ',{point:[0,5,10],normal:[0,-1,0],circle:[0,9],params:{axis:'X',ox:0,oy:-10,oz:5}}],
 ['YZ',{point:[10,5,0],normal:[1,0,0],circle:[-4,5],params:{axis:'Z',ox:10,oy:0,oz:5}}],
 ['inclined',(()=>{const a=10*Math.PI/180;return {features:[base,{id:'tilt',type:'transform',dx:0,dy:0,dz:0,rz:0,ry:10,origin:[0,0,0]},move],point:[10*Math.sin(a),10*Math.cos(a),0],normal:[Math.sin(a),0,Math.cos(a)]}})()]
])test(`${name} translated source carries Revolve profile and sketch-owned axis, then no-op edit/JSON`,async()=>{
 const f=await make(args);const expected=4000+4*Math.PI*Math.PI;const before=await check(expected),bounds=before.boundingBox.bounds,axis=f.axisOrigin
 await apply(useApp.getState().features.map(x=>x.id==='move'?{...x,dx:4,dy:3,dz:2}:x));const after=await check(expected);useApp.getState().features.at(-1).axisOrigin.forEach((x,i)=>assert.ok(Math.abs(x-axis[i]-[4,3,2][i])<1e-9))
 // OCCT bounds carry existing mesh tolerance; compare rigid deltas, not nominal dimensions.
 after.boundingBox.bounds.forEach((b,i)=>b.forEach((x,k)=>assert.ok(Math.abs(x-bounds[i][k]-[4,3,2][k])<.03)))
 await useApp.getState().editSketchOf(f.id);await useApp.getState().applySketchEdit(f.sketchId);await check(expected)
 await useApp.getState().undo();await check(expected);await useApp.getState().redo();await check(expected);await reopen(expected)
})
test('explicit world axis stays fixed while sketch-owned axis translates',async()=>{
 const plate={...base,profile:{kind:'rect',a:[-20,-20],b:[20,20]}}
 for(const ownership of ['world','sketch']){
  const f=await make({features:[plate,move],params:{axisReference:ownership}});await check(16000+4*Math.PI*Math.PI)
  await apply(useApp.getState().features.map(x=>x.id==='move'?{...x,dx:2}:x));await check(16000+(ownership==='world'?6:4)*Math.PI*Math.PI)
  assert.deepEqual(useApp.getState().features.at(-1).axisOrigin,ownership==='world'?[0,0,10]:[2,0,10]);assert.equal(useApp.getState().features.at(-1).axisReference,ownership)
  useApp.getState().openFeatDlgForEdit(f.id);assert.equal(useApp.getState().featDlg.params.axisReference,ownership);await useApp.getState().commitFeatDlg();await check(16000+(ownership==='world'?6:4)*Math.PI*Math.PI)
  await useApp.getState().editSketchOf(f.id);await useApp.getState().applySketchEdit(f.sketchId);await check(16000+(ownership==='world'?6:4)*Math.PI*Math.PI)
 }
})

test('world-axis tangent-to-bottom OCCT failure rolls back features, history, mesh and STEP',async()=>{
 const plate={...base,profile:{kind:'rect',a:[-20,-20],b:[20,20]}}
 await make({features:[plate,move],params:{axisReference:'world'}});const expected=16000+4*Math.PI*Math.PI;await check(expected)
 const before=useApp.getState();const accepted=await before.applyFeatures(before.features.map(x=>x.id==='move'?{...x,dx:5}:x),'world tangent regression')
 assert.equal(accepted,false,'known exact bottom tangency must report failure, never partial success')
 assert.deepEqual(useApp.getState().features,before.features);assert.deepEqual(useApp.getState().undoStack,before.undoStack);assert.deepEqual(useApp.getState().bodyMesh,before.bodyMesh);await check(expected)
})
