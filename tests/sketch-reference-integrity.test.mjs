import test from 'node:test'
import assert from 'node:assert/strict'
import {register} from 'node:module'
import {readFileSync} from 'node:fs'
register('./store-runtime-loader.mjs',import.meta.url)
// Actual Zustand store and actual PlaneGCS. Only unused browser worker service and Vite DEV flag are adapted for Node.
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const {rectangleConstraints}=await import('../src/sketch/rectangleConstraints.ts')
const initial=useApp.getInitialState()
const a={type:'rect',a:[0,0],b:[60,40]}, b={type:'rect',a:[100,0],b:[130,20]}
const snapshot=()=>{const s=useApp.getState();return structuredClone({shapes:[...s.sketchProfiles,...(s.sketchShape?[s.sketchShape]:[])],cons:s.skCons,undo:s.sketchUndo,redo:s.sketchRedo,params:s.params})}
function setup(poly=false,extra=false){
 const aa=poly?{type:'poly',pts:[[0,0],[60,0],[60,40],[0,40]]}:a
 const shapes=extra?[aa,{type:'rect',a:[40,10],b:[80,30]},b]:[aa,b]
 const target=shapes.length-1
 const cons=[{id:'widthA',kind:'dim',name:'d1',type:'len',a:{kind:'edge',shape:0,idx:0},value:60},{id:'widthB',kind:'dim',name:'d3',type:'len',a:{kind:'edge',shape:target,idx:0},value:30,expr:'d1/2',refs:{d1:'dimension:widthA'}}]
 useApp.setState({...initial,mode:'sketch',sketchProfiles:shapes.slice(0,-1),sketchShape:shapes.at(-1),skCons:cons,skSel:[{kind:'edge',shape:0,idx:0}],sketchUndo:[],sketchRedo:[{preserved:true}]},true)
}
for(const action of ['delete','vertex','trim','break','boolean'])test(`actual store rejects ${action} atomically when another contour references removed dimension`,async()=>{
 setup(action==='vertex',action==='boolean');const s=useApp.getState()
 if(action==='vertex')useApp.setState({skSel:[{kind:'pt',shape:0,idx:1}]})
 if(action==='boolean')useApp.setState({skSel:[{kind:'edge',shape:0,idx:0},{kind:'edge',shape:1,idx:0}]})
 const before=snapshot()
 if(action==='trim')s.skTrimAt([30,0]);else if(action==='break')s.skBreakAt([30,0]);else if(action==='boolean')s.skBoolShapes('union');else s.skDeleteSel()
 await useApp.getState().resolveSk()
 assert.deepEqual(snapshot(),before);assert.match(useApp.getState().status,/d3.*dimension:widthA/)
})
test('deleting an unrelated preceding shape remaps geometry refs but preserves dimension IDs and undo/redo',async()=>{
 setup();useApp.setState({sketchProfiles:[{type:'circle',c:[-50,0],r:5},a],sketchShape:b,skCons:useApp.getState().skCons.map(c=>({...c,a:{...c.a,shape:c.a.shape+1}})),skSel:[{kind:'circle',shape:0}]})
 const before=snapshot();useApp.getState().skDeleteSel();await useApp.getState().resolveSk()
 const after=snapshot();assert.equal(after.shapes.length,2);assert.equal(after.cons[0].a.shape,0);assert.equal(after.cons[1].a.shape,1);assert.equal(after.cons[1].refs.d1,'dimension:widthA')
 await useApp.getState().undo();assert.equal(snapshot().shapes.length,3);assert.deepEqual(snapshot().cons,before.cons)
 await useApp.getState().redo();assert.equal(snapshot().shapes.length,2);assert.deepEqual(snapshot().cons,after.cons)
})
test('actual load rejects Windows dangling fixture before replacing document or history; save also validates',async()=>{
 setup();const before=snapshot();const bad=JSON.parse(readFileSync(new URL('./fixtures/reference-integrity/Windows-P1-Dangling-Dimension.json',import.meta.url)))
 await useApp.getState().applyProjectData(bad)
 assert.deepEqual(snapshot(),before);assert.match(useApp.getState().status,/dimension:k6.*不存在/)
 useApp.setState({mode:'model',sketchSources:bad.sketchSources})
 assert.throws(()=>buildProjectPayload(useApp.getState()),/dimension:k6/)
})
test('actual store evaluates saved IDs after parameter rename and old name reuse',async()=>{
 const cons=rectangleConstraints([a],0,[],['d1','d2'],[60,40],true)
 const width=cons.find(c=>c.name==='d1');Object.assign(width,{expr:'W',refs:{W:'original'}})
 useApp.setState({...initial,mode:'sketch',sketchShape:a,skCons:cons,params:[{id:'original',name:'Width',value:80},{id:'replacement',name:'W',value:12}]},true)
 await useApp.getState().resolveSk();assert.equal(useApp.getState().sketchShape.b[0],80)
 const now=useApp.getState();useApp.setState({mode:'model',features:[{id:'F1',type:'sketch',sketchId:'sk1'}],sketchSources:{sk1:{shapes:[now.sketchShape],cons:now.skCons,plane:'XY',baseZ:0,op:'new',height:0}}});
 const doc=buildProjectPayload(useApp.getState());assert.equal(Object.values(doc.sketchSources)[0].cons.find(c=>c.id===width.id).refs.W,'original')
})
test('rejected trim sweep does not consume the next successful operation undo snapshot',async()=>{
 setup();const s=useApp.getState();s.skTrimSweepStart();s.skTrimAt([30,0]);assert.match(useApp.getState().status,/拒绝/)
 // Drop the dependent dimension through its real action before continuing the sweep.
 useApp.getState().skTrimSweepEnd()
 setup();useApp.setState({sketchProfiles:[{type:'circle',c:[-50,0],r:5},a],sketchShape:b,skCons:useApp.getState().skCons.map(c=>({...c,a:{...c.a,shape:c.a.shape+1}}))})
 useApp.getState().skTrimSweepStart();useApp.getState().skTrimAt([30,0]);assert.match(useApp.getState().status,/拒绝/)
 useApp.getState().skTrimAt([-45,0]);assert.equal(useApp.getState().sketchUndo.length,1)
 useApp.getState().skTrimSweepEnd();await useApp.getState().undo();assert.equal(snapshot().shapes.length,3)
})
test('valid project JSON roundtrip retains cross-contour IDs and remains editable',async()=>{
 const doc=JSON.parse(readFileSync(new URL('../examples/Reference-Integrity-Two-Rectangles.json',import.meta.url)))
 useApp.setState({...initial},true);await useApp.getState().applyProjectData(doc)
 const loaded=useApp.getState();assert.equal(loaded.sketchSources.sk1.cons.find(c=>c.name==='d3').refs.d1,'dimension:k6')
 const payload=buildProjectPayload(loaded);useApp.setState({...initial},true);await useApp.getState().applyProjectData(JSON.parse(JSON.stringify(payload)))
 const src=useApp.getState().sketchSources.sk1
 useApp.setState({mode:'sketch',sketchProfiles:src.shapes.slice(0,-1),sketchShape:src.shapes.at(-1),skCons:src.cons})
 await useApp.getState().editSkDim('k6',100);await useApp.getState().resolveSk()
 const d3=useApp.getState().skCons.find(c=>c.name==='d3');assert.equal(d3.value,50);assert.equal(d3.refs.d1,'dimension:k6')
})
test('reopening a valid sketch after a rejected edit clears the transient rejection and solves DOF',async()=>{
 const doc=JSON.parse(readFileSync(new URL('../examples/Reference-Integrity-UI-100-50.json',import.meta.url)))
 useApp.setState({...initial},true);await useApp.getState().applyProjectData(doc)
 useApp.setState({skMutationError:'previous rejected trim'})
 await useApp.getState().editSketchOf('F1');await useApp.getState().resolveSk()
 assert.equal(useApp.getState().skMutationError,null);assert.equal(useApp.getState().skDof,2)
})
