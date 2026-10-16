/**
 * FISHING59: design-table/mesh-drop/DXF Formal 導入→匯入 + AI tool-schema Formal + Align tip.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING59 ParamsPanel design-table uses 匯入／匯出 (not 導入／導出)', () => {
  const pp = read('src/components/ParamsPanel.tsx')
  assert.match(pp, /📥 匯入設計表/)
  assert.match(pp, /設計表 CSV 匯入/)
  assert.match(pp, /設計表 CSV 匯出/)
  assert.match(pp, /設計表及匯出/)
  assert.match(pp, /一次匯出 N 個 STL/)
  assert.doesNotMatch(pp, /導入設計表/)
  assert.doesNotMatch(pp, /CSV 導入/)
  assert.doesNotMatch(pp, /CSV 導出/)
})

test('FISHING59 meshDrop + dxfImport cancel use 匯入／檔案', () => {
  const md = read('src/io/meshDrop.ts')
  const dx = read('src/io/dxfImport.ts')
  assert.match(md, /未能讀取拖放檔案/)
  assert.match(md, /File→匯入 STL/)
  assert.match(md, /拖到視口匯入/)
  assert.doesNotMatch(md, /拖放文件/)
  assert.doesNotMatch(md, /視口導入/)
  assert.match(dx, /DXF 匯入已取消/)
  assert.doesNotMatch(dx, /DXF 導入已取消/)
})

test('FISHING59 AI tool schemas Formal (匯出／設定／支援／並設力)', () => {
  const tools = read('src/ai/tools.ts')
  assert.match(tools, /匯出當前模型為檔案/)
  assert.match(tools, /設定實體材質/)
  assert.match(tools, /支援齒輪嚙合/)
  assert.match(tools, /並設力（與受力雲圖一樣）/)
  assert.match(tools, /建立長方體/)
  assert.doesNotMatch(tools, /導出當前模型/)
  assert.doesNotMatch(tools, /設置實體材質/)
  assert.doesNotMatch(tools, /支持齒輪嚙合/)
  assert.doesNotMatch(tools, /并設力/)
})

test('FISHING59 Align tip points to ASSEMBLE 選面配合', () => {
  const ribbon = read('src/ribbon.ts')
  assert.match(ribbon, /想要持久配合用 ASSEMBLE「選面配合」/)
  assert.match(ribbon, /id: 'facemate', label: '選面配合'/)
  assert.doesNotMatch(ribbon, /關節\(選面\)/)
})

test('FISHING59 MATERIALS / DENSITY_PREF stay SC', () => {
  const st = read('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
})
