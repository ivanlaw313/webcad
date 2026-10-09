// FISHING3 P1: sketch rectangular/circular pattern enablement + apply with multi-profile selection.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, noteSkClickMod } = await import('../src/store.ts')
const { patternPreviewPlan } = await import('../src/components/patternPreviewPlan.ts')
const { resolvePatternTargets } = await import('../src/sketch/patternSourceSelection.ts')
const g = () => useApp.getState()

function seedFourCircles(sel = []) {
  useApp.setState({
    ...useApp.getInitialState(),
    mode: 'sketch',
    sketchTool: 'array',
    sketchProfiles: [
      { type: 'circle', c: [0, 0], r: 5 },
      { type: 'circle', c: [30, 0], r: 5 },
      { type: 'circle', c: [0, 30], r: 5 },
      { type: 'circle', c: [30, 30], r: 5 },
    ],
    skSel: sel,
    skCons: [],
    arrayCfg: { kind: 'rect', nx: 2, dx: 40, ny: 1, dy: 0, count: 6, angle: 360, cx: 0, cy: 0, distType: 'spacing', angleType: 'full' },
    appConfirm: async () => false,
  }, true)
}

test('patternPreviewPlan / resolvePatternTargets: multi-profile empty selection refuses (Formal Traditional)', () => {
  const r = resolvePatternTargets([], 4, { allowImplicitSingle: true })
  assert.equal(r.ok, false)
  assert.match(r.reason, /請先選擇/)
  assert.doesNotMatch(r.reason, /请|绘|阵列/)
  const plan = patternPreviewPlan({ kind: 'rect', nx: 2, ny: 1, dx: 40, dy: 0, count: 6, angle: 360, cx: 0, cy: 0, distType: 'spacing', angleType: 'full' }, 0, 4)
  assert.equal(plan.ok, false)
  assert.match(plan.reason, /請先選擇|繪製/)
  assert.doesNotMatch(plan.reason, /请先选择|绘制轮廓|阵列最多/)
})

test('array tool canvas click selects source (no longer swallows pointer)', () => {
  seedFourCircles()
  assert.equal(g().skSel.length, 0)
  noteSkClickMod('replace')
  g().onSketchClick([0, 5]) // near first circle rim
  assert.ok(g().skSel.length >= 1, g().status)
  assert.equal(g().sketchTool, 'array')
})

test('independent rectangular pattern creates instances after explicit selection', async () => {
  seedFourCircles([{ kind: 'circle', shape: 0 }])
  await g().previewArray()
  assert.ok(g().arrayPreview.shapes?.length, g().arrayPreview.error || g().status)
  const before = g().sketchProfiles.length
  await g().applyArray()
  assert.ok(g().sketchProfiles.length > before, g().status)
  assert.match(g().status, /陣列|輪廓/)
})

test('associative create session + apply creates linked instances', async () => {
  seedFourCircles([{ kind: 'circle', shape: 0 }])
  g().beginSketchPattern('create')
  assert.equal(g().skPatternSession?.mode, 'create')
  await g().previewArray()
  assert.ok(g().skPatternPreview.document, g().skPatternPreview.error || g().status)
  await g().applyArray()
  assert.ok(g().skPatternData?.patterns?.length, g().status)
  assert.ok(g().sketchProfiles.length >= 2, g().status)
  assert.match(g().status, /關聯陣列/)
})

test('circular independent pattern with selection creates instances', async () => {
  seedFourCircles([{ kind: 'circle', shape: 0 }])
  g().setArrayCfg({ kind: 'circ', count: 4, angle: 360, cx: 0, cy: 0, angleType: 'full' })
  await g().previewArray()
  assert.ok(!g().arrayPreview.error, g().arrayPreview.error)
  const before = g().sketchProfiles.length
  await g().applyArray()
  assert.ok(g().sketchProfiles.length > before, g().status)
})

test('apply without selection keeps sketch and reports Traditional status', async () => {
  seedFourCircles([])
  const before = structuredClone(g().sketchProfiles)
  await g().previewArray()
  assert.ok(g().arrayPreview.error)
  assert.match(g().arrayPreview.error, /請先選擇/)
  await g().applyArray()
  assert.deepEqual(g().sketchProfiles, before)
  assert.match(g().status, /請先選擇|陣列/)
  assert.doesNotMatch(g().status, /请先选择|绘/)
})
