/**
 * BOT-D more31 / FISHING51 prep — soft→hard Formal TC pins for analysis/CAD
 * refuse + HDRI/selection still SC on tip 0d803a5 (post FISHING50 store Formal).
 *
 * Soft: t.skip while SC phrase remains (product not yet converted).
 * Hard: when SC removed and Formal TC present → PASS (no soft).
 * Always-hard: files readable + FISHING50 Formal regressions + MATERIALS keys stay SC.
 *
 * FISHING51 hardens remaining softs (analysis/CAD refuse Formal).
 * Hint: fishing51 hard Formal tests/fishing51-analysis-cad-refuse-formal.test.mjs
 * (do not base worktree on fishing51 product HEAD if it has Formal commits — tip still SC).
 * Slash: Formal TC may use ASCII `/` or fullwidth `／` (either OK).
 * Skip: MATERIALS/DENSITY_PREF storage keys, i18n SC→EN map keys, comments-only / scanner FPs,
 *       aeroI18n zh-CN slots.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const asymPath = join(root, 'src/cad/asymmetricFillet.ts')
const weightPath = join(root, 'src/cad/weightedFillet.ts')
const fullPath = join(root, 'src/cad/fullRound.ts')
const selPath = join(root, 'src/cad/selectionModel.ts')
const dimPath = join(root, 'src/cad/dimensionExpression.ts')
const meshPath = join(root, 'src/io/meshBool.ts')
const hdriPath = join(root, 'src/render/hdriPresets.ts')
const feaPath = join(root, 'src/analysis/voxelfea.ts')
const gatesPath = join(root, 'src/analysis/gateTypes.ts')
const feacsvPath = join(root, 'src/analysis/feacsv.ts')
const simPath = join(root, 'src/simulation/resultValidity.ts')
const storePath = join(root, 'src/store.ts')

const asym = read('src/cad/asymmetricFillet.ts')
const weight = read('src/cad/weightedFillet.ts')
const full = read('src/cad/fullRound.ts')
const sel = read('src/cad/selectionModel.ts')
const dim = read('src/cad/dimensionExpression.ts')
const mesh = read('src/io/meshBool.ts')
const hdri = read('src/render/hdriPresets.ts')
const fea = read('src/analysis/voxelfea.ts')
const gates = read('src/analysis/gateTypes.ts')
const feacsv = read('src/analysis/feacsv.ts')
const sim = read('src/simulation/resultValidity.ts')
const st = read('src/store.ts')

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
 * While SC remains → skip (FISHING51 pending).
 * When SC removed and TC present → hard PASS.
 */
function softRefuse(t, src, sc, tc, where) {
  const hasSC = hasSlashTol(src, sc)
  if (hasSC) {
    t.skip(`FISHING51 pending: still SC «${sc}» (${where})`)
    return
  }
  assert.ok(hasSlashTol(src, tc), `expected Formal TC «${tc}» (or slash alt) in ${where}`)
  assert.equal(hasSC, false, `must not keep SC «${sc}» in ${where}`)
}

// ── always-hard sanity + fishing50 Formal regressions ────────────

test('sanity: analysis/CAD Formal sources readable', () => {
  assert.ok(existsSync(asymPath), 'src/cad/asymmetricFillet.ts missing')
  assert.ok(existsSync(weightPath), 'src/cad/weightedFillet.ts missing')
  assert.ok(existsSync(fullPath), 'src/cad/fullRound.ts missing')
  assert.ok(existsSync(selPath), 'src/cad/selectionModel.ts missing')
  assert.ok(existsSync(dimPath), 'src/cad/dimensionExpression.ts missing')
  assert.ok(existsSync(meshPath), 'src/io/meshBool.ts missing')
  assert.ok(existsSync(hdriPath), 'src/render/hdriPresets.ts missing')
  assert.ok(existsSync(feaPath), 'src/analysis/voxelfea.ts missing')
  assert.ok(existsSync(gatesPath), 'src/analysis/gateTypes.ts missing')
  assert.ok(existsSync(feacsvPath), 'src/analysis/feacsv.ts missing')
  assert.ok(existsSync(simPath), 'src/simulation/resultValidity.ts missing')
  assert.ok(existsSync(storePath), 'src/store.ts missing')
  assert.ok(asym.length > 200 && fea.length > 1000 && st.length > 1000)
})

test('FISHING50 regression: store mate/mold/beam Formal still on tip', () => {
  assert.match(st, /`半軸 rx \$\{L\.toFixed\(1\)\} mm`/)
  assert.match(st, /flush: '面貼合', distance: '距離'/)
  assert.match(st, /\? '過孔' : '寬松配'/)
  assert.match(st, /\? '橢圓' : rho > 0\.5 \? '雙曲' : '拋物'/)
  assert.match(st, /\|\| '主體'\)/)
  assert.match(st, /\? '歐拉細長桿控制' : '短桿壓潰控制'/)
  assert.doesNotMatch(st, /`半轴 rx \$\{L\.toFixed/)
  assert.doesNotMatch(st, /flush: '面贴合'/)
})

test('FISHING50 MATERIALS keys stay SC (storage ids — do not Formal-convert)', () => {
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

// ── soft: asymmetricFillet refuse (FISHING51 Formal) ─────────────

test('Formal TC: asym 请选择边并输入两个正 offset → 請選擇邊並輸入兩個正 offset', (t) => {
  softRefuse(
    t,
    asym,
    '不对称圆角：请选择边并输入两个正 offset',
    '不對稱圓角：請選擇邊並輸入兩個正 offset',
    'asymmetricFillet',
  )
})

test('Formal TC: asym 无法建立局部截面坐标 → 無法建立局部截面坐標', (t) => {
  softRefuse(
    t,
    asym,
    '不对称圆角：无法建立局部截面坐标',
    '不對稱圓角：無法建立局部截面坐標',
    'asymmetricFillet',
  )
})

test('Formal TC: asym 零长度方向 → 零長度方向', (t) => {
  softRefuse(t, asym, '不对称圆角：零长度方向', '不對稱圓角：零長度方向', 'asymmetricFillet')
})

test('Formal TC: asym 每条边都需要正 offset → 每條邊都需要正 offset', (t) => {
  softRefuse(
    t,
    asym,
    '不对称圆角：每条边都需要正 offset 1',
    '不對稱圓角：每條邊都需要正 offset 1',
    'asymmetricFillet',
  )
})

test('Formal TC: asym 找不到所选边 → 找不到所選邊', (t) => {
  softRefuse(t, asym, '不对称圆角：找不到所选边', '不對稱圓角：找不到所選邊', 'asymmetricFillet')
})

test('Formal TC: asym 目前只支持直线边 → 目前只支持直線邊', (t) => {
  softRefuse(t, asym, '不对称圆角：目前只支持直线边', '不對稱圓角：目前只支持直線邊', 'asymmetricFillet')
})

test('Formal TC: asym 所选边必须连接两个平面 → 所選邊必須連接兩個平面', (t) => {
  softRefuse(
    t,
    asym,
    '不对称圆角：所选边必须连接两个平面',
    '不對稱圓角：所選邊必須連接兩個平面',
    'asymmetricFillet',
  )
})

// ── soft: weightedFillet refuse ──────────────────────────────────

test('Formal TC: weight 请选择边 → 請選擇邊', (t) => {
  softRefuse(t, weight, '切线权重圆角：请选择边', '切線權重圓角：請選擇邊', 'weightedFillet')
})

test('Formal TC: weight 目前只支持直线边 → 目前只支持直線邊', (t) => {
  softRefuse(
    t,
    weight,
    '切线权重圆角：目前只支持直线边',
    '切線權重圓角：目前只支持直線邊',
    'weightedFillet',
  )
})

test('Formal TC: weight 每条边都需要正半径 → 每條邊都需要正半徑', (t) => {
  softRefuse(
    t,
    weight,
    '切线权重圆角：每条边都需要正半径',
    '切線權重圓角：每條邊都需要正半徑',
    'weightedFillet',
  )
})

test('Formal TC: weight 权重必须在 0.1 至 2.0 之间 → 權重必須在', (t) => {
  softRefuse(
    t,
    weight,
    '切线权重圆角：权重必须在 0.1 至 2.0 之间',
    '切線權重圓角：權重必須在 0.1 至 2.0 之間',
    'weightedFillet',
  )
})

test('Formal TC: weight 无法建立局部截面坐标 → 無法建立局部截面坐標', (t) => {
  softRefuse(
    t,
    weight,
    '切线权重圆角：无法建立局部截面坐标',
    '切線權重圓角：無法建立局部截面坐標',
    'weightedFillet',
  )
})

// ── soft: fullRound refuse ───────────────────────────────────────

test('Formal TC: fullRound B-rep 运算失败 → 運算失敗', (t) => {
  softRefuse(t, full, '全圆角：B-rep 运算失败', '全圓角：B-rep 運算失敗', 'fullRound')
})

test('Formal TC: fullRound 侧面组都必须有选择 → 側面組都必須有選擇', (t) => {
  softRefuse(
    t,
    full,
    '全圆角：侧面组 1、中心面、侧面组 2 都必须有选择',
    '全圓角：側面組 1、中心面、側面組 2 都必須有選擇',
    'fullRound',
  )
})

test('Formal TC: fullRound 两组侧面必须分别与中心面相邻 → 兩組側面', (t) => {
  softRefuse(
    t,
    full,
    '全圆角：两组侧面必须分别与中心面相邻',
    '全圓角：兩組側面必須分別與中心面相鄰',
    'fullRound',
  )
})

test('Formal TC: fullRound 边界长度不足 → 邊界長度不足', (t) => {
  softRefuse(t, full, '全圆角：边界长度不足', '全圓角：邊界長度不足', 'fullRound')
})

// ── soft: selectionModel labels ──────────────────────────────────

test("Formal TC: sel label: '组件' → '組件'", (t) => {
  softRefuse(t, sel, "label: '组件'", "label: '組件'", 'selectionModel')
})

test("Formal TC: sel label: '实体' → '實體'", (t) => {
  softRefuse(t, sel, "label: '实体'", "label: '實體'", 'selectionModel')
})

test("Formal TC: sel label: '边' → '邊'", (t) => {
  softRefuse(t, sel, "label: '边'", "label: '邊'", 'selectionModel')
})

test("Formal TC: sel label: '顶点' → '頂點'", (t) => {
  softRefuse(t, sel, "label: '顶点'", "label: '頂點'", 'selectionModel')
})

test("Formal TC: sel label: '草图' → '草圖'", (t) => {
  softRefuse(t, sel, "label: '草图'", "label: '草圖'", 'selectionModel')
})

// ── soft: dimensionExpression ────────────────────────────────────

test('Formal TC: dim 表达式未完成或含无效字符 → 表達式未完成或含無效字符', (t) => {
  softRefuse(
    t,
    dim,
    '表达式未完成或含无效字符',
    '表達式未完成或含無效字符',
    'dimensionExpression',
  )
})

test('Formal TC: dim 无法计算：检查除零、函数及括号 → 無法計算', (t) => {
  softRefuse(
    t,
    dim,
    '无法计算：检查除零、函数及括号',
    '無法計算：檢查除零、函數及括號',
    'dimensionExpression',
  )
})

test('Formal TC: dim 长度、角度或无单位数不相容 → 長度、角度或無單位數不相容', (t) => {
  softRefuse(
    t,
    dim,
    '长度、角度或无单位数不相容',
    '長度、角度或無單位數不相容',
    'dimensionExpression',
  )
})

test('Formal TC: dim 括号未配对 → 括號未配對', (t) => {
  softRefuse(t, dim, '括号未配对', '括號未配對', 'dimensionExpression')
})

test('Formal TC: dim 参数表达式循环引用 → 參數表達式循環引用', (t) => {
  softRefuse(t, dim, '参数表达式循环引用', '參數表達式循環引用', 'dimensionExpression')
})

// ── soft: meshBool ───────────────────────────────────────────────

test('Formal TC: mesh 网格体积近零，无法抽壳 → 網格體積近零，無法抽殼', (t) => {
  softRefuse(t, mesh, '网格体积近零，无法抽壳', '網格體積近零，無法抽殼', 'meshBool')
})

test('Formal TC: mesh 抽壳壁厚要 > 0 → 抽殼壁厚要 > 0', (t) => {
  softRefuse(t, mesh, '抽壳壁厚要 > 0', '抽殼壁厚要 > 0', 'meshBool')
})

test('Formal TC: mesh 第一件网格不是水密流形 → 第一件網格不是水密流形', (t) => {
  softRefuse(t, mesh, '第一件网格不是水密流形', '第一件網格不是水密流形', 'meshBool')
})

test('Formal TC: mesh 布尔结果为空 → 布爾結果為空', (t) => {
  softRefuse(t, mesh, '布尔结果为空', '布爾結果為空', 'meshBool')
})

test('Formal TC: mesh 两件没有重叠部分 → 兩件沒有重疊部分', (t) => {
  softRefuse(
    t,
    mesh,
    '两件没有重叠部分（相交结果为空）',
    '兩件沒有重疊部分（相交結果為空）',
    'meshBool',
  )
})

// ── soft: hdriPresets ────────────────────────────────────────────

test('Formal TC: hdri 产品/工业件展示首选 → 產品/工業件展示首選', (t) => {
  softRefuse(t, hdri, '产品/工业件展示首选', '產品/工業件展示首選', 'hdriPresets')
})

test("Formal TC: hdri label: '室内 Apartment' → '室內 Apartment'", (t) => {
  softRefuse(t, hdri, "label: '室内 Apartment'", "label: '室內 Apartment'", 'hdriPresets')
})

test("Formal TC: hdri label: '仓库 Warehouse' → '倉庫 Warehouse'", (t) => {
  softRefuse(t, hdri, "label: '仓库 Warehouse'", "label: '倉庫 Warehouse'", 'hdriPresets')
})

test('Formal TC: hdri 空旷工业室内 → 空曠工業室內', (t) => {
  softRefuse(t, hdri, '空旷工业室内', '空曠工業室內', 'hdriPresets')
})

test('Formal TC: hdri 柔和均匀 → 柔和均勻', (t) => {
  softRefuse(t, hdri, '柔和均匀，中性白', '柔和均勻，中性白', 'hdriPresets')
})

test("Formal TC: hdri label: '公园 Park' → '公園 Park'", (t) => {
  softRefuse(t, hdri, "label: '公园 Park'", "label: '公園 Park'", 'hdriPresets')
})

test('Formal TC: hdri 都市广场 → 都市廣場', (t) => {
  softRefuse(t, hdri, '都市广场，中性偏冷，多反射细节', '都市廣場，中性偏冷，多反射細節', 'hdriPresets')
})

test('Formal TC: hdri 需调高曝光 → 需調高曝光', (t) => {
  softRefuse(t, hdri, '低照度夜空，需调高曝光', '低照度夜空，需調高曝光', 'hdriPresets')
})

// ── soft: gateTypes ──────────────────────────────────────────────

test("Formal TC: gates name: '扇形浇口' → '扇形澆口'", (t) => {
  softRefuse(t, gates, "name: '扇形浇口'", "name: '扇形澆口'", 'gateTypes')
})

test("Formal TC: gates name: '护耳浇口' → '護耳澆口'", (t) => {
  softRefuse(t, gates, "name: '护耳浇口'", "name: '護耳澆口'", 'gateTypes')
})

test("Formal TC: gates name: '点浇口' → '點澆口'", (t) => {
  softRefuse(t, gates, "name: '点浇口'", "name: '點澆口'", 'gateTypes')
})

test("Formal TC: gates name: '侧浇口/边缘' → '側澆口/邊緣'", (t) => {
  softRefuse(t, gates, "name: '侧浇口/边缘'", "name: '側澆口/邊緣'", 'gateTypes')
})

test("Formal TC: gates name: '潜伏式' → '潛伏式'", (t) => {
  softRefuse(t, gates, "name: '潜伏式'", "name: '潛伏式'", 'gateTypes')
})

test("Formal TC: gates name: '直接/主流道' (SC≡TC — hard pin)", () => {
  // No SC/TC glyph delta; softRefuse would forever skip. Harden as presence pin.
  assert.match(gates, /name: '直接\/主流道'/)
})

// ── soft: feacsv ─────────────────────────────────────────────────

test("Formal TC: feacsv ['安全系数 SF' → ['安全系數 SF'", (t) => {
  softRefuse(t, feacsv, "['安全系数 SF'", "['安全系數 SF'", 'feacsv')
})

test("Formal TC: feacsv '应变能密度' → '應變能密度'", (t) => {
  softRefuse(t, feacsv, "'应变能密度'", "'應變能密度'", 'feacsv')
})

test("Formal TC: feacsv ['序号' → ['序號'", (t) => {
  softRefuse(t, feacsv, "['序号'", "['序號'", 'feacsv')
})

test("Formal TC: feacsv ['webcad FEA 结果' → ['webcad FEA 結果'", (t) => {
  softRefuse(t, feacsv, "['webcad FEA 结果'", "['webcad FEA 結果'", 'feacsv')
})

test("Formal TC: feacsv ['屈服强度 → ['屈服強度", (t) => {
  softRefuse(t, feacsv, "['屈服强度 σy (MPa)'", "['屈服強度 σy (MPa)'", 'feacsv')
})

test("Formal TC: feacsv ['收敛' → ['收斂'", (t) => {
  softRefuse(t, feacsv, "['收敛'", "['收斂'", 'feacsv')
})

test("Formal TC: feacsv ['体素数' → ['體素數'", (t) => {
  softRefuse(t, feacsv, "['体素数'", "['體素數'", 'feacsv')
})

test("Formal TC: feacsv ['残差' → ['殘差'", (t) => {
  softRefuse(t, feacsv, "['残差'", "['殘差'", 'feacsv')
})

// ── soft: voxelfea refuse samples ────────────────────────────────

test('Formal TC: fea E 无效（需 > 0） → E 無效', (t) => {
  softRefuse(t, fea, 'E 无效（需 > 0）', 'E 無效（需 > 0）', 'voxelfea')
})

test('Formal TC: fea 包围盒退化 → 包圍盒退化', (t) => {
  softRefuse(t, fea, '包围盒退化（网格无体积范围）', '包圍盒退化（網格無體積範圍）', 'voxelfea')
})

test('Formal TC: fea 固定面法向量为零 → 固定面法向量為零', (t) => {
  softRefuse(t, fea, '固定面法向量为零', '固定面法向量為零', 'voxelfea')
})

test('Formal TC: fea 实体体素不足 → 實體體素不足', (t) => {
  softRefuse(t, fea, '实体体素不足', '實體體素不足', 'voxelfea')
})

test('Formal TC: fea 空网格（无顶点 → 空網格（無頂點', (t) => {
  softRefuse(t, fea, '空网格（无顶点/三角形数组）', '空網格（無頂點/三角形數組）', 'voxelfea')
})

test('Formal TC: fea force 无效 → force 無效', (t) => {
  softRefuse(t, fea, 'force 无效（需 3 个有限分量）', 'force 無效（需 3 個有限分量）', 'voxelfea')
})

test('Formal TC: fea 受力面法向量为零 → 受力面法向量為零', (t) => {
  softRefuse(t, fea, '受力面法向量为零', '受力面法向量為零', 'voxelfea')
})

test('Formal TC: fea 固定节点不足 → 固定節點不足', (t) => {
  softRefuse(t, fea, '固定节点不足', '固定節點不足', 'voxelfea')
})

// ── soft: resultValidity ─────────────────────────────────────────

test('Formal TC: sim 仿真结果已失效 → 模擬結果已失效', (t) => {
  // sc2tcHK maps 仿真→模擬 (HK Formal); pin the converted form
  softRefuse(t, sim, '仿真结果已失效', '模擬結果已失效', 'resultValidity')
})

test('Formal TC: sim 结果已失效 — 约束或几何已改 → 結果已失效', (t) => {
  softRefuse(
    t,
    sim,
    '结果已失效 — 约束或几何已改',
    '結果已失效 — 約束或幾何已改',
    'resultValidity',
  )
})
