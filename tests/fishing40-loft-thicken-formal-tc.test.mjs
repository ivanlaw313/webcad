/**
 * FISHING40: Formal Traditional Chinese for loft / surfloft / thickenquilt /
 * stitch / ruled / bridge-thicken / boundary-thicken residuals + loft dialog
 * 「直紋邊界曲面」label + Fusion-like command dialog / panel-label micro-polish.
 * Worker buildWarnings / parked names / store prompts must not ship Simplified Chinese.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const w = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('thickenquilt buildWarnings are Formal TC (no SC)', () => {
  assert.match(w, /⚠ 加厚曲面：找不到目標曲面 #/)
  assert.match(w, /⚠ 加厚曲面：目標曲面 #\$\{f\.target \+ 1\} 為空 — 保持不變/)
  assert.match(w, /⚠ 加厚曲面需要 BRepOffsetAPI_MakeThickSolid（未綁定）— 已跳過/)
  assert.match(w, /加厚實體（\$\{t\.name\}）/)
  assert.match(w, /已加厚 \$\{Math\.abs\(signed\)\}mm 成實體/)
  assert.match(w, /加厚曲面：結果無界 — 已 fail-safe 保持不變/)
  assert.match(w, /加厚曲面失敗（MakeThickSolidBySimple 未收斂 — 曲面太扭／自交／厚度過大）— 保持不變/)
  assert.match(w, /加厚曲面失敗：/)
  assert.doesNotMatch(w, /加厚曲面：找不到目标曲面/)
  assert.doesNotMatch(w, /加厚实体（/)
  assert.doesNotMatch(w, /成实体\$\{/)
  assert.doesNotMatch(w, /加厚曲面失败（MakeThickSolidBySimple 未收敛/)
  assert.doesNotMatch(w, /加厚曲面需要 BRepOffsetAPI_MakeThickSolid（未绑定）/)
  assert.doesNotMatch(w, /加厚曲面：找不到目标曲面/)
})

test('surfloft / ruled / stitch / surfrevolve warnings are Formal TC', () => {
  assert.match(w, /曲面放樣需要 ≥2 個開放折線截面/)
  assert.match(w, /name: '放樣曲面'/)
  assert.match(w, /放樣曲面失敗（截面無效／ThruSections 返空）/)
  assert.match(w, /曲面放樣失敗：/)
  assert.match(w, /規則曲面需要 ≥2 條開放折線截面/)
  assert.match(w, /name: '規則曲面'/)
  assert.match(w, /規則曲面失敗（截面無效／ThruSections 返空）/)
  assert.match(w, /縫合：沒有曲面／殼體可縫 — 先做曲面放樣／補面／加厚／偏移曲面/)
  assert.match(w, /縫合成閉合實體/)
  assert.match(w, /name: '旋轉曲面'/)
  assert.match(w, /曲面旋轉失敗（截面無效／截面貼軸／旋出無界形）/)
  assert.doesNotMatch(w, /曲面放样需要/)
  assert.doesNotMatch(w, /name: '放样曲面'/)
  assert.doesNotMatch(w, /规则曲面需要/)
  assert.doesNotMatch(w, /name: '规则曲面'/)
  assert.doesNotMatch(w, /缝合：没有曲面/)
  assert.doesNotMatch(w, /name: '旋转曲面'/)
  assert.doesNotMatch(w, /曲面旋转失败/)
})

test('bridge / boundary thicken fallbacks are Formal TC', () => {
  assert.match(w, /⚠ 橋接面加厚 \$\{f\.thick\}mm 失敗 — 已退回淨曲面片/)
  assert.match(w, /⚠ 邊界補面加厚 \$\{f\.thick\}mm 失敗 — 已退回淨曲面片/)
  assert.match(w, /橋接面失敗（ThruSections 未收斂/)
  assert.match(w, /邊界補面失敗（MakeFilling 未收斂/)
  assert.doesNotMatch(w, /桥接面加厚 \$\{f\.thick\}mm 失败/)
  assert.doesNotMatch(w, /边界补面加厚 \$\{f\.thick\}mm 失败/)
  assert.doesNotMatch(w, /已退回净曲面片/)
})

test('loft dialog ruled label + i18n Formal TC', () => {
  assert.match(vp, /tStatus\('直紋邊界曲面', lang\)/)
  assert.match(i18n, /'直紋邊界曲面': 'Ruled boundary surface'/)
  assert.doesNotMatch(vp, /tStatus\('直纹边界曲面'/)
  assert.doesNotMatch(i18n, /'直纹边界曲面':/)
})

test('store thicken / surf prompts Formal TC', () => {
  assert.match(st, /加厚曲面失敗（曲面太扭／自交／厚度過大）/)
  assert.match(st, /板厚 mm（正／負 = 兩側）/)
  assert.match(st, /沿曲面法向加厚成實體；負值／前綴「-」= 朝反側/)
  assert.match(st, /曲面旋轉（開放截面繞軸 → 零厚旋轉曲面殼/)
  assert.match(st, /曲面放樣（\$\{secs\.length\} 個開放截面）/)
  assert.match(st, /縫合曲面 Stitch（閉合則轉實體）/)
  assert.doesNotMatch(st, /tStatus\('曲面旋转（开放截面绕轴/)
  assert.doesNotMatch(st, /加厚曲面失败（曲面太扭 \/ 自交 \/ 厚度过大）/)
  assert.doesNotMatch(st, /缝合曲面 Stitch（闭合则转实体）/)
})

test('FISHING40 Fusion UI micro-polish CSS present (dialog field rhythm)', () => {
  assert.match(css, /FISHING40: Fusion-like command dialog field rhythm/)
  assert.match(css, /\.cmd-palette-body \{ gap: 8px; padding: 10px 14px; \}/)
  assert.match(css, /\.panel-label \{ padding-top: 2px; letter-spacing: 0\.02em; \}/)
})

test('FISHING35 side2 Formal refuse still on tip (live contract)', () => {
  assert.match(vp, /第二側距離不可為 0/)
  assert.match(vp, /extrude-side2-zero-alert/)
  assert.doesNotMatch(vp, /第二侧距离不可为 0/)
})
