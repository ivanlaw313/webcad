/**
 * v1.67: Body/Component Boolean help + dialog blurbs + short status tips → HK Traditional.
 * Also bump Service Worker CACHE to webcad-v1.67 (Solid GATE: stale SW kept badge at 1.65).
 * Prefer dialog help / status tips — not Help encyclopedias. Retain MESH SC pin,
 * DRAWING/SKETCH/illegal/SELECT/導出 STL/Shell-bake/LAB gear/ZH/construct.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { tLabel, tStatus } from '../src/i18n.ts'
import { booleanSuccessStatus, newBodySuccessStatus } from '../src/ui/featureStatus.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const featureStatus = readFileSync(new URL('../src/ui/featureStatus.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')
const illegal = readFileSync(new URL('../src/ui/illegalInput.ts', import.meta.url), 'utf8')
const drawing = readFileSync(new URL('../src/components/DrawingPanel.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.67+', () => {
  assert.match(version, /APP_VERSION = '1\.(6[7-9]|[7-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.67: SW CACHE bumped to webcad-v1.67+; navigate network-first; release comment', () => {
  assert.match(sw, /const CACHE = 'webcad-v1\.(6[7-9]|[7-9]\d)'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1'/)
  assert.match(sw, /RELEASE: CACHE 必须随每次发版改名|RELEASE: CACHE 必須隨每次發版改名/)
  assert.match(sw, /mode === 'navigate'/)
  assert.match(sw, /network-first|永远攞最新|永遠攞最新/)
})

test('v1.67: booleanSuccessStatus / newBodySuccessStatus Traditional', () => {
  const body = booleanSuccessStatus({ kind: 'body', op: 'cut' })
  const fuse = booleanSuccessStatus({ kind: 'combine', op: 'join', toolCount: 2, keepTools: true })
  const nb = newBodySuccessStatus(3)
  assert.match(body, /已實體布爾：活動實體/)
  assert.match(body, /時間軸可改\/可刪/)
  assert.match(fuse, /已合併：活動實體/)
  assert.match(fuse, /保留工具體/)
  assert.match(nb, /已開新實體/)
  assert.match(nb, /實體布爾/)
  assert.doesNotMatch(featureStatus, /时间轴可改\/可删/)
  assert.doesNotMatch(featureStatus, /已实体布尔：活动实体/)
  assert.doesNotMatch(featureStatus, /已合并：活动实体/)
})

test('v1.67: Viewport combine dialog help Traditional', () => {
  assert.match(viewport, /若切除結果為空/)
  assert.match(viewport, /目標 = 活動實體；勾選工具體/)
  assert.match(viewport, /沒有工具體：請先用「新實體」泊車當前體/)
  assert.match(viewport, /保留工具體：運算後工具體仍作為獨立泊車實體保留/)
  assert.match(viewport, /保留工具體（Keep Tools）/)
  assert.match(viewport, /＋合併/)
  assert.doesNotMatch(viewport, /若切除结果为空/)
  assert.doesNotMatch(viewport, /没有工具体：请先用「新实体」/)
  assert.doesNotMatch(viewport, /保留工具体（Keep Tools）/)
})

test('v1.67: Viewport component-boolean + edit titles Traditional', () => {
  assert.match(viewport, /組件布爾：此件同另一個零件/)
  assert.match(viewport, /manifold 網格布爾/)
  assert.match(viewport, /切除可留間隙/)
  assert.match(viewport, /重開參數化編輯（edit-in-place）/)
  assert.match(viewport, /重新載入時間軸/)
  assert.match(viewport, /自動保存來源/)
  assert.doesNotMatch(viewport, /组件布尔：此件同另一个零件/)
  assert.doesNotMatch(viewport, /manifold 网格布尔/)
  assert.doesNotMatch(viewport, /切除可留间隙/)
})

test('v1.67: store component-boolean prompts use 外擴 / TC chrome', () => {
  assert.match(store, /工具件 XY 外擴/)
  assert.match(store, /間隙做配對插槽/)
  assert.match(store, /組件布爾 —/)
  assert.match(store, /一步式布爾/)
  assert.match(store, /當前是裝配\/網格件/)
  assert.doesNotMatch(store, /工具件 XY 外扩/)
  assert.doesNotMatch(store, /当前是装配\/网格件「/)
})

test('v1.67: i18n TC keys + tStatus; legacy SC retained', () => {
  // STATUS_PHRASES_X identity: EN mode keeps Chinese (no Done: mangling)
  assert.equal(tStatus('保留工具體（Keep Tools）', 'en'), '保留工具體（Keep Tools）')
  assert.equal(tStatus('沒有工具體：請先用「新實體」泊車當前體，再建造第二個實體，然後返回合併/布爾。', 'zh'), '沒有工具體：請先用「新實體」泊車當前體，再建造第二個實體，然後返回合併/布爾。')
  assert.doesNotMatch(tStatus('保留工具體（Keep Tools）', 'en'), /Done:/)
  assert.match(i18n, /'已實體布爾：活動實體': '已實體布爾：活動實體'/)
  assert.match(i18n, /'已合併：活動實體': '已合併：活動實體'/)
  assert.match(i18n, /'已实体布尔：活动实体': '已实体布尔：活动实体'/)
  assert.match(i18n, /'已合并：活动实体': '已合并：活动实体'/)
  assert.equal(tLabel('實體布爾', 'en'), 'Boolean')
})

test('Do not regress prior TC + MESH SC pin + LAB stays under 實驗室', () => {
  assert.match(ribbon, /id: 'insertmesh', label: '插入STL网格'/)
  assert.match(ribbon, /id: 'exportstl', label: '導出STL'/)
  assert.match(ribbon, /id: 'select', label: '選擇'/)
  assert.match(ribbon, /id: 'drawing', label: '工程圖'/)
  assert.match(ribbon, /id: 'gear', label: '齒輪'/)
  assert.match(ribbon, /id: 'params', label: '參數'/)
  assert.match(ribbon, /id: 'datumgeom', label: '構造幾何'/)
  assert.match(drawing, /裝配工程圖 — 三視圖/)
  assert.match(illegal, /ILLEGAL_REJECT_MARKER = '尺寸已拒絕'/)
  assert.match(i18n, /CREATE: '建立'/)
  assert.match(i18n, /SOLID: '實體'/)
  assert.match(i18n, /EXPORT: '導出'/)
  assert.match(store, /label: '烘焙為零件實體'/)
  assert.match(featureStatus, /已抽殼 壁厚/)
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
  const labStart = ribbon.indexOf('const LAB: Panel[]')
  const labEnd = ribbon.indexOf("'🧪實驗室': { id: '🧪實驗室'")
  assert.ok(labStart >= 0 && labEnd > labStart)
  const lab = ribbon.slice(labStart, labEnd)
  assert.match(lab, /id: 'bodyboolean', label: '實體布爾'/)
  assert.match(lab, /id: 'gear', label: '齒輪'/)
  const solidStart = ribbon.indexOf('const SOLID:')
  const solidEnd = ribbon.indexOf('const LAB:')
  const solid = ribbon.slice(solidStart, solidEnd)
  assert.doesNotMatch(solid, /id: 'gear'/)
  assert.doesNotMatch(solid, /id: 'bodyboolean'/)
})
