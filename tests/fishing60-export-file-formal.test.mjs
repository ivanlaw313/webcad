/**
 * FISHING60: leftover Formal 導出→匯出 / 文件→檔案 / 設置→設定 in product UI.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING60 ParamsPanel export buttons Formal 匯出', () => {
  const pp = read('src/components/ParamsPanel.tsx')
  assert.match(pp, /🗂 匯出變體/)
  assert.match(pp, /📦 匯出全部配置/)
  assert.match(pp, /重建並匯出 STL/)
  assert.match(pp, /各匯出一個 STL/)
  assert.doesNotMatch(pp, /導出變體/)
  assert.doesNotMatch(pp, /導出全部配置/)
})

test('FISHING60 Drawing/Viewport/Tree Formal 匯出／檔案單位', () => {
  const dr = read('src/components/DrawingPanel.tsx')
  const vp = read('src/components/Viewport.tsx')
  const bt = read('src/components/BrowserTree.tsx')
  assert.match(dr, /匯出工程圖為 PNG/)
  assert.match(dr, /匯出三視圖為 DXF/)
  assert.match(dr, /貼檔案/)
  assert.doesNotMatch(dr, /導出工程圖/)
  assert.match(vp, /可貼檔案\/郵件分享/)
  assert.match(vp, /檔案單位/)
  assert.match(bt, /檔案單位:/)
  assert.doesNotMatch(vp, /文件單位/)
})

test('FISHING60 AI settings + tool prompt Formal 設定／匯出', () => {
  const ai = read('src/components/AiCopilot.tsx')
  const tools = read('src/ai/tools.ts')
  const st = read('src/store.ts')
  assert.match(ai, /設定（供應商 \/ API Key \/ 模型）/)
  assert.doesNotMatch(ai, /設置（供應商/)
  assert.match(tools, /載範本、匯出）/)
  assert.match(st, /請先在設定（齒輪圖標）/)
  assert.match(st, /✓ 已匯出 ' \+ fmt/)
})

test('FISHING60 store/3MF Formal 檔案／匯出 STEP', () => {
  const st = read('src/store.ts')
  const mf = read('src/io/threeMfImport.ts')
  assert.match(st, /檔案預設密度/)
  assert.match(st, /空白檔案/)
  assert.match(st, /打開新檔案/)
  assert.match(st, /再匯出 STEP/)
  assert.match(mf, /此 3MF 檔案無法解析/)
  assert.match(mf, /模型檔案/)
  assert.doesNotMatch(st, /空白文件/)
  assert.doesNotMatch(st, /再導出 STEP/)
})

test('FISHING60 MATERIALS / DENSITY_PREF stay SC', () => {
  const st = read('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
})
