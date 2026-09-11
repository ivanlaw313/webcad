import test from 'node:test';import assert from 'node:assert/strict';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready()
const {useApp,buildProjectPayload}=await import('../src/store.ts'),g=()=>useApp.getState()
const {parseDimensionEditInput}=await import('../src/sketch/dimensionEditInput.ts')
const {evalExpr}=await import('../src/store.ts')
const {rectangleConstraints}=await import('../src/sketch/rectangleConstraints.ts')
const {measureDim}=await import('../src/sketch/freesolve.ts')

test('named formula W and W/2 preview→confirm→undo/redo keep binding and geometry', async () => {
  useApp.setState({...useApp.getInitialState(),mode:'sketch',
    sketchProfiles:[{type:'rect',a:[0,0],b:[60,40]}],
    skCons:[{id:'width',name:'d1',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:60}],
  },true)
  g().addParam('W',80)
  const con=g().skCons[0],params=g().params
  const parsed=parseDimensionEditInput({con,raw:'W/2',unit:'mm',params,cons:g().skCons,evaluate:evalExpr})
  assert.equal(parsed.ok,true)
  const before=JSON.stringify({cons:g().skCons,shapes:g().sketchProfiles,params:g().params})
  const undoN=g().sketchUndo.length
  g().beginSkDimEdit('width')
  await g().previewSkDimEdit(parsed.patch)
  assert.equal(g().skDimPreview.error,null,g().skDimPreview.error)
  assert.equal(g().skDimPreview.cons.find(c=>c.id==='width').expr,'W/2')
  await g().confirmSkDimEdit()
  const after=g().skCons.find(c=>c.id==='width')
  assert.equal(after.expr,'W/2')
  assert.equal(after.refs.W,params[0].id)
  assert.ok(Math.abs(measureDim(g().sketchProfiles,after)-40)<1e-6)
  assert.equal(g().sketchUndo.length,undoN+1)
  assert.equal(g().skDimPreview.id,null)
  await g().undo()
  assert.equal(JSON.stringify({cons:g().skCons,shapes:g().sketchProfiles,params:g().params}),before)
  await g().redo()
  assert.equal(g().skCons.find(c=>c.id==='width').expr,'W/2')
  assert.ok(Math.abs(measureDim(g().sketchProfiles,g().skCons.find(c=>c.id==='width'))-40)<1e-6)
})

test('renameParam keeps dimension identity via paramId/refs', async () => {
  useApp.setState({...useApp.getInitialState(),mode:'sketch',
    sketchProfiles:[{type:'circle',c:[0,0],r:10}],
    skCons:[{id:'radius',name:'d1',kind:'dim',type:'rad',a:{kind:'circle',shape:0},value:10,expr:'W/2',refs:{W:'pW'}}],
    params:[{id:'pW',name:'W',value:20,unit:'mm'}],
  },true)
  assert.equal(typeof g().renameParam,'function')
  g().renameParam('W','Width')
  const p=g().params.find(x=>x.id==='pW')
  assert.equal(p.name,'Width')
  const dim=g().skCons.find(c=>c.id==='radius')
  assert.equal(dim.refs.Width,'pW')
  assert.equal(dim.refs.W,undefined)
  assert.equal(dim.expr,'Width/2')
  await g().resolveSk()
  assert.ok(Math.abs(g().sketchProfiles[0].r-10)<1e-6)
  // Old name reused by a new param must not steal the binding
  g().addParam('W',6)
  await g().setParam('Width',40)
  await new Promise(r=>setTimeout(r,20))
  assert.ok(Math.abs(g().sketchProfiles[0].r-20)<1e-5,`r=${g().sketchProfiles[0].r}`)
  assert.equal(g().skCons.find(c=>c.id==='radius').refs.Width,'pW')
})

test('overconstrain cancel removes dim and does not leave residual undo', async () => {
  const shapes=[{type:'rect',a:[0,0],b:[60,40]}]
  const cons=rectangleConstraints(shapes,0,[],['d1','d2'],[60,40],false)
  useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchProfiles:shapes,skCons:cons,appConfirm:async()=>false},true)
  const n=g().skCons.length, undoN=g().sketchUndo.length
  const bad={id:'bad80',name:'d9',kind:'dim',type:'len',a:{kind:'edge',shape:0,idx:0},value:80}
  // Mimic placeDim: push undo then append dim, then resolve with prompt
  useApp.setState({sketchUndo:[...g().sketchUndo, {sketchShape:null,sketchProfiles:structuredClone(g().sketchProfiles),polyPts:[],sketchStart:null,skCons:structuredClone(g().skCons)}], sketchRedo:[], skCons:[...g().skCons,bad]})
  await g().resolveSk({promptOverconstrain:true})
  assert.equal(g().skCons.length,n)
  assert.ok(!g().skCons.some(c=>c.id==='bad80'))
  assert.equal(g().sketchUndo.length,undoN,'cancel must not leave a residual undo snapshot')
})

test('radius/diameter symbolic input respects display flip', () => {
  const con={kind:'dim',id:'d',name:'d1',type:'dia',value:20,a:{kind:'circle',shape:0}}
  const params=[{id:'pW',name:'W',value:10}]
  const flipped=parseDimensionEditInput({con,raw:'W',unit:'mm',radDia:{type:'dia',flip:true},params,cons:[con],evaluate:evalExpr})
  assert.equal(flipped.ok,true)
  assert.equal(flipped.patch.value,20) // shown R=W=10 → stored Ø=20
  const formula=parseDimensionEditInput({con,raw:'W*2',unit:'mm',radDia:{type:'dia',flip:true},params,cons:[con],evaluate:evalExpr})
  assert.equal(formula.ok,true)
  assert.equal(formula.patch.value,40) // shown R=20 → stored Ø=40
})
