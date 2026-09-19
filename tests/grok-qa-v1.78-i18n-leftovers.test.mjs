/**
 * v1.78: close leftover i18n gaps after v1.77.
 * SketchToolPanel lang ternaries → catalog · sphere/cone/torus toasts → status.*Created
 * BOT-D BD-7301: zh-HK File menu 匯入 STL… / 版本歷史…
 * Pins: 插入STL网格 · 實驗室 · 尺寸已拒絕 · 日本語 · JA tool.* · HelpPanel · box JP toast
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  msg, catalogKeyCount, allCatalogKeys, LOCALES, CATALOGS, tStatus,
} from '../src/i18n.ts'
import {
  sphereSuccessStatus, coneSuccessStatus, torusSuccessStatus, boxSuccessStatus,
} from '../src/ui/featureStatus.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/SketchToolPanel.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')

test('APP_VERSION is 1.78; SW CACHE webcad-v1.78', () => {
  assert.match(version, /APP_VERSION = '1\.78'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.78'/)
  assert.doesNotMatch(sw, /const CACHE = 'webcad-v1\.77'/)
})

test('v1.78: catalog parity ≥640 keys; sk.* + status.sphere/cone/torus present', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
  assert.ok(counts[0] >= 640, `expected ≥640 keys, got ${counts[0]}`)
  const keys = allCatalogKeys()
  for (const k of [
    'sk.earc.dir', 'sk.ellipse.method', 'sk.array.independent', 'sk.scale.start',
    'sk.drag.idle', 'sk.tan.whole', 'sk.move.help',
    'status.sphereCreated', 'status.sphereCut',
    'status.coneCreated', 'status.coneCut',
    'status.torusCreated', 'status.torusCut',
  ]) {
    assert.ok(keys.includes(k), `missing ${k}`)
  }
})

test('v1.78: SketchToolPanel uses msg()/m() — no lang===en ternaries', () => {
  assert.match(panel, /msg/)
  assert.match(panel, /m\('sk\.earc\.dir'\)/)
  assert.match(panel, /m\('sk\.array\.independent'\)/)
  assert.match(panel, /m\('sk\.scale\.start'\)/)
  assert.match(panel, /m\('sk\.drag\.idle'\)/)
  assert.match(panel, /m\('sk\.tan\.whole'\)/)
  assert.equal((panel.match(/lang\s*===\s*'en'/g) || []).length, 0)
  assert.equal((panel.match(/lang==='en'/g) || []).length, 0)
})

test('v1.78 BD-7301: zh-HK File menu Traditional 匯入/歷史', () => {
  assert.equal(msg('file.importStl', 'zh-HK'), '匯入 STL…')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.equal(msg('file.import3mf', 'zh-HK'), '匯入 3MF…')
  assert.equal(msg('file.importObj', 'zh-HK'), '匯入 OBJ…')
  assert.equal(msg('file.importStep', 'zh-HK'), '匯入 STEP…')
  assert.match(msg('file.importStl', 'zh-CN'), /导入/)
  assert.match(msg('file.history', 'zh-CN'), /历史/)
  assert.match(msg('file.importStl', 'en'), /Import STL/)
})

test('v1.78: sphere/cone/torus JA toasts — no Done: shred; catalog helpers', () => {
  assert.equal(msg('status.sphereCreated', 'ja'), '球を作成しました Ø{0}')
  assert.doesNotMatch(msg('status.sphereCreated', 'ja'), /Done:|\bSphere\b/)
  assert.equal(msg('status.coneCreated', 'ja'), '円錐を作成しました 底Ø{0} 頂Ø{1}×{2}')
  assert.doesNotMatch(msg('status.coneCreated', 'ja'), /Done:|\bCone\b/)
  assert.equal(msg('status.torusCreated', 'ja'), 'トーラスを作成しました 外Ø{0} 管Ø{1}')
  assert.doesNotMatch(msg('status.torusCreated', 'ja'), /Done:|\bTorus\b/)

  const jaS = sphereSuccessStatus({ op: 'new', d: 20 }, 'ja')
  assert.equal(jaS, '球を作成しました Ø20')
  assert.doesNotMatch(jaS, /Done:/)

  const jaC = coneSuccessStatus({ op: 'new', d: 20, dt: 0, h: 30 }, 'ja')
  assert.equal(jaC, '円錐を作成しました 底Ø20 頂Ø0×30')
  assert.doesNotMatch(jaC, /Done:/)

  const jaT = torusSuccessStatus({ op: 'new', od: 30, td: 8 }, 'ja')
  assert.equal(jaT, 'トーラスを作成しました 外Ø30 管Ø8')
  assert.doesNotMatch(jaT, /Done:/)

  assert.equal(tStatus('已创建球 Ø20', 'ja'), '球を作成しました Ø20')
  assert.equal(tStatus('已创建圆锥 底Ø20 顶Ø0×30', 'ja'), '円錐を作成しました 底Ø20 頂Ø0×30')
  assert.equal(tStatus('已创建圆环 外Ø30 管Ø8', 'ja'), 'トーラスを作成しました 外Ø30 管Ø8')

  assert.match(store, /sphereSuccessStatus\(/)
  assert.match(store, /coneSuccessStatus\(/)
  assert.match(store, /torusSuccessStatus\(/)
})

test('Pins + box JP toast stay fixed', () => {
  assert.match(ribbonSrc, /id: 'insertmesh', label: '插入STL网格'/)
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.match(ribbonSrc, /'🧪實驗室'/)
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.match(ribbon, /日本語/)
  assert.equal(msg('status.dimRejected', 'zh-HK'), '尺寸已拒絕')
  assert.equal(msg('tool.extrude', 'ja'), '押し出し')
  assert.notEqual(msg('tool.fillet', 'ja'), msg('tool.fillet', 'en'))
  assert.ok(allCatalogKeys().includes('help.title'))
  assert.equal(msg('status.boxCreated', 'ja'), 'ボックスを作成しました {0}×{1}×{2}')
  assert.doesNotMatch(msg('status.boxCreated', 'ja'), /Done:|\bBox\b/)
  const jaBox = boxSuccessStatus({ op: 'new', l: 80, w: 60, h: 40 }, 'ja')
  assert.equal(jaBox, 'ボックスを作成しました 80×60×40')
  assert.doesNotMatch(tStatus('已创建长方体 80×60×40', 'ja'), /Done:|\bBox\b/)
})
