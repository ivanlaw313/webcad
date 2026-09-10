// Read-only product audit: standalone executable, intentionally outside *.test.mjs.
// Records an observed feature gap; it does not turn a failing geometry requirement
// into a passing regression test. Run with the repository resolver import.
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs/promises'
globalThis.require=createRequire(import.meta.url)
globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url))
register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts')
const w=globalThis.__wheelWorker;await w.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const {importSTEP,measureVolume,getOC}=await import('replicad')
const base={id:'base',type:'extrude',profile:{kind:'rect',a:[-10,-10],b:[10,10]},height:10,operation:'new'}
async function geometry(){
 const shape=await importSTEP(new Blob([await w.exportSTEP()])),check=new (getOC().BRepCheck_Analyzer)(shape.wrapped,true,false)
 try{assert.ok(check.IsValid_2(),'audit geometry must be a valid B-rep')}finally{check.delete()}
 return {volume:measureVolume(shape),bounds:shape.boundingBox.bounds,boundsNote:'OCCT mesh-dependent bounding box; volume is the independent audit criterion'}
}
async function fixture(){
 useApp.setState({...useApp.getInitialState()},true)
 assert.equal(await useApp.getState().applyFeatures([base,{id:'move',type:'transform',dx:0,dy:0,dz:0,rz:0}],'audit'),true)
 await useApp.getState().startSketchOnFace([4,10,0],[0,0,1])
 const pending=structuredClone(useApp.getState().pendingSketchFaceBinding)
 assert.equal(pending.sourceId,'move')
 useApp.setState({sketchShape:{type:'circle',c:[4,0],r:1},sketchOp:'new'})
 await useApp.getState().runCommand('revolve')
 const payloadHasFaceBinding=!!useApp.getState().featDlg?.payload?.bundle?.faceBinding
 await useApp.getState().commitFeatDlg()
 const state=useApp.getState(),revolve=state.features.find(f=>f.type==='revolve')
 assert.ok(revolve,state.status)
 const initial=await geometry(),expected=4000+4*Math.PI*Math.PI
 assert.ok(Math.abs(initial.volume-expected)<.001,`initial half torus volume ${initial.volume}, expected ${expected}`)
 return {pending,payloadHasFaceBinding,sourceHasFaceBinding:!!state.sketchSources[revolve.sketchId]?.faceBinding,featureHasFaceBinding:!!revolve.sketchFaceBinding,initial,revolve}
}
function meshVolume(mesh){
 const v=mesh.vertices,t=mesh.triangles;let total=0
 for(let i=0;i<t.length;i+=3){const a=t[i]*3,b=t[i+1]*3,c=t[i+2]*3;total+=v[a]*(v[b+1]*v[c+2]-v[b+2]*v[c+1])+v[a+1]*(v[b+2]*v[c]-v[b]*v[c+2])+v[a+2]*(v[b]*v[c+1]-v[b+1]*v[c])}
 return Math.abs(total/6)
}
const observations=[]
for(const change of ['height','translation']){
 const start=await fixture()
 const beforeState=useApp.getState(),beforeMeshVolume=meshVolume(beforeState.bodyMesh)
 const changed=useApp.getState().features.map(f=>change==='height'&&f.id==='base'?{...f,height:15}:change==='translation'&&f.id==='move'?{...f,dx:4,dy:3,dz:3}:f)
 const accepted=await useApp.getState().applyFeatures(changed,'audit upstream change'),actual=await geometry()
 const expected=change==='height'?{volume:6000+4*Math.PI*Math.PI,sketchBaseZ:15}:{volume:start.initial.volume,bounds:start.initial.bounds.map(b=>b.map((x,i)=>x+[4,3,3][i]))}
 const source=Object.values(useApp.getState().sketchSources)[0]
 const saved=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())))
 observations.push({change,accepted,start,actual,expected,status:useApp.getState().status,storeBaseHeight:useApp.getState().features.find(f=>f.id==='base')?.height,bodyMeshSameReference:useApp.getState().bodyMesh===beforeState.bodyMesh,beforeMeshVolume,afterMeshVolume:meshVolume(useApp.getState().bodyMesh),sourceBaseZ:source.baseZ,savedSourceHasBinding:!!Object.values(saved.sketchSources ?? {})[0]?.faceBinding,gap:Math.abs(actual.volume-expected.volume)>.001})
}
const result={status:observations.every(x=>x.gap)?'CONFIRMED_GAP':'REVIEW_REQUIRED',observations}
await fs.writeFile(new URL('../../../outputs/WebCAD-face-revolve-audit.json',import.meta.url),JSON.stringify(result,null,2))
console.log(JSON.stringify(result,null,2))
