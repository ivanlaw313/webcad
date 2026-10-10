// FISHING14 E：setPhysicalMaterial on selected component → HUD / 物理屬性 / BOM / 裝配總質量 same density;
// bodyDensity stays 2.7; undo restores; mixed materials → assembly does not broadcast one density.
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
const { useApp, MATERIALS, effectiveComponentDensity, effectiveMaterial } = await import('../src/store.ts')
const { tMaterialName } = await import('../src/i18n.ts')
const g = () => useApp.getState()

function cube(sx = 10, sy = 10, sz = 10) {
  const v = [0, 0, 0, sx, 0, 0, sx, sy, 0, 0, sy, 0, 0, 0, sz, sx, 0, sz, sx, sy, sz, 0, sy, sz]
  const t = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { vertices: v, triangles: t, normals: new Array(v.length).fill(0) }
}
const comp = (id, name, mesh, extra = {}) => ({ id, name, mesh, pos: [0, 0, 0], rot: [0, 0, 0], color: '#888', ...extra })

test('effectiveComponentDensity ignores active physMatName — file default only', () => {
  assert.equal(effectiveComponentDensity({}, 2.7), 2.7)
  assert.equal(effectiveComponentDensity({ material: '钢' }, 2.7), 7.85)
  assert.equal(effectiveComponentDensity({ material: '铝' }, 7.85), 2.7)
})

test('setPhysicalMaterial with selected component writes c.material; bodyDensity unchanged; props+BOM+undo', async () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  // 組件1 plate ~50.78 cm³ not needed — use 10³ mm cubes: 1 cm³ each for easy math
  const plate = cube(80, 60, 10) // 48 cm³
  const shaft = cube(10, 10, 40) // 4 cm³ — close to Ø10×40 πr²h≈3.14; exact cube for unit
  useApp.setState({
    components: [
      comp('C1', '組件1', plate),
      comp('C2', '組件2', shaft),
    ],
    componentDefs: [],
    bodyDensity: 2.7,
    physMatName: '',
    selectedComponent: 'C2',
    lang: 'zh-HK',
    bomDialog: null,
  })
  assert.equal(g().bodyDensity, 2.7)
  g().setPhysicalMaterial('钢')
  assert.equal(g().bodyDensity, 2.7, 'document default density unchanged')
  assert.equal(g().physMatName, '', 'active physMat not polluted when targeting component')
  const c2 = g().components.find((c) => c.id === 'C2')
  assert.equal(c2.material, '钢')
  assert.equal(c2.color, MATERIALS['钢'].color)
  assert.match(g().status, /組件2/)
  assert.match(g().status, /7\.85/)
  // 物理屬性
  await g().openPropertiesDialog('C2')
  const mp = g().propsDialogData?.massProps
  assert.ok(mp)
  const massG = (mp.mass ?? 0) * 1e6
  assert.ok(Math.abs(massG - 4 * 7.85) < 0.5, `props mass ~31.4 g got ${massG}`)
  const densRow = g().propsDialogData?.rows?.find((r) => /密度/.test(r.label))
  assert.ok(densRow, 'density row present')
  assert.match(String(densRow.value), /7\.850/)
  const matRow = g().propsDialogData?.rows?.find((r) => r.label === '材質')
  assert.equal(matRow?.value, '鋼')
  // BOM
  g().openBOM()
  const d = g().bomDialog
  assert.ok(d)
  const iMat = d.rows[0].indexOf('材質'), iDen = d.rows[0].indexOf('密度 (g/cm³)'), iMass = d.rows[0].indexOf('單件質量 (g)')
  const byName = Object.fromEntries(d.rows.filter((r) => /^\d+$/.test(r[0])).map((r) => [r[2], r]))
  assert.equal(byName['組件1'][iMat], '鋁（預設）')
  assert.equal(byName['組件1'][iDen], '2.70')
  assert.equal(byName['組件2'][iMat], '鋼')
  assert.equal(byName['組件2'][iDen], '7.85')
  const m2 = Number(byName['組件2'][iMass])
  assert.ok(Math.abs(m2 - 31.4) < 0.2, `BOM shaft mass ${m2}`)
  assert.match(d.summary, /按各組件材質密度/)
  // Per-component density helper (HUD / assembly bar)
  assert.equal(effectiveComponentDensity(g().components.find((c) => c.id === 'C1'), 2.7), 2.7)
  assert.equal(effectiveComponentDensity(c2, 2.7), 7.85)
  const tot = 48 * 2.7 + 4 * 7.85
  assert.ok(Math.abs(tot - (48 * 2.7 + 31.4)) < 0.01)
  // Undo restores previous component material / BOM
  await g().undo()
  assert.equal(g().components.find((c) => c.id === 'C2').material, undefined)
  assert.equal(g().bodyDensity, 2.7)
  g().openBOM()
  const d2 = g().bomDialog
  const by2 = Object.fromEntries(d2.rows.filter((r) => /^\d+$/.test(r[0])).map((r) => [r[2], r]))
  assert.equal(by2['組件2'][iMat], '鋁（預設）')
  assert.equal(by2['組件2'][iDen], '2.70')
})

test('formal TC material label 鋼 via tMaterialName / effectiveMaterial', () => {
  assert.equal(tMaterialName('钢', 'zh-HK'), '鋼')
  const em = effectiveMaterial({ bodyDensity: 2.7, lang: 'zh-HK' }, { material: '钢' })
  assert.equal(em.label, '鋼')
  assert.equal(em.density, 7.85)
})
