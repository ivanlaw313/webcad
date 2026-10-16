/**
 * FISHING45: larger Formal TC SC-LEFTOVERS batch (~150 UI-priority strings).
 * store calc/FEA/moldflow/draft + Viewport tips + AiCopilot + SketchLayer;
 * QA-reported SC 确定 → Formal 確定.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const w = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const st = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const skL = readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8')
const ai = readFileSync(new URL('../src/components/AiCopilot.tsx', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

test('FISHING45 QA: 确定 → 確定 in draft / pick / extrude / typed Enter', () => {
  assert.match(vp, /→ 確定拔模/)
  assert.match(vp, /按確定建立/)
  assert.match(vp, /填字段 → 確定/)
  assert.match(st, /拔模角 → 確定（或取消）/)
  assert.match(st, /\(Enter 確定\)/)
  assert.match(st, /命令欄「確定拔模」/)
  assert.doesNotMatch(vp, /→ 确定拔模/)
  assert.doesNotMatch(vp, /按确定建立/)
  assert.doesNotMatch(vp, /填字段 → 确定/)
  assert.doesNotMatch(st, /拔模角 → 确定（或取消）/)
})

test('FISHING45 store: FEA / moldflow / eng report Formal TC', () => {
  assert.match(st, /WebCAD 工程分析報告（梁理論·示意，非 3D 有限元）/)
  assert.match(st, /模流分析報告  Mold Flow Report/)
  assert.match(st, /模擬分析報告\.txt/)
  assert.match(st, /滾珠軸承 — 內徑Ø/)
  assert.match(st, /內六角螺絲/)
  assert.match(st, /齒輪嚙合速查/)
  assert.match(st, /螺紋規格速查/)
  assert.match(st, /壓縮彈簧速查/)
  assert.match(st, /皮帶長度（兩輪）/)
  assert.doesNotMatch(st, /WebCAD 工程分析报告（梁理论/)
  assert.doesNotMatch(st, /模流分析报告  Mold Flow Report/)
  assert.doesNotMatch(st, /仿真分析报告\.txt/)
  assert.doesNotMatch(st, /滚珠轴承 — 内径/)
  assert.doesNotMatch(st, /内六角螺丝/)
})

test('FISHING45 store: calc prompts / moldflow notes Formal TC', () => {
  assert.match(st, /螺栓夾緊力：M 號/)
  assert.match(st, /方法：真 2\.5D Hele-Shaw 壓力求解器（工程級估算）/)
  assert.match(st, /趨勢級 Dijkstra/)
  assert.match(st, /未指定澆口，已自動放在頂部中心/)
  assert.doesNotMatch(st, /螺栓夹紧力：M 号/)
  assert.doesNotMatch(st, /方法：真 2\.5D Hele-Shaw 压力求解器（工程级估算）/)
  assert.doesNotMatch(st, /方法：趋势级 Dijkstra/)
})

test('FISHING45 Viewport: subdiv / FOV / sweep-path / draft tips Formal TC', () => {
  assert.match(vp, /折痕軟硬（semi-sharp crease）/)
  assert.match(vp, /廣角夸張透視/)
  assert.match(vp, /相連的稜邊接力/)
  assert.match(vp, /極坐標陣列/)
  assert.match(vp, /確認前會驗證共同 B-rep 邊/)
  assert.match(vp, /適合後續合併\/切割挖孔/)
  assert.match(vp, /熔體入口溫度（留空 = 材料 \$\{moldMat\} 預設/)
  assert.doesNotMatch(vp, /折痕软硬（semi-sharp crease）/)
  assert.doesNotMatch(vp, /广角夸張透視/)
  assert.doesNotMatch(vp, /相連的棱邊接力/)
  assert.doesNotMatch(vp, /极坐標陣列/)
  assert.doesNotMatch(vp, /确認前會驗證共同 B-rep 邊/)
})

test('FISHING45 AiCopilot / SketchLayer Formal TC', () => {
  assert.match(ai, /問我，或叫我做… \(Enter 發送 · Shift\+Enter 換行\)/)
  assert.match(ai, /用自然語言控制 \/ 協助使用 app/)
  assert.match(ai, /做個 60×40×20 的盒，中間挖個 Ø20 通孔/)
  assert.match(skL, /相切弧手勢：拖到弧終點後放手/)
  assert.doesNotMatch(ai, /问我，或叫我做… \(Enter 发送/)
  assert.doesNotMatch(ai, /用自然语言控制/)
  assert.doesNotMatch(skL, /相切弧手势：拖到弧终点后放手/)
})

test('FISHING45 i18n TC aliases for draft / AI / reports', () => {
  assert.match(i18n, /拔模②：點要加斜度的【側面】\(可多點選\)，再按命令欄「確定拔模」/)
  assert.match(i18n, /問我，或叫我做… \(Enter 發送 · Shift\+Enter 換行\)/)
  assert.match(i18n, /模流分析報告  Mold Flow Report/)
  assert.match(i18n, /WebCAD 工程分析報告（梁理論·示意，非 3D 有限元）/)
})

test('FISHING44 regression: restore / FEA / worker Formal still present', () => {
  assert.match(st, /已恢復特徵/)
  assert.match(st, /WebCAD 模擬分析報告/)
  assert.match(w, /⚠ 導軌掃掠失敗（/)
  assert.match(w, /整體偏移：結果無界 — 已保舊形/)
})
