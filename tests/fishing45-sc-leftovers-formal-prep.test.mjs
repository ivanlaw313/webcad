/**
 * BOT-D more28 / FISHING45 prep — soft→hard Formal TC pins for next
 * SC-LEFTOVERS UI batch still SC on tip 66cb8c3 (post FISHING40–44).
 *
 * Soft: t.skip while SC phrase remains (product not yet converted).
 * Hard: when SC removed and Formal TC present → PASS (no soft).
 * Always-hard: files readable + FISHING40/41/42/43/44 Formal regressions.
 *
 * FISHING45 hardens remaining softs on tip after this prep.
 * Slash: Formal TC may use ASCII `/` or fullwidth `／` (either OK).
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
const aiPath = join(root, 'src/components/AiCopilot.tsx')
const ftPath = join(root, 'src/components/FormTransformFields.tsx')
const hdriPath = join(root, 'src/components/HdriEnvironment.tsx')
const btPath = join(root, 'src/components/BrowserTree.tsx')
const fpPath = join(root, 'src/components/FormPalette.tsx')
const gcodePath = join(root, 'src/components/GcodeBackplot.tsx')

const st = readFileSync(storePath, 'utf8')
const w = readFileSync(workerPath, 'utf8')
const ribbon = readFileSync(ribbonPath, 'utf8')
const vp = readFileSync(viewportPath, 'utf8')
const csk = readFileSync(csketchPath, 'utf8')
const skL = readFileSync(sketchLayerPath, 'utf8')
const cmd = readFileSync(cmdDlgPath, 'utf8')
const ai = readFileSync(aiPath, 'utf8')
const ft = readFileSync(ftPath, 'utf8')
const hdri = readFileSync(hdriPath, 'utf8')
const bt = readFileSync(btPath, 'utf8')
const fp = readFileSync(fpPath, 'utf8')
const gcode = readFileSync(gcodePath, 'utf8')

/** Slash-tolerant includes: ASCII `/` ↔ fullwidth `／`. */
function hasSlashTol(src, s) {
  if (src.includes(s)) return true
  if (s.includes('/')) {
    if (src.includes(s.replace(/\//g, '／'))) return true
  }
  if (s.includes('／')) {
    if (src.includes(s.replace(/／/g, '/'))) return true
  }
  return false
}

/**
 * Soft→hard Formal pin.
 * While SC remains → skip (FISHING45 pending).
 * When SC removed and TC present → hard PASS.
 */
function softRefuse(t, src, sc, tc, where) {
  const hasSC = hasSlashTol(src, sc)
  if (hasSC) {
    t.skip(`FISHING46 pending: still SC «${sc}» (${where})`)
    return
  }
  assert.ok(hasSlashTol(src, tc), `expected Formal TC «${tc}» (or slash alt) in ${where}`)
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

test('FISHING43 regression: Viewport diode / ribbon 稜 / FEA refuse Formal still on tip', () => {
  assert.match(vp, /透明亞克力二極管無法切割/)
  assert.match(vp, /二極管典型 0\.1–0\.2/)
  assert.match(ribbon, /全稜圓角/)
  assert.match(ribbon, /多邊形稜錐/)
  assert.match(st, /⚠ 內螺紋幾何失敗 — 已退回光孔\/原狀/)
  assert.match(w, /環形陣列失敗：/)
  assert.doesNotMatch(vp, /二极管典型/)
  assert.doesNotMatch(ribbon, /全棱圓角/)
})

test('FISHING44 regression: FEA report / CSketch coords / worker offset Formal still on tip', () => {
  assert.match(st, /已恢復特徵/)
  assert.match(st, /WebCAD 模擬分析報告/)
  assert.match(st, /繼續導入？/)
  assert.match(csk, /'X座標'/)
  assert.match(csk, /'Y座標'/)
  assert.match(skL, /'刪除此尺寸'/)
  assert.match(cmd, /清空所選重新點選/)
  assert.match(w, /整體偏移：結果無界 — 已保舊形/)
  assert.match(w, /⚠ 導軌掃掠失敗（/)
  assert.doesNotMatch(st, /WebCAD 仿真分析报告/)
  assert.doesNotMatch(csk, /'X坐标'/)
  assert.doesNotMatch(skL, /'删除此尺寸'/)
})

// ── store soft (status / labels / prompts still SC) ─────────────────

test('Formal TC: store 顶面棱 → 頂面稜', (t) => {
  softRefuse(t, st, '顶面棱', '頂面稜', 'store')
})

test('Formal TC: store 底面棱 → 底面稜', (t) => {
  softRefuse(t, st, '底面棱', '底面稜', 'store')
})

test('Formal TC: store 竖直棱 → 豎直稜', (t) => {
  softRefuse(t, st, '竖直棱', '豎直稜', 'store')
})

test('Formal TC: store 网格棱长 → 網格稜長', (t) => {
  softRefuse(t, st, '网格棱长', '網格稜長', 'store')
})

test('Formal TC: store 已清空所選稜 — 重新點選邊界棱', (t) => {
  softRefuse(
    t,
    st,
    '已清空所選稜 — 重新點選邊界棱',
    '已清空所選稜 — 重新點選邊界稜',
    'store',
  )
})

test('Formal TC: store 掃掠邊鏈 實體棱邊', (t) => {
  softRefuse(
    t,
    st,
    '掃掠邊鏈：先逐條點選相連的實體棱邊',
    '掃掠邊鏈：先逐條點選相連的實體稜邊',
    'store',
  )
})

test('Formal TC: store 屬性檢查器 點面/棱', (t) => {
  softRefuse(
    t,
    st,
    '屬性檢查器：model 模式點面/棱即看屬性（Alt+點=棱）',
    '屬性檢查器：model 模式點面/稜即看屬性（Alt+點=稜）',
    'store',
  )
})

test('Formal TC: store 已建两面中面（斜向 — arb 基准）', (t) => {
  softRefuse(
    t,
    st,
    '已建两面中面（斜向 — arb 基准）',
    '已建兩面中面（斜向 — arb 基準）',
    'store',
  )
})

test('Formal TC: store 已建三点平面（画布选取）', (t) => {
  softRefuse(
    t,
    st,
    '已建三点平面（画布选取）— 画草图时点它做基准',
    '已建三點平面（畫布選取）— 畫草圖時點它做基準',
    'store',
  )
})

test('Formal TC: store 已建过两边平面', (t) => {
  softRefuse(
    t,
    st,
    '已建过两边平面（含两条边）— 画草图时点它做基准',
    '已建過兩邊平面（含兩條邊）— 畫草圖時點它做基準',
    'store',
  )
})

test('Formal TC: store 已建两平行面中间平面', (t) => {
  softRefuse(
    t,
    st,
    '已建两平行面中间平面 — 可继续选择两面建立下一张',
    '已建兩平行面中間平面 — 可繼續選擇兩面建立下一張',
    'store',
  )
})

test('Formal TC: store 已建三点平面（最后 3 个构造点）', (t) => {
  softRefuse(
    t,
    st,
    '已建三点平面（最后 3 个构造点）— 画草图时点它做基准',
    '已建三點平面（最後 3 個構造點）— 畫草圖時點它做基準',
    'store',
  )
})

test('Formal TC: store 取消缝合 Unstitch', (t) => {
  softRefuse(
    t,
    st,
    '取消缝合 Unstitch（拆回独立面）',
    '取消縫合 Unstitch（拆回獨立面）',
    'store',
  )
})

test('Formal TC: store 受力结果查看', (t) => {
  softRefuse(
    t,
    st,
    '受力结果查看 — 可改约束 / 几何后重跑，或按面板取消清除',
    '受力結果查看 — 可改約束 / 幾何後重跑，或按面板取消清除',
    'store',
  )
})

test('Formal TC: store 已对…倒 R8 圆角', (t) => {
  softRefuse(
    t,
    st,
    '已对${scopeOf(edges)}倒 R8 圆角',
    '已對${scopeOf(edges)}倒 R8 圓角',
    'store',
  )
})

test('Formal TC: store 已对…倒 C5 倒角', (t) => {
  softRefuse(
    t,
    st,
    '已对${scopeOf(edges)}倒 C5 倒角',
    '已對${scopeOf(edges)}倒 C5 倒角',
    'store',
  )
})

test('Formal TC: store 已镜像（跨 YZ 平面…）', (t) => {
  softRefuse(
    t,
    st,
    '已镜像（跨 YZ 平面；时间轴可设「对称面偏移」',
    '已鏡像（跨 YZ 平面；時間軸可設「對稱面偏移」',
    'store',
  )
})

test('Formal TC: store （没有明显焊接线）', (t) => {
  softRefuse(t, st, '（没有明显焊接线）', '（沒有明顯焊接線）', 'store')
})

test('Formal TC: store ✓ 无干涉', (t) => {
  softRefuse(t, st, '✓ 无干涉', '✓ 無干涉', 'store')
})

test('Formal TC: store ✓ 已清空文档', (t) => {
  softRefuse(t, st, '✓ 已清空文档', '✓ 已清空文檔', 'store')
})

test('Formal TC: store ✓ 已载入范本', (t) => {
  softRefuse(t, st, '✓ 已载入范本：', '✓ 已載入範本：', 'store')
})

test('Formal TC: store 螺旋/弹簧：', (t) => {
  softRefuse(
    t,
    st,
    '螺旋/弹簧：設直徑/螺距/高/絲徑',
    '螺旋/彈簧：設直徑/螺距/高/絲徑',
    'store',
  )
})

test('Formal TC: store 扇形柱 / 饼塊', (t) => {
  softRefuse(
    t,
    st,
    '扇形柱 / 饼塊：設直徑Ø/角度°/高',
    '扇形柱 / 餅塊：設直徑Ø/角度°/高',
    'store',
  )
})

test('Formal TC: store 楔形 / 斜坡 門挡/支撑', (t) => {
  softRefuse(
    t,
    st,
    '楔形 / 斜坡：設長/寬/高 → 確定。一端高、另一端削平的三角塊。斜坡 / 門挡 / 三角支撑常用',
    '楔形 / 斜坡：設長/寬/高 → 確定。一端高、另一端削平的三角塊。斜坡 / 門擋 / 三角支撐常用',
    'store',
  )
})

test('Formal TC: store 曲面貼花 锉平面', (t) => {
  softRefuse(
    t,
    st,
    '曲面貼花：在活動圓柱面上加凸台/切凹槽/锉平面',
    '曲面貼花：在活動圓柱面上加凸台/切凹槽/銼平面',
    'store',
  )
})

test('Formal TC: store 精度提示 样条／椭圆', (t) => {
  softRefuse(
    t,
    st,
    '；精度提示：此区域包含样条／椭圆等曲线，区域边界使用采样多边形近似，原始草图已保留',
    '；精度提示：此區域包含樣條／橢圓等曲線，區域邊界使用取樣多邊形近似，原始草圖已保留',
    'store',
  )
})

test('Formal TC: store 钻尖', (t) => {
  softRefuse(t, st, '（${incl}°钻尖）', '（${incl}°鑽尖）', 'store')
})

test('Formal TC: store 已拔模 10°（侧面…）', (t) => {
  softRefuse(
    t,
    st,
    '已拔模 10°（侧面，中性面 XY）',
    '已拔模 10°（側面，中性面 XY）',
    'store',
  )
})

// ── worker soft ─────────────────────────────────────────────────────

test("Formal TC: worker '矩形阵列' → '矩形陣列'", (t) => {
  softRefuse(t, w, "'矩形阵列'", "'矩形陣列'", 'worker')
})

test("Formal TC: worker '路径阵列' → '路徑陣列'", (t) => {
  softRefuse(t, w, "'路径阵列'", "'路徑陣列'", 'worker')
})

test("Formal TC: worker '扫掠曲面' → '掃掠曲面'", (t) => {
  softRefuse(t, w, "'扫掠曲面'", "'掃掠曲面'", 'worker')
})

test("Formal TC: worker '移动面：' → '移動面：'", (t) => {
  softRefuse(t, w, "'移动面：'", "'移動面：'", 'worker')
})

test('Formal TC: worker ⚠ 移动面：', (t) => {
  softRefuse(t, w, '⚠ 移动面：', '⚠ 移動面：', 'worker')
})

test('Formal TC: worker Build 失败：', (t) => {
  softRefuse(t, w, 'Build 失败：', 'Build 失敗：', 'worker')
})

test('Formal TC: worker Build 全失败', (t) => {
  softRefuse(t, w, 'Build 全失败', 'Build 全失敗', 'worker')
})

test('Formal TC: worker 读 fillet Shape 失败：', (t) => {
  softRefuse(t, w, '读 fillet Shape 失败：', '讀 fillet Shape 失敗：', 'worker')
})

// ── Viewport soft ───────────────────────────────────────────────────

test('Formal TC: Viewport 填字段 → 确定', (t) => {
  softRefuse(t, vp, '填字段 → 确定', '填字段 → 確定', 'Viewport')
})

test('Formal TC: Viewport 多半徑圓角 — 逐棱半徑', (t) => {
  softRefuse(
    t,
    vp,
    '多半徑圓角 — 逐棱半徑：',
    '多半徑圓角 — 逐稜半徑：',
    'Viewport',
  )
})

test('Formal TC: Viewport 圓孔棱顯示 Ø', (t) => {
  softRefuse(
    t,
    vp,
    '點實體的一條稜（圓孔棱顯示 Ø）',
    '點實體的一條稜（圓孔稜顯示 Ø）',
    'Viewport',
  )
})

test('Formal TC: Viewport 确定拔模', (t) => {
  softRefuse(
    t,
    vp,
    '點【側面】(可多選) → 确定拔模',
    '點【側面】(可多選) → 確定拔模',
    'Viewport',
  )
})

test('Formal TC: Viewport 點選邊界棱', (t) => {
  softRefuse(
    t,
    vp,
    '① 逐條點選邊界棱（≥2，橙點標記）→ 填充/封口',
    '① 逐條點選邊界稜（≥2，橙點標記）→ 填充/封口',
    'Viewport',
  )
})

test('Formal TC: Viewport 确認前會驗證', (t) => {
  softRefuse(
    t,
    vp,
    '① 點選兩張相鄰面；确認前會驗證共同 B-rep 邊',
    '① 點選兩張相鄰面；確認前會驗證共同 B-rep 邊',
    'Viewport',
  )
})

test('Formal TC: Viewport 极坐標陣列', (t) => {
  softRefuse(t, vp, '极坐標陣列', '極坐標陣列', 'Viewport')
})

test('Formal TC: Viewport 按确定建立', (t) => {
  softRefuse(t, vp, '按确定建立', '按確定建立', 'Viewport')
})

test('Formal TC: Viewport 相連的棱邊接力', (t) => {
  softRefuse(t, vp, '相連的棱邊接力', '相連的稜邊接力', 'Viewport')
})

test('Formal TC: Viewport 内压（凹入/孔）', (t) => {
  softRefuse(t, vp, '内压（凹入/孔）', '內壓（凹入/孔）', 'Viewport')
})

test('Formal TC: Viewport 当前折痕（锐边）数', (t) => {
  softRefuse(t, vp, '当前折痕（锐边）数', '當前折痕（銳邊）數', 'Viewport')
})

test('Formal TC: Viewport 沿 X 最小边界面镜像', (t) => {
  softRefuse(t, vp, '沿 X 最小边界面镜像', '沿 X 最小邊界面鏡像', 'Viewport')
})

test('Formal TC: Viewport 适合後續合併', (t) => {
  softRefuse(t, vp, '适合後續合併/切割挖孔', '適合後續合併/切割挖孔', 'Viewport')
})

test('Formal TC: Viewport 折痕软硬', (t) => {
  softRefuse(
    t,
    vp,
    '折痕软硬（semi-sharp crease）',
    '折痕軟硬（semi-sharp crease）',
    'Viewport',
  )
})

test('Formal TC: Viewport 拉伸选中 cage 面', (t) => {
  softRefuse(
    t,
    vp,
    '拉伸选中 cage 面（push-pull）',
    '拉伸選中 cage 面（push-pull）',
    'Viewport',
  )
})

test('Formal TC: Viewport 对称编辑（S193）', (t) => {
  softRefuse(t, vp, '对称编辑（S193）', '對稱編輯（S193）', 'Viewport')
})

test('Formal TC: Viewport 多面壳：切换到下一张', (t) => {
  softRefuse(
    t,
    vp,
    '多面壳：切换到下一张 B-rep 面编辑',
    '多面殼：切換到下一張 B-rep 面編輯',
    'Viewport',
  )
})

test('Formal TC: Viewport 純公差元數据', (t) => {
  softRefuse(t, vp, '純公差元數据', '純公差元數據', 'Viewport')
})

test('Formal TC: Viewport 元數据記錄', (t) => {
  softRefuse(t, vp, '元數据記錄', '元數據記錄', 'Viewport')
})

// ── CSketch / SketchLayer / Form / Ai / misc soft ───────────────────

test('Formal TC: CSketch 锁定点的 Y 坐标', (t) => {
  softRefuse(
    t,
    csk,
    '锁定点的 Y 坐标（选 1 点，可双击改/绑参）',
    '鎖定點的 Y 座標（選 1 點，可雙擊改/綁參）',
    'CSketch',
  )
})

test('Formal TC: CSketch 两条线共線', (t) => {
  softRefuse(
    t,
    csk,
    '两条线共線（在同一直线上，选 2 线）',
    '兩條線共線（在同一直線上，選 2 線）',
    'CSketch',
  )
})

test('Formal TC: CSketch 两圆中心距尺寸', (t) => {
  softRefuse(
    t,
    csk,
    '两圆中心距尺寸（选 2 圆，可双击改/绑参）',
    '兩圓中心距尺寸（選 2 圓，可雙擊改/綁參）',
    'CSketch',
  )
})

test("Formal TC: SketchLayer '删除尺寸'", (t) => {
  softRefuse(t, skL, "'删除尺寸'", "'刪除尺寸'", 'SketchLayer')
})

test('Formal TC: SketchLayer 软尺寸／参考读数', (t) => {
  softRefuse(t, skL, '软尺寸／参考读数', '軟尺寸／參考讀數', 'SketchLayer')
})

test('Formal TC: SketchLayer 显示为半径 R', (t) => {
  softRefuse(t, skL, '显示为半径 R', '顯示為半徑 R', 'SketchLayer')
})

test('Formal TC: SketchLayer 显示为直径 Ø', (t) => {
  softRefuse(t, skL, '显示为直径 Ø', '顯示為直徑 Ø', 'SketchLayer')
})

test('Formal TC: SketchLayer 相切弧手势', (t) => {
  softRefuse(
    t,
    skL,
    '相切弧手势：拖到弧终点后放手',
    '相切弧手勢：拖到弧終點後放手',
    'SketchLayer',
  )
})

test('Formal TC: FormTransform 控制笼局部坐标', (t) => {
  softRefuse(
    t,
    ft,
    '控制笼局部坐标；也可拖动轴向控制柄。',
    '控制籠局部座標；也可拖動軸向控制柄。',
    'FormTransform',
  )
})

test("Formal TC: FormTransform '应用变换'", (t) => {
  softRefuse(t, ft, "'应用变换'", "'應用變換'", 'FormTransform')
})

test('Formal TC: AiCopilot 问我，或叫我做', (t) => {
  softRefuse(
    t,
    ai,
    '问我，或叫我做… (Enter 发送 · Shift+Enter 换行)',
    '問我，或叫我做… (Enter 發送 · Shift+Enter 換行)',
    'AiCopilot',
  )
})

test('Formal TC: AiCopilot 用自然语言控制', (t) => {
  softRefuse(
    t,
    ai,
    '用自然语言控制 / 协助使用 app',
    '用自然語言控制 / 協助使用 app',
    'AiCopilot',
  )
})

test('Formal TC: AiCopilot 做个 60×40×20 的盒', (t) => {
  softRefuse(
    t,
    ai,
    '做个 60×40×20 的盒，中间挖个 Ø20 通孔',
    '做個 60×40×20 的盒，中間挖個 Ø20 通孔',
    'AiCopilot',
  )
})

test('Formal TC: AiCopilot 清空对话', (t) => {
  softRefuse(t, ai, '清空对话', '清空對話', 'AiCopilot')
})

test('Formal TC: AiCopilot 载入齿轮范本', (t) => {
  softRefuse(
    t,
    ai,
    '载入齿轮范本，然后话我知体积',
    '載入齒輪範本，然後話我知體積',
    'AiCopilot',
  )
})

test('Formal TC: HdriEnvironment 触发 fallback', (t) => {
  softRefuse(
    t,
    hdri,
    'HDRI 含非有限像素（NaN/Inf）— 触发 fallback',
    'HDRI 含非有限像素（NaN/Inf）— 觸發 fallback',
    'HdriEnvironment',
  )
})

test('Formal TC: BrowserTree 隱藏其余', (t) => {
  softRefuse(t, bt, '隱藏其余', '隱藏其餘', 'BrowserTree')
})

