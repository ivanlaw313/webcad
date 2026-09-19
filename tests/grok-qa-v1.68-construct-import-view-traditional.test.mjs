/**
 * v1.68: Construct residual + CREATE thread + INSERT DXF/SVG + LAB cone/explode/scale/3D列印
 * ribbon/dialog/tree labels → Traditional Chinese (HK). SW CACHE → webcad-v1.68.
 * Prefer labels — not Help encyclopedias. LAB tools stay under 實驗室.
 * Retain MESH SC pin, DRAWING/SKETCH/illegal/SELECT/導出 STL/Shell-bake/Boolean help/LAB gear/ZH/construct body.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tLabel, tStatus } from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const featureStatus = readFileSync(new URL('../src/ui/featureStatus.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.68+', () => {
  assert.match(version, /APP_VERSION = '1\.(6[8-9]|[7-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.68: SW CACHE bumped to webcad-v1.68; navigate network-first; release comment', () => {
  assert.match(sw, /const CACHE = 'webcad-v1\.68'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.67'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1'/)
  assert.match(sw, /RELEASE: CACHE 必须随每次发版改名|RELEASE: CACHE 必須隨每次發版改名/)
  assert.match(sw, /mode === 'navigate'/)
  assert.match(sw, /network-first|永远攞最新|永遠攞最新/)
})

test('v1.68: ribbon construct residual + thread + import labels Traditional', () => {
  assert.match(ribbon, /id: 'thread', label: '螺紋桿'/)
  assert.match(ribbon, /id: 'ucs', label: '用戶坐標系'/)
  assert.match(ribbon, /id: 'axiscyl', label: '圓柱／圓錐／環面軸'/)
  assert.match(ribbon, /id: 'pointvertex', label: '頂點構造點'/)
  assert.match(ribbon, /id: 'importdxf', label: '導入DXF'/)
  assert.match(ribbon, /id: 'importsvg', label: '導入SVG'/)
  assert.doesNotMatch(ribbon, /id: 'thread', label: '螺纹杆'/)
  assert.doesNotMatch(ribbon, /id: 'ucs', label: '用户坐标系'/)
  assert.doesNotMatch(ribbon, /id: 'axiscyl', label: '圆柱／圆锥／环面轴'/)
  assert.doesNotMatch(ribbon, /id: 'pointvertex', label: '顶点构造点'/)
  assert.doesNotMatch(ribbon, /id: 'importdxf', label: '导入DXF'/)
  assert.doesNotMatch(ribbon, /id: 'importsvg', label: '导入SVG'/)
})

test('v1.68: LAB panel 3D列印 + cone/explode/scaleasm Traditional (stay under 實驗室)', () => {
  assert.match(ribbon, /name: '3D列印'/)
  assert.match(ribbon, /id: 'cone', label: '圓錐'/)
  assert.match(ribbon, /id: 'explodeview', label: '爆炸視圖'/)
  assert.match(ribbon, /id: 'scaleasm', label: '整體縮放'/)
  assert.doesNotMatch(ribbon, /name: '3D打印'/)
  assert.doesNotMatch(ribbon, /id: 'cone', label: '圆锥'/)
  assert.doesNotMatch(ribbon, /id: 'explodeview', label: '爆炸视图'/)
  assert.doesNotMatch(ribbon, /id: 'scaleasm', label: '整体缩放'/)
  // LAB tools stay under 實驗室 workspace
  const labStart = ribbon.indexOf("// 🧪實驗室")
  const labEnd = ribbon.indexOf("'🧪實驗室': { id: '🧪實驗室'")
  assert.ok(labStart >= 0 && labEnd > labStart)
  const labBlock = ribbon.slice(labStart, labEnd)
  assert.match(labBlock, /name: '3D列印'/)
  assert.match(labBlock, /id: 'cone', label: '圓錐'/)
  assert.match(labBlock, /id: 'explodeview', label: '爆炸視圖'/)
  assert.match(labBlock, /id: 'scaleasm', label: '整體縮放'/)
})

test('v1.68: Timeline + BrowserTree + Viewport chrome Traditional', () => {
  assert.match(timeline, /thread: \{ icon: 'thread', label: '螺紋桿'/)
  assert.match(browser, /thread: \{ icon: 'default', label: '螺紋桿'/)
  assert.match(viewport, /cone: '圓錐\/圓台'/)
  assert.match(viewport, /thread: '螺紋桿'/)
  assert.match(viewport, /tStatus\('爆炸視圖', lang\)/)
  assert.doesNotMatch(timeline, /thread: \{ icon: 'thread', label: '螺纹杆'/)
  assert.doesNotMatch(viewport, /cone: '圆锥\/圆台'/)
  assert.doesNotMatch(viewport, /tStatus\('爆炸视图', lang\)/)
})

test('v1.68: EN_LABEL + tLabel / tStatus for TC keys; legacy SC retained', () => {
  assert.equal(tLabel('螺紋桿', 'en'), 'Threaded Rod')
  assert.equal(tLabel('用戶坐標系', 'en'), 'User Coordinate System')
  assert.equal(tLabel('圓柱／圓錐／環面軸', 'en'), 'Axis Through Cylinder/Cone/Torus')
  assert.equal(tLabel('頂點構造點', 'en'), 'Point At Vertex')
  assert.equal(tLabel('導入DXF', 'en'), 'Import DXF')
  assert.equal(tLabel('導入SVG', 'en'), 'Import SVG')
  assert.equal(tLabel('圓錐', 'en'), 'Cone')
  assert.equal(tLabel('爆炸視圖', 'en'), 'Exploded View')
  assert.equal(tLabel('整體縮放', 'en'), 'Scale')
  assert.equal(tLabel('3D列印', 'en'), '3D Print')
  // legacy SC retained
  assert.equal(tLabel('螺纹杆', 'en'), 'Threaded Rod')
  assert.equal(tLabel('用户坐标系', 'en'), 'User Coordinate System')
  assert.equal(tLabel('导入DXF', 'en'), 'Import DXF')
  assert.equal(tLabel('圆锥', 'en'), 'Cone')
  assert.equal(tLabel('爆炸视图', 'en'), 'Explode')
  assert.equal(tLabel('整体缩放', 'en'), 'Scale')
  assert.match(i18n, /'螺紋桿': 'Threaded Rod'/)
  assert.match(i18n, /'爆炸視圖': 'Exploded View'/)
  // STATUS_PHRASES_X: explode dlg title translates in EN
  assert.equal(tStatus('爆炸視圖', 'en'), 'Exploded View')
  assert.equal(tStatus('圓錐/圓台', 'en'), 'Cone / Frustum')
})

test('Do not regress prior TC + MESH SC pin + LAB gear + Boolean help + construct body', () => {
  assert.match(ribbon, /id: 'insertmesh', label: '插入STL网格'/)
  assert.match(ribbon, /id: 'exportstl', label: '導出STL'/)
  assert.match(ribbon, /id: 'select', label: '選擇'/)
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.match(ribbon, /id: 'asmdrawing', label: '裝配工程圖'/)
  assert.match(ribbon, /id: 'sk_polyline', label: '直線'/)
  assert.match(ribbon, /id: 'datumgeom', label: '構造幾何'/)
  assert.match(ribbon, /id: 'newbody', label: '新實體'/)
  assert.match(ribbon, /id: 'gear', label: '齒輪'/)
  assert.match(drawing, /裝配工程圖 — 三視圖/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(i18n, /CREATE: '建立'/)
  assert.match(i18n, /CONSTRUCT: '構造'/)
  assert.match(i18n, /SOLID: '實體'/)
  assert.match(store, /label: '烘焙為零件實體'/)
  assert.match(featureStatus, /已抽殼 壁厚/)
  assert.match(featureStatus, /已實體布爾：活動實體|時間軸可改/)
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  // LAB workspace still exists; gear under 實驗室
  assert.match(ribbon, /'🧪實驗室': \{ id: '🧪實驗室'/)
  const labStart = ribbon.indexOf("// 🧪實驗室")
  const labEnd = ribbon.indexOf("'🧪實驗室': { id: '🧪實驗室'")
  const labBlock = ribbon.slice(labStart, labEnd)
  assert.match(labBlock, /id: 'gear', label: '齒輪'/)
})
