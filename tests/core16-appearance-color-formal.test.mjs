/**
 * CORE16 residual more13: Material / appearance color Formal sample (store API).
 * setMaterialPreset / setBodyColor — Formal 繁中 status; appearance ≠ physical density.
 * Complements appearance-visual-only / default-appearance-contract without re-testing ribbon DOM.
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
const { useApp, MATERIALS } = await import('../src/store.ts')

const g = () => useApp.getState()
const rd = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const reset = () => useApp.setState({ ...useApp.getInitialState(), lang: 'zh-HK', appConfirm: async () => true }, true)
const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/
const SC_APPEAR = /已套用外观|已应用外观/

test('source: setMaterialPreset / setBodyColor Formal 繁中 wired', () => {
  const st = rd('src/store.ts')
  assert.match(st, /setMaterialPreset: \(name: string\) => void/)
  assert.match(st, /setBodyColor: \(c: string\) => void/)
  assert.match(st, /bodyColor: '#4a7296'/)
  assert.match(st, /status: `已套用外觀：\$\{name\}`/)
  assert.match(st, /setBodyColor: \(c\) => set\(\{ bodyColor: c, appearanceName: '' \}\)/)
  assert.doesNotMatch(st, /已套用外观：/)
})

test('runtime: setMaterialPreset Formal sample changes color/PBR; density untouched', () => {
  reset()
  const d0 = g().bodyDensity
  const phys0 = g().physMatName
  assert.ok(MATERIALS['金'], '金 preset exists')
  g().setMaterialPreset('金')
  assert.equal(g().bodyColor, MATERIALS['金'].color)
  assert.equal(g().material.metalness, MATERIALS['金'].metalness)
  assert.equal(g().material.roughness, MATERIALS['金'].roughness)
  assert.equal(g().appearanceName, '金')
  assert.equal(g().status, '已套用外觀：金')
  assert.doesNotMatch(g().status, COLLOQ)
  assert.doesNotMatch(g().status, SC_APPEAR)
  assert.equal(g().bodyDensity, d0, 'appearance must not touch density')
  assert.equal(g().physMatName, phys0, 'physical material untouched')
})

test('runtime: setBodyColor Formal sample clears appearance swatch', () => {
  reset()
  g().setMaterialPreset('金')
  assert.equal(g().appearanceName, '金')
  g().setBodyColor('#123456')
  assert.equal(g().bodyColor, '#123456')
  assert.equal(g().appearanceName, '', 'custom colour clears preset swatch')
})

test('runtime: unknown preset name is no-op (store API guard)', () => {
  reset()
  const c0 = g().bodyColor
  const a0 = g().appearanceName
  g().setMaterialPreset('不存在的材質XYZ')
  assert.equal(g().bodyColor, c0)
  assert.equal(g().appearanceName, a0)
})

test('runtime: steel physical then wood appearance keeps density; Formal toast', () => {
  reset()
  const fileDens = g().bodyDensity
  g().setPhysicalMaterial('钢')
  assert.equal(g().physMatName, '钢')
  assert.equal(g().bodyDensity, fileDens)
  g().setMaterialPreset('木')
  assert.equal(g().appearanceName, '木')
  assert.equal(g().status, '已套用外觀：木')
  assert.equal(g().physMatName, '钢', 'appearance does not clear physical')
  assert.equal(g().bodyDensity, fileDens)
  assert.doesNotMatch(g().status, SC_APPEAR)
})
