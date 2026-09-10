import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {stripTypeScriptTypes} from 'node:module'
import {dimensionExpression} from '../src/cad/dimensionExpression.ts'
const source=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8')
const evaluator=source.slice(source.indexOf('const D2R ='),source.indexOf('// DEV-only hook')).replace('export function evalExpr','function evalExpr')
const evalExpr=vm.runInNewContext(stripTypeScriptTypes(evaluator+';evalExpr'))
const params=[{id:'pW',name:'W',unit:'mm',value:176}]
test('mixed additions use display units, while multiplication keeps scalar factors',()=>{
 for(const [scale,input,value] of [[10,'W+1',186],[10,'1+W',186],[10,'W-1',166],[10,'W+(-1)',166],[25.4,'W+(1+1)',226.8],[10,'W*2',352],[10,'W/2',88],[10,'W+1 cm',186],[10,'1',10]]) assert.ok(Math.abs((dimensionExpression(input,params,evalExpr,'mm',undefined,scale).value??NaN)-value)<1e-8,input)
 const d=dimensionExpression('W+1',params,evalExpr,'mm',undefined,10).formula
 const saved=JSON.parse(JSON.stringify(d))
 assert.equal(dimensionExpression(saved.expression,params,evalExpr,saved.unit,saved.refs,saved.implicitScale).value,186)
})
test('dimensioned functions and remainder are independent of argument order',()=>{
 for(const input of ['min(1,20 mm)','min(20 mm,1)']) assert.equal(dimensionExpression(input,[],evalExpr,'mm',undefined,10).value,10)
 for(const input of ['max(1,20 mm)','max(20 mm,1)']) assert.equal(dimensionExpression(input,[],evalExpr,'mm',undefined,10).value,20)
 assert.equal(dimensionExpression('mod(W,10)',params,evalExpr,'mm',undefined,10).value,76)
 assert.equal(dimensionExpression('W%10',params,evalExpr,'mm',undefined,10).value,76)
})
test('invalid mod zero cannot be hidden by addition or another function',()=>{
 for(const input of ['mod(W,0)+10 mm','mod(W,0)','W%0','W/0','min(mod(W,0),10 mm)']) assert.ok(dimensionExpression(input,params,evalExpr).error,input)
 assert.equal(evalExpr('mod(176,0)+10',new Map()),null)
})
test('actual edit open and preview keep saved IDs across rename and name reuse',async()=>{
 const f={id:'e',type:'extrude',height:193.6,symmetric:true,distanceExpression:{expression:'W/2',refs:{W:'pW'},unit:'mm',implicitScale:1,measure:'half'}}
 let state={features:[f],params:[{...params[0],name:'Width',value:193.6},{id:'other',name:'W',unit:'mm',value:20}],paramBindings:{},suppressedIds:[]}
 let preview
 const open=source.slice(source.lastIndexOf('  openFeatDlgForEdit: ('),source.indexOf('  // T775（S55-③）'))
 const prev=source.slice(source.indexOf('  previewExtrudeEdit: async'),source.indexOf('  setFeatParam:',source.indexOf('  previewExtrudeEdit: async')))
 const api=vm.runInNewContext(stripTypeScriptTypes('({'+open+prev+'})'),{get:()=>state,set:p=>state={...state,...p},_editPreviewSeq:0,_previewFeatures:new WeakMap(),dimensionExpression,evalExpr,applyParamBindings:f=>f,expandFeats:f=>f,cad:{previewRound:async f=>{preview=f;return f}}})
 api.openFeatDlgForEdit('e');await api.previewExtrudeEdit();assert.equal(preview[0].height,193.6)
 state.featDlg.params.heightExpr='W/4';await api.previewExtrudeEdit();assert.equal(preview[0].height,96.8)
 state.featDlg.params.heightExpr='Width/2';await api.previewExtrudeEdit();assert.equal(preview[0].height,193.6)
 state.featDlg.params.heightExpr='W/2';state.params=state.params.filter(p=>p.id!=='pW');preview=undefined
 assert.equal(await api.previewExtrudeEdit(),null);assert.equal(preview,undefined)
})
test('parameter edits lock during asynchronous solve and restore the document on failure',async()=>{
 const start=source.indexOf('  setParam: async (name, value) => {')
 const methods=source.slice(start,source.indexOf('  removeParam: async',start))
 let release
 let state={params:[{id:'w',name:'W',value:176}],features:[{id:'e'}],sketchSources:{sk:{shapes:['original']}},undoStack:['before'],redoStack:['redo'],busy:false}
 const original=structuredClone(state)
 let calls=0
 state.applyParamSketches=()=>new Promise((_,reject)=>{release=()=>reject(Error('solver conflict'))})
 state.applyFeatures=async()=>{calls++;return true}
 const api=vm.runInNewContext(stripTypeScriptTypes('({'+methods+'})'),{get:()=>state,set:p=>state={...state,...(typeof p==='function'?p(state):p)},docSnap:s=>structuredClone({params:s.params,features:s.features,sketchSources:s.sketchSources}),recomputeParams:p=>p,parameterExpressionRefs:()=>({})})
 const first=api.setParam('W',193.6)
 assert.equal(state.busy,true)
 await api.setParam('W',200)
 assert.equal(state.params[0].value,193.6)
 release();await first
 assert.deepEqual(state.params,original.params);assert.deepEqual(state.features,original.features);assert.deepEqual(state.sketchSources,original.sketchSources)
 assert.deepEqual(state.undoStack,original.undoStack);assert.deepEqual(state.redoStack,original.redoStack);assert.equal(state.busy,false);assert.equal(calls,0)
})
test('dependency cycles follow stable IDs after rename and name reuse',async()=>{
 const {assertParameterAcyclic}=await import('../src/cad/dimensionExpression.ts')
 assert.throws(()=>assertParameterAcyclic([{id:'a',name:'Width',value:10,expr:'B',refs:{B:'b'}},{id:'b',name:'B',value:10,expr:'W',refs:{W:'a'}},{id:'other',name:'W',value:20}]),/循环/)
 assert.doesNotThrow(()=>assertParameterAcyclic([{id:'a',name:'Width',value:10},{id:'b',name:'B',value:10,expr:'W',refs:{W:'a'}},{id:'other',name:'W',value:20}]))
})
