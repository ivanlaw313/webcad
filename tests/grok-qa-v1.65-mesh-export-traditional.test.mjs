/**
 * v1.65: MESH / UTILITIES export labels + File menu Export → Traditional Chinese (HK).
 * 導出STL／導出STEP／導出裝配*／導出glTF… + File ▾ 導出 STL／導出裝配 STL／導出視圖 PNG
 * Keep MESH insert SC pin, DRAWING/SKETCH/illegal/SELECT/SHEET/Shell-bake/ZH/construct.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tLabel } from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const featureStatus = readFileSync(new URL('../src/ui/featureStatus.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.65+', () => {
  assert.match(version, /APP_VERSION = '1\.(6[5-9]|[7-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.65: MESH EXPORT + UTILITIES MAKE labels Traditional', () => {
  // No remaining Simplified ribbon export labels
  assert.doesNotMatch(ribbon, /label: '导出/)
  assert.match(ribbon, /id: 'exportstl', label: '導出STL'/)
  assert.match(ribbon, /id: 'exportstep', label: '導出STEP'/)
  assert.match(ribbon, /id: 'exportglb', label: '導出glTF\/GLB'/)
  assert.match(ribbon, /id: 'exportglb', label: '導出glTF'/)
  assert.match(ribbon, /id: 'exportobj', label: '導出OBJ'/)
  assert.match(ribbon, /id: 'export3mf', label: '導出3MF'/)
  assert.match(ribbon, /id: 'exportasmstl', label: '導出裝配STL'/)
  assert.match(ribbon, /id: 'exportasmobj', label: '導出裝配OBJ'/)
  assert.match(ribbon, /id: 'exportasm3mf', label: '導出裝配3MF'/)
  assert.match(ribbon, /id: 'exportasmstep', label: '導出裝配STEP'/)
  // SHEET EXPORT still Traditional (v1.62)
  assert.match(ribbon, /id: 'exportflatdxf', label: '導出展開DXF'/)
})

test('v1.65: File menu Export rows Traditional', () => {
  assert.match(ribbonUi, /: '導出 STL'/)
  assert.match(ribbonUi, /: '導出 STEP'/)
  assert.match(ribbonUi, /: '導出 3MF'/)
  assert.match(ribbonUi, /: '導出 OBJ'/)
  assert.match(ribbonUi, /: '導出裝配 STL'/)
  assert.match(ribbonUi, /: '導出 glTF\/GLB'/)
  assert.match(ribbonUi, /: '導出視圖 PNG'/)
  assert.doesNotMatch(ribbonUi, /: '导出 STL'/)
  assert.doesNotMatch(ribbonUi, /: '导出装配 STL'/)
  assert.doesNotMatch(ribbonUi, /: '导出视图 PNG'/)
})

test('v1.65: EN_LABEL + tLabel for TC export keys', () => {
  assert.equal(tLabel('導出STL', 'en'), 'Export STL')
  assert.equal(tLabel('導出STEP', 'en'), 'Export STEP')
  assert.equal(tLabel('導出OBJ', 'en'), 'Export OBJ')
  assert.equal(tLabel('導出3MF', 'en'), 'Export 3MF')
  assert.equal(tLabel('導出glTF', 'en'), 'Export glTF')
  assert.equal(tLabel('導出glTF/GLB', 'en'), 'Export glTF/GLB')
  assert.equal(tLabel('導出裝配STL', 'en'), 'Export Assembly STL')
  assert.equal(tLabel('導出裝配STEP', 'en'), 'Export Assembly STEP')
  assert.equal(tLabel('導出裝配3MF', 'en'), 'Export Assembly 3MF')
  assert.equal(tLabel('導出裝配OBJ', 'en'), 'Export Assembly OBJ')
  assert.equal(tLabel('導出 STL', 'en'), 'Export STL')
  assert.equal(tLabel('導出裝配 STL', 'en'), 'Export Assembly STL')
  assert.equal(tLabel('導出視圖 PNG', 'en'), 'Export View PNG')
  // legacy SC retained
  assert.equal(tLabel('导出STL', 'en'), 'Export STL')
  assert.equal(tLabel('导出装配STL', 'en'), 'Export Assembly STL')
  assert.match(i18n, /'導出裝配STL': 'Export Assembly STL'/)
  assert.match(i18n, /EXPORT: '導出'/)
})

test('prior TC + MESH SC pin + construct retained', () => {
  assert.match(ribbon, /id: 'insertmesh', label: '插入STL网格'/)
  assert.match(ribbon, /id: 'select', label: '選擇'/)
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.match(ribbon, /id: 'params', label: '參數'/)
  assert.match(ribbon, /id: 'newbody', label: '新實體'/)
  assert.match(ribbon, /id: 'bodyboolean', label: '實體布爾'/)
  assert.match(ribbon, /id: 'offsetsolid', label: '整體偏移'/)
  assert.match(ribbon, /id: 'datumgeom', label: '構造幾何'/)
  assert.match(ribbon, /id: 'sk_polyline', label: '直線'/)
  assert.match(drawing, /裝配工程圖 — 三視圖/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(i18n, /CREATE: '建立'/)
  assert.match(i18n, /SOLID: '實體'/)
  assert.match(store, /label: '烘焙為零件實體'/)
  assert.match(featureStatus, /已抽殼 壁厚/)
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
})
