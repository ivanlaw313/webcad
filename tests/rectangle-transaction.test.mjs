import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {register,stripTypeScriptTypes} from 'node:module'
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {solveFree}=await import('../src/sketch/freesolve.ts')
const {rectangleConstraints}=await import('../src/sketch/rectangleConstraints.ts')
const source=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8')
const evaluator=source.slice(source.indexOf('const D2R ='),source.indexOf('// DEV-only hook')).replace('export function evalExpr','function evalExpr')
const evalExpr=vm.runInNewContext(stripTypeScriptTypes(evaluator+';evalExpr'))
// Extract the complete function using its next declaration, not a reimplementation.
const end=source.indexOf('const maxDimSeq =',source.indexOf('const withParamVals ='))
const withParamVals=vm.runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('const withParamVals ='),end)+';withParamVals'),{evalExpr,parameterId:p=>p.id,_degenDimNotes:new Set()})
const methods=source.slice(source.indexOf('  commitSkDim: async'),source.indexOf('  // ── 参数化组件',source.indexOf('  commitSkDim: async')))
const snapshot=s=>structuredClone({sketchShape:s.sketchShape,sketchProfiles:s.sketchProfiles,skCons:s.skCons})
function harness(){const rect={type:'rect',a:[0,0],b:[60,40]};let s={mode:'sketch',sketchProfiles:[],sketchShape:rect,skCons:rectangleConstraints([rect],0,[],['d1','d2'],[60,40],true),params:[],sketchUndo:[],sketchRedo:['existing'],resolveSk:async()=>{}};const api=vm.runInNewContext(stripTypeScriptTypes('({'+methods+'})'),{get:()=>s,set:p=>s={...s,...p},solveFree,withParamVals,_degenDimNotes:new Set(),skSnap:snapshot});s.commitSkDim=api.commitSkDim;return {api,get:()=>s,set:p=>s={...s,...p}}}
test('actual store dimension transaction solves then commits one undo item',async()=>{const h=harness();const id=h.get().skCons.find(c=>c.name==='d1').id;await h.api.commitSkDim(id,{value:80},'edit');assert.equal(h.get().skDof,0);assert.equal(h.get().sketchUndo.length,1);assert.equal(h.get().sketchRedo.length,0);assert.ok(Math.abs(h.get().sketchShape.b[0]-80)<1e-7)})
test('failed actual edit preserves old formula, IDs, coordinates and undo/redo',async()=>{const h=harness();let s=h.get();const width=s.skCons.find(c=>c.name==='d1');width.expr='W';width.refs={W:'width-id'};h.set({params:[{id:'width-id',name:'Width',value:60}],skCons:[...s.skCons,{id:'lock',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:60}]});const before=snapshot(h.get());await h.api.commitSkDim(width.id,{value:80,expr:undefined,refs:undefined},'edit');assert.deepEqual(snapshot(h.get()),before);assert.equal(h.get().sketchUndo.length,0);assert.deepEqual(h.get().sketchRedo,['existing']);assert.match(h.get().status,/失败/)})
test('stored sketch expression ID survives rename, reuse and JSON; dimension dependency updates',()=>{const cons=[{id:'a',kind:'dim',name:'d1',value:60,expr:'W',refs:{W:'width-id'}},{id:'b',kind:'dim',name:'d2',value:30,expr:'d1/2',refs:{d1:'dimension:a'}}];const out=withParamVals(JSON.parse(JSON.stringify(cons)),[{id:'width-id',name:'Width',value:90},{id:'new',name:'W',value:5}]);assert.equal(out[0].value,90);assert.equal(out[1].value,45)})

test('actual typed rectangle creation, undo and redo preserve constraints in one step',async()=>{
 const typed=source.slice(source.indexOf('  sketchTypeKey: (key) =>'),source.indexOf('  closePolyline: () =>',source.indexOf('  sketchTypeKey: (key) =>')))
 const history=source.slice(source.indexOf('  undo: () => enqueueHistoryTransition'),source.indexOf('  extrudeSketch: async',source.indexOf('  undo: () => enqueueHistoryTransition')))
 const names=source.slice(source.indexOf('const maxDimSeq ='),source.indexOf('const nextDimName ='))
 let s={mode:'sketch',sketchTool:'rectangle',sketchStart:[0,0],sketchPreview:[10,10],sketchProfiles:[],sketchShape:null,polyPts:[],skCons:[],params:[],sketchSources:{},dimBuf:['',''],dimField:0,sketchUndo:[],sketchRedo:[],autoConstrain:true}
 let pending=Promise.resolve();const solve=async()=>{const r=await solveFree([...s.sketchProfiles,...(s.sketchShape?[s.sketchShape]:[])],s.skCons);if(r)s={...s,skDof:r.dof}};s.resolveSk=()=>pending=solve()
 const api=vm.runInNewContext(stripTypeScriptTypes(names+';({'+typed+history+'})'),{get:()=>s,set:p=>s={...s,...(typeof p==='function'?p(s):p)},rectangleConstraints,skSnap:x=>({sketchShape:x.sketchShape,sketchProfiles:x.sketchProfiles,skCons:x.skCons,polyPts:x.polyPts,sketchStart:x.sketchStart}),enqueueHistoryTransition:f=>f(),multiStageTypedLabel:()=>null,typedReadout:()=>'',SK_TYPED_UNSUP:'unsupported'})
 for(const key of ['6','0','Tab','4','0','Enter'])api.sketchTypeKey(key)
 await pending;assert.equal(s.skCons.length,7);assert.equal(s.skDof,0);assert.equal(s.sketchUndo.length,1)
 const ids=s.skCons.map(c=>c.id).join(',')
 await api.undo();assert.equal(s.sketchShape,null);assert.equal(s.skCons.length,0)
 await api.redo();assert.equal(s.skDof,0);assert.equal(s.skCons.map(c=>c.id).join(','),ids);assert.deepEqual(Array.from(s.sketchShape.b),[60,40])
})

test('referenced sketch driving dimensions cannot be removed into dangling IDs',()=>{
 let s={skCons:[{id:'w',kind:'dim',value:60},{id:'h',kind:'dim',value:30,expr:'d1/2',refs:{d1:'dimension:w'}}],resolveSk:()=>assert.fail('rejected removal must not solve')}
 const body=source.slice(source.indexOf('  removeSkCon: (id) => {'),source.indexOf('  // Solve a candidate first:'))
 const api=vm.runInNewContext(stripTypeScriptTypes('({'+body+'})'),{get:()=>s,set:p=>s={...s,...p}})
 api.removeSkCon('w');assert.equal(s.skCons.length,2);assert.match(s.status,/引用/)
})
