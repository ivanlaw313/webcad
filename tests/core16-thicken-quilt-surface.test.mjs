/**
 * CORE16 residual more10: Thicken quilt / surface (加厚整張曲面) path.
 * Product API exists: startQuiltPick / thickenParkedAt / type thickenquilt.
 * Zero thickness → Formal 繁中拒; legal thick applies; oversize refuse.
 * Complements core16-thicken-zero-oversize-gate (face thicken) — quilt/surface only.
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
const { useApp, thickenOversizeReason, thickenFeaturesOversizeReason } = await import('../src/store.ts')
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
// CAD near on box top face centre (corner-origin 40×30×10 → Z=10 top)
const TOP_CAD = [20, 15, 10]
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

async function seedOffsetSurf() {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  const feats = [
    BOX,
    { id: 'OS', type: 'offsetsurf', near: TOP_CAD, dist: 2 },
  ]
  assert.equal(await g().applyFeatures(feats, 'box+offsetsurf'), true, g().status)
  const parked = g().bodyMesh?.parked ?? []
  assert.ok(parked.length >= 1, `need parked offset surface; status=${g().status}; parked=${parked.length}`)
  return parked
}

test('source: quilt thicken API + Formal zero / oversize gates exist (no invent)', () => {
  const st = rd('src/store.ts')
  const tl = rd('src/components/Timeline.tsx')
  const bt = rd('src/components/BrowserTree.tsx')
  assert.match(st, /startQuiltPick:\s*\(\)\s*=>/)
  assert.match(st, /thickenParkedAt:\s*async\s*\(target\)/)
  assert.match(st, /type: 'thickenquilt'/)
  // Formal zero refuse (CORE16 #1 — no silent 0.05)
  assert.match(st, /加厚曲面：厚度必須為非零數值（負值＝朝反側）/)
  assert.match(st, /if \(!Number\.isFinite\(raw\) \|\| raw === 0\)/)
  assert.match(st, /thickenOversizeReason\(get\(\)\.bodyMesh, thick\)/)
  // Timeline / browser labels Formal TC
  assert.match(tl, /thickenquilt: \{ icon: 'thicken', label: '加厚整張曲面'/)
  assert.match(bt, /thickenquilt: \{ icon: 'shell', label: '加厚整張曲面'/)
  assert.doesNotMatch('加厚曲面：厚度必須為非零數值（負值＝朝反側）', COLLOQ)
})

test('runtime: thickenParkedAt thick 0 → Formal refuse; no thickenquilt feature', async () => {
  await seedOffsetSurf()
  const before = structuredClone(g().features)
  useApp.setState({
    quiltPickMode: true,
    appPrompt: async () => '0',
  })
  await g().thickenParkedAt(0)
  assert.match(g().status, /加厚曲面：厚度必須為非零數值/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().quiltPickMode, false, 'mode cleared after refuse')
  assert.equal(g().features.some((f) => f.type === 'thickenquilt'), false)
  assert.deepEqual(g().features, before)
})

test('runtime: thickenParkedAt blank/cancel → cancel status; tree unchanged', async () => {
  await seedOffsetSurf()
  const before = structuredClone(g().features)
  useApp.setState({
    quiltPickMode: true,
    appPrompt: async () => null,
  })
  await g().thickenParkedAt(0)
  assert.match(g().status, /已取消加厚曲面/)
  assert.equal(g().quiltPickMode, false)
  assert.deepEqual(g().features, before)
})

test('runtime: thickenParkedAt legal 2 mm → thickenquilt feature applied', async () => {
  await seedOffsetSurf()
  useApp.setState({
    quiltPickMode: true,
    appPrompt: async () => '2',
  })
  await g().thickenParkedAt(0)
  const f = g().features.find((x) => x.type === 'thickenquilt')
  assert.ok(f, `expected thickenquilt; status=${g().status}`)
  assert.equal(f.thick, 2)
  assert.equal(f.target, 0)
  assert.match(g().status, /加厚曲面/)
  assert.doesNotMatch(g().status, /失敗|失败/)
  assert.equal(g().quiltPickMode, false)
})

test('runtime: thickenParkedAt 99999 → Formal oversize refuse; no feature', async () => {
  await seedOffsetSurf()
  const before = structuredClone(g().features)
  useApp.setState({
    quiltPickMode: true,
    appPrompt: async () => '99999',
  })
  await g().thickenParkedAt(0)
  assert.ok(isIllegalRejectStatus(g().status) || /過大|超過上限/.test(g().status), g().status)
  assert.match(g().status, /過大|超過上限|加厚厚度/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().features.some((f) => f.type === 'thickenquilt'), false)
  assert.deepEqual(g().features, before)
})

test('rebuild choke: applyFeatures thickenquilt thick 99999 refused via thickenFeaturesOversizeReason', async () => {
  await seedOffsetSurf()
  const before = structuredClone(g().features)
  assert.equal(
    await g().applyFeatures([...before, { id: 'Q', type: 'thickenquilt', target: 0, thick: 99999 }], 'x'),
    false,
  )
  assert.match(g().status, /尺寸已拒絕|過大/)
  assert.deepEqual(g().features, before)
  // Helper itself flags quilt oversize
  const reason = thickenFeaturesOversizeReason(before, [...before, { id: 'Q', type: 'thickenquilt', target: 0, thick: 99999 }], g().bodyMesh)
  assert.ok(reason && /過大|超過上限|加厚/.test(reason), reason)
  assert.equal(thickenOversizeReason(g().bodyMesh, 2), null)
})
