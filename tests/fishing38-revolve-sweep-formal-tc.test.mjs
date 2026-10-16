/**
 * FISHING38 P1: Formal Traditional Chinese for revolve cut-through residual
 * (BUG-SO17) + sweep hollow-wall fallback + twist/draft mutex warnings.
 * Worker buildWarnings / throw messages must not ship Simplified Chinese.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const w = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')

test('extrude: draft fail + twist/draft mutex are Formal TC', () => {
  assert.match(w, /拔模 \$\{draftDeg\}° 失敗（輪廓偏移自相交／太陡）— 已改為直拉伸/)
  assert.match(w, /扭轉與拔模不可同時使用，已只應用扭轉/)
  assert.doesNotMatch(w, /扭转与拔模不可同时使用/)
  assert.doesNotMatch(w, /已改为直拉伸/)
})

test('revolve BUG-SO17 + refuse paths are Formal TC (no SC)', () => {
  assert.match(w, /旋轉：軸方向為零向量 — 已用世界 Y 軸/)
  assert.match(w, /旋轉：角度必須 > 0（值 ' \+ ang \+ '° 非法，可能參數驅動繞過 UI 下限）— 已用整圈 360°/)
  assert.match(w, /旋轉：截面跨軸 — 已按預覽側半平面重建（BUG-SO17-001）/)
  assert.match(w, /旋轉：已用與預覽同側的軸向鏡像／半平面完成相交（BUG-SO17-001）/)
  assert.match(w, /旋轉截面跨過了旋轉軸 — 把截面移到軸的一側/)
  assert.match(w, /旋轉失敗 — 截面相對軸退化（已保留原模型）/)
  assert.match(w, /旋轉薄壁 \$\{f\.wall\} 太厚，已減薄到 \$\{t\.toFixed\(1\)\} 才成功/)
  assert.match(w, /旋轉相交區域為空 — 旋轉體與現有實體沒有重疊（已保留原模型）/)
  assert.match(w, /旋轉切割未改實體 — 車削體未切入材料（已保留原模型）/)
  assert.doesNotMatch(w, /旋转：截面跨轴/)
  assert.doesNotMatch(w, /旋转：已用与预览同侧/)
  assert.doesNotMatch(w, /旋转切割未改实体/)
  assert.doesNotMatch(w, /车削体未切入材料/)
  assert.doesNotMatch(w, /buildWarnings\.push\('旋转：/)
  assert.doesNotMatch(w, /buildWarnings\.push\(`旋转/)
})

test('sweep hollow-wall fallback warnings are Formal TC', () => {
  assert.match(w, /⚠ 3D 掃掠空心壁 \$\{f\.wall\}mm 失敗，已退回實心（請減小壁厚或加大半徑）/)
  assert.match(w, /⚠ 掃掠空心壁 \$\{f\.wall\}mm 失敗，已退回實心（請減小壁厚或加大半徑）/)
  assert.doesNotMatch(w, /3D 扫掠空心壁/)
  assert.doesNotMatch(w, /试减壁厚或加大半径/)
  assert.doesNotMatch(w, /扫掠空心壁 \$\{f\.wall\}/)
})
