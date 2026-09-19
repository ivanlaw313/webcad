/**
 * v1.52: SOLID MODIFY ribbon Traditional Chinese (HK).
 * Continue BUG-BD-4801: 圓角／抽殼／縮放／合併／移動 — not 圆角／抽壳／缩放／合并／移动.
 * Keep FORM/CREATE/illegal TC, sketch 对称→Symmetric, MESH DnD / plane / Finish intact.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const browser = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')

function solidModifyBlock(src) {
  const i = src.indexOf("name: 'MODIFY'")
  assert.ok(i >= 0, 'SOLID MODIFY missing')
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

test('APP_VERSION is 1.52+', () => {
  assert.match(version, /APP_VERSION = '1\.(5[2-9]|[6-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.52: SOLID MODIFY Traditional labels', () => {
  const block = solidModifyBlock(ribbon)
  for (const [id, label] of [
    ['fillet', '圓角'],
    ['shell', '抽殼'],
    ['scale', '縮放'],
    ['combine', '合併/切割'],
    ['move', '移動/複製'],
    ['align', '對齊'],
    ['delete', '刪除'],
    ['editface', '編輯面'],
    ['replaceface', '替換面'],
    ['splitbody', '分割實體'],
    ['silhouettesplit', '輪廓分割'],
    ['simplify', '簡化'],
    ['appearance', '外觀'],
    ['convert', '轉換'],
    ['params', '更改參數'],
    ['computeall', '全部計算'],
  ]) {
    assert.match(block, new RegExp(`id: '${id}', label: '${label}'`))
  }
  // must NOT keep Simplified orthography on those tools
  assert.doesNotMatch(block, /id: 'fillet', label: '圆角'/)
  assert.doesNotMatch(block, /id: 'shell', label: '抽壳'/)
  assert.doesNotMatch(block, /id: 'scale', label: '缩放'/)
  assert.doesNotMatch(block, /id: 'combine', label: '合并\/切割'/)
  assert.doesNotMatch(block, /id: 'move', label: '移动\/复制'/)
  assert.doesNotMatch(block, /id: 'appearance', label: '外观'/)
})

test('v1.52: EN_LABEL Traditional keys + FD_TITLE + menus', () => {
  assert.match(i18n, /'圓角': 'Fillet'/)
  assert.match(i18n, /'抽殼': 'Shell'/)
  assert.match(i18n, /'縮放': 'Scale'/)
  assert.match(i18n, /'移動\/複製': 'Move \/ Copy'/)
  assert.match(i18n, /'合併\/切割': 'Combine'/)
  assert.match(viewport, /move: '移動\/複製'/)
  assert.match(viewport, /scale: '縮放'/)
  assert.match(viewport, /'fillet-edit': '圓角'/)
  assert.match(viewport, /'shell-edit': '抽殼'/)
  assert.match(viewport, /label: '圓角'/)
  assert.match(viewport, /runCommand\('fillet', '圓角'\)/)
  assert.match(browser, /label: '圓角'/)
  assert.match(browser, /label: '抽殼'/)
  assert.match(timeline, /label: '圓角'/)
  assert.match(timeline, /label: '抽殼'/)
})

test('v1.51 illegal + v1.50 CREATE + v1.49 FORM Traditional retained', () => {
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
