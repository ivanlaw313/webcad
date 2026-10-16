/**
 * FISHING51: Formal TC analysis/CAD refuse + HDRI / selection + fishing50 regressions.
 * Skip MATERIALS/DENSITY_PREF storage keys; skip i18n SC lookup keys; skip aeroI18n zh-CN slots.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const asym = read('src/cad/asymmetricFillet.ts')
const weight = read('src/cad/weightedFillet.ts')
const full = read('src/cad/fullRound.ts')
const sel = read('src/cad/selectionModel.ts')
const dim = read('src/cad/dimensionExpression.ts')
const mesh = read('src/io/meshBool.ts')
const hdri = read('src/render/hdriPresets.ts')
const fea = read('src/analysis/voxelfea.ts')
const gates = read('src/analysis/gateTypes.ts')
const feacsv = read('src/analysis/feacsv.ts')
const sim = read('src/simulation/resultValidity.ts')
const i18n = read('src/i18n.ts')
const css = read('src/index.css')
const st = read('src/store.ts')

test('FISHING51 asymmetric / weighted / full-round refuse Formal', () => {
  assert.match(asym, /不對稱圓角：請選擇邊並輸入兩個正 offset/)
  assert.match(asym, /不對稱圓角：無法建立局部截面坐標/)
  assert.doesNotMatch(asym, /不对称圆角：请选择边/)
  assert.match(weight, /切線權重圓角：請選擇邊/)
  assert.match(weight, /切線權重圓角：目前只支持直線邊/)
  assert.doesNotMatch(weight, /切线权重圆角：请选择边/)
  assert.match(full, /全圓角：B-rep 運算失敗/)
  assert.doesNotMatch(full, /全圆角：B-rep 运算失败/)
})

test('FISHING51 selection + dimension + meshBool Formal', () => {
  assert.match(sel, /label: '組件'/)
  assert.match(sel, /label: '實體'/)
  assert.match(sel, /label: '邊'/)
  assert.match(sel, /label: '頂點'/)
  assert.match(sel, /label: '草圖'/)
  assert.doesNotMatch(sel, /label: '组件'/)
  assert.doesNotMatch(sel, /label: '实体'/)
  assert.match(dim, /表達式未完成或含無效字符/)
  assert.match(dim, /無法計算：檢查除零、函數及括號/)
  assert.doesNotMatch(dim, /表达式未完成或含无效字符/)
  assert.match(mesh, /網格體積近零，無法抽殼/)
  assert.doesNotMatch(mesh, /网格体积近零，无法抽壳/)
})

test('FISHING51 HDRI + gateTypes + feacsv Formal', () => {
  assert.match(hdri, /產品\/工業件展示首選/)
  assert.match(hdri, /室內 Apartment/)
  assert.match(hdri, /倉庫 Warehouse/)
  assert.match(hdri, /空曠工業室內/)
  assert.doesNotMatch(hdri, /产品\/工业件展示首选/)
  assert.doesNotMatch(hdri, /空旷工业室内/)
  assert.match(gates, /name: '扇形澆口'/)
  assert.match(gates, /name: '護耳澆口'/)
  assert.match(gates, /name: '點澆口'/)
  assert.match(gates, /name: '側澆口\/邊緣'/)
  assert.doesNotMatch(gates, /name: '扇形浇口'/)
  assert.match(feacsv, /\['安全系數 SF'/)
  assert.match(feacsv, /'應變能密度'/)
  assert.match(feacsv, /\['序號'/)
  assert.doesNotMatch(feacsv, /\['安全系数 SF'/)
})

test('FISHING51 voxelfea / sim validity Formal samples', () => {
  assert.match(fea, /E 無效（需 > 0）/)
  assert.match(fea, /包圍盒退化/)
  assert.match(fea, /固定面法向量為零/)
  assert.match(fea, /實體體素不足/)
  assert.doesNotMatch(fea, /E 无效（需 > 0）/)
  assert.doesNotMatch(fea, /包围盒退化（网格无体积范围）/)
  assert.match(sim, /仿真結果已失效|模擬結果已失效/)
  assert.match(sim, /結果已失效/)
  assert.doesNotMatch(sim, /仿真结果已失效/)
})

test('FISHING51 i18n + CSS freebie', () => {
  assert.match(i18n, /FISHING51 Formal TC analysis\/CAD refuse/)
  assert.match(i18n, /'不對稱圓角':/)
  assert.match(i18n, /'安全系數':/)
  assert.match(css, /FISHING51: Fusion-like inspector/)
  assert.match(css, /\.hdri-preset-hint/)
})

test('FISHING51 MATERIALS keys stay SC (storage ids)', () => {
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('FISHING50 Formal store leftovers still on tip', () => {
  assert.match(st, /`半軸 rx \$\{L\.toFixed\(1\)\} mm`/)
  assert.match(st, /flush: '面貼合', distance: '距離'/)
  assert.match(st, /\? '過孔' : '寬松配'/)
  assert.match(st, /\? '橢圓' : rho > 0\.5 \? '雙曲' : '拋物'/)
  assert.match(st, /\|\| '主體'\)/)
  assert.match(st, /\? '歐拉細長桿控制' : '短桿壓潰控制'/)
  assert.doesNotMatch(st, /`半轴 rx \$\{L\.toFixed/)
  assert.doesNotMatch(st, /flush: '面贴合'/)
})

test('FISHING49 Formal + CSS regressions still on tip', () => {
  assert.match(st, / · \| 豎直/)
  assert.match(st, /邊長 L/)
  assert.match(css, /FISHING49: Fusion-like marking-menu/)
})
