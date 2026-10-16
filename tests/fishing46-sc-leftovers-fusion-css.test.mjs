/**
 * FISHING46: Formal TC SC leftovers (~110 UV) + Fusion CSS rhythm + more28 harden.
 * Diversify after FISHING45: not Formal-only — CSS tree/timeline/chip rhythm.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const w = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const csk = readFileSync(new URL('../src/components/CSketch.tsx', import.meta.url), 'utf8')
const ft = readFileSync(new URL('../src/components/FormTransformFields.tsx', import.meta.url), 'utf8')
const skL = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const ai = readFileSync(new URL('../src/components/AiCopilot.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('FISHING46 store: 稜 / 干涉 / 清空 Formal TC (more28 softs)', () => {
  assert.match(st, /頂面稜/)
  assert.match(st, /底面稜/)
  assert.match(st, /豎直稜/)
  assert.match(st, /網格稜長/)
  assert.match(st, /已清空所選稜 — 重新點選邊界稜/)
  assert.match(st, /✓ 無干涉/)
  assert.match(st, /✓ 已清空文檔/)
  assert.match(st, /（沒有明顯焊接線）/)
  assert.doesNotMatch(st, /顶面棱/)
  assert.doesNotMatch(st, /✓ 无干涉/)
  assert.doesNotMatch(st, /已清空所選稜 — 重新點選邊界棱/)
})

test('FISHING46 worker: 陣列 / 移動面 Formal TC', () => {
  assert.match(w, /'矩形陣列'/)
  assert.match(w, /'路徑陣列'/)
  assert.match(w, /'掃掠曲面'/)
  assert.match(w, /'移動面：'/)
  assert.match(w, /⚠ 移動面：/)
  assert.doesNotMatch(w, /'矩形阵列'/)
  assert.doesNotMatch(w, /'移动面：'/)
})

test('FISHING46 Viewport: 邊界稜 / 極坐標 / 透視 / 自適應 Formal', () => {
  assert.match(vp, /label="邊界稜"/)
  assert.match(vp, /逐條點選邊界稜/)
  assert.match(vp, /tStatus\('極坐標'/)
  assert.match(vp, /tStatus\('透視 X-ray'/)
  assert.match(vp, /tStatus\('自適應'/)
  assert.match(vp, /tStatus\('內壓▼'/)
  assert.match(vp, /tStatus\('極點'/)
  assert.match(vp, /tStatus\('全長'/)
  assert.doesNotMatch(vp, /label="邊界棱"/)
  assert.doesNotMatch(vp, /tStatus\('极坐標'/)
  assert.doesNotMatch(vp, /tStatus\('透视 X-ray'/)
  assert.doesNotMatch(vp, /tStatus\('全长'/)
})

test('FISHING46 CSketch / FormTransform / SketchLayer Formal', () => {
  assert.match(csk, /鎖定點的 Y 座標（選 1 點，可雙擊改\/綁參）/)
  assert.match(ft, /控制籠局部座標；也可拖動軸向控制柄。/)
  assert.match(ft, /'應用變換'/)
  assert.match(skL, /顯示為半徑/)
  assert.doesNotMatch(csk, /锁定点的 Y 坐标/)
  assert.doesNotMatch(ft, /控制笼局部坐标/)
  assert.doesNotMatch(ft, /控制籠局部坐標/)
})

test('FISHING46 Fusion CSS: tree / timeline / chip / feat-editor rhythm', () => {
  assert.match(css, /FISHING46: Fusion-like browser tree \/ timeline \/ selection \/ feat-editor rhythm/)
  assert.match(css, /\.tree-row \{ min-height: 24px; height: 24px; gap: 5px; padding: 0 8px; \}/)
  assert.match(css, /\.tl-chip \{ margin-right: 4px; border-radius: 5px; \}/)
  assert.match(css, /\.feat-editor label \{ gap: 8px; \}/)
  assert.match(css, /\.sel-chip \{ letter-spacing: 0\.01em; line-height: 1\.3; \}/)
  assert.match(css, /\.panel-menu-item \{ min-height: 28px; \}/)
})

test('FISHING46 i18n TC aliases', () => {
  assert.match(i18n, /FISHING46 Formal TC UI leftovers/)
  assert.match(i18n, /'極坐標': 'Polar'/)
  assert.match(i18n, /'應用變換': 'Apply Transform'/)
  assert.match(i18n, /控制籠局部座標；也可拖動軸向控制柄。/)
})

test('FISHING45 regression: QA 確定 + FEA report Formal still on tip', () => {
  assert.match(vp, /→ 確定拔模/)
  assert.match(st, /WebCAD 工程分析報告（梁理論·示意，非 3D 有限元）/)
  assert.match(ai, /問我，或叫我做… \(Enter 發送 · Shift\+Enter 換行\)/)
  assert.match(st, /已恢復特徵/)
})
