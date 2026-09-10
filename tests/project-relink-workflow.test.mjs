import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const {importSTEP,measureVolume,getOC}=await import('replicad')
const loop={type:'poly',pts:[[0,0],[10,0],[10,6],[0,6]],projected:true,projectLink:'all',projectLinkIssue:'constraints',construction:true}
const circle={type:'circle',c:[10,0],r:1}
const cons=[{id:'k1',kind:'con',type:'coincident',a:{kind:'pt',shape:1,idx:0},b:{kind:'pt',shape:0,idx:1}},{id:'k2',kind:'dim',type:'rad',a:{kind:'circle',shape:1},value:1,name:'d1'}]
const ref=(width=12)=>({pts:[[0,0],[width,0],[width,6],[0,6]],segs:[[[0,0],[width,0]],[[width,0],[width,6]],[[width,6],[0,6]],[[0,6],[0,0]]]})
function setup(extra={}){useApp.setState({...useApp.getInitialState()},true);useApp.setState({mode:'sketch',sketchProfiles:[structuredClone(loop)],sketchShape:structuredClone(circle),skCons:structuredClone(cons),skRefGeo:ref(),...extra})}
const geom=()=>JSON.stringify([useApp.getState().sketchProfiles,useApp.getState().sketchShape,useApp.getState().skCons,useApp.getState().sketchUndo,useApp.getState().sketchRedo])
async function preview(){useApp.getState().beginProjectRelink(0);assert.equal(useApp.getState().projectRelink.candidates.length,1);await useApp.getState().selectProjectRelinkCandidate(0);assert.ok(useApp.getState().projectRelink.preview,useApp.getState().projectRelink.error)}
test('per-curve preview uses real solver, moves coincident circle and retains constraints/index/labels; confirm/Undo/Redo',async()=>{
 setup({skDimLabelOff:{k2:[17,23]},skConflict:true,skConflictIds:['old-conflict']});const before=geom();await preview();assert.equal(geom(),before);assert.deepEqual(useApp.getState().projectRelink.preview[1].c,[12,0]);assert.equal(await useApp.getState().confirmProjectRelink(),true)
 assert.equal(useApp.getState().skConflict,false);assert.deepEqual(useApp.getState().skConflictIds,[]);assert.deepEqual(useApp.getState().sketchShape.c,[12,0]);assert.deepEqual(useApp.getState().skCons,cons);assert.deepEqual(useApp.getState().skDimLabelOff,{k2:[17,23]});assert.ok(useApp.getState().sketchProfiles[0].projectLinkSource)
 await useApp.getState().undo();assert.deepEqual(useApp.getState().sketchShape.c,[10,0]);await useApp.getState().redo();assert.deepEqual(useApp.getState().sketchShape.c,[12,0])
})
test('driving width conflict is rejected with no geometry or history change',async()=>{
 setup({skCons:[...cons,{id:'k3',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:10,name:'d2'}]});const before=geom();useApp.getState().beginProjectRelink(0);await useApp.getState().selectProjectRelinkCandidate(0);assert.match(useApp.getState().projectRelink.error,/冲突/);assert.equal(await useApp.getState().confirmProjectRelink(),false);assert.equal(geom(),before)
})
test('cancel, Escape, and changed source reject stale previews without committing',async()=>{
 setup();const before=geom();await preview();assert.equal(useApp.getState().escSketch(),true);assert.equal(useApp.getState().projectRelink,null);assert.equal(useApp.getState().mode,'sketch');assert.equal(geom(),before)
 await preview();useApp.setState({skRefGeo:ref(14)});assert.equal(await useApp.getState().confirmProjectRelink(),false);assert.equal(geom(),before)
 useApp.getState().cancelProjectRelink();setup({skRefGeo:null});useApp.getState().beginProjectRelink(0);assert.match(useApp.getState().projectRelink.error,/没有可用/)
})
test('per-item break preserves other linked curves and all constraints, and Undo restores metadata',async()=>{
 setup({sketchProfiles:[structuredClone(loop),structuredClone(circle),{...structuredClone(loop),projectLinkSource:{version:1,points:loop.pts,open:false}}],sketchShape:null});const before=structuredClone(useApp.getState().sketchProfiles);useApp.getState().breakProjectLink(2);assert.equal(useApp.getState().sketchProfiles[0].projectLink,'all');assert.equal(useApp.getState().sketchProfiles[2].projectLink,undefined);assert.deepEqual(useApp.getState().skCons,cons);await useApp.getState().undo();assert.deepEqual(useApp.getState().sketchProfiles,before)
})
test('real upstream prefix → relink with dependent circle → downstream extrusion, Undo/Redo JSON STEP',async()=>{
 useApp.setState({...useApp.getInitialState()},true)
 const base={id:'base',type:'extrude',profile:{kind:'rect',a:[0,-6],b:[10,0]},height:2,operation:'new'}
 assert.equal(await useApp.getState().applyFeatures([base],'base'),true);await useApp.getState().startSketchOnFace([5,2,3],[0,0,1])
 useApp.setState({sketchProfiles:[structuredClone(loop)],sketchShape:structuredClone(circle),skCons:structuredClone(cons),extrudeHeight:3,sketchOp:'new'});await useApp.getState().extrudeSketch()
 const boss=useApp.getState().features.at(-1);assert.equal(boss.type,'extrude')
 const volume=async(v)=>{const sh=await importSTEP(new Blob([await w.exportSTEP()]));const analyzer=new (getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(analyzer.IsValid_2())}finally{analyzer.delete()}assert.ok(Math.abs(measureVolume(sh)-v)<1e-4)}
 await volume(120+3*Math.PI)
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>f.id==='base'?{...f,profile:{...f.profile,b:[12,0]}}:f),'source resize'),true)
 await useApp.getState().editSketchOf(boss.id);assert.ok(useApp.getState().skRefGeo.segs.length);await preview();assert.equal(await useApp.getState().confirmProjectRelink(),true)
 const srcIndex=useApp.getState().sketchProfiles.findIndex(s=>s.type==='circle');const shifted=srcIndex>=0?useApp.getState().sketchProfiles[srcIndex]:useApp.getState().sketchShape;assert.deepEqual(shifted.c,[12,0])
 await useApp.getState().applySketchEdit(boss.sketchId);await volume(144+3*Math.PI)
 await useApp.getState().undo();await volume(144+3*Math.PI);await useApp.getState().redo();await volume(144+3*Math.PI)
 const saved=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));assert.ok(saved);useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(saved);await volume(144+3*Math.PI)
 const source=useApp.getState().sketchSources[boss.sketchId];assert.ok(source.shapes[0].projectLinkSource);assert.deepEqual(source.cons.map(c=>c.id),['k1','k2'])
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>f.id==='base'?{...f,profile:{...f.profile,b:[14,0]}}:f),'second source resize'),true);await useApp.getState().editSketchOf(boss.id);assert.equal(useApp.getState().sketchProfiles[0].projectLinkIssue,'constraints');await preview();assert.equal(await useApp.getState().confirmProjectRelink(),true);assert.deepEqual(useApp.getState().sketchProfiles.find(s=>s.type==='circle').c,[14,0]);await useApp.getState().applySketchEdit(boss.sketchId);await volume(168+3*Math.PI)
})

test('Escape while solve is pending discards its result',async()=>{
 setup();const before=geom();useApp.getState().beginProjectRelink(0);const pending=useApp.getState().selectProjectRelinkCandidate(0);useApp.getState().escSketch();await pending;assert.equal(useApp.getState().projectRelink,null);assert.equal(geom(),before)
})

test('expression-bound dimension and reference IDs survive relink, stale parameter rejects confirmation',async()=>{
 const constrained=[...cons,{id:'k3',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:12,name:'d2',expr:'width',refs:{width:'parameter:width'}}]
 setup({skCons:constrained,params:[{id:'width',name:'width',value:12}]});await preview();assert.equal(await useApp.getState().confirmProjectRelink(),true);assert.deepEqual(useApp.getState().skCons,constrained)
 setup({skCons:constrained,params:[{id:'width',name:'width',value:12}]});await preview();const before=geom();useApp.setState({params:[{id:'width',name:'width',value:14}]});assert.equal(await useApp.getState().confirmProjectRelink(),false);assert.equal(geom(),before)
})

test('pure projected loop with only driving width rejects all-fixed conflict atomically',async()=>{
 setup({sketchProfiles:[structuredClone(loop)],sketchShape:null,skCons:[{id:'width',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:10}]});const before=geom();useApp.getState().beginProjectRelink(0);await useApp.getState().selectProjectRelinkCandidate(0);assert.match(useApp.getState().projectRelink.error,/冲突/);assert.equal(await useApp.getState().confirmProjectRelink(),false);assert.equal(geom(),before)
})
