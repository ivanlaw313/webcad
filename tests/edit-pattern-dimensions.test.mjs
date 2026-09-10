import test from 'node:test';import assert from 'node:assert/strict';import {register} from 'node:module'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {createPersistentPattern:create}=await import('../src/sketch/persistentPatterns.ts')
const {solvePatternCandidate:solve}=await import('../src/sketch/solvePatternCandidate.ts')
const {editPatternDimensions:edit}=await import('../src/sketch/editPatternDimensions.ts')
const good=r=>{assert.equal(r.ok,true,r.reason);return r.document}
async function seed(){const d={shapes:[{type:'circle',c:[0,0],r:5},{type:'circle',c:[100,100],r:9}],cons:[{id:'radius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,name:'Radius'}],entityIds:[],patterns:[]};return good(await solve(d,create(d,[0],{kind:'rectangular',nx:3,ny:1,dx:20,dy:0},'p')))}
test('editing only source dimension solves radius then regenerates copies atomically',async()=>{
 const d=await seed(),snapshot=JSON.stringify(d),out=good(await edit(d,[{id:'radius',value:7}]));
 assert.deepEqual(out.shapes.map(s=>s.r),[7,9,7,7]);assert.deepEqual(out.entityIds,d.entityIds);assert.equal(JSON.stringify(d),snapshot);
 const reopened=JSON.parse(JSON.stringify(out)),next=good(await edit(reopened,[{id:'radius',value:6}]));assert.deepEqual(next.shapes.map(s=>s.r),[6,9,6,6]);
});
test('fixed source prevents size change and leaves input intact',async()=>{
 const d=await seed();d.cons.push({id:'fixed-source',kind:'con',type:'fix',a:{kind:'circle',shape:0}});const snapshot=JSON.stringify(d);
 assert.equal((await edit(d,[{id:'radius',value:7}])).ok,false);assert.equal(JSON.stringify(d),snapshot);
});
test('generated dimensions cannot become independent drivers by direct edit',async()=>{
 const d=await seed(),id=d.patterns[0].instances[0].generatedConstraintIds.find(id=>d.cons.find(c=>c.id===id)?.kind==='dim');assert.ok(id);
 assert.equal((await edit(d,[{id,value:7}])).ok,false);assert.deepEqual(d.shapes.map(s=>s.r),[5,9,5,5]);
});
test('invalid batch rejects every edit without partial source change',async()=>{
 const d=await seed(),snapshot=JSON.stringify(d);assert.equal((await edit(d,[{id:'radius',value:7},{id:'missing',value:3}])).ok,false);assert.equal(JSON.stringify(d),snapshot);
 assert.equal((await edit(d,[{id:'radius',value:NaN}])).ok,false);
});
test('nonpositive radius is rejected without creating degenerate pattern instances',async()=>{
 const d=await seed();for(const value of [0,-2])assert.equal((await edit(d,[{id:'radius',value}])).ok,false);
});
