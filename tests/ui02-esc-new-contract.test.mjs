import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const sketchLayer = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

const { useApp } = await import('../src/store.ts')
const g = () => useApp.getState()

test('UI02: focused non-dialog text Escape must not cascade into sketch/model Esc', () => {
  // Keep Enter/Escape available for SOLID dialogs, but free text/dimension fields
  // must cancel locally — never walk into escSketch / selection clear / doc switch.
  assert.match(app, /editingText && !e\.ctrlKey && !e\.metaKey && e\.key !== 'Enter' && e\.key !== 'Escape'/)
  assert.match(app, /editingText && e\.key === 'Escape'/)
  assert.match(app, /closest\?\.\(['"]\[role="dialog"\],\s*\.cmd-palette/)
})

test('UI02: dimension editor registers a dedicated Escape layer (topmost only)', () => {
  assert.match(sketchLayer, /useEscapeLayer\(!!editing/)
  assert.match(sketchLayer, /cancelDimension/)
})

test('UI02: Properties dialog is an Escape layer and model Esc closes it before selection clear', () => {
  assert.match(viewport, /useEscapeLayer\(!!propsDialog/)
  assert.match(viewport, /closePropertiesDialog/)
  const escBlock = app.slice(app.indexOf("if (e.key === 'Escape') {"), app.indexOf('// Arrow-key nudge'))
  assert.match(escBlock, /propsDialog/)
  assert.match(escBlock, /closePropertiesDialog/)
})

test('UI02: live dimension Esc cancels only the edit and keeps sketch mode', async () => {
  useApp.setState({
    ...useApp.getInitialState(),
    mode: 'sketch',
    sketchTool: 'dimension',
    sketchProfiles: [{ type: 'circle', c: [0, 0], r: 5 }],
    skCons: [{ id: 'radius', name: 'D1', kind: 'dim', type: 'rad', a: { kind: 'circle', shape: 0 }, value: 5 }],
  }, true)
  g().beginSkDimEdit('radius')
  await g().previewSkDimEdit({ value: 8 })
  assert.equal(g().skDimPreview.id, 'radius')
  assert.equal(g().escSketch(), true)
  assert.equal(g().mode, 'sketch')
  assert.equal(g().sketchTool, 'dimension')
  assert.equal(g().skDimPreview.id, null)
  assert.deepEqual(g().sketchProfiles.map((s) => s.r), [5])
})

test('UI02: model Esc closes Properties without requiring a second press', () => {
  // Source contract: the early Escape ladder must dismiss propsDialog as its own layer.
  const start = app.indexOf("if (s.propsDialog) { e.preventDefault(); s.closePropertiesDialog(); return }")
  assert.ok(start >= 0, 'propsDialog must be on the early Escape ladder')
  const before = app.lastIndexOf("if (e.key === 'Escape') {", start)
  assert.ok(before >= 0 && start - before < 400, 'propsDialog must sit inside the shared Escape ladder')
})

test('UI02: New/reset clears preview, inspect, ghost, selection and Properties', async () => {
  useApp.setState({
    ...useApp.getInitialState(),
    inspectMode: true,
    inspectInfo: { kind: '平面', area: 100, text: 'x' },
    hoverFace: { id: 1 },
    propsDialog: { bodyId: null, frame: 'com', accuracy: 'med' },
    propsDialogData: { rows: [{ label: 'V', value: '1' }], text: 'x', massProps: {} },
    editPreviewMesh: { vertices: new Float32Array(3), triangles: new Uint32Array(3), normals: new Float32Array(3) },
    roundPreviewMesh: { vertices: new Float32Array(3), triangles: new Uint32Array(3), normals: new Float32Array(3) },
    shellPreviewMesh: { vertices: new Float32Array(3), triangles: new Uint32Array(3), normals: new Float32Array(3) },
    selectedFeature: 'F1',
    selectedComponent: 'C1',
    toolPreview: [{ type: 'circle', c: [1, 1], r: 2 }],
    skMovePreview: { shapes: [{ type: 'circle', c: [2, 2], r: 3 }], pending: false, error: null },
    skDimPreview: { id: 'd1', shapes: [{ type: 'circle', c: [0, 0], r: 9 }], cons: [], patternData: null, pending: false, error: null },
    arrayPreview: { shapes: [{ type: 'circle', c: [3, 3], r: 1 }], pending: true, error: null },
    measureMode: true,
    measurePts: [[0, 0, 0], [1, 0, 0]],
    measureDist: 1,
    sketchPreview: [10, 10],
  }, true)
  await g().reset()
  for (const key of [
    'inspectInfo', 'hoverFace', 'propsDialog', 'propsDialogData',
    'editPreviewMesh', 'roundPreviewMesh', 'shellPreviewMesh',
    'selectedFeature', 'selectedComponent', 'toolPreview', 'sketchPreview',
  ]) assert.equal(g()[key], null, key)
  assert.equal(g().inspectMode, false)
  assert.equal(g().measureMode, false)
  assert.deepEqual(g().measurePts, [])
  assert.equal(g().measureDist, null)
  assert.deepEqual(g().skMovePreview, { shapes: null, pending: false, error: null })
  assert.equal(g().skDimPreview.id, null)
  assert.equal(g().skDimPreview.shapes, null)
  assert.deepEqual(g().arrayPreview, { shapes: null, pending: false, error: null })
  assert.equal(g().mode, 'model')
})

test('UI02: reset implementation clears move/dim/array ghosts and measure state', () => {
  const at = storeSrc.lastIndexOf('reset: async () => {')
  assert.ok(at >= 0)
  const body = storeSrc.slice(at, at + 2500)
  assert.match(body, /skMovePreview/)
  assert.match(body, /skDimPreview/)
  assert.match(body, /arrayPreview/)
  assert.match(body, /measureMode:\s*false/)
  assert.match(body, /toolPreview:\s*null/)
})
