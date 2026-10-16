/**
 * CORE16 residual more20: Extrude Two Sides side2=0 UI path (FISHING35).
 * Desired Formal:
 *  - focus keeps typed 0 (store via setExtrudeSide2 stays 0, never snap→10)
 *  - LenInput blur must NOT rewrite 「0」→ prior 10
 *  - red 「第二側距離不可為 0」 (#b42318) + OK disabled while draft/store is 0
 * Complements core16-extrude-side2-zero-refuse (setter/commit Formal) with the
 * Viewport draft/blur/okDisabled contract. Tests only — report A until tip fixed.
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
const { useApp } = await import('../src/store.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /第二侧距离|不可为 0/

test('source: FISHING35 side2 UI — draft txt + LenInput onText + blur keep-parsed + red + okDisabled', () => {
  const vp = rd('src/components/Viewport.tsx')
  const st = rd('src/store.ts')

  // Desired: local draft so blur/ok/red follow typed 「0」 even before store settles.
  assert.match(
    vp,
    /extrudeSide2Txt|setExtrudeSide2Txt/,
    'A: Viewport missing extrudeSide2Txt draft — FISHING35 side2=0 blur/ok path',
  )
  assert.match(
    vp,
    /onText=\{setExtrudeSide2Txt\}/,
    'A: side2 LenInput must wire onText={setExtrudeSide2Txt}',
  )
  assert.match(vp, /data-testid="extrude-side2-field"|data-testid="extrude-side2-zero-alert"/)

  // Red Formal alert for side2=0
  assert.match(vp, /data-testid="extrude-side2-zero-alert"/)
  assert.match(vp, /第二側距離不可為 0/)
  assert.match(vp, /color: '#b42318'[\s\S]{0,120}?extrude-side2-zero-alert|extrude-side2-zero-alert[\s\S]{0,120}?color: '#b42318'/)
  assert.doesNotMatch(vp, /第二侧距离不可为/)

  // okDisabled must consult side2 zero (draft or store) — not silently allow OK at 0
  assert.match(
    vp,
    /okDisabled=\{[\s\S]*?twosides[\s\S]*?(extrudeSide2Txt|extrudeSide2)[\s\S]*?\}/,
    'A: okDisabled must gate twosides side2=0 (draft or store)',
  )

  // LenInput blur: keep parsed value (incl. 0), do not snap back to prior mm when parsed ok
  const blur = vp.match(/onBlur=\{\(\) => \{[\s\S]*?fld\.flush\(\)[\s\S]*?setFoc\(false\)[\s\S]*?\}\}/)
  assert.ok(blur, 'LenInput onBlur block')
  assert.match(
    blur[0],
    /parsed != null \? parsed : mm|keep = parsed/,
    'A: LenInput blur must keep typed parsed (incl. 0), not snap to prior mm→10',
  )

  // Setter must not coerce 0 → 10
  assert.doesNotMatch(
    st,
    /setExtrudeSide2:\s*\(n\)\s*=>\s*set\(\{\s*extrudeSide2:\s*Number\.isFinite\(n\)\s*&&\s*Math\.abs\(n\)\s*>\s*1e-6\s*\?\s*Math\.abs\(n\)\s*:\s*10\s*\}\)/,
  )
})

test('runtime: setExtrudeSide2(0) keeps 0 — focus path never becomes 10', () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  g().setExtrudeSide2(10)
  assert.equal(g().extrudeSide2, 10)
  g().setExtrudeSide2(0)
  assert.equal(
    g().extrudeSide2,
    0,
    `A: setExtrudeSide2(0) must keep 0 (focus Formal); got ${g().extrudeSide2} (must NOT be 10)`,
  )
  assert.notEqual(g().extrudeSide2, 10)
})

test('runtime: twosides side2=0 → Formal refuse; alert string TC; no coerce-after', async () => {
  useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
  g().startSketch()
  g().chooseSketchPlane('XY')
  useApp.setState({
    sketchShape: { type: 'rect', a: [-10, -10], b: [10, 10] },
    sketchProfiles: [],
    skCons: [],
    sketchOp: 'new',
    extrudeDlgOpen: true,
    extrudeExtent: 'twosides',
    extrudeHeight: 10,
    extrudeSide2: 0,
  })
  assert.equal(g().extrudeSide2, 0, 'pre-commit store stays 0')
  const n0 = g().features.length
  await g().extrudeSketch()
  assert.match(g().status, /第二側|非零/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(g().features.length, n0)
  // After refuse, typed/store side2 must still not have been snapped to 10
  assert.notEqual(g().extrudeSide2, 10, `A: refuse path must not snap side2→10; got ${g().extrudeSide2}`)
})

test('source: side2 zero alert TC Formal (no colloquial / SC)', () => {
  const vp = rd('src/components/Viewport.tsx')
  const m = vp.match(/第二側距離不可為 0[^'"]*/)
  assert.ok(m, 'side2 zero alert copy present')
  assert.doesNotMatch(m[0], COLLOQ)
  assert.doesNotMatch(m[0], SC)
})
