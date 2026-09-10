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
const result=await w.rebuild(doc.features);assert.deepEqual(result.failed??[],[]);const fixed=await shape(),check=new(getOC().BRepCheck_Analyzer)(fixed.wrapped,true,false);assert.ok(check.IsValid_2());check.delete();fs.writeFileSync(new URL('../../../outputs/未命名零件-抽殼穿孔修正.step',import.meta.url),Buffer.from(await w.exportSTEP()));console.log('corrected STEP saved; original feature parameters unchanged')
