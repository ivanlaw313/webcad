import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const {importSTEP,measureVolume,getOC}=await import('replicad')
const line=(a,b)=>({type:'poly',open:true,pts:[a,b]})
function seed(constrained=false){useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'extend',sketchProfiles:[line([0,0],[20,0]),line([30,0],[30,20]),line([30,20],[0,20]),line([0,20],[0,0])],skCons:constrained?[{id:'len',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:20},{id:'anchor',kind:'con',type:'coincident',a:{kind:'pt',shape:0,idx:0},b:{kind:'origin'}}]:[],extrudeHeight:10,sketchOp:'new'},true)}
async function volume(expected){const sh=await importSTEP(new Blob([await w.exportSTEP()]));const check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}assert.ok(Math.abs(measureVolume(sh)-expected)<1e-5,`${measureVolume(sh)} != ${expected}`)}
test('extend free line closes four-edge rectangle → extrude → height edit → Undo/Redo → JSON/STEP',async()=>{
 seed();await useApp.getState().skExtendAt([19,0]);await useApp.getState().extrudeSketch();assert.ok(useApp.getState().features.length,useApp.getState().status);await volume(6000)
 const fs=useApp.getState().features.map(f=>({...f,height:15}));assert.equal(await useApp.getState().applyFeatures(fs,'height edit'),true);await volume(9000);await useApp.getState().undo();await volume(6000);await useApp.getState().redo();await volume(9000)
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(9000)
})
test('length-locked line extension must reject atomically instead of claiming a closed region',async()=>{
 seed(true);await useApp.getState().resolveSk();const before=structuredClone({shapes:useApp.getState().sketchProfiles,cons:useApp.getState().skCons,undo:useApp.getState().sketchUndo});await useApp.getState().skExtendAt([19,0]);const after=useApp.getState();console.log('LOCKED EXTEND',JSON.stringify({shapes:after.sketchProfiles,cons:after.skCons,status:after.status,undo:after.sketchUndo.length}))
 assert.deepEqual(after.sketchUndo,before.undo,'rejected extension must not consume an undo step');assert.deepEqual(after.sketchProfiles,before.shapes);assert.deepEqual(after.skCons,before.cons);assert.doesNotMatch(after.status,/已延伸/)
})
test('radius-constrained circle trimmed at diameter → semicircle extrusion retains analytic area',async()=>{
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'trim',sketchProfiles:[{type:'circle',c:[0,0],r:10},line([-10,0],[10,0])],skCons:[{id:'radius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:10}],extrudeHeight:10,sketchOp:'new'},true)
 useApp.getState().skTrimAt([0,10]);await useApp.getState().resolveSk();console.log('TRIM ARC',JSON.stringify({cons:useApp.getState().skCons,status:useApp.getState().status,shapes:useApp.getState().sketchProfiles.map(s=>({type:s.type,verts:s.verts,bulges:s.bulges,open:s.open}))}));await useApp.getState().extrudeSketch();assert.ok(useApp.getState().features.length,useApp.getState().status);await volume(500*Math.PI)
})
test('Esc during asynchronous extension leaves geometry and history untouched',async()=>{
 seed();const before=structuredClone({shapes:useApp.getState().sketchProfiles,undo:useApp.getState().sketchUndo});const pending=useApp.getState().skExtendAt([19,0]);useApp.getState().escSketch();await pending;assert.deepEqual(useApp.getState().sketchProfiles,before.shapes);assert.deepEqual(useApp.getState().sketchUndo,before.undo)
})
for(const type of ['rad','dia'])test(`trim preserves ${type} identity/expression references, radius edit and exact half-circle rebuild`,async()=>{
 const original={id:'radius',name:'dRadius',kind:'dim',type,a:{kind:'circle',shape:0},value:type==='rad'?10:20,expr:type==='rad'?'10':'20',refs:{},tagpos:[8,15]};useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'trim',sketchProfiles:[{type:'circle',c:[40,40],r:10},line([20,40],[60,40]),{type:'circle',c:[80,40],r:type==='rad'?5:10,construction:true}],skCons:[original,{id:'dependent',name:'dDependent',kind:'dim',type:'rad',a:{kind:'circle',shape:2},value:type==='rad'?5:10,expr:'dRadius / 2',refs:{dRadius:'dimension:radius'}}],extrudeHeight:10,sketchOp:'new'},true)
 useApp.getState().skTrimAt([40,50]);await useApp.getState().resolveSk();console.log('KEEP TEST',useApp.getState().status,JSON.stringify(useApp.getState().skCons));const kept=useApp.getState().skCons.find(c=>c.id==='radius');assert.ok(kept);assert.equal(kept.a.kind,'edge');for(const key of ['id','name','expr','refs','tagpos'])assert.deepEqual(kept[key],original[key]);assert.ok(useApp.getState().skCons.some(c=>c.id==='dependent'));
 await useApp.getState().undo();assert.equal(useApp.getState().sketchProfiles[0].type,'circle');await useApp.getState().redo();assert.equal(useApp.getState().skCons.find(c=>c.id==='radius').a.kind,'edge');
 useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id==='radius'?{...c,value:type==='rad'?12:24,expr:type==='rad'?'12':'24'}:c)});await useApp.getState().resolveSk();assert.equal(useApp.getState().skConflict,false,useApp.getState().status);const follower=useApp.getState().sketchProfiles.find(s=>s.type==='circle'&&s.construction);assert.ok(Math.abs(follower.r-(type==='rad'?6:12))<1e-6);
 await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await volume(720*Math.PI);const feat=useApp.getState().features[0],id=feat.sketchId;const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(720*Math.PI);await useApp.getState().editSketchOf(feat.id);await useApp.getState().applySketchEdit(id);await volume(720*Math.PI)
})
test('multiple surviving arcs share radius and center after mapped dimension changes',async()=>{
 const {constraintsAfterTrim}=await import('../src/sketch/trimConstraints.ts');const {solveFree}=await import('../src/sketch/freesolve.ts');const {pathPts,bulgeCenter,bulgeRadius}=await import('../src/sketch/sketchOps.ts');const bulge=-Math.tan(Math.PI/8);const vs=[[[10,0],[0,10]],[[-10,0],[0,-10]]];const parts=vs.map(verts=>({type:'poly',open:true,verts,bulges:[bulge],pts:pathPts(verts,[bulge])}));const mapped=constraintsAfterTrim([{type:'circle',c:[0,0],r:10}],0,parts,[{id:'r',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:10}]);assert.equal(mapped.dropped,0);assert.ok(mapped.cons.some(c=>c.type==='concentric'));const result=await solveFree(parts,mapped.cons.map(c=>c.id==='r'?{...c,value:12}:c));assert.equal(result.conflict,false,JSON.stringify(result.conflictIds));const centers=result.shapes.map(sh=>bulgeCenter(sh.verts[0],sh.verts[1],sh.bulges[0]));result.shapes.forEach(sh=>assert.ok(Math.abs(bulgeRadius(sh.verts[0],sh.verts[1],sh.bulges[0])-12)<1e-6));assert.ok(Math.hypot(centers[0][0]-centers[1][0],centers[0][1]-centers[1][1])<1e-6)
})
test('trim keeps true arc-center Fix through radius change, history and native STEP rebuild',async()=>{
 const {refPts}=await import('../src/sketch/freesolve.ts')
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'trim',sketchProfiles:[{type:'circle',c:[40,40],r:10},line([20,40],[60,40])],skCons:[{id:'r',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:10},{id:'center',kind:'con',type:'fix',a:{kind:'pt',shape:0,idx:0}}],extrudeHeight:10,sketchOp:'new'},true)
 useApp.getState().skTrimAt([40,50]);await useApp.getState().resolveSk()
 const center=useApp.getState().skCons.find(c=>c.id==='center');assert.equal(center.a.kind,'center');assert.doesNotMatch(useApp.getState().status,/约束已移除/)
 const verify=()=>{const s=useApp.getState(),shapes=[...s.sketchProfiles,...(s.sketchShape?[s.sketchShape]:[])];const [p]=refPts(shapes,s.skCons.find(c=>c.id==='center').a);assert.ok(Math.hypot(p[0]-40,p[1]-40)<1e-6);assert.equal(s.skConflict,false,s.status)}
 verify();await useApp.getState().undo();assert.equal(useApp.getState().skCons.find(c=>c.id==='center').a.kind,'pt');await useApp.getState().redo();verify()
 useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id==='r'?{...c,value:12}:c)});await useApp.getState().resolveSk();verify()
 await useApp.getState().extrudeSketch();await volume(720*Math.PI)
 const feat=useApp.getState().features.at(-1),payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())))
 useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(720*Math.PI)
 await useApp.getState().editSketchOf(feat.id);verify();await useApp.getState().applySketchEdit(feat.sketchId);await volume(720*Math.PI)
})
