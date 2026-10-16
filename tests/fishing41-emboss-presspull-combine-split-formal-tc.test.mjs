/**
 * FISHING41: Formal TC batch from unit/SC-LEFTOVERS.md (UI-priority store /
 * worker / Viewport / ribbon) + emboss / presspull / combine / split messages
 * + Fusion-like combine checklist micro-polish.
 * Approx 30–80 highest-traffic CORE16 + sketch user-visible strings this round.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const w = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
const pt = readFileSync(new URL('../src/components/PathTraceLayer.tsx', import.meta.url), 'utf8')
const hdri = readFileSync(new URL('../src/components/HdriEnvironment.tsx', import.meta.url), 'utf8')

test('SC-LEFTOVERS sample: CORE16 solid / rebuild / fillet Formal TC', () => {
  assert.match(st, /共線角無法倒角/)
  assert.match(st, /弧鄰角不倒角/)
  assert.match(st, /⚠ 重建失敗 — 已保留上一個有效模型，請修正參數後重試/)
  assert.match(st, /圓角失敗（\$\{scopeOf\(edges\)\}可能無可倒邊或半徑過大）/)
  assert.match(st, /倒角失敗（\$\{scopeOf\(edges\)\}可能無可倒邊）/)
  assert.match(st, /「所有稜邊」在此幾何上倒圓角失敗/)
  assert.match(st, /全稜倒圓角 R\$\{r\} 無效/)
  assert.match(st, /全稜倒角 \$\{d\}mm 無效/)
  assert.match(st, /請先點選要\$\{kind === 'chamfer' \? '倒角' : '倒圓角'\}的稜/)
  assert.doesNotMatch(st, /共线角无法倒角/)
  assert.doesNotMatch(st, /重建失败 — 已保留上一个有效模型/)
  assert.doesNotMatch(st, /圆角失败（\$\{scopeOf/)
  assert.doesNotMatch(st, /請先點選要\$\{kind === 'chamfer' \? '倒角' : '倒圓角'\}的棱/)
})

test('SC-LEFTOVERS sample: sketch / datum / hole Formal TC', () => {
  assert.match(st, /圓柱半徑 R mm（草圖曲線沿弧長 θ=x\/R 卷上圓柱，軸=草圖 Y）：/)
  assert.match(st, /投影到圓柱面/)
  assert.match(st, /已建參考平面 \$\{base\}@\$\{off\} — 畫草圖時點它/)
  assert.match(st, /瀏覽器樹裡點它/)
  assert.match(st, /刪除特徵：先在時間軸選特徵/)
  assert.match(st, /已嚴格驗證為無孔軸對齊/)
  assert.match(st, /使用基本體替換/)
  assert.match(st, /⚠ 建模螺紋失敗 — 已回退（可改用淨底孔模式）/)
  assert.match(st, /已鑽通孔 /)
  assert.match(st, /已沉頭孔 /)
  assert.doesNotMatch(st, /圆柱半径 R mm（草图曲线/)
  assert.doesNotMatch(st, /删除特征：先在时间轴/)
  assert.doesNotMatch(st, /已钻通孔 /)
  assert.doesNotMatch(st, /建模螺纹失败/)
})

test('SC-LEFTOVERS sample: prompts / FEA / import Formal TC', () => {
  assert.match(st, /請輸入 1 \/ 2 \/ 3 選擇操作/)
  assert.match(st, /請先在設置（齒輪圖標）填入 API Key/)
  assert.match(st, /真實位置/)
  assert.match(st, /受力雲圖/)
  assert.match(st, /模態分析失敗（查看狀態欄）/)
  assert.match(st, /屈曲分析失敗（查看狀態欄）/)
  assert.match(st, /大型 OBJ 導入/)
  assert.match(st, /STEP B-rep 導入失敗 — 文件可能損壞／非實體 STEP/)
  assert.match(st, /機台噸位需「壓力求解器」模式先算/)
  assert.doesNotMatch(st, /请输入 1 \/ 2 \/ 3 选择操作/)
  assert.doesNotMatch(st, /请用此【真实位置】/)
  assert.doesNotMatch(st, /分析 → 受力云图）点/)
  assert.doesNotMatch(st, /'大型 OBJ 导入'/)
})

test('bodyboolean / Boundary Fill / split / presspull Formal TC', () => {
  assert.match(w, /實體布爾：沒有活動實體/)
  assert.match(w, /實體布爾失敗：/)
  assert.match(w, /Boundary Fill：目標獨有/)
  assert.match(w, /分割面失敗（切割平面與該面不相交）— 保持原樣/)
  assert.match(w, /輪廓分割失敗：/)
  assert.match(w, /合併面失敗：/)
  assert.match(w, /圓柱按拉失敗：/)
  assert.match(w, /分割：平面沒穿過實體 — 已保持原樣/)
  assert.match(w, /齒輪生成失敗：/)
  assert.doesNotMatch(w, /实体布尔：没有活动实体/)
  assert.doesNotMatch(w, /分割面失败（切割平面与该面不相交）/)
  assert.doesNotMatch(w, /圆柱按拉失败：/)
  assert.doesNotMatch(w, /齿轮生成失败：/)
})

test('store emboss + silhouette Formal TC', () => {
  assert.match(st, /輸入要刻的文字（英文／數字，可在時間軸改字號／高度／加料切割）/)
  assert.match(st, /✗ 凹刻需要先有實體承接/)
  assert.match(st, /文字幾何生成失敗/)
  assert.match(st, /輪廓分割未找到可安全分割的圓柱或圓錐輪廓 — 已保持原樣/)
  assert.doesNotMatch(st, /凹刻需要先有实体承接/)
  assert.doesNotMatch(st, /文字几何生成失败/)
})

test('Viewport / PathTrace / HDRI Formal TC sample', () => {
  assert.match(vp, /二極管激光/)
  assert.match(vp, /其餘有效 cell 保留為灰顯獨立實體/)
  assert.match(pt, /畫布內光追啟動失敗/)
  assert.match(hdri, /HDRI 加載／應用失敗/)
  assert.doesNotMatch(vp, /二极管激光/)
  assert.doesNotMatch(pt, /画布内光追启动失败/)
  assert.match(i18n, /"✗ 凹刻需要先有實體承接":/)
})

test('FISHING41 Fusion UI micro-polish CSS (combine checklist)', () => {
  assert.match(css, /FISHING41: Fusion-like combine\/split tool checklist rhythm/)
  assert.match(css, /\.cmd-palette-body label:has\(input\[type=checkbox\]\) \{ gap: 8px; margin: 1px 0; \}/)
})

test('FISHING35 side2 Formal refuse still on tip (live contract)', () => {
  assert.match(vp, /第二側距離不可為 0/)
  assert.match(vp, /extrude-side2-zero-alert/)
  assert.doesNotMatch(vp, /第二侧距离不可为 0/)
})
