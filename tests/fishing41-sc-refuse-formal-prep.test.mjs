/**
 * BOT-D more26 / FISHING41 prep — soft→hard Formal TC pins for high-priority
 * store/worker common refuse / fail / gate strings still SC on tip 9edd246.
 *
 * Soft: t.skip while SC phrase remains (product not yet converted).
 * Hard: when SC gone and Formal TC present → PASS (no soft).
 * Always-hard: files readable + FISHING40 loft/thicken Formal regression.
 *
 * Tests-only — no product/src edits.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const storePath = join(root, 'src/store.ts')
const workerPath = join(root, 'src/worker/cad.worker.ts')

const st = readFileSync(storePath, 'utf8')
const w = readFileSync(workerPath, 'utf8')

/**
 * Soft→hard Formal pin.
 * While SC remains → skip (FISHING41 pending).
 * When SC removed and TC present → hard PASS.
 */
function softRefuse(t, src, sc, tc, where) {
  const hasTC = src.includes(tc)
  const hasSC = src.includes(sc)
  if (hasSC) {
    t.skip(`FISHING41 pending: still SC «${sc}» (${where})`)
    return
  }
  assert.ok(hasTC, `expected Formal TC «${tc}» in ${where}`)
  assert.equal(hasSC, false, `must not keep SC «${sc}» in ${where}`)
}

// ── always-hard sanity ──────────────────────────────────────────────

test('sanity: store.ts + cad.worker.ts readable', () => {
  assert.ok(existsSync(storePath), 'src/store.ts missing')
  assert.ok(existsSync(workerPath), 'src/worker/cad.worker.ts missing')
  assert.ok(st.length > 1000, 'store.ts unexpectedly short')
  assert.ok(w.length > 1000, 'cad.worker.ts unexpectedly short')
})

test('FISHING40 regression: thicken / surfloft Formal TC still on tip', () => {
  assert.match(w, /加厚曲面失敗（MakeThickSolidBySimple 未收斂 — 曲面太扭／自交／厚度過大）— 保持不變/)
  assert.match(w, /曲面放樣需要 ≥2 個開放折線截面/)
  assert.match(w, /已加厚 \$\{Math\.abs\(signed\)\}mm 成實體/)
  assert.doesNotMatch(w, /加厚曲面失败（MakeThickSolidBySimple 未收敛/)
  assert.doesNotMatch(w, /曲面放样需要/)
  assert.match(st, /加厚曲面失敗（曲面太扭／自交／厚度過大）/)
  assert.doesNotMatch(st, /加厚曲面失败（曲面太扭 \/ 自交 \/ 厚度过大）/)
})

// ── store soft refuses (high-priority user-visible) ─────────────────

test('Formal TC: store 共线角无法倒角', (t) => {
  softRefuse(t, st, '共线角无法倒角', '共線角無法倒角', 'store')
})

test('Formal TC: store 重建失败 — 已保留上一个有效模型', (t) => {
  softRefuse(
    t,
    st,
    '⚠ 重建失败 — 已保留上一个有效模型，请修正参数后重试',
    '⚠ 重建失敗 — 已保留上一個有效模型，請修正參數後重試',
    'store',
  )
})

test('Formal TC: store 圆角失败 refuse', (t) => {
  softRefuse(t, st, '圆角失败', '圓角失敗', 'store')
})

test('Formal TC: store 倒角失败 refuse', (t) => {
  softRefuse(t, st, '倒角失败', '倒角失敗', 'store')
})

test('Formal TC: store 文字几何生成失败', (t) => {
  softRefuse(t, st, '文字几何生成失败', '文字幾何生成失敗', 'store')
})

test('Formal TC: store 请输入 1 / 2 / 3 选择操作', (t) => {
  softRefuse(t, st, '请输入 1 / 2 / 3 选择操作', '請輸入 1 / 2 / 3 選擇操作', 'store')
})

test('Formal TC: store 齿轮生成失败', (t) => {
  softRefuse(t, st, '齿轮生成失败', '齒輪生成失敗', 'store')
})

test('Formal TC: store 建模螺纹失败 / 净底孔', (t) => {
  softRefuse(
    t,
    st,
    '⚠ 建模螺纹失败 — 已回退（可改用净底孔模式）',
    '⚠ 建模螺紋失敗 — 已回退（可改用淨底孔模式）',
    'store',
  )
})

test('Formal TC: store 删除特征 confirm title', (t) => {
  softRefuse(t, st, "'删除特征'", "'刪除特徵'", 'store')
})

test('Formal TC: store 使用基本体替换', (t) => {
  softRefuse(t, st, '使用基本体替换', '使用基本體替換', 'store')
})

test('Formal TC: store 沒找到棱 → 稜', (t) => {
  softRefuse(
    t,
    st,
    '沒找到棱（請點在某條棱附近）',
    '沒找到稜（請點在某條稜附近）',
    'store',
  )
})

test('Formal TC: store 「所有棱邊」→「所有稜邊」', (t) => {
  softRefuse(t, st, '「所有棱邊」', '「所有稜邊」', 'store')
})

test('Formal TC: store 邊界補面 棱→稜', (t) => {
  softRefuse(
    t,
    st,
    '邊界補面需要 ≥2 條邊界棱（請逐條點選）',
    '邊界補面需要 ≥2 條邊界稜（請逐條點選）',
    'store',
  )
})

test('Formal TC: store 橋接面失敗 棱→稜', (t) => {
  softRefuse(
    t,
    st,
    '橋接面失敗（兩棱太扭/退化 — 選方向大致同向的兩條棱）',
    '橋接面失敗（兩稜太扭/退化 — 選方向大致同向的兩條稜）',
    'store',
  )
})

// ── worker soft refuses (common, NOT fishing40 thicken/surfloft set) ─

test('Formal TC: worker 面圆角拾面无法解析', (t) => {
  softRefuse(
    t,
    w,
    '面圆角：拾面无法解析 — 已保留原实体',
    '面圓角：拾面無法解析 — 已保留原實體',
    'worker',
  )
})

test('Formal TC: worker 圆角／倒角结果无法显示', (t) => {
  softRefuse(
    t,
    w,
    '圆角／倒角结果无法显示，请缩小尺寸或减少选择的边',
    '圓角／倒角結果無法顯示，請縮小尺寸或減少選擇的邊',
    'worker',
  )
})

test('Formal TC: worker 没有可用的水平顶边', (t) => {
  softRefuse(
    t,
    w,
    '没有可用的水平顶边／底边，请直接选择边',
    '沒有可用的水平頂邊／底邊，請直接選擇邊',
    'worker',
  )
})

test('Formal TC: worker 偏移曲面失败', (t) => {
  softRefuse(
    t,
    w,
    '偏移曲面失败（该面不适合偏移 / 距离过大自交）— 保持原样',
    '偏移曲面失敗（該面不適合偏移 / 距離過大自交）— 保持原樣',
    'worker',
  )
})

test('Formal TC: worker 删面失败', (t) => {
  softRefuse(t, w, '删面失败：', '刪面失敗：', 'worker')
})

test('Formal TC: worker 曲面扫掠失败', (t) => {
  softRefuse(
    t,
    w,
    '曲面扫掠失败（截面/路径无效或扫出无界形）',
    '曲面掃掠失敗（截面／路徑無效或掃出無界形）',
    'worker',
  )
})
