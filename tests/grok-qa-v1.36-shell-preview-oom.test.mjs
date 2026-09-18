/**
 * v1.36: Shell preview / MakeThickSolid memory — stop Chrome tab discard on BX01/BX02.
 *
 * Root cause (LIVE @1.35): uncapped MakeThickSolid ladder + stacked previewRound
 * (BX02 probe: 2017 joins / +253MB one shell; 4989 joins / ~1.2GB for 3 stacked previews).
 * Win path was fillet-trim after seeds+TORUS burned full ladders on 4 bases.
 *
 * Fix: join budgets, early fillet-trim, lazy alt bases, cancelPreviews on reschedule,
 * coarser preview mesh. Must stay CLEAN (no 备用/型腔/其他开口) for BX01/BX02.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const workerSrc = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const serviceSrc = readFileSync(new URL('../src/cad/cadService.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.36+', () => {
  assert.match(version, /APP_VERSION = '1\.3[6-9]'|APP_VERSION = '1\.[4-9]\d'/)
})

test('v1.36 wiring: join budgets + early trim + lazy alt bases + preview mesh + cancel on schedule', () => {
  assert.match(workerSrc, /SHELL_JOIN_CAP_COMMIT/)
  assert.match(workerSrc, /SHELL_JOIN_CAP_PREVIEW/)
  assert.match(workerSrc, /SHELL_JOIN_FEATURE_CAP_COMMIT/)
  assert.match(workerSrc, /function _shellBeginMemMode/)
  assert.match(workerSrc, /function _shellNoteJoin/)
  assert.match(workerSrc, /function _shellDisposeShape/)
  assert.match(workerSrc, /shell join budget exceeded/)
  assert.match(workerSrc, /v1\.36: fillet-trim EARLY/)
  assert.match(workerSrc, /ensureAltBases/)
  assert.match(workerSrc, /meshOf\(shape, \{ preview: true \}\)/)
  assert.match(workerSrc, /_shellBeginMemMode\('preview'\)/)
  assert.match(storeSrc, /v1\.36: preempt in-flight previewRound/)
  assert.match(storeSrc, /scheduleShellPreview:[\s\S]*?cancelPreviews\(\)/)
  // Keep v1.32/v1.33 preempt/watchdog
  assert.match(serviceSrc, /PREVIEW_CANCELLED_MSG/)
  assert.match(serviceSrc, /silentRecoverAfterPreviewPreempt/)
  assert.match(serviceSrc, /cancelPreviews/)
})

globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
await import('../src/worker/cad.worker.ts')
const w = globalThis.__wheelWorker
await w.ready()

const softRe = /已改用其他平面开口|已启用其他开口面|原开口 OCCT 未收敛|未收敛|备用|型腔|开口面偏移型腔|直柱型腔/

test('HARD BX02: cut+R1+shell t=1.5 stays CLEAN with ≪200 MakeThickSolid joins', async () => {
  const feats = [
    { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 20, operation: 'new' },
    { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 15 }, height: 20, operation: 'newbody' },
    { id: 'bb', type: 'bodyboolean', bop: 'cut', target: 0 },
    { id: 'f', type: 'fillet', radius: 1, nears: [[15, 0, 20]], chain: false },
    { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 20]], tangentChain: true, direction: 'inside' },
  ]
  const m = await w.rebuild(feats)
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  assert.ok((m.triangles?.length ?? 0) > 0)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => softRe.test(x)), `must stay CLEAN; warnings=${JSON.stringify(warnings)}`)
  const st = globalThis.__webcadShellStats
  assert.ok(st && st.joins > 0, 'expected shell join stats')
  assert.ok(st.joins < 200, `expected ≪200 joins (was ~2017 @1.35); got ${st.joins}`)
  assert.ok(st.joins <= 80, `target ≤80 joins for BX02 early-trim path; got ${st.joins}`)
})

test('HARD BX01: fuse+junction R2+shell t=2 still CLEAN and cheap', async () => {
  const feats = [
    { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 20, operation: 'new' },
    { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 15 }, height: 25, operation: 'newbody' },
    { id: 'bb', type: 'bodyboolean', bop: 'fuse', target: 0 },
    { id: 'f', type: 'fillet', radius: 2, nears: [[15, 0, 20]], chain: false },
    { id: 'shell', type: 'shell', thickness: 2, nears: [[0, 0, 25]], tangentChain: true, direction: 'inside' },
  ]
  const m = await w.rebuild(feats)
  assert.deepEqual(m.failed ?? [], [], `rebuild failed: ${JSON.stringify(m.failed)}`)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => softRe.test(x)), `BX01 must stay CLEAN; warnings=${JSON.stringify(warnings)}`)
  const st = globalThis.__webcadShellStats
  assert.ok(st && st.joins >= 1 && st.joins < 50, `BX01 should stay cheap; joins=${st?.joins}`)
})

test('previewRound uses preview budget mode and returns a mesh for BX02', async () => {
  const feats = [
    { id: 'box', type: 'extrude', profile: { kind: 'rect', a: [-30, -20], b: [30, 20] }, height: 20, operation: 'new' },
    { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 15 }, height: 20, operation: 'newbody' },
    { id: 'bb', type: 'bodyboolean', bop: 'cut', target: 0 },
    { id: 'f', type: 'fillet', radius: 1, nears: [[15, 0, 20]], chain: false },
    { id: 'shell', type: 'shell', thickness: 1.5, nears: [[0, 0, 20]], tangentChain: true, direction: 'inside' },
  ]
  const m = await w.previewRound(feats)
  assert.ok(m && (m.triangles?.length ?? 0) > 0)
  const st = globalThis.__webcadShellStats
  assert.ok(st && st.mode === 'preview', `expected preview mode stats, got ${JSON.stringify(st)}`)
  assert.ok(st.joins < 120, `preview joins must stay bounded; got ${st.joins}`)
  const warnings = m.warnings ?? []
  assert.ok(!warnings.some((x) => softRe.test(x)), `preview must stay CLEAN; warnings=${JSON.stringify(warnings)}`)
})
