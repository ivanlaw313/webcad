// ae44911 / ASM2 P1 補覆蓋：ribbon type:newbody（泊住再開空）≠ operation 新實體（新體變活動）；
// 非法 activate 拒絕；設為活動後切除作用於新活動體。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const w = globalThis.__wheelWorker
const g = () => useApp.getState()
const plate = { id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [-40, -30], b: [40, 30] }, height: 10, operation: 'new' }
const cylNB = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 8 }, height: 30, baseZ: 10, operation: 'newbody' }
const volBbox = (mesh) => {
  const v = mesh.vertices
  let xn = 1e9, xp = -1e9, yn = 1e9, yp = -1e9, zn = 1e9, zp = -1e9
  for (let i = 0; i < v.length; i += 3) {
    xn = Math.min(xn, v[i]); xp = Math.max(xp, v[i])
    yn = Math.min(yn, v[i + 1]); yp = Math.max(yp, v[i + 1])
    zn = Math.min(zn, v[i + 2]); zp = Math.max(zp, v[i + 2])
  }
  return (xp - xn) * (yp - yn) * (zp - zn)
}

test('type:newbody (startNewBody) parks active and clears — opposite of operation newbody', async () => {
  // worker: type:newbody → push shape to parked, shape=null
  const m = await w.rebuild([plate, { id: 'nb', type: 'newbody', name: '實體1' }])
  assert.deepEqual(m.failed ?? [], [])
  assert.equal(m.parked?.length, 1)
  assert.ok(!(m.triangles?.length), 'no active solid after ribbon 新實體')
  assert.ok(volBbox(m.parked[0]) > 40000)

  // store path
  useApp.setState({ features: [], components: [], joints: [], undoStack: [], redoStack: [], bodyMesh: null, activeBodyName: '', selectedParkedIndex: null, lang: 'zh-HK' })
  assert.equal(await g().applyFeatures([plate], 'plate'), true)
  assert.ok(g().bodyMesh.triangles.length)
  await g().startNewBody()
  assert.equal(g().bodyMesh.parked?.length, 1)
  assert.equal(g().bodyMesh.triangles?.length ?? 0, 0, 'store startNewBody clears active mesh')
  assert.match(g().status, /新實體|獨立實體|實體1|New body opened|Body 1|parked/)
})

test('activateParkedBody rejects bad index without mutating features', async () => {
  useApp.setState({ features: [], components: [], joints: [], undoStack: [], redoStack: [], bodyMesh: null, activeBodyName: '', selectedParkedIndex: null, lang: 'zh-HK' })
  assert.equal(await g().applyFeatures([plate, cylNB], 'nb'), true)
  const before = g().features.map((f) => f.id)
  await g().activateParkedBody(-1)
  assert.match(g().status, /設為活動：請選擇一個獨立實體/)
  assert.deepEqual(g().features.map((f) => f.id), before)
  await g().activateParkedBody(99)
  assert.match(g().status, /設為活動：請選擇一個獨立實體/)
  assert.deepEqual(g().features.map((f) => f.id), before)
})

test('after 設為活動 on plate, cut removes plate material; parked cylinder untouched', async () => {
  const cut = { id: 'cut1', type: 'extrude', profile: { kind: 'circle', c: [20, 0], r: 5 }, height: 20, baseZ: -5, operation: 'cut' }
  const m = await w.rebuild([plate, cylNB, { id: 'a1', type: 'activatebody', target: 0 }, cut])
  assert.deepEqual(m.failed ?? [], [], JSON.stringify(m.failed))
  assert.equal(m.parked?.length, 1)
  // active should be plate (large XY, thin Z) with a hole
  assert.ok(volBbox(m) > 30000, `active plate-ish bbox ${volBbox(m)}`)
  const plateV = await w.measureBodyAt([0, 0, 5])
  assert.ok(plateV && plateV.volume < 48000 && plateV.volume > 35000, `holed plate vol ${plateV?.volume}`)
  const cylV = await w.measureBodyAt([0, 0, 20])
  assert.ok(cylV && cylV.volume > 5000 && cylV.volume < 7000, `parked cylinder intact ${cylV?.volume}`)
})
