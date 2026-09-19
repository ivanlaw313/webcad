/**
 * v1.54: SURFACE ribbon Traditional Chinese (HK).
 * Continue BUG-BD-4801: 曲面放樣／規則曲面／補面／縫合 — not 曲面放样／规则曲面／补面／缝合.
 * Keep FORM/CREATE/MODIFY/ASSEMBLE/illegal TC, sketch 对称→Symmetric, MESH DnD / plane / Finish intact.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../src/components/CommandPalette.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')

function surfaceBlock(src) {
  const i = src.indexOf('const SURFACE: Panel[]')
  assert.ok(i >= 0, 'SURFACE missing')
  const j = src.indexOf('const MESH: Panel[]', i)
  assert.ok(j > i, 'MESH after SURFACE missing')
  return src.slice(i, j)
}

test('APP_VERSION is 1.54+', () => {
  assert.match(version, /APP_VERSION = '1\.(5[4-9]|[6-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.54: SURFACE CREATE Traditional labels', () => {
  const block = surfaceBlock(ribbon)
  for (const [id, label] of [
    ['surfloft', '曲面放樣'],
    ['ruled', '規則曲面'],
    ['surfsweep', '曲面掃掠'],
    ['surfrevolve', '曲面旋轉'],
    ['surfpatch', '補面 Patch'],
    ['surfbridge', '橋接面'],
    ['boundarypatch', '邊界補面'],
    ['thickenquilt', '加厚整張曲面'],
    ['reversesurf', '翻轉曲面'],
    ['rotateface', '旋轉面'],
    ['surfsew', '縫合 Stitch'],
    ['surfunstitch', '取消縫合'],
    ['untrim', '去裁/還原'],
    ['intersectcurve', '相交曲線'],
    ['clearintersect', '清相交曲線'],
    ['formcyl', 'Form 圓柱'],
    ['formtorus', 'Form 環面'],
    ['editpoles', '編輯曲面控制點'],
    ['revolve', '旋轉'],
    ['sweep', '掃掠'],
    ['loft', '放樣'],
    ['select', '選擇'],
  ]) {
    assert.match(block, new RegExp(`id: '${id}', label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))
  }
  assert.doesNotMatch(block, /id: 'surfloft', label: '曲面放样'/)
  assert.doesNotMatch(block, /id: 'ruled', label: '规则曲面'/)
  assert.doesNotMatch(block, /id: 'surfpatch', label: '补面 Patch'/)
  assert.doesNotMatch(block, /id: 'surfsew', label: '缝合 Stitch'/)
  assert.doesNotMatch(block, /id: 'reversesurf', label: '翻转曲面'/)
  assert.doesNotMatch(block, /id: 'editpoles', label: '编辑曲面控制点'/)
  assert.doesNotMatch(block, /id: 'select', label: '选择'/)
})

test('v1.54: EN_LABEL + palette SURFACE TC', () => {
  assert.match(i18n, /'曲面放樣': 'Surface Loft'/)
  assert.match(i18n, /'規則曲面': 'Ruled Surface'/)
  assert.match(i18n, /'補面 Patch': 'Patch'/)
  assert.match(i18n, /'縫合 Stitch': 'Stitch'/)
  assert.match(i18n, /'翻轉曲面': 'Reverse Normal'/)
  assert.match(i18n, /'編輯曲面控制點': 'Edit Surface Poles'/)
  assert.match(palette, /曲面放樣/)
  assert.match(palette, /補面/)
  assert.match(palette, /縫合/)
})

test('v1.53 ASSEMBLE + v1.52 MODIFY + v1.51 illegal + v1.50 CREATE + v1.49 FORM Traditional retained', () => {
  assert.match(ribbon, /id: 'newcomp', label: '新建組件'/)
  assert.match(ribbon, /id: 'compboolean', label: '組件布爾'/)
  assert.match(ribbon, /id: 'joint', label: '關節'/)
  assert.match(ribbon, /id: 'fillet', label: '圓角'/)
  assert.match(ribbon, /id: 'shell', label: '抽殼'/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(ribbon, /id: 'sketch', label: '建立草圖'/)
  assert.match(ribbon, /id: 'box', label: '長方體'/)
  assert.match(ribbon, /id: 'createform', label: '建立造型'/)
  assert.match(ribbon, /id: 'formedit', label: '編輯造型'/)
  assert.match(i18n, /'对称': 'Symmetric'/)
})

test('no MESH / Form plane / Finish soft-lock regression', () => {
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  assert.match(store, /acceptMeshDropFile/)
  assert.match(store, /placeFormBoxOnOriginPlane/)
  assert.match(viewport, /form-create-plane-hint/)
  assert.match(viewport, /lang !== 'en' \? '完成造型' : 'Finish Form'/)
  // MESH toast contracts still pin SC — do not convert
  assert.match(ribbon, /insertmesh.*插入STL网格/)
})
