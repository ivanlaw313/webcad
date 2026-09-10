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
const config=nx=>({kind:'rectangular',nx,ny:1,dx:40,dy:0})
const shapes=()=>[...g().sketchProfiles,...(g().sketchShape?[g().sketchShape]:[])]
const payload=()=>JSON.parse(JSON.stringify(buildProjectPayload(g())))
const circleSummary=()=>shapes().map(s=>{assert.equal(s.type,'circle');return [s.c[0],s.c[1],s.r]}).sort((a,b)=>a[0]-b[0]||a[2]-b[2])
const expected=(nx,r=10)=>Array.from({length:nx},(_,i)=>[[i*40,0,r],[i*40,0,r+2]]).flat()
function assertRegistry(){assert.ok(g().skPatternData,'offset must preserve associative pattern');assert.equal(shapes().length,g().skPatternData.entityIds.length,'every appended offset must have a stable entity ID');assert.equal(new Set(g().skPatternData.entityIds).size,shapes().length)}
async function seedOffset(){
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchProfiles:[{type:'circle',c:[0,0],r:10}],skCons:[{id:'radius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:10,name:'Radius'}],appConfirm:async()=>true},true)
 await g().createSketchPattern(config(2))
 assert.equal(shapes().length,2)
 const beforeOffset=payload()
 g().setSketchTool('offset')
 await g().skOffsetAt([10,0])
 assert.ok(g().sizing,'first click selects circle without committing')
 g().setSketchOffsetD(2)
 await g().skOffsetAt([12,0])
 return beforeOffset
}
test('circle-source offset updates corresponding instances and maintains registry identity',async()=>{
 await seedOffset()
 assertRegistry()
 assert.deepEqual(circleSummary(),expected(2),'offset circles follow the selected pattern source')
 assert.equal(g().sketchUndo.length,2,'pattern creation and offset each write one Undo')
})
test('offset survives quantity edit, Undo/Redo and project round trip',async()=>{
 await seedOffset();assertRegistry()
 const before=payload()
 await g().reconfigureSketchPattern(config(3));assertRegistry();assert.deepEqual(circleSummary(),expected(3),g().status)
 await g().undo();assert.deepEqual(payload(),before)
 await g().redo();assert.deepEqual(circleSummary(),expected(3))
 const saved=payload();await g().reset();await g().applyProjectData(saved);assertRegistry();assert.deepEqual(circleSummary(),expected(3))
 await g().reconfigureSketchPattern(config(2));assertRegistry();assert.deepEqual(circleSummary(),expected(2))
})
test('changing source radius preserves the two-millimetre offset across all instances',async()=>{
 await seedOffset();assertRegistry()
 await g().commitSkDim('radius',{value:12,expr:undefined},'Resize offset source')
 assertRegistry();assert.deepEqual(circleSummary(),expected(2,12),g().status)
})

test('undoing offset removes its parameter and redo restores complete binding',async()=>{
 const before=await seedOffset();assertRegistry();const after=payload()
 assert.ok(g().params.length>before.params.length,'offset distance must be editable and persisted')
 await g().undo();assert.deepEqual(payload(),before,'Undo restores geometry, pattern identities and offset parameter atomically')
 await g().redo();assert.deepEqual(payload(),after,'Redo restores the same parameter identity and binding')
})

test('edited and reopened offset pattern extrudes exact annular solids',async()=>{
 await seedOffset();assertRegistry()
 await g().editSkDim('radius',12)
 await g().reconfigureSketchPattern(config(3))
 const saved=payload();await g().reset();await g().applyProjectData(saved)
 assert.deepEqual(circleSummary(),expected(3,12))
 useApp.setState({extrudeHeight:5,sketchOp:'new'})
 await g().extrudeSketch();assert.equal(g().mode,'model',g().status)
 const {importSTEP,measureVolume,getOC}=await import('replicad')
 const solid=await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()]))
 const expectedVolume=3*Math.PI*(14**2-12**2)*5
 assert.ok(Math.abs(measureVolume(solid)-expectedVolume)<1e-5,`annular volume ${measureVolume(solid)} != ${expectedVolume}`)
 const analyzer=new(getOC().BRepCheck_Analyzer)(solid.wrapped,true,false)
 try{assert.ok(analyzer.IsValid_2(),'offset annuli must remain valid native solids')}finally{analyzer.delete();solid.delete()}
})

test('two-sided collapse rejects both offsets without parameter or history changes',async()=>{
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchProfiles:[{type:'circle',c:[0,0],r:10}],skCons:[]},true)
 await g().createSketchPattern(config(2));g().setSketchTool('offset')
 const before=payload(),n=g().sketchUndo.length
 await g().skOffsetAt([10,0]);g().setSketchOffsetD(12);g().toggleSketchOffsetBoth()
 await g().skOffsetAt([22,0]);assert.deepEqual(payload(),before);assert.equal(g().sketchUndo.length,n)
 assert.equal(g().toolPreview,null,'invalid inward half must not leave outward-only preview')
})
test('Esc during offset solve preserves document, parameters and histories',async()=>{
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchProfiles:[{type:'circle',c:[0,0],r:10}],skCons:[]},true)
 await g().createSketchPattern(config(2));g().setSketchTool('offset')
 const before=payload(),n=g().sketchUndo.length
 await g().skOffsetAt([10,0]);g().setSketchOffsetD(2)
 const commit=g().skOffsetAt([12,0]);g().escSketch();await commit
 assert.deepEqual(payload(),before);assert.equal(g().sketchUndo.length,n);assert.equal(g().toolPreview,null)
})

test('editing offset distance through parameter command updates active sketch atomically',async()=>{
 await seedOffset();const param=g().params.find(p=>p.name.startsWith('OffsetGap'));assert.ok(param)
 const before=payload(),n=g().sketchUndo.length
 await g().setParam(param.name,3)
 assert.deepEqual(circleSummary(),[[0,0,10],[0,0,13],[40,0,10],[40,0,13]],g().status)
 assert.equal(g().sketchUndo.length,n+1)
 await g().undo();assert.deepEqual(payload(),before)
 await g().redo();assert.equal(g().params.find(p=>p.id===param.id).value,3)
 assert.deepEqual(circleSummary(),[[0,0,10],[0,0,13],[40,0,10],[40,0,13]])
})

test('collapsing offset parameter update rejects without changing draft or histories',async()=>{
 await seedOffset();const param=g().params.find(p=>p.name.startsWith('OffsetGap'));const before=payload(),undo=g().sketchUndo,redo=g().sketchRedo
 await g().setParam(param.name,-11)
 assert.deepEqual(payload(),before);assert.deepEqual(g().sketchUndo,undo);assert.deepEqual(g().sketchRedo,redo)
})
test('offset parameter expression updates active draft and survives Undo and Redo',async()=>{
 await seedOffset();const param=g().params.find(p=>p.name.startsWith('OffsetGap'));const before=payload()
 await g().setParamExpr(param.name,'1+2')
 assert.deepEqual(circleSummary(),[[0,0,10],[0,0,13],[40,0,10],[40,0,13]],g().status)
 assert.equal(g().params.find(p=>p.id===param.id).expr,'1+2')
 await g().undo();assert.deepEqual(payload(),before)
 await g().redo();assert.equal(g().params.find(p=>p.id===param.id).expr,'1+2')
})

test('offset distance parameter rebuilds extruded annuli and model Undo restores volume',async()=>{
 await seedOffset();const param=g().params.find(p=>p.name.startsWith('OffsetGap'));assert.ok(param)
 useApp.setState({extrudeHeight:5,sketchOp:'new'});await g().extrudeSketch();assert.equal(g().mode,'model',g().status)
 const {importSTEP,measureVolume,getOC}=await import('replicad')
 const verify=async outer=>{const solid=await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()]));const analyzer=new(getOC().BRepCheck_Analyzer)(solid.wrapped,true,false);try{assert.ok(analyzer.IsValid_2());assert.ok(Math.abs(measureVolume(solid)-2*Math.PI*(outer**2-100)*5)<1e-5,`unexpected annular volume for radius ${outer}`)}finally{analyzer.delete();solid.delete()}}
 await verify(12);await g().setParam(param.name,3);await verify(13)
 await g().undo();await verify(12);assert.equal(g().params.find(p=>p.id===param.id).value,2)
 await g().redo();await verify(13);assert.equal(g().params.find(p=>p.id===param.id).value,3)
})
