import test from 'node:test'
import assert from 'node:assert/strict'
import {register} from 'node:module'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {constraintsAfterTrim}=await import('../src/sketch/trimConstraints.ts')
const {solveFree,arcResample}=await import('../src/sketch/freesolve.ts')
const {pathPts,bulgeCenter,bulgeRadius}=await import('../src/sketch/sketchOps.ts')
const arc=(a,b,bu=1)=>({type:'poly',open:true,verts:[a,b],bulges:[bu],pts:pathPts([a,b],[bu])})
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`)
const geo=sh=>({c:bulgeCenter(sh.verts[0],sh.verts[1],sh.bulges[0]),r:bulgeRadius(sh.verts[0],sh.verts[1],sh.bulges[0])})
async function solved(shapes,cons){const r=await solveFree(shapes,cons);assert.ok(r);assert.equal(r.conflict,false,JSON.stringify(r));return r.shapes}
test('circle center coincidence retains ID and radius expression metadata after trim, then radius edit',async()=>{
 const shapes=[{type:'circle',c:[0,0],r:10}],parts=[arc([10,0],[-10,0])],cons=[{id:'center',kind:'con',type:'coincident',a:{kind:'pt',shape:0,idx:0},b:{kind:'origin'}},{id:'radius',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:10,name:'d1',expr:'R',refs:{R:'parameter-R'},paramId:'parameter-R'}]
 const mapped=constraintsAfterTrim(shapes,0,parts,cons);assert.equal(mapped.dropped,0);assert.deepEqual(mapped.cons.find(c=>c.id==='center').a,{kind:'center',shape:0,idx:0});assert.equal(mapped.cons.find(c=>c.id==='radius').refs.R,'parameter-R')
 const edited=mapped.cons.map(c=>c.id==='radius'?{...c,value:12}:c),out=await solved(parts,edited),g=geo(out[0]);near(g.c[0],0);near(g.c[1],0);near(g.r,12)
})
test('center distance dimension stays center-to-center and drives translated support',async()=>{
 const shapes=[{type:'circle',c:[20,0],r:10}],parts=[arc([30,0],[10,0])],cons=[{id:'cx',name:'d2',kind:'dim',type:'hdist',a:{kind:'origin'},b:{kind:'pt',shape:0,idx:0},value:20},{id:'cy',kind:'dim',type:'vdist',a:{kind:'origin'},b:{kind:'pt',shape:0,idx:0},value:0},{id:'r',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:10}]
 const mapped=constraintsAfterTrim(shapes,0,parts,cons);assert.equal(mapped.dropped,0);const out=await solved(parts,mapped.cons.map(c=>c.id==='cx'?{...c,value:25}:c));const g=geo(out[0]);near(g.c[0],25);near(g.c[1],0);near(g.r,10)
})
test('whole-circle fix preserves center and radius without fixing the newly cut endpoints',async()=>{
 const parts=[arc([10,0],[-10,0])],mapped=constraintsAfterTrim([{type:'circle',c:[0,0],r:10}],0,parts,[{id:'fixed',kind:'con',type:'fix',a:{kind:'circle',shape:0}}]);assert.equal(mapped.dropped,0);assert.deepEqual(mapped.cons.find(c=>c.id==='fixed').a,{kind:'center',shape:0,idx:0});assert.ok(mapped.cons.some(c=>c.kind==='dim'&&c.type==='rad'&&c.value===10))
 const r=await solveFree(parts,mapped.cons,{ref:{kind:'pt',shape:0,idx:0},to:[8,-6]});assert.equal(r.conflict,false);const g=geo(r.shapes[0]);near(g.c[0],0);near(g.c[1],0);near(g.r,10);near(r.shapes[0].verts[0][0],8);near(r.shapes[0].verts[0][1],-6)
})
test('existing standalone arc center and existing bulge-center refs survive a second trim',async()=>{
 const a=[10,0],b=[-10,0],m=[0,10],part=arc([10,0],[0,10],-Math.tan(Math.PI/8))
 for(const [shape,ref] of [[{type:'poly',open:true,arc:{a,b,m},pts:arcResample(a,b,m)},{kind:'pt',shape:0,idx:2}],[arc(a,b),{kind:'center',shape:0,idx:0}]]){const mapped=constraintsAfterTrim([shape],0,[part],[{id:'center',kind:'con',type:'fix',a:ref}]);assert.equal(mapped.dropped,0);assert.deepEqual(mapped.cons[0].a,{kind:'center',shape:0,idx:0});const out=await solved([part],mapped.cons);near(geo(out[0]).c[0],0);near(geo(out[0]).c[1],0)}
})
test('vanished support drops center relation rather than mapping a coincident endpoint',()=>{
 const parts=[{type:'poly',open:true,pts:[[0,0],[10,0]]}],mapped=constraintsAfterTrim([{type:'circle',c:[0,0],r:10}],0,parts,[{id:'center',kind:'con',type:'fix',a:{kind:'pt',shape:0,idx:0}}]);assert.equal(mapped.dropped,1);assert.ok(!mapped.cons.some(c=>c.id==='center'))
})
