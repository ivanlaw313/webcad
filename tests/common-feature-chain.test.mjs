import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready();const {useApp,buildProjectPayload}=await import('../src/store.ts');const {importSTEP,measureVolume,getOC}=await import('replicad')
const plate={id:'base',type:'extrude',profile:{kind:'rect',a:[-30,-20],b:[30,20]},height:8,operation:'new'}
async function volume(){const shape=await importSTEP(new Blob([await w.exportSTEP()]));const checker=new (getOC().BRepCheck_Analyzer)(shape.wrapped,true,false);try{assert.ok(checker.IsValid_2())}finally{checker.delete()}return measureVolume(shape)}
async function apply(fs){assert.equal(await useApp.getState().applyFeatures(fs,'chain'),true,useApp.getState().status);assert.deepEqual(useApp.getState().failedFeatureIds,[]);return volume()}
async function roundtrip(){const before=await volume(),saved=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...useApp.getInitialState()},true);await useApp.getState().applyProjectData(saved);assert.ok(Math.abs(await volume()-before)<.001);return before}
for(const kind of ['simple','counterbore'])for(const method of ['pattern','mirror','circPattern'])test(`Hole ${kind} → ${method} → another boss → upstream diameter edit → undo/redo → JSON/STEP`,async()=>{
 useApp.setState({...useApp.getInitialState()},true);const hole={id:'hole',type:'hole',kind,center:[-15,0],top:8,diameter:4,through:true,...(kind==='counterbore'?{counterbore:{diameter:8,depth:2}}:{})}
 const repeat=method==='pattern'?{type:'pattern',countX:2,countY:1,dx:30,dy:0}:method==='mirror'?{type:'mirror',plane:'YZ'}:{type:'circPattern',origin:[0,0,0],dir:[0,0,1],count:2,totalAngle:360,mode:'full'};const fs=[plate,hole,{id:'array',...repeat,targets:['hole']}]
 const one=Math.PI*4*8+(kind==='counterbore'?Math.PI*(16-4)*2:0)
 const measured=await apply(fs);console.log('Pattern volume',kind,measured,'expected',19200-2*one);assert.ok(Math.abs(measured-(19200-2*one))<.001,'pattern must copy every cut of the Hole feature')
 fs.push({id:'boss',type:'extrude',profile:{kind:'circle',c:[0,12],r:3},height:3,baseZ:8,operation:'new'});const before=await apply(fs)
 const edited=fs.map(f=>f.id==='hole'?{...f,diameter:5}:f);const after=await apply(edited);assert.ok(after<before)
 const delta=2*Math.PI*(6.25-4)*(kind==='counterbore'?6:8);assert.ok(Math.abs(before-after-delta)<.001)
 await useApp.getState().undo();assert.ok(Math.abs(await volume()-before)<.001);await useApp.getState().redo();assert.ok(Math.abs(await volume()-after)<.001);await roundtrip()
})
test('open shell → floor hole → boss → shell thickness edit preserves downstream geometry and saves',async()=>{
 useApp.setState({...useApp.getInitialState()},true);const base={...plate,height:20},shell={id:'shell',type:'shell',thickness:2,nears:[[0,0,20]]}
 const fs=[base,shell];assert.ok(Math.abs(await apply(fs)-(48000-56*36*18))<.001)
 fs.push({id:'floor-hole',type:'hole',kind:'simple',center:[0,0],top:2,diameter:4,through:true});const drilled=await apply(fs);assert.ok(Math.abs(drilled-(48000-56*36*18-Math.PI*4*2))<.001)
 fs.push({id:'boss',type:'extrude',profile:{kind:'circle',c:[15,0],r:3},height:4,baseZ:2,operation:'new'});const withBoss=await apply(fs);assert.ok(Math.abs(withBoss-drilled-Math.PI*9*4)<.001)
 const edited=fs.map(f=>f.id==='shell'?{...f,thickness:3}:f);const after=await apply(edited);assert.ok(Math.abs(after-(48000-54*34*17-Math.PI*4*3+Math.PI*9*3))<.001);await useApp.getState().undo();assert.ok(Math.abs(await volume()-withBoss)<.001);await useApp.getState().redo();assert.ok(Math.abs(await volume()-after)<.001);await roundtrip()
})
test('late capped-section response cannot overwrite a newer section plane',async()=>{
 useApp.setState({...useApp.getInitialState()},true);await apply([plate]);const original=w.splitBuild,pending=[];w.splitBuild=()=>new Promise(resolve=>pending.push(resolve))
 try {useApp.setState({section:{on:true,capped:true,axis:'X',offset:0,flip:false}});const first=useApp.getState().refreshSectionCap();useApp.setState({section:{on:true,capped:true,axis:'Y',offset:3,flip:false}});const second=useApp.getState().refreshSectionCap();const secondIndex=pending.length-1;const old={vertices:[1,2,3],triangles:[]},fresh={vertices:[4,5,6],triangles:[]};pending[secondIndex]({a:fresh,b:null});await second;pending.forEach((resolve,i)=>{if(i!==secondIndex)resolve({a:old,b:null})});await first;assert.deepEqual(useApp.getState().sectionMesh,fresh)}finally{w.splitBuild=original}
})

test('missing feature-pattern target fails atomically without accepting a partial result',async()=>{useApp.setState({...useApp.getInitialState()},true);const v=await apply([plate]);const before=useApp.getState();assert.equal(await before.applyFeatures([plate,{id:'bad-pattern',type:'pattern',countX:2,countY:1,dx:10,dy:0,targets:['missing']}],'bad'),false);assert.deepEqual(useApp.getState().features,before.features);assert.deepEqual(useApp.getState().undoStack,before.undoStack);assert.ok(Math.abs(await volume()-v)<.001)})
