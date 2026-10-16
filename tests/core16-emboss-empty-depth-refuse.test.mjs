/**
 * CORE16 residual: Emboss (浮雕) empty text and/or depth 0 → Formal 繁中拒.
 * Assert preview mesh/flag when the product exposes one (FEAT_DLG_DRY_PREVIEW + previewRound).
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
const { loadFont } = await import('replicad')
const buf = readFileSync(new URL('../src/fonts/Roboto-Regular.ttf', import.meta.url))
await loadFont(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'cad', true)

const { useApp, FEAT_DLG_DRY_PREVIEW_KINDS } = await import('../src/store.ts')
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true)

const EMPTY_TEXT = '請輸入浮雕文字'
const DEPTH0 = '浮雕深度必須大於 0（凸起／刻入用下方選項切換）'

test('featDlgSemantic: empty text → Formal 繁中拒 (detail-only, no duplicated 尺寸已拒絕)', () => {
  const r = featDlgBlockingReason({ kind: 'emboss', params: { text: '', depth: 1.5, size: 8 } })
  assert.equal(r, EMPTY_TEXT)
  assert.doesNotMatch(r, /^尺寸已拒絕：/)
  const r2 = featDlgBlockingReason({ kind: 'emboss', params: { text: '   ', depth: 1.5, size: 8 } })
  assert.equal(r2, EMPTY_TEXT)
})

test('featDlgSemantic: depth 0 → Formal 繁中拒', () => {
  const r = featDlgBlockingReason({ kind: 'emboss', params: { text: 'AB', depth: 0, size: 8 } })
  assert.equal(r, DEPTH0)
  assert.match(r, /浮雕深度必須大於 0/)
})

test('featDlgSemantic: empty text + depth 0 → empty-text first (one Formal reason)', () => {
  const r = featDlgBlockingReason({ kind: 'emboss', params: { text: '', depth: 0, size: 8 } })
  assert.equal(r, EMPTY_TEXT, 'empty text takes precedence over depth')
})

test('featDlgSemantic: legal emboss params pass', () => {
  assert.equal(
    featDlgBlockingReason({ kind: 'emboss', params: { text: 'OK', depth: 1.2, size: 6 } }),
    null,
  )
})

test('UI + commit: Viewport prefixes 尺寸已拒絕 once; commitFeatDlg Formal refuse', () => {
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /尺寸已拒絕：\{(?:block|featDlgBlockingReason\(featDlg\))\}/)
  assert.match(vp, /okDisabled=\{[\s\S]{0,2000}?!!featDlgBlockingReason\(featDlg\)/)
  const st = rd('src/store.ts')
  assert.match(st, /尺寸已拒絕：請輸入浮雕文字/)
  assert.match(st, /尺寸已拒絕：浮雕字高和深度都必須大於 0/)
  const num = rd('src/cad/featDlgNumeric.ts')
  assert.match(num, /return '請輸入浮雕文字'/)
  assert.match(num, /return '浮雕深度必須大於 0/)
  assert.doesNotMatch(num, /return '尺寸已拒絕：請輸入浮雕文字'/)
})

test('preview flag: emboss is in FEAT_DLG_DRY_PREVIEW_KINDS; dry-run skips when blocked', () => {
  assert.ok(FEAT_DLG_DRY_PREVIEW_KINDS.has('emboss'), 'emboss dry-run preview kind')
  const st = rd('src/store.ts')
  // buildFeatDlgPreview early-outs when featDlgBlockingReason is set (empty/depth0 → no fake mesh)
  assert.match(st, /FEAT_DLG_DRY_PREVIEW_KINDS\.has\(d\.kind\)[\s\S]{0,40}?featDlgBlockingReason\(d\)/)
})

test('previewRound: valid emboss exposes volumeExact; empty-text gate keeps dialog blocked', async () => {
  const box = { id: 'b', type: 'extrude', profile: { kind: 'rect', a: [-20, -15], b: [20, 15] }, height: 10, operation: 'new' }
  const text = {
    id: 't', type: 'text', text: 'AB', size: 8, height: 1.5, op: 'new',
    arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] },
  }
  const pv = await w.previewRound([box, text])
  assert.ok(pv?.volumeExact > 0, `preview volumeExact ${pv?.volumeExact}`)
  assert.ok(pv?.triangles?.length > 0, 'preview mesh triangles')

  // Store commit path refuse for empty text (no kernel call)
  reset()
  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: '', depth: 1.5, size: 8, mode: 'emboss' },
      payload: { arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] } },
    },
  })
  await g().commitFeatDlg()
  // Shared BUG-417 gate: 未提交： + Formal semantic reason (dialog stays open)
  assert.match(g().status, /未提交：請輸入浮雕文字|尺寸已拒絕：請輸入浮雕文字/)
  assert.ok(g().featDlg, 'dialog stays open on refuse')

  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: 'AB', depth: 0, size: 8, mode: 'emboss' },
      payload: { arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] } },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /未提交：浮雕深度必須大於 0|尺寸已拒絕：浮雕字高和深度都必須大於 0|浮雕深度必須大於 0/)
  assert.ok(g().featDlg, 'dialog stays open on depth-0 refuse')
})

test('editFeature timeline: empty text / depth 0 refuse Formal TC', async () => {
  reset()
  const box = { id: 'b', type: 'extrude', profile: { kind: 'rect', a: [-20, -15], b: [20, 15] }, height: 10, operation: 'new' }
  const emb = {
    id: 'e1', type: 'text', text: 'AB', size: 8, height: 1.5, op: 'new',
    arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] },
  }
  assert.equal(await g().applyFeatures([box, emb], 'seed'), true, g().status)
  await g().editFeature('e1', { text: '' })
  assert.match(g().status, /請輸入浮雕文字/)
  assert.equal(g().features.find((f) => f.id === 'e1')?.text, 'AB', 'text unchanged on refuse')
  await g().editFeature('e1', { height: 0 })
  assert.match(g().status, /浮雕深度必須大於 0/)
  assert.equal(g().features.find((f) => f.id === 'e1')?.height, 1.5, 'depth unchanged on refuse')
})
