/**
 * CORE16 residual more3: Thicken (加厚) thickness 0 and 99999 → Formal 繁中拒.
 * Complements thicken-oversize-refuse / thicken-oversize-ui-gate / fishing31 without
 * re-testing the same commitThicken dialog paths — focuses on timeline-chip + dual-path wiring.
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
const { useApp, thickenOversizeReason, thickenGateMesh } = await import('../src/store.ts')
const { isIllegalRejectStatus, illegalRejectStatus } = await import('../src/ui/illegalInput.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
const TOP = [20, 10, -15]
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /尺寸已拒绝|加厚厚度必须|必须大于|过大/

async function boxWithThicken(thick = 2) {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  g().toggleThicken()
  await g().thickenFaceAt(TOP)
  g().setThicken({ thick })
  await g().commitThicken()
  const f = g().features.find((x) => x.type === 'thickenface')
  assert.ok(f, g().status)
  return f
}

test('source: dialog + timeline chip both gate thick 0 and oversize (Formal TC)', () => {
  const st = rd('src/store.ts')
  const vp = rd('src/components/Viewport.tsx')
  const tl = rd('src/components/Timeline.tsx')
  // dialog commit path
  assert.match(st, /illegalRejectStatus\('加厚厚度必須大於 0'\)/)
  assert.match(st, /thickenOversizeReason\(s\.bodyMesh, s\.thickenThick\)/)
  assert.match(vp, /okDisabled=\{!!numBad \|\| !thickenPicks\.length \|\| !\(thickenThick > 0\) \|\| !!thickenOver\}/)
  assert.match(vp, /data-testid="thicken-oversize-alert"/)
  // timeline chip path (quick-edit NumField)
  assert.match(tl, /加厚厚度不可為 0（輸入負數可翻轉方向）/)
  assert.match(tl, /liveReject=\{\(n\) => \(Math\.abs\(n\) > 0 \? thickenOversizeReason\(thickenGateMesh/)
  assert.match(tl, /data-testid="timeline-illegal-alert"/)
  // Gate strings themselves must stay Formal TC (whole-file SC scan is too noisy — comments elsewhere).
  for (const s of ["加厚厚度必須大於 0", "加厚厚度不可為 0（輸入負數可翻轉方向）"]) {
    assert.doesNotMatch(s, SC)
    assert.doesNotMatch(s, COLLOQ)
  }
  assert.match(st, /illegalRejectStatus\(over\)/)
})

test('timeline chip: editFeature(thick 0) → Formal 繁中拒; tree unchanged', async () => {
  const f = await boxWithThicken(2)
  const before = structuredClone(g().features)
  await g().editFeature(f.id, { thick: 0, side: 'pos' })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  // positiveKeys path uses ILLEGAL_LENGTH_DETAIL; chip onCommit uses 加厚厚度不可為 0 —
  // either Formal 繁中拒 is acceptable; colloquial / SC is not.
  assert.match(g().status, /尺寸已拒絕/)
  assert.match(g().status, /必須大於 0|不可為 0|大於 0/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.find((x) => x.id === f.id)?.thick, 2)
})

test('timeline chip: editFeature(thick 99999) → Formal 繁中拒; 3 mm still rebuilds', async () => {
  const f = await boxWithThicken(2)
  const before = structuredClone(g().features)
  await g().editFeature(f.id, { thick: 99999, side: 'pos' })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /^尺寸已拒絕：加厚厚度 99999 mm/)
  assert.match(g().status, /過大|超過上限/)
  assert.doesNotMatch(g().status, /已更新參數並重建/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.deepEqual(g().features, before)
  await g().editFeature(f.id, { thick: 3, side: 'pos' })
  assert.equal(g().features.find((x) => x.id === f.id)?.thick, 3, g().status)
})

test('timeline chip liveReject mirrors dialog: 0 → null live (onCommit refuse); 99999 → oversize reason', () => {
  const mesh = { vertices: new Float32Array([0, 0, 0, 40, 0, 0, 40, 30, 0, 0, 30, 0, 0, 0, 10, 40, 0, 10, 40, 30, 10, 0, 30, 10]) }
  // Exact predicate Timeline uses for liveReject on thickenface thick
  const liveReject = (n) => (Math.abs(n) > 0 ? thickenOversizeReason(mesh, Math.abs(n)) : null)
  assert.equal(liveReject(0), null, '0 is handled by onCommit Formal refuse, not liveReject')
  const huge = liveReject(99999)
  assert.ok(huge && /過大/.test(huge) && /加厚厚度/.test(huge), huge)
  assert.doesNotMatch(huge, COLLOQ)
  assert.equal(liveReject(2), null)
  // chip onCommit zero message is Formal TC
  const zeroMsg = illegalRejectStatus('加厚厚度不可為 0（輸入負數可翻轉方向）')
  assert.match(zeroMsg, /^尺寸已拒絕：加厚厚度不可為 0/)
  assert.doesNotMatch(zeroMsg, COLLOQ)
})

test('dialog path residual: setThicken 0 + 99999 stay Formal; gate mesh used for timeline', async () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK' }, true)
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  g().toggleThicken()
  await g().thickenFaceAt(TOP)
  const before = { features: structuredClone(g().features), parked: g().bodyMesh?.parked?.length ?? 0 }
  g().setThicken({ thick: 0 })
  assert.match(g().status, /尺寸已拒絕：加厚厚度必須大於 0/)
  await g().commitThicken()
  assert.match(g().status, /加厚厚度必須大於 0/)
  assert.deepEqual(g().features, before.features)
  g().setThicken({ thick: 99999 })
  assert.match(g().status, /尺寸已拒絕：加厚厚度 99999 mm 過大/)
  await g().commitThicken()
  assert.equal(g().thickenMode, true)
  assert.deepEqual(g().features, before.features)
  assert.equal(g().bodyMesh?.parked?.length ?? 0, before.parked)
  // gate mesh helper still available for timeline when bodyMesh present
  const gm = thickenGateMesh(g())
  assert.ok(gm)
  assert.match(thickenOversizeReason(gm, 99999) || '', /過大/)
})
