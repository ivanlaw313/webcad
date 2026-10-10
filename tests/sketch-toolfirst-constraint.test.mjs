// Tool-first constraint UI (ribbon 水平/豎直/重合/相切 → click geometry): the constraint must bind
// to the picked committed entity, no entity may be created, and no stale snap/hover feedback of the
// PRE-solve geometry may survive the solve (that ghost looked like "line unchanged + new stub").
import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {readFileSync} from 'node:fs'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready()
const {useApp}=await import('../src/store.ts')
const g=()=>useApp.getState()
const settle=async()=>{for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,25));if(g().skDof!=null||g().skConflict)return}}
function fresh(){useApp.setState({...useApp.getInitialState(),mode:'sketch',sketchPlane:'XY',sketchTool:'select',sketchProfiles:[],sketchShape:null,skCons:[],autoConstrain:false},true)}
async function drawLine(a,b){await g().runCommand('sk_polyline','直線');await g().onSketchClick(a);await g().onSketchClick(b);await g().finishOpenPolyline()}
const shapes=()=>[...g().sketchProfiles,...(g().sketchShape?[g().sketchShape]:[])]
// SketchSurface select-tool click path: pointerdown → skDragStart; sub-threshold release → skDragEnd → skClickAt.
async function canvasPick(p){g().onSketchMove(p);if(g().skDragStart(p))await g().skDragEnd(p);else g().skClickAt(p);await settle()}

test('tool-first 水平: picked line becomes horizontal, no new entity, no stale snap ghost',async()=>{
  fresh();await drawLine([-30,20],[0,-10])
  assert.equal(shapes().length,1)
  await g().runCommand('sk_c_h','水平')
  assert.equal(g().skArmedCon,'h');assert.equal(g().sketchTool,'select');assert.deepEqual(g().polyPts,[])
  await canvasPick([-15,5])   // edge midpoint: onSketchMove caches a mid-snap of the slanted edge
  assert.equal(shapes().length,1,'no segment spawned')
  const [a,b]=shapes()[0].pts
  assert.ok(Math.abs(a[1]-b[1])<1e-6,`endpoints share y: ${JSON.stringify([a,b])}`)
  assert.deepEqual(g().skCons.map(c=>[c.type,c.a]),[['h',{kind:'edge',shape:0,idx:0}]])
  assert.equal(g().snapSrc,null,'pre-solve snap segment must be dropped');assert.equal(g().sketchSnap,null)
})

test('tool-first 豎直 while a polyline is still being drawn commits it and binds to it',async()=>{
  fresh();await g().runCommand('sk_polyline','直線');await g().onSketchClick([-30,20]);await g().onSketchClick([0,-10])
  assert.equal(g().polyPts.length,2)
  await g().runCommand('sk_c_v','豎直')
  assert.deepEqual(g().polyPts,[],'draw gesture terminated');assert.equal(g().sketchTool,'select');assert.equal(g().skArmedCon,'v')
  assert.equal(shapes().length,1,'in-progress line kept as committed geometry')
  await canvasPick([-15,5])
  assert.equal(shapes().length,1)
  const [a,b]=shapes()[0].pts
  assert.ok(Math.abs(a[0]-b[0])<1e-6,`endpoints share x: ${JSON.stringify([a,b])}`)
})

test('tool-first 重合: two picked endpoints are welded, nothing spawned',async()=>{
  fresh();await drawLine([-40,0],[-10,0]);await drawLine([0,-20],[20,-40])
  await g().runCommand('sk_c_coin','重合')
  await canvasPick([-10,0]);await canvasPick([0,-20])
  assert.equal(shapes().length,2)
  const p=shapes()[0].pts[1],q=shapes()[1].pts[0]
  assert.ok(Math.hypot(p[0]-q[0],p[1]-q[1])<1e-5,`gap ${JSON.stringify([p,q])}`)
  assert.equal(g().skCons.length,1);assert.equal(g().skCons[0].type,'coincident')
  assert.equal(g().snapSrc,null)
})

test('tool-first 相切: circle + far line become tangent, nothing spawned',async()=>{
  fresh();useApp.setState({sketchProfiles:[{type:'circle',c:[-60,0],r:20}]})
  await drawLine([20,-30],[40,30])
  await g().runCommand('sk_c_tan','相切')
  await canvasPick([-40,0]);await canvasPick([30,0])
  assert.equal(shapes().length,2)
  const C=shapes()[0],[A,B]=shapes()[1].pts
  const L=Math.hypot(B[0]-A[0],B[1]-A[1]),d=Math.abs((B[0]-A[0])*(C.c[1]-A[1])-(B[1]-A[1])*(C.c[0]-A[0]))/L
  assert.ok(Math.abs(d-C.r)<1e-3,`distance ${d} vs r ${C.r}`)
  assert.equal(g().skCons.length,1);assert.equal(g().skCons[0].type,'tangent')
})

for(const [cmd,type] of [['sk_c_par','parallel'],['sk_c_perp','perp'],['sk_c_eq','equal']])
test(`select-first ${type}: entities updated in place, count unchanged, no pre-solve ghost`,async()=>{
  fresh();await drawLine([-40,0],[0,0]);await drawLine([10,-10],[30,25])
  useApp.setState({sketchTool:'select'})
  await canvasPick([-20,0]);await canvasPick([20,7.5])   // select-first: hover (snap cached) + pick both edges
  assert.equal(g().skSel.length,2)
  const before=structuredClone(shapes()[1].pts)
  await g().runCommand(cmd,type);await settle()
  assert.equal(shapes().length,2,'no entity added/removed')
  assert.equal(g().skCons.length,1);assert.equal(g().skCons[0].type,type)
  const [a,b]=shapes()[0].pts,[c,d]=shapes()[1].pts
  const u=[b[0]-a[0],b[1]-a[1]],v=[d[0]-c[0],d[1]-c[1]],cross=u[0]*v[1]-u[1]*v[0],dot=u[0]*v[0]+u[1]*v[1]
  if(type==='parallel')assert.ok(Math.abs(cross)<1e-4,`cross ${cross}`)
  if(type==='perp')assert.ok(Math.abs(dot)<1e-4,`dot ${dot}`)
  if(type==='equal')assert.ok(Math.abs(Math.hypot(...u)-Math.hypot(...v))<1e-4)
  assert.notDeepEqual(shapes().map(x=>x.pts),[[[-40,0],[0,0]],before],'solver moved geometry in place')
  assert.equal(g().snapSrc,null,'cached snap segment of the old position dropped');assert.equal(g().sketchSnap,null);assert.equal(g().skHover,null)
})

test('keyboard type-to-place never runs for pick tools or an open dimension editor; dim editor keeps focus',()=>{
  const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8')
  assert.match(app,/s\.sketchTool !== 'select' && s\.sketchTool !== 'dimension' && !s\.skDimPreview\.id/)
  assert.match(app,/document\.activeElement/,'global keydown must honour the focused field, not only e.target')
  const vp=readFileSync(new URL('../src/components/Viewport.tsx',import.meta.url),'utf8')
  assert.match(vp,/closest\?\.\('input,select,textarea,\[data-dim-editor\],\.cmd-palette'\)/)
  const sl=readFileSync(new URL('../src/components/SketchLayer.tsx',import.meta.url),'utf8')
  assert.match(sl,/data-dim-editor=""/)
  const st=readFileSync(new URL('../src/store.ts',import.meta.url),'utf8')
  assert.match(st,/⌖ 起點 X/);assert.doesNotMatch(st,/⌖ 起点 X/)
})
