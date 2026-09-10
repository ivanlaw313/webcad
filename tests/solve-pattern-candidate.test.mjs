import test from 'node:test';import assert from 'node:assert/strict';import {register} from 'node:module'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {createPersistentPattern:create,reconfigurePersistentPattern:update}=await import('../src/sketch/persistentPatterns.ts')
const {solvePatternCandidate:solve}=await import('../src/sketch/solvePatternCandidate.ts')
const cfg=dx=>({kind:'rectangular',nx:2,ny:1,dx,dy:0})
const initial=()=>({shapes:[{type:'circle',c:[0,0],r:5},{type:'poly',open:true,pts:[[20,0],[30,0]]},{type:'circle',c:[100,100],r:9}],cons:[],entityIds:[],patterns:[]})
const good=r=>{assert.equal(r.ok,true,r.reason);return r.document}
function connected(){const d=good(create(initial(),[0],cfg(20),'p'));d.cons.push({id:'join',kind:'con',type:'coincident',a:{kind:'pt',shape:3,idx:0},b:{kind:'pt',shape:1,idx:0}});return d}
test('creation preserves original geometry and never persists temporary pins',async()=>{const d=initial(),snapshot=JSON.stringify(d),c=create(d,[0],cfg(20),'p'),r=await solve(d,c);good(r);assert.equal(JSON.stringify(d),snapshot);assert.deepEqual(r.document.shapes.slice(0,3),d.shapes);assert.deepEqual(r.document.shapes[3].c,[20,0]);assert.equal(r.document.cons.some(c=>c.id.startsWith('pattern-temporary-pin:')),false)})
test('spacing edit moves connected free line but retains source and unrelated geometry',async()=>{const d=connected(),snapshot=JSON.stringify(d),c=update(d,'p',cfg(35)),candidateSnapshot=JSON.stringify(c),r=await solve(d,c),out=good(r);assert.ok(Math.abs(out.shapes[1].pts[0][0]-35)<1e-7);assert.deepEqual(out.shapes[0],d.shapes[0]);assert.deepEqual(out.shapes[2],d.shapes[2]);assert.deepEqual(out.shapes[3].c,[35,0]);assert.equal(JSON.stringify(d),snapshot);assert.equal(JSON.stringify(c),candidateSnapshot)})
test('fixed connected endpoint rejects whole transaction without moving original anchors',async()=>{const d=connected();d.cons.push({id:'fixed-end',kind:'con',type:'fix',a:{kind:'pt',shape:1,idx:0}});const snapshot=JSON.stringify(d),r=await solve(d,update(d,'p',cfg(35)));assert.equal(r.ok,false);assert.equal(JSON.stringify(d),snapshot)})
test('user Fix on generated instance cannot be silently rebased to new spacing',async()=>{const d=connected();d.cons.push({id:'fixed-instance',kind:'con',type:'fix',a:{kind:'circle',shape:3}});const r=await solve(d,update(d,'p',cfg(35)));assert.equal(r.ok,false);assert.match(r.reason,/Fix/)})
test('candidate cannot pre-move unrelated geometry before solving',async()=>{const d=connected(),c=update(d,'p',cfg(35));c.document.shapes=structuredClone(c.document.shapes);c.document.shapes[2].c=[999,999];assert.equal((await solve(d,c)).ok,false)})
test('quantity growth and shrink retain connected instance identity after JSON roundtrip',async()=>{
 let d=connected();const originalId=d.entityIds[3];
 d=good(await solve(d,update(d,'p',{...cfg(25),nx:3})));
 assert.equal(d.entityIds[3],originalId);assert.ok(Math.abs(d.shapes[1].pts[0][0]-25)<1e-7);
 d=JSON.parse(JSON.stringify(d));d=good(await solve(d,update(d,'p',cfg(40))));
 assert.equal(d.entityIds[3],originalId);assert.equal(d.shapes.length,4);assert.ok(Math.abs(d.shapes[1].pts[0][0]-40)<1e-7);
 assert.deepEqual(d.cons.find(c=>c.id==='join').a,{kind:'pt',shape:3,idx:0});
});
test('removing a referenced last instance rejects and preserves the complete document',async()=>{
 let d=initial();d=good(await solve(d,create(d,[0],{...cfg(20),nx:3},'p')));
 d.cons.push({id:'last-join',kind:'con',type:'coincident',a:{kind:'pt',shape:4,idx:0},b:{kind:'pt',shape:1,idx:0}});
 const snapshot=JSON.stringify(d);const r=await solve(d,update(d,'p',cfg(20)));assert.equal(r.ok,false);assert.match(r.reason,/last-join/);assert.equal(JSON.stringify(d),snapshot);
});
test('source radius regeneration updates all dependent dimensions after JSON',async()=>{
 let d=initial();d.cons=[{id:'radius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:5,name:'Radius'}];
 d=good(await solve(d,create(d,[0],{...cfg(20),nx:3},'p')));
 d=JSON.parse(JSON.stringify(d));d.shapes[0].r=7;d.cons.find(c=>c.id==='radius').value=7;
 const out=good(await solve(d,update(d,'p',{...cfg(25),nx:3})));
 assert.deepEqual([0,3,4].map(i=>out.shapes[i].r),[7,7,7]);assert.deepEqual(out.cons.filter(c=>c.kind==='dim').map(c=>c.value),[7,7,7]);assert.equal(out.shapes[2].r,9);
});
test('invalid restored Fix reference returns failure instead of throwing',async()=>{
 const d=connected();d.cons.push({id:'fixed',kind:'con',type:'fix',a:{kind:'circle',shape:0}});
 const c=update(d,'p',cfg(25));assert.equal(c.ok,true);c.document.cons.find(x=>x.id==='fixed').a.shape=999;
 const result=await solve(d,c);assert.equal(result.ok,false);assert.match(result.reason,/invalid.*reference/i);
});
