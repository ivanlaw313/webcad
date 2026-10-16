/**
 * FISHING48 / harden more29 Formal softs — soft→hard Formal TC pins for next
 * SC-LEFTOVERS UI batch still SC on tip 59b4c75 (post FISHING40–46).
 *
 * Soft: t.skip while SC remains; after FISHING48 product Formal → hard PASS.
 * Hard: when SC removed and Formal TC present → PASS (no soft).
 * Always-hard: files readable + FISHING40–46 Formal regressions.
 *
 * FISHING48 hardens remaining softs after FISHING47 (store/Ai/Viewport/worker residual).
 * Slash: Formal TC may use ASCII `/` or fullwidth `／` (either OK).
 * Note: webcad-fishing47 already has hard Formal fusion-css; this prep
 * soft→hard pins on tip 6861151 + FISHING48 Formal residual UV.
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
const aiPath = join(root, 'src/components/AiCopilot.tsx')
const wtgPath = join(root, 'src/components/WindTunnelGpu.tsx')
const smokePath = join(root, 'src/components/WindSmoke.tsx')
const gcodePath = join(root, 'src/components/GcodeBackplot.tsx')

const st = readFileSync(storePath, 'utf8')
const w = readFileSync(workerPath, 'utf8')
const ribbon = readFileSync(ribbonPath, 'utf8')
const vp = readFileSync(viewportPath, 'utf8')
const csk = readFileSync(csketchPath, 'utf8')
const skL = readFileSync(sketchLayerPath, 'utf8')
const ai = readFileSync(aiPath, 'utf8')
const wtg = readFileSync(wtgPath, 'utf8')
const smoke = readFileSync(smokePath, 'utf8')
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
 * While SC remains → skip (FISHING48 pending).
 * When SC removed and TC present → hard PASS.
 */
function softRefuse(t, src, sc, tc, where) {
  const hasSC = hasSlashTol(src, sc)
  if (hasSC) {
    t.skip(`FISHING48 pending: still SC «${sc}» (${where})`)
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
  assert.ok(existsSync(wtgPath), 'src/components/WindTunnelGpu.tsx missing')
  assert.ok(existsSync(smokePath), 'src/components/WindSmoke.tsx missing')
  assert.ok(st.length > 1000 && w.length > 1000 && wtg.length > 1000)
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
  assert.match(w, /整體偏移：結果無界 — 已保舊形/)
  assert.match(w, /⚠ 導軌掃掠失敗（/)
  assert.doesNotMatch(st, /WebCAD 仿真分析报告/)
  assert.doesNotMatch(csk, /'X坐标'/)
  assert.doesNotMatch(skL, /'删除此尺寸'/)
})

test('FISHING45/46 regression: more28 Formal TC batch still on tip', () => {
  assert.match(st, /頂面稜/)
  assert.match(st, /底面稜/)
  assert.match(st, /豎直稜/)
  assert.match(st, /✓ 無干涉/)
  assert.match(st, /✓ 已清空文檔/)
  assert.match(st, /（沒有明顯焊接線）/)
  assert.match(w, /'矩形陣列'/)
  assert.match(w, /'移動面：'/)
  assert.match(vp, /tStatus\('極坐標'/)
  assert.match(vp, /label="邊界稜"/)
  assert.doesNotMatch(st, /顶面棱/)
  assert.doesNotMatch(st, /✓ 无干涉/)
  assert.doesNotMatch(w, /'矩形阵列'/)
  assert.doesNotMatch(vp, /tStatus\('极坐標'/)
})

test('FISHING46 regression: AiCopilot / Viewport 確定拔模 Formal still on tip', () => {
  assert.match(ai, /問我，或叫我做… \(Enter 發送 · Shift\+Enter 換行\)/)
  assert.match(vp, /→ 確定拔模/)
  assert.doesNotMatch(ai, /问我，或叫我做/)
})

// ── WindTunnelGpu soft (FISHING47 Formal core) ──────────────────────

test('Formal TC: WindTunnelGpu 格直径／边界层', (t) => {
  softRefuse(
    t,
    wtg,
    '格直径，边界层无法解，测此没有意义',
    '格直徑，邊界層無法解，測此沒有意義',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu 一条反弹 link', (t) => {
  softRefuse(
    t,
    wtg,
    '★ 一条反弹 link 都没有 —— 条流根本无法掂零件（phi 上传错了？）',
    '★ 一條反彈 link 都沒有 —— 條流根本無法掂零件（phi 上傳錯了？）',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu 分配失败 dispose', (t) => {
  softRefuse(
    t,
    wtg,
    '★ 分配失败要自己 dispose 自己（walk-down 的前提）',
    '★ 分配失敗要自己 dispose 自己（walk-down 的前提）',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu 用完即弃 context', (t) => {
  softRefuse(
    t,
    wtg,
    '用完即弃该个 context 无法撑起五个 RGBA32F：',
    '用完即棄該個 context 無法撐起五個 RGBA32F：',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu 张 texture walk-down', (t) => {
  softRefuse(
    t,
    wtg,
    ' 张 texture —— walk-down 无法救',
    ' 張 texture —— walk-down 無法救',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu 测试无效', (t) => {
  softRefuse(
    t,
    wtg,
    '测试无效，换个更大的尺寸',
    '測試無效，換個更大的尺寸',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu 密度扰动', (t) => {
  softRefuse(t, wtg, '密度扰动', '密度擾動', 'WindTunnelGpu')
})

test('Formal TC: WindTunnelGpu 如此均匀', (t) => {
  softRefuse(t, wtg, '如此均匀', '如此均勻', 'WindTunnelGpu')
})

test('Formal TC: WindTunnelGpu 五个 RGBA32F clear', (t) => {
  softRefuse(
    t,
    wtg,
    '★ 五个 RGBA32F 要真是 clear 得（不止 COMPLETE）',
    '★ 五個 RGBA32F 要真是 clear 得（不止 COMPLETE）',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu 应该是 WebGL2', (t) => {
  softRefuse(t, wtg, '应该是 WebGL2', '應該是 WebGL2', 'WindTunnelGpu')
})

test('Formal TC: WindTunnelGpu 起码要试四组', (t) => {
  softRefuse(t, wtg, '起码要试四组', '起碼要試四組', 'WindTunnelGpu')
})

test('Formal TC: WindTunnelGpu RGBA32F 画得但没有', (t) => {
  softRefuse(
    t,
    wtg,
    'RGBA32F 画得但没有 EXT_color_buffer_float？',
    'RGBA32F 畫得但沒有 EXT_color_buffer_float？',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu GPU 不支援五个', (t) => {
  softRefuse(
    t,
    wtg,
    'GPU 不支援五个 RGBA32F：',
    'GPU 不支援五個 RGBA32F：',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu substep 数不正确', (t) => {
  softRefuse(t, wtg, 'substep 数不正确：', 'substep 數不正確：', 'WindTunnelGpu')
})

test('Formal TC: WindTunnelGpu 空盒密度扰动', (t) => {
  softRefuse(
    t,
    wtg,
    '★ 空盒生出了密度扰动：max|delta| = ',
    '★ 空盒生出了密度擾動：max|delta| = ',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu 空盒横向速度', (t) => {
  softRefuse(
    t,
    wtg,
    '★ 空盒生出了横向速度：max|uy,uz| = ',
    '★ 空盒生出了橫向速度：max|uy,uz| = ',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu Cd 趋势级', (t) => {
  softRefuse(
    t,
    wtg,
    '★ GPU：球的 Cd 落在 Clift-Gauvin ±50% 之内（趋势级）',
    '★ GPU：球的 Cd 落在 Clift-Gauvin ±50% 之內（趨勢級）',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu Cd 样本 readback', (t) => {
  softRefuse(
    t,
    wtg,
    ' 个 Cd 样本 —— async readback 没有回东西？',
    ' 個 Cd 樣本 —— async readback 沒有回東西？',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu Cd 不是一个正数', (t) => {
  softRefuse(t, wtg, 'Cd 不是一个正数（', 'Cd 不是一個正數（', 'WindTunnelGpu')
})

test('Formal TC: WindTunnelGpu 动量交换符号', (t) => {
  softRefuse(
    t,
    wtg,
    '）—— 动量交换的符号反了？',
    '）—— 動量交換的符號反了？',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu 分配失败之后仍漏低', (t) => {
  softRefuse(
    t,
    wtg,
    '分配失败之后仍漏低了 ',
    '分配失敗之後仍漏低了 ',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu 正常建构应该', (t) => {
  softRefuse(
    t,
    wtg,
    '正常建构应该真是取了 texture',
    '正常建構應該真是取了 texture',
    'WindTunnelGpu',
  )
})

test('Formal TC: WindTunnelGpu dispose 之后仲有', (t) => {
  softRefuse(
    t,
    wtg,
    'dispose() 之后仲有 texture 未放',
    'dispose() 之後仲有 texture 未放',
    'WindTunnelGpu',
  )
})

// ── WindSmoke soft (FISHING47 Formal) ───────────────────────────────

test('Formal TC: WindSmoke cell-centre 坐标', (t) => {
  softRefuse(t, smoke, 'cell-centre 坐标', 'cell-centre 座標', 'WindSmoke')
})

test('Formal TC: WindSmoke 会编译失败', (t) => {
  softRefuse(t, smoke, '会编译失败', '會編譯失敗', 'WindSmoke')
})

// ── store soft (FISHING47 Formal + residual UV) ─────────────────────

test('Formal TC: store 所有棱边 → 所有稜邊', (t) => {
  softRefuse(t, st, '所有棱边', '所有稜邊', 'store')
})

test('Formal TC: store 参数化底板', (t) => {
  softRefuse(t, st, '参数化底板', '參數化底板', 'store')
})

test('Formal TC: store 渐开线齿轮', (t) => {
  softRefuse(t, st, '渐开线齿轮', '漸開線齒輪', 'store')
})

test('Formal TC: store 六角头螺栓', (t) => {
  softRefuse(t, st, '六角头螺栓', '六角頭螺栓', 'store')
})

test('Formal TC: store 蜂窝镂空板', (t) => {
  softRefuse(t, st, '蜂窝镂空板', '蜂窩鏤空板', 'store')
})

test('Formal TC: store 插入紧固件', (t) => {
  softRefuse(t, st, '插入紧固件', '插入緊固件', 'store')
})

test('Formal TC: store L 型角铁', (t) => {
  softRefuse(t, st, 'L 型角铁', 'L 型角鐵', 'store')
})

test('Formal TC: store 阶梯轴', (t) => {
  softRefuse(t, st, '阶梯轴', '階梯軸', 'store')
})

test('Formal TC: store 垫圈/环', (t) => {
  softRefuse(t, st, '垫圈/环', '墊圈/環', 'store')
})

test('Formal TC: store 平键 DIN6885', (t) => {
  softRefuse(t, st, '平键 DIN6885', '平鍵 DIN6885', 'store')
})

test('Formal TC: store 紧固件规格', (t) => {
  softRefuse(t, st, '紧固件规格', '緊固件規格', 'store')
})

test('Formal TC: store 紧固件长度', (t) => {
  softRefuse(t, st, '紧固件长度', '緊固件長度', 'store')
})

test('Formal TC: store ✓ 已设材质', (t) => {
  softRefuse(t, st, '✓ 已设材质：', '✓ 已設材質：', 'store')
})

test('Formal TC: store ✓ 已导出', (t) => {
  softRefuse(t, st, '✓ 已导出 ', '✓ 已導出 ', 'store')
})

test('Formal TC: store 已缩放', (t) => {
  softRefuse(t, st, '已缩放 ×${fac}', '已縮放 ×${fac}', 'store')
})

test('Formal TC: store 已载入压缩弹簧', (t) => {
  softRefuse(
    t,
    st,
    '已载入压缩弹簧（线径Ø${d} 中径Ø${D} 节距${pitch} 有效圈${na.toFixed(1)}）— 刚度 k≈${k.toFixed(1)} N/mm · 旋绕比 C=${C.toFixed(1)} · Wahl Kw=${Kw.toFixed(2)} · 最大安全载荷≈${Fmax.toFixed(0)}N（τ許≈600MPa；時間軸改尺寸）',
    '已載入壓縮彈簧（線徑Ø${d} 中徑Ø${D} 節距${pitch} 有效圈${na.toFixed(1)}）— 剛度 k≈${k.toFixed(1)} N/mm · 旋繞比 C=${C.toFixed(1)} · Wahl Kw=${Kw.toFixed(2)} · 最大安全載荷≈${Fmax.toFixed(0)}N（τ許≈600MPa；時間軸改尺寸）',
    'store',
  )
})

test('Formal TC: store 销约束已改', (t) => {
  softRefuse(t, st, '销约束已改', '銷約束已改', 'store')
})

test('Formal TC: store 轴承载荷已改', (t) => {
  softRefuse(t, st, '轴承载荷已改', '軸承載荷已改', 'store')
})

test('Formal TC: store 约束／工况已改', (t) => {
  softRefuse(t, st, '约束／工况已改', '約束／工況已改', 'store')
})

test('Formal TC: store 已改悬臂约束', (t) => {
  softRefuse(t, st, '已改悬臂约束', '已改懸臂約束', 'store')
})

test('Formal TC: store 已改简支梁约束', (t) => {
  softRefuse(t, st, '已改简支梁约束', '已改簡支梁約束', 'store')
})

test('Formal TC: store MeshFit / 转 B-rep', (t) => {
  softRefuse(t, st, 'MeshFit / 转 B-rep', 'MeshFit / 轉 B-rep', 'store')
})

test("Formal TC: store '锉平面'", (t) => {
  softRefuse(t, st, "'锉平面'", "'銼平面'", 'store')
})

test("Formal TC: store '外扩'", (t) => {
  softRefuse(t, st, "'外扩'", "'外擴'", 'store')
})

test("Formal TC: store '内缩'", (t) => {
  softRefuse(t, st, "'内缩'", "'內縮'", 'store')
})

test("Formal TC: store '棱台'", (t) => {
  softRefuse(t, st, "'棱台'", "'稜台'", 'store')
})

test("Formal TC: store '棱锥'", (t) => {
  softRefuse(t, st, "'棱锥'", "'稜錐'", 'store')
})

test('Formal TC: store 已解绑参数', (t) => {
  softRefuse(t, st, '已解绑参数', '已解綁參數', 'store')
})

test('Formal TC: store 网格孔径Ø', (t) => {
  softRefuse(t, st, '网格孔径Ø', '網格孔徑Ø', 'store')
})

test('Formal TC: store 斜参考面', (t) => {
  softRefuse(t, st, '斜参考面', '斜參考面', 'store')
})

test('Formal TC: store 角点邻段退化', (t) => {
  softRefuse(t, st, '角点邻段退化', '角點鄰段退化', 'store')
})

test('Formal TC: store 几何已改', (t) => {
  softRefuse(t, st, '几何已改', '幾何已改', 'store')
})

test('Formal TC: store ■ 焊接线', (t) => {
  softRefuse(t, st, '■ 焊接线', '■ 焊接線', 'store')
})

test('Formal TC: store 俯视充填时间图', (t) => {
  softRefuse(t, st, '俯视充填时间图', '俯視充填時間圖', 'store')
})

test('Formal TC: store 充填时间：早', (t) => {
  softRefuse(t, st, '充填时间：早', '充填時間：早', 'store')
})

test('Formal TC: store 云图紫红色位', (t) => {
  softRefuse(
    t,
    st,
    '（云图紫红色位 — 留意外观/强度）',
    '（雲圖紫紅色位 — 留意外觀/強度）',
    'store',
  )
})

test('Formal TC: store 云图橙色位 排气槽', (t) => {
  softRefuse(
    t,
    st,
    '（云图橙色位 — 前沿在此终止，建议加排气槽防烧焦/短射）',
    '（雲圖橙色位 — 前沿在此終止，建議加排氣槽防燒焦/短射）',
    'store',
  )
})

test('Formal TC: store （无明显死腔）', (t) => {
  softRefuse(t, st, '（无明显死腔）', '（無明顯死腔）', 'store')
})

test('Formal TC: store 小齿轮 z${z}', (t) => {
  softRefuse(t, st, '小齿轮 z${z}', '小齒輪 z${z}', 'store')
})

// ── ribbon / Viewport / Ai / SketchLayer / worker / Gcode soft ──────

test("Formal TC: ribbon '坐標構造點' → '座標構造點'", (t) => {
  softRefuse(t, ribbon, "'坐標構造點'", "'座標構造點'", 'ribbon')
})

test('Formal TC: ribbon 用戶坐標系 → 用戶座標系', (t) => {
  softRefuse(t, ribbon, '用戶坐標系', '用戶座標系', 'ribbon')
})

test('Formal TC: ribbon 關節坐標幀 → 關節座標幀', (t) => {
  softRefuse(t, ribbon, '關節坐標幀', '關節座標幀', 'ribbon')
})

test('Formal TC: ribbon 輸入 XYZ 坐標建立構造點', (t) => {
  softRefuse(
    t,
    ribbon,
    '輸入 X／Y／Z 坐標建立構造點。',
    '輸入 X／Y／Z 座標建立構造點。',
    'ribbon',
  )
})

test('Formal TC: Viewport 世界坐標 → 世界座標', (t) => {
  softRefuse(t, vp, '世界坐標', '世界座標', 'Viewport')
})

test('Formal TC: Viewport CAD 坐標 → CAD 座標', (t) => {
  softRefuse(t, vp, 'CAD 坐標', 'CAD 座標', 'Viewport')
})

test('Formal TC: Viewport ⊞环↔', (t) => {
  softRefuse(t, vp, '⊞环↔', '⊞環↔', 'Viewport')
})

test('Formal TC: Viewport ⊞环↕', (t) => {
  softRefuse(t, vp, '⊞环↕', '⊞環↕', 'Viewport')
})

test('Formal TC: AiCopilot 关闭', (t) => {
  softRefuse(t, ai, '关闭', '關閉', 'AiCopilot')
})

test('Formal TC: AiCopilot 供应商', (t) => {
  softRefuse(t, ai, '供应商', '供應商', 'AiCopilot')
})

test('Formal TC: AiCopilot 。试下：', (t) => {
  softRefuse(t, ai, '。试下：', '。試下：', 'AiCopilot')
})

test('Formal TC: SketchLayer 标注', (t) => {
  softRefuse(t, skL, ' 标注', ' 標註', 'SketchLayer')
})

test('Formal TC: worker 壳水密', (t) => {
  softRefuse(t, w, '；壳水密（freeEdges=0）', '；殼水密（freeEdges=0）', 'worker')
})

test('Formal TC: worker MakeFillet 构造', (t) => {
  softRefuse(t, w, 'MakeFillet 构造：', 'MakeFillet 構造：', 'worker')
})

test('Formal TC: GcodeBackplot 颜色=深度', (t) => {
  softRefuse(
    t,
    gcode,
    '颜色=深度（蓝浅红深）',
    '顏色=深度（藍淺紅深）',
    'GcodeBackplot',
  )
})
