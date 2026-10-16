/**
 * CORE16 residual more15: Sketch constraint / DOF display — Formal Traditional Chinese.
 * Viewport sketch-dof badge + resolveSk / refreshSkDof status (完全定義 / 剩餘自由度 / 約束衝突).
 * Complements sketch12-batch1 DOF math without re-testing solver probes.
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
const reset = (extra = {}) =>
  useApp.setState(
    {
      ...useApp.getInitialState(),
      lang: 'zh-HK',
      mode: 'sketch',
      sketchPlane: 'XY',
      sketchProfiles: [],
      sketchShape: null,
      skCons: [],
      appConfirm: async () => true,
      ...extra,
    },
    true,
  )

const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC = /完全定义|剩余自由度|约束冲突|约束已求解|欠定义/

test('source: Viewport sketch-dof badge Formal TC (完全定義 / DOF / 約束衝突)', () => {
  const vp = rd('src/components/Viewport.tsx')
  assert.match(vp, /data-testid="sketch-dof"/)
  assert.match(vp, /✓ 完全定義 · DOF 0 · 約束 \$\{skCons\.length\}/)
  assert.match(vp, /約束 \$\{skCons\.length\} · DOF \$\{skDof \?\? '…'\}/)
  assert.match(vp, /約束求解狀態：DOF = 剩餘自由度（0 = 完全定義，綠色）/)
  assert.match(vp, /⚠ 約束衝突/)
  // Never show ASCII dash placeholder (SKETCH12)
  assert.match(vp, /skDof \?\? '…'/)
  assert.doesNotMatch(vp, /DOF \$\{skDof \?\? '—'\}/)
  // Formal TC literals (not SC)
  assert.doesNotMatch(vp, /完全定义 · DOF|剩余自由度|约束冲突 ×/)
})

test('source: resolveSk status Formal TC 剩餘自由度 / 約束衝突', () => {
  const st = rd('src/store.ts')
  assert.match(st, /約束已求解 ✓ 剩餘自由度 DOF \$\{res\.dof\}/)
  assert.match(st, /⚠ 約束衝突\/過約束/)
  assert.match(st, /refreshSkDof:/)
  assert.doesNotMatch(st, /约束已求解 ✓ 剩余自由度/)
  assert.doesNotMatch(st, /status: `约束已求解/)
})

test('runtime: free rect → refreshSkDof > 0; badge path uses Formal DOF wording', async () => {
  reset({ sketchShape: { type: 'rect', a: [0, 0], b: [20, 10] } })
  await g().refreshSkDof()
  assert.equal(typeof g().skDof, 'number')
  assert.ok(g().skDof > 0, `expected free DOF, got ${g().skDof}`)
  // Template strings that UI renders for under-defined sketch
  const under = `約束 ${g().skCons.length} · DOF ${g().skDof ?? '…'}`
  assert.match(under, /約束 \d+ · DOF \d+/)
  assert.doesNotMatch(under, COLLOQ)
  assert.doesNotMatch(under, SC)
})

test('runtime: resolveSk status Formal after sketch with geometry', async () => {
  reset({
    sketchShape: { type: 'circle', c: [0, 0], r: 10 },
    skCons: [{ id: 'd1', kind: 'dim', type: 'dia', a: { kind: 'circle', shape: 0 }, value: 20 }],
  })
  await g().resolveSk()
  assert.match(g().status, /約束已求解 ✓ 剩餘自由度 DOF \d+|完全定義|約束衝突/)
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC)
  assert.equal(typeof g().skDof, 'number')
})

test('Formal TC constants: 完全定義 / 剩餘自由度 present; no SC leak in i18n key for DOF title', () => {
  const i18n = rd('src/i18n.ts')
  assert.match(i18n, /約束求解狀態：DOF = 剩餘自由度（0 = 完全定義，綠色）/)
  assert.doesNotMatch(i18n, /'约束求解状态：DOF = 剩余自由度/)
})
