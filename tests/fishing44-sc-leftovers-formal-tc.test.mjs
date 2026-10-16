/**
 * FISHING44: next Formal TC batch from SC-LEFTOVERS (UI-priority store /
 * worker user-visible + residual more27 softs: CSketch coords, SketchLayer,
 * CommandDialog, FEA report/import refuses).
 * ~60–100 convertible strings this round; harden more27 soft prep.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const w = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const csk = readFileSync(new URL('../src/components/CSketch.tsx', import.meta.url), 'utf8')
const skL = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const cmd = readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('FISHING44 store: FEA report / import / feature restore Formal TC', () => {
  assert.match(st, /已恢復特徵/)
  assert.match(st, /繼續導入？/)
  assert.match(st, /體素趨勢級 ≈±5%/)
  assert.match(st, /該載荷方向不會屈曲/)
  assert.match(st, /WebCAD 模擬分析報告/)
  assert.match(st, /大型網格導入/)
  assert.match(st, /該方向不會屈曲（受拉／方向相反）/)
  assert.doesNotMatch(st, /'已恢复特征'/)
  assert.doesNotMatch(st, /继续导入？/)
  assert.doesNotMatch(st, /WebCAD 仿真分析报告/)
  assert.doesNotMatch(st, /该载荷方向不会屈曲/)
})

test('FISHING44 store: moldflow / sample / measure Formal TC', () => {
  assert.match(st, /WebCAD 模流報告（真 2\.5D Hele-Shaw/)
  assert.match(st, /模流趨勢報告\.txt/)
  assert.match(st, /已載入【\$\{_loadingSample\}】範本/)
  assert.match(st, /非特徵稜/)
  assert.match(st, /圓孔稜顯示直徑/)
  assert.match(st, /現有稜（可多條，≥2）/)
  assert.match(st, /掃掠特徵已重生成/)
  assert.doesNotMatch(st, /WebCAD 模流报告（真 2\.5D/)
  assert.doesNotMatch(st, /已载入【\$\{_loadingSample\}】范本/)
})

test('FISHING44 worker: offset / moveface / trim / pole Formal TC', () => {
  assert.match(w, /整體偏移：結果無界 — 已保舊形/)
  assert.match(w, /移動面：內核朝內重解退化/)
  assert.match(w, /曲面旋轉：軸方向為零向量/)
  assert.match(w, /⚠ 導軌掃掠失敗（/)
  assert.match(w, /極點編輯：\$\{t\.name\} 改了 \$\{moved\} 個控制點/)
  assert.match(w, /圓角（逐邊半徑）/)
  assert.match(w, /倒角（逐邊距離）/)
  assert.match(w, /'活動實體'/)
  assert.doesNotMatch(w, /⚠ 导轨扫掠失败（/)
  assert.doesNotMatch(w, /整体偏移：结果无界/)
  assert.doesNotMatch(w, /极点编辑：\$\{t\.name\} 改了 \$\{moved\} 个控制点/)
})

test('FISHING44 CSketch / SketchLayer / CommandDialog Formal TC (more27 softs)', () => {
  assert.match(csk, /'X座標'/)
  assert.match(csk, /'Y座標'/)
  assert.match(csk, /鎖定點的 X 座標（選 1 點，可雙擊改\/綁參）/)
  assert.match(skL, /'刪除此尺寸'/)
  assert.match(cmd, /清空所選重新點選/)
  assert.doesNotMatch(csk, /'X坐标'/)
  assert.doesNotMatch(csk, /'Y坐标'/)
  assert.doesNotMatch(skL, /'删除此尺寸'/)
  assert.doesNotMatch(cmd, /清空所选重新点选/)
})

test('FISHING44 i18n TC aliases for restored feature / FEA report / clear-pick', () => {
  assert.match(i18n, /"已恢復特徵":/)
  assert.match(i18n, /"WebCAD 模擬分析報告（體素趨勢級 FEA/)
  assert.match(i18n, /清空所選重新點選/)
})

test('FISHING43 regression: mirror / circular / FEA refuse still Formal', () => {
  assert.match(w, /⚠ 鏡像（新實體）：副本為空 — 已跳過/)
  assert.match(w, /環形陣列失敗：/)
  assert.match(st, /⚠ 該方向不會屈曲（受拉\/方向相反）/)
  assert.match(st, /⚠ 內螺紋幾何失敗 — 已退回光孔\/原狀/)
})
