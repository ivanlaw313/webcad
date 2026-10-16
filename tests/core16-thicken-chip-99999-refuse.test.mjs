/**
 * CORE16 residual more16: Timeline chip「加厚」thick=99999 → Formal 繁中拒 + red alert.
 * Complements thicken-oversize-refuse / fishing31 / core16-thicken-zero-oversize-gate
 * with chip-focused Formal + red (#b42318) + confirm-disabled wiring pins,
 * and thickenquilt chip liveReject path.
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
const SC = /尺寸已拒绝|加厚厚度必须|过大/

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

test('source: Timeline chip 99999 → live red Formal alert + fe-confirm disabled', () => {
  const tl = rd('src/components/Timeline.tsx')
  const css = rd('src/index.css')
  assert.match(tl, /liveReject=\{\(n\) => \(Math\.abs\(n\) > 0 \? thickenOversizeReason\(thickenGateMesh/)
  assert.match(tl, /data-testid="timeline-illegal-alert"/)
  assert.match(tl, /className="fe-msg-text fe-msg-illegal"/)
  assert.match(tl, /data-testid="fe-confirm" disabled=\{!!liveReject\}/)
  assert.match(tl, /if \(over\) \{ useApp\.setState\(\{ status: illegalRejectStatus\(over\) \}\); return false \}/)
  // thickenquilt chip also gates oversize
  assert.match(tl, /sel\.type === 'thickenquilt' && fd\.key === 'thick' \? \(n\) => thickenOversizeReason/)
  // red Formal colour
  assert.match(css, /\.feat-editor \.fe-msg-illegal \{ color: #b42318/)
})

test('timeline chip: editFeature(thick 99999) Formal 繁中拒; tree + thick unchanged; 2.5 still ok', async () => {
  const f = await boxWithThicken(2)
  const before = structuredClone(g().features)
  await g().editFeature(f.id, { thick: 99999, side: 'pos' })
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /^尺寸已拒絕：加厚厚度 99999 mm/)
  assert.match(g().status, /過大|超過上限/)
  assert.doesNotMatch(g().status, /已更新參數並重建/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.deepEqual(g().features, before)
  assert.equal(g().features.find((x) => x.id === f.id)?.thick, 2)
  await g().editFeature(f.id, { thick: 2.5, side: 'pos' })
  assert.equal(g().features.find((x) => x.id === f.id)?.thick, 2.5, g().status)
})

test('chip liveReject predicate: 99999 → Formal oversize reason; 2 → null; wrap is Formal TC', () => {
  const mesh = {
    vertices: new Float32Array([
      0, 0, 0, 40, 0, 0, 40, 30, 0, 0, 30, 0, 0, 0, 10, 40, 0, 10, 40, 30, 10, 0, 30, 10,
    ]),
  }
  // Exact thickenface thick liveReject from Timeline
  const liveReject = (n) => (Math.abs(n) > 0 ? thickenOversizeReason(mesh, Math.abs(n)) : null)
  assert.equal(liveReject(2), null)
  const huge = liveReject(99999)
  assert.ok(huge && /過大/.test(huge) && /加厚厚度/.test(huge), huge)
  assert.doesNotMatch(huge, COLLOQ)
  assert.doesNotMatch(huge, SC)
  const status = illegalRejectStatus(huge)
  assert.match(status, /^尺寸已拒絕：加厚厚度 99999 mm/)
  assert.equal(isIllegalRejectStatus(status), true)
  // gate mesh helper still available when bodyMesh set
  useApp.setState({ ...useApp.getInitialState(), bodyMesh: mesh }, true)
  const gm = thickenGateMesh(g())
  assert.ok(gm)
  assert.match(thickenOversizeReason(gm, 99999) || '', /過大/)
})
