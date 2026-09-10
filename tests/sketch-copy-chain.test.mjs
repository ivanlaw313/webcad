import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts'),{importSTEP,measureVolume,getOC}=await import('replicad')
const dim={id:'radius',name:'dOriginalRadius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:10,expr:'10',refs:{},tagpos:[47,47]}
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`)
function verify(radius){const s=useApp.getState(),sh=[...s.sketchProfiles,...(s.sketchShape?[s.sketchShape]:[])];assert.equal(sh.length,2);for(const [i,x,r]of [[0,40,radius],[1,70,10]]){assert.equal(sh[i].type,'circle');approx(sh[i].c[0],x);approx(sh[i].c[1],40);approx(sh[i].r,r)}assert.equal(s.skCons.find(c=>c.id==='radius').a.shape,0);assert.equal(s.skConflict,false,s.status)}
async function volume(expected){const sh=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.ok(check.IsValid_2())}finally{check.delete()}assert.ok(Math.abs(measureVolume(sh)-expected)<1e-5,`${measureVolume(sh)} != ${expected}`)}
async function changeRadius(r){useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id==='radius'?{...c,value:r,expr:String(r)}:c)});await useApp.getState().resolveSk();verify(r)}
for(const active of [true,false])test(`${active?'active':'banked'} circle Copy preserves original dimension identity through native feature/history/JSON/STEP`,async()=>{
 const original={type:'circle',c:[40,40],r:10};useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'select',sketchProfiles:active?[]:[original],sketchShape:active?original:null,skSel:[{kind:'circle',shape:0}],skCons:[structuredClone(dim)],extrudeHeight:5,sketchOp:'new'},true)
 useApp.getState().startSkMove();useApp.getState().setSkMoveCopy(true);useApp.getState().skMoveHandleDown('x',[40,40]);useApp.getState().skMoveHandleMove([70,40]);useApp.getState().skMoveHandleUp();await useApp.getState().commitSkMove();await useApp.getState().resolveSk();verify(10);assert.deepEqual(useApp.getState().skCons.find(c=>c.id===dim.id),dim);const copyDim=useApp.getState().skCons.find(c=>c.kind==='dim'&&c.a.shape===1);assert.ok(copyDim);assert.notEqual(copyDim.id,dim.id);assert.notEqual(copyDim.name,dim.name);assert.equal(copyDim.value,10);assert.equal(copyDim.expr,'10');assert.equal(useApp.getState().skCons.length,2);assert.equal(useApp.getState().sketchUndo.length,1)
 await useApp.getState().undo();assert.deepEqual(useApp.getState().skCons,[dim]);assert.equal([...useApp.getState().sketchProfiles,...(useApp.getState().sketchShape?[useApp.getState().sketchShape]:[])].length,1);await useApp.getState().redo();verify(10);assert.deepEqual(useApp.getState().skCons.find(c=>c.id===copyDim.id),copyDim)
 await changeRadius(12);await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);await volume(1220*Math.PI)
 assert.equal(await useApp.getState().applyFeatures(useApp.getState().features.map(f=>({...f,height:8})),'height8'),true);await volume(1952*Math.PI);await useApp.getState().undo();await volume(1220*Math.PI);await useApp.getState().redo();await volume(1952*Math.PI)
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(payload);await volume(1952*Math.PI)
 const feat=useApp.getState().features.find(f=>f.sketchId);await useApp.getState().editSketchOf(feat.id);verify(12);await changeRadius(14);await useApp.getState().applySketchEdit(feat.sketchId);await volume(2368*Math.PI)
 await useApp.getState().undo();await volume(1952*Math.PI);await useApp.getState().redo();await volume(2368*Math.PI)
})
