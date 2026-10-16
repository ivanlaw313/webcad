/**
 * BOT-D more27 / FISHING43 prep — soft→hard Formal TC pins for next
 * SC-LEFTOVERS UI batch still SC on tip d7f0b03 (post FISHING40/41/42).
 *
 * Soft: t.skip while SC phrase remains (product not yet converted).
 * Hard: when SC removed and Formal TC present → PASS (no soft).
 * Always-hard: files readable + FISHING40/41/42 Formal regressions.
 *
 * FISHING44 hardens remaining softs on tip after FISHING43 live.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const storePath = join(root, 'src/store.ts')
const workerPath = join(root, 'src/worker/cad.worker.ts')
const ribbonPath = join(root, 'src/ribbon.ts')
const viewportPath = join(root, 'src/components/Viewport.tsx')
const csketchPath = join(root, 'src/components/CSketch.tsx')
const sketchLayerPath = join(root, 'src/components/SketchLayer.tsx')
const cmdDlgPath = join(root, 'src/components/CommandDialog.tsx')

const st = readFileSync(storePath, 'utf8')
const w = readFileSync(workerPath, 'utf8')
const ribbon = readFileSync(ribbonPath, 'utf8')
const vp = readFileSync(viewportPath, 'utf8')
const csk = readFileSync(csketchPath, 'utf8')
const skL = readFileSync(sketchLayerPath, 'utf8')
const cmd = readFileSync(cmdDlgPath, 'utf8')

/**
 * Soft→hard Formal pin.
 * While SC remains → skip (FISHING43 pending).
 * When SC removed and TC present → hard PASS.
 */
function softRefuse(t, src, sc, tc, where) {
  const hasTC = src.includes(tc)
  const hasSC = src.includes(sc)
  if (hasSC) {
    t.skip(`FISHING43 pending: still SC «${sc}» (${where})`)
    return
  }
  assert.ok(hasTC, `expected Formal TC «${tc}» in ${where}`)
  assert.equal(hasSC, false, `must not keep SC «${sc}» in ${where}`)
}

// ── always-hard sanity + prior Formal regressions ───────────────────

test('sanity: UI-priority Formal sources readable', () => {
  assert.ok(existsSync(storePath), 'src/store.ts missing')
  assert.ok(existsSync(workerPath), 'src/worker/cad.worker.ts missing')
  assert.ok(existsSync(ribbonPath), 'src/ribbon.ts missing')
  assert.ok(existsSync(viewportPath), 'src/components/Viewport.tsx missing')
  assert.ok(existsSync(csketchPath), 'src/components/CSketch.tsx missing')
  assert.ok(st.length > 1000 && w.length > 1000)
})

test('FISHING40 regression: thicken / surfloft Formal TC still on tip', () => {
  assert.match(w, /加厚曲面失敗（MakeThickSolidBySimple 未收斂 — 曲面太扭／自交／厚度過大）— 保持不變/)
  assert.match(w, /曲面放樣需要 ≥2 個開放折線截面/)
  assert.doesNotMatch(w, /加厚曲面失败（MakeThickSolidBySimple 未收敛/)
  assert.doesNotMatch(w, /曲面放样需要/)
  assert.match(st, /加厚曲面失敗（曲面太扭／自交／厚度過大）/)
  assert.doesNotMatch(st, /加厚曲面失败（曲面太扭 \/ 自交 \/ 厚度过大）/)
})

test('FISHING41 regression: store refuse + emboss Formal still on tip', () => {
  assert.match(st, /共線角無法倒角/)
  assert.match(st, /⚠ 重建失敗 — 已保留上一個有效模型，請修正參數後重試/)
  assert.match(st, /文字幾何生成失敗/)
  assert.match(st, /請輸入 1 \/ 2 \/ 3 選擇操作/)
  assert.match(st, /齒輪生成失敗/)
  assert.match(st, /沒找到稜（請點在某條稜附近）/)
  assert.doesNotMatch(st, /共线角无法倒角/)
  assert.doesNotMatch(st, /文字几何生成失败/)
})

test('FISHING42 regression: worker facefillet / offset / surfsweep Formal still on tip', () => {
  assert.match(w, /面圓角：拾面無法解析 — 已保留原實體/)
  assert.match(w, /偏移曲面失敗（該面不適合偏移 \/ 距離過大自交）— 保持原樣/)
  assert.match(w, /刪面失敗：/)
  assert.match(w, /曲面掃掠失敗（截面／路徑無效或掃出無界形）/)
  assert.doesNotMatch(w, /面圆角：拾面无法解析 — 已保留原实体/)
  assert.doesNotMatch(w, /偏移曲面失败（该面不适合偏移 \/ 距离过大自交）— 保持原样/)
  assert.doesNotMatch(w, /删面失败：/)
  assert.doesNotMatch(w, /曲面扫掠失败（截面\/路径无效或扫出无界形）/)
})

// ── Viewport soft (laser tooltips) ──────────────────────────────────

test('Formal TC: Viewport 二极管→二極管（無法切割）', (t) => {
  softRefuse(t, vp, '二极管無法切割', '二極管無法切割', 'Viewport')
})

test('Formal TC: Viewport 二极管→二極管（典型 kerf）', (t) => {
  softRefuse(t, vp, '二极管典型', '二極管典型', 'Viewport')
})

// ── CSketch soft (coord constraint labels) ──────────────────────────

test('Formal TC: CSketch X坐标 → X座標', (t) => {
  softRefuse(t, csk, "'X坐标'", "'X座標'", 'CSketch')
})

test('Formal TC: CSketch Y坐标 → Y座標', (t) => {
  softRefuse(t, csk, "'Y坐标'", "'Y座標'", 'CSketch')
})

test('Formal TC: CSketch 锁定点的 X 坐标 title', (t) => {
  softRefuse(
    t,
    csk,
    '锁定点的 X 坐标（选 1 点，可双击改/绑参）',
    '鎖定點的 X 座標（選 1 點，可雙擊改/綁參）',
    'CSketch',
  )
})

// ── ribbon soft (tab / labels / tips 棱→稜 · 仿真→模擬 · 趋势→趨勢) ─

test("Formal TC: ribbon tab name: '仿真' → '模擬'", (t) => {
  softRefuse(t, ribbon, "name: '仿真'", "name: '模擬'", 'ribbon')
})

test('Formal TC: ribbon 趋势模擬 → 趨勢模擬', (t) => {
  softRefuse(t, ribbon, '趋势模擬', '趨勢模擬', 'ribbon')
})

test("Formal TC: ribbon label: '棱錐' → '稜錐'", (t) => {
  softRefuse(t, ribbon, "label: '棱錐'", "label: '稜錐'", 'ribbon')
})

test("Formal TC: ribbon label: '棱柱' → '稜柱'", (t) => {
  softRefuse(t, ribbon, "label: '棱柱'", "label: '稜柱'", 'ribbon')
})

test("Formal TC: ribbon '全棱圓角' → '全稜圓角'", (t) => {
  softRefuse(t, ribbon, "'全棱圓角'", "'全稜圓角'", 'ribbon')
})

test("Formal TC: ribbon '全棱倒角' → '全稜倒角'", (t) => {
  softRefuse(t, ribbon, "'全棱倒角'", "'全稜倒角'", 'ribbon')
})

test('Formal TC: ribbon 點選棱 → 點選稜', (t) => {
  softRefuse(t, ribbon, '點選棱（可多條）', '點選稜（可多條）', 'ribbon')
})

// ── store soft (import / FEA / thread / feature) ─────────────────────

test('Formal TC: store 内螺纹几何失败', (t) => {
  softRefuse(
    t,
    st,
    '⚠ 内螺纹几何失败 — 已退回光孔/原状（OCCT-wasm 螺旋布尔限制）',
    '⚠ 內螺紋幾何失敗 — 已退回光孔/原狀（OCCT-wasm 螺旋布爾限制）',
    'store',
  )
})

test('Formal TC: store 已恢复特征', (t) => {
  softRefuse(t, st, "'已恢复特征'", "'已恢復特徵'", 'store')
})

test('Formal TC: store 继续导入？', (t) => {
  softRefuse(t, st, '继续导入？', '繼續導入？', 'store')
})

test('Formal TC: store 体素趋势级', (t) => {
  softRefuse(t, st, '体素趋势级 ≈±5%', '體素趨勢級 ≈±5%', 'store')
})

test('Formal TC: store 该载荷方向不会屈曲', (t) => {
  softRefuse(t, st, '该载荷方向不会屈曲', '該載荷方向不會屈曲', 'store')
})

test('Formal TC: store WebCAD 仿真分析报告', (t) => {
  softRefuse(
    t,
    st,
    'WebCAD 仿真分析报告',
    'WebCAD 模擬分析報告',
    'store',
  )
})

// ── worker soft (outside facefillet/offset/surfsweep set) ───────────

test('Formal TC: worker 导轨扫掠失败', (t) => {
  softRefuse(t, w, '⚠ 导轨扫掠失败（', '⚠ 導軌掃掠失敗（', 'worker')
})

test('Formal TC: worker 环形阵列失败：', (t) => {
  softRefuse(t, w, "'环形阵列失败：'", "'環形陣列失敗：'", 'worker')
})

test('Formal TC: worker 删面失败（面@… long form still SC', (t) => {
  softRefuse(t, w, '⚠ 删面失败（面@', '⚠ 刪面失敗（面@', 'worker')
})

// ── SketchLayer / CommandDialog soft ────────────────────────────────

test('Formal TC: SketchLayer 删除此尺寸', (t) => {
  softRefuse(t, skL, "'删除此尺寸'", "'刪除此尺寸'", 'SketchLayer')
})

test('Formal TC: CommandDialog 清空所选重新点选', (t) => {
  softRefuse(t, cmd, '清空所选重新点选', '清空所選重新點選', 'CommandDialog')
})
