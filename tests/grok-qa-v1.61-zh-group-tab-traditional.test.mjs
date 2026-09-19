/**
 * v1.61: ZH_GROUP / ZH_TAB chrome Traditional Chinese (HK) — deferred from V160.
 * 创建→建立, 构造→構造, 选择→選擇, 导出→導出, 参数→參數, 制造→製造,
 * 实体→實體, 网格→網格, 钣金→鈑金.
 * Keep DRAWING/SKETCH/illegal/MESH SC pins / SOLID CREATE residual / 裝配工程圖.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

function zhGroupBlock(src) {
  const i = src.indexOf('const ZH_GROUP')
  assert.ok(i >= 0, 'ZH_GROUP missing')
  const j = src.indexOf('const ZH_TAB', i)
  assert.ok(j > i, 'ZH_TAB after ZH_GROUP missing')
  return src.slice(i, j)
}

function zhTabBlock(src) {
  const i = src.indexOf('const ZH_TAB')
  assert.ok(i >= 0, 'ZH_TAB missing')
  const j = src.indexOf('export function tGroup', i)
  assert.ok(j > i, 'tGroup after ZH_TAB missing')
  return src.slice(i, j)
}

test('APP_VERSION is 1.61+', () => {
  assert.match(version, /APP_VERSION = '1\.(6[1-9]|[7-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.61: ZH_GROUP chrome Traditional (建立／構造／選擇／導出／參數／製造)', () => {
  const block = zhGroupBlock(i18n)
  assert.match(block, /CREATE: '建立'/)
  assert.match(block, /CONSTRUCT: '構造'/)
  assert.match(block, /SELECT: '選擇'/)
  assert.match(block, /EXPORT: '導出'/)
  assert.match(block, /PARAMETERS: '參數'/)
  assert.match(block, /MAKE: '製造'/)
  assert.match(block, /DRAWING: '工程圖'/)
  assert.match(block, /CONSTRAINTS: '約束'/)
  assert.match(block, /INSPECT: '檢查'/)
  assert.match(block, /ASSEMBLE: '裝配'/)
  assert.match(block, /SYMMETRY: '對稱'/)
  // must NOT keep Simplified orthography on group chrome
  assert.doesNotMatch(block, /CREATE: '创建'/)
  assert.doesNotMatch(block, /CONSTRUCT: '构造'/)
  assert.doesNotMatch(block, /SELECT: '选择'/)
  assert.doesNotMatch(block, /EXPORT: '导出'/)
  assert.doesNotMatch(block, /PARAMETERS: '参数'/)
  assert.doesNotMatch(block, /MAKE: '制造'/)
})

test('v1.61: ZH_TAB chrome Traditional (實體／網格／鈑金)', () => {
  const block = zhTabBlock(i18n)
  assert.match(block, /SOLID: '實體'/)
  assert.match(block, /MESH: '網格'/)
  assert.match(block, /'SHEET METAL': '鈑金'/)
  assert.match(block, /FORM: '造型'/)
  assert.doesNotMatch(block, /SOLID: '实体'/)
  assert.doesNotMatch(block, /MESH: '网格'/)
  assert.doesNotMatch(block, /'SHEET METAL': '钣金'/)
})

test('no regress: DRAWING / SKETCH / illegal / MESH SC / SOLID residual / 裝配工程圖', () => {
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.match(ribbon, /id: 'asmdrawing', label: '裝配工程圖'/)
  assert.match(ribbon, /id: 'sketch', label: '建立草圖'/)
  assert.match(ribbon, /id: 'sk_polyline', label: '直線'/)
  assert.match(ribbon, /id: 'reversesurf', label: '翻轉曲面'/)
  assert.match(ribbon, /id: 'revolve', label: '旋轉'/)
  assert.match(ribbon, /id: 'sweep', label: '掃掠'/)
  assert.match(ribbon, /id: 'createform', label: '建立造型'/)
  assert.match(ribbon, /insertmesh.*插入STL网格/)
  assert.match(ribbonUi, /完成草圖/)
  assert.match(ribbonUi, /裝配工程圖 \+ BOM/)
  assert.match(drawing, /front: '前視圖'/)
  assert.match(drawing, /裝配工程圖 — 三視圖/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile/)
  assert.match(viewport, /form-create-plane-hint/)
  assert.match(i18n, /'对称': 'Symmetric'/)
})
