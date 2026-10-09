// appearance-visual-only.test.mjs — Fusion 式 Appearance 与 Physical Material 分家：
// 套用外观（例如「金」）只改颜色/PBR，不得改密度 → 质量；物理材质 tab 仍由 setPhysicalMaterial 负责。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const { useApp, MATERIALS } = await import('../src/store.ts')
const { computeMassProps } = await import('../src/cad/massProps.ts')
const { tMaterialName } = await import('../src/i18n.ts')
const g = () => useApp.getState()

// 10×10×10 mm closed cube (outward CCW triangles)
const V = new Float32Array([0,0,0, 10,0,0, 10,10,0, 0,10,0, 0,0,10, 10,0,10, 10,10,10, 0,10,10])
const T = new Uint32Array([0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4, 1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7])
const mass = () => computeMassProps(V, T, g().bodyDensity).mass

test('appearance gold changes colour/PBR only; density and mass unchanged', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const d0 = g().bodyDensity, m0 = mass(), phys0 = g().physMatName
  assert.ok(m0 > 0)
  g().setMaterialPreset('金')
  assert.equal(g().bodyColor, MATERIALS['金'].color)
  assert.equal(g().material.metalness, MATERIALS['金'].metalness)
  assert.equal(g().bodyDensity, d0, 'appearance must not touch density')
  assert.equal(mass(), m0, 'appearance must not touch mass')
  assert.equal(g().physMatName, phys0, 'physical material untouched')
  assert.equal(g().appearanceName, '金')
  assert.equal(g().status, '已套用外觀：金')
})

test('physical material still drives mass, and appearance afterwards keeps it', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  g().setPhysicalMaterial('钢')
  const mSteel = mass()
  assert.equal(g().bodyDensity, 7.85)
  g().setMaterialPreset('木')
  assert.equal(g().bodyDensity, 7.85)
  assert.equal(mass(), mSteel)
  assert.equal(g().physMatName, '钢')
})

test('custom body colour clears the selected appearance swatch', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  g().setMaterialPreset('金'); g().setBodyColor('#123456')
  assert.equal(g().appearanceName, '')
})

test('material names render Traditional in zh-HK, English in en', () => {
  const sc = /[钢铝铜锈龙树胶喷银钛]/
  for (const k of Object.keys(MATERIALS)) assert.ok(!sc.test(tMaterialName(k, 'zh-HK')), `${k} → ${tMaterialName(k, 'zh-HK')}`)
  assert.equal(tMaterialName('不锈钢', 'zh-HK'), '不鏽鋼')
  assert.equal(tMaterialName('橡胶', 'zh-HK'), '橡膠')
  assert.equal(tMaterialName('钢', 'zh-CN'), '钢')
  assert.equal(tMaterialName('金', 'en'), 'Gold')
})
