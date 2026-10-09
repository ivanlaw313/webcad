// End-to-end: a 3D sketch-text feature with sizeMode 'cap' builds capitals as tall as 字高 (Fusion);
// legacy features (no sizeMode) keep the em size, and commitSkTextDlg writes sizeMode 'cap'.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {register,createRequire} from 'node:module';import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');const w=globalThis.__wheelWorker;await w.ready()
const {useApp}=await import('../src/store.ts');const {importSTEP,loadFont}=await import('replicad')
const buf=fs.readFileSync(new URL('../src/fonts/Roboto-Regular.ttf',import.meta.url))
await loadFont(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'cad',true)   // node cannot fetch the ?url asset
const bounds=async()=>(await importSTEP(new Blob([await w.exportSTEP()]))).boundingBox.bounds
const text=(extra)=>({id:'t',type:'text',text:'HELL',size:10,height:2,op:'new',baseZ:0,...extra})

test('text feature sizeMode cap: 10 mm 字高 → 10 mm capitals; legacy em feature unchanged (7.1 mm)',async()=>{
  await w.rebuild([text({sizeMode:'cap'})]);const [lo,hi]=await bounds()
  assert.ok(Math.abs((hi[1]-lo[1])-10)<0.1,`cap feature capital height ${hi[1]-lo[1]}`)
  assert.ok(Math.abs((hi[2]-lo[2])-2)<1e-6)
  await w.rebuild([text({})]);const [lo2,hi2]=await bounds()
  assert.ok(Math.abs((hi2[1]-lo2[1])-10*1456/2048)<0.1,`legacy em height ${hi2[1]-lo2[1]}`)
})

test('sketch Text dialog (model mode) creates a sizeMode cap feature whose capitals match 字高',async()=>{
  useApp.setState({...useApp.getInitialState()},true)
  useApp.setState({skTextDlg:{text:'HELL',size:8,height:3,align:'left'}})
  await useApp.getState().commitSkTextDlg()
  for(let i=0;i<200&&!useApp.getState().features.length;i++)await new Promise(r=>setTimeout(r,10))   // commit fires the rebuild without awaiting it
  while(useApp.getState().busy)await new Promise(r=>setTimeout(r,10))
  const f=useApp.getState().features.at(-1)
  assert.equal(f?.type,'text',useApp.getState().status);assert.equal(f.sizeMode,'cap')
  const [lo,hi]=await bounds();assert.ok(Math.abs((hi[1]-lo[1])-8)<0.1,`height ${hi[1]-lo[1]}`)
})

test('sketch Text in sketch mode: contours are 字高 tall',async()=>{
  const c=await w.textSketchContours('HELL',10)
  let y0=Infinity,y1=-Infinity;for(const l of c)for(const p of l){y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1])}
  assert.ok(Math.abs((y1-y0)-10)<0.1,`contour height ${y1-y0}`)
})
