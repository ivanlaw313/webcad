// v2.20 P2: an offset construction plane with a picked face is measured from that face (not from origin XY);
// two picked parallel faces give the midplane (not the old default XY@30); non-parallel → 「請選取兩個平行面」.
import test from 'node:test'
import assert from 'node:assert/strict'
import {register,createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
globalThis.require=createRequire(import.meta.url);globalThis.__dirname=fileURLToPath(new URL('.',import.meta.url));register('./native-car-loader.mjs',import.meta.url)
await import('../src/worker/cad.worker.ts');await globalThis.__wheelWorker.ready()
const {useApp}=await import('../src/store.ts')
const g=()=>useApp.getState()
const wait=(ms)=>new Promise(r=>setTimeout(r,ms))
async function box(){
  useApp.setState({...useApp.getInitialState(),appConfirm:async()=>true},true)
  assert.ok(await g().applyFeatures([{id:'b',type:'extrude',profile:{kind:'rect',a:[0,0],b:[40,30]},height:10,baseZ:5,operation:'new'}],'box'))
}
const lastPlane=()=>g().planes.at(-1)
test('offset plane from a picked top face: 12.5 above the face (Z 15 + 12.5), not XY@12.5',async()=>{
  await box()
  g().openDatumCmd({type:'plane',method:'offset'})
  g().datumCmdFieldFacePick({kind:'planar',p:[20,15,15],n:[0,0,1]})
  g().setDatumCmdParam('offset',12.5)
  g().commitDatumCmdField(); await wait(600)
  assert.equal(lastPlane().base,'XY'); assert.equal(lastPlane().offset,27.5,g().status)
  // side face (normal −Y at y=0): offset 4 outward → XZ @ −4
  g().openDatumCmd({type:'plane',method:'offset'})
  g().datumCmdFieldFacePick({kind:'planar',p:[20,0,10],n:[0,-1,0]})
  g().setDatumCmdParam('offset',4)
  g().commitDatumCmdField(); await wait(600)
  assert.equal(lastPlane().base,'XZ'); assert.equal(lastPlane().offset,-4)
  // without a face the origin-plane path is unchanged
  g().openDatumCmd({type:'plane',method:'offset'}); g().setDatumCmdParam('offset',12.5); g().commitDatumCmdField(); await wait(600)
  assert.equal(lastPlane().base,'XY'); assert.equal(lastPlane().offset,12.5)
})
test('two parallel faces → midplane; non-parallel → hint and nothing created',async()=>{
  await box()
  g().openDatumCmd({type:'plane',method:'offset'})
  g().datumCmdFieldFacePick({kind:'planar',p:[20,15,15],n:[0,0,1]})
  g().datumCmdFieldFacePick({kind:'planar',p:[10,5,5],n:[0,0,-1]})
  assert.equal(g().datumCmd.picks.length,2)
  g().commitDatumCmdField(); await wait(600)
  assert.equal(lastPlane().base,'XY'); assert.equal(lastPlane().offset,10,g().status)
  assert.doesNotMatch(g().status,/@30/)
  const n=g().planes.length
  g().openDatumCmd({type:'plane',method:'offset'})
  g().datumCmdFieldFacePick({kind:'planar',p:[20,15,15],n:[0,0,1]})
  g().datumCmdFieldFacePick({kind:'planar',p:[40,15,10],n:[1,0,0]})
  assert.match(g().status,/請選取兩個平行面/)
  assert.equal(g().datumCmd.picks.length,1,'first face kept')
  // ribbon 中間平面 (legacy pick): hint + correct midplane
  g().closeDatumCmd()
  g().openDatumCmd({type:'plane',method:'midplane'})
  assert.match(g().status,/請選取兩個平行面/)
  await g().applyDatumPick({kind:'planar',p:[0,15,10],n:[-1,0,0]},[0,15,10])
  await g().applyDatumPick({kind:'planar',p:[40,15,10],n:[1,0,0]},[40,15,10]); await wait(600)
  assert.equal(g().planes.length,n+1); assert.equal(lastPlane().base,'YZ'); assert.equal(lastPlane().offset,20)
})
