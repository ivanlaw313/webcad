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
const {setRefGeo,getRefGeo}=await import('../src/sketch/freesolve.ts')
const g=()=>useApp.getState()
const payload=()=>JSON.parse(JSON.stringify(buildProjectPayload(g())))
const source=(plane,baseZ,c)=>({plane,baseZ,op:'new',height:0,shapes:[{type:'circle',c,r:2}],cons:[
 {id:plane+'gap',kind:'dim',type:'hdist',a:{kind:'pt',shape:0,idx:0},b:{kind:'refpt',idx:0},value:5,param:'Gap',paramId:'gap'},
 {id:plane+'level',kind:'dim',type:'vdist',a:{kind:'pt',shape:0,idx:0},b:{kind:'refpt',idx:0},value:0},
 {id:plane+'radius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:2},
]})
function seed(){
 const active={pts:[[999,777]],segs:[]}
 useApp.setState({...useApp.getInitialState(),mode:'sketch',params:[{id:'gap',name:'Gap',value:5}],cpoints:[[10,-10,7],[20,8,30]],features:[{id:'fxy',type:'sketch',sketchId:'xy'},{id:'fxz',type:'sketch',sketchId:'xz'}],timelinePos:2,
 sketchSources:{xy:source('XY',7,[15,10]),xz:source('XZ',8,[25,30])},sketchProfiles:[{type:'circle',c:[100,100],r:5}],skCons:[{id:'activeR',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,param:'Gap',paramId:'gap'}],skRefGeo:active},true)
 setRefGeo(active);return active
}
test('each saved XY/XZ source resolves its own refpt0 and restores a third active registry',async()=>{
 const active=seed(),before=payload()
 await g().setParam('Gap',7)
 assert.equal(g().params[0].value,7,g().status)
 for(const [id,x,y]of [['xy',17,10],['xz',27,30]]){
  const c=g().sketchSources[id].shapes[0].c
  assert.ok(Math.abs(c[0]-x)<1e-6,`${id}: ${c}`);assert.ok(Math.abs(c[1]-y)<1e-6)
 }
 assert.equal(g().sketchProfiles[0].r,7);assert.equal(getRefGeo(),active)
 await g().undo();assert.deepEqual(payload(),before);assert.equal(getRefGeo(),active)
 await g().redo();assert.equal(g().sketchSources.xz.shapes[0].c[0],27)
})
test('missing per-source reference rejects without reading the active registry at the same index',async()=>{
 const active=seed()
 const sources=structuredClone(g().sketchSources);sources.xz.cons[0].b.idx=9
 useApp.setState({sketchSources:sources});const before=payload(),history=g().sketchUndo
 await g().setParam('Gap',7)
 assert.deepEqual(payload(),before);assert.equal(g().sketchUndo,history);assert.equal(getRefGeo(),active)
 assert.match(g().status,/參考|参考/)
})
