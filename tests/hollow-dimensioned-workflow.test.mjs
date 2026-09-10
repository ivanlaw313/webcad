import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const {importSTEP,measureVolume,getOC,draw}=await import('replicad')
const g=()=>useApp.getState(),near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-4,`${label}: ${a} != ${b}`)
const box=(a,b,z,h)=>draw().movePointerTo(a).lineTo([b[0],a[1]]).lineTo(b).lineTo([a[0],b[1]]).close().sketchOnPlane('XY',z).extrude(h)
async function verify(expected,holes=false){
 assert.deepEqual(g().failedFeatureIds,[],g().status)
 const shape=await importSTEP(new Blob([await w.exportSTEP()])),check=new(getOC().BRepCheck_Analyzer)(shape.wrapped,true,false)
 try{assert.equal(check.IsValid_2(),true)}finally{check.delete()}
 near(measureVolume(shape),expected,'analytic volume')
 if(holes)for(const y of [-40,-2])near(measureVolume(shape.intersect(box([20,y],[26,y+2],10,8))),0,`opening through wall y=${y}`)
 if(g().features.some(f=>f.id==='finish-chamfer')){
  const width=shape.boundingBox.bounds[1][0]
  near(measureVolume(shape.intersect(box([0,-1],[1,0],14,1))),1-(1-Math.PI/4)*.5**2,'rounded corner location')
  near(measureVolume(shape.intersect(box([width-.5,-40],[width,-39.5],14,1))),.25-.5*.2**2,'chamfer corner location')
  if(width>55)near(measureVolume(shape.intersect(box([49.5,-40],[50,-39.5],14,1))),.25,'old chamfer location restored')
 }
 return shape
}
async function append(feature){assert.equal(await g().applyFeatures([...g().features,feature],feature.id),true,g().status)}
test('dimensioned sketch → shell → both-wall transverse cut → fillet/chamfer → upstream dimension/history/JSON/STEP',async()=>{
 const dims=[{id:'anchor',kind:'con',type:'fix',a:{kind:'pt',shape:0,idx:0}},{id:'width',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:50,expr:'50'},{id:'depth',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:1},value:40,expr:'40'}]
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchProfiles:[{type:'rect',a:[0,0],b:[50,40]}],skCons:dims,extrudeHeight:30,sketchOp:'new'},true)
 await g().resolveSk();await g().extrudeSketch();assert.equal(g().mode,'model',g().status);const base=g().features.find(f=>f.sketchId);assert.ok(base);const baseShape=await verify(60000);assert.deepEqual(baseShape.boundingBox.bounds.map(v=>v.map(n=>Math.round(n)||0)),[[0,-40,0],[50,0,30]])
 g().toggleShell();g().setShellThickness(2);g().shellPickAt([25,30,20]);assert.deepEqual(g().shellPicks,[[25,30,20]]);await g().commitShell();assert.deepEqual(g().features.at(-1).nears,[[25,-20,30]]);assert.equal(g().shellMode,false,g().status)
 const shellVolume=width=>width*40*30-(width-4)*36*28
 await verify(shellVolume(50))
 g().sketchOnDatumPlane('XZ',0);useApp.setState({sketchShape:{type:'rect',a:[20,10],b:[26,18]},sketchProfiles:[],sketchOp:'cut',extrudeHeight:100,extrudeExtent:'symmetric',extrudeFlip:false,faceCutThrough:false});await g().extrudeSketch();assert.equal(g().mode,'model',g().status)
 await verify(shellVolume(50)-192,true)
 await append({id:'finish-round',type:'fillet',radius:.5,near:[0,0,15]})
 const roundLoss=(1-Math.PI/4)*.5**2*30;await verify(shellVolume(50)-192-roundLoss,true)
 await append({id:'finish-chamfer',type:'chamfer',distance:.2,near:[50,-40,15]})
 const expected=width=>shellVolume(width)-192-roundLoss-.5*.2**2*30
 await verify(expected(50),true);const ids=g().features.map(f=>f.id)
 await g().editSketchOf(base.id);useApp.setState({skCons:g().skCons.map(c=>c.id==='width'?{...c,value:60,expr:'60'}:c)});await g().resolveSk();await g().applySketchEdit(base.sketchId);assert.equal(g().mode,'model',g().status);await verify(expected(60),true);assert.deepEqual(g().features.map(f=>f.id),ids)
 await g().undo();await verify(expected(50),true);await g().redo();await verify(expected(60),true)
 const saved=JSON.parse(JSON.stringify(buildProjectPayload(g())));useApp.setState({...useApp.getInitialState()},true);await g().applyProjectData(saved);await verify(expected(60),true);assert.deepEqual(g().features.map(f=>f.id),ids)
})
