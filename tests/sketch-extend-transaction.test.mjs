import {register} from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {solveExtension}=await import('../src/sketch/extendTransaction.ts')
const line=()=>({type:'poly',open:true,pts:[[0,0],[30,0]],verts:[[0,0],[30,0]],bulges:[0],construction:true,projectLink:'retained'})
const target={shape:0,end:'end',point:[30,0]}
test('free extension reaches intended endpoint and preserves metadata without mutating input',async()=>{
 const arr=[line()],before=structuredClone(arr),r=await solveExtension(arr,[],target);assert.equal(r.ok,true);assert.deepEqual(arr,before);assert.equal(r.result.shapes[0].projectLink,'retained');assert.equal(r.result.shapes[0].construction,true)
})
test('driving length rejects extension when solver returns shorter geometry, without changing constraints',async()=>{
 const arr=[line()],cons=[{id:'length',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:20},{id:'origin',kind:'con',type:'coincident',a:{kind:'pt',shape:0,idx:0},b:{kind:'origin'}}],before=structuredClone({arr,cons});const r=await solveExtension(arr,cons,target);assert.equal(r.ok,false);assert.match(r.reason,/尺寸|约束/);assert.deepEqual({arr,cons},before)
})
test('conflict and solver failure cannot return accepted candidate',async()=>{
 for(const solve of [async()=>null,async()=>({shapes:[line()],conflict:true}),async()=>{throw Error('failed')}])assert.equal((await solveExtension([line()],[],target,1e-5,solve)).ok,false)
})
