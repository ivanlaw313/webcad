/**
 * v1.63: Shell success toast + component-boolean bake chip → Traditional Chinese (HK).
 * Solid @v1.61 saw SC: 「烘焙为零件实体」 / 「已抽壳 壁厚 …(向内, 开 1 个所选面, 切线链开)」.
 * Keep MESH DnD SC pins, DRAWING/SKETCH/illegal/SELECT/SHEET/PLASTIC/ZH chrome.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tStatus } from '../src/i18n.ts'
import { shellSuccessStatus } from '../src/ui/featureStatus.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const featureStatus = readFileSync(new URL('../src/ui/featureStatus.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.63+', () => {
  assert.match(version, /APP_VERSION = '1\.(6[3-9]|[7-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.63: shellSuccessStatus emits Traditional (已抽殼／向內／開／個所選／切線鏈開)', () => {
  const open = shellSuccessStatus({
    thickness: 2,
    dir: 'inside',
    shellType: 'open',
    openCount: 1,
    tangentChain: true,
  })
  assert.equal(open, '已抽殼 壁厚 2（向內，開 1 個所選面，切線鏈開）')
  assert.doesNotMatch(open, /已抽壳|向内|所选|切线链开|个所选/)
  assert.doesNotMatch(open, /Done:|shell Wall|selected/)

  const closed = shellSuccessStatus({
    thickness: 1.5,
    dir: 'both',
    shellType: 'closed',
    openCount: 0,
    tangentChain: false,
  })
  assert.equal(closed, '已抽殼 壁厚 1.5（兩側，封閉實體）')
  assert.doesNotMatch(closed, /两侧|封闭实体/)
})

test('v1.63: EN tStatus keeps Traditional shell toast (no Done:/shell Wall)', () => {
  const raw = shellSuccessStatus({
    thickness: 2,
    dir: 'inside',
    shellType: 'open',
    openCount: 1,
    tangentChain: true,
  })
  const en = tStatus(raw, 'en')
  assert.equal(tStatus(raw, 'zh'), raw)
  assert.match(en, /已抽殼 壁厚 2/)
  assert.match(en, /向內/)
  assert.match(en, /所選面/)
  assert.match(en, /切線鏈開/)
  assert.doesNotMatch(en, /Done:|shell Wall|selected/)
})

test('v1.63: bake chip label Traditional 烘焙為零件實體', () => {
  assert.match(store, /label: '烘焙為零件實體'/)
  assert.doesNotMatch(store, /label: '烘焙为零件实体'/)
  assert.match(store, /已烘焙入零件時間軸，可圓角\/抽殼/)
  assert.match(store, /點右側「烘焙為零件實體」入零件時間軸後再圓角\/抽殼/)
  assert.match(i18n, /'烘焙為零件實體': '烘焙為零件實體'/)
  assert.match(i18n, /'已烘焙入零件時間軸，可圓角\/抽殼': '已烘焙入零件時間軸，可圓角\/抽殼'/)
  // EN must not Bake-into-part
  assert.equal(tStatus('烘焙為零件實體', 'en'), '烘焙為零件實體')
  assert.doesNotMatch(tStatus('烘焙為零件實體', 'en'), /Bake into/)
})

test('v1.63: shell dialog direction / tangent-chain Traditional fragments', () => {
  assert.match(viewport, /tStatus\('向內', lang\)/)
  assert.match(viewport, /tStatus\('兩側', lang\)/)
  assert.match(viewport, /tStatus\('切線鏈', lang\)/)
  assert.match(viewport, /封閉實體/)
  assert.match(featureStatus, /已抽殼 壁厚/)
  assert.doesNotMatch(viewport, /tStatus\('向内', lang\)/)
  assert.doesNotMatch(viewport, /tStatus\('两侧', lang\)/)
  assert.doesNotMatch(viewport, /tStatus\('切线链', lang\)/)
})

test('v1.63: do-not regress DRAWING/SKETCH/illegal/SELECT/SHEET/MESH SC pins/ZH', () => {
  assert.match(drawing, /裝配工程圖|工程圖/)
  assert.match(ribbon, /id: 'line', label: '直線'|label: '直線'/)
  assert.match(ribbonUi, /完成草圖/)
  assert.match(viewport, /label: '完成草圖'/)
  assert.match(illegal, /尺寸已拒絕/)
  assert.match(ribbon, /id: 'select', label: '選擇'/)
  assert.doesNotMatch(ribbon, /id: 'select', label: '选择'/)
  assert.match(ribbon, /id: 'sheetmetal', label: '鈑金件'/)
  assert.match(ribbon, /id: 'rib', label: '加強筋'/)
  // MESH insert STL SC pin retained
  assert.match(store + meshDrop + ribbon, /插入STL网格|插入 STL|插入STL/)
})
