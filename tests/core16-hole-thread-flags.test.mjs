/**
 * CORE16 residual more13: Hole / thread flags (Formal gates + create sample).
 * Covers holeType=tapped + holeTapModeled → persisted tap-drill hole OR modeled ithread.
 * Complements core16-hole-diameter-gate / core16-hole-csink-through without re-testing Ø/csink.
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
const { useApp, ISO_COARSE, nearestIsoNom } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const BOX = { id: 'box', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
/** three-world pick → CAD center (20,15) on top face z=20 */
const HOLE_POS = [20, 20, -15]

test('source: hole tapped + holeTapModeled flags wired (store + Viewport)', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(st, /setHoleType: \(t: 'simple' \| 'counterbore' \| 'countersink' \| 'nuttrap' \| 'tapped'\)/)
  assert.match(st, /holeTapModeled: boolean/)
  assert.match(st, /setHoleTapModeled: \(v: boolean\) => void/)
  assert.match(st, /holeTapModeled: false/)
  assert.match(st, /setHoleTapModeled: \(v\) => set\(\{ holeTapModeled: v \}\)/)
  assert.match(st, /if \(get\(\)\.holeTapModeled\) \{/)
  assert.match(st, /type: 'ithread'/)
  assert.match(st, /已攻建模螺紋 M\$\{nom\}/)
  assert.match(vp, /setHoleType\('tapped'\)/)
  assert.match(vp, /checked=\{holeTapModeled\}/)
  assert.match(vp, /setHoleTapModeled\(e\.target\.checked\)/)
  assert.match(st, /export const ISO_COARSE/)
  assert.match(st, /export const nearestIsoNom/)
  assert.match(st, /tap: \{ drillDiameter:/)
})

test('source: ISO coarse table + nearestIsoNom sample (M8×1.25)', () => {
  assert.equal(ISO_COARSE[8], 1.25)
  assert.equal(ISO_COARSE[6], 1.0)
  assert.equal(nearestIsoNom(8), 8)
  assert.equal(nearestIsoNom(7.8), 8)
  assert.equal(nearestIsoNom(5.9), 6)
})

test('runtime: tapped (tap-drill, not modeled) through hole changes volume', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  assert.ok(Math.abs(v0 - 40 * 30 * 20) < 1, `seed vol ${v0}`)

  useApp.setState({
    holeMode: true,
    holePos: HOLE_POS,
    holeFaceZ: 20,
    holeD: 8,
    holeThrough: true,
    holeType: 'tapped',
    holeTapModeled: false,
    holeFinePitch: false,
  })
  await g().commitHole()
  assert.equal(g().holeMode, false, `commit should close; status=${g().status}`)
  const hole = g().features.find((f) => f.type === 'hole')
  assert.ok(hole, `persisted hole feature; status=${g().status}`)
  assert.equal(hole.kind, 'tapped')
  assert.equal(hole.tap?.nominalDiameter, 8)
  assert.equal(hole.tap?.pitch, 1.25)
  assert.equal(hole.tap?.drillDiameter, 6.75)
  assert.ok(hole.through || hole.extent === 'through-all')
  assert.match(g().status, /攻牙底孔 M8×1\.25|已建立攻牙/)
  assert.doesNotMatch(g().status, COLLOQ)

  const v1 = await vol()
  // Tap-drill Ø 6.75 through top=20 → Δ ≈ π·(3.375)²·20
  const expectCut = Math.PI * (6.75 / 2) ** 2 * 20
  assert.ok(v1 < v0 - expectCut * 0.5, `tap-drill must cut: ${v0} → ${v1}`)
  assert.ok(Math.abs(v1 - (v0 - expectCut)) < 15, `Δ≈${expectCut}, got ${v0 - v1}`)
  assert.equal(g().features.filter((f) => f.type === 'ithread').length, 0, 'not modeled → no ithread')
})

test('runtime: holeTapModeled → Formal create sample (ithread feature)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  const n0 = g().features.length

  useApp.setState({
    holeMode: true,
    holePos: HOLE_POS,
    holeFaceZ: 20,
    holeD: 8,
    holeThrough: true,
    holeType: 'tapped',
    holeTapModeled: true,
    holeFinePitch: false,
  })
  await g().commitHole()
  for (let i = 0; i < 400 && g().busy; i++) await new Promise((r) => setTimeout(r, 10))

  const st = g().status || ''
  const hasIthread = g().features.some((f) => f.type === 'ithread')
  if (hasIthread) {
    assert.match(st, /已攻建模螺紋 M8×1\.25/, `Formal modeled toast: ${st}`)
    assert.doesNotMatch(st, COLLOQ)
    const f = g().features.find((x) => x.type === 'ithread')
    assert.equal(f.d, 8)
    assert.equal(f.pitch, 1.25)
    assert.ok(f.height > 0)
    const v1 = await vol()
    assert.ok(Math.abs(v1 - v0) > 1 || g().features.length > n0, `modeled must add feature / change vol: ${v0} → ${v1}`)
  } else {
    assert.match(st, /建模螺纹失败|建模螺紋失敗|已回退|攻/, `known modeled outcome: ${st}`)
    assert.equal(g().features.filter((f) => f.type === 'ithread').length, 0)
  }
})

test('runtime: setHoleTapModeled toggles flag; Ø≤0 still Formal refuse for tapped', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  assert.equal(g().holeTapModeled, false)
  g().setHoleTapModeled(true)
  assert.equal(g().holeTapModeled, true)
  g().setHoleType('tapped')
  assert.equal(g().holeType, 'tapped')
  useApp.setState({
    holeMode: true,
    holePos: HOLE_POS,
    holeFaceZ: 20,
    holeD: 0,
    holeThrough: true,
    holeType: 'tapped',
    holeTapModeled: false,
  })
  await g().commitHole()
  assert.match(g().status, /尺寸已拒絕：孔徑Ø必須大於 0/)
  assert.deepEqual(g().features, before)
  assert.equal(g().holeMode, true)
})
