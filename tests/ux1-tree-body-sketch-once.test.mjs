// UX1 #6：瀏覽樹「活動實體 ●」行可重新命名／刪除（Fusion 實體節點）；草圖只喺「草圖」資料夾列一次（特徵資料夾唔再重複獨立草圖）。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp, buildProjectPayload } = await import('../src/store.ts')
const M = await import('../src/ui/contextMenus.ts')
const g = () => useApp.getState()
const box = (id, x = 0) => ({ id, type: 'extrude', profile: { kind: 'rect', a: [x - 10, -10], b: [x + 10, 10] }, height: 10, operation: 'new' })
const withConfirm = async (ans, fn) => { const orig = g().appConfirm; let asked = 0; useApp.setState({ appConfirm: async () => { asked++; return ans } }); try { await fn() } finally { useApp.setState({ appConfirm: orig }) } return asked }

test('active-body menu offers rename and delete (delete hidden while sketch-locked)', () => {
  const k = M.treeMenuKeys('activeBody')
  assert.ok(k.includes('rename')); assert.ok(k.includes('delete'))
  assert.ok(!M.treeMenuKeys('activeBody', { canDelete: false }).includes('delete'))
  assert.ok(!M.treeMenuKeys('parkedBody').includes('delete'))
})
test('rename the active body: shown, saved with the project, restored on open, cleared by New', async () => {
  await g().reset()
  await g().applyFeatures([box('b1')], 'x')
  g().renameActiveBody('  底座  ')
  assert.equal(g().activeBodyName, '底座')
  const data = JSON.parse(JSON.stringify(buildProjectPayload(g())))
  assert.equal(data.activeBodyName, '底座')
  await g().reset(); assert.equal(g().activeBodyName, '')
  assert.equal('activeBodyName' in buildProjectPayload(g()), false)   // default → key omitted (old files byte-compatible)
  await g().applyProjectData(data)
  assert.equal(g().activeBodyName, '底座')
})
test('delete the active body removes its features (confirmed, undoable); cancel keeps everything', async () => {
  await g().reset()
  await g().applyFeatures([box('b1')], 'x')
  assert.equal(await withConfirm(false, () => g().deleteActiveBody()), 1)
  assert.equal(g().features.length, 1)
  await withConfirm(true, () => g().deleteActiveBody())
  assert.equal(g().features.length, 0)
  assert.ok(!g().bodyMesh?.triangles?.length)
  await g().undo()
  assert.equal(g().features.length, 1)
})
test('with parked bodies only the active body (after the last 新實體) goes; its sketch stays as a standalone sketch', async () => {
  await g().reset()
  useApp.setState({ sketchSources: { sk7: { plane: 'XY', shapes: [{ kind: 'rect', a: [30, -10], b: [50, 10] }], cons: [], visible: true } } })
  await g().applyFeatures([box('b1'), { id: 'nb', type: 'newbody', name: '實體1' }, { ...box('b2', 40), sketchId: 'sk7' }], 'x')
  assert.equal(g().bodyMesh?.parked?.length, 1)
  await withConfirm(true, () => g().deleteActiveBody())
  const f = g().features
  assert.deepEqual(f.slice(0, 2).map((x) => x.id), ['b1', 'nb'])
  assert.ok(f.some((x) => x.type === 'sketch' && x.sketchId === 'sk7'), JSON.stringify(f))
  assert.ok(!f.some((x) => x.id === 'b2'))
  assert.ok(g().sketchSources.sk7)
  assert.equal(g().bodyMesh?.parked?.length, 1)   // the parked body is untouched
})
test('browser tree lists a standalone sketch once (草圖 folder), not again under 特徵', () => {
  const src = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  assert.match(src, /const treeFeatures = features\.filter\(\(f\) => !\(f\.type === 'sketch' && !!sketchSources\[/)
  assert.ok(src.includes('treeFeatures.map((f) => <FeatRow'))
  assert.ok(!src.includes('features.map((f) => <FeatRow'))
  assert.ok(src.includes('requestRemoveFeature(standaloneFeat.id)'))   // the sketch row now carries the delete the duplicate row had
})
