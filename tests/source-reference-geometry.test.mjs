import test from 'node:test'
import assert from 'node:assert/strict'
import {register} from 'node:module'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {sourceReferenceGeometry}=await import('../src/sketch/sourceReferenceGeometry.ts')
const {setRefGeo,getRefGeo}=await import('../src/sketch/freesolve.ts')
const mesh={vertices:[0,0,0,10,0,0,0,10,0],triangles:[0,1,2]}
test('cardinal points map CAD into each source plane and reject off-plane points',()=>{
 for(const [plane,point,want]of [['XY',[2,3,7],[2,-3]],['XZ',[2,7,3],[2,3]],['YZ',[7,2,3],[-2,3]]]){
  const result=sourceReferenceGeometry(null,{plane,baseZ:7,shapes:[]},[point,[99,99,99]])
  assert.deepEqual(result.pts,[want]);assert.deepEqual(result.segs,[])
 }
})
test('cardinal own geometry filtering removes only edges with both endpoints owned',()=>{
 const result=sourceReferenceGeometry(mesh,{plane:'XY',shapes:[{type:'poly',pts:[[0,0],[10,0]],open:true}]})
 assert.equal(result.pts.some(p=>p[0]===0&&p[1]===0),false)
 assert.equal(result.segs.length,2)
})
test('Project All geometry remains reference-visible and reconstruction preserves active registry',()=>{
 const active={pts:[[999,999]],segs:[]};setRefGeo(active)
 const result=sourceReferenceGeometry(mesh,{plane:'XY',shapes:[{type:'poly',pts:[[0,0],[10,0]],projectLink:'all'}]})
 assert.equal(result.segs.length,3);assert.equal(getRefGeo(),active)
})
test('arbitrary plane uses local basis without cardinal own filtering or construction extras',()=>{
 const result=sourceReferenceGeometry(mesh,{plane:'XY',arb:{o:[0,0,0],xd:[1,0,0],n:[0,0,1]},shapes:[{type:'rect',a:[0,0],b:[10,10]}]},[[999,999,0]])
 assert.equal(result.segs.length,3)
 assert.ok(result.pts.some(p=>p[0]===0&&p[1]===10))
 assert.equal(result.pts.some(p=>p[0]===999),false)
})
