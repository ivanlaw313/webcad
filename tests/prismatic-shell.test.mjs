import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import fs from 'node:fs'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {importSTEP,measureVolume,getOC,draw,drawCircle}=await import('replicad')
const doc=JSON.parse(fs.readFileSync(new URL('./fixtures/user-shell-multi-cut.json',import.meta.url),'utf8'))
const shape=async()=>importSTEP(new Blob([await w.exportSTEP()]))
const tool=p=>{const pts=p.kind==='rect'?[p.a,[p.b[0],p.a[1]],p.b,[p.a[0],p.b[1]]]:p.pts;let pen=draw().movePointerTo(pts[0]);for(const v of pts.slice(1))pen=pen.lineTo(v);return pen.close().sketchOnPlane('XZ',-150).extrude(300)}
const {prismaticInwardShell,validShellSolid}=await import('../src/cad/prismaticShell.ts')
const {drawRectangle,measureArea}=await import('replicad')
const topIndex=s=>s.faces.findIndex(f=>f.geomType==='PLANE'&&f.normalAt().z>.999)
test('exact box shell preserves requested thickness and bottom',()=>{const source=drawRectangle(20,30).sketchOnPlane('XY').extrude(40);const shell=prismaticInwardShell(source,topIndex(source),2);assert.ok(validShellSolid(shell));assert.ok(Math.abs(measureVolume(shell)-(20*30*40-16*26*38))<1e-7)})
test('exact oblique prism shell has rotation invariant volume',()=>{const source=drawRectangle(20,30).sketchOnPlane('XY').extrude(40).rotate(37,[0,0,0],[1,2,3]);const candidates=source.faces.map((f,i)=>({f,i})).filter(({f})=>f.geomType==='PLANE'&&Math.abs(measureArea(f)-600)<1e-6);assert.equal(candidates.length,2);for(const {i} of candidates){const shell=prismaticInwardShell(source,i,2);assert.ok(validShellSolid(shell));assert.ok(Math.abs(measureVolume(shell)-(24000-16*26*38))<1e-6)}})
test('tapered loft cannot be approximated as a straight prism',()=>{const source=drawRectangle(20,30).sketchOnPlane('XY').loftWith(drawRectangle(10,15).sketchOnPlane('XY',40),{ruled:true});assert.throws(()=>prismaticInwardShell(source,topIndex(source),1),/complete straight prism/)})
for(const thickness of [.8,1.1])test(`user upstream shell thickness ${thickness} keeps all five through cuts clear`,async()=>{const features=structuredClone(doc.features);features.find(f=>f.type==='shell').thickness=thickness;const result=await w.rebuild(features);assert.deepEqual(result.failed??[],[]);const solid=await shape();assert.ok(validShellSolid(solid));const p=features.at(-1).profile;for(const profile of [p,...p.islands])assert.ok(Math.abs(measureVolume(solid.intersect(tool(profile))))<1e-5)})
