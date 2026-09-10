import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import {readFileSync} from 'node:fs'
import {register,stripTypeScriptTypes,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url))
register('./native-car-loader.mjs',import.meta.url)
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s.includes('?url'))return {url:'data:text/javascript,export default %22%22',shortCircuit:true};return n(s,c)}`))
const {rectangleConstraints}=await import('../src/sketch/rectangleConstraints.ts')
const {useApp}=await import('../src/store.ts')
const source=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8')
const evaluator=source.slice(source.indexOf('const D2R ='),source.indexOf('// DEV-only hook')).replace('export function evalExpr','function evalExpr')
const evalExpr=vm.runInNewContext(stripTypeScriptTypes(evaluator+';evalExpr'))
// Extract the complete function using its next declaration, not a reimplementation.
const end=source.indexOf('const maxDimSeq =',source.indexOf('const withParamVals ='))
const withParamVals=vm.runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('const withParamVals ='),end)+';withParamVals'),{evalExpr,parameterId:p=>p.id,_degenDimNotes:new Set()})
const snapshot=s=>structuredClone({sketchShape:s.sketchShape,sketchProfiles:s.sketchProfiles,skCons:s.skCons})
function harness(){const rect={type:'rect',a:[0,0],b:[60,40]};useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchProfiles:[],sketchShape:rect,skCons:rectangleConstraints([rect],0,[],['d1','d2'],[60,40],true),params:[],sketchUndo:[],sketchRedo:['existing']},true);return {api:useApp.getState(),get:useApp.getState,set:useApp.setState}}
test('actual store dimension transaction solves then commits one undo item',async()=>{const h=harness();const id=h.get().skCons.find(c=>c.name==='d1').id;await h.api.commitSkDim(id,{value:80},'edit');assert.equal(h.get().skDof,0);assert.equal(h.get().sketchUndo.length,1);assert.equal(h.get().sketchRedo.length,0);assert.ok(Math.abs(h.get().sketchShape.b[0]-80)<1e-7)})
test('failed actual edit preserves old formula, IDs, coordinates and undo/redo',async()=>{const h=harness();let s=h.get();const width=s.skCons.find(c=>c.name==='d1');width.expr='W';width.refs={W:'width-id'};h.set({params:[{id:'width-id',name:'Width',value:60}],skCons:[...s.skCons,{id:'lock',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:60}]});const before=snapshot(h.get());await h.api.commitSkDim(width.id,{value:80,expr:undefined,refs:undefined},'edit');assert.deepEqual(snapshot(h.get()),before);assert.equal(h.get().sketchUndo.length,0);assert.deepEqual(h.get().sketchRedo,['existing']);assert.match(h.get().status,/失败/)})
test('stored sketch expression ID survives rename, reuse and JSON; dimension dependency updates',()=>{const cons=[{id:'a',kind:'dim',name:'d1',value:60,expr:'W',refs:{W:'width-id'}},{id:'b',kind:'dim',name:'d2',value:30,expr:'d1/2',refs:{d1:'dimension:a'}}];const out=withParamVals(JSON.parse(JSON.stringify(cons)),[{id:'width-id',name:'Width',value:90},{id:'new',name:'W',value:5}]);assert.equal(out[0].value,90);assert.equal(out[1].value,45)})

test('actual typed rectangle creation, undo and redo preserve constraints in one step',async()=>{
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchTool:'rectangle',sketchStart:[0,0],sketchPreview:[10,10],sketchProfiles:[],sketchShape:null,polyPts:[],skCons:[],params:[],sketchSources:{},dimBuf:['',''],dimField:0,sketchUndo:[],sketchRedo:[],autoConstrain:true},true)
 const g=()=>useApp.getState()
 for(const key of ['6','0','Tab','4','0','Enter'])g().sketchTypeKey(key)
 await g().resolveSk()
 assert.equal(g().skCons.length,7);assert.equal(g().skDof,0);assert.equal(g().sketchUndo.length,1)
 const ids=g().skCons.map(c=>c.id)
 await g().undo();assert.equal(g().sketchShape,null);assert.equal(g().skCons.length,0)
 await g().redo();assert.equal(g().skDof,0);assert.deepEqual(g().skCons.map(c=>c.id),ids);assert.deepEqual(g().sketchShape.b,[60,40])
})

test('referenced sketch driving dimensions cannot be removed into dangling IDs',async()=>{
 const h=harness(),s=h.get(),width=s.skCons.find(c=>c.name==='d1'),height=s.skCons.find(c=>c.name==='d2')
 h.set({skCons:s.skCons.map(c=>c.id===height.id?{...c,expr:'d1/2',refs:{d1:`dimension:${width.id}`}}:c)})
 const before=snapshot(h.get()),undo=h.get().sketchUndo,redo=h.get().sketchRedo
 await h.api.removeSkCon(width.id)
 assert.deepEqual(snapshot(h.get()),before);assert.equal(h.get().sketchUndo,undo);assert.equal(h.get().sketchRedo,redo);assert.match(h.get().status,/引用/)
})
