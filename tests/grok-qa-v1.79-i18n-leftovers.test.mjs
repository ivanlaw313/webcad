/**
 * v1.79: continue clearing four-locale i18n leftovers after v1.78.
 * zh-HK File/cmd SC→TC · Browser chrome catalog · remaining CREATE prim toasts
 * · SketchLayer/Ribbon/Viewport lang==='en' ternaries → catalog
 * Pins: 插入STL网格 · 實驗室 · 尺寸已拒絕 · 日本語 · JA tool.* · HelpPanel · box/sphere/cone/torus JP toasts
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  msg, catalogKeyCount, allCatalogKeys, LOCALES, CATALOGS, tStatus, tLabel,
} from '../src/i18n.ts'
import {
  boxSuccessStatus, sphereSuccessStatus, coneSuccessStatus, torusSuccessStatus,
  wedgeSuccessStatus, domeSuccessStatus, halfcylSuccessStatus, pieSuccessStatus,
  prismSuccessStatus, tubeSuccessStatus, rtubeSuccessStatus, coilSuccessStatus,
} from '../src/ui/featureStatus.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const sketch = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const sketchPanel = readFileSync(new URL('../src/components/SketchToolPanel.tsx', import.meta.url), 'utf8')

test('APP_VERSION is 1.79; SW CACHE webcad-v1.79', () => {
  assert.match(version, /APP_VERSION = '1\.79'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.79'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.78'/)
})

test('v1.79: catalog parity ≥670; new browser/prim/opHelp/sk.dim keys', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
  assert.ok(counts[0] >= 700, `expected ≥670 keys, got ${counts[0]}`)
  const keys = allCatalogKeys()
  for (const k of [
    'ui.browser', 'ui.browserExpand', 'ui.browserCollapse', 'ui.ribbonExpandGroup',
    'sk.dim.checkingPreview', 'sk.dim.refExtent', 'sk.dim.frameAngle',
    'vp.opHelp.component', 'vp.opHelp.cut', 'vp.opHelp.first',
    'status.wedgeCreated', 'status.domeCreated', 'status.halfcylCreated',
    'status.pieCreated', 'status.prismCreated', 'status.tubeCreated',
    'status.rtubeCreated', 'status.coilCreated', 'status.coilTaperCreated',
    'tree.docSettings', 'tree.origin', 'tree.namedViews',
    'sk.toolTitle.dimension', 'sk.toolTitle.select', 'file.newConfirm',
  ]) {
    assert.ok(keys.includes(k), `missing ${k}`)
  }
})

test('v1.79 BD File/Browser: zh-HK 檔案/搜尋/瀏覽器 Traditional', () => {
  assert.equal(msg('file.menu', 'zh-HK'), '檔案')
  assert.equal(msg('file.new', 'zh-HK'), '新建檔案')
  assert.equal(msg('ui.file', 'zh-HK'), '檔案')
  assert.match(msg('file.title', 'zh-HK'), /檔案/)
  assert.doesNotMatch(msg('file.menu', 'zh-HK'), /文件/)
  assert.equal(msg('cmd.ariaSearch', 'zh-HK'), '搜尋命令')
  assert.match(msg('cmd.searchPlaceholder', 'zh-HK'), /搜尋/)
  assert.doesNotMatch(msg('cmd.ariaSearch', 'zh-HK'), /搜索/)
  assert.equal(msg('file.importStl', 'zh-HK'), '匯入 STL…')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.equal(msg('ui.browser', 'zh-HK'), '瀏覽器')
  assert.equal(msg('ui.browserExpand', 'zh-HK'), '展開瀏覽器')
  assert.equal(msg('ui.browserCollapse', 'zh-HK'), '摺疊瀏覽器')
  assert.equal(msg('ui.browser', 'ja'), 'ブラウザ')
  assert.match(tree, /msg\('ui\.browser'/)
  assert.match(tree, /msg\('ui\.browserExpand'/)
  assert.match(tree, /msg\('ui\.browserCollapse'/)
  // BOT-D @1.78: Browser hardcoded must be TC 瀏覽器／組件／實體／特徵 (not SC)
  for (const sc of ['浏览器', '组件', '实体', '特征']) {
    assert.equal(tree.split(sc).length - 1, 0, `BrowserTree still has SC 「${sc}」`)
    assert.equal(timeline.split(sc).length - 1, 0, `Timeline still has SC 「${sc}」`)
  }
  assert.match(tree, /瀏覽器/)
  assert.match(tree, /msg\('tree\.docSettings'/)
  assert.match(tree, /msg\('tree\.origin'/)
  assert.match(tree, /msg\('tree\.namedViews'/)
  assert.match(tree, /msg\('tree\.components'/)
  assert.match(tree, /msg\('tree\.bodies'/)
  assert.match(tree, /msg\('tree\.features'/)
  assert.equal(msg('tree.docSettings', 'zh-HK'), '文件設定')
  assert.equal(msg('tree.origin', 'zh-HK'), '原點')
  assert.equal(msg('tree.namedViews', 'zh-HK'), '命名視圖')
  assert.equal(msg('file.new', 'zh-HK'), '新建檔案')
  assert.doesNotMatch(msg('file.new', 'zh-HK'), /新建文件/)
  // File import/history must stay PASS (no regression)
  assert.equal(msg('file.importStl', 'zh-HK'), '匯入 STL…')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
})

test('v1.79 SketchToolPanel: Dimension / doneSketch via catalog — no EN shred', () => {
  assert.match(sketchPanel, /sk\.toolTitle\.\$\{tool\}|sk\.toolTitle\./)
  assert.match(sketchPanel, /⚙ \{title\}/)
  assert.equal(msg('sk.toolTitle.dimension', 'en'), 'Dimension')
  assert.equal(msg('sk.toolTitle.dimension', 'ja'), '寸法')
  assert.equal(msg('sk.toolTitle.dimension', 'zh-HK'), '尺寸工具')
  assert.equal(msg('sk.toolTitle.select', 'zh-HK'), '選擇工具')
  assert.equal(tStatus('尺寸工具', 'en'), 'Dimension')
  assert.doesNotMatch(tStatus('尺寸工具', 'en'), /dimension工具|工具/)
  assert.equal(tStatus('完成草圖', 'en'), 'Finish Sketch')
  assert.doesNotMatch(tStatus('完成草圖', 'en'), /doneSketch|donesketch/i)
  assert.equal(tStatus('完成草圖', 'ja'), msg('ui.finishSketch', 'ja'))
  assert.doesNotMatch(tStatus('完成草圖', 'ja'), /doneSketch/i)
})

test('v1.79: SketchLayer / Ribbon / Viewport — no lang===en ternaries in patched sites', () => {
  assert.match(sketch, /msg\('sk\.dim\.checkingPreview'/)
  assert.match(sketch, /msg\('sk\.dim\.refExtent'/)
  assert.match(sketch, /msg\('sk\.dim\.frameAngle'/)
  assert.equal((sketch.match(/lang\s*===\s*'en'/g) || []).length, 0)
  assert.match(ribbon, /msg\('ui\.ribbonExpandGroup'/)
  assert.doesNotMatch(ribbon, /Show all \$\{dispName\} commands/)
  assert.match(viewport, /msg\('vp\.opHelp\.component'/)
  assert.match(viewport, /msg\('vp\.opHelp\.cut'/)
  assert.match(viewport, /msg\('vp\.opHelp\.first'/)
  assert.doesNotMatch(viewport, /Create an independent component with its own history/)
})

test('v1.79: wedge/dome/halfcyl/pie/prism/tube/coil JA toasts — no Done: shred', () => {
  assert.equal(msg('status.wedgeCreated', 'ja'), 'くさびを作成しました {0}×{1}×{2}')
  assert.doesNotMatch(msg('status.wedgeCreated', 'ja'), /Done:|\bWedge\b/)
  assert.equal(wedgeSuccessStatus({ op: 'new', l: 10, w: 20, h: 30 }, 'ja'), 'くさびを作成しました 10×20×30')
  assert.doesNotMatch(wedgeSuccessStatus({ op: 'new', l: 10, w: 20, h: 30 }, 'ja'), /Done:/)

  assert.equal(domeSuccessStatus({ op: 'new', d: 40 }, 'ja'), 'ドーム／半球を作成しました Ø40')
  assert.doesNotMatch(domeSuccessStatus({ op: 'new', d: 40 }, 'ja'), /Done:/)

  assert.equal(halfcylSuccessStatus({ op: 'new', d: 20, h: 30 }, 'ja'), '半円柱／D形を作成しました Ø20×30')
  assert.equal(pieSuccessStatus({ op: 'new', d: 30, ang: 90, h: 20 }, 'ja'), '扇形柱を作成しました Ø30 90°×20')
  assert.equal(prismSuccessStatus({ op: 'new', sides: 6, d: 20, h: 40 }, 'ja'), '6角形角柱を作成しました 外接Ø20×40')
  assert.equal(tubeSuccessStatus({ od: 30, wall: 2, id: '26.0', h: 50 }, 'ja'), '円管を作成しました 外Ø30 肉厚2（内Ø26.0）高50')
  assert.equal(rtubeSuccessStatus({ w: 40, d: 20, wall: 2, iw: 36, id: 16, h: 50 }, 'ja'), '矩形管を作成しました 40×20 肉厚2（内 36×16）高50')
  assert.equal(coilSuccessStatus({}, 'ja'), 'コイル（ばね）を作成しました')
  assert.equal(coilSuccessStatus({ taper: true, d: 60, d2: 40 }, 'ja'), 'テーパばねを作成しました（底Ø60→頂Ø40）')

  for (const s of [
    tStatus('已创建楔形 10×20×30', 'ja'),
    tStatus('已创建圆顶/半球 Ø40', 'ja'),
    tStatus('已创建半圆柱/D 形 Ø20×30', 'ja'),
    tStatus('已创建扇形柱 Ø30 90°×20', 'ja'),
    tStatus('已创建6边形棱柱 外接Ø20×40', 'ja'),
    tStatus('已创建圆管 外Ø30 壁厚2（内Ø26.0）高50', 'ja'),
    tStatus('已创建螺旋（弹簧）', 'ja'),
  ]) {
    assert.doesNotMatch(s, /Done:/, s)
  }

  assert.match(store, /wedgeSuccessStatus\(/)
  assert.match(store, /domeSuccessStatus\(/)
  assert.match(store, /halfcylSuccessStatus\(/)
  assert.match(store, /pieSuccessStatus\(/)
  assert.match(store, /prismSuccessStatus\(/)
  assert.match(store, /tubeSuccessStatus\(/)
  assert.match(store, /rtubeSuccessStatus\(/)
  assert.match(store, /coilSuccessStatus\(/)
})

test('v1.79 CREATE menu includes cone — JA 円錐 via tool.cone', () => {
  const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
  const create = ribbonSrc.slice(ribbonSrc.indexOf("name: 'CREATE'"), ribbonSrc.indexOf("name: 'MODIFY'"))
  assert.match(create, /id: 'cone'/)
  assert.match(create, /id: 'sphere'/)
  assert.match(create, /id: 'torus'/)
  // cone sits with box/cyl/sphere/torus (not only LAB 更多基元)
  const sphereAt = create.indexOf("id: 'sphere'")
  const torusAt = create.indexOf("id: 'torus'")
  const coneAt = create.indexOf("id: 'cone'")
  assert.ok(coneAt > torusAt && torusAt > sphereAt, 'cone should follow torus in CREATE')
  assert.equal(msg('tool.cone', 'ja'), '円錐')
  assert.equal(tLabel('圓錐', 'ja'), '円錐')
  assert.notEqual(msg('tool.cone', 'ja'), msg('tool.cone', 'en'))
})

test('Pins + prior JP box/sphere/cone/torus stay fixed', () => {
  assert.match(ribbonSrc, /id: 'insertmesh', label: '插入STL网格'/)
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.match(ribbonSrc, /'🧪實驗室'/)
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.match(ribbon, /日本語/)
  assert.equal(msg('status.dimRejected', 'zh-HK'), '尺寸已拒絕')
  assert.equal(msg('tool.extrude', 'ja'), '押し出し')
  assert.notEqual(msg('tool.fillet', 'ja'), msg('tool.fillet', 'en'))
  assert.ok(allCatalogKeys().includes('help.title'))
  assert.doesNotMatch(boxSuccessStatus({ op: 'new', l: 80, w: 60, h: 40 }, 'ja'), /Done:|\bBox\b/)
  assert.doesNotMatch(sphereSuccessStatus({ op: 'new', d: 20 }, 'ja'), /Done:/)
  assert.doesNotMatch(coneSuccessStatus({ op: 'new', d: 20, dt: 0, h: 30 }, 'ja'), /Done:/)
  assert.doesNotMatch(torusSuccessStatus({ op: 'new', od: 30, td: 8 }, 'ja'), /Done:/)
})
