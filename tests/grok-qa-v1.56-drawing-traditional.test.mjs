/**
 * v1.56: DRAWING ribbon Traditional Chinese (HK).
 * Continue BUG-BD-4801: 工程圖 — not 工程图 (MANAGE DRAWING + File menu).
 * Keep FORM/CREATE/MODIFY/ASSEMBLE/SURFACE/INSPECT/illegal TC, sketch 对称→Symmetric, MESH DnD / plane / Finish intact.
 * Do NOT convert MESH toast SC pins. Do NOT mass-convert SKETCH residual SC.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../src/components/CommandPalette.tsx', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.56+', () => {
  assert.match(version, /APP_VERSION = '1\.(5[6-9]|[6-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.56: DRAWING ribbon label Traditional', () => {
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.doesNotMatch(ribbon, /id: 'drawing', label: '工程图'/)
})

test('v1.56: ZH_GROUP + EN_LABEL + File menu DRAWING TC', () => {
  assert.match(i18n, /DRAWING: '工程圖'/)
  assert.doesNotMatch(i18n, /DRAWING: '工程图'/)
  assert.match(i18n, /'工程圖': 'Drawing'/)
  assert.match(ribbonUi, /工程圖（三視圖）/)
  assert.match(ribbonUi, /裝配工程圖 \+ BOM/)
  assert.doesNotMatch(ribbonUi, /: '工程图（三视图）'/)
  assert.doesNotMatch(ribbonUi, /工程圖（三视图）/)
  assert.doesNotMatch(ribbonUi, /: '装配工程图 \+ BOM'/)
  assert.match(palette, /工程圖/)
})

test('v1.55 INSPECT + BD-5401 + v1.54 SURFACE + v1.53 ASSEMBLE + v1.52 MODIFY + v1.51 illegal + v1.50 CREATE + v1.49 FORM Traditional retained', () => {
  assert.match(ribbon, /id: 'reversesurf', label: '翻轉曲面'/)
  assert.match(ribbon, /id: 'measureuni', label: '測量'/)
  assert.match(ribbon, /id: 'interference', label: '干涉檢查'/)
  assert.match(ribbon, /id: 'surfloft', label: '曲面放樣'/)
  assert.match(ribbon, /id: 'surfsew', label: '縫合 Stitch'/)
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
  assert.match(ribbon, /insertmesh.*插入STL网格/)
})
