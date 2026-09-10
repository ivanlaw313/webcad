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
async function seed(){
 useApp.setState({...useApp.getInitialState(),params:[{id:'shared-radius',name:'SharedRadius',value:5,unit:'mm'}],appConfirm:async()=>true},true)
 for(const x of [0,40]){
  g().startSketch()
  useApp.setState({sketchProfiles:[{type:'circle',c:[x,0],r:5}],sketchShape:null,skCons:[{id:'radius'+x,name:'R'+x,kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,param:'SharedRadius',paramId:'shared-radius'}],extrudeHeight:5,sketchOp:'new'})
  await g().extrudeSketch();assert.equal(g().mode,'model',g().status)
 }
 const ids=[...new Set(g().features.map(f=>f.sketchId).filter(Boolean))];assert.equal(ids.length,2)
 await volume(5)
 const feature=g().features.find(f=>f.sketchId===ids[0]);await g().editSketchOf(feature.id);assert.equal(g().mode,'sketch',g().status)
 return feature
}
async function volume(radius){const {importSTEP,measureVolume,getOC}=await import('replicad');const shape=await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()]));const analyzer=new(getOC().BRepCheck_Analyzer)(shape.wrapped,true,false);try{assert.ok(analyzer.IsValid_2());assert.ok(Math.abs(measureVolume(shape)-2*Math.PI*radius**2*5)<1e-5,`both solids must have radius ${radius}: volume ${measureVolume(shape)}, expected ${2*Math.PI*radius**2*5}`)}finally{analyzer.delete();shape.delete()}}
test('shared parameter updates live draft and other saved consumer with coherent history',async()=>{
 const feature=await seed();const before=json()
 await g().setParam('SharedRadius',7)
 assert.equal(g().mode,'sketch','parameter edit keeps sketch open');assert.equal(g().sketchProfiles[0].r,7,g().status)
 for(const source of Object.values(g().sketchSources))assert.equal(source.shapes[0].r,7,'every saved consumer source is synchronized')
 await volume(7);await g().undo();assert.deepEqual(json(),before);await volume(5)
 await g().redo();await volume(7);await g().applySketchEdit(feature.sketchId);assert.equal(g().mode,'model',g().status);await volume(7)
 await g().undo();await volume(5);assert.equal(g().params.find(p=>p.id==='shared-radius').value,5)
 await g().redo();await volume(7);assert.equal(g().params.find(p=>p.id==='shared-radius').value,7)
 const saved=json();await g().reset();await g().applyProjectData(saved);await volume(7)
})

test('conflicting secondary source rejects shared update without partial publication',async()=>{
 const feature=await seed();const secondary=Object.keys(g().sketchSources).find(id=>id!==feature.sketchId);assert.ok(secondary)
 const sources=structuredClone(g().sketchSources)
 sources[secondary].cons.push({id:'secondary-fixed',kind:'con',type:'fix',a:{kind:'circle',shape:0}})
 useApp.setState({sketchSources:sources})
 const before=json(),histories=[g().sketchUndo,g().sketchRedo,g().undoStack,g().redoStack],step=await globalThis.__wheelWorker.exportSTEP()
 await g().setParam('SharedRadius',7)
 assert.deepEqual(json(),before,'secondary conflict must not publish new params or any source')
 assert.deepEqual([g().sketchUndo,g().sketchRedo,g().undoStack,g().redoStack],histories)
 assert.equal(await globalThis.__wheelWorker.exportSTEP(),step,'failed transaction preserves native export state')
 assert.equal(g().mode,'sketch');assert.equal(g().busy,false)
})
