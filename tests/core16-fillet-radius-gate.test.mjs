/**
 * CORE16 residual more4: Fillet/Round (圓角) radius gate.
 * R=0 → Formal 繁中拒; oversized R → Formal TC refuse; legal R changes volume.
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
const { useApp, roundFailText } = await import('../src/store.ts')
const {
  ILLEGAL_LENGTH_DETAIL,
  illegalRejectStatus,
  isIllegalRejectStatus,
} = await import('../src/ui/illegalInput.ts')
const { plainFeatureError } = await import('../src/ui/featureStatus.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const FILLET_R2 = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /圆角半径太大|请减小半径|尺寸已拒绝|必须大于/

test('illegalInput + roundFailText: R=0 / oversize strings are Formal 繁中', () => {
  assert.equal(ILLEGAL_LENGTH_DETAIL, '尺寸必須大於 0，未更改模型')
  const zero = illegalRejectStatus(ILLEGAL_LENGTH_DETAIL)
  assert.equal(zero, '尺寸已拒絕：尺寸必須大於 0，未更改模型')
  assert.equal(isIllegalRejectStatus(zero), true)
  assert.doesNotMatch(zero, SC)
  assert.doesNotMatch(zero, COLLOQ)

  const over = roundFailText('圓角', 'radius too large', true)
  assert.match(over, /圓角半徑太大（超過相鄰面）/)
  assert.doesNotMatch(over, SC)
  assert.doesNotMatch(over, COLLOQ)

  const plain = plainFeatureError('fillet', 'fillet near points failed')
  assert.match(plain, /無法建立圓角|半徑/)
  assert.doesNotMatch(plain, COLLOQ)
  assert.doesNotMatch(plain, /圆角/)
})

test('source: commitEdgeRound / applyFeatures / Viewport pin Formal TC for R≤0 and oversize', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.ok(st.includes("請輸入大於 0 的"), 'commitEdgeRound zero-size prompt')
  assert.ok(st.includes("'圓角半徑'"), '圓角半徑 label in zero prompt')
  assert.match(st, /fillet: '圓角半徑太大（超過相鄰面）— 請減小半徑'/)
  assert.match(st, /roundFailText\(kind/)
  assert.match(vp, /圓角半徑太大（超過相鄰面）— 請減小數值後再按「確定」/)
  assert.match(vp, /data-testid="round-preview-fail"/)
  assert.doesNotMatch(vp, /圆角半径太大/)
})

test('runtime: editFeature(radius 0) → Formal 繁中拒; tree unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX, FILLET_R2], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  const v0 = await vol()
  await g().editFeature('F', { radius: 0 })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /尺寸已拒絕/)
  assert.match(g().status, /必須大於 0|大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.find((x) => x.id === 'F')?.radius, 2)
  assert.ok(Math.abs((await vol()) - v0) < 1e-3, 'R=0 must not change volume')
})

test('runtime: commitEdgeRound with R=0 refuses (Formal TC); no fillet feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const n0 = g().features.length
  // three-world pick of CAD edge near (40,0,10) → [40, 10, 0]
  useApp.setState({
    edgeRoundPick: 'fillet',
    edgeRoundPicks: [[40, 10, 0]],
    edgeRoundPickLines: [],
    edgeRoundRadii: [0],
    edgeRoundGroupIds: [0],
    edgeRoundSize: 0,
    filletMode: 'radius',
    filletType: 'fillet',
    filletRadiusGroups: [{ radius: 0, continuity: 'G1' }],
    filletActiveGroup: 0,
  })
  await g().commitEdgeRound()
  assert.match(g().status, /請輸入大於 0 的圓角半徑/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().features.length, n0, 'R=0 never commits a fillet')
  assert.equal(g().features.some((f) => f.type === 'fillet'), false)
})

test('runtime: oversized R → Formal 繁中 refuse; model volume unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  const before = structuredClone(g().features)
  const ok = await g().applyFeatures(
    [BOX, { id: 'Fhuge', type: 'fillet', radius: 999, edges: 'all' }],
    'oversize',
    true,
  )
  assert.equal(ok, false, g().status)
  assert.match(g().status, /圓角半徑太大|半徑.*過大|全稜倒圓角.*失敗|無法建立圓角|相對幾何過大/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.doesNotMatch(g().status, /^⚠ 重建失败[^-]/)
  assert.equal(g().features.filter((f) => f.type === 'fillet').length, 0)
  assert.ok(Math.abs((await vol()) - v0) < 1, `volume must stay: ${v0} → ${await vol()}`)
  // features may roll back to last good — at least no silent huge fillet
  assert.ok(!g().features.some((f) => f.id === 'Fhuge' && f.radius === 999))
  void before
})

test('runtime: legal R changes volume (material removed)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  assert.ok(Math.abs(v0 - 40 * 30 * 20) < 1, `seed vol ${v0}`)
  assert.equal(await g().applyFeatures([BOX, FILLET_R2], 'fillet R2'), true, g().status)
  const v1 = await vol()
  assert.ok(v1 < v0 - 10, `legal fillet must remove material: ${v0} → ${v1}`)
  assert.ok(g().features.some((f) => f.type === 'fillet' && f.radius === 2))
  assert.doesNotMatch(g().status, COLLOQ)
})
