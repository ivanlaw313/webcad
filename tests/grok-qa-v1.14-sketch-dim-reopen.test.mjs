/**
 * v1.14 BOT-A01/A02 follow-up: soft bbox dims must not fight driving constraints;
 * edited length must persist across Finish → reopen; illegal ≤0 shows 尺寸已拒絕.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { parseDimensionEditInput } from '../src/sketch/dimensionEditInput.ts'

const layer = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')

test('v1.14 contract: APP_VERSION release string; soft-axis suppress + reject toast + cons sync', () => {
  assert.match(version, /APP_VERSION = '\d+\.\d+'/)
  assert.match(layer, /BOT-A01 \(v1\.14\)/)
  assert.match(layer, /coversAxis/)
  assert.match(layer, /illegalRejectStatus\('尺寸必須為有限正數'\)/)
  assert.match(storeSrc, /axisBound/)
  assert.match(storeSrc, /syncCons/)
  assert.match(storeSrc, /尺寸已拒絕：尺寸必須為有限正數/)
})

test('BOT-A02 parse: ≤0 rejected', () => {
  const con = { kind: 'dim', id: 'd', name: 'd1', type: 'len', value: 255, a: { kind: 'edge', shape: 0, idx: 0 } }
  for (const raw of ['-1', '0', '']) {
    assert.equal(parseDimensionEditInput({ con, raw, unit: 'mm', params: [], cons: [con], evaluate: () => null }).ok, false)
  }
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
await globalThis.__wheelWorker.ready()
const { useApp, evalExpr } = await import('../src/store.ts')
const g = () => useApp.getState()

const polyWithLen = (len = 255, h = 25) => {
  const shapes = [{ type: 'poly', open: true, pts: [[0, 0], [len, 0], [len * 0.4, h]] }]
  const cons = [{
    kind: 'dim', id: 'dim-len', name: 'd1', type: 'len', value: len,
    a: { kind: 'edge', shape: 0, idx: 0 },
  }]
  return { shapes, cons }
}

test('BOT-A01 runtime: soft bbox edit routes to driving len and persists across reopen', async () => {
  const { shapes, cons } = polyWithLen(255, 25)
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchProfiles: shapes, skCons: cons }, true)
  await g().resolveSk()
  // Soft width label would previously scale pts without updating cons → reopen restored 255.
  g().setSketchDimValue(0, 'w', 100)
  await new Promise((r) => setTimeout(r, 50))
  const after = g().skCons.find((c) => c.id === 'dim-len')
  assert.ok(after)
  assert.ok(Math.abs(after.value - 100) < 1e-2, `cons value=${after.value}`)
  const w = Math.abs(g().sketchProfiles[0].pts[1][0] - g().sketchProfiles[0].pts[0][0])
  assert.ok(Math.abs(w - 100) < 1e-2, `geom width=${w}`)

  await g().commitStandaloneSketch()
  const skId = Object.keys(g().sketchSources)[0]
  assert.ok(skId)
  assert.equal(g().sketchSources[skId].cons.find((c) => c.id === 'dim-len').value, 100)

  const feat = g().features.find((f) => f.type === 'sketch' && f.sketchId === skId)
  assert.ok(feat)
  await g().editSketchOf(feat.id)
  assert.equal(g().mode, 'sketch')
  const reopened = g().skCons.find((c) => c.id === 'dim-len' || c.name === 'd1')
  assert.ok(reopened)
  assert.ok(Math.abs(reopened.value - 100) < 1e-2, `reopen cons=${reopened.value}`)
  const rw = Math.abs(g().sketchProfiles[0].pts[1][0] - g().sketchProfiles[0].pts[0][0])
  assert.ok(Math.abs(rw - 100) < 1e-2, `reopen geom width=${rw}`)
})

test('BOT-A01 runtime: constraint dim 255→100 persists through applySketchEdit reopen', async () => {
  const { shapes, cons } = polyWithLen(255, 25)
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchProfiles: shapes, skCons: cons }, true)
  await g().resolveSk()
  await g().commitStandaloneSketch()
  const skId = Object.keys(g().sketchSources)[0]
  const feat = g().features.find((f) => f.type === 'sketch' && f.sketchId === skId)
  await g().editSketchOf(feat.id)
  const width = g().skCons.find((c) => c.kind === 'dim' && (c.id === 'dim-len' || c.name === 'd1'))
  assert.ok(width)
  const parsed = parseDimensionEditInput({
    con: width, raw: '100', unit: 'mm', params: g().params, cons: g().skCons, evaluate: evalExpr,
  })
  assert.equal(parsed.ok, true)
  g().beginSkDimEdit(width.id)
  await g().previewSkDimEdit(parsed.patch)
  await g().flushSkDimEdit()
  assert.ok(Math.abs(g().skCons.find((c) => c.id === width.id).value - 100) < 1e-2)
  await g().applySketchEdit(skId)
  assert.equal(g().sketchSources[skId].cons.find((c) => c.id === width.id || c.name === 'd1').value, 100)
  await g().editSketchOf(feat.id)
  assert.ok(Math.abs(g().skCons.find((c) => c.id === width.id || c.name === 'd1').value - 100) < 1e-2)
})

test('BOT-A02 runtime: soft ≤0 sets 尺寸已拒絕 status without changing geometry', async () => {
  const { shapes, cons } = polyWithLen(255, 25)
  useApp.setState({ ...useApp.getInitialState(), mode: 'sketch', sketchProfiles: shapes, skCons: cons, status: 'ready' }, true)
  const before = JSON.stringify(g().sketchProfiles)
  g().setSketchDimValue(0, 'w', -1)
  assert.match(g().status, /尺寸已拒絕/)
  assert.equal(JSON.stringify(g().sketchProfiles), before)
  g().setSketchDimValue(0, 'w', 0)
  assert.match(g().status, /尺寸已拒絕/)
  assert.equal(JSON.stringify(g().sketchProfiles), before)
  assert.equal(g().skCons.find((c) => c.id === 'dim-len').value, 255)
})
