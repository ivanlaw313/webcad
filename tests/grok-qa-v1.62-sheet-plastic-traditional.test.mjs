/**
 * v1.62: SHEET METAL / PLASTIC ribbon Traditional Chinese (HK).
 * 鈑金件／薄板/法蘭／導出展開DXF／加強筋／選擇 — not Simplified.
 * Keep DRAWING/SKETCH/illegal/MESH SC pins / ZH_GROUP/ZH_TAB / 裝配工程圖.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

function sheetBlock(src) {
  const i = src.indexOf('const SHEET:')
  assert.ok(i >= 0, 'SHEET missing')
  const j = src.indexOf('const PLASTIC:', i)
  assert.ok(j > i, 'PLASTIC after SHEET missing')
  return src.slice(i, j)
}

function plasticBlock(src) {
  const i = src.indexOf('const PLASTIC:')
  assert.ok(i >= 0, 'PLASTIC missing')
  const j = src.indexOf('const MANAGE:', i)
  assert.ok(j > i, 'MANAGE after PLASTIC missing')
  return src.slice(i, j)
}

function zhGroupBlock(src) {
  const i = src.indexOf('const ZH_GROUP')
  const j = src.indexOf('const ZH_TAB', i)
  return src.slice(i, j)
}

function zhTabBlock(src) {
  const i = src.indexOf('const ZH_TAB')
  const j = src.indexOf('export function tGroup', i)
  return src.slice(i, j)
}

test('APP_VERSION is 1.62+', () => {
  assert.match(version, /APP_VERSION = '1\.(6[2-9]|[7-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.62: SHEET METAL ribbon Traditional (鈑金件／法蘭／導出展開／選擇)', () => {
  const block = sheetBlock(ribbon)
  assert.match(block, /id: 'sheetmetal', label: '鈑金件'/)
  assert.match(block, /id: 'extrude', label: '薄板\/法蘭\(拉伸\)'/)
  assert.match(block, /id: 'exportflatdxf', label: '導出展開DXF'/)
  assert.match(block, /id: 'exportstep', label: '導出STEP'/)
  assert.match(block, /id: 'exportstl', label: '導出STL'/)
  assert.match(block, /id: 'select', label: '選擇'/)
  assert.match(block, /tip: '選擇工具/)
  assert.match(block, /把鈑金件展開成平料/)
  assert.doesNotMatch(block, /id: 'sheetmetal', label: '钣金件'/)
  assert.doesNotMatch(block, /id: 'extrude', label: '薄板\/法兰\(拉伸\)'/)
  assert.doesNotMatch(block, /id: 'exportflatdxf', label: '导出展开DXF'/)
  assert.doesNotMatch(block, /id: 'select', label: '选择'/)
})

test('v1.62: PLASTIC ribbon Traditional (加強筋／選擇)', () => {
  const block = plasticBlock(ribbon)
  assert.match(block, /id: 'rib', label: '加強筋'/)
  assert.match(block, /id: 'select', label: '選擇'/)
  assert.match(block, /tip: '選擇工具/)
  assert.doesNotMatch(block, /id: 'rib', label: '加强筋'/)
  assert.doesNotMatch(block, /id: 'select', label: '选择'/)
})

test('v1.62: companion Timeline / BrowserTree / FD_TITLE / EN_LABEL', () => {
  assert.match(timeline, /sheetmetal: \{ icon: 'sheetmetal', label: '鈑金件'/)
  assert.match(timeline, /rib: \{ icon: 'rib', label: '加強筋'/)
  assert.match(browser, /sheetmetal: \{ icon: 'default', label: '鈑金件'/)
  assert.match(browser, /rib: \{ icon: 'default', label: '加強筋'/)
  assert.match(viewport, /sheetmetal: '鈑金件'/)
  assert.match(viewport, /rib: '加強筋\/腹板'/)
  assert.match(i18n, /'鈑金件': 'Sheet Metal'/)
  assert.match(i18n, /'薄板\/法蘭\(拉伸\)': 'Flange \(Extrude\)'/)
  assert.match(i18n, /'導出展開DXF': 'Export Flat DXF'/)
  assert.match(i18n, /'加強筋': 'Rib'/)
  // legacy SC EN_LABEL retained
  assert.match(i18n, /'钣金件': 'Sheet Metal'/)
  assert.match(i18n, /'加强筋': 'Rib'/)
  assert.match(i18n, /'薄板\/法兰\(拉伸\)': 'Flange \(Extrude\)'/)
})

test('no regress: DRAWING / SKETCH / illegal / MESH SC / ZH chrome / 裝配工程圖', () => {
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.match(ribbon, /id: 'asmdrawing', label: '裝配工程圖'/)
  assert.match(ribbon, /id: 'sketch', label: '建立草圖'/)
  assert.match(ribbon, /id: 'sk_polyline', label: '直線'/)
  assert.match(ribbon, /id: 'reversesurf', label: '翻轉曲面'/)
  assert.match(ribbon, /id: 'revolve', label: '旋轉'/)
  assert.match(ribbon, /id: 'sweep', label: '掃掠'/)
  assert.match(ribbon, /insertmesh.*插入STL网格/)
  assert.match(ribbonUi, /完成草圖/)
  assert.match(ribbonUi, /裝配工程圖 \+ BOM/)
  assert.match(drawing, /front: '前視圖'/)
  assert.match(drawing, /裝配工程圖 — 三視圖/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile/)
  const zg = zhGroupBlock(i18n)
  assert.match(zg, /CREATE: '建立'/)
  assert.match(zg, /CONSTRUCT: '構造'/)
  assert.match(zg, /SELECT: '選擇'/)
  const zt = zhTabBlock(i18n)
  assert.match(zt, /SOLID: '實體'/)
  assert.match(zt, /MESH: '網格'/)
  assert.match(zt, /'SHEET METAL': '鈑金'/)
})
