/**
 * v1.57: SKETCH contextual ribbon Traditional Chinese (HK).
 * Continue BUG-BD-4801: 直線／圓／鏡像／陣列／選擇／完成草圖 — not Simplified.
 * Keep FORM/CREATE/MODIFY/ASSEMBLE/SURFACE/INSPECT/DRAWING/illegal TC, sketch 对称→Symmetric pin, MESH DnD / plane / Finish Form intact.
 * Do NOT convert MESH toast SC pins. Do NOT mass-convert SOLID CREATE residual SC (旋转／镜像／阵列).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
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

test('APP_VERSION is 1.57+', () => {
  assert.match(version, /APP_VERSION = '1\.(5[7-9]|[6-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.57: SKETCH CREATE/MODIFY/CONSTRAINTS Traditional labels', () => {
  const block = sketchPanelsBlock(ribbon)
  for (const [id, label] of [
    ['sk_polyline', '直線'],
    ['sk_circle', '圓'],
    ['sk_arc', '圓弧'],
    ['sk_polygon', '多邊形'],
    ['sk_spline', '樣條'],
    ['sk_ellipse', '橢圓'],
    ['sk_point', '點'],
    ['sk_cline', '構造線'],
    ['sk_mirrory', '鏡像'],
    ['sk_array', '陣列'],
    ['sk_project', '投影幾何'],
    ['sk_close', '閉合'],
    ['sk_select', '選擇'],
    ['sk_c_v', '豎直'],
    ['sk_c_coll', '共線'],
    ['sk_c_sym', '對稱'],
    ['sk_c_mid', '中點'],
    ['sk_autoconstrain', '自動約束'],
    ['sk_uncon', '撤約束'],
    ['sectionprops', '截面屬性'],
  ]) {
    assert.match(block, new RegExp(`id: '${id}', label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))
  }
  assert.doesNotMatch(block, /id: 'sk_polyline', label: '直线'/)
  assert.doesNotMatch(block, /id: 'sk_circle', label: '圆'/)
  assert.doesNotMatch(block, /id: 'sk_mirrory', label: '镜像'/)
  assert.doesNotMatch(block, /id: 'sk_array', label: '阵列'/)
  assert.doesNotMatch(block, /id: 'sk_select', label: '选择'/)
  assert.doesNotMatch(block, /id: 'sk_c_sym', label: '对称'/)
})

test('v1.57: Finish Sketch chrome + ZH_GROUP + EN_LABEL TC', () => {
  assert.match(ribbonUi, /完成草圖/)
  assert.match(ribbonUi, /: '草圖'/)
  assert.doesNotMatch(ribbonUi, /lang === 'en' \? 'Finish Sketch' : '完成草图'/)
  assert.doesNotMatch(ribbonUi, /: '草图'}/)
  assert.match(viewport, /label: '完成草圖'/)
  assert.match(viewport, /tStatus\('完成草圖'/)
  assert.doesNotMatch(viewport, /label: '完成草图'/)
  assert.match(i18n, /CONSTRAINTS: '約束'/)
  assert.doesNotMatch(i18n, /CONSTRAINTS: '约束'/)
  assert.match(i18n, /'直線': 'Line'/)
  assert.match(i18n, /'圓': 'Circle'/)
  assert.match(i18n, /'陣列': 'Pattern'/)
  assert.match(i18n, /'對稱': 'Symmetric'/)
  assert.match(i18n, /'自動約束': 'AutoConstrain'/)
  assert.match(i18n, /'對稱': 'Symmetric'/)
  // legacy SC pin must remain
  assert.match(i18n, /'对称': 'Symmetric'/)
})

test('v1.56 DRAWING + v1.55 INSPECT/BD-5401 + v1.54 SURFACE + v1.53 ASSEMBLE + v1.52 MODIFY + v1.51 illegal + v1.50 CREATE + v1.49 FORM Traditional retained', () => {
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
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
