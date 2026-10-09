// zh-HK pass 2: status / warning / error copy in the most-used paths converted to Traditional at the source,
// raw-rendered paths (Inspector measure text, feature-error banners, material pickers) now localized,
// and zh-CN / en / ja rendering of the converted copy unchanged.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tStatus, tMaterialName } from '../src/i18n.ts'
import { traditionalToSimplified as t2s } from '../src/i18n/tc2sc.ts'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const store = read('src/store.ts')

test('converted store copy is Traditional in source and renders the original Simplified in zh-CN', () => {
  const pairs = [
    ['抽殼失敗——已倒圓角/倒角的實體抽殼不穩定，建議先抽殼後倒角', '抽壳失败——已倒圆角/倒角的实体抽壳不稳定，建议先抽壳后倒角'],
    ['（獨立薄板體 — 要合併入主體用「實體布爾」）', '（独立薄板体 — 要合并入主体用「实体布尔」）'],
    ['壓力載荷：算唔到受力面面積（重新點受力面，要揀一個平面）', '压力载荷：算唔到受力面面积（重新点受力面，要拣一个平面）'],
  ]
  for (const [tc, sc] of pairs) {
    assert.ok(store.includes(tc), `store carries Traditional copy: ${tc}`)
    assert.ok(!store.includes(sc), `Simplified copy gone: ${sc}`)
    assert.equal(tStatus(tc, 'zh-HK'), tc)
    assert.equal(tStatus(tc, 'zh-CN'), t2s(tc))
  }
  assert.ok(store.includes("'S=活動實體'"))
})

test('en/ja: sentence-length Traditional status falls back to the Simplified key; short chrome words stay verbatim', () => {
  assert.equal(tStatus('導出全部零件 STL(zip)', 'en'), tStatus('导出全部零件 STL(zip)', 'en'))
  assert.notEqual(tStatus('導出全部零件 STL(zip)', 'en'), '導出全部零件 STL(zip)')
  assert.equal(tStatus('已創建長方體 10×20×30', 'en'), tStatus('已创建长方体 10×20×30', 'en'))
  assert.equal(tStatus('⬡新實體', 'en'), '⬡新實體')
  assert.equal(tStatus('圓管/衬套', 'en'), '圓管/衬套')
  assert.equal(tStatus('未收錄：參數化時間軸上的節點、圓管平面同自動重建', 'en'), '未收錄：參數化時間軸上的節點、圓管平面同自動重建')
})

test('raw-rendered user text now goes through the locale layer (measure text, feature errors, material names)', () => {
  assert.match(read('src/components/InspectorPanel.tsx'), /\{tStatus\(info\.text, lang\)\}/)
  assert.match(read('src/components/Timeline.tsx'), /\{tStatus\(featureErrors\[sel\.id\], lang\)\}/)
  const tree = read('src/components/BrowserTree.tsx')
  assert.equal((tree.match(/tStatus\('重建失敗：', lang\) \+ tStatus\(err, lang\)/g) ?? []).length, 2)
  assert.equal((tree.match(/<option key=\{k\} value=\{k\}>\{tMaterialName\(k, lang\)\}<\/option>/g) ?? []).length, 2)
  assert.ok(!/<option key=\{k\} value=\{k\}>\{k\}<\/option>/.test(tree))
  const vp = read('src/components/Viewport.tsx')
  assert.ok(vp.includes('[${tMaterialName(selComp.material, lang)}] '))
  assert.ok(vp.includes('{Object.keys(SM_RULES).map((k) => <option key={k} value={k}>{tStatus(k, lang)}</option>)}'))
  // worker boolean errors (Simplified in the worker) render Traditional in zh-HK, Simplified in zh-CN
  assert.equal(tStatus('实体布尔：没有活动实体', 'zh-HK'), '實體布爾：沒有活動實體')
  assert.equal(tStatus('实体布尔：没有活动实体', 'zh-CN'), '实体布尔：没有活动实体')
  assert.equal(tStatus('平面 面积 12.5 mm²', 'zh-HK'), '平面 面積 12.5 mm²')
  for (const [sc, tc] of [['钢', '鋼'], ['铝', '鋁'], ['不锈钢', '不鏽鋼']]) {
    assert.equal(tMaterialName(sc, 'zh-HK'), tc)
    assert.equal(tMaterialName(sc, 'zh-CN'), sc)
  }
})
