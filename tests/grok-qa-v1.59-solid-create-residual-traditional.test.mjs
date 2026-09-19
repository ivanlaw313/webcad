/**
 * v1.59: SOLID CREATE residual Traditional Chinese (HK).
 * 旋轉／掃掠／放樣／鏡像／陣列 (+ 矩形／環形／幾何／路徑陣列) — not Simplified.
 * Keep SKETCH TC, DRAWING modal TC, 翻轉曲面, illegal, MESH SC pins.
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

function solidCreateBlock(src) {
  const i = src.indexOf("const SOLID: Panel[]")
  assert.ok(i >= 0, 'SOLID missing')
  const j = src.indexOf("const SURFACE:", i)
  assert.ok(j > i, 'SURFACE after SOLID missing')
  return src.slice(i, j)
}

test('APP_VERSION is 1.59+', () => {
  assert.match(version, /APP_VERSION = '1\.(59|[6-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.59: SOLID CREATE residual Traditional (旋轉／掃掠／放樣／鏡像／陣列)', () => {
  const block = solidCreateBlock(ribbon)
  assert.match(block, /id: 'revolve', label: '旋轉'/)
  assert.match(block, /id: 'sweep', label: '掃掠'/)
  assert.match(block, /id: 'loft', label: '放樣'/)
  assert.match(block, /id: 'mirror', label: '鏡像'/)
  assert.match(block, /id: 'pattern', label: '陣列'/)
  assert.match(block, /id: 'pattern', label: '矩形陣列'/)
  assert.match(block, /id: 'circpattern', label: '環形陣列'/)
  assert.match(block, /id: 'geopattern', label: '幾何陣列'/)
  assert.match(block, /id: 'pathpattern', label: '路徑陣列'/)
  assert.doesNotMatch(block, /id: 'revolve', label: '旋转'/)
  assert.doesNotMatch(block, /id: 'sweep', label: '扫掠'/)
  assert.doesNotMatch(block, /id: 'mirror', label: '镜像'/)
  assert.doesNotMatch(block, /id: 'pattern', label: '阵列'/)
  assert.doesNotMatch(block, /id: 'pattern', label: '矩形阵列'/)
})

test('v1.59: FD_TITLE + Timeline + BrowserTree + EN_LABEL', () => {
  assert.match(viewport, /revolve: '旋轉'/)
  assert.match(viewport, /pattern: '矩形陣列'/)
  assert.match(viewport, /cpattern: '環形陣列'/)
  assert.match(viewport, /mirror: '鏡像'/)
  assert.match(timeline, /revolve: \{ icon: 'revolve', label: '旋轉'/)
  assert.match(timeline, /mirror: \{ icon: 'mirror', label: '鏡像'/)
  assert.match(timeline, /sweep: \{ icon: 'sweep', label: '掃掠'/)
  assert.match(browser, /revolve: \{ icon: 'revolve', label: '旋轉'/)
  assert.match(browser, /mirror: \{ icon: 'mirror', label: '鏡像'/)
  assert.match(browser, /featpattern: \{ icon: 'pattern', label: '陣列'/)
  assert.match(i18n, /'矩形陣列': 'Rect Pattern'/)
  assert.match(i18n, /'環形陣列': 'Circular Pattern'/)
  assert.match(i18n, /'幾何陣列': 'Geometric Pattern'/)
  assert.match(i18n, /'路徑陣列': 'Path Pattern'/)
  assert.match(i18n, /'掃掠\(拾邊\)': 'Sweep \(Pick Edge\)'/)
  // legacy SC EN_LABEL retained
  assert.match(i18n, /'旋转': 'Revolve'/)
  assert.match(i18n, /'镜像': 'Mirror'/)
})

test('prior TC + MESH SC pins retained', () => {
  assert.match(ribbon, /id: 'sketch', label: '建立草圖'/)
  assert.match(ribbon, /id: 'box', label: '長方體'/)
  assert.match(ribbon, /id: 'createform', label: '建立造型'/)
  assert.match(ribbon, /id: 'reversesurf', label: '翻轉曲面'/)
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.match(ribbon, /id: 'sk_polyline', label: '直線'/)
  assert.match(ribbon, /id: 'sk_mirrory', label: '鏡像'/)
  assert.match(drawing, /front: '前視圖'/)
  assert.match(drawing, /裝配工程圖 — 三視圖/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(i18n, /'对称': 'Symmetric'/)
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile/)
  assert.match(viewport, /lang !== 'en' \? '完成造型' : 'Finish Form'/)
  assert.match(ribbon, /id: 'insertmesh', label: '插入STL网格'/)
})
