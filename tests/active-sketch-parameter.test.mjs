import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url)
globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url))
register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const g=()=>useApp.getState()
const json=()=>JSON.parse(JSON.stringify(buildProjectPayload(g())))
const seed=()=>useApp.setState({...useApp.getInitialState(),mode:'sketch',params:[{id:'r-param',name:'Radius',value:5,unit:'mm'}],sketchProfiles:[{type:'circle',c:[0,0],r:5},{type:'circle',c:[30,0],r:2}],skCons:[{id:'radius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,param:'Radius',paramId:'r-param'},{id:'center',kind:'con',type:'fix',a:{kind:'pt',shape:0,idx:0}}]},true)
test('ordinary active parameter preserves fixed center and unrelated contour through history',async()=>{
 seed();const before=json();await g().setParam('Radius',7)
 assert.equal(g().sketchProfiles[0].r,7,g().status);assert.deepEqual(g().sketchProfiles[0].c,[0,0]);assert.deepEqual(g().sketchProfiles[1],{type:'circle',c:[30,0],r:2})
 assert.equal(g().sketchUndo.length,1);await g().undo();assert.deepEqual(json(),before);await g().redo();assert.equal(g().sketchProfiles[0].r,7)
})
test('ordinary invalid active parameter preserves all geometry and parameters',async()=>{
 seed();const before=json();await g().setParam('Radius',-1);assert.deepEqual(json(),before);assert.equal(g().sketchUndo.length,0)
})
test('Esc cancels ordinary pending parameter solve',async()=>{
 seed();const before=json();const pending=g().setParam('Radius',8);g().escSketch();await pending;assert.deepEqual(json(),before);assert.equal(g().sketchUndo.length,0)
})
