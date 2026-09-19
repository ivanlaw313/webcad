/**
 * v1.70: INSERT canvas/decal + residual insert labels → Traditional Chinese (HK),
 * plus Solid@1.68 Boolean help leftovers (來源／工具體／網格布爾).
 * SW CACHE → webcad-v1.70. Prefer labels — not Help encyclopedias.
 * Retain MESH SC pin + prior TC pins. LAB tools stay under 實驗室.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tLabel, tStatus } from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const featureStatus = readFileSync(new URL('../src/ui/featureStatus.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.70+', () => {
  assert.match(version, /APP_VERSION = '1\.(7[0-9]|[8-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.70: SW CACHE bumped to webcad-v1.70+; navigate network-first; release comment', () => {
  assert.match(sw, /const CACHE = 'webcad-v1\.(7[0-9]|[8-9]\d)'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.69'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1'/)
  assert.match(sw, /RELEASE: CACHE 必须随每次发版改名|RELEASE: CACHE 必須隨每次發版改名/)
  assert.match(sw, /mode === 'navigate'/)
  assert.match(sw, /network-first|永远攞最新|永遠攞最新/)
})

test('v1.70: INSERT ribbon canvas/decal + residual labels Traditional (STL pin kept)', () => {
  assert.match(ribbon, /id: 'insertcomponent', label: '插入組件'/)
  assert.match(ribbon, /id: 'insertfastener', label: '插入緊固件'/)
  assert.match(ribbon, /id: 'insert3mf', label: '插入3MF網格'/)
  assert.match(ribbon, /id: 'insertobj', label: '插入OBJ網格'/)
  assert.match(ribbon, /id: 'insertcanvas', label: '畫布'/)
  assert.match(ribbon, /id: 'insertdecal', label: '貼花'/)
  assert.match(ribbon, /id: 'insertmesh', label: '插入STL网格'/)
  assert.doesNotMatch(ribbon, /id: 'insertcomponent', label: '插入组件'/)
  assert.doesNotMatch(ribbon, /id: 'insertcanvas', label: '画布'/)
  assert.doesNotMatch(ribbon, /id: 'insertdecal', label: '贴花'/)
  assert.doesNotMatch(ribbon, /id: 'insert3mf', label: '插入3MF网格'/)
})

test('v1.70: FastenerDialog + Viewport toolbar/FD + tree/timeline 貼花 Traditional', () => {
  assert.match(ribbonUi, /label\('插入緊固件', 'Insert Fastener'\)/)
  assert.doesNotMatch(ribbonUi, /label\('插入紧固件', 'Insert Fastener'\)/)
  assert.match(viewport, /🏷貼花/)
  assert.doesNotMatch(viewport, /🏷贴花/)
  assert.match(viewport, /cylpatch: '曲面貼花'/)
  assert.match(browser, /label: '曲面貼花'/)
  assert.match(timeline, /label: '曲面貼花'/)
})

test('v1.70: Boolean help leftovers — 來源／工具體／網格布爾', () => {
  const start = store.indexOf('componentBoolean: async')
  const end = store.indexOf('planeCutComponent: async')
  assert.ok(start >= 0 && end > start)
  const block = store.slice(start, end)
  assert.match(block, /來源體/)
  assert.match(block, /工具體/)
  assert.match(block, /組件布爾＝網格布爾（非零件時間軸）/)
  assert.match(block, /來源位置與關節保留/)
  assert.doesNotMatch(block, /工具 Body/)
  assert.doesNotMatch(block, /来源 Body/)
  assert.doesNotMatch(block, /網格結果（非零件時間軸）/)
  assert.doesNotMatch(block, /来源位置与关节保留/)
  assert.match(viewport, /來源「\$\{/)
  assert.doesNotMatch(viewport, /来源「\$\{/)
})

test('v1.70: EN_LABEL + tLabel / tStatus for INSERT TC keys; legacy SC retained', () => {
  assert.equal(tLabel('插入組件', 'en'), 'Insert Component')
  assert.equal(tLabel('插入緊固件', 'en'), 'Insert Fastener')
  assert.equal(tLabel('畫布', 'en'), 'Canvas')
  assert.equal(tLabel('貼花', 'en'), 'Decal')
  assert.equal(tLabel('插入3MF網格', 'en'), 'Insert 3MF')
  assert.equal(tLabel('插入OBJ網格', 'en'), 'Insert OBJ')
  assert.equal(tLabel('画布', 'en'), 'Canvas')
  assert.equal(tLabel('贴花', 'en'), 'Decal')
  assert.match(i18n, /'畫布': 'Canvas'/)
  assert.match(i18n, /'組件布爾＝網格布爾（非零件時間軸）/)
  assert.equal(tStatus('來源', 'en'), 'Source')
  assert.equal(tStatus('工具體', 'en'), 'Tool Body')
})

test('Do not regress prior TC + MESH SC pin + LAB gear + Boolean help + construct + INSERT pin', () => {
  assert.match(ribbon, /id: 'insertmesh', label: '插入STL网格'/)
  assert.match(ribbon, /id: 'exportstl', label: '導出STL'/)
  assert.match(ribbon, /id: 'select', label: '選擇'/)
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.match(ribbon, /id: 'asmdrawing', label: '裝配工程圖'/)
  assert.match(ribbon, /id: 'sk_polyline', label: '直線'/)
  assert.match(ribbon, /id: 'datumgeom', label: '構造幾何'/)
  assert.match(ribbon, /id: 'planemid', label: '中間平面'/)
  assert.match(ribbon, /id: 'gear', label: '齒輪'/)
  assert.match(ribbon, /id: 'thread', label: '螺紋桿'/)
  assert.match(ribbon, /id: 'ucs', label: '用戶坐標系'/)
  assert.match(ribbon, /id: 'importdxf', label: '導入DXF'/)
  assert.match(ribbon, /id: 'explodeview', label: '爆炸視圖'/)
  assert.match(ribbon, /name: '3D列印'/)
  assert.match(drawing, /裝配工程圖/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(i18n, /CREATE: '建立'/)
  assert.match(i18n, /CONSTRUCT: '構造'/)
  assert.match(store, /label: '烘焙為零件實體'/)
  assert.match(featureStatus, /已抽殼/)
  assert.match(featureStatus, /已實體布爾|時間軸可改/)
  assert.match(viewport, /manifold 網格布爾/)
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(ribbon, /'🧪實驗室': \{ id: '🧪實驗室'/)
  const labStart = ribbon.indexOf("// 🧪實驗室")
  const labEnd = ribbon.indexOf("'🧪實驗室': { id: '🧪實驗室'")
  const labBlock = ribbon.slice(labStart, labEnd)
  assert.match(labBlock, /id: 'gear', label: '齒輪'/)
  assert.match(labBlock, /name: '構造擴展'/)
})
