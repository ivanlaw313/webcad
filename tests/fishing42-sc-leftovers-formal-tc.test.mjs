/**
 * FISHING42: next Formal TC batch from SC-LEFTOVERS (UI-priority worker /
 * ribbon refuse/fail/gate) — face fillet, offset/delete/extend/replace face,
 * surf extrude/sweep/trim, sketch-source, draft/scale, plus more26 soft pins
 * hardened. ~70–80 convertible strings this round.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const w = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('FISHING42 more26 soft pins hardened: facefillet / fillet display / horiz edges', () => {
  assert.match(w, /面圓角：拾面無法解析 — 已保留原實體/)
  assert.match(w, /圓角／倒角結果無法顯示，請縮小尺寸或減少選擇的邊/)
  assert.match(w, /沒有可用的水平頂邊／底邊，請直接選擇邊/)
  assert.doesNotMatch(w, /面圆角：拾面无法解析 — 已保留原实体/)
  assert.doesNotMatch(w, /圆角／倒角结果无法显示，请缩小尺寸或减少选择的边/)
  assert.doesNotMatch(w, /没有可用的水平顶边／底边，请直接选择边/)
})

test('FISHING42 more26 soft pins hardened: offset / deleteface / surfsweep', () => {
  assert.match(w, /偏移曲面失敗（該面不適合偏移 \/ 距離過大自交）— 保持原樣/)
  assert.match(w, /刪面失敗：/)
  assert.match(w, /曲面掃掠失敗（截面／路徑無效或掃出無界形）/)
  assert.doesNotMatch(w, /偏移曲面失败（该面不适合偏移 \/ 距离过大自交）— 保持原样/)
  assert.doesNotMatch(w, /删面失败：/)
  assert.doesNotMatch(w, /曲面扫掠失败（截面\/路径无效或扫出无界形）/)
})

test('FISHING42 face fillet family Formal TC', () => {
  assert.match(w, /面圓角：實體無面 — 已保留原實體/)
  assert.match(w, /面圓角：兩次拾中同一張面 — 請拾兩張不同的面/)
  assert.match(w, /面圓角：兩張面沒有共同 B-rep 邊 — 當前可靠模式只支持相鄰面；已保留原實體/)
  assert.match(w, /面圓角：面指紋無法唯一解析，已退回原拾面點/)
  assert.doesNotMatch(w, /面圆角：实体无面 — 已保留原实体/)
  assert.doesNotMatch(w, /面圆角：两次拾中同一张面/)
})

test('FISHING42 offset / extend / replace / move-face Formal TC', () => {
  assert.match(w, /偏移曲面失敗：/)
  assert.match(w, /曲面延伸失敗（該面不適合延伸 \/ 長度過大）— 保持原樣/)
  assert.match(w, /替換面失敗（平面與實體不相交 \/ 退化）— 保持原樣/)
  assert.match(w, /移動面傾斜：面三角化失敗 — 跳過/)
  assert.match(w, /移動面失敗：/)
  assert.doesNotMatch(w, /偏移曲面失败：/)
  assert.doesNotMatch(w, /替换面失败（平面与实体不相交/)
  assert.doesNotMatch(w, /移动面失败：/)
})

test('FISHING42 surf extrude / sweep / trim / untrim Formal TC', () => {
  assert.match(w, /曲面拉伸失敗（截面無效）/)
  assert.match(w, /曲面掃掠：路徑無效（需 ≥2 點開放折線）/)
  assert.match(w, /平面裁剪失敗（結果無界）— 保持不變/)
  assert.match(w, /曲面裁剪失敗（裁刀與曲面不相交 \/ general-fuse 返空）— 保持不變/)
  assert.match(w, /去裁失敗（重建結果空 \/ 縫合返回空）— 曲面保持不變/)
  assert.match(w, /極點編輯失敗（重建殼為空）— 保持不變/)
  assert.doesNotMatch(w, /曲面拉伸失败（截面无效）/)
  assert.doesNotMatch(w, /曲面扫掠：路径无效/)
  assert.doesNotMatch(w, /平面裁剪失败（结果无界）/)
  assert.doesNotMatch(w, /极点编辑失败（重建壳为空）/)
})

test('FISHING42 sketch-source / draft / scale Formal TC', () => {
  assert.match(w, /草圖來源面失效：來源實體不存在/)
  assert.match(w, /草圖來源面失效或有歧義：請修復面關聯；已保留原模型/)
  assert.match(w, /不對稱圓角：請至少選擇一條邊/)
  assert.match(w, /非等比縮放失敗 — 已保持原形/)
  assert.match(w, /拔模失敗（邊已被圓角\/倒角吃掉或側面識別失敗）— 已保留原形/)
  assert.doesNotMatch(w, /草图来源面失效：来源实体不存在/)
  assert.doesNotMatch(w, /不对称圆角：请至少选择一条边/)
  assert.doesNotMatch(w, /非等比缩放失败 — 已保持原形/)
})

test('FISHING42 ribbon + boundary-fill 棱→稜 + i18n aliases', () => {
  assert.match(ribbon, /橋接（FORM T-spline）：尚未支援 — 請用實體\/曲面「橋接面」對實體稜。/)
  assert.doesNotMatch(ribbon, /對實體棱。/)
  assert.match(w, /邊界補面：拾邊無法解析足夠稜（≥2）— 保持不變/)
  assert.doesNotMatch(w, /拾邊無法解析足夠棱（≥2）/)
  assert.match(i18n, /"偏移曲面失敗（該面不適合偏移 \/ 距離過大自交）":/)
  assert.match(i18n, /"刪面失敗（面不是可去的特徵 \/ 治愈失敗）":/)
})

test('FISHING41 regression: emboss/combine/split Formal still on tip', () => {
  assert.match(w, /實體布爾：沒有活動實體/)
  assert.match(st, /✗ 凹刻需要先有實體承接/)
  assert.match(st, /共線角無法倒角/)
  assert.doesNotMatch(w, /实体布尔：没有活动实体/)
})

test('FISHING35 side2 Formal refuse still on tip', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /第二側距離不可為 0/)
  assert.match(vp, /extrude-side2-zero-alert/)
})
