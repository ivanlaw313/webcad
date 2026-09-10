import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready();const {evalExpr,useApp}=await import('../src/store.ts')
const {createPersistentPattern:create}=await import('../src/sketch/persistentPatterns.ts'),{solvePatternCandidate:solve}=await import('../src/sketch/solvePatternCandidate.ts'),{editPatternDimensions:edit}=await import('../src/sketch/editPatternDimensions.ts')
const good=r=>{assert.equal(r.ok,true,r.reason);return r.document},options={evaluate:evalExpr}
async function seed(){const d={shapes:[{type:'circle',c:[0,0],r:5},{type:'circle',c:[35,0],r:10}],cons:[{id:'r1',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,name:'R1'},{id:'r2',kind:'dim',type:'rad',a:{kind:'circle',shape:1},value:10,name:'R2',expr:'R1*2',refs:{R1:'dimension:r1'}}],entityIds:[],patterns:[]};return good(await solve(d,create(d,[0,1],{kind:'rectangular',nx:2,ny:1,dx:100,dy:0},'p')))}
test('actual expression evaluator propagates source dependency and regenerated copies after JSON',async()=>{
 const d=await seed(),before=JSON.stringify(d),out=good(await edit(d,[{id:'r1',value:7}],options));assert.deepEqual(out.shapes.map(s=>s.r),[7,14,7,14]);assert.equal(JSON.stringify(d),before);
 const again=good(await edit(JSON.parse(JSON.stringify(out)),[{id:'r1',value:6}],options));assert.deepEqual(again.shapes.map(s=>s.r),[6,12,6,12]);
});
test('stable parameter binding overrides same-name dimension and remains bound',async()=>{
 const d=await seed();d.cons.find(c=>c.id==='r2').refs={R1:'width-param'};
 const out=good(await edit(d,[{id:'r1',value:7}],{evaluate:evalExpr,parameters:[{id:'width-param',name:'R1',value:8}]}));assert.deepEqual(out.shapes.map(s=>s.r),[7,16,7,16]);assert.equal(out.cons.find(c=>c.id==='r2').refs.R1,'width-param');
});
test('unresolved stable reference fails without changing input',async()=>{
 const d=await seed();d.cons.find(c=>c.id==='r2').refs={R1:'dimension:missing'};const before=JSON.stringify(d);assert.equal((await edit(d,[{id:'r1',value:7}],options)).ok,false);assert.equal(JSON.stringify(d),before);
});
test('formula dependency cycle fails atomically',async()=>{
 const d=await seed();d.cons.push({id:'loop',kind:'dim',type:'rad',a:{kind:'circle',shape:1},value:10,name:'Loop',expr:'R2',refs:{R2:'dimension:r2'}});d.cons.find(c=>c.id==='r2').expr='Loop';d.cons.find(c=>c.id==='r2').refs={Loop:'dimension:loop'};
 const before=JSON.stringify(d),r=await edit(d,[{id:'r1',value:7}],options);assert.equal(r.ok,false);assert.match(r.reason,/cycl/i);assert.equal(JSON.stringify(d),before);
});

test('formula-updated pattern geometry extrudes with analytical STEP volume and valid BRep',async()=>{
 const d=await seed(),out=good(await edit(d,[{id:'r1',value:7}],options));
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchProfiles:out.shapes,extrudeHeight:5,sketchOp:'new'},true);
 await useApp.getState().extrudeSketch();assert.equal(useApp.getState().mode,'model',useApp.getState().status);
 const {importSTEP,measureVolume,getOC}=await import('replicad'),sh=await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()]));
 const check=new(getOC().BRepCheck_Analyzer)(sh.wrapped,true,false);try{assert.equal(check.IsValid_2(),true);assert.ok(Math.abs(measureVolume(sh)-2*Math.PI*(49+196)*5)<.0001)}finally{check.delete()}
});
