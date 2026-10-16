/**
 * CORE16 residual more18: Extrude through + cut → body volume decreases.
 * Complements core16-extrude-cut-through / arb-through-cut with a volume-first
 * residual (seed → through-cut → v1 < v0 by ≈ πr²·h). Tests only; no product fix.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const worker = globalThis.__wheelWorker
await worker.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)

const volSTEP = async () => {
  const buf = await worker.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}

const plate = {
  id: 'plate',
  type: 'extrude',
  profile: { kind: 'rect', a: [-30, -25], b: [30, 25] },
  height: 12,
  operation: 'new',
} // 60×50×12 = 36000
const hole = { kind: 'circle', c: [0, 0], r: 6 }
const holeVol = Math.PI * 36 * 12 // πr²·h through plate

test('source: through-cut path sets through; worker honours cut+through', () => {
  const st = rd('src/store.ts')
  const w = rd('src/worker/cad.worker.ts')
  assert.match(st, /through: throughAll \|\| undefined/)
  assert.match(st, /op === 'cut' && throughAll/)
  assert.match(w, /if \(f\.operation === 'cut' && f\.through\)/)
  assert.match(w, /Through-all|貫通|through/)
})

test('worker: through-cut volume strictly decreases by ≈ πr²·h', async () => {
  const mesh0 = await worker.rebuild([plate])
  assert.ok(mesh0 && !(mesh0.failed?.length), JSON.stringify(mesh0?.failed))
  const v0 = await volSTEP()
  assert.ok(Math.abs(v0 - 36000) < 2, `seed ${v0}`)

  const mesh1 = await worker.rebuild([
    plate,
    { id: 'cut', type: 'extrude', profile: hole, height: 0, operation: 'cut', through: true, baseZ: 12 },
  ])
  assert.ok(mesh1 && !(mesh1.failed?.length), JSON.stringify(mesh1?.failed))
  const v1 = await volSTEP()
  assert.ok(v1 < v0, `through-cut must shrink volume: ${v1} vs ${v0}`)
  assert.ok(Math.abs(v1 - (36000 - holeVol)) < 2, `expected ~${36000 - holeVol}, got ${v1}`)
  assert.ok(v0 - v1 > holeVol * 0.95, `removed ${v0 - v1} should ≈ ${holeVol}`)
})

test('store/feature: applyFeatures through-cut decreases body volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([plate], 'plate'), true, g().status)
  const v0 = await volSTEP()
  assert.ok(v0 > 35000, `seed ${v0}`)

  const ok = await g().applyFeatures([
    ...g().features,
    { id: 'cut1', type: 'extrude', profile: hole, height: 0, operation: 'cut', through: true, baseZ: 12 },
  ], '已切割（布爾減）（貫通）')
  assert.equal(ok, true, g().status)
  assert.doesNotMatch(g().status, /切割沒有|切割没有|體積沒有變化|体积没有变化/)
  const cut = g().features.find((f) => f.id === 'cut1')
  assert.ok(cut && cut.through === true && cut.operation === 'cut')

  const v1 = await volSTEP()
  assert.ok(v1 < v0, `volume must decrease: ${v1} < ${v0}`)
  assert.ok(Math.abs(v1 - (36000 - holeVol)) < 3, `through-cut ${v1}`)
})

test('store: datum sketch cut + extent=through decreases volume (not warn-only)', async () => {
  reset()
  assert.equal(await g().applyFeatures([plate], 'plate'), true, g().status)
  const v0 = await volSTEP()
  g().sketchOnDatumPlane('XY', 12)
  assert.equal(g().mode, 'sketch', g().status)
  useApp.setState({
    sketchShape: null,
    sketchProfiles: [{ type: 'circle', c: [0, 0], r: 6 }],
    skCons: [],
    sketchOp: 'cut',
    extrudeExtent: 'through',
    faceCutThrough: true,
    extrudeHeight: 6,
  })
  await g().extrudeSketch()
  assert.equal(g().mode, 'model', g().status)
  assert.doesNotMatch(g().status, /切割沒有|體積沒有變化|体积没有变化/)
  assert.match(g().status, /已切割|貫通|布尔减|布爾減/)
  const cut = g().features.find((f) => f.type === 'extrude' && f.operation === 'cut')
  assert.ok(cut, 'cut on timeline')
  assert.equal(cut.through, true)

  const v1 = await volSTEP()
  assert.ok(v1 < v0 - holeVol * 0.8, `cut must remove material: ${v1} vs ${v0}`)
  assert.ok(Math.abs(v1 - (36000 - holeVol)) < 5, `through hole ≈ ${v1}`)
})
