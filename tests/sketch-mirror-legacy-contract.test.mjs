import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
const {useApp}=await import('../src/store.ts')
const all=()=>[...useApp.getState().sketchProfiles,...(useApp.getState().sketchShape?[useApp.getState().sketchShape]:[])]
const dim=(shape,r)=>({id:`radius${shape}`,kind:'dim',type:'rad',a:{kind:'circle',shape},value:r})
function relation(source,copy,axis){assert.ok(useApp.getState().skCons.some(c=>c.type==='symmetric'&&c.a.kind==='circle'&&c.a.shape===source&&c.b?.shape===copy&&c.c?.kind==='edge'&&c.c.shape===axis));assert.equal(all()[axis].construction,true);assert.equal(all()[axis].open,true)}
test('legacy active-shape mirror preserves every prior profile, source constraint and persistent symmetry',async()=>{
 const prior=[{type:'circle',c:[70,30],r:4},{type:'circle',c:[90,30],r:5}],active={type:'circle',c:[40,40],r:10},cons=[dim(0,4),dim(1,5),dim(2,10)]
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchProfiles:structuredClone(prior),sketchShape:structuredClone(active),skCons:structuredClone(cons)},true)
 await useApp.getState().sketchMirror('y');assert.deepEqual(all().slice(0,3),[...prior,active]);assert.equal(all().length,5);assert.deepEqual(all()[4],{...active,c:[-40,40]});relation(2,4,3);for(const c of cons)assert.deepEqual(useApp.getState().skCons.find(x=>x.id===c.id),c);assert.equal(useApp.getState().sketchUndo.length,1)
 await useApp.getState().undo();assert.deepEqual(all(),[...prior,active]);assert.deepEqual(useApp.getState().skCons,cons);await useApp.getState().redo();relation(2,4,3)
 useApp.setState({skCons:useApp.getState().skCons.map(c=>c.id==='radius2'?{...c,value:12}:c)});await useApp.getState().resolveSk();assert.equal(useApp.getState().skConflict,false,useApp.getState().status);assert.ok(Math.abs(all()[2].r-12)<1e-6);assert.ok(Math.abs(all()[4].r-12)<1e-6);assert.deepEqual(all().slice(0,2),prior)
})
test('legacy profile-only mirror preserves all originals and construction geometry without copying its axis',async()=>{
 const original=[{type:'circle',c:[30,20],r:5},{type:'circle',c:[60,30],r:7},{type:'poly',pts:[[80,0],[80,50]],open:true,construction:true}],cons=[dim(0,5),dim(1,7)]
 useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchProfiles:structuredClone(original),sketchShape:null,skCons:structuredClone(cons)},true)
 await useApp.getState().sketchMirror('x');assert.deepEqual(all().slice(0,3),original);assert.equal(all().length,6);assert.deepEqual(all()[4],{...original[0],c:[30,-20]});assert.deepEqual(all()[5],{...original[1],c:[60,-30]});relation(0,4,3);relation(1,5,3);assert.equal(all().filter(s=>s.construction).length,2);for(const c of cons)assert.deepEqual(useApp.getState().skCons.find(x=>x.id===c.id),c)
 const after=structuredClone({shapes:all(),cons:useApp.getState().skCons});await useApp.getState().undo();assert.deepEqual(all(),original);await useApp.getState().redo();assert.deepEqual(all(),after.shapes);assert.deepEqual(useApp.getState().skCons,after.cons)
})
