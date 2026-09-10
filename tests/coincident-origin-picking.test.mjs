import test from 'node:test'
import assert from 'node:assert/strict'
import {register} from 'node:module'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {hitTest,setRefGeo}=await import('../src/sketch/freesolve.ts')
setRefGeo(null)
const shapes=[{type:'circle',c:[0,0],r:10}]
test('editable circle centre wins exact overlap with origin',()=>assert.deepEqual(hitTest(shapes,[0,0],2),{kind:'pt',shape:0,idx:0}))
test('origin remains selectable when overlapping geometry is excluded',()=>assert.deepEqual(hitTest(shapes,[0,0],2,r=>'shape'in r),{kind:'origin'}))
test('empty origin and nearer origin remain selectable',()=>{assert.deepEqual(hitTest([],[0,0],2),{kind:'origin'});assert.deepEqual(hitTest([{type:'circle',c:[1,0],r:10}],[0,0],2),{kind:'origin'})})
test('visually coincident centre tolerates roundoff without stealing a distinct origin',()=>{assert.deepEqual(hitTest([{type:'circle',c:[0.01,0],r:10}],[0,0],2),{kind:'pt',shape:0,idx:0});assert.deepEqual(hitTest([{type:'circle',c:[0.2,0],r:10}],[0,0],2),{kind:'origin'})})
