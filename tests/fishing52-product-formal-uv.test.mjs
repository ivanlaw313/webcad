/**
 * FISHING52: Formal TC product UV (fasteners/CAM/CAD refuse/IO) + regressions.
 * Skip MATERIALS/DENSITY_PREF storage keys; skip i18n SC lookup keys; skip names.ts dual sc/tc.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const fasteners = read('src/cad/fasteners.ts')
const lathe = read('src/cam/lathe.ts')
const mill = read('src/cam/mill25d.ts')
const subdiv = read('src/cad/subdiv.ts')
const mate = read('src/assembly/mateSolve.ts')
const analyses = read('src/cad/analysesModel.ts')
const sm = read('src/cad/smUnfold.ts')
const faceFea = read('src/analysis/faceFeaSelect.ts')
const dxf = read('src/io/dxfImport.ts')
const svg = read('src/io/svgImport.ts')
const meshDrop = read('src/io/meshDrop.ts')
const mold = read('src/analysis/moldsolve.ts')
const i18n = read('src/i18n.ts')
const css = read('src/index.css')
const st = read('src/store.ts')

test('FISHING52 fasteners + analysesModel Formal', () => {
  assert.match(fasteners, /內六角螺絲 \(ISO 4762\)/)
  assert.match(fasteners, /六角頭螺栓 \(ISO 4017\)/)
  assert.match(fasteners, /沉頭螺絲 \(ISO 10642\)/)
  assert.match(fasteners, /平墊圈 \(ISO 7089\)/)
  assert.match(fasteners, /定位銷 \(ISO 2338\)/)
  assert.doesNotMatch(fasteners, /内六角螺丝/)
  assert.doesNotMatch(fasteners, /六角头螺栓/)
  assert.match(analyses, /斑馬紋/)
  assert.match(analyses, /曲率趨勢/)
  assert.match(analyses, /最小曲率半徑/)
  assert.match(analyses, /脫模可達性/)
  assert.doesNotMatch(analyses, /斑马纹/)
  assert.doesNotMatch(analyses, /脱模可达性/)
})

test('FISHING52 CAM lathe + mill Formal', () => {
  assert.match(lathe, /參數 \$\{k\} 必須為正數/)
  assert.match(lathe, /安全直徑要大於毛坯/)
  assert.match(lathe, /turn 輪廓最少要 2 點/)
  assert.match(lathe, /精車留量/)
  assert.doesNotMatch(lathe, /参数 \$\{k\} 必须为正数/)
  assert.doesNotMatch(lathe, /安全直径要大于毛坯/)
  assert.match(mill, /細過刀徑/)
  assert.match(mill, /已跳過/)
  assert.match(mill, /留料橋/)
  assert.match(mill, /面銑/)
  assert.match(mill, /島嶼未避讓/)
  assert.match(mill, /鋁\/亞克力建議細/)
  assert.doesNotMatch(mill, /细过刀径/)
  assert.doesNotMatch(mill, /面铣 \$\{fn\}/)
})

test('FISHING52 CAD refuse + mate + smUnfold Formal', () => {
  assert.match(subdiv, /分段數要是 ≥1 的整數/)
  assert.match(subdiv, /細分要求閉合流形 quad 網格/)
  assert.doesNotMatch(subdiv, /makeBoxCage: 分段数要是/)
  assert.match(mate, /殘差非有限（幾何退化）/)
  assert.match(mate, /發散（殘差連升 3 次）/)
  assert.match(mate, /姿態非有限/)
  assert.doesNotMatch(mate, /'残差非有限（几何退化）/)
  assert.match(sm, /孔超出板寬/)
  assert.match(sm, /孔在折彎區/)
  assert.match(sm, /孔不在鈑金面上/)
  assert.doesNotMatch(sm, /孔超出板宽/)
  assert.match(faceFea, /空輸入（缺 grid\/faceTris）/)
  assert.match(faceFea, /無實體角節點/)
  assert.equal(faceFea.includes("'空输入（缺 grid/faceTris）'"), false)
})

test('FISHING52 IO import + moldsolve Formal', () => {
  assert.match(dxf, /DXF 導入已取消/)
  assert.match(dxf, /識別 \$\{profiles\.length\} 個輪廓/)
  assert.match(dxf, /未找到可用輪廓/)
  assert.doesNotMatch(dxf, /DXF 导入已取消/)
  assert.match(svg, /不是有效 SVG 或解析失敗/)
  assert.match(svg, /未找到可用輪廓（支持 path/)
  assert.match(meshDrop, /未能讀取拖放文件/)
  assert.match(meshDrop, /拖到視口導入/)
  assert.doesNotMatch(meshDrop, /未能读取拖放文件/)
  assert.match(mold, /工程級 Stage-2/)
  assert.match(mold, /短射風險/)
  assert.match(mold, /平均體積收縮/)
  assert.match(mold, /趨勢級 Stage-4 翹曲指數/)
  assert.doesNotMatch(mold, /工程级 Stage-2/)
  assert.doesNotMatch(mold, /短射风险/)
})

test('FISHING52 i18n + CSS freebie', () => {
  assert.match(i18n, /FISHING52 Formal TC product UV/)
  assert.match(i18n, /'內六角螺絲':/)
  assert.match(i18n, /'脫模可達性':/)
  assert.match(i18n, /'細過刀徑':/)
  assert.match(css, /FISHING52: Fusion-like fastener/)
  assert.match(css, /\.fastener-kind-chip/)
  assert.match(css, /\.import-drop-hint/)
})

test('FISHING52 MATERIALS keys stay SC (storage ids)', () => {
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('FISHING51 Formal regressions still on tip', () => {
  const asym = read('src/cad/asymmetricFillet.ts')
  const hdri = read('src/render/hdriPresets.ts')
  assert.match(asym, /不對稱圓角：請選擇邊並輸入兩個正 offset/)
  assert.doesNotMatch(asym, /不对称圆角：请选择边/)
  assert.match(hdri, /產品\/工業件展示首選/)
  assert.match(i18n, /FISHING51 Formal TC analysis\/CAD refuse/)
  assert.match(css, /FISHING51: Fusion-like inspector/)
})

test('FISHING50 Formal store leftovers still on tip', () => {
  assert.match(st, /flush: '面貼合', distance: '距離'/)
  assert.match(st, /\? '過孔' : '寬松配'/)
  assert.doesNotMatch(st, /flush: '面贴合'/)
})
