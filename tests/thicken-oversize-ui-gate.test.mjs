/**
 * FISHING30 P1: real UI path for face thicken. The dialog field writes setThicken({thick}) on every
 * keystroke; OK button / Enter call commitThicken. 99999 on a body TOP face must:
 *   · disable OK (same predicate the dialog uses), show Formal TC 尺寸已拒絕 immediately,
 *   · NOT compute a preview (previously a blue 99999 mm plate rendered, looking like a committed solid),
 *   · refuse commit (no feature, no parked body). 2 mm still previews + commits.
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
const { useApp, thickenOversizeReason } = await import('../src/store.ts')
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')
const g = () => useApp.getState()
const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
const TOP = [20, 10, -15]   // three coords of the box's TOP face (CAD z=10)
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
// exact predicate of the thicken CommandDialog okDisabled (numBad aside)
const okDisabled = (s) => !s.thickenPicks.length || !(s.thickenThick > 0) || !!(s.thickenMode ? thickenOversizeReason(s.bodyMesh, s.thickenThick) : null)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function openOnTop() {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  g().toggleThicken()
  await g().thickenFaceAt(TOP)
  assert.equal(g().thickenPicks.length, 1)
}

test('dialog path: typing 99999 on top face → OK disabled, Formal TC reject, no preview, commit refused', async () => {
  await openOnTop()
  const before = { features: structuredClone(g().features), parked: g().bodyMesh?.parked?.length ?? 0 }
  for (const k of ['9', '99', '999', '9999', '99999']) g().setThicken({ thick: Number(k) })   // live per-keystroke report
  assert.equal(g().thickenThick, 99999)
  assert.equal(okDisabled(g()), true, 'OK must be disabled')
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /^尺寸已拒絕：加厚厚度 99999 mm 過大/)
  await sleep(400)
  assert.equal(g().thickenPreviewMesh, null, 'no giant preview solid')
  assert.equal(g().thickenPreviewBusy, false)
  await g().commitThicken()   // Enter / forced click
  assert.match(g().status, /尺寸已拒絕/)
  assert.equal(g().thickenMode, true)
  assert.deepEqual(g().features, before.features)
  assert.equal(g().bodyMesh?.parked?.length ?? 0, before.parked)
  // negative oversize (flip) keeps the reject status, not the flip note
  g().setThicken({ thick: -99999 })
  assert.match(g().status, /尺寸已拒絕/)
  assert.equal(okDisabled(g()), true)
})

test('dialog path: back to 2 mm → OK enabled, preview, commit creates solid', async () => {
  await openOnTop()
  g().setThicken({ thick: 99999 })
  g().setThicken({ thick: 2 })
  assert.equal(okDisabled(g()), false)
  assert.doesNotMatch(g().status, /尺寸已拒絕/)
  await g().commitThicken()
  assert.equal(g().thickenMode, false, g().status)
  assert.ok(g().features.some((f) => f.type === 'thickenface' && f.thick === 2))
})

test('every entry point gated (dialog OK, alert, preview, timeline edit)', () => {
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /okDisabled=\{!!numBad \|\| !thickenPicks\.length \|\| !\(thickenThick > 0\) \|\| !!thickenOver\}/)
  assert.match(vp, /thickenOversizeReason\(s\.bodyMesh, s\.thickenThick\)/)
  assert.match(vp, /data-testid="thicken-oversize-alert"/)
  const st = rd('src/store.ts')
  assert.match(st, /features\.length > 0 && !thickenOversizeReason\(s\.bodyMesh, s\.thickenThick\)/)
  assert.match(rd('src/components/Timeline.tsx'), /thickenOversizeReason\(useApp\.getState\(\)\.bodyMesh, Math\.abs\(n\)\)/)
})
