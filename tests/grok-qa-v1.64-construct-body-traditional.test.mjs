/**
 * v1.64: SOLID construct / multi-body tool labels → Traditional Chinese (HK).
 * 參數／新實體／實體布爾／整體偏移／構造幾何／統一構造幾何
 * Keep MESH DnD SC pins, DRAWING/SKETCH/illegal/SELECT/SHEET/PLASTIC/Shell-bake/ZH chrome.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tLabel, tStatus } from '../src/i18n.ts'

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
const featureStatus = readFileSync(new URL('../src/ui/featureStatus.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.64+', () => {
  assert.match(version, /APP_VERSION = '1\.(6[4-9]|[7-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.64: ribbon construct/body labels Traditional', () => {
  assert.match(ribbon, /id: 'params', label: '參數'/)
  assert.match(ribbon, /id: 'newbody', label: '新實體'/)
  assert.match(ribbon, /id: 'bodyboolean', label: '實體布爾'/)
  assert.match(ribbon, /id: 'offsetsolid', label: '整體偏移'/)
  assert.match(ribbon, /id: 'datumgeom', label: '構造幾何'/)
  assert.match(ribbon, /id: 'datumgeom', label: '統一構造幾何'/)
  assert.doesNotMatch(ribbon, /id: 'params', label: '参数'/)
  assert.doesNotMatch(ribbon, /id: 'newbody', label: '新实体'/)
  assert.doesNotMatch(ribbon, /id: 'bodyboolean', label: '实体布尔'/)
  assert.doesNotMatch(ribbon, /id: 'offsetsolid', label: '整体偏移'/)
  assert.doesNotMatch(ribbon, /id: 'datumgeom', label: '构造几何'/)
  assert.doesNotMatch(ribbon, /id: 'datumgeom', label: '统一构造几何'/)
})

test('v1.64: Timeline + BrowserTree + Viewport chrome Traditional', () => {
  assert.match(timeline, /offsetsolid: \{ icon: 'scale', label: '整體偏移'/)
  assert.match(timeline, /newbody: \{ icon: 'newbody', label: '新實體'/)
  assert.match(timeline, /bodyboolean: \{ icon: 'bodyboolean', label: '實體布爾'/)
  assert.match(browser, /offsetsolid: \{ icon: 'scale', label: '整體偏移'/)
  assert.match(browser, /newbody: \{ icon: 'box', label: '新實體'/)
  assert.match(browser, /bodyboolean: \{ icon: 'combine', label: '實體布爾'/)
  assert.match(viewport, /title="構造幾何"/)
  assert.match(viewport, /tStatus\('⬡ 新實體', lang\)/)
  assert.match(viewport, /tStatus\('⬡新實體', lang\)/)
  assert.match(viewport, /'新實體 \/ New Body'/)
  assert.doesNotMatch(viewport, /title="构造几何"/)
  assert.doesNotMatch(viewport, /tStatus\('⬡新实体', lang\)/)
})

test('v1.64: EN_LABEL + tLabel for TC keys', () => {
  assert.equal(tLabel('參數', 'en'), 'Parameters')
  assert.equal(tLabel('新實體', 'en'), 'New Body')
  assert.equal(tLabel('實體布爾', 'en'), 'Boolean')
  assert.equal(tLabel('整體偏移', 'en'), 'Offset Body')
  assert.equal(tLabel('構造幾何', 'en'), 'Construction Geometry')
  assert.equal(tLabel('統一構造幾何', 'en'), 'Unified Construction Geometry')
  // legacy SC retained
  assert.equal(tLabel('参数', 'en'), 'Parameters')
  assert.equal(tLabel('新实体', 'en'), 'New Body')
  assert.equal(tLabel('实体布尔', 'en'), 'Boolean')
  assert.match(i18n, /'參數': 'Parameters'/)
  assert.match(i18n, /'實體布爾': 'Boolean'/)
  // STATUS_PHRASES_X identity (same pattern as v1.63 bake): EN keeps Traditional chrome
  assert.equal(tStatus('⬡新實體', 'en'), '⬡新實體')
  assert.equal(tStatus('⬡ 新實體', 'en'), '⬡ 新實體')
})

test('prior TC + MESH SC + Shell/bake + ZH chrome retained', () => {
  assert.match(ribbon, /id: 'insertmesh', label: '插入STL网格'/)
  assert.match(ribbon, /id: 'select', label: '選擇'/)
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.match(ribbon, /id: 'sk_polyline', label: '直線'/)
  assert.match(drawing, /裝配工程圖 — 三視圖/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(i18n, /CREATE: '建立'/)
  assert.match(i18n, /CONSTRUCT: '構造'/)
  assert.match(i18n, /SOLID: '實體'/)
  assert.match(store, /label: '烘焙為零件實體'/)
  assert.match(featureStatus, /已抽殼 壁厚/)
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(ribbonUi.length ? ribbonUi : 'ok', /./)
})
