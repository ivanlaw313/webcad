import test from 'node:test'
import assert from 'node:assert/strict'
import {register} from 'node:module'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {solveFree}=await import('../src/sketch/freesolve.ts')
const {rectangleConstraints}=await import('../src/sketch/rectangleConstraints.ts')
const rect={type:'rect',a:[0,0],b:[60,40]}
const cons=rectangleConstraints([rect],0,[],['d1','d2'],[60,40],true)
test('typed rectangle stores seven relationships and remains fully defined after JSON reload',async()=>{
 assert.equal(cons.length,7);assert.equal(cons.filter(c=>c.kind==='dim').length,2)
 const saved=JSON.parse(JSON.stringify({shapes:[rect],cons}))
 const r=await solveFree(saved.shapes,saved.cons);assert.equal(r.conflict,false);assert.equal(r.dof,0)
 assert.deepEqual(saved.cons.map(c=>c.id),cons.map(c=>c.id))
})
test('editing width drives geometry while preserving origin and H/V',async()=>{
 const changed=cons.map(c=>c.name==='d1'?{...c,value:80}:c)
 const r=await solveFree([rect],changed);assert.equal(r.conflict,false);assert.equal(r.dof,0)
 assert.ok(Math.abs(r.shapes[0].a[0])<1e-7);assert.ok(Math.abs(r.shapes[0].a[1])<1e-7)
 assert.ok(Math.abs(r.shapes[0].b[0]-80)<1e-6);assert.ok(Math.abs(r.shapes[0].b[1]-40)<1e-6)
})
test('fully constrained drag is rejected; partially constrained rectangle keeps one free dimension',async()=>{
 const locked=await solveFree([rect],cons,{ref:{kind:'pt',shape:0,idx:2},to:[75,53]});assert.ok(locked.conflict)
 const partial=rectangleConstraints([rect],0,[],['d3','d4'],[60,null],true)
 const free=await solveFree([rect],partial);assert.equal(free.conflict,false);assert.equal(free.dof,1)
 const moved=await solveFree([rect],partial,{ref:{kind:'pt',shape:0,idx:2},to:[60,55]});assert.equal(moved.conflict,false);assert.ok(Math.abs(moved.shapes[0].b[1]-55)<1e-6)
})
test('conflicting dimension is detected without mutating caller geometry',async()=>{
 const before=JSON.stringify(rect)
 const r=await solveFree([rect],[...cons,{id:'conflict',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:12}]);assert.ok(r.conflict);assert.equal(JSON.stringify(rect),before)
})

test('native wheel rig sketches remain solved after driver changes (actual PlaneGCS)',async()=>{
 const {wheelRig}=await import('../examples/wheel-rig.mjs')
 const base=wheelRig(),variant=wheelRig({Wheelbase:140,WheelDiameter:60,CarWidth:100})
 for(const id of Object.keys(base.sketchSources)){
 const r=await solveFree(base.sketchSources[id].shapes,variant.sketchSources[id].cons)
 assert.equal(r.conflict,false,id);assert.equal(r.dof,0,id)
 for(let i=0;i<r.shapes.length;i++){
 const expected=variant.sketchSources[id].shapes[i],actual=r.shapes[i]
 if(expected.type==='circle'){assert.ok(Math.abs(actual.r-expected.r)<1e-6,id);assert.ok(Math.hypot(actual.c[0]-expected.c[0],actual.c[1]-expected.c[1])<1e-6,id)}
 else assert.ok(Math.hypot(actual.b[0]-expected.b[0],actual.b[1]-expected.b[1])<1e-6,id)
 }
 }
})
