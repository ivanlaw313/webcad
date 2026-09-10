import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready()
const {useApp}=await import('../src/store.ts');const {ellipseArcWithSweep,ellipseArcSample}=await import('../src/sketch/ellipseArcGeometry.ts')
const g=()=>useApp.getState(),all=()=>[...g().sketchProfiles,...(g().sketchShape?[g().sketchShape]:[])],snap=()=>structuredClone({shapes:all(),cons:g().skCons,params:g().params,undo:g().sketchUndo,redo:g().sketchRedo})
function seed(extra={}){useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'array',sketchProfiles:[{type:'circle',c:[0,0],r:5},{type:'circle',c:[100,0],r:9}],skSel:[{kind:'circle',shape:0}],skCons:[{id:'sourceRadius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,name:'dRadius'}],...extra},true)}

test('solved preview preserves source/history and exactly matches committed copies',async()=>{
 seed();const before=snap();g().setArrayCfg({nx:2,dx:20,ny:1,dy:0});
 await g().previewArray();assert.equal(g().arrayPreview.pending,false);assert.equal(g().arrayPreview.error,null);
 const preview=structuredClone(g().arrayPreview.shapes);assert.ok(preview?.length);assert.deepEqual(snap(),before);
 await g().applyArray();assert.deepEqual(all().slice(2),preview);assert.equal(g().sketchUndo.length,before.undo.length+1);
 await g().undo();assert.deepEqual(all(),before.shapes);await g().redo();assert.deepEqual(all().slice(2),preview);
});
test('uncopied formula dependency reports preview failure before Apply without mutations',async()=>{
 seed({skCons:[{id:'r0',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,name:'d0'}, {id:'r1',kind:'dim',type:'rad',a:{kind:'circle',shape:1},value:10,name:'d1',expr:'d0*2',refs:{d0:'dimension:r0'}}],skSel:[{kind:'circle',shape:1}]});
 const before=snap();await g().previewArray();assert.equal(g().arrayPreview.shapes,null);assert.match(g().arrayPreview.error,/uncopied dimension/i);assert.deepEqual(snap(),before);
});
test('new invalid config immediately clears previous successful preview and recovers',async()=>{
 seed();await g().previewArray();assert.ok(g().arrayPreview.shapes);const before=snap();g().setArrayCfg({nx:1.5});const p=g().previewArray();assert.equal(g().arrayPreview.shapes,null);await p;assert.ok(g().arrayPreview.error);assert.deepEqual(snap(),before);
 g().setArrayCfg({nx:2});await g().previewArray();assert.ok(g().arrayPreview.shapes);assert.equal(g().arrayPreview.error,null);
});
test('cancel during solve cannot restore ghosts or alter history',async()=>{
 seed();const before=snap(),p=g().previewArray();useApp.setState({sketchTool:'select'});await g().previewArray();await p;
 assert.equal(g().arrayPreview.shapes,null);assert.equal(g().arrayPreview.pending,false);assert.deepEqual(snap(),before);
});
test('new config supersedes pending solve, only newest copies remain',async()=>{
 seed();g().setArrayCfg({nx:2,dx:20,ny:1,dy:0});const first=g().previewArray();g().setArrayCfg({dx:35});const second=g().previewArray();await Promise.all([first,second]);
 assert.deepEqual(g().arrayPreview.shapes,[{type:'circle',c:[35,0],r:5}]);assert.equal(all().length,2);assert.equal(g().sketchUndo.length,0);
});
