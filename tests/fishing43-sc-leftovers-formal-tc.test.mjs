/**
 * FISHING43: next Formal TC batch from SC-LEFTOVERS (UI-priority store /
 * worker / Viewport / ribbon refuse/status) — mirror / delete-offset-move face /
 * draft / circular pattern / FEA-moldflow refuses + ribbon 棱→稜.
 * ~70–90 convertible strings this round.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const w = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

test('FISHING43 worker: mirror / Rule Fillet / delete-face Formal TC', () => {
  assert.match(w, /⚠ 鏡像（新實體）：副本為空 — 已跳過/)
  assert.match(w, /⚠ 鏡像：實體橫跨鏡像面/)
  assert.match(w, /Rule Fillet：兩組面之間沒有共同邊/)
  assert.match(w, /Rule Fillet：所選面沒有可倒圓邊界/)
  assert.match(w, /⚠ 刪面失敗（面@\$\{P\.map/)
  assert.match(w, /去特徵／治愈失敗/)
  assert.doesNotMatch(w, /⚠ 镜像（新实体）：副本为空 — 已跳过/)
  assert.doesNotMatch(w, /两组面之间没有共同边/)
  assert.doesNotMatch(w, /去特无法征/)
})

test('FISHING43 worker: offset / move-face / draft / circular pattern Formal TC', () => {
  assert.match(w, /整體偏移：距離為零 — 已跳過/)
  assert.match(w, /⚠ 移動面（朝內\/傾斜）需要 plus 內核/)
  assert.match(w, /拔模：角度過小（\$\{f\.angle\}°，<0\.01°）— 已跳過/)
  assert.match(w, /環形陣列：軸方向為零向量 — 已跳過/)
  assert.match(w, /環形陣列失敗：/)
  assert.match(w, /⚠ 特徵令實體變空（零體積）— 已回滾/)
  assert.doesNotMatch(w, /整体偏移：距离为零 — 已跳过/)
  assert.doesNotMatch(w, /环形阵列失败：/)
  assert.doesNotMatch(w, /特征令实体变空/)
})

test('FISHING43 worker: gear / spring / rib / section Formal TC', () => {
  assert.match(w, /⚠ 齒輪 z\$\{z\}<17：20° 壓力角下少齒數會根切/)
  assert.match(w, /⚠ 彈簧節距 \$\{f\.pitch\}<線徑/)
  assert.match(w, /⚠ 筋拔模角 \$\{ribDraft\}° 過大（接近 90°）— 頂部半寬已鉗到最小/)
  assert.match(w, /相交曲線需要 plus 內核（BRepAlgoAPI_Section 未綁定）/)
  assert.doesNotMatch(w, /⚠ 齿轮 z\$\{z\}<17/)
  assert.doesNotMatch(w, /已钳到最小/)
})

test('FISHING43 store: FEA / moldflow / AI refuse Formal TC', () => {
  assert.match(st, /⚠ 該方向不會屈曲（受拉\/方向相反）/)
  assert.match(st, /⚠ 偏險\(1≤SF<2\)/)
  assert.match(st, /⚠ 適用性：零件偏厚\/實心/)
  assert.match(st, /⚠ 內螺紋幾何失敗 — 已退回光孔\/原狀/)
  assert.match(st, /✗ 需要 module\/teeth1\/teeth2 正數/)
  assert.match(st, /✗ 未知計算類型：/)
  assert.match(st, /⚠ AI 出錯：/)
  assert.doesNotMatch(st, /⚠ 该方向不会屈曲/)
  assert.doesNotMatch(st, /⚠ 偏险\(1≤SF<2\)/)
  assert.doesNotMatch(st, /✗ 未知计算类型：/)
})

test('FISHING43 Viewport + ribbon 棱→稜 / labels Formal TC', () => {
  assert.match(vp, /多邊形稜柱/)
  assert.match(vp, /pyramid: '稜錐'/)
  assert.match(vp, /二極管典型 0\.1–0\.2/)
  assert.match(vp, /透明亞克力二極管無法切割/)
  assert.match(ribbon, /全稜圓角/)
  assert.match(ribbon, /全稜倒角/)
  assert.match(ribbon, /多邊形稜錐/)
  assert.match(ribbon, /正多邊形稜柱/)
  assert.doesNotMatch(ribbon, /全棱圓角/)
  assert.doesNotMatch(vp, /二极管典型/)
})

test('FISHING43 i18n TC aliases + CSS micro-polish (no testid churn)', () => {
  assert.match(i18n, /"⚠ 該方向不會屈曲（受拉\/方向相反）":/)
  assert.match(i18n, /"✗ 未知計算類型：":/)
  assert.match(i18n, /"環形陣列失敗 — 檢查軸位置\/方向、數量，或目標特徵是否仍存在":/)
  assert.match(css, /FISHING43: Fusion-like status refuse/)
  assert.match(css, /extrude-side2-zero-alert/)
  // no new data-testid introduced in this round
  assert.doesNotMatch(css, /data-testid="fishing43/)
})

test('FISHING42 regression: facefillet / offset Formal still on tip', () => {
  assert.match(w, /面圓角：拾面無法解析 — 已保留原實體/)
  assert.match(w, /偏移曲面失敗（該面不適合偏移 \/ 距離過大自交）— 保持原樣/)
  assert.match(w, /曲面掃掠失敗（截面／路徑無效或掃出無界形）/)
})

test('FISHING35 side2 Formal refuse still on tip', () => {
  assert.match(vp, /第二側距離不可為 0/)
  assert.match(vp, /extrude-side2-zero-alert/)
})
