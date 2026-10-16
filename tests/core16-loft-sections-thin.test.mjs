/**
 * CORE16 residual more6: Loft (放樣) — <2 sections refuse; thin-wall failure → solid
 * fallback / single ⚠. Follows loft-thin / core16-loft-thin-wall spirit without duplicating
 * the rect→circle absurd-wall50 suite (uses two-circle geometry + open/commit gates).
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
const { LOFT_MSG } = await import('../src/cad/loftBuild.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const W = globalThis.__wheelWorker
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const FAIL_WALL = /放樣薄壁 .+ 失敗，已退回實心放樣（請減小薄壁厚度或簡化截面）/

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

test('source + LOFT_MSG: <2 sections refuse Formal TC; thin-wall fallback Formal', () => {
  const st = rd('src/store.ts')
  const w = rd('src/worker/cad.worker.ts')
  assert.match(st, /放樣需要≥2個截面/)
  assert.match(st, /放樣至少需要 2 個截面/)
  assert.match(st, /if \(secs\.length < 2\) return null/)
  assert.equal(LOFT_MSG.tooFew, '放樣失敗：至少要 2 個截面（或 1 個截面加封口點）')
  assert.doesNotMatch(LOFT_MSG.tooFew, /至少要 2 个截面|放样失败/)
  assert.doesNotMatch(LOFT_MSG.tooFew, COLLOQ)
  // Scope to loft thin-wall block — whole-file SC scan is noisy (other features).
  const loft = w.slice(w.indexOf('function makeLoftSolid('), w.indexOf('function lastExtrudeHeight('))
  assert.match(loft, /放樣薄壁 \$\{f\.wall\}mm 失敗，已退回實心放樣（請減小薄壁厚度或簡化截面）/)
  assert.doesNotMatch(loft, /試減薄壁厚或簡化截面/)
  assert.doesNotMatch(loft, /退回实心|请减小/)
  assert.doesNotMatch(loft, /warnings\.push\([`']⚠/)
})

test('runtime: openLoftDlg with 0 sections → Formal refuse; dlg stays closed', () => {
  reset()
  assert.equal(g().loftSections.length, 0)
  g().openLoftDlg()
  assert.equal(g().loftDlgOpen, false)
  assert.match(g().status, /放樣需要≥2個截面|≥2/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, /放样需要|至少要两个/)
})

test('runtime: openLoftDlg / commitLoft with 1 section → Formal refuse; no loft feature', async () => {
  reset()
  bank('XY', 0, { type: 'circle', c: [0, 0], r: 12 })
  assert.equal(g().loftSections.length, 1)
  g().openLoftDlg()
  assert.equal(g().loftDlgOpen, false, g().status)
  assert.match(g().status, /放樣需要≥2個截面|≥2/)

  await g().commitLoft()
  assert.match(g().status, /放樣至少需要 2 個截面|至少需要 2/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 0)
  assert.equal(g().loftSections.length, 1, 'single section kept for user to add more')
})

test('runtime: worker LOFT_MSG.tooFew when wires < 2 (no cap)', async () => {
  const f = {
    id: 'bad',
    type: 'loft',
    op: 'new',
    sections: [{ profile: { kind: 'circle', c: [0, 0], r: 10 }, z: 0, plane: 'XY' }],
  }
  const r = await W.previewLoft(f)
  assert.equal(r.mesh, null)
  assert.match(r.error || '', /至少要 2 個截面|放樣失敗/)
  assert.doesNotMatch(r.error || '', /至少要 2 个截面/)
  assert.doesNotMatch(r.error || '', COLLOQ)
})

test('runtime: two-circle absurd thin-wall → solid fallback Formal TC, single ⚠', async () => {
  reset()
  // Different geometry from core16-loft-thin-wall (rect→circle): two small circles, wall 40 cannot inset.
  bank('XY', 0, { type: 'circle', c: [0, 0], r: 10 })
  bank('XY', 50, { type: 'circle', c: [0, 0], r: 8 })
  g().openLoftDlg()
  assert.equal(g().loftDlgOpen, true, g().status)
  const solidVol = (await preview()).volume
  assert.ok(solidVol > 1000, `solid preview ${solidVol}`)
  g().setLoftOpt({ loftWall: 40 })
  const t0 = Date.now()
  const pv = await preview()
  const dt = Date.now() - t0
  assert.ok(pv?.mesh && !pv.error, `preview must not hang/error: ${pv?.error}`)
  assert.ok(dt < 40000, `preview took ${dt} ms`)
  assert.ok(pv.warnings.some((w) => FAIL_WALL.test(w)), `expected solid-fallback warning, got: ${pv.warnings.join(';')}`)
  assert.ok(Math.abs(pv.volume - solidVol) / solidVol < 0.08, `fallback ≈ solid ${pv.volume} vs ${solidVol}`)

  const shown = formatWarnList(pv.warnings)
  assert.match(shown, /^⚠ /)
  assert.doesNotMatch(shown, /⚠\s*⚠/)
  assert.match(shown, /請減小薄壁厚度或簡化截面/)
  assert.doesNotMatch(shown, /試減薄壁厚/)
  assert.doesNotMatch(shown, COLLOQ)

  await g().commitLoft()
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 1, g().status)
  const loft = g().features.find((f) => f.type === 'loft')
  assert.equal(loft.wall, 40, 'wall param kept; geometry fell back to solid')
  const v = await bodyVolume()
  assert.ok(Math.abs(v - solidVol) / solidVol < 0.08, `committed solid fallback ${v}`)
  assert.doesNotMatch(g().status, /⚠\s*⚠/)
  const warns = g().lastBuildWarnings || []
  if (warns.length) {
    assert.ok(warns.some((w) => FAIL_WALL.test(stripWarnMark(w))), warns.join(';'))
    assert.doesNotMatch(formatWarnList(warns), /⚠\s*⚠/)
  }
})

test('runtime: legal 2-section loft (no thin) commits without fallback warning', async () => {
  reset()
  bank('XY', 0, { type: 'circle', c: [0, 0], r: 12 })
  bank('XY', 40, { type: 'circle', c: [0, 0], r: 10 })
  g().openLoftDlg()
  g().setLoftOpt({ loftWall: 0 })
  const pv = await preview()
  assert.ok(pv?.mesh && !pv.error, pv?.error)
  assert.ok(!pv.warnings.some((w) => /失敗|退回/.test(w)), pv.warnings.join(';'))
  await g().commitLoft()
  assert.equal(g().features.filter((f) => f.type === 'loft').length, 1, g().status)
  assert.ok((await bodyVolume()) > 5000)
})
