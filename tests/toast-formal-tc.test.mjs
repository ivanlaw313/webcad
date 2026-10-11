/**
 * Success/error toast Formal Traditional Chinese (HK written) — no SC leftovers
 * in high-traffic applyFeatures / HINT / LOFT_MSG / loft thin-wall warnings.
 * APP_VERSION stays 2.20.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { LOFT_MSG } from '../src/cad/loftBuild.ts'
import { simplifiedToTraditionalHK } from '../src/i18n/sc2tcHK.ts'

const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('APP_VERSION 2.20', () => {
  assert.match(version, /APP_VERSION = '2\.20'/)
})

test('loft commit success suffix is Formal TC (no SC 直纹/导轨/闭环)', () => {
  assert.match(store, /·直紋邊界曲面/)
  assert.match(store, /·導軌/)
  assert.match(store, /·閉環/)
  assert.match(store, /切線'\}連續/)
  assert.match(store, /頂'\}點封口/)
  assert.doesNotMatch(store, /·直纹边界曲面/)
  assert.doesNotMatch(store, /·导轨/)
  assert.doesNotMatch(store, /·闭环/)
  assert.doesNotMatch(store, /切线'\}连续/)
  assert.doesNotMatch(store, /顶'\}点封口/)
})

test('rebuild HINT error toasts are Formal TC', () => {
  assert.match(store, /放樣截面不相容/)
  assert.match(store, /掃掠失敗/)
  assert.match(store, /圓角半徑太大/)
  assert.match(store, /抽殼壁厚 ≥ 零件最薄處/)
  assert.match(store, /環形陣列失敗/)
  assert.doesNotMatch(store, /放样截面不兼容/)
  assert.doesNotMatch(store, /扫掠失败/)
  assert.doesNotMatch(store, /圆角半径太大/)
  assert.doesNotMatch(store, /抽壳壁厚 ≥ 零件最薄处/)
  assert.doesNotMatch(store, /环形阵列失败/)
})

test('fillet/shell/pattern success+error toasts are Formal TC', () => {
  assert.match(store, /已對 \$\{pts\.length\} 條稜/)
  assert.match(store, /已對所有稜倒圓角/)
  assert.match(store, /已抽殼（壁厚 4，開頂面）/)
  assert.match(store, /已矩形陣列 2×2/)
  assert.match(store, /全部計算完成（時間軸已由頭重建）/)
  assert.doesNotMatch(store, /已对 \$\{pts\.length\} 条棱/)
  assert.doesNotMatch(store, /已对所有棱倒圆角/)
  assert.doesNotMatch(store, /已抽壳（壁厚 4，开顶面）/)
  assert.doesNotMatch(store, /已矩形阵列 2×2/)
  assert.doesNotMatch(store, /全部计算完成（时间轴已由头重建）/)
})

test('LOFT_MSG coincident uses Formal 與 (not colloquial 同)', () => {
  assert.match(LOFT_MSG.coincident(1, 2), /第 1 與第 2/)
  assert.doesNotMatch(LOFT_MSG.coincident(1, 2), /同第/)
})

test('loft thin-wall failure warning is Formal TC', () => {
  assert.match(worker, /請減小薄壁厚度或簡化截面/)
  assert.doesNotMatch(worker, /試減薄壁厚或簡化截面/)
})


test('sweep success status strings are Formal TC (no SC 实体/草图, no dangling em-dash)', () => {
  // Success toast aligned with status bar: 實體（草圖截面）— drop 任意
  assert.match(store, /實體（草圖截面）/)
  assert.doesNotMatch(store, /實體（任意草圖截面）/)
  assert.doesNotMatch(store, /任意草圖截面/)  // success toast must not say 任意
  assert.match(store, /圓管（管徑 Ø\$\{dia\}）/)
  assert.match(store, /跟導軌轉向/)
  assert.match(store, /導軌已忽略（爬升優先）/)
  assert.doesNotMatch(store, /实体（任意草图截面 —）/)
  assert.doesNotMatch(store, /实体（草图截面）/)
  assert.doesNotMatch(store, /（草图截面）/)
  assert.doesNotMatch(store, /任意草图截面 —/)
  assert.doesNotMatch(store, /任意草圖截面 —/)
  assert.doesNotMatch(store, /跟导轨转向/)
  assert.doesNotMatch(store, /导轨已忽略（爬升优先）/)
})

test('sc2tcHK still maps legacy SC toast fragments', () => {
  assert.equal(simplifiedToTraditionalHK('已对所有棱倒圆角'), '已對所有稜倒圓角')
  assert.equal(simplifiedToTraditionalHK('直纹边界曲面'), '直紋邊界曲面')
})
