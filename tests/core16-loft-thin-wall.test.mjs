/**
 * CORE16 residual: loft thin-wall — on failure fall back to solid OR clear
 * Formal refuse; must not hang; must not show double ⚠.
 * Complements ux4-loft / loft-dialog-store (*loft*thin* filename gap from fishing33 prep).
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
const { formatWarnList, stripWarnMark } = await import('../src/ui/featureStatus.ts')

const g = () => useApp.getState()
const W = globalThis.__wheelWorker
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), appConfirm: async () => true }, true)

async function bodyVolume() {
  const { importSTEP, measureVolume } = await import('replicad')
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

const FAIL_WALL = /放樣薄壁 .+ 失敗，已退回實心放樣（請減小薄壁厚度或簡化截面）/

test('thin-wall 2mm: hollow preview+commit, no hang, no failure warning', async () => {
  reset()
  bank('XY', 0, { type: 'rect', a: [-20, -20], b: [20, 20] })
  bank('XY', 60, { type: 'circle', c: [0, 0], r: 15 })
  g().openLoftDlg()
  const solid = (await preview()).volume
  g().setLoftOpt({ loftWall: 2 })
  const t0 = Date.now()
  const thin = await preview()
  assert.ok(thin?.mesh && thin.volume < solid * 0.6 && thin.volume > 500, `thin ${thin?.volume} vs solid ${solid}`)
  assert.ok(!thin.warnings.some((w) => /失敗|退回/.test(w)), thin.warnings.join(';'))
  await g().commitLoft()
  const dt = Date.now() - t0
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 1, g().status)
  const v = await bodyVolume()
  assert.ok(Math.abs(v - thin.volume) < 1e-3 * thin.volume, `commit ${v} ≈ preview ${thin.volume}`)
  assert.ok(dt < 40000, `preview+commit took ${dt} ms (must not hang)`)
  assert.doesNotMatch(g().status, /⚠\s*⚠/)
})

test('absurd wall → solid fallback Formal TC, bounded time, single ⚠', async () => {
  reset()
  // Square half-width 20; wall 50 cannot inset → shell + inset path fail → honest solid fallback
  bank('XY', 0, { type: 'rect', a: [-20, -20], b: [20, 20] })
  bank('XY', 60, { type: 'circle', c: [0, 0], r: 15 })
  g().openLoftDlg()
  const solidVol = (await preview()).volume
  g().setLoftOpt({ loftWall: 50 })
  const t0 = Date.now()
  const pv = await preview()
  const dtPrev = Date.now() - t0
  assert.ok(pv?.mesh && !pv.error, `preview must not hang/error: ${pv?.error}`)
  assert.ok(dtPrev < 40000, `preview took ${dtPrev} ms`)
  assert.ok(pv.warnings.some((w) => FAIL_WALL.test(w)), `expected solid-fallback warning, got: ${pv.warnings.join(';')}`)
  assert.ok(Math.abs(pv.volume - solidVol) / solidVol < 0.05, `fallback volume ≈ solid ${pv.volume} vs ${solidVol}`)

  // Display layer: one ⚠ only (worker text has no own ⚠ → formatWarnList adds one)
  const shown = formatWarnList(pv.warnings)
  assert.match(shown, /^⚠ /)
  assert.doesNotMatch(shown, /⚠\s*⚠/)
  assert.match(shown, /請減小薄壁厚度或簡化截面/)
  assert.doesNotMatch(shown, /試減薄壁厚/) // Formal TC, not colloquial

  const t1 = Date.now()
  await g().commitLoft()
  const dtCommit = Date.now() - t1
  assert.ok(dtCommit < 40000, `commit took ${dtCommit} ms`)
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 1, g().status)
  const loft = g().features.find((f) => f.type === 'loft')
  assert.equal(loft.wall, 50, 'wall param kept; geometry fell back to solid')
  const v = await bodyVolume()
  assert.ok(Math.abs(v - solidVol) / solidVol < 0.05, `committed solid fallback ${v}`)
  assert.doesNotMatch(g().status, /⚠\s*⚠/)
  // Status / lastBuildWarnings carry Formal TC fallback (single mark after format)
  const warns = g().lastBuildWarnings || []
  if (warns.length) {
    assert.ok(warns.some((w) => FAIL_WALL.test(stripWarnMark(w))), warns.join(';'))
    assert.doesNotMatch(formatWarnList(warns), /⚠\s*⚠/)
  }
})

test('worker loft thin-wall warning is Formal TC without leading ⚠', () => {
  const w = rd('src/worker/cad.worker.ts')
  const loft = w.slice(w.indexOf('function makeLoftSolid('), w.indexOf('function lastExtrudeHeight('))
  assert.match(loft, /放樣薄壁 \$\{f\.wall\}mm 失敗，已退回實心放樣（請減小薄壁厚度或簡化截面）/)
  assert.doesNotMatch(loft, /warnings\.push\([`']⚠/)
  assert.doesNotMatch(loft, /試減薄壁厚或簡化截面/)
  assert.doesNotMatch(loft, /退回实心|请减小/) // no SC
})
