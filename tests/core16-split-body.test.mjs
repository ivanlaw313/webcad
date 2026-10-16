/**
 * CORE16 residual more4: Split body (分割實體).
 * After cut plane → two bodies; failure → Formal 繁中.
 * Complements core16-b3 splitPlaneMissReason helper coverage with store dialog + volume.
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
const { useApp, splitPlaneMissReason } = await import('../src/store.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await globalThis.__wheelWorker.exportSTEP()])))
const meshVol = (m) => {
  const t = m.triangles, p = m.vertices
  let v = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    v += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1])
      - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c])
      + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])
  }
  return Math.abs(v) / 6
}

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /分割实体|没有穿过实体|请把位置|重建失败/

test('source: splitbody dialog + miss reason Formal TC wired', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  assert.match(st, /export function splitPlaneMissReason/)
  assert.match(st, /分割實體：\$\{f\.axis \?\? 'Z'\} = \$\{r\(off\)\} mm 的平面沒有穿過實體/)
  assert.match(st, /分割實體失敗：分割平面與實體的交線無法建立/)
  assert.match(st, /if \(String\(p\.offset \?\? ''\)\.trim\(\) === '' \|\| !Number\.isFinite\(\+p\.offset\)\)/)
  assert.match(st, /分割實體：請輸入分割平面的位置（數字，單位 mm）/)
  assert.ok(st.includes('分割平面沒有穿過實體'), 'dialog bbox miss Formal TC')
  assert.match(vp, /splitbody: '分割實體'/)
  assert.doesNotMatch(st, /分割实体：.*没有穿过实体/)
})

test('splitPlaneMissReason: miss → Formal 繁中; hit → null', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  assert.equal(splitPlaneMissReason(g().bodyMesh, { axis: 'Z', offset: 10 }), null)
  const miss = splitPlaneMissReason(g().bodyMesh, { axis: 'Z', offset: 50 })
  assert.match(miss, /分割實體：Z = 50 mm 的平面沒有穿過實體/)
  assert.match(miss, /實體在 Z 方向範圍為 0～20 mm/)
  assert.doesNotMatch(miss, COLLOQ)
  assert.doesNotMatch(miss, SC)
})

test('runtime: commitFeatDlg split at mid-plane → two bodies; volumes sum ≈ original', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  assert.ok(Math.abs(v0 - 40 * 30 * 20) < 1, `seed ${v0}`)
  assert.equal(g().bodyMesh?.parked?.length ?? 0, 0)

  g().openFeatDlg('splitbody')
  assert.equal(g().featDlg?.kind, 'splitbody')
  g().setFeatParam('axis', 'Z')
  g().setFeatParam('offset', 10)
  g().setFeatParam('keep', 'hi')
  await g().commitFeatDlg()

  assert.ok(g().features.some((f) => f.type === 'split'), g().status)
  assert.equal(g().featDlg, null, g().status)
  const parked = g().bodyMesh?.parked ?? []
  assert.equal(parked.length, 1, `expect one parked half, got ${parked.length}; status=${g().status}`)
  const vActive = meshVol(g().bodyMesh)
  const vPark = meshVol(parked[0])
  assert.ok(vActive > 100 && vPark > 100, `halves ${vActive} + ${vPark}`)
  assert.ok(Math.abs(vActive + vPark - v0) < 5, `sum ${vActive + vPark} vs ${v0}`)
  assert.match(g().status, /分割|活動體|合共|已/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
})

test('runtime: applyFeatures split → two bodies (active + parked)', async () => {
  reset()
  const split = { id: 'S', type: 'split', axis: 'X', offset: 15, keep: 'hi', nameA: '分割A', nameB: '分割B' }
  assert.equal(await g().applyFeatures([BOX, split], 'split'), true, g().status)
  assert.equal(g().bodyMesh?.parked?.length, 1, g().status)
  const vA = meshVol(g().bodyMesh)
  const vB = meshVol(g().bodyMesh.parked[0])
  // X=15 on 40-wide corner box → hi=25*30*20=15000, lo=15*30*20=9000
  assert.ok(Math.abs(vA - 15000) < 5, `hi ${vA}`)
  assert.ok(Math.abs(vB - 9000) < 5, `lo ${vB}`)
  assert.ok(g().features.some((f) => f.type === 'split'))
})

test('runtime: miss plane via dialog → Formal 繁中; no split feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const before = structuredClone(g().features)
  g().openFeatDlg('splitbody')
  g().setFeatParam('axis', 'Z')
  g().setFeatParam('offset', 50)
  await g().commitFeatDlg()
  // Dialog path uses a short Formal TC line (store commitFeatDlg bbox gate);
  // splitPlaneMissReason helper still produces the longer 「分割實體：…」form.
  assert.match(g().status, /沒有穿過實體/)
  assert.match(g().status, /分割實體|請把位置設在此範圍/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.doesNotMatch(g().status, /^⚠ 重建失[敗败]/)
  assert.equal(g().features.filter((f) => f.type === 'split').length, 0)
  assert.deepEqual(
    g().features.map((f) => f.id),
    before.map((f) => f.id),
  )
  assert.equal(g().bodyMesh?.parked?.length ?? 0, 0)
  // dialog may stay open so user can fix offset
  assert.ok(g().featDlg?.kind === 'splitbody' || g().featDlg == null)
})

test('runtime: blank offset → Formal 繁中 prompt; model unchanged', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  g().openFeatDlg('splitbody')
  g().setFeatParam('axis', 'Z')
  g().setFeatParam('offset', '')
  await g().commitFeatDlg()
  assert.match(g().status, /請輸入分割平面的位置/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().features.some((f) => f.type === 'split'), false)
  useApp.setState({ featDlg: null })
})
