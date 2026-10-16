/**
 * FISHING31
 *  P1 bug 1：時間軸 quick-edit 改加厚厚度 99999 → 必須即時紅色警示、確定停用，commit 路徑（editFeature →
 *            applyFeatures）亦拒絕；冇 bodyMesh（曲面／多體）時參考網格回退組件，唔再只得 100 m 絕對閘。
 *  P1 bug 2：掃掠「扭轉／末端縮放」每鍵草稿唔食字、唔被 store 覆寫。
 *  P2 bug 3：同一組重建警告只顯示一次。
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
const { useApp, thickenOversizeReason, thickenGateMesh, thickenFeaturesOversizeReason, dedupeBuildWarnings } = await import('../src/store.ts')
const { isIllegalRejectStatus } = await import('../src/ui/illegalInput.ts')
const { parseSweepTwistDraft, parseSweepScaleDraft, sweepDraftShown, sweepDraftType, sweepDraftBlur } = await import('../src/cad/sweepTwistFields.ts')
const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 10, op: 'new', cornerOrigin: true }
const TOP = [20, 10, -15]

async function boxWithThicken() {
  useApp.setState({ ...useApp.getInitialState() }, true)
  assert.equal(await g().applyFeatures([BOX], 'box'), true, g().status)
  g().toggleThicken()
  await g().thickenFaceAt(TOP)
  g().setThicken({ thick: 2 })
  await g().commitThicken()
  const f = g().features.find((x) => x.type === 'thickenface')
  assert.ok(f, g().status)
  return f
}

test('quick-edit commit path: editFeature(thick 99999) refused with Formal TC, tree unchanged; 3 mm still rebuilds', async () => {
  const f = await boxWithThicken()
  const before = structuredClone(g().features)
  await g().editFeature(f.id, { thick: 99999, side: 'pos' })   // exactly what Timeline NumField onCommit calls
  assert.ok(isIllegalRejectStatus(g().status), g().status)
  assert.match(g().status, /^尺寸已拒絕：加厚厚度 99999 mm/)
  assert.doesNotMatch(g().status, /已更新參數並重建/)
  assert.deepEqual(g().features, before)
  await g().editFeature(f.id, { thick: 3, side: 'pos' })
  assert.equal(g().features.find((x) => x.id === f.id).thick, 3, g().status)
})

test('rebuild choke point: applyFeatures with an oversize thicken (new or changed) is refused; unchanged thicken passes', async () => {
  const f = await boxWithThicken()
  const before = structuredClone(g().features)
  assert.equal(await g().applyFeatures(before.map((x) => (x.id === f.id ? { ...x, thick: 99999 } : x)), 'x'), false)
  assert.match(g().status, /尺寸已拒絕/)
  assert.deepEqual(g().features, before)
  assert.equal(await g().applyFeatures([...before, { id: 'Q', type: 'thickenquilt', target: 0, thick: 99999 }], 'x'), false)
  assert.equal(thickenFeaturesOversizeReason(before, before, null), null, 'untouched features never block a rebuild')
})

test('gate mesh falls back to component meshes when bodyMesh is null (surface/multibody) — 99999 no longer slips under the 100 m cap', () => {
  const comp = { mesh: { vertices: [0, 0, 0, 40, 30, 10] } }
  assert.equal(thickenOversizeReason(null, 99999), null, 'old behaviour: no mesh → only absolute cap')
  const m = thickenGateMesh({ bodyMesh: null, components: [comp] })
  assert.ok(m)
  assert.match(thickenOversizeReason(m, 99999), /過大/)
})

test('Timeline quick-edit wiring: live red alert while typing, confirm disabled, Enter/blur refuse', () => {
  const tl = rd('src/components/Timeline.tsx')
  assert.match(tl, /liveReject=\{\(n\) => \(Math\.abs\(n\) > 0 \? thickenOversizeReason\(thickenGateMesh/)
  assert.match(tl, /sel\.type === 'thickenquilt' && fd\.key === 'thick' \? \(n\) => thickenOversizeReason/)
  assert.match(tl, /if \(liveReason\) \{ useApp\.setState\(\{ status: illegalRejectStatus\(liveReason\) \}\); return \}/)
  assert.match(tl, /data-testid="fe-confirm" disabled=\{!!liveReject\}/)
  assert.match(tl, /\{liveReject \? \(\s*<div role="alert" data-testid="timeline-illegal-alert"/)
})

test('sweep fields: per-keystroke drafts keep every digit (90, 0.5) even if store/preview re-render in between', () => {
  for (const [parse, keys, want, init] of [[parseSweepTwistDraft, ['9', '90'], 90, 0], [parseSweepScaleDraft, ['0', '0.', '0.5'], 0.5, 1]]) {
    let st = { draft: null }, store = init
    const writes = []
    for (const k of keys) {
      const r = sweepDraftType(k, store, parse); st = r.next
      if (r.write != null) { writes.push(r.write); store = r.write }
      assert.equal(sweepDraftShown(st, store), k, 'shown text is exactly what was typed, never the store echo')
    }
    assert.equal(store, want)
    const b = sweepDraftBlur(st, store, parse)
    assert.equal(b.write, null); assert.equal(sweepDraftShown(b.next, store), String(want))
  }
  // invalid scale keeps text, no store write
  const r = sweepDraftType('0', 1, parseSweepScaleDraft); assert.equal(r.write, null)
  assert.deepEqual(sweepDraftBlur(r.next, 1, parseSweepScaleDraft).next, { draft: '0' })
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /function SweepDraftField\(/, 'module-level component → stable identity, no remount')
  assert.match(vp, /const SweepDraftField = memo\(function SweepDraftField/, 'memo: preview re-renders skip when props unchanged')
  assert.match(vp, /<SweepDraftField key="sweep-twist"/); assert.match(vp, /<SweepDraftField key="sweep-scale"/)
  const comp = vp.slice(vp.indexOf('function SweepDraftField('), vp.indexOf('function LenInput('))
  assert.doesNotMatch(comp, /onFocus=/, 'focus no longer resets/selects the draft')
  assert.match(comp, /flushSync\(\(\) => setDraft/, 'draft commits before store write (no mid-type store echo)')
  assert.match(comp, /sweepDraftType\(/); assert.match(comp, /sweepDraftBlur\(/)
})

test('build warnings dedupe: same set shown once, re-shown on change, reset when clean', () => {
  const W = ['掃掠路徑尖角已自動圓角 R3']
  let r = dedupeBuildWarnings('', W); assert.deepEqual(r.show, W)
  r = dedupeBuildWarnings(r.key, W); assert.deepEqual(r.show, [], 'second identical rebuild → no pill')
  const r2 = dedupeBuildWarnings(r.key, [...W, 'x']); assert.deepEqual(r2.show, ['x'], 'FISHING31-recheck：逐條去重 — 只顯示新警告')
  const r3 = dedupeBuildWarnings(r2.key, []); assert.equal(r3.key, '')
  assert.deepEqual(dedupeBuildWarnings(r3.key, W).show, W)
  assert.match(rd('src/store.ts'), /const shownWarns = nextBuildWarnings\(mesh\.warnings/); assert.match(rd('src/store.ts'), /lastBuildWarnings: shownWarns/)
})
