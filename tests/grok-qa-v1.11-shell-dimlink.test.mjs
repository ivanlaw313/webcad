/**
 * v1.11 PARTIAL product: BOT-A10 shell preview/confirm, BOT-A01 dim-link editor,
 * BOT-A02 illegal sketch dims (align UI-003).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parseDimensionEditInput } from '../src/sketch/dimensionEditInput.ts'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')

test('BOT-A10: shell enters with default thickness 2; Confirm not gated on previewFail', () => {
  assert.match(store, /shellThickness: s\.shellMode \? 0 : 2/)
  assert.match(viewport, /okDisabled=\{!shellPicks\.length \|\| !\(shellThickness > 0\) \|\| shellPreviewBusy\}/)
  assert.doesNotMatch(viewport, /okDisabled=\{!shellPicks\.length \|\| !\(shellThickness > 0\) \|\| shellPreviewBusy \|\| shellPreviewFail\}/)
  assert.match(viewport, /仍按「确定」尝试提交/)
})

test('BOT-A01: browser feature double-click opens edit (Alt+rename); timeline keeps sketch META', () => {
  assert.match(browser, /FEAT_EDIT_DLG/)
  assert.match(browser, /openFeatureEdit/)
  assert.match(browser, /openFeatDlgForEdit\(f\.id\)/)
  assert.match(browser, /editSketchOf\(f\.id\)/)
  assert.match(browser, /e\.altKey/)
  assert.match(timeline, /sketch: \{ icon: 'sketch'/)
})

test('BOT-A02: sketch length dims reject ≤0 / negative like UI-003', () => {
  const con = { kind: 'dim', id: 'd', name: 'd1', type: 'len', value: 5, a: { kind: 'edge', shape: 0, idx: 0 } }
  const evaluate = () => null
  for (const raw of ['0', '-1', '-2.5', '']) {
    const r = parseDimensionEditInput({ con, raw, unit: 'mm', params: [], cons: [con], evaluate })
    assert.equal(r.ok, false, raw)
  }
  assert.equal(parseDimensionEditInput({ con, raw: '5', unit: 'mm', params: [], cons: [con], evaluate }).ok, true)
})

// Runtime shell preview on simple solid face → Confirm-ready state
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

test('BOT-A10 runtime: simple solid face + default thickness previews and Confirm would enable', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const box = { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [0, 0], b: [40, 20] }, height: 10, operation: 'new' }
  assert.equal(await g().applyFeatures([box], 'box'), true, g().status)
  g().toggleShell()
  assert.equal(g().shellThickness, 2, 'entering shell arms a positive default thickness')
  g().shellPickAt([20, 10, -10])
  assert.equal(g().shellPicks.length, 1)
  await new Promise((r) => setTimeout(r, 250))
  for (let i = 0; i < 80 && g().shellPreviewBusy; i++) await new Promise((r) => setTimeout(r, 50))
  assert.equal(g().shellPreviewFail, false, g().status)
  assert.ok(g().shellPreviewMesh?.triangles?.length, 'preview mesh present')
  // Confirm gate: picks + thickness>0 + !busy
  assert.ok(g().shellPicks.length && g().shellThickness > 0 && !g().shellPreviewBusy)
  g().setShellThickness(5)
  await new Promise((r) => setTimeout(r, 250))
  for (let i = 0; i < 80 && g().shellPreviewBusy; i++) await new Promise((r) => setTimeout(r, 50))
  assert.equal(g().shellPreviewFail, false)
  assert.ok(g().shellPreviewMesh?.triangles?.length)
  g().setShellThickness(1)
  await new Promise((r) => setTimeout(r, 250))
  for (let i = 0; i < 80 && g().shellPreviewBusy; i++) await new Promise((r) => setTimeout(r, 50))
  assert.equal(g().shellPreviewFail, false)
  assert.ok(g().shellPreviewMesh?.triangles?.length)
})

test('BOT-A01 runtime: openFeatDlgForEdit + editSketchOf after multi-plane sketches', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  useApp.setState({
    mode: 'sketch', sketchPlane: 'XY', sketchBaseZ: 0,
    sketchProfiles: [{ type: 'rect', a: [0, 0], b: [50, 40] }],
    skCons: [
      { id: 'anchor', kind: 'con', type: 'fix', a: { kind: 'pt', shape: 0, idx: 0 } },
      { id: 'width', kind: 'dim', type: 'len', a: { kind: 'edge', shape: 0, idx: 0 }, value: 50, expr: '50', name: 'W' },
    ],
    extrudeHeight: 20, sketchOp: 'new',
  }, false)
  await g().resolveSk()
  await g().extrudeSketch()
  const ext = g().features.find((f) => f.type === 'extrude')
  assert.ok(ext?.sketchId)
  g().sketchOnDatumPlane('YZ', 0)
  useApp.setState({ sketchProfiles: [{ type: 'circle', c: [0, 10], r: 5 }], sketchShape: null, skCons: [] }, false)
  g().finishSketch()
  await new Promise((r) => setTimeout(r, 50))
  g().openFeatDlgForEdit(ext.id)
  assert.equal(g().featDlg?.kind, 'extrude-edit')
  assert.equal(g().featDlg?.editId, ext.id)
  useApp.setState({ featDlg: null })
  await g().editSketchOf(ext.id)
  assert.equal(g().mode, 'sketch')
  assert.equal(g().skEditTarget, ext.sketchId)
  assert.ok(g().skCons.some((c) => c.id === 'width' && c.kind === 'dim'))
  useApp.setState({ skCons: g().skCons.map((c) => (c.id === 'width' ? { ...c, value: 60, expr: '60' } : c)) })
  await g().resolveSk()
  await g().applySketchEdit(g().skEditTarget)
  assert.equal(g().mode, 'model', g().status)
  assert.equal(g().sketchSources[ext.sketchId].cons.find((c) => c.id === 'width')?.value, 60)
})
