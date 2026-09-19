/**
 * v1.74: 4-locale i18n message catalog foundation (zh-HK / zh-CN / en / ja).
 * Ribbon language switcher + stable keys + coverage smoke.
 * Keep Timeline field-param TC + MESH SC pin + LAB under 實驗室.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  detectLang, normalizeLang, tLabel, tGroup, tTab, tStatus, msg,
  catalogKeyCount, allCatalogKeys, LOCALES, CATALOGS,
} from '../src/i18n.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const ribbonUi = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const meshDrop = readFileSync(new URL('../src/io/meshDrop.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.74+', () => {
  assert.match(version, /APP_VERSION = '1\.(7[4-9]|[8-9]\d)'|APP_VERSION = '[2-9]\./)
})

test('v1.74: SW CACHE webcad-v1.74+; navigate network-first', () => {
  assert.match(sw, /const CACHE = 'webcad-v1\.(7[4-9]|[8-9]\d)'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.73'/)
  assert.match(sw, /mode === 'navigate'/)
})

test('v1.74: Lang normalize — legacy zh → zh-HK; four locales', () => {
  assert.equal(normalizeLang('zh'), 'zh-HK')
  assert.equal(normalizeLang('zh-HK'), 'zh-HK')
  assert.equal(normalizeLang('zh-CN'), 'zh-CN')
  assert.equal(normalizeLang('en'), 'en')
  assert.equal(normalizeLang('ja'), 'ja')
  assert.deepEqual([...LOCALES], ['zh-HK', 'zh-CN', 'en', 'ja'])
})

test('v1.74: catalog key counts equal across locales (≥ 300)', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.ok(counts.every((n) => n >= 300), `counts=${counts}`)
  assert.equal(new Set(counts).size, 1, `unequal catalogs: ${counts}`)
  const keys = allCatalogKeys()
  assert.ok(keys.includes('tool.extrude'))
  assert.ok(keys.includes('tool.insertmesh'))
  assert.ok(keys.includes('tab.SOLID'))
  assert.ok(keys.includes('tab.LAB'))
  assert.ok(keys.includes('group.CREATE'))
  assert.ok(keys.includes('ui.lang'))
})

test('v1.74: msg / tLabel / tTab / tGroup switch all four locales', () => {
  assert.equal(msg('tool.extrude', 'zh-HK'), '拉伸')
  assert.equal(msg('tool.extrude', 'zh-CN'), '拉伸')
  assert.equal(msg('tool.extrude', 'en'), 'Extrude')
  assert.equal(msg('tool.extrude', 'ja'), '押し出し')

  assert.equal(tLabel('拉伸', 'zh-HK'), '拉伸')
  assert.equal(tLabel('拉伸', 'en'), 'Extrude')
  assert.equal(tLabel('拉伸', 'ja'), '押し出し')

  assert.equal(tTab('SOLID', 'zh-HK'), '實體')
  assert.equal(tTab('SOLID', 'zh-CN'), '实体')
  assert.equal(tTab('SOLID', 'en'), 'SOLID')
  assert.equal(tTab('SOLID', 'ja'), 'ソリッド')

  assert.equal(tGroup('CREATE', 'zh-HK'), '建立')
  assert.equal(tGroup('CREATE', 'en'), 'CREATE')
  assert.equal(tGroup('CREATE', 'ja'), '作成')

  assert.equal(tTab('🧪實驗室', 'zh-HK'), '🧪實驗室')
  assert.match(tTab('🧪實驗室', 'zh-CN'), /实验室/)
})

test('v1.74: MESH pin + insertmesh catalog; LAB under 實驗室', () => {
  assert.match(ribbonSrc, /id: 'insertmesh', label: '插入STL网格'/)
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(msg('tool.insertmesh', 'en'), 'Insert STL')
  assert.match(ribbonSrc, /'🧪實驗室': \{ id: '🧪實驗室'/)
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
})

test('v1.74: Ribbon has 4-locale switcher (繁/簡/EN/日本語)', () => {
  assert.match(ribbonUi, /data-testid="lang-switcher"/)
  assert.match(ribbonUi, /data-testid=\{`lang-\$\{code\}`\}/)
  assert.match(ribbonUi, /\['zh-HK', 'ui\.lang\.zhHK', '繁'\]/)
  assert.match(ribbonUi, /\['zh-CN', 'ui\.lang\.zhCN', '簡'\]/)
  assert.match(ribbonUi, /\['en', 'ui\.lang\.en', 'EN'\]/)
  assert.match(ribbonUi, /\['ja', 'ui\.lang\.ja', '日本語'\]/)
  assert.match(ribbonUi, /setLang\(code as Lang\)/)
  assert.match(store, /normalizeLang\(l\)/)
  assert.match(store, /status\.lang\.zhHK/)
})

test('v1.74: Timeline field-param chrome Traditional (folded into release)', () => {
  assert.match(timeline, /param: '距離'/)
  assert.match(timeline, /param: '半徑'/)
  assert.match(timeline, /param: 'X 數量'|label: 'X數量'/)
  assert.match(timeline, /label: '模數'/)
  assert.match(timeline, /label: '齒數'/)
  assert.match(timeline, /label: '橋接面'/)
  assert.doesNotMatch(timeline, /param: '距离'/)
  assert.doesNotMatch(timeline, /param: '半径'/)
  assert.doesNotMatch(timeline, /label: '桥接面'/)
})

test('v1.74: tStatus zh-CN simplifies; en still translates; zh-HK unchanged', () => {
  assert.equal(tStatus('實體', 'zh-HK'), '實體')
  assert.equal(tStatus('實體', 'zh-CN'), '实体')
  assert.equal(tStatus('選擇', 'en'), 'Select')
  assert.equal(tStatus('选择', 'en').toLowerCase(), 'select')
})

test('Do not regress prior TC pins + LAB panels', () => {
  assert.match(ribbonSrc, /id: 'exportstl', label: '導出STL'/)
  assert.match(ribbonSrc, /id: 'select', label: '選擇'/)
  assert.match(ribbonSrc, /id: 'asmdrawing', label: '裝配工程圖'/)
  assert.match(ribbonSrc, /name: 'CREATE 擴充'/)
  assert.match(ribbonSrc, /name: '製造 CAM'/)
  assert.match(ribbonSrc, /id: 'stack', label: '堆疊'/)
  assert.match(meshDrop, /MESH_TAB_DROP_HINT|拖到视口导入/)
})
