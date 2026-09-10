import test from 'node:test'
import assert from 'node:assert/strict'
import {captureSketchParameters,restoreSketchParameters} from '../src/sketch/sketchParameterHistory.ts'
test('scoped restore preserves unrelated edits and their order',()=>{
 const original=[{id:'a',name:'A',value:1},{id:'offset',name:'Offset',value:2},{id:'b',name:'B',value:3}]
 const snap=captureSketchParameters(original,['offset'])
 const changed=[{...original[0],value:99},{...original[1],value:8},{...original[2],value:42},{id:'new',name:'New',value:7}]
 assert.deepEqual(restoreSketchParameters(changed,snap).map(p=>[p.id,p.value]),[['a',99],['offset',2],['b',42],['new',7]])
})
test('absence removes created parameter and inverse restores identical stable ID',()=>{
 const params=[{id:'other',name:'Other',value:5}],before=captureSketchParameters(params,['created'])
 const created=[...params,{id:'created',name:'Thickness',value:2,refs:{Other:'other'},expr:'Other-3'}]
 const inverse=captureSketchParameters(created,before.map(s=>s.id))
 const undone=restoreSketchParameters(created,before)
 assert.deepEqual(undone,params)
 assert.deepEqual(restoreSketchParameters(undone,inverse),created)
})
test('snapshot and restoration do not alias parameter objects or nested refs',()=>{
 const params=[{id:'x',name:'X',value:2,refs:{W:'width'}}],snap=captureSketchParameters(params,['x'])
 params[0].refs.W='changed'
 assert.equal(snap[0].value.refs.W,'width')
 const restored=restoreSketchParameters(params,snap);restored[0].refs.W='again'
 assert.equal(snap[0].value.refs.W,'width');assert.equal(params[0].refs.W,'changed')
})
test('duplicate IDs and mismatched snapshot identities reject before restore',()=>{
 const p={id:'x',name:'X',value:2}
 assert.throws(()=>captureSketchParameters([p,p],['x']),/unique/)
 assert.throws(()=>captureSketchParameters([p],['x','x']),/unique/)
 assert.throws(()=>restoreSketchParameters([p],[{id:'x',value:null},{id:'x',value:p}]),/unique/)
 assert.throws(()=>restoreSketchParameters([p],[{id:'other',value:p}]),/match/)
})
test('restoring missing entries preserves unrelated order and appends in snapshot order',()=>{
 assert.deepEqual(restoreSketchParameters([{id:'b',name:'B',value:1}],[{id:'c',value:{id:'c',name:'C',value:3}},{id:'a',value:{id:'a',name:'A',value:2}}]).map(p=>p.id),['b','c','a'])
})
