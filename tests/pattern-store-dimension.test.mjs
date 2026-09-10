import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const {createPersistentPattern:create}=await import('../src/sketch/persistentPatterns.ts')
const g=()=>useApp.getState(),json=()=>JSON.parse(JSON.stringify(buildProjectPayload(g())));
function seed(){const r=create({shapes:[{type:'circle',c:[0,0],r:5}],cons:[{id:'radius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,name:'Radius'}],entityIds:[],patterns:[]},[0],{kind:'rectangular',nx:2,ny:1,dx:20,dy:0},'p');assert.equal(r.ok,true);const d=r.document;useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchProfiles:d.shapes,skCons:d.cons,skPatternData:{entityIds:d.entityIds,patterns:d.patterns},appConfirm:async()=>true},true)}
const radii=()=>g().sketchProfiles.map(s=>s.r);
test('actual dimension gateway updates source/copy and one Undo/Redo transaction',async()=>{seed();await g().commitSkDim('radius',{value:7,expr:undefined},'edit');assert.deepEqual(radii(),[7,7]);assert.equal(g().sketchUndo.length,1);await g().undo();assert.deepEqual(radii(),[5,5]);await g().redo();assert.deepEqual(radii(),[7,7]);const saved=json();await g().reset();await g().applyProjectData(saved);await g().commitSkDim('radius',{value:6,expr:undefined,refs:undefined,param:undefined,paramId:undefined},'edit');assert.deepEqual(radii(),[6,6])});
test('formula expression survives gateway and generated constraint reconstruction',async()=>{seed();await g().commitSkDim('radius',{value:7,expr:'3+4',refs:{}},'formula');assert.deepEqual(radii(),[7,7]);assert.deepEqual(g().skCons.filter(c=>c.kind==='dim').map(c=>c.expr),['3+4','3+4'])});
test('generated dimension edit rejects without altering history or geometry',async()=>{seed();const id=g().skCons.find(c=>c.id!=='radius').id,before=json();await g().commitSkDim(id,{value:7},'edit');assert.deepEqual(json(),before);assert.equal(g().sketchUndo.length,0)});
test('source replacement during solve discards stale dimension result',async()=>{seed();const p=g().commitSkDim('radius',{value:7},'edit');useApp.setState({sketchProfiles:structuredClone(g().sketchProfiles)});const before=json();await p;assert.deepEqual(json(),before);assert.equal(g().sketchUndo.length,0)});
test('dimension edit → extrusion → project reload → source edit rebuilds exact volume',async()=>{
 seed();await g().commitSkDim('radius',{value:7,expr:undefined},'edit');useApp.setState({extrudeHeight:5,sketchOp:'new'});await g().extrudeSketch();assert.equal(g().mode,'model',g().status);
 const {importSTEP,measureVolume}=await import('replicad'),volume=async()=>measureVolume(await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()])));
 assert.ok(Math.abs(await volume()-2*Math.PI*49*5)<.001);const f=g().features.find(f=>f.sketchId),saved=json();await g().reset();await g().applyProjectData(saved);await g().editSketchOf(f.id);
 await g().commitSkDim('radius',{value:6,expr:undefined},'edit');assert.deepEqual(radii(),[6,6]);await g().applySketchEdit(f.sketchId);assert.equal(g().mode,'model',g().status);assert.ok(Math.abs(await volume()-2*Math.PI*36*5)<.001);
});
test('direct parameter binding persists on original and generated dimensions through JSON',async()=>{
 seed();useApp.setState({params:[{id:'width',name:'Width',value:8}]});
 await g().commitSkDim('radius',{value:8,param:'Width',paramId:'width',expr:undefined,refs:undefined},'bind');
 assert.deepEqual(radii(),[8,8]);assert.deepEqual(g().skCons.filter(c=>c.kind==='dim').map(c=>c.paramId),['width','width']);
 const saved=json();await g().reset();await g().applyProjectData(saved);assert.deepEqual(g().skCons.filter(c=>c.kind==='dim').map(c=>c.paramId),['width','width']);
});
test('missing direct parameter binding rejects without changing existing sketch or Undo',async()=>{seed();const before=json();await g().commitSkDim('radius',{value:8,param:'Missing',paramId:'missing',expr:undefined,refs:undefined},'bind');assert.deepEqual(json(),before);assert.equal(g().sketchUndo.length,0)});
