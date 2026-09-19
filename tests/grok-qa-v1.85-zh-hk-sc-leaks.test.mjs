/**
 * v1.85: zh-HK residual SC leaks + BOT-D @1.84 BD-8301/8302/8303 leftovers.
 * Nav tips / splash / ParamsPanel / CSketch; Ribbon save/undo; Timeline jump;
 * MeshFit TC label; History autosave label. insertmesh pin retained.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { msg, catalogKeyCount, LOCALES, CATALOGS } from '../src/i18n.ts'
import { tStatus } from '../src/i18n.ts'
import { traditionalToSimplified } from '../src/i18n/tc2sc.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const pp = readFileSync(new URL('../src/components/ParamsPanel.tsx', import.meta.url), 'utf8')
const cs = readFileSync(new URL('../src/components/CSketch.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const ribbonSrc = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const tl = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')

test('APP_VERSION 1.96; SW webcad-v1.96', () => {
  assert.match(version, /APP_VERSION = '1\.96'/)
  assert.match(sw, /const CACHE = 'webcad-v1\.96/)
})

test('catalog parity', () => {
  const counts = LOCALES.map((L) => catalogKeyCount(L))
  assert.equal(new Set(counts).size, 1, `unequal: ${counts}`)
})

test('nav tips TC: 環繞／縮放／適應視窗／左鍵', () => {
  assert.match(vp, /tStatus\('環繞：左鍵旋轉視角'/)
  assert.match(vp, /tStatus\('縮放：左鍵上下拖動縮放'/)
  assert.match(vp, /tStatus\('平移：左鍵拖動平移視圖'/)
  assert.match(vp, /tStatus\('適應視窗'/)
  assert.equal(vp.includes("tStatus('环绕：左键"), false)
  assert.equal(vp.includes("tStatus('适应窗口'"), false)
  assert.equal(tStatus('環繞：左鍵旋轉視角', 'zh-HK'), '環繞：左鍵旋轉視角')
  assert.equal(tStatus('適應視窗', 'zh-HK'), '適應視窗')
  assert.equal(tStatus('適應視窗', 'en'), 'Fit to Window')
  assert.equal(tStatus('適應視窗', 'zh-CN'), '适应视窗')
})

test('splash 開始建模', () => {
  assert.match(vp, /tStatus\('開始建模'/)
  assert.equal(vp.includes("tStatus('开始建模'"), false)
  assert.equal(tStatus('開始建模', 'zh-HK'), '開始建模')
  assert.equal(tStatus('開始建模', 'zh-CN'), '开始建模')
  assert.equal(tStatus('開始建模', 'en'), 'Start Modeling')
})

test('ParamsPanel 用戶參數', () => {
  assert.match(pp, /tStatus\('用戶參數'/)
  assert.equal(pp.includes('用户参数'), false)
  assert.equal(tStatus('用戶參數', 'zh-HK'), '用戶參數')
  assert.equal(tStatus('用戶參數', 'zh-CN'), '用户参数')
})

test('CSketch title 約束草圖', () => {
  assert.match(cs, /tStatus\('約束草圖'/)
  assert.equal(cs.includes('约束草图'), false)
  assert.equal(tStatus('約束草圖', 'zh-HK'), '約束草圖')
  assert.equal(traditionalToSimplified('約束草圖'), '约束草图')
})

test('store setNavTool TC', () => {
  assert.match(store, /環繞：左鍵旋轉視角（中\/右鍵平移）/)
  assert.match(store, /縮放：左鍵上下拖動縮放（滾輪亦可）/)
  assert.equal(store.includes("'环绕：左键旋转视角（中/右键平移）'"), false)
})

test('BD-8301: Ribbon 儲存專案 / 復原; Timeline 開頭/結尾', () => {
  assert.match(ribbon, /msg\('cmd\.actSave', lang\)/)
  assert.match(ribbon, /msg\('cmd\.actUndo', lang\)/)
  assert.equal(ribbon.includes('保存项目'), false)
  assert.equal(ribbon.includes('title="撤销'), false)
  assert.equal(msg('cmd.actSave', 'zh-HK'), '儲存專案 (JSON)')
  assert.equal(msg('cmd.actUndo', 'zh-HK'), '復原')
  assert.equal(msg('cmd.actRedo', 'zh-HK'), '重做')
  assert.match(tl, /tStatus\('跳到開頭（空白）'/)
  assert.match(tl, /tStatus\('跳到結尾（最新）'/)
  assert.equal(tl.includes('跳到开头'), false)
  assert.equal(tl.includes('跳到结尾'), false)
})

test('BD-8302: MeshFit → 網格擬合; insertmesh pin retained', () => {
  assert.equal(msg('tool.meshfit', 'zh-HK'), '網格擬合 / 轉 B-rep')
  assert.equal(msg('cmd.meshfit', 'zh-HK'), '網格擬合 / 轉 B-rep')
  assert.match(ribbonSrc, /label: '網格擬合 \/ 轉 B-rep'/)
  // exempt MESH pin (Solid / prior BOT-D)
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.match(ribbonSrc, /id: 'insertmesh', label: '插入STL网格'/)
})

test('BD-8303: autosave label 自動儲存', () => {
  assert.match(store, /'自動儲存', 'auto'/)
  assert.equal(store.includes("'自动保存', 'auto'"), false)
  assert.match(store, /已恢復上次自動儲存/)
})

test('Pins retained', () => {
  assert.equal(msg('tool.insertmesh', 'zh-HK'), '插入STL网格')
  assert.equal(CATALOGS['zh-HK']['tab.LAB'], '🧪實驗室')
  assert.equal(msg('mm.fit', 'zh-HK'), '適應視窗')
  assert.equal(msg('status.dimRejected', 'zh-HK'), '尺寸已拒絕')
  assert.equal(msg('tool.extrude', 'ja'), '押し出し')
  assert.equal(msg('file.history', 'zh-HK'), '版本歷史…')
  assert.equal(msg('hist.auto', 'zh-HK'), '自動')
})
