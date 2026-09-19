/**
 * v1.53: SOLID ASSEMBLE ribbon Traditional Chinese (HK).
 * Continue BUG-BD-4801: 新建組件／組件布爾／關節／剛性組 — not 新建组件／组件布尔／关节／刚性组.
 * Keep FORM/CREATE/MODIFY/illegal TC, sketch 对称→Symmetric, MESH DnD / plane / Finish intact.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const palette = readFileSync(new URL('../src/components/CommandPalette.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')

function solidAssembleBlock(src) {
  const i = src.indexOf("name: 'ASSEMBLE'")
  assert.ok(i >= 0, 'SOLID ASSEMBLE missing')
  const rest = src.slice(i)
  const t = rest.indexOf('tools: [')
  let depth = 0, j = t
  for (; j < rest.length; j++) {
    if (rest[j] === '[') depth++
    else if (rest[j] === ']') {
      depth--
      if (depth === 0) { j++; break }
    }
  }
  return rest.slice(0, j)
}

test('APP_VERSION is 1.53+', () => {
  assert.match(version, /APP_VERSION = '1\.(5[3-9]|[6-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.53: SOLID ASSEMBLE Traditional labels', () => {
  const block = solidAssembleBlock(ribbon)
  for (const [id, label] of [
    ['newcomp', '新建組件'],
    ['compboolean', '組件布爾'],
    ['joint', '關節'],
    ['asbuiltjoint', '按現狀關節'],
    ['jointorigin', '關節原點'],
    ['rigidgroup', '剛性組'],
    ['motionlink', '運動連接'],
    ['enablecontact', '啟用接觸集'],
    ['newcontactset', '新建接觸集'],
    ['motionstudy', '運動研究'],
    ['drivejoints', '驅動關節'],
  ]) {
    assert.match(block, new RegExp(`id: '${id}', label: '${label}'`))
  }
  assert.doesNotMatch(block, /id: 'newcomp', label: '新建组件'/)
  assert.doesNotMatch(block, /id: 'compboolean', label: '组件布尔'/)
  assert.doesNotMatch(block, /id: 'joint', label: '关节'/)
  assert.doesNotMatch(block, /id: 'rigidgroup', label: '刚性组'/)
  assert.doesNotMatch(block, /id: 'drivejoints', label: '驱动关节'/)
})

test('v1.53: EN_LABEL + BrowserTree + palette ASSEMBLE TC', () => {
  assert.match(i18n, /'新建組件': 'New Component'/)
  assert.match(i18n, /'組件布爾': 'Component Boolean'/)
  assert.match(i18n, /'關節': 'Joint'/)
  assert.match(i18n, /'剛性組': 'Rigid Group'/)
  assert.match(i18n, /'驅動關節': 'Drive Joints'/)
  assert.match(i18n, /ASSEMBLE: '裝配'/)
  assert.match(browser, /組件布爾/)
  assert.match(browser, /剛性組/)
  assert.match(browser, /關節原點/)
  assert.match(browser, /按現狀關節/)
  assert.match(palette, /組件布爾/)
  assert.match(palette, /關節/)
})

test('v1.52 MODIFY + v1.51 illegal + v1.50 CREATE + v1.49 FORM Traditional retained', () => {
  assert.match(ribbon, /id: 'fillet', label: '圓角'/)
  assert.match(ribbon, /id: 'shell', label: '抽殼'/)
  assert.match(ribbon, /id: 'move', label: '移動\/複製'/)
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
})
