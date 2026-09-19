/**
 * v1.60: 裝配工程圖 discoverable via mouse/icons — close BUG-BD-5601.
 * Root cause @ v1.58: modal head only shows 裝配工程圖 when drawingKind==='assembly';
 * DRAWING ribbon had only 工程圖; BOT-D (icons only) never saw the assembly path.
 * Fix: ribbon asmdrawing + modal kind tabs always show 裝配工程圖; TC status strings.
 * Keep part DRAWING modal TC, SKETCH, 翻轉曲面, illegal, MESH SC pins.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../src/components/CommandPalette.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')

function sketchPanelsBlock(src) {
  const i = src.indexOf('export const SKETCH_PANELS')
  assert.ok(i >= 0, 'SKETCH_PANELS missing')
  const j = src.indexOf('export const WORKSPACES', i)
  assert.ok(j > i, 'WORKSPACES after SKETCH_PANELS missing')
  return src.slice(i, j)
}

function drawingPanelBlock(src) {
  const i = src.indexOf("{ name: 'DRAWING'")
  assert.ok(i >= 0, 'DRAWING panel missing')
  const j = src.indexOf(']', i)
  return src.slice(i, j + 1)
}

test('APP_VERSION is 1.60+', () => {
  assert.match(version, /APP_VERSION = '1\.(6\d|[7-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.60: DRAWING ribbon exposes 裝配工程圖 icon', () => {
  const block = drawingPanelBlock(ribbon)
  assert.match(block, /id: 'drawing', label: '工程圖'/)
  assert.match(block, /id: 'asmdrawing', label: '裝配工程圖'/)
  assert.doesNotMatch(block, /装配工程图/)
  assert.match(store, /case 'asmdrawing': return void get\(\)\.generateAsmDrawing\(\)/)
  assert.match(palette, /asmdrawing:/)
  assert.match(ribbonUi, /裝配工程圖 \+ BOM/)
})

test('v1.60: modal always shows 裝配工程圖 kind tab', () => {
  assert.match(drawing, /tStatus\('裝配工程圖', lang\)/)
  assert.match(drawing, /generateAsmDrawing/)
  assert.match(drawing, /role=\"tablist\"/)
  assert.match(drawing, /裝配工程圖 — 三視圖 \+ 氣泡 BOM/)
  assert.match(drawing, /工程圖 — 三視圖 \+ 立體圖/)
  assert.match(drawing, /front: '前視圖'/)
  assert.match(drawing, /top: '俯視圖'/)
  assert.match(drawing, /right: '右視圖'/)
})

test('v1.60: assembly drawing status strings Traditional', () => {
  assert.match(store, /裝配工程圖：冇可見組件/)
  assert.match(store, /正在生成裝配工程圖/)
  assert.match(store, /裝配工程圖生成失敗/)
  assert.match(store, /已生成裝配工程圖/)
  assert.doesNotMatch(store, /status: '装配工程图：冇可见组件/)
  assert.doesNotMatch(store, /正在生成装配工程图/)
  assert.match(i18n, /裝配工程圖：冇可見組件/)
  assert.match(i18n, /裝配工程圖生成失敗/)
})

test('no regress: SKETCH / part DRAWING / 翻轉曲面 / illegal / MESH SC pins', () => {
  const block = sketchPanelsBlock(ribbon)
  assert.match(block, /id: 'sk_polyline', label: '直線'/)
  assert.match(block, /id: 'sk_circle', label: '圓'/)
  assert.match(ribbonUi, /完成草圖/)
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.match(ribbon, /id: 'reversesurf', label: '翻轉曲面'/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(ribbon, /id: 'sketch', label: '建立草圖'/)
  assert.match(ribbon, /id: 'createform', label: '建立造型'/)
  assert.match(ribbon, /id: 'revolve', label: '旋轉'/)
  assert.match(ribbon, /id: 'sweep', label: '掃掠'/)
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile/)
  assert.match(viewport, /form-create-plane-hint/)
  assert.match(ribbon, /insertmesh.*插入STL网格/)
})
