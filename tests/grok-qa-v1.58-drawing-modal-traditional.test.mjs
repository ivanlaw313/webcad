/**
 * v1.58: DRAWING modal Traditional Chinese (HK) — BUG-BD-5601.
 * Modal head + view labels: 裝配工程圖／三視圖／前視圖／俯視圖／右視圖 — not Simplified.
 * Keep SKETCH TC (v1.57), DRAWING ribbon 工程圖 (v1.56), 翻轉曲面, illegal, MESH SC pins.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const intro = readFileSync(new URL('../src/components/IntroCard.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')

function sketchPanelsBlock(src) {
  const i = src.indexOf('export const SKETCH_PANELS')
  assert.ok(i >= 0, 'SKETCH_PANELS missing')
  const j = src.indexOf('export const WORKSPACES', i)
  assert.ok(j > i, 'WORKSPACES after SKETCH_PANELS missing')
  return src.slice(i, j)
}

test('APP_VERSION is 1.58+', () => {
  assert.match(version, /APP_VERSION = '1\.(5[89]|[6-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.58: DRAWING modal LABEL + head Traditional', () => {
  assert.match(drawing, /front: '前視圖'/)
  assert.match(drawing, /top: '俯視圖'/)
  assert.match(drawing, /right: '右視圖'/)
  assert.match(drawing, /iso: '立體圖 \(參考\)'/)
  assert.match(drawing, /section: '剖視圖 A—A'/)
  assert.doesNotMatch(drawing, /front: '前视图'/)
  assert.doesNotMatch(drawing, /top: '俯视图'/)
  assert.doesNotMatch(drawing, /right: '右视图'/)
  assert.match(drawing, /裝配工程圖 — 三視圖 \+ 氣泡 BOM/)
  assert.match(drawing, /工程圖 — 三視圖 \+ 立體圖/)
  assert.doesNotMatch(drawing, /装配工程图 — 三视图/)
  assert.doesNotMatch(drawing, /工程图 — 三视图 \+ 立体图/)
})

test('v1.58: File menu + IntroCard 三視圖', () => {
  assert.match(ribbonUi, /工程圖（三視圖）/)
  assert.doesNotMatch(ribbonUi, /工程圖（三视图）/)
  assert.match(intro, /三視圖/)
  assert.doesNotMatch(intro, /出三视图/)
  assert.match(i18n, /'前視圖': 'Front View'/)
  assert.match(i18n, /裝配工程圖 — 三視圖 \+ 氣泡 BOM/)
})

test('v1.57 SKETCH + v1.56 DRAWING ribbon + prior TC retained', () => {
  const block = sketchPanelsBlock(ribbon)
  assert.match(block, /id: 'sk_polyline', label: '直線'/)
  assert.match(block, /id: 'sk_circle', label: '圓'/)
  assert.match(block, /id: 'sk_mirrory', label: '鏡像'/)
  assert.match(block, /id: 'sk_array', label: '陣列'/)
  assert.match(block, /id: 'sk_select', label: '選擇'/)
  assert.match(ribbonUi, /完成草圖/)
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.match(ribbon, /id: 'reversesurf', label: '翻轉曲面'/)
  assert.match(ribbon, /id: 'measureuni', label: '測量'/)
  assert.match(ribbon, /id: 'interference', label: '干涉檢查'/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(ribbon, /id: 'sketch', label: '建立草圖'/)
  assert.match(ribbon, /id: 'createform', label: '建立造型'/)
  assert.match(i18n, /'对称': 'Symmetric'/)
})

test('no MESH / Form plane / Finish soft-lock regression', () => {
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile/)
  assert.match(store, /placeFormBoxOnOriginPlane/)
  assert.match(viewport, /form-create-plane-hint/)
  assert.match(viewport, /lang !== 'en' \? '完成造型' : 'Finish Form'/)
  assert.match(ribbon, /insertmesh.*插入STL网格/)
})
