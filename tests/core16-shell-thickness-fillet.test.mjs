/**
 * CORE16 residual: Shell (抽殼) thickness 0 → Formal 繁中拒;
 * when fillets/rounds present → clear PASS or known refuse wording (no ambiguous hang).
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
const w = globalThis.__wheelWorker
await w.ready()
const { useApp, shellFailReason } = await import('../src/store.ts')
const {
  ILLEGAL_THICKNESS_DETAIL,
  illegalRejectStatus,
  isIllegalRejectStatus,
} = await import('../src/ui/illegalInput.ts')
const { importSTEP, measureVolume } = await import('replicad')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const vol = async () => measureVolume(await importSTEP(new Blob([await w.exportSTEP()])))

const BOX = { id: 'B', type: 'prim', shape: 'box', a: 40, b: 30, c: 20, op: 'new', cornerOrigin: true }
const FILLET = { id: 'F', type: 'fillet', radius: 2, edges: 'all' }
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /抽壳失败|已倒圆角|建议先抽壳/
/** Clear outcome markers: Formal refuse OR success (incl. cavity soft fallback). */
const KNOWN_SHELL_AFTER_ROUND =
  /已抽殼|Shelled|抽殼完成|抽殼失敗：已倒圓角／倒角的實體抽殼不穩定|抽殼失敗——已倒圓角\/倒角的實體抽殼不穩定|建議先抽殼後再?倒角|建議順序「先抽殼|抽殼失敗——OCCT 對已倒角/

test('illegalInput + shellFailReason: thickness 0 is Formal 繁中拒', () => {
  assert.equal(ILLEGAL_THICKNESS_DETAIL, '壁厚必須大於 0')
  assert.equal(illegalRejectStatus(ILLEGAL_THICKNESS_DETAIL), '尺寸已拒絕：壁厚必須大於 0')
  assert.equal(isIllegalRejectStatus(illegalRejectStatus(ILLEGAL_THICKNESS_DETAIL)), true)
  assert.match(shellFailReason(null, 0), /抽殼失敗：壁厚必須大於 0/)
  assert.doesNotMatch(shellFailReason(null, 0), SC)
  assert.doesNotMatch(shellFailReason(null, 0), COLLOQ)
})

test('source: setShellThickness / commitShell / applyFeatures pin Formal refuse', () => {
  const st = rd('src/store.ts')
  // Implementation pins (not the early type-decl mention of setShellThickness)
  assert.match(st, /isNonPositiveDim\(v\) \? \{ status: illegalRejectStatus\(ILLEGAL_THICKNESS_DETAIL\)/)
  assert.match(st, /if \(!\(th > 0\)\) \{ set\(\{ status: illegalRejectStatus\(ILLEGAL_THICKNESS_DETAIL\) \}\); return \}/)
  // Specific round+shell fail wording (rebuild path + commitShell failMsg)
  assert.match(st, /已倒圓角／倒角的實體抽殼不穩定，建議先抽殼後再倒角/)
  assert.match(st, /已倒圓角\/倒角的實體抽殼不穩定，建議先抽殼後倒角/)
  assert.doesNotMatch(st, /已倒圆角\/倒角的实体抽壳不稳定/)
})

test('runtime: setShellThickness(0) → Formal 繁中拒; commitShell does not add feature', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  g().toggleShell()
  assert.equal(g().shellMode, true)
  assert.equal(g().shellThickness, 2, 'entering shell arms default thickness 2')
  // three-world pick of CAD top face center (20,15,20) → [20, 20, -15]
  g().shellPickAt([20, 20, -15])
  assert.ok(g().shellPicks.length >= 1, 'opening face picked')
  g().setShellThickness(0)
  assert.equal(g().shellThickness, 0)
  assert.match(g().status, /尺寸已拒絕：壁厚必須大於 0/)
  assert.doesNotMatch(g().status, SC)
  const n0 = g().features.length
  await g().commitShell()
  assert.equal(g().features.length, n0, 'thickness 0 never commits')
  assert.match(g().status, /尺寸已拒絕：壁厚必須大於 0/)
  assert.equal(g().shellMode, true)
})

test('runtime: applyFeatures shell thickness 0 → refuse or no silent shell', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX], 'seed'), true, g().status)
  const v0 = await vol()
  const ok = await g().applyFeatures(
    [BOX, { id: 'S0', type: 'shell', thickness: 0, nears: [[20, 15, 20]] }],
    'x',
    true,
  )
  if (ok) {
    const v1 = await vol()
    assert.ok(Math.abs(v1 - v0) < 1, `thickness 0 must not change volume silently: ${v0} → ${v1}`)
  } else {
    assert.match(g().status, /壁厚必須大於 0|抽殼失敗|尺寸已拒絕/)
  }
})

test('runtime: shell after fillet → PASS or known Formal refuse (no ambiguous hang)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX, FILLET], 'box+fillet'), true, g().status)
  assert.ok(g().features.some((f) => f.type === 'fillet'))
  const vFillet = await vol()
  assert.ok(vFillet > 0 && vFillet < 40 * 30 * 20, `filleted volume ${vFillet}`)

  const shell = {
    id: 'S',
    type: 'shell',
    thickness: 2,
    nears: [[20, 15, 20]],
    tangentChain: true,
    direction: 'inside',
  }
  const t0 = Date.now()
  const ok = await g().applyFeatures([BOX, FILLET, shell], 'shell after fillet', true)
  const elapsed = Date.now() - t0
  assert.ok(elapsed < 120_000, `must not hang (>120s): ${elapsed}ms`)

  const st = g().status || ''
  if (ok) {
    // Clear PASS: volume hollowed; soft cavity toast「抽殼完成（備用：…）」is an accepted known outcome
    assert.match(st, KNOWN_SHELL_AFTER_ROUND, `PASS/soft status Formal: ${st}`)
    assert.doesNotMatch(st, COLLOQ)
    assert.doesNotMatch(st, SC)
    assert.doesNotMatch(st, /^⚠ 重建失败/)
    const vShell = await vol()
    assert.ok(vShell < vFillet - 50, `successful shell must hollow: ${vFillet} → ${vShell}`)
    assert.ok(g().features.some((f) => f.type === 'shell'), 'shell feature kept on PASS')
  } else {
    assert.match(st, KNOWN_SHELL_AFTER_ROUND, `known refuse wording, got: ${st}`)
    assert.doesNotMatch(st, /^⚠ 重建失败[^-]/)
    assert.doesNotMatch(st, COLLOQ)
    assert.doesNotMatch(st, SC)
    assert.equal(g().features.filter((f) => f.type === 'shell').length, 0)
  }
})

test('runtime: commitShell after fillet uses known failMsg (clear PASS or Formal refuse)', async () => {
  reset()
  assert.equal(await g().applyFeatures([BOX, FILLET], 'seed'), true, g().status)
  g().toggleShell()
  g().shellPickAt([20, 20, -15])
  g().setShellThickness(2)
  const t0 = Date.now()
  await g().commitShell()
  const elapsed = Date.now() - t0
  assert.ok(elapsed < 120_000, `commitShell must not hang: ${elapsed}ms`)
  const st = g().status || ''
  if (g().shellMode === false && g().features.some((f) => f.type === 'shell')) {
    assert.match(st, /已抽殼|Shelled|抽殼完成/, `success toast: ${st}`)
  } else {
    assert.match(st, KNOWN_SHELL_AFTER_ROUND, `commitShell refuse: ${st}`)
    assert.doesNotMatch(st, /^⚠ 重建失败[^-]/)
  }
  assert.doesNotMatch(st, COLLOQ)
  assert.doesNotMatch(st, SC)
})
