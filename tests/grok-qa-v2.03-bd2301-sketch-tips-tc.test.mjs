/**
 * v2.03 BD-2301: sketch-adjacent high-exposure tips SC→港繁.
 * APP 2.03 + SW webcad-v2.03.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const csk = readFileSync(new URL('../src/components/CSketch.tsx', import.meta.url), 'utf8')
const sl = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const dei = readFileSync(new URL('../src/sketch/dimensionEditInput.ts', import.meta.url), 'utf8')
const cd = readFileSync(new URL('../src/sketch/constrainedDrag.ts', import.meta.url), 'utf8')
const ced = readFileSync(new URL('../src/sketch/constrainedEdgeDrag.ts', import.meta.url), 'utf8')
const ext = readFileSync(new URL('../src/sketch/extendTransaction.ts', import.meta.url), 'utf8')
const rib = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const bt = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

const stripComments = (s) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')

test('APP_VERSION 2.03; SW webcad-v2.03', () => {
  assert.match(version, /APP_VERSION = '2\.03'/)
  assert.match(sw, /const CACHE = 'webcad-v2\.03'/)
})

test('App Esc cancel tip is 港繁', () => {
  assert.match(app, /已取消當前繪製（再按 Esc 清選擇 \/ 退出）/)
  const noComments = stripComments(app)
  assert.doesNotMatch(noComments, /已取消当前绘制/)
  assert.doesNotMatch(noComments, /清选择 \/ 退出/)
})

test('CSketch toolbar titles / prompts are 港繁', () => {
  assert.match(csk, /修剪：點線段 → 刪到最近交點/)
  assert.match(csk, /延伸：點線段靠近想延長嘅一端/)
  assert.match(csk, /打斷：點線段中間 → 一分為二/)
  assert.match(csk, /鏡像：先選要鏡像嘅實體（線\/圓）/)
  assert.match(csk, /矩形陣列：先選實體（線\/圓）/)
  assert.match(csk, /環形陣列：先選實體（線\/圓）/)
  assert.match(csk, /旋轉：先選要轉嘅實體（線\/圓）/)
  assert.match(csk, /投影實體：把現有 3D 實體嘅外形矩形/)
  assert.match(csk, /刪除所選/)
  assert.match(csk, /新建 \/ 加料實體/)
  assert.match(csk, /修剪\/打斷/)
  assert.match(csk, /⊟ 打斷/)
  const noComments = stripComments(csk)
  assert.doesNotMatch(noComments, /点线段/)
  assert.doesNotMatch(noComments, /打断：/)
  assert.doesNotMatch(noComments, /镜像：先选/)
  assert.doesNotMatch(noComments, /矩形阵列：/)
  assert.doesNotMatch(noComments, /环形阵列：/)
  assert.doesNotMatch(noComments, /投影实体：/)
  assert.doesNotMatch(noComments, /删除所选/)
  assert.doesNotMatch(noComments, /加料实体/)
  assert.doesNotMatch(noComments, /修剪\/打断/)
})

test('SketchLayer dim\/constraint tips are 港繁', () => {
  assert.match(sl, /⚠ 衝突約束 — 點擊移除以解開過約束/)
  assert.match(sl, /從動尺寸（量度值）— 點擊改值即轉驅動/)
  assert.match(sl, /點擊修改尺寸 · 輸入公式可引用其他尺寸/)
  assert.match(sl, /約束（點擊選中 → Delete 移除）/)
  assert.match(sl, /轉為驅動尺寸/)
  assert.match(sl, /轉為從動（參考）尺寸/)
  assert.match(sl, /title="驅動尺寸"/)
  const noComments = stripComments(sl)
  assert.doesNotMatch(noComments, /冲突约束/)
  assert.doesNotMatch(noComments, /从动尺寸（量度值）/)
  assert.doesNotMatch(noComments, /点击修改尺寸/)
  assert.doesNotMatch(noComments, /约束（点击选中/)
  assert.doesNotMatch(noComments, /转为驱动尺寸/)
  assert.doesNotMatch(noComments, /转为从动/)
  assert.doesNotMatch(noComments, /title="驱动尺寸"/)
})

test('dimensionEditInput error strings are 港繁', () => {
  assert.match(dei, /尺寸無法計算；請檢查數值、單位及語法/)
  assert.match(dei, /參數尺寸數值無效/)
  assert.match(dei, /尺寸循環引用，已拒絕/)
  assert.match(dei, /公式無法計算或結果無效/)
  assert.match(dei, /請輸入完整尺寸/)
  assert.doesNotMatch(dei, /尺寸无法计算/)
  assert.doesNotMatch(dei, /参数尺寸数值无效/)
  assert.doesNotMatch(dei, /尺寸循环引用/)
  assert.doesNotMatch(dei, /公式无法计算/)
  assert.doesNotMatch(dei, /请输入完整尺寸/)
})

test('constrainedDrag \/ constrainedEdgeDrag reasons are 港繁', () => {
  assert.match(cd, /拖動點不可用/)
  assert.match(cd, /約束引用的線段已不存在，請先修復草圖關係/)
  assert.match(cd, /約束目標沒有共同可行位置/)
  assert.match(cd, /拖動約束求解失敗/)
  assert.match(cd, /其他尺寸或關係阻止此拖動/)
  assert.match(ced, /拖動目標無效/)
  assert.match(ced, /整條邊拖動必須保持長度和方向/)
  assert.match(ced, /兩端約束不允許同一剛性平移/)
  assert.match(ced, /整條邊約束求解失敗/)
  assert.doesNotMatch(cd, /拖动点不可用/)
  assert.doesNotMatch(cd, /约束引用的线段已不存在/)
  assert.doesNotMatch(ced, /拖动目标无效/)
  assert.doesNotMatch(ced, /整条边拖动/)
})

test('extendTransaction failure reasons are 港繁', () => {
  assert.match(ext, /延伸目標無效，草圖未更改/)
  assert.match(ext, /延伸目標路徑不可用，草圖未更改/)
  assert.match(ext, /延伸求解失敗，草圖未更改/)
  assert.match(ext, /現有約束阻止延伸，草圖未更改/)
  assert.match(ext, /端點無法到達延伸目標/)
  assert.doesNotMatch(ext, /延伸目标无效/)
  assert.doesNotMatch(ext, /延伸求解失败/)
  assert.doesNotMatch(ext, /现有约束阻止延伸/)
  assert.doesNotMatch(ext, /端点无法到达/)
})

test('Ribbon B-rep \/ union titles are 港繁', () => {
  assert.match(rib, /保留 B-rep 入時間軸：導入後可繼續 切割\/圓角\/抽殼/)
  assert.match(rib, /真布爾合併單殼（manifold union）/)
  assert.doesNotMatch(rib, /入时间轴：导入后可继续/)
  assert.doesNotMatch(rib, /真布尔合并单壳/)
})

test('BrowserTree 圓柱 + 無法自動更新 tip', () => {
  assert.match(bt, /tStatus\('圓柱', lang\)/)
  assert.match(bt, /無法自動更新此基準/)
  assert.match(bt, /關聯基準：隨源面自動更新/)
  assert.doesNotMatch(stripComments(bt), /tStatus\('圆柱', lang\)/)
  assert.doesNotMatch(bt, /无法自動更新/)
})

test('i18n has TC + legacy SC sketch-tip keys', () => {
  assert.match(i18n, /v2\.03 BD-2301/)
  assert.match(i18n, /已取消當前繪製（再按 Esc 清選擇 \/ 退出）/)
  assert.match(i18n, /已取消当前绘制（再按 Esc 清选择 \/ 退出）/)
  assert.match(i18n, /⚠ 衝突約束 — 點擊移除以解開過約束/)
  assert.match(i18n, /⚠ 冲突约束 — 点击移除以解开过约束/)
  assert.match(i18n, /尺寸無法計算；請檢查數值、單位及語法/)
  assert.match(i18n, /尺寸无法计算；请检查数值、单位及语法/)
  assert.match(i18n, /延伸目標無效，草圖未更改/)
  assert.match(i18n, /延伸目标无效，草图未更改/)
  assert.match(i18n, /無法自動更新此基準/)
  assert.match(i18n, /无法自動更新此基准/)
})
