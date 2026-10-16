/**
 * CORE16 residual more7: Timeline chip / sidebar legal-dimension edits.
 * Follows core16-revolve-angle-gate spirit for sweep too:
 * legal angle/twist/wall=0 edits must NOT wrongly refuse with「尺寸必須大於 0」.
 * Complements revolve-angle-gate without duplicating angle-0 Formal refuse coverage.
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
await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')
const { ILLEGAL_LENGTH_DETAIL } = await import('../src/ui/illegalInput.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => {
  const buf = await globalThis.__wheelWorker.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}

const ILLEGAL = /尺寸必須大於 0/
const ILLEGAL_STATUS = /尺寸已拒絕：尺寸必須大於 0/

test('Timeline: twist / angle are NOT POSITIVE_LENGTH_KEYS (legal ° edits use no 尺寸必須大於 0 min)', () => {
  const tl = rd('src/components/Timeline.tsx')
  const m = tl.match(/const POSITIVE_LENGTH_KEYS = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(m, 'POSITIVE_LENGTH_KEYS set')
  assert.doesNotMatch(m[1], /['"]twist['"]/)
  assert.doesNotMatch(m[1], /['"]angle['"]/)
  assert.doesNotMatch(m[1], /['"]scale['"]/)
  // revolve angle field exists; sweep circle chip uses r (length — legal positive only)
  assert.match(tl, /revolve:[\s\S]{0,200}?field: 'angle'/)
  assert.match(tl, /sweep:[\s\S]{0,200}?field: 'r'/)
})

test('setFeatParam positiveFeatKeys: wall / twist / angle excluded (sidebar wall 0 / twist legal)', () => {
  const st = rd('src/store.ts')
  const m = st.match(/const positiveFeatKeys = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(m, 'positiveFeatKeys set in setFeatParam')
  assert.doesNotMatch(m[1], /['"]wall['"]/)
  assert.doesNotMatch(m[1], /['"]twist['"]/)
  assert.doesNotMatch(m[1], /['"]angle['"]/)
  // editFeature still allows wall ≥ 0 (solid); length keys stay gated
  assert.match(st, /k === 'wall' \? !\(Number\(patch\[k\]\) >= 0\)/)
})

test('featDlgSemantic: legal revolve angles + wall 0 not blocked by 尺寸必須大於 0', () => {
  for (const a of [1, 90, 180, 360]) {
    const r = featDlgBlockingReason({ kind: 'revolve', params: { angle: a, wall: 0 } })
    assert.equal(r, null, `angle ${a} wall 0 must pass, got ${r}`)
    assert.doesNotMatch(String(r), ILLEGAL)
  }
})

test('editFeature: legal revolve angle + wall 0 succeed (no 尺寸必須大於 0)', async () => {
  reset()
  const rev = {
    id: 'rev1',
    type: 'revolve',
    profile: { kind: 'rect', a: [10, 0], b: [30, 20] },
    angle: 360,
    axis: 'Y',
    op: 'new',
  }
  assert.equal(await g().applyFeatures([rev], 'seed revolve'), true, g().status)
  const v0 = await vol()
  assert.ok(v0 > 1000, `seed volume ${v0}`)

  await g().editFeature('rev1', { angle: 180 })
  assert.doesNotMatch(g().status, ILLEGAL_STATUS)
  assert.equal(g().features.find((x) => x.id === 'rev1')?.angle, 180, g().status)

  await g().editFeature('rev1', { wall: 0 })
  assert.doesNotMatch(g().status, ILLEGAL_STATUS)
  assert.ok(!ILLEGAL_STATUS.test(g().status), `wall 0 must not trip length gate: ${g().status}`)
})

test('editFeature: legal sweep twist + r succeed; wall 0 not refused with 尺寸必須大於 0', async () => {
  reset()
  // Profile sweep — twist is meaningful; legal ° edit must not trip length gate
  const sw = {
    id: 'sw1',
    type: 'sweep',
    r: 5,
    op: 'new',
    path: [[0, 0], [60, 0], [60, 40]],
    profile: { kind: 'rect', a: [-5, -5], b: [5, 5] },
    twist: 30,
  }
  assert.equal(await g().applyFeatures([sw], 'seed sweep'), true, g().status)
  const v0 = await vol()
  assert.ok(v0 > 1000, `seed volume ${v0}`)

  await g().editFeature('sw1', { twist: 60 })
  assert.doesNotMatch(g().status, ILLEGAL_STATUS)
  assert.doesNotMatch(g().status, new RegExp(ILLEGAL_LENGTH_DETAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.equal(g().features.find((x) => x.id === 'sw1')?.twist, 60, g().status)
  const vTw = await vol()
  assert.ok(vTw > 1000, `twist edit kept solid: ${vTw}`)

  // Circle-pipe timeline chip field r — legal size edit (no 尺寸必須大於 0)
  reset()
  const pipe = { id: 'pipe1', type: 'sweep', r: 5, op: 'new', path: [[0, 0], [80, 0]] }
  assert.equal(await g().applyFeatures([pipe], 'seed pipe'), true, g().status)
  const vp0 = await vol()
  await g().editFeature('pipe1', { r: 7 })
  assert.doesNotMatch(g().status, ILLEGAL_STATUS)
  assert.equal(g().features.find((x) => x.id === 'pipe1')?.r, 7, g().status)
  const vp1 = await vol()
  assert.ok(vp1 > vp0 * 1.1, `r 5→7 volume grows: ${vp1} vs ${vp0}`)

  // wall 0 must NOT trip「尺寸必須大於 0」(revolve-angle-gate spirit for sweep)
  await g().editFeature('pipe1', { wall: 0 })
  assert.doesNotMatch(g().status, ILLEGAL_STATUS)
  assert.ok(!ILLEGAL_STATUS.test(g().status), `sweep wall 0 must not length-refuse: ${g().status}`)
  assert.equal(g().features.find((x) => x.id === 'pipe1')?.r, 7)
})


test('editFeature: illegal sweep r=0 still Formal refuses (gate not removed)', async () => {
  reset()
  const sw = {
    id: 'sw2',
    type: 'sweep',
    r: 5,
    op: 'new',
    path: [[0, 0], [50, 0]],
  }
  assert.equal(await g().applyFeatures([sw], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  await g().editFeature('sw2', { r: 0 })
  assert.match(g().status, ILLEGAL_STATUS)
  assert.match(g().status, /尺寸已拒絕：尺寸必須大於 0/)
  assert.deepEqual(g().features, before)
})
