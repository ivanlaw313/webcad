/**
 * FISHING24 P1：矩形陣列「整個實體」在切除之後不得走 prevWasCut 孔陣列路徑。
 * Toast/chip 出現但體積不變 = 假成功。環形陣列身體路徑已正確 fuse；矩形必須一致。
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()
const { useApp } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
async function vol() {
  return measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))
}

/** FISHING24 repro：80×60×40 盒 + 貫通切除 → 156 cm³；3×2 矩形整個實體間距 100×90 → 須 ×6。 */
test('FISHING24: rectangular body pattern after cut fuses whole solid (volume matches 3×2 preview)', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const box = {
    id: 'box',
    type: 'prim',
    shape: 'box',
    a: 80,
    b: 60,
    c: 40,
    cornerOrigin: true,
    op: 'new',
  }
  // Through cut 45×20 on top — same net volume as FISHING24 (192−36=156 cm³)
  const cut = {
    id: 'cut',
    type: 'extrude',
    profile: { kind: 'rect', a: [10, 10], b: [55, 30] },
    height: 40,
    plane: 'XY',
    baseZ: 0,
    through: true,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([box, cut], 'seed'), true, g().status)
  const seed = await vol()
  assert.ok(Math.abs(seed - 156000) < 1, `seed volume ${seed} (want 156000 mm³)`)

  // Body-level rectangular pattern (no targets) — objectType bodies must fuse, not re-cut
  const pat = {
    id: 'pat',
    type: 'pattern',
    countX: 3,
    countY: 2,
    countZ: 1,
    dx: 100,
    dy: 90,
    dz: 0,
    objectType: 'bodies',
  }
  assert.equal(await g().applyFeatures([box, cut, pat], 'rect body'), true, g().status)
  const after = await vol()
  const expected = seed * 6 // 100×90 spacing on 80×60 body → no overlap
  assert.ok(
    Math.abs(after - expected) < 1,
    `rect body pattern must change volume: got ${after}, want ${expected} (seed ${seed}). No-op = FISHING24 P1 regression`,
  )
  assert.ok(after > seed + 1000, 'volume must increase vs seed (refuse silent no-op)')
})

test('FISHING24: dialog commit「整個實體」persists objectType bodies and changes volume', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const box = { id: 'box', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, cornerOrigin: true, op: 'new' }
  const cut = {
    id: 'cut',
    type: 'extrude',
    profile: { kind: 'rect', a: [10, 10], b: [55, 30] },
    height: 40,
    plane: 'XY',
    baseZ: 0,
    through: true,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([box, cut], 'seed'), true, g().status)
  const seed = await vol()

  g().openFeatDlg('pattern')
  assert.equal(g().featDlg?.params.objectType, 'bodies')
  assert.equal(+g().featDlg?.params.objectPicked, 1)
  g().setFeatParam('countX', 3)
  g().setFeatParam('countY', 2)
  g().setFeatParam('dx', 100)
  g().setFeatParam('dy', 90)
  await g().commitFeatDlg()
  assert.equal(g().featDlg, null, g().status)
  assert.match(g().status, /已矩形陣列/)

  const pat = g().features.find((f) => f.type === 'pattern')
  assert.ok(pat, 'timeline pattern chip must exist')
  assert.equal(pat.objectType, 'bodies', 'commit must persist objectType bodies')
  assert.ok(!pat.targets?.length, '整個實體 must not attach feature targets')

  const after = await vol()
  assert.ok(
    Math.abs(after - seed * 6) < 1,
    `dialog body pattern volume ${after} want ${seed * 6} — toast alone is not success`,
  )
})

test('FISHING24: feature-targeted hole rectangular pattern still re-cuts (not filled)', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const plate = {
    id: 'base',
    type: 'extrude',
    profile: { kind: 'rect', a: [-40, -30], b: [40, 30] },
    height: 10,
    operation: 'new',
  }
  const hole = {
    id: 'hole',
    type: 'extrude',
    profile: { kind: 'circle', c: [-20, 0], r: 3 },
    height: 10,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([plate, hole], 'seed'), true, g().status)
  const seed = await vol()
  const solid = 80 * 60 * 10
  const one = Math.PI * 9 * 10
  assert.ok(Math.abs(seed - (solid - one)) < 0.5)

  const pat = {
    id: 'pat',
    type: 'pattern',
    countX: 2,
    countY: 1,
    dx: 40,
    dy: 0,
    targets: ['hole'],
  }
  assert.equal(await g().applyFeatures([plate, hole, pat], 'hole pat'), true, g().status)
  const after = await vol()
  assert.ok(
    Math.abs(after - (solid - 2 * one)) < 0.5,
    `feature hole pattern must cut second hole: got ${after}, want ${solid - 2 * one}`,
  )
  assert.ok(after < seed - 1, 'second hole must reduce volume')
})
