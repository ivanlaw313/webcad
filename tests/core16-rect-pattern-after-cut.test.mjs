/**
 * CORE16 residual more16: rectangular body pattern residual beyond fishing24 /
 * core16-rect-body-pattern-after-cut (cut→pattern).
 * Gap covered here: pattern → cut → pattern again; and pattern of the cut body
 * (body pattern whose seed is a cut solid) must fuse, not no-op.
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

const BOX = {
  id: 'box',
  type: 'prim',
  shape: 'box',
  a: 50,
  b: 40,
  c: 20,
  cornerOrigin: true,
  op: 'new',
}

/** Residual gap: body pattern, then through-cut, then another body pattern — both patterns must fuse. */
test('CORE16 more16: pattern → cut → pattern again multiplies volume (no silent no-op)', async () => {
  reset()
  const pat1 = {
    id: 'pat1',
    type: 'pattern',
    countX: 2,
    countY: 1,
    countZ: 1,
    dx: 70,
    dy: 0,
    dz: 0,
    objectType: 'bodies',
  }
  assert.equal(await g().applyFeatures([BOX, pat1], 'pat1'), true, g().status)
  const afterPat1 = await vol()
  const solid = 50 * 40 * 20
  assert.ok(Math.abs(afterPat1 - solid * 2) < 1, `first body pattern: ${afterPat1} want ${solid * 2}`)

  // Through cut on first instance only (rect inside first box footprint)
  const cut = {
    id: 'cut',
    type: 'extrude',
    profile: { kind: 'rect', a: [5, 5], b: [25, 25] },
    height: 20,
    plane: 'XY',
    baseZ: 0,
    through: true,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([BOX, pat1, cut], 'cut'), true, g().status)
  const afterCut = await vol()
  const cutVol = 20 * 20 * 20
  // Cut hits only the first of two non-overlapping bodies → remove one cutVol
  assert.ok(Math.abs(afterCut - (afterPat1 - cutVol)) < 1, `cut after pattern: ${afterCut} want ${afterPat1 - cutVol}`)

  const pat2 = {
    id: 'pat2',
    type: 'pattern',
    countX: 1,
    countY: 2,
    countZ: 1,
    dx: 0,
    dy: 60,
    dz: 0,
    objectType: 'bodies',
  }
  assert.equal(await g().applyFeatures([BOX, pat1, cut, pat2], 'pat2'), true, g().status)
  const afterPat2 = await vol()
  const expected = afterCut * 2 // Y spacing 60 on 40-deep bodies → no overlap
  assert.ok(
    Math.abs(afterPat2 - expected) < 1,
    `second body pattern after cut must fuse: got ${afterPat2}, want ${expected} (afterCut ${afterCut}). No-op = fishing24-class regression`,
  )
  assert.ok(afterPat2 > afterCut + 1000, 'volume must increase after second body pattern')
})

/** Pattern of cut body: seed is cut solid; 2×1 body pattern must ×2 (complements 2×2 / 3×2 fishing24 cases). */
test('CORE16 more16: 2×1 body pattern of cut solid fuses (volume ×2)', async () => {
  reset()
  const cut = {
    id: 'cut',
    type: 'extrude',
    profile: { kind: 'rect', a: [8, 8], b: [28, 28] },
    height: 20,
    plane: 'XY',
    baseZ: 0,
    through: true,
    operation: 'cut',
  }
  assert.equal(await g().applyFeatures([BOX, cut], 'seed cut'), true, g().status)
  const seed = await vol()
  const solid = 50 * 40 * 20
  const cutVol = 20 * 20 * 20
  assert.ok(Math.abs(seed - (solid - cutVol)) < 1, `seed ${seed} want ${solid - cutVol}`)

  const pat = {
    id: 'pat',
    type: 'pattern',
    countX: 2,
    countY: 1,
    countZ: 1,
    dx: 70,
    dy: 0,
    dz: 0,
    objectType: 'bodies',
  }
  assert.equal(await g().applyFeatures([BOX, cut, pat], 'body of cut'), true, g().status)
  const after = await vol()
  assert.ok(
    Math.abs(after - seed * 2) < 1,
    `pattern of cut body: got ${after}, want ${seed * 2}. Toast+chip with unchanged vol = fail`,
  )
})

test('source lock: bodies bypass of prevWasCut still present (FISHING24)', () => {
  const worker = rd('src/worker/cad.worker.ts')
  assert.match(worker, /objectType !== 'bodies'/)
  assert.match(worker, /FISHING24 P1：objectType==='bodies'/)
})
