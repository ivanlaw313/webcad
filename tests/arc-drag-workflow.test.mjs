import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
register('./store-runtime-loader.mjs', import.meta.url)
const {useApp,buildProjectPayload}=await import('../src/store.ts')
const {arcResample,circum3}=await import('../src/sketch/freesolve.ts')
const initial=useApp.getInitialState(),q=Math.sqrt(1250)
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`)
function seed(){const a=[50,0],b=[0,50],m=[q,q];useApp.setState({...initial,mode:'sketch',sketchTool:'select',sketchShape:{type:'poly',open:true,arc:{a,b,m},pts:arcResample(a,b,m)}},true)}
function check(dx,dy){const sh=useApp.getState().sketchShape;near(sh.arc.m[0],q+dx);near(sh.arc.m[1],q+dy);const c=circum3(sh.arc.a,sh.arc.m,sh.arc.b);near(c.r,50);near(c.c[0],dx);near(c.c[1],dy);for(const p of sh.pts){assert.ok(p.every(Number.isFinite));assert.ok(p[0]>=dx-1e-5&&p[1]>=dy-1e-5)}return structuredClone(sh)}
test('whole arc mouse gesture preserves quarter sweep through undo, redo and project JSON reopen',async()=>{
 seed();assert.equal(useApp.getState().skDragStart([q,q]),true);assert.equal(useApp.getState().skDrag.ref.kind,'circle')
 await useApp.getState().skDragMove([q+80,q+80]);await useApp.getState().skDragEnd([q+100,q+100]);const moved=check(100,100)
 assert.equal(useApp.getState().sketchUndo.length,1);await useApp.getState().undo();check(0,0);await useApp.getState().redo();check(100,100)
 useApp.setState({mode:'model',features:[{id:'arcSketch',type:'sketch',sketchId:'arcSource'}],sketchSources:{arcSource:{shapes:[moved],cons:[],plane:'XY',baseZ:0,height:0,op:'new'}}})
 const payload=JSON.parse(JSON.stringify(buildProjectPayload(useApp.getState())));useApp.setState({...initial},true);await useApp.getState().applyProjectData(payload);await useApp.getState().editSketchOf('arcSketch')
 const s=useApp.getState();useApp.setState({sketchShape:s.sketchShape||s.sketchProfiles[0],sketchProfiles:[]});check(100,100)
 assert.equal(useApp.getState().skDragStart([q+100,q+100]),true);await useApp.getState().skDragEnd([q,q]);check(0,0)
})
test('Esc cancels translated arc including in-flight solve without changing sweep or history',async()=>{
 seed();useApp.getState().skDragStart([q,q]);const pending=useApp.getState().skDragMove([q+100,q+100]);useApp.getState().escSketch();await pending;check(0,0);assert.equal(useApp.getState().mode,'sketch');assert.equal(useApp.getState().sketchUndo.length,0)
})
