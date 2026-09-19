/**
 * v1.55: BUG-BD-5401 SURFACE「翻轉曲面」on MODIFY + INSPECT/ANALYZE Traditional Chinese (HK).
 * BUG-BD-5401: reversesurf must appear on SURFACE MODIFY ribbon/dropdown as 翻轉曲面 (not buried in CREATE-only).
 * Also continue BUG-BD-4801: 測量／干涉檢查／斑馬紋／質心／物理屬性 — not Simplified.
 * Keep FORM/CREATE/MODIFY/ASSEMBLE/SURFACE/illegal TC, sketch 对称→Symmetric, MESH DnD / plane / Finish intact.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../src/components/CommandPalette.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')

function solidInspectBlock(src) {
  const i = src.indexOf("name: 'INSPECT'")
  assert.ok(i >= 0, 'INSPECT missing')
  const j = src.indexOf("name: 'INSERT'", i)
  assert.ok(j > i, 'INSERT after INSPECT missing')
  return src.slice(i, j)
}

function analyzeExtBlock(src) {
  const i = src.indexOf("name: '檢查擴展'")
  assert.ok(i >= 0, '檢查擴展 missing')
  const j = src.indexOf("name: '构造扩展'", i)
  assert.ok(j > i, '构造扩展 after 檢查擴展 missing')
  return src.slice(i, j)
}

test('APP_VERSION is 1.55+', () => {
  assert.match(version, /APP_VERSION = '1\.(5[5-9]|[6-9]\d)'|APP_VERSION = '[2-9]\./)
})


function surfaceModifyBlock(src) {
  const i = src.indexOf('const SURFACE')
  assert.ok(i >= 0, 'SURFACE missing')
  const j = src.indexOf('const MESH', i)
  assert.ok(j > i, 'MESH after SURFACE missing')
  const surf = src.slice(i, j)
  const m = surf.indexOf("name: 'MODIFY'")
  assert.ok(m >= 0, 'SURFACE MODIFY missing')
  const end = surf.indexOf("name: 'SELECT'", m)
  assert.ok(end > m, 'SELECT after SURFACE MODIFY missing')
  return surf.slice(m, end)
}

test('v1.55 BUG-BD-5401: SURFACE MODIFY shows 翻轉曲面 (quick)', () => {
  const block = surfaceModifyBlock(ribbon)
  assert.match(block, /id: 'reversesurf', label: '翻轉曲面'/)
  assert.match(block, /id: 'reversesurf', label: '翻轉曲面'[^\n]*quick:\s*true/)
  assert.doesNotMatch(block, /id: 'reversesurf', label: '翻转曲面'/)
  const surf = ribbon.slice(ribbon.indexOf('const SURFACE'), ribbon.indexOf('const MESH'))
  const create = surf.slice(0, surf.indexOf("name: 'MODIFY'"))
  assert.doesNotMatch(create, /id: 'reversesurf'/)
})

test('v1.55: SOLID INSPECT Traditional labels', () => {
  const block = solidInspectBlock(ribbon)
  for (const [id, label] of [
    ['measureuni', '測量'],
    ['interference', '干涉檢查'],
    ['zebra', '斑馬紋分析'],
    ['curvmap', '曲率圖分析'],
    ['accessanalysis', '可達性分析'],
    ['minradius', '最小半徑分析'],
    ['centerofmass', '質心'],
    ['properties', '物理屬性'],
    ['meshfacegroups', '顯示網格面組'],
  ]) {
    assert.match(block, new RegExp(`id: '${id}', label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))
  }
  assert.doesNotMatch(block, /id: 'measureuni', label: '测量'/)
  assert.doesNotMatch(block, /id: 'interference', label: '干涉检查'/)
  assert.doesNotMatch(block, /id: 'zebra', label: '斑马纹分析'/)
  assert.doesNotMatch(block, /id: 'centerofmass', label: '质心'/)
  assert.doesNotMatch(block, /id: 'properties', label: '物理属性'/)
  assert.doesNotMatch(block, /id: 'meshfacegroups', label: '显示网格面组'/)
})

test('v1.55: UTILITIES 檢查擴展 Traditional labels', () => {
  const block = analyzeExtBlock(ribbon)
  for (const [id, label] of [
    ['measure', '兩點距離'],
    ['measureedge', '邊長／孔徑'],
    ['measureface', '面積'],
    ['measureangle', '面夾角'],
    ['properties', '完整物理屬性'],
  ]) {
    assert.match(block, new RegExp(`id: '${id}', label: '${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`))
  }
  assert.doesNotMatch(ribbon, /name: '检查扩展'/)
  assert.doesNotMatch(block, /id: 'measure', label: '两点距离'/)
  assert.doesNotMatch(block, /id: 'properties', label: '完整物理属性'/)
})

test('v1.55: EN_LABEL + ZH_GROUP + palette INSPECT TC', () => {
  assert.match(i18n, /INSPECT: '檢查'/)
  assert.match(i18n, /'干涉檢查': 'Interference'/)
  assert.match(i18n, /'斑馬紋分析': 'Zebra Analysis'/)
  assert.match(i18n, /'質心': 'Center of Mass'/)
  assert.match(i18n, /'物理屬性': 'Properties'/)
  assert.match(i18n, /'顯示網格面組': 'Display Mesh Face Groups'/)
  assert.match(i18n, /'完整物理屬性': 'Full Physical Properties'/)
  assert.match(palette, /干涉檢查/)
  assert.match(palette, /斑馬紋/)
  assert.match(palette, /物理屬性/)
  assert.match(palette, /質心/)
  assert.match(viewport, /label: '測量'/)
  assert.match(viewport, /runCommand\('measure', '測量'\)/)
})

test('v1.54 SURFACE + v1.53 ASSEMBLE + v1.52 MODIFY + v1.51 illegal + v1.50 CREATE + v1.49 FORM Traditional retained', () => {
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
