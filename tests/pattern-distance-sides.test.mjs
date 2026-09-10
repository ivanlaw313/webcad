import test from 'node:test'
import assert from 'node:assert/strict'
import {register} from 'node:module'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {patternDistanceSideError}=await import('../src/sketch/patternDistanceSides.ts')
const document=(y=5)=>({shapes:[{type:'poly',pts:[[2,y],[3,y]],open:true},{type:'poly',pts:[[0,0],[10,0]],open:true}],cons:[{id:'distance',kind:'dim',type:'p2l',a:{kind:'pt',shape:0,idx:0},b:{kind:'edge',shape:1,idx:0},value:Math.abs(y)}]})
test('positive distance rejects crossing from either side and touching reference line',()=>{
 for(const y of [5,-5])for(const next of [-y,0]){
  const after=document(next);after.cons[0].value=5
  assert.match(patternDistanceSideError(document(y),after),/cross/)
 }
})
test('same-side resizing passes on both sides',()=>{
 for(const [a,b] of [[5,9],[9,2],[-5,-9],[-9,-2]])assert.equal(patternDistanceSideError(document(a),document(b)),null)
})
test('constraint IDs match reordered documents using their own remapped references',()=>{
 const before=document(),after=document(8)
 after.shapes.reverse();after.cons[0].a.shape=1;after.cons[0].b.shape=0
 after.cons.unshift({id:'other',kind:'con',type:'h',a:{kind:'edge',shape:0,idx:0}})
 assert.equal(patternDistanceSideError(before,after),null)
 after.shapes[1].pts=[[2,-8],[3,-8]]
 assert.match(patternDistanceSideError(before,after),/cross/)
})
test('malformed or degenerate distance references reject',()=>{
 for(const mutate of [d=>{delete d.cons[0].b},d=>{d.cons[0].a.shape=999},d=>{d.cons[0].b.shape=999},d=>{d.shapes[1].pts=[[0,0],[0,0]]}]){
  const after=document();mutate(after)
  assert.match(patternDistanceSideError(document(),after),/cross/)
 }
})
test('driven measurements may cross; new distance IDs have no prior side to preserve',()=>{
 const after=document(-5);after.cons[0].driven=true
 assert.equal(patternDistanceSideError(document(),after),null)
 delete after.cons[0].driven;after.cons[0].id='new-distance'
 assert.equal(patternDistanceSideError(document(),after),null)
})
test('same-side rotation and translation preserve signed side',()=>{
 const after=document();after.shapes=after.shapes.map(sh=>({...sh,pts:sh.pts.map(([x,y])=>[10-y,20+x])}))
 assert.equal(patternDistanceSideError(document(),after),null)
})
