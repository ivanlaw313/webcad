import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const {importSTEP,measureVolume,getOC}=await import('replicad')
const approx=(p,q)=>assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<1e-6,`${p} != ${q}`)
function setup(locked=false){useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:[{type:'poly',pts:[[40,40],[60,40],[60,50],[40,50]]}],skCons:[{id:'bottom',kind:'con',type:'fix',a:{kind:'edge',shape:0,idx:0}},...[['h',0],['v',1],['h',2],['v',3]].map(([type,idx])=>({id:`axis${idx}`,kind:'con',type,a:{kind:'edge',shape:0,idx}})),...(locked?[{id:'height',name:'dHeight',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:1},value:10}]:[])],extrudeHeight:5,sketchOp:'new'},true)}
function rectangle(top){const s=useApp.getState(),ps=s.sketchProfiles[0].pts;[[40,40],[60,40],[60,top],[40,top]].forEach((p,i)=>approx(ps[i],p));assert.equal(s.skConflict,false,s.status);assert.ok(ps.flat().every(Number.isFinite));assert.ok(Math.abs(ps[2][0]-ps[3][0]-20)<1e-6)}
async function volume(expected){const sh=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}assert.ok(Math.abs(measureVolume(sh)-expected)<1e-5,`${measureVolume(sh)} != ${expected}`)}
test('constrained top edge projects mixed pointer intent vertically then native rebuild/history/JSON/STEP',async()=>{
 setup();const cons=structuredClone(useApp.getState().skCons)
 assert.equal(useApp.getState().skDragStart([50,50]),true);assert.equal(useApp.getState().skDrag.ref.kind,'edge');assert.equal(useApp.getState().skDrag.ref.idx,2)
 await useApp.getState().skDragMove([55,54]);await useApp.getState().skDragEnd([58,57]);rectangle(57);assert.deepEqual(useApp.getState().skCons,cons);assert.equal(useApp.getState().sketchUndo.length,1)
 await useApp.getState().undo();rectangle(50);await useApp.getState().redo();rectangle(57)
 await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);assert.equal(useApp.getState().features.length,1);await volume(1700)
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await volume(2720)
 await useApp.getState().undo();await volume(1700);await useApp.getState().redo();await volume(2720)
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(2720)
 let feat=useApp.getState().features.at(-1);await useApp.getState().editSketchOf(feat.id);rectangle(57);assert.deepEqual(useApp.getState().skCons,cons);await useApp.getState().applySketchEdit(feat.sketchId);await volume(2720)
 feat=useApp.getState().features.at(-1);await useApp.getState().editSketchOf(feat.id);useApp.getState().setSketchTool('select');assert.equal(useApp.getState().skDragStart([50,57]),true);await useApp.getState().skDragEnd([47,60]);rectangle(60);await useApp.getState().applySketchEdit(feat.sketchId);await volume(3200);assert.equal(useApp.getState().features.length,1)
 await useApp.getState().undo();await volume(2720);await useApp.getState().redo();await volume(3200)
})
test('edge projection Esc restores an accepted preview and invalidates pending release',async()=>{
 setup();const before=structuredClone(useApp.getState().sketchProfiles),cons=structuredClone(useApp.getState().skCons)
 assert.equal(useApp.getState().skDragStart([50,50]),true);await useApp.getState().skDragMove([55,54]);rectangle(54)
 const pending=useApp.getState().skDragEnd([58,57]);assert.equal(useApp.getState().escSketch(),true);await pending
 assert.equal(useApp.getState().mode,'sketch');assert.deepEqual(useApp.getState().sketchProfiles,before);assert.deepEqual(useApp.getState().skCons,cons);assert.equal(useApp.getState().sketchUndo.length,0)
})
test('height-locked top edge is exact no-op and retains native closed volume',async()=>{
 setup(true);const before=structuredClone(useApp.getState().sketchProfiles),cons=structuredClone(useApp.getState().skCons)
 assert.equal(useApp.getState().skDragStart([50,50]),true);await useApp.getState().skDragEnd([58,57]);assert.deepEqual(useApp.getState().sketchProfiles,before);assert.deepEqual(useApp.getState().skCons,cons);assert.equal(useApp.getState().sketchUndo.length,0)
 await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await volume(1000)
})
