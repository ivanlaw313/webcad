/**
 * CORE16 residual more8: Emboss adjacent Formal gates beyond empty-text / depth-0
 * (those are covered by core16-emboss-empty-depth-refuse).
 * Here: size(字高)=0, negative depth, engrave-mode depth 0, commit/edit refuse.
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

const { useApp } = await import('../src/store.ts')
const { featDlgBlockingReason } = await import('../src/cad/featDlgNumeric.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)

const SIZE0 = '字高必須大於 0'
const DEPTH0 = '浮雕深度必須大於 0（凸起／刻入用下方選項切換）'
const EMPTY = '請輸入浮雕文字'
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /尺寸已拒绝|必须大于|字高必须/

test('featDlgSemantic: size 0 → Formal 繁中拒 (adjacent to empty/depth0)', () => {
  const r = featDlgBlockingReason({ kind: 'emboss', params: { text: 'AB', depth: 1.5, size: 0 } })
  assert.equal(r, SIZE0)
  assert.doesNotMatch(r, /^尺寸已拒絕：/)
  assert.doesNotMatch(r, COLLOQ)
  assert.doesNotMatch(r, SC)
})

test('featDlgSemantic: negative depth → Formal depth-0 refuse', () => {
  const r = featDlgBlockingReason({ kind: 'emboss', params: { text: 'AB', depth: -1, size: 8 } })
  assert.equal(r, DEPTH0)
})

test('featDlgSemantic: precedence empty > depth > size', () => {
  assert.equal(
    featDlgBlockingReason({ kind: 'emboss', params: { text: '', depth: 0, size: 0 } }),
    EMPTY,
  )
  assert.equal(
    featDlgBlockingReason({ kind: 'emboss', params: { text: 'X', depth: 0, size: 0 } }),
    DEPTH0,
  )
  assert.equal(
    featDlgBlockingReason({ kind: 'emboss', params: { text: 'X', depth: 1, size: 0 } }),
    SIZE0,
  )
})

test('source: featDlgNumeric + store pin size-0 Formal detail (no duplicated marker)', () => {
  const num = rd('src/cad/featDlgNumeric.ts')
  const st = rd('src/store.ts')
  assert.match(num, /return '字高必須大於 0'/)
  assert.doesNotMatch(num, /return '尺寸已拒絕：字高必須大於 0'/)
  // commit path still uses the shared illegalReject / 未提交 prefix for size
  assert.match(st, /字高|浮雕字高/)
})

test('commitFeatDlg: size 0 → Formal refuse; dialog stays open', async () => {
  reset()
  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: 'AB', depth: 1.5, size: 0, mode: 'emboss' },
      payload: { arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] } },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /字高必須大於 0|未提交：/)
  assert.ok(g().featDlg, 'dialog stays open on size-0 refuse')
  assert.doesNotMatch(g().status, COLLOQ)
})

test('commitFeatDlg: engrave mode + depth 0 still Formal refuse', async () => {
  reset()
  useApp.setState({
    featDlg: {
      kind: 'emboss',
      params: { text: 'AB', depth: 0, size: 8, mode: 'engrave' },
      payload: { arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] } },
    },
  })
  await g().commitFeatDlg()
  assert.match(g().status, /浮雕深度必須大於 0|尺寸已拒絕：浮雕字高和深度都必須大於 0/)
  assert.ok(g().featDlg, 'dialog stays open')
})

test('editFeature timeline: size 0 refuse Formal TC; height unchanged', async () => {
  reset()
  const box = { id: 'b', type: 'extrude', profile: { kind: 'rect', a: [-20, -15], b: [20, 15] }, height: 10, operation: 'new' }
  const emb = {
    id: 'e1', type: 'text', text: 'AB', size: 8, height: 1.5, op: 'new',
    arbPlane: { o: [0, 0, 10], xd: [1, 0, 0], n: [0, 0, 1] },
  }
  assert.equal(await g().applyFeatures([box, emb], 'seed'), true, g().status)
  await g().editFeature('e1', { size: 0 })
  assert.match(g().status, /字高必須大於 0|尺寸必須大於 0|尺寸已拒絕/)
  assert.equal(g().features.find((f) => f.id === 'e1')?.size, 8, 'size unchanged on refuse')
})
