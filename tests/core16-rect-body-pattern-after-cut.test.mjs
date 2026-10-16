/**
 * CORE16 residual / fishing24 spirit: rectangular body pattern after a cut
 * must not no-op (toast+chip with unchanged volume).
 * Complements tests/fishing24-rect-body-pattern.test.mjs with a 2×2 case +
 * worker source lock on objectType==='bodies' bypass of prevWasCut.
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
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true)
async function vol() {
  return measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))
}

/** 60×40×20 box + through cut 20×15 → seed; 2×2 body pattern @ 80×70 → ×4 (no overlap). */
test('CORE16: 2×2 rectangular body pattern after cut fuses (volume ×4, not no-op)', async () => {
  reset()
  const box = {
    id: 'box',
    type: 'prim',
    shape: 'box',
    a: 60,
    b: 40,
    c: 20,
    cornerOrigin: true,
    op: 'new',
  }
  const cut = {
    id: 'cut',
    type: 'extrude',
    profile: { kind: 'rect', a: [10, 5], b: [30, 20] },
    height: 20,
    plane: 'XY',
    baseZ: 0,
    through: true,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([box, cut], 'seed'), true, g().status)
  const seed = await vol()
  const solid = 60 * 40 * 20
  const cutVol = 20 * 15 * 20
  assert.ok(Math.abs(seed - (solid - cutVol)) < 1, `seed ${seed} want ${solid - cutVol}`)

  const pat = {
    id: 'pat',
    type: 'pattern',
    countX: 2,
    countY: 2,
    countZ: 1,
    dx: 80,
    dy: 70,
    dz: 0,
    objectType: 'bodies',
  }
  assert.equal(await g().applyFeatures([box, cut, pat], '2x2 body'), true, g().status)
  const after = await vol()
  const expected = seed * 4
  assert.ok(
    Math.abs(after - expected) < 1,
    `body pattern after cut must change volume: got ${after}, want ${expected} (seed ${seed}). No-op = fishing24 regression`,
  )
  assert.ok(after > seed + 1000, 'volume must increase vs seed')
})

test('CORE16: dialog「整個實體」after cut persists objectType bodies and multiplies volume', async () => {
  reset()
  const box = { id: 'box', type: 'prim', shape: 'box', a: 60, b: 40, c: 20, cornerOrigin: true, op: 'new' }
  const cut = {
    id: 'cut',
    type: 'extrude',
    profile: { kind: 'rect', a: [10, 5], b: [30, 20] },
    height: 20,
    plane: 'XY',
    baseZ: 0,
    through: true,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([box, cut], 'seed'), true, g().status)
  const seed = await vol()

  g().openFeatDlg('pattern')
  assert.equal(g().featDlg?.params.objectType, 'bodies')
  g().setFeatParam('countX', 2)
  g().setFeatParam('countY', 2)
  g().setFeatParam('dx', 80)
  g().setFeatParam('dy', 70)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.match(g().status, /已矩形陣列/)

  const pat = g().features.find((f) => f.type === 'pattern')
  assert.ok(pat, 'timeline pattern chip')
  assert.equal(pat.objectType, 'bodies', 'commit must persist objectType bodies')
  assert.ok(!pat.targets?.length, '整個實體 must not attach feature targets')

  const after = await vol()
  assert.ok(
    Math.abs(after - seed * 4) < 1,
    `dialog body pattern ${after} want ${seed * 4} — toast alone is not success`,
  )
})

test('source lock: worker skips prevWasCut hole path when objectType===bodies', () => {
  const worker = rd('src/worker/cad.worker.ts')
  assert.match(worker, /objectType !== 'bodies'/)
  assert.match(worker, /FISHING24 P1：objectType==='bodies'/)
  const store = rd('src/store.ts')
  assert.match(store, /FISHING24：bodies 要寫入 feature/)
})
