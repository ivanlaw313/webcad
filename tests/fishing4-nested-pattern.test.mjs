// FISHING4 P1: refuse independent pattern while associative exists; save stays valid.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, buildProjectPayload } = await import('../src/store.ts')
const g = () => useApp.getState()

function seed() {
  useApp.setState({
    ...useApp.getInitialState(),
    mode: 'sketch',
    sketchTool: 'array',
    sketchProfiles: [{ type: 'circle', c: [0, 0], r: 5 }],
    skSel: [{ kind: 'circle', shape: 0 }],
    skCons: [],
    arrayCfg: { kind: 'rect', nx: 2, dx: 20, ny: 1, dy: 0, count: 6, angle: 360, cx: 0, cy: 0, distType: 'spacing', angleType: 'full' },
    appConfirm: async () => false,
  }, true)
}

test('indep then assoc creates linked pattern; payload OK', async () => {
  seed()
  await g().applyArray()
  assert.ok(g().sketchProfiles.length > 1)
  useApp.setState({ skSel: [{ kind: 'circle', shape: 0 }] })
  g().beginSketchPattern('create')
  await g().applyArray()
  assert.equal(g().skPatternData?.patterns?.length, 1, g().status)
  assert.match(g().status, /關聯陣列/)
  assert.doesNotMatch(g().status, /请|绘|阵列/)
  assert.equal(g().skPatternData.entityIds.length, g().sketchProfiles.length)
  assert.doesNotThrow(() => buildProjectPayload(g()))
})

test('independent apply while associative exists refuses with one Traditional status (no desync)', async () => {
  seed()
  g().beginSketchPattern('create')
  await g().applyArray()
  assert.ok(g().skPatternData)
  const shapes = g().sketchProfiles.length
  const eids = g().skPatternData.entityIds.length
  useApp.setState({ skSel: [{ kind: 'circle', shape: 0 }], skPatternSession: null, sketchTool: 'array' })
  await g().previewArray()
  assert.match(g().arrayPreview.error || '', /已有關聯陣列|解除關聯/)
  assert.doesNotMatch(g().arrayPreview.error || '', /请|绘/)
  await g().applyArray()
  assert.equal(g().sketchProfiles.length, shapes, 'shapes must not grow')
  assert.equal(g().skPatternData.entityIds.length, eids)
  assert.match(g().status, /已有關聯陣列|解除關聯/)
  assert.doesNotMatch(g().status, /请|绘/)
  assert.doesNotThrow(() => buildProjectPayload(g()))
})

test('second associative create refused clearly; detach allows new pattern', async () => {
  seed()
  g().beginSketchPattern('create')
  await g().applyArray()
  g().beginSketchPattern('create')
  assert.match(g().status, /已有一個關聯陣列|解除關聯/)
  g().detachSketchPattern()
  assert.equal(g().skPatternData, null)
  useApp.setState({ skSel: [{ kind: 'circle', shape: 0 }] })
  g().beginSketchPattern('create')
  await g().applyArray()
  assert.equal(g().skPatternData?.patterns?.length, 1)
  assert.doesNotThrow(() => buildProjectPayload(g()))
})
