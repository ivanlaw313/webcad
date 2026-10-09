// P1 B：活動實體設材質 = 一撤銷步、只影響該體；文件預設密度不變；undo 還原該體材質／顏色。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp, MATERIALS } = await import('../src/store.ts')
const g = () => useApp.getState()

test('setPhysicalMaterial is one undo step and does not change document default bodyDensity', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(g().bodyDensity, 2.7)
  const c0 = g().bodyColor
  g().setPhysicalMaterial('铝')
  assert.equal(g().physMatName, '铝')
  assert.equal(g().bodyDensity, 2.7, 'document default density unchanged')
  assert.equal(g().bodyColor, MATERIALS['铝'].color)
  assert.equal(g().undoStack.length, 1)
  g().setPhysicalMaterial('钢')
  assert.equal(g().physMatName, '钢')
  assert.equal(g().bodyDensity, 2.7)
  assert.equal(g().bodyColor, MATERIALS['钢'].color)
  assert.equal(g().undoStack.length, 2)
  await g().undo()
  assert.equal(g().physMatName, '铝')
  assert.equal(g().bodyColor, MATERIALS['铝'].color)
  assert.equal(g().bodyDensity, 2.7)
  await g().undo()
  assert.equal(g().physMatName, '')
  assert.equal(g().bodyDensity, 2.7)
  assert.equal(g().bodyColor, c0)
})

test('newbody parks active material; new active inherits document default; undo restores', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const ok1 = await g().applyFeatures([{ id: 'b1', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }], 'box')
  assert.ok(ok1)
  g().setPhysicalMaterial('铝')
  assert.equal(g().physMatName, '铝')
  const densDoc = g().bodyDensity
  const ok2 = await g().applyFeatures([...g().features, { id: 'b2', type: 'prim', shape: 'box', a: 20, b: 20, c: 20, op: 'newbody', cornerOrigin: true, at: [50, 0, 0] }], 'box2')
  assert.ok(ok2)
  assert.ok((g().bodyMesh?.parked?.length ?? 0) >= 1, 'old body parked')
  assert.equal(g().parkedBodyMaterials[0], '铝', 'parked keeps 铝')
  assert.equal(g().physMatName, '', 'new active has no phys mat')
  assert.equal(g().bodyDensity, densDoc, 'document default still unchanged')
  g().setPhysicalMaterial('钢')
  assert.equal(g().physMatName, '钢')
  assert.equal(g().parkedBodyMaterials[0], '铝', 'parked not contaminated')
  assert.equal(g().bodyDensity, densDoc)
  await g().undo() // undo 钢 on active
  assert.equal(g().physMatName, '')
  assert.equal(g().parkedBodyMaterials[0], '铝')
  assert.equal(g().bodyDensity, densDoc)
})

test('active-body properties mass uses physMat density without mutating bodyDensity', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  await g().applyFeatures([{ id: 'b1', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }], 'box')
  g().setPhysicalMaterial('铝')
  await g().openPropertiesDialog(null)
  const al = g().propsDialogData?.massProps
  assert.ok(al && Math.abs(al.mass * 1e6 - 64.8) < 0.5, `aluminum mass ~64.8g got ${al?.mass && al.mass * 1e6}`)
  g().setPhysicalMaterial('钢')
  await g().openPropertiesDialog(null)
  const st = g().propsDialogData?.massProps
  assert.ok(st && Math.abs(st.mass * 1e6 - 188.4) < 1, `steel mass ~188.4g got ${st?.mass && st.mass * 1e6}`)
  assert.equal(g().bodyDensity, 2.7)
})
