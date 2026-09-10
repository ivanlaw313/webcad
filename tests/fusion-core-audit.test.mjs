import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import vm from 'node:vm'
import { followExtrudeTopEdges } from '../src/cad/extrudeEdgeFollow.ts'

const base = { id: 'e', type: 'extrude', operation: 'new', height: 20, baseZ: 0, profile: { type: 'rect', width: 60, height: 40 } }
const round = { id: 'f', type: 'fillet', radius: 3, nears: [[30, 0, 20]], edgeFp: ['old'], edgeFpV2: ['old2'] }
test('height edit follows top references and recaptures fingerprints without changing radii or IDs', () => {
 const before = [base, round, { ...round, id:'c', type:'chamfer', distance:2, nears:[[30,40,20]] }]
 const result = followExtrudeTopEdges(before, [{...base,height:30, twist:0, draft:0, symmetric:false, through:false}, ...before.slice(1)], 'e')
 assert.deepEqual(result[1].nears, [[30,0,30]])
 assert.deepEqual(result[2].nears, [[30,40,30]])
 assert.equal(result[1].radius,3); assert.equal(result[1].id,'f'); assert.equal(result[1].edgeFp,undefined)
 assert.deepEqual(before[1].nears, [[30,0,20]])
})
test('height reference following does not cross another solid operation or guess side/bottom picks', () => {
 const bottom = {...round, nears:[[30,0,0],[30,0,10]]}
 assert.deepEqual(followExtrudeTopEdges([base,bottom],[{...base,height:30},bottom],'e')[1],bottom)
 const hole={id:'h',type:'hole'}
 assert.equal(followExtrudeTopEdges([base,hole,round],[{...base,height:30},hole,round],'e')[2],round)
 for(const patch of [{symmetric:true},{plane:'XZ'},{draft:2},{operation:'cut'}]) {
  const e={...base,...patch}
  assert.equal(followExtrudeTopEdges([e,round],[{...e,height:30},round],'e')[1],round)
 }
})
test('input Cmd/Ctrl Undo and Redo remain local; canvas shortcuts still reach model history', () => {
 const src=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
 const body=src.slice(src.indexOf('      const t = e.target'),src.indexOf('      if (e.altKey) return'))
 for(const target of [{tagName:'INPUT'},{tagName:'TEXTAREA'},{tagName:'DIV',isContentEditable:true},{tagName:'CANVAS'}]) {
  for(const key of ['z','y']) {
   let calls=0, prevented=0
   const onKey=vm.runInNewContext(stripTypeScriptTypes(`(e)=>{${body}}`),{useApp:{getState:()=>({undo:()=>calls++,redo:()=>calls++})}})
   onKey({target,key,metaKey:true,preventDefault:()=>prevented++})
   assert.equal(calls,target.tagName==='CANVAS'?1:0)
   assert.equal(prevented,target.tagName==='CANVAS'?1:0)
  }
 }
})
test('zero-distance extrusion is rejected before any geometry or history mutation',async()=>{
 const src=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8')
 const begin=src.lastIndexOf('  extrudeSketch: async () => {')
 const body=src.slice(begin,src.indexOf('    // #9 New Component',begin))+'} finally {} },'
 let state={busy:false,extrudeHeight:0,extrudeExtent:'distance',features:[],undoStack:[]}
 const api=vm.runInNewContext(stripTypeScriptTypes(`({${body}})`),{get:()=>state,set:p=>state={...state,...p}})
 await api.extrudeSketch()
 assert.match(state.status,/非零/);assert.deepEqual(state.features,[]);assert.deepEqual(state.undoStack,[])
})

test('picked-edge rounds never replace the requested size with a smaller successful size',()=>{
 const src=readFileSync(new URL('../src/worker/cad.worker.ts',import.meta.url),'utf8')
 for(const [name,end] of [['roundNearPoint','// Tangent-chain expansion'],['roundNearPoints','// Asymmetric chamfer']]) {
  const begin=src.indexOf(`function ${name}(`)
  const fn=src.slice(begin,src.indexOf(end,begin))
  const context=vm.createContext({_fpCapture:()=>({v1:[],v2:[]}),_recordFillet:()=>{},buildWarnings:[],_lastResolvedFp:null,_lastResolvedFpV2:null,_curOpIndex:0})
  const api=vm.runInContext(stripTypeScriptTypes(fn+`;${name}`),context)
  const attempts=[]
  const shape={edges:[{pointAt:()=>({x:0,y:0,z:20})}],fillet:r=>{attempts.push(r);if(r>20)throw Error('too large');return {solid:true}}}
  assert.throws(()=>api(shape,'fillet',100,name==='roundNearPoint'?[0,0,20]:[[0,0,20]]))
  assert.deepEqual(attempts,[100])
 }
})

test('partial downstream rebuild cannot replace committed geometry or create history',async()=>{
 const src=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8')
 const begin=src.indexOf('  const runFeatures = async')
 const end=src.indexOf('  const editActiveSketchParameter=',begin)
 assert.ok(begin>=0&&end>begin,'shared rebuild transaction must be present')
 const shared=src.slice(begin,end)
 const wrapperStart=src.lastIndexOf('  applyFeatures: async')
 const wrapper=src.slice(wrapperStart,src.indexOf('  undo: () =>',wrapperStart))
 assert.match(wrapper,/await runFeatures\(args\)/)
 const old=[{id:'e',type:'extrude'}], mesh={triangles:[0,1,2],tag:'last valid'}
 let state={features:old,bodyMesh:mesh,sketchSources:{},params:[],paramBindings:{},suppressedIds:[],undoStack:[],redoStack:['redo']}
 const builds=[]
 const api=vm.runInNewContext(stripTypeScriptTypes(`(()=>{${shared};return {${wrapper}}})()`),{
  featureLiveGet:()=>state,featureLiveSet:p=>state={...state,...(typeof p==='function'?p(state):p)},
  cad:{rebuild:async f=>{builds.push(f);return builds.length===1?{triangles:[0,1,2],failed:[{id:'f',error:'radius too large'}]}:mesh}},
  applyParamBindings:f=>f,expandFeats:f=>f,SOLID_TYPES:['extrude'],
  mapKernelFailuresToTimeline:()=>({ids:['f'],errors:{f:'radius too large'}}),docSnap:s=>s,console,
 })
 assert.equal(await api.applyFeatures([...old,{id:'f',type:'fillet'}],'ok'),false)
 assert.equal(state.bodyMesh,mesh);assert.equal(state.features,old);assert.equal(state.undoStack.length,0);assert.deepEqual(state.redoStack,['redo'])
 assert.deepEqual(Array.from(state.failedFeatureIds),['f'])
 assert.equal(builds.length,2); assert.deepEqual(Array.from(builds[1]),old)
})

test('failed model Undo/Redo restores both document metadata and history stacks',async()=>{
 const src=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8')
 const begin=src.lastIndexOf('  undo: () =>')
 const body=src.slice(begin,src.lastIndexOf('  extrudeSketch: async'))
 for(const action of ['undo','redo']) {
  const target={features:[{id:'old'}],components:['old-component']}
  let state={features:[{id:'current'}],components:['current-component'],mode:'model',bodyMesh:{tag:'valid'},bodyTopZ:30,timelinePos:1,undoStack:action==='undo'?[target]:[],redoStack:action==='redo'?[target]:[],applyFeatures:async()=>false}
  const initial=state
  const api=vm.runInNewContext(stripTypeScriptTypes(`({${body}})`),{get:()=>state,set:p=>state={...state,...(typeof p==='function'?p(state):p)},enqueueHistoryTransition:f=>f(),docSnap:s=>({features:s.features,components:s.components})})
  await api[action]()
  assert.equal(state.features,initial.features);assert.equal(state.components,initial.components);assert.equal(state.bodyMesh,initial.bodyMesh)
  assert.equal(state.undoStack,initial.undoStack);assert.equal(state.redoStack,initial.redoStack)
 }
})
