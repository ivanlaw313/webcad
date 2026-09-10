import test from 'node:test';import assert from 'node:assert/strict';import {register} from 'node:module'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {createPersistentPattern:create,reconfigurePersistentPattern:update}=await import('../src/sketch/persistentPatterns.ts')
const {ellipseArcWithSweep,ellipseArcSample,ellipseArcSweep}=await import('../src/sketch/ellipseArcGeometry.ts')
const rect=(nx=2,ny=1)=>({kind:'rectangular',nx,ny,dx:20,dy:30}),circ=(count=3)=>({kind:'circular',count,angle:-360,cx:10,cy:5})
const initial=()=>({shapes:[{type:'circle',c:[0,0],r:5},{type:'circle',c:[100,0],r:8}],cons:[{id:'r',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,name:'R',expr:'5'}],entityIds:[],patterns:[]})
const good=r=>{assert.equal(r.ok,true,r.reason);return r.document}
test('stable original and surviving instance identities over quantity increase/decrease',()=>{
 const input=initial(),snap=JSON.stringify(input),a=good(create(input,[0],rect(),'p')),b=good(update(a,'p',rect(3))),c=good(update(b,'p',rect()))
 assert.equal(JSON.stringify(input),snap);assert.equal(a.shapes[0],input.shapes[0]);assert.equal(a.shapes[1],input.shapes[1]);assert.deepEqual(c.entityIds,a.entityIds)
 assert.deepEqual(b.patterns[0].instances[0],a.patterns[0].instances[0]);assert.deepEqual(c.patterns[0].instances,a.patterns[0].instances)
 assert.deepEqual(b.shapes.map(s=>s.c),[[0,0],[100,0],[20,0],[40,0]])
})
test('source geometry and driving dimension edit regenerates fresh dependent copies after JSON',()=>{
 const a=good(create(initial(),[0],rect(3),'p')),edited=JSON.parse(JSON.stringify(a));edited.shapes[0].r=6;edited.cons[0].value=6;edited.cons[0].expr='6'
 const b=good(update(edited,'p',{...rect(3),dx:25}));assert.deepEqual(b.shapes.map(s=>s.r),[6,8,6,6]);assert.deepEqual(b.cons.filter(c=>c.kind==='dim').map(c=>c.value),[6,6,6]);assert.deepEqual(b.entityIds,a.entityIds)
})
test('row count reorders instances with explicit index map and external surviving reference remapping',()=>{
 const a=good(create(initial(),[0],rect(2,2),'p')),id=a.patterns[0].instances.find(i=>i.key==='1,0').entityIds[0],idx=a.entityIds.indexOf(id)
 a.cons.push({id:'external',kind:'con',type:'coincident',a:{kind:'pt',shape:idx,idx:0},b:{kind:'pt',shape:1,idx:0}})
 const r=update(a,'p',rect(2,3)),b=good(r),next=b.entityIds.indexOf(id)
 assert.equal(r.indexMap[idx],next);assert.equal(b.cons.find(c=>c.id==='external').a.shape,next);assert.notEqual(idx,next)
})
test('deleting an externally referenced instance rejects without mutation',()=>{
 const a=good(create(initial(),[0],rect(3),'p'));a.cons.push({id:'external',kind:'con',type:'coincident',a:{kind:'pt',shape:3,idx:0},b:{kind:'pt',shape:1,idx:0}})
 const before=JSON.stringify(a),r=update(a,'p',rect());assert.equal(r.ok,false);assert.match(r.reason,/external/);assert.equal(JSON.stringify(a),before)
})
test('formula references to removed instance dimensions reject',()=>{
 const a=good(create(initial(),[0],rect(3),'p')),dim=a.cons.find(c=>c.kind==='dim'&&c.a.shape===3)
 a.cons.push({id:'consumer',kind:'dim',type:'rad',a:{kind:'circle',shape:1},value:5,expr:dim.name,refs:{[dim.name]:'dimension:'+dim.id}})
 assert.equal(update(a,'p',rect()).ok,false)
})
test('internal formula names and bound dimension IDs survive instance updates',()=>{
 const input=initial();input.cons.push({id:'r2',kind:'dim',type:'rad',a:{kind:'circle',shape:1},value:8,name:'Second',expr:'R*2',refs:{R:'dimension:r'}})
 const a=good(create(input,[0,1],rect(),'p')),b=good(update(a,'p',rect(3)))
 for(const id of a.patterns[0].instances[0].generatedConstraintIds){assert.deepEqual(b.cons.find(c=>c.id===id),a.cons.find(c=>c.id===id))}
 const dims=b.cons.filter(c=>c.kind==='dim');assert.equal(new Set(dims.map(c=>c.name)).size,dims.length)
 for(const c of dims.filter(c=>c.refs))assert.ok(dims.some(d=>c.refs[d.name]==='dimension:'+d.id))
})
test('signed circular analytical arc generation preserves identity and construction',()=>{
 const earc=ellipseArcWithSweep({cx:30,cy:5,rx:5,ry:2,rot:30},330,-270),input={shapes:[{type:'poly',earc,pts:ellipseArcSample(earc),open:true,construction:true}],cons:[],entityIds:[],patterns:[]}
 const a=good(create(input,[0],circ(),'p')),b=good(update(a,'p',{...circ(4),angle:180}))
 assert.deepEqual(b.patterns[0].instances[0].entityIds,a.patterns[0].instances[0].entityIds)
 for(const s of b.shapes){assert.equal(ellipseArcSweep(s.earc),-270);assert.equal(s.construction,true);assert.equal(s.open,true)}
 assert.ok(Math.abs(b.shapes[1].earc.cx-20)<1e-8);assert.ok(Math.abs(b.shapes[1].earc.cy-(5+10*Math.sqrt(3)))<1e-8)
})
test('malformed identity vectors, nesting, invalid config and missing source reject',()=>{
 const a=good(create(initial(),[0],rect(),'p'))
 assert.equal(create(a,[2],rect(),'nested').ok,false)
 for(const entityIds of [['x'],['x','x'],['','y']])assert.equal(create({...initial(),entityIds},[0],rect(),'p').ok,false)
 assert.equal(update(a,'p',{...rect(),nx:NaN}).ok,false);assert.equal(update(a,'p',circ()).ok,false)
 a.patterns[0].sourceEntityIds=['missing'];assert.equal(update(a,'p',rect()).ok,false)
})

test('malformed registry cannot claim or remove source constraints',()=>{
 const a=good(create(initial(),[0],rect(),'p'))
 for(const change of [i=>i.generatedConstraintIds.push('r'),i=>i.generatedConstraintIds.push('missing'),i=>i.generatedConstraintIds.push(i.generatedConstraintIds[0])]){
  const d=structuredClone(a);change(d.patterns[0].instances[0]);const before=JSON.stringify(d);assert.equal(update(d,'p',rect()).ok,false);assert.equal(JSON.stringify(d),before)
 }
 const d=structuredClone(a);d.cons[0].id='p:instance:1,0:fake';d.patterns[0].instances[0].generatedConstraintIds.push(d.cons[0].id);assert.equal(update(d,'p',rect()).ok,false)
})
test('total geometry cap counts unrelated original shapes as well as instances',()=>{
 const d=initial();d.shapes=Array.from({length:999},(_,i)=>({type:'circle',c:[i*20,0],r:5}));d.cons=[]
 assert.equal(create(d,[0],rect(),'p').ok,true);assert.equal(create(d,[0],rect(3),'p').ok,false)
})
test('surviving generated name collision with added ordinary dimension is explicit rejection',()=>{
 const a=good(create(initial(),[0],rect(),'p')),name=a.cons.find(c=>c.a.shape===2).name
 a.cons.push({id:'ordinary',kind:'dim',type:'rad',a:{kind:'circle',shape:1},value:8,name})
 const before=JSON.stringify(a),r=update(a,'p',rect(3));assert.equal(r.ok,false);assert.match(r.reason,/name collision/);assert.equal(JSON.stringify(a),before)
})

test('malformed instance membership cannot claim an unrelated original entity',()=>{
 const a=good(create(initial(),[0],rect(),'p'));a.patterns[0].instances[0].entityIds=[a.entityIds[1]]
 const before=JSON.stringify(a);assert.equal(update(a,'p',rect()).ok,false);assert.equal(JSON.stringify(a),before)
})
