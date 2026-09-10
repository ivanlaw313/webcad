import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts'),{importSTEP,measureVolume,getOC}=await import('replicad')
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`)
const shapes=()=>[...useApp.getState().sketchProfiles,...(useApp.getState().sketchShape?[useApp.getState().sketchShape]:[])]
function setup(){useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'mirror',sketchProfiles:[{type:'circle',c:[40,40],r:10},{type:'poly',pts:[[70,10],[70,70]],open:true,construction:true}],skCons:[{id:'sourceCenter',kind:'con',type:'fix',a:{kind:'pt',shape:0,idx:0}},{id:'sourceRadius',name:'dSourceRadius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:10,expr:'10',refs:{}},{id:'axisV',kind:'con',type:'v',a:{kind:'edge',shape:1,idx:0}},{id:'axisLength',kind:'dim',type:'len',a:{kind:'edge',shape:1,idx:0},value:60},{id:'axisX',name:'dAxisX',kind:'dim',type:'hdist',a:{kind:'origin'},b:{kind:'pt',shape:1,idx:0},value:70,expr:'70',refs:{}},{id:'axisY',kind:'dim',type:'vdist',a:{kind:'origin'},b:{kind:'pt',shape:1,idx:0},value:10}],mirrorPick:{shapes:[0],stage:'line',p1:null},extrudeHeight:5,sketchOp:'new'},true)}
function verify(r,x){const all=shapes(),circles=all.filter(s=>s.type==='circle'&&!s.construction);assert.equal(circles.length,2);approx(circles[0].c[0],40);approx(circles[0].c[1],40);approx(circles[1].c[0],2*x-40);approx(circles[1].c[1],40);for(const c of circles)approx(c.r,r);const axis=all.find(s=>s.construction&&s.type==='poly');approx(axis.pts[0][0],x);approx(axis.pts[1][0],x);assert.equal(useApp.getState().skConflict,false,useApp.getState().status)}
async function change(id,value){useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id===id?{...c,value,expr:String(value)}:c)});await useApp.getState().resolveSk()}
async function volume(expected){const sh=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}assert.ok(Math.abs(measureVolume(sh)-expected)<1e-5,`${measureVolume(sh)} != ${expected}`)}
test('off-origin axis mirror follows source radius and axis dimensions through native history/JSON/STEP',async()=>{
 setup();const originalCons=structuredClone(useApp.getState().skCons);await useApp.getState().skMirrorAt([70,40]);verify(10,70);assert.equal(useApp.getState().sketchUndo.length,1);for(const c of originalCons)assert.deepEqual(useApp.getState().skCons.find(d=>d.id===c.id),c)
 await useApp.getState().undo();assert.equal(shapes().length,2);assert.deepEqual(useApp.getState().skCons,originalCons);await useApp.getState().redo();verify(10,70)
 await change('sourceRadius',12);verify(12,70);await change('axisX',80);verify(12,80)
 await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await volume(1440*Math.PI)
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await volume(2304*Math.PI);await useApp.getState().undo();await volume(1440*Math.PI);await useApp.getState().redo();await volume(2304*Math.PI)
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(2304*Math.PI)
 const feat=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(feat.id);verify(12,80);await change('sourceRadius',14);verify(14,80);await useApp.getState().applySketchEdit(feat.sketchId);await volume(3136*Math.PI);await useApp.getState().undo();await volume(2304*Math.PI);await useApp.getState().redo();await volume(3136*Math.PI)
})
test('mirror rejects contradictory source constraints without geometry, constraint or history mutation',async()=>{
 setup();useApp.setState({skCons:[...useApp.getState().skCons,{id:'incompatibleRadius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:12}]});const before=structuredClone({shapes:shapes(),cons:useApp.getState().skCons,undo:useApp.getState().sketchUndo,redo:useApp.getState().sketchRedo});await useApp.getState().skMirrorAt([70,40]);assert.deepEqual(shapes(),before.shapes);assert.deepEqual(useApp.getState().skCons,before.cons);assert.deepEqual(useApp.getState().sketchUndo,before.undo);assert.deepEqual(useApp.getState().sketchRedo,before.redo)
})
test('Esc during asynchronous mirror creation cancels new geometry and history',async()=>{
 setup();const before=structuredClone({shapes:shapes(),cons:useApp.getState().skCons,undo:useApp.getState().sketchUndo,redo:useApp.getState().sketchRedo});const pending=useApp.getState().skMirrorAt([70,40]);assert.equal(useApp.getState().escSketch(),true);await pending;assert.equal(useApp.getState().mode,'sketch');assert.deepEqual(shapes(),before.shapes);assert.deepEqual(useApp.getState().skCons,before.cons);assert.deepEqual(useApp.getState().sketchUndo,before.undo);assert.deepEqual(useApp.getState().sketchRedo,before.redo)
})
test('quick-axis mirror from Select with no selection can be canceled by one Escape',async()=>{
 setup();useApp.setState({sketchTool:'select',mirrorPick:null,skSel:[]});const before=structuredClone({shapes:shapes(),cons:useApp.getState().skCons,undo:useApp.getState().sketchUndo});const pending=useApp.getState().mirrorSketch('y');assert.equal(useApp.getState().escSketch(),true);await pending;assert.equal(useApp.getState().mode,'sketch');assert.deepEqual(shapes(),before.shapes);assert.deepEqual(useApp.getState().skCons,before.cons);assert.deepEqual(useApp.getState().sketchUndo,before.undo)
})
test('changing reference geometry while mirror solves invalidates its pending commit',async()=>{
 setup();const before=structuredClone({shapes:shapes(),cons:useApp.getState().skCons,undo:useApp.getState().sketchUndo});const pending=useApp.getState().skMirrorAt([70,40]);const nextRef={pts:[[100,100]],segs:[]};useApp.setState({skRefGeo:nextRef});await pending;assert.deepEqual(shapes(),before.shapes);assert.deepEqual(useApp.getState().skCons,before.cons);assert.deepEqual(useApp.getState().sketchUndo,before.undo);assert.equal(useApp.getState().skRefGeo,nextRef)
})
