/**
 * v1.13 BOT-A01-DIM-PERSIST / BOT-A02: sketch constraint dim 120→100 must persist
 * through preview→confirm and Finish Sketch flush; illegal ≤0 gets a status toast.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parseDimensionEditInput } from '../src/sketch/dimensionEditInput.ts'

const layer = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('BOT-A01 contract: blur commits con dims; Finish flushes session; valRef draft', () => {
  assert.match(layer, /onBlur=\{\(\) => \{void commit\(l\.edit!, true\)\}\}/)
  assert.match(layer, /const draft = valRef\.current/)
  assert.match(layer, /BOT-A01/)
  assert.match(storeSrc, /flushSkDimEdit/)
  assert.match(storeSrc, /await flushSkDimEdit\(\)/)
  assert.match(ribbon, /onMouseDown=\{e => e\.preventDefault\(\)\} onClick=\{\(\) => finishSketch\(\)\}/)
  assert.match(viewport, /sb-finish[\s\S]*onMouseDown=\{e => e\.preventDefault\(\)\}/)
})

test('BOT-A02 contract: illegal dim draft writes status toast', () => {
  assert.match(layer, /尺寸已拒绝：\$\{result\.error\}/)
  const con = { kind: 'dim', id: 'd', name: 'd1', type: 'len', value: 120, a: { kind: 'edge', shape: 0, idx: 0 } }
  const evaluate = () => null
  for (const raw of ['-1', '0', '']) {
    const r = parseDimensionEditInput({ con, raw, unit: 'mm', params: [], cons: [con], evaluate })
    assert.equal(r.ok, false, raw)
  }
  const ok = parseDimensionEditInput({ con, raw: '100', unit: 'mm', params: [], cons: [con], evaluate })
  assert.equal(ok.ok, true)
  assert.equal(ok.patch.value, 100)
  assert.equal(ok.patch.driven, undefined)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, evalExpr } = await import('../src/store.ts')
const { rectangleConstraints } = await import('../src/sketch/rectangleConstraints.ts')
const g = () => useApp.getState()

test('BOT-A01 runtime: 120→100 preview→confirm persists width', async () => {
  const shapes = [{ type: 'rect', a: [0, 0], b: [120, 75] }]
  const cons = rectangleConstraints(shapes, 0, [], ['d1', 'd2'], [120, 75], false)
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchProfiles: shapes, skCons: cons }, true)
  await g().resolveSk()
  const width = g().skCons.find((c) => c.kind === 'dim' && c.name === 'd1')
  assert.ok(width)
  const parsed = parseDimensionEditInput({
    con: width, raw: '100', unit: 'mm', params: g().params, cons: g().skCons, evaluate: evalExpr,
  })
  assert.equal(parsed.ok, true)
  g().beginSkDimEdit(width.id)
  await g().previewSkDimEdit(parsed.patch)
  assert.equal(g().skDimPreview.error, null, g().skDimPreview.error)
  assert.equal(g().skDimPreview.cons.find((c) => c.id === width.id).value, 100)
  await g().confirmSkDimEdit()
  assert.equal(g().skCons.find((c) => c.id === width.id).value, 100)
  const w = Math.abs(g().sketchProfiles[0].b[0] - g().sketchProfiles[0].a[0])
  assert.ok(Math.abs(w - 100) < 1e-4, `width=${w}`)
})

test('BOT-A01 runtime: flushSkDimEdit before finish keeps 100 on sketch source', async () => {
  const shapes = [{ type: 'rect', a: [0, 0], b: [120, 75] }]
  const cons = rectangleConstraints(shapes, 0, [], ['d1', 'd2'], [120, 75], false)
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchProfiles: shapes, skCons: cons }, true)
  await g().resolveSk()
  const width = g().skCons.find((c) => c.kind === 'dim' && c.name === 'd1')
  const parsed = parseDimensionEditInput({
    con: width, raw: '100', unit: 'mm', params: g().params, cons: g().skCons, evaluate: evalExpr,
  })
  g().beginSkDimEdit(width.id)
  await g().previewSkDimEdit(parsed.patch)
  // Simulate blur/Finish without clicking ✓ — only the live candidate exists.
  assert.equal(typeof g().flushSkDimEdit, 'function')
  await g().flushSkDimEdit()
  assert.equal(g().skCons.find((c) => c.id === width.id).value, 100)
  assert.equal(g().skDimPreview.id, null)
  await g().commitStandaloneSketch()
  const src = Object.values(g().sketchSources)[0]
  assert.ok(src, 'standalone sketch source written')
  assert.equal(src.cons.find((c) => c.name === 'd1').value, 100)
  const sw = Math.abs(src.shapes[0].b[0] - src.shapes[0].a[0])
  assert.ok(Math.abs(sw - 100) < 1e-4, `source width=${sw}`)
})

test('BOT-A02 runtime: illegal patch leaves geometry and surfaces failure status on confirm', async () => {
  const shapes = [{ type: 'rect', a: [0, 0], b: [120, 75] }]
  const cons = rectangleConstraints(shapes, 0, [], ['d1', 'd2'], [120, 75], false)
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchProfiles: shapes, skCons: cons }, true)
  const width = g().skCons.find((c) => c.kind === 'dim' && c.name === 'd1')
  g().beginSkDimEdit(width.id)
  await g().previewSkDimEdit({ value: -1 })
  assert.ok(g().skDimPreview.error)
  await g().confirmSkDimEdit()
  assert.equal(g().skCons.find((c) => c.id === width.id).value, 120)
  assert.match(g().status, /尺寸修改失败|尺寸已拒绝|必须/)
})
