/**
 * CORE16 residual more7: Sweep (掃掠) sharp-path + twist warning.
 * Auto-fillet sharp corners when twist≠0 → Formal Traditional Chinese warning;
 * status / pill must carry a single ⚠ (not 「⚠ ⚠」).
 * Complements p1-sweep-twist-refuse / fishing31r-warn-dedupe / core16-sweep-illegal-refuse
 * without re-testing Ø/scale gates or silent-strip refuse.
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
const { formatBuildWarnings, formatWarnList, stripWarnMark } = await import('../src/ui/featureStatus.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)

const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /扭转|缩放扫掠|自动圆角|路径.*尖角|以保持可靠几何/
const WARN_BODY = /扭轉／縮放掃掠：路徑 \d+ 個尖角已自動圓角（R[\d.]+）以保持可靠幾何/
const AUTO = /自動圓角（R/

/** Sharp L-path + rect profile + twist → worker auto-fillets corners. */
const SWEEP_SHARP = {
  id: 'sw',
  type: 'sweep',
  r: 5,
  op: 'new',
  path: [[0, 0], [60, 0], [60, 40]],
  profile: { kind: 'rect', a: [-5, -5], b: [5, 5] },
  twist: 90,
}

test('source: worker sharp-twist warn is Formal TC without own ⚠; UI formats single ⚠', () => {
  const w = rd('src/worker/cad.worker.ts')
  const fs = rd('src/ui/featureStatus.ts')
  // Worker pushes Formal TC body (no leading ⚠ — display layer adds one)
  assert.match(w, /扭轉／縮放掃掠：路徑 \$\{fr\.count\} 個尖角已自動圓角（R\$\{rFillet\.toFixed\(2\)\}）以保持可靠幾何/)
  assert.doesNotMatch(w, /buildWarnings\.push\(`⚠ 扭轉/)
  assert.doesNotMatch(w, /buildWarnings\.push\('⚠ 扭轉/)
  // Simplified Chinese must not be the source string
  assert.doesNotMatch(w, /扭转\/缩放扫掠：路径/)
  assert.doesNotMatch(w, /个尖角已自动圆角/)
  // formatBuildWarnings / stripWarnMark wire single-⚠ display
  assert.match(fs, /stripWarnMark/)
  assert.match(fs, /'　⚠ ' \+ parts\.join/)
  assert.match(rd('src/store.ts'), /const warn = formatBuildWarnings\(shownWarns\)/)
})

test('formatWarnList / formatBuildWarnings: Formal TC body → single ⚠ (never double)', () => {
  const body = '扭轉／縮放掃掠：路徑 1 個尖角已自動圓角（R3.00）以保持可靠幾何'
  assert.doesNotMatch(body, COLLOQ)
  assert.doesNotMatch(body, SC)
  assert.match(body, WARN_BODY)

  const one = formatBuildWarnings([body])
  assert.match(one, /^　⚠ /)
  assert.doesNotMatch(one, /⚠\s*⚠/)
  assert.equal((one.match(/⚠/g) || []).length, 1)
  assert.match(one, WARN_BODY)

  // Even if worker/status already prefixed ⚠, strip + re-prefix stays single
  const doubled = formatBuildWarnings(['⚠ ' + body, '⚠ ⚠ ' + body])
  assert.doesNotMatch(doubled, /⚠\s*⚠/)
  assert.equal((doubled.match(/⚠/g) || []).length, 1)
  assert.equal(stripWarnMark('⚠ ⚠ ' + body), body)

  const list = formatWarnList([body, '⚠ ' + body])
  assert.match(list, /^⚠ /)
  assert.doesNotMatch(list, /⚠\s*⚠/)
  assert.equal((list.match(/⚠/g) || []).length, 1)
})

test('runtime: sharp path + twist → Formal TC auto-fillet warn; status has single ⚠', async () => {
  reset()
  assert.equal(await g().applyFeatures([SWEEP_SHARP], '已沿路徑掃掠'), true, g().status)
  assert.match(g().status, AUTO, `status should carry auto-fillet warn: ${g().status}`)
  assert.match(g().status, WARN_BODY)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  // Single ⚠ in the warning segment (formatBuildWarnings prefix)
  const warnSeg = g().status.includes('　⚠ ') ? g().status.slice(g().status.indexOf('　⚠ ')) : g().status
  assert.doesNotMatch(warnSeg, /⚠\s*⚠/)
  assert.ok((warnSeg.match(/⚠/g) || []).length <= 1, `expected ≤1 ⚠ in warn segment: ${warnSeg}`)

  assert.ok(g().lastBuildWarnings.some((w) => WARN_BODY.test(w)), g().lastBuildWarnings)
  for (const w of g().lastBuildWarnings) {
    assert.doesNotMatch(w, COLLOQ)
    assert.doesNotMatch(w, SC)
    // Pill rows are raw (no own ⚠); Viewport strips before display
    if (WARN_BODY.test(w)) assert.doesNotMatch(w, /^⚠/)
  }
})

test('runtime: twist 0 on sharp path → no auto-fillet warn (gate not over-firing)', async () => {
  reset()
  const plain = { ...SWEEP_SHARP, id: 'sw0', twist: 0 }
  assert.equal(await g().applyFeatures([plain], '已沿路徑掃掠'), true, g().status)
  assert.doesNotMatch(g().status, AUTO)
  assert.ok(!g().lastBuildWarnings.some((w) => AUTO.test(w)), g().lastBuildWarnings)
})
