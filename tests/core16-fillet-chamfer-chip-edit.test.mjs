/**
 * CORE16 residual more9: Fillet/chamfer Timeline chip quick-edit of legal values.
 * Legal R / distance edits must APPLY (volume changes) — never false「尺寸必須大於 0」.
 * Complements core16-fillet-radius-gate + core16-chamfer-dist2-zero-refuse (gates)
 * and core16-timeline-chip-legal-size (revolve/sweep angle, not fillet/chamfer).
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
const { ILLEGAL_LENGTH_DETAIL, isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')
const { chamferTimelineParamSummary } = await import('../src/ui/chamferLabel.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const FILLET_R2 = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }
const CHAMFER_D2 = { id: 'C', type: 'chamfer', distance: 2, edges: 'all', cmode: 'equal' }
const ILLEGAL = /尺寸必須大於 0/
const ILLEGAL_STATUS = /尺寸已拒絕：尺寸必須大於 0/
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

test('Timeline META: fillet radius + chamfer distance are POSITIVE_LENGTH (legal >0 commit path)', () => {
  const tl = rd('src/components/Timeline.tsx')
  assert.match(tl, /fillet:[\s\S]{0,120}?field: 'radius'[\s\S]{0,40}?unit: 'mm'/)
  assert.match(tl, /chamfer:[\s\S]{0,200}?field: 'distance'[\s\S]{0,80}?unit: 'mm'/)
  const m = tl.match(/const POSITIVE_LENGTH_KEYS = new Set\(\[([\s\S]*?)\]\)/)
  assert.ok(m, 'POSITIVE_LENGTH_KEYS')
  assert.match(m[1], /['"]radius['"]/)
  assert.match(m[1], /['"]distance['"]/)
  assert.match(m[1], /['"]dist2['"]/)
  // NumField rejectDetail for length keys uses Formal ILLEGAL_LENGTH_DETAIL
  assert.match(tl, /POSITIVE_LENGTH_KEYS\.has\(fd\.key\) \? ILLEGAL_LENGTH_DETAIL/)
  assert.equal(ILLEGAL_LENGTH_DETAIL, '尺寸必須大於 0，未更改模型')
})

test('chamferTimelineParamSummary: equal chip Formal 距離 Nmm (numeric display)', () => {
  assert.equal(chamferTimelineParamSummary({ distance: 2, cmode: 'equal' }), '距離 2mm')
  assert.equal(chamferTimelineParamSummary({ distance: 1.5 }), '距離 1.5mm')
  assert.doesNotMatch(chamferTimelineParamSummary({ distance: 2 }), COLLOQ)
})

test('editFeature: legal fillet R 2→3 applies (no false 尺寸必須大於 0); volume shrinks', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX, FILLET_R2], 'seed fillet'), true, g().status)
  const v0 = await vol()
  assert.ok(v0 > 1000, `seed vol ${v0}`)
  assert.ok(v0 < 40 * 30 * 20, 'fillet already removed material')

  await g().editFeature('F', { radius: 3 })
  assert.ok(!isIllegalRejectStatus(g().status), g().status)
  assert.doesNotMatch(g().status, ILLEGAL_STATUS)
  assert.doesNotMatch(g().status, ILLEGAL)
  assert.equal(g().features.find((x) => x.id === 'F')?.radius, 3, g().status)
  const v1 = await vol()
  assert.ok(v1 < v0 - 1, `R 2→3 must shrink volume: ${v1} vs ${v0}`)
})

test('editFeature: legal chamfer distance 2→4 applies (no false 尺寸必須大於 0); volume shrinks', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX, CHAMFER_D2], 'seed chamfer'), true, g().status)
  const v0 = await vol()
  assert.ok(v0 > 1000 && v0 < 40 * 30 * 20, `seed chamfer vol ${v0}`)

  await g().editFeature('C', { distance: 4 })
  assert.ok(!isIllegalRejectStatus(g().status), g().status)
  assert.doesNotMatch(g().status, ILLEGAL_STATUS)
  assert.doesNotMatch(g().status, ILLEGAL)
  assert.equal(g().features.find((x) => x.id === 'C')?.distance, 4, g().status)
  const v1 = await vol()
  assert.ok(v1 < v0 - 1, `d 2→4 must shrink volume: ${v1} vs ${v0}`)
})

test('editFeature: illegal fillet R=0 still Formal refuses (gate kept; chip min path)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX, FILLET_R2], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await vol()
  await g().editFeature('F', { radius: 0 })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕/)
  assert.match(g().status, /必須大於 0|大於 0/)
  assert.deepEqual(g().features, before)
  assert.ok(Math.abs((await vol()) - v0) < 1e-3)
})

test('editFeature: illegal chamfer distance=0 still Formal refuses', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX, CHAMFER_D2], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  await g().editFeature('C', { distance: 0 })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕/)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.find((x) => x.id === 'C')?.distance, 2)
})
