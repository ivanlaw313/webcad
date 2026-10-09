// UX3 #1/#5：BOM 同狀態列／屬性用同一個材料／密度來源（bodyDensity 或組件材質），材質欄顯示材質名唔再「—」；
// 淨係「打開」材料清單（ribbon 檢查 ▸ 材料清單）唔再講「已匯出」、唔觸發下載；撳「匯出 CSV」先下載＋講已匯出。
// 真瀏覽器：scripts/e2e-ux3-assembly.mjs。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
const { useApp, effectiveMaterial, materialForDensity } = await import('../src/store.ts')
const g = () => useApp.getState()
// closed 10 mm cube → 1 cm³
function cube(s = 10) {
  const v = [0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, 0, 0, s, s, 0, s, s, s, s, 0, s, s]
  const t = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7]
  return { vertices: v, triangles: t, normals: new Array(v.length).fill(0) }
}
const comp = (id, name, extra = {}) => ({ id, name, mesh: cube(), pos: [0, 0, 0], rot: [0, 0, 0], color: '#888', ...extra })

test('density → material name (single source)', () => {
  assert.equal(materialForDensity(7.85), '钢')
  assert.equal(materialForDensity(2.7), '铝')
  const em = effectiveMaterial({ bodyDensity: 7.85, lang: 'zh-HK' })
  assert.equal(em.density, 7.85)
  assert.match(em.label, /^鋼（預設）$/)
  assert.equal(effectiveMaterial({ bodyDensity: 7.85, lang: 'zh-HK' }, { material: '铝' }).density, 2.7)
})

test('openBOM uses bodyDensity 7.85 (not 2.7), shows 鋼, no 已匯出, no download', () => {
  let downloads = 0
  const origURL = globalThis.URL.createObjectURL
  globalThis.URL.createObjectURL = () => { downloads++; return 'blob:x' }
  try {
    useApp.setState({ components: [comp('A', '底板'), comp('B', '軸')], componentDefs: {}, groups: [], bodyDensity: 7.85, lang: 'zh-HK', bomDialog: null })
    g().runCommand('bom')
    const d = g().bomDialog
    assert.ok(d, 'BOM dialog opened')
    const hdr = d.rows[0]
    const iMat = hdr.indexOf('材質'), iDen = hdr.indexOf('密度 (g/cm³)'), iSub = hdr.indexOf('小計質量 (g)')
    const body = d.rows.slice(1).filter((r) => /^\d+$/.test(r[0]))
    assert.equal(body.length, 2)
    for (const r of body) { assert.equal(r[iMat], '鋼（預設）'); assert.equal(r[iDen], '7.85'); assert.equal(r[iSub], (7.85).toFixed(1)) }
    const tot = d.rows.find((r) => r[0] === '合計')
    assert.equal(tot[iSub], '15.7')   // 2 cm³ × 7.85 — same number the status bar 總質量(7.85) shows
    assert.match(d.summary, /總質量 16 g（鋼（預設） 7\.85 g\/cm³）/)
    assert.doesNotMatch(g().status, /已匯出/)
    assert.match(g().status, /^已打開材料清單/)
    assert.equal(downloads, 0)
  } finally { globalThis.URL.createObjectURL = origURL }
})

test('component material wins; per-material column shows its name', () => {
  useApp.setState({ components: [comp('A', '底板', { material: '铝' }), comp('B', '軸')], bodyDensity: 7.85, bomDialog: null })
  g().openBOM()
  const d = g().bomDialog
  const iMat = d.rows[0].indexOf('材質'), iDen = d.rows[0].indexOf('密度 (g/cm³)')
  const byName = Object.fromEntries(d.rows.filter((r) => /^\d+$/.test(r[0])).map((r) => [r[2], r]))
  assert.equal(byName['底板'][iMat], '鋁'); assert.equal(byName['底板'][iDen], '2.70')
  assert.equal(byName['軸'][iMat], '鋼（預設）'); assert.equal(byName['軸'][iDen], '7.85')
  assert.ok(!d.rows.some((r) => r[4] === '—' && /^\d+$/.test(r[0])), 'no 「—」 material cells')
})
