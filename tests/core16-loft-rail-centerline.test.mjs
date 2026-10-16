/**
 * CORE16 residual more11: Loft rail path (API exists).
 * bankLoftRail / setLoftRailFromSketch / rails → preview shifts sections; wrong
 * point-count → Formal ⚠ ignore. Loft-specific "centerline" API: SKIP (none).
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
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const W = globalThis.__wheelWorker
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

async function bodyVolume() {
  const buf = await W.exportSTEP()
  if (!buf) return 0
  const shape = await importSTEP(new Blob([buf]))
  try { return measureVolume(shape) } finally { shape.delete() }
}

function bank(plane, z, shape) {
  g().sketchOnDatumPlane(plane, z)
  useApp.setState({ sketchShape: shape, sketchProfiles: [], skCons: [] })
  g().addLoftSection()
}

async function preview() {
  g().scheduleLoftPreview()
  for (let i = 0; i < 1000 && (g().loftPreviewBusy || !g().loftPreview); i++) {
    await new Promise((r) => setTimeout(r, 30))
  }
  return g().loftPreview
}

/** Detect loft rail API surface (store + worker Feature.rails). */
function loftRailApiPresent() {
  const st = rd('src/store.ts')
  const w = rd('src/worker/cad.worker.ts')
  return (
    typeof g().bankLoftRail === 'function' &&
    typeof g().setLoftRailFromSketch === 'function' &&
    typeof g().clearLoftRail === 'function' &&
    /loftRail:/.test(st) &&
    /rails\?:/.test(w)
  )
}

/** Loft-specific centerline spine API (distinct from sketch centerline semantic). */
function loftCenterlineApiPresent() {
  const st = rd('src/store.ts')
  const w = rd('src/worker/cad.worker.ts')
  const lb = rd('src/cad/loftBuild.ts')
  // Sketch centerline / revolve axis is NOT loft centerline — look for loft-scoped names.
  const loftScoped =
    /loftCenterline|setLoftCenterline|centerlineSpine|loftSpine/.test(st + w + lb) ||
    /type: 'loft'[\s\S]{0,400}centerline/.test(w)
  return loftScoped
}

test('API probe: loft rail present; loft centerline SKIP reason if absent', () => {
  assert.equal(loftRailApiPresent(), true, 'loft rail API must exist on this tip')
  if (!loftCenterlineApiPresent()) {
    // Documented SKIP — not a failure: product has rails, not a separate loft centerline path.
    assert.ok(true, 'SKIP loft centerline: no loftCenterline/setLoftCenterline/loftSpine API (sketch centerline ≠ loft rail)')
  }
})

test('source: loft rail Formal TC strings (bank / mismatch warn / ignore)', () => {
  assert.equal(loftRailApiPresent(), true, 'loft rail API required for this tip')
  const st = rd('src/store.ts')
  const w = rd('src/worker/cad.worker.ts')
  assert.match(st, /放樣導軌：先用「折線」畫一條導軌/)
  assert.match(st, /放樣導軌：導軌要在 XY（水平）草圖上畫/)
  assert.match(w, /放樣導軌：導軌要每個截面一點/)
  assert.match(w, /導軌已忽略/)
  assert.doesNotMatch(w, /导轨要每个截面一点/)
  assert.doesNotMatch(st, /放样导轨：先用/)
})

test('runtime: SKIP loft centerline path — no dedicated API', { skip: loftCenterlineApiPresent() ? false : 'no loft centerline/spine API (rails cover guide path; sketch centerline is revolve/mirror semantic only)' }, () => {
  // If a future tip adds loft centerline, this block becomes active.
  assert.ok(typeof g().setLoftCenterline === 'function' || typeof g().loftCenterline !== 'undefined')
})

test('runtime: setLoftRailFromSketch shifts top section; Formal 導軌 warning', async () => {
  if (!loftRailApiPresent()) {
    assert.fail('loft rail API missing — should have SKIPPED earlier')
  }
  reset()
  bank('XY', 0, { type: 'rect', a: [-20, -20], b: [20, 20] })
  bank('XY', 50, { type: 'circle', c: [0, 0], r: 15 })
  // XY open polyline: bottom touches rect at x=20; top at x=40 → circle shifts +X
  useApp.setState({
    sketchSources: {
      ...g().sketchSources,
      skRail: {
        name: '導軌',
        plane: 'XY',
        baseZ: 0,
        shapes: [{ type: 'poly', open: true, pts: [[20, 0], [40, 0]] }],
        cons: [],
      },
    },
  })
  g().setLoftRailFromSketch('skRail')
  assert.equal(g().loftRail?.length, 2, g().status)
  assert.doesNotMatch(g().status, COLLOQ)
  g().openLoftDlg()
  assert.equal(g().loftDlgOpen, true, g().status)
  const pv = await preview()
  assert.ok(pv?.mesh && !pv.error, pv?.error)
  const maxX = Math.max(...pv.edges.flat().map((p) => p[0]))
  assert.ok(Math.abs(maxX - 40) < 1.5, `rail must push top to ~x=40 (got maxX=${maxX})`)
  assert.ok(pv.warnings.some((w) => /導軌/.test(w)), `expected 導軌 warn, got: ${pv.warnings.join(';')}`)
  assert.doesNotMatch(pv.warnings.join(';'), COLLOQ)
})

test('runtime: rail point-count ≠ sections → Formal ignore warn; still loftable', async () => {
  if (!loftRailApiPresent()) return
  reset()
  bank('XY', 0, { type: 'circle', c: [0, 0], r: 12 })
  bank('XY', 40, { type: 'circle', c: [0, 0], r: 10 })
  // 3 points for 2 sections → mismatch
  const f = {
    id: 'Lbad',
    type: 'loft',
    op: 'new',
    sections: [
      { profile: { kind: 'circle', c: [0, 0], r: 12 }, z: 0, plane: 'XY' },
      { profile: { kind: 'circle', c: [0, 0], r: 10 }, z: 40, plane: 'XY' },
    ],
    rails: [[[0, 0], [20, 0], [40, 0]]],
  }
  const r = await W.previewLoft(f)
  assert.ok(r.mesh && !r.error, `mismatch rail must still loft (rail ignored): ${r.error}`)
  const warns = (r.warnings || []).join(';')
  assert.match(warns, /導軌要每個截面一點|導軌已忽略/)
  assert.doesNotMatch(warns, /导轨已忽略|每个截面一点/)
  assert.doesNotMatch(warns, COLLOQ)
})

test('runtime: legal rail loft commits with rails on feature + solid volume', async () => {
  if (!loftRailApiPresent()) return
  reset()
  bank('XY', 0, { type: 'circle', c: [0, 0], r: 12 })
  bank('XY', 40, { type: 'circle', c: [0, 0], r: 10 })
  useApp.setState({
    sketchSources: {
      ...g().sketchSources,
      skRail: {
        name: '導軌',
        plane: 'XY',
        baseZ: 0,
        shapes: [{ type: 'poly', open: true, pts: [[12, 0], [30, 0]] }],
        cons: [],
      },
    },
  })
  g().setLoftRailFromSketch('skRail')
  g().openLoftDlg()
  const pv = await preview()
  assert.ok(pv?.mesh && !pv.error, pv?.error)
  await g().commitLoft()
  const loft = g().features.find((f) => f.type === 'loft')
  assert.ok(loft, g().status)
  assert.ok(loft.rails?.[0]?.length === 2, `committed rails: ${JSON.stringify(loft.rails)}`)
  assert.match(g().status, /導軌|已放樣|放樣/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.ok((await bodyVolume()) > 3000)
})

test('runtime: bankLoftRail refuse Formal when no polyline / wrong plane', () => {
  if (!loftRailApiPresent()) return
  reset()
  g().bankLoftRail()
  assert.match(g().status, /放樣導軌：先用「折線」/)
  assert.doesNotMatch(g().status, COLLOQ)
  // Wrong plane
  g().sketchOnDatumPlane('XZ', 0)
  useApp.setState({ sketchShape: { type: 'poly', open: true, pts: [[0, 0], [10, 0]] }, sketchProfiles: [], skCons: [] })
  g().bankLoftRail()
  assert.match(g().status, /導軌要在 XY/)
  assert.doesNotMatch(g().status, COLLOQ)
})
