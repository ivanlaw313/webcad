/**
 * BOT-D more32 / FISHING52 prep — soft→hard Formal TC pins for other-product UV
 * still SC on tip e66fe1f (post FISHING51 analysis/CAD Formal).
 *
 * Soft: t.skip while SC phrase remains (product not yet converted).
 * Hard: when SC removed and Formal TC present → PASS (no soft).
 * Always-hard: files readable + FISHING51 Formal regressions + MATERIALS keys stay SC.
 *
 * FISHING52 hardens remaining softs (faceFeaSelect / mateSolve / analysesModel /
 * fasteners / smUnfold / subdiv / lathe Formal).
 * Hint: fishing52 WIP on fix/fishing52-product-formal-uv (dirty — do not base tip on it).
 * Slash: Formal TC may use ASCII `/` or fullwidth `／` (either OK).
 * Skip: MATERIALS/DENSITY_PREF storage keys, i18n SC→EN map keys, comments-only / scanner FPs,
 *       aeroI18n zh-CN, Viewport/worker/components chrome FPs.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const facePath = join(root, 'src/analysis/faceFeaSelect.ts')
const matePath = join(root, 'src/assembly/mateSolve.ts')
const anPath = join(root, 'src/cad/analysesModel.ts')
const fastPath = join(root, 'src/cad/fasteners.ts')
const smPath = join(root, 'src/cad/smUnfold.ts')
const subPath = join(root, 'src/cad/subdiv.ts')
const lathePath = join(root, 'src/cam/lathe.ts')
const asymPath = join(root, 'src/cad/asymmetricFillet.ts')
const simPath = join(root, 'src/simulation/resultValidity.ts')
const gatesPath = join(root, 'src/analysis/gateTypes.ts')
const storePath = join(root, 'src/store.ts')

const face = read('src/analysis/faceFeaSelect.ts')
const mate = read('src/assembly/mateSolve.ts')
const an = read('src/cad/analysesModel.ts')
const fast = read('src/cad/fasteners.ts')
const sm = read('src/cad/smUnfold.ts')
const sub = read('src/cad/subdiv.ts')
const lathe = read('src/cam/lathe.ts')
const asym = read('src/cad/asymmetricFillet.ts')
const sim = read('src/simulation/resultValidity.ts')
const gates = read('src/analysis/gateTypes.ts')
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
 * While SC remains → skip (FISHING52 pending).
 * When SC removed and TC present → hard PASS.
 */
function softRefuse(t, src, sc, tc, where) {
  const hasSC = hasSlashTol(src, sc)
  if (hasSC) {
    t.skip(`FISHING52 pending: still SC «${sc}» (${where})`)
    return
  }
  assert.ok(hasSlashTol(src, tc), `expected Formal TC «${tc}» (or slash alt) in ${where}`)
  assert.equal(hasSC, false, `must not keep SC «${sc}» in ${where}`)
}

// ── always-hard sanity + FISHING51 Formal regressions ────────────

test('sanity: F52 Formal target sources readable', () => {
  assert.ok(existsSync(facePath), 'src/analysis/faceFeaSelect.ts missing')
  assert.ok(existsSync(matePath), 'src/assembly/mateSolve.ts missing')
  assert.ok(existsSync(anPath), 'src/cad/analysesModel.ts missing')
  assert.ok(existsSync(fastPath), 'src/cad/fasteners.ts missing')
  assert.ok(existsSync(smPath), 'src/cad/smUnfold.ts missing')
  assert.ok(existsSync(subPath), 'src/cad/subdiv.ts missing')
  assert.ok(existsSync(lathePath), 'src/cam/lathe.ts missing')
  assert.ok(existsSync(asymPath), 'src/cad/asymmetricFillet.ts missing')
  assert.ok(existsSync(simPath), 'src/simulation/resultValidity.ts missing')
  assert.ok(existsSync(gatesPath), 'src/analysis/gateTypes.ts missing')
  assert.ok(existsSync(storePath), 'src/store.ts missing')
  assert.ok(face.length > 200 && mate.length > 200 && an.length > 100)
  assert.ok(fast.length > 200 && sm.length > 200 && sub.length > 500 && lathe.length > 500)
})

test('FISHING51 regression: asym / sim / gate Formal still on tip', () => {
  assert.match(asym, /不對稱圓角：請選擇邊並輸入兩個正 offset/)
  assert.match(asym, /不對稱圓角：無法建立局部截面坐標/)
  assert.match(sim, /模擬結果已失效/)
  assert.match(sim, /結果已失效 — 約束或幾何已改/)
  assert.match(gates, /name: '扇形澆口'/)
  assert.match(gates, /name: '護耳澆口'/)
  assert.doesNotMatch(asym, /不对称圆角：请选择边/)
  assert.doesNotMatch(sim, /仿真结果已失效/)
})

test('FISHING51 MATERIALS keys stay SC (storage ids — do not Formal-convert)', () => {
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

// ── soft: faceFeaSelect refuse (FISHING52 Formal) ────────────────

test('Formal TC: faceFea 空输入 → 空輸入', (t) => {
  softRefuse(t, face, '空输入（缺 grid/faceTris）', '空輸入（缺 grid/faceTris）', 'faceFeaSelect')
})

test('Formal TC: faceFea h 无效 → h 無效', (t) => {
  softRefuse(t, face, 'h 无效（需 > 0）', 'h 無效（需 > 0）', 'faceFeaSelect')
})

test('Formal TC: faceFea nx/ny/nz 无效 → 無效', (t) => {
  softRefuse(t, face, 'nx/ny/nz 无效（需 > 0）', 'nx/ny/nz 無效（需 > 0）', 'faceFeaSelect')
})

test('Formal TC: faceFea solid 长度 → 長度', (t) => {
  softRefuse(t, face, 'solid 长度同 nx*ny*nz 不一致', 'solid 長度同 nx*ny*nz 不一致', 'faceFeaSelect')
})

test('Formal TC: faceFea 面三角不足 → 個數', (t) => {
  softRefuse(
    t,
    face,
    '面三角不足（faceTris 需 ≥ 9 个数 = 1 三角）',
    '面三角不足（faceTris 需 ≥ 9 個數 = 1 三角）',
    'faceFeaSelect',
  )
})

test('Formal TC: faceFea 无实体角节点 → 無實體角節點', (t) => {
  softRefuse(t, face, '无实体角节点（solid 全空？）', '無實體角節點（solid 全空？）', 'faceFeaSelect')
})

// ── soft: mateSolve refuse ───────────────────────────────────────

test('Formal TC: mate 残差非有限 → 殘差非有限', (t) => {
  softRefuse(
    t,
    mate,
    '残差非有限（几何退化）— 已还原求解前姿态',
    '殘差非有限（幾何退化）— 已還原求解前姿態',
    'mateSolve',
  )
})

test('Formal TC: mate 发散残差连升 → 發散', (t) => {
  softRefuse(
    t,
    mate,
    '发散（残差连升 3 次）— 已还原求解前姿态（约束可能矛盾）',
    '發散（殘差連升 3 次）— 已還原求解前姿態（約束可能矛盾）',
    'mateSolve',
  )
})

test('Formal TC: mate 奇异 / 非有限步长 → 奇異', (t) => {
  softRefuse(
    t,
    mate,
    '奇异 / 非有限步长 — 已还原求解前姿态',
    '奇異 / 非有限步長 — 已還原求解前姿態',
    'mateSolve',
  )
})

test('Formal TC: mate 姿态非有限 → 姿態非有限', (t) => {
  softRefuse(
    t,
    mate,
    '姿态非有限 — 已还原求解前姿态',
    '姿態非有限 — 已還原求解前姿態',
    'mateSolve',
  )
})

// ── soft: analysesModel labels ───────────────────────────────────

test("Formal TC: an zebra: '斑马纹' → '斑馬紋'", (t) => {
  softRefuse(t, an, "zebra: '斑马纹'", "zebra: '斑馬紋'", 'analysesModel')
})

test("Formal TC: an curv: '曲率趋势' → '曲率趨勢'", (t) => {
  softRefuse(t, an, "curv: '曲率趋势'", "curv: '曲率趨勢'", 'analysesModel')
})

test("Formal TC: an minradius: '最小曲率半径' → '最小曲率半徑'", (t) => {
  softRefuse(t, an, "minradius: '最小曲率半径'", "minradius: '最小曲率半徑'", 'analysesModel')
})

test("Formal TC: an access: '脱模可达性' → '脫模可達性'", (t) => {
  softRefuse(t, an, "access: '脱模可达性'", "access: '脫模可達性'", 'analysesModel')
})

// ── soft: fasteners KIND + labels ────────────────────────────────

test("Formal TC: fast capscrew 内六角螺丝 → 內六角螺絲", (t) => {
  softRefuse(t, fast, "capscrew: '内六角螺丝 (ISO 4762)'", "capscrew: '內六角螺絲 (ISO 4762)'", 'fasteners')
})

test("Formal TC: fast hexbolt 六角头螺栓 → 六角頭螺栓", (t) => {
  softRefuse(t, fast, "hexbolt: '六角头螺栓 (ISO 4017)'", "hexbolt: '六角頭螺栓 (ISO 4017)'", 'fasteners')
})

test("Formal TC: fast flathead 沉头螺丝 → 沉頭螺絲", (t) => {
  softRefuse(t, fast, "flathead: '沉头螺丝 (ISO 10642)'", "flathead: '沉頭螺絲 (ISO 10642)'", 'fasteners')
})

test("Formal TC: fast button 圆头螺丝 → 圓頭螺絲", (t) => {
  softRefuse(t, fast, "button: '圆头螺丝 (ISO 7380)'", "button: '圓頭螺絲 (ISO 7380)'", 'fasteners')
})

test("Formal TC: fast setscrew 机米/无头螺丝 → 機米/無頭螺絲", (t) => {
  softRefuse(
    t,
    fast,
    "setscrew: '机米/无头螺丝 (ISO 4026)'",
    "setscrew: '機米/無頭螺絲 (ISO 4026)'",
    'fasteners',
  )
})

test("Formal TC: fast washer 平垫圈 → 平墊圈", (t) => {
  softRefuse(t, fast, "washer: '平垫圈 (ISO 7089)'", "washer: '平墊圈 (ISO 7089)'", 'fasteners')
})

test("Formal TC: fast dowel 定位销 → 定位銷", (t) => {
  softRefuse(t, fast, "dowel: '定位销 (ISO 2338)'", "dowel: '定位銷 (ISO 2338)'", 'fasteners')
})

test('Formal TC: fast label 内六角螺丝 → 內六角螺絲', (t) => {
  softRefuse(t, fast, ' 内六角螺丝`', ' 內六角螺絲`', 'fasteners')
})

test('Formal TC: fast label 六角头螺栓 → 六角頭螺栓', (t) => {
  softRefuse(t, fast, ' 六角头螺栓`', ' 六角頭螺栓`', 'fasteners')
})

test('Formal TC: fast label 沉头螺丝 → 沉頭螺絲', (t) => {
  softRefuse(t, fast, ' 沉头螺丝`', ' 沉頭螺絲`', 'fasteners')
})

test('Formal TC: fast label 圆头螺丝 → 圓頭螺絲', (t) => {
  softRefuse(t, fast, ' 圆头螺丝`', ' 圓頭螺絲`', 'fasteners')
})

test('Formal TC: fast label 机米螺丝 → 機米螺絲', (t) => {
  softRefuse(t, fast, ' 机米螺丝`', ' 機米螺絲`', 'fasteners')
})

test('Formal TC: fast label 定位销 → 定位銷', (t) => {
  softRefuse(t, fast, ' 定位销`', ' 定位銷`', 'fasteners')
})

test('Formal TC: fast label 平垫圈 → 平墊圈', (t) => {
  softRefuse(t, fast, ' 平垫圈`', ' 平墊圈`', 'fasteners')
})

// ── soft: smUnfold errors ────────────────────────────────────────

test('Formal TC: sm 孔超出板宽 → 孔超出板寬', (t) => {
  softRefuse(t, sm, '孔超出板宽', '孔超出板寬', 'smUnfold')
})

test('Formal TC: sm 孔在折弯区 → 孔在折彎區', (t) => {
  softRefuse(
    t,
    sm,
    '孔在折弯区 — 真实折弯会变形，展开图不标',
    '孔在折彎區 — 真實折彎會變形，展開圖不標',
    'smUnfold',
  )
})

test('Formal TC: sm 孔不在钣金面上 → 鈑金', (t) => {
  softRefuse(t, sm, '孔不在钣金面上', '孔不在鈑金面上', 'smUnfold')
})

test('Formal TC: sm 孔轴不垂直于板面 → 孔軸', (t) => {
  softRefuse(
    t,
    sm,
    '孔轴不垂直于板面 — 斜孔展开不保形',
    '孔軸不垂直於板面 — 斜孔展開不保形',
    'smUnfold',
  )
})

// ── soft: subdiv refuse ──────────────────────────────────────────

test('Formal TC: subdiv box 分段数要是 ≥1 的整数 → 分段數…整數', (t) => {
  softRefuse(
    t,
    sub,
    'makeBoxCage: 分段数要是 ≥1 的整数',
    'makeBoxCage: 分段數要是 ≥1 的整數',
    'subdiv',
  )
})

test('Formal TC: subdiv cyl 分段数要 ≥1 整数 → 分段數', (t) => {
  softRefuse(
    t,
    sub,
    'makeCylinderCage: 分段数要 ≥1 整数',
    'makeCylinderCage: 分段數要 ≥1 整數',
    'subdiv',
  )
})

test('Formal TC: subdiv openPatch 分段数要是 ≥1 整数 → 分段數', (t) => {
  softRefuse(
    t,
    sub,
    'makeOpenPatchCage: 分段数要是 ≥1 整数',
    'makeOpenPatchCage: 分段數要是 ≥1 整數',
    'subdiv',
  )
})

test('Formal TC: subdiv sphere 半径要 > 0 → 半徑', (t) => {
  softRefuse(t, sub, 'makeSphereCage: 半径要 > 0', 'makeSphereCage: 半徑要 > 0', 'subdiv')
})

test('Formal TC: subdiv sphere 分段数要 ≥1 整数 → 分段數', (t) => {
  softRefuse(
    t,
    sub,
    'makeSphereCage: 分段数要 ≥1 整数',
    'makeSphereCage: 分段數要 ≥1 整數',
    'subdiv',
  )
})

test('Formal TC: subdiv torus 半径要 > 0 → 半徑', (t) => {
  softRefuse(t, sub, 'makeTorusCage: 半径要 > 0', 'makeTorusCage: 半徑要 > 0', 'subdiv')
})

test('Formal TC: subdiv torus 主半径要 > 管半径 → 主半徑', (t) => {
  softRefuse(
    t,
    sub,
    'makeTorusCage: 主半径要 > 管半径（否则自交）',
    'makeTorusCage: 主半徑要 > 管半徑（否則自交）',
    'subdiv',
  )
})

test('Formal TC: subdiv torus 分段数要 ≥3 整数 → 分段數', (t) => {
  softRefuse(
    t,
    sub,
    'makeTorusCage: 分段数要 ≥3 整数',
    'makeTorusCage: 分段數要 ≥3 整數',
    'subdiv',
  )
})

test('Formal TC: subdiv levels 要是 ≥1 的整数 → 整數', (t) => {
  softRefuse(
    t,
    sub,
    'ccSubdivide: levels 要是 ≥1 的整数',
    'ccSubdivide: levels 要是 ≥1 的整數',
    'subdiv',
  )
})

test('Formal TC: subdiv 细分要求闭合流形 → 細分…網格', (t) => {
  softRefuse(t, sub, '细分要求闭合流形 quad 网格', '細分要求閉合流形 quad 網格', 'subdiv')
})

// ── soft: lathe refuse / warnings / G-code comments ───────────────

test('Formal TC: lathe 参数必须为正数 → 參數必須為正數', (t) => {
  softRefuse(
    t,
    lathe,
    '参数 ${k} 必须为正数（目前是 ${v}）',
    '參數 ${k} 必須為正數（目前是 ${v}）',
    'lathe',
  )
})

test('Formal TC: lathe 安全直径要大于毛坯 → 安全直徑要大於毛坯', (t) => {
  softRefuse(
    t,
    lathe,
    '安全直径要大于毛坯（safeX ${fmt(opts.safeX)} ≤ stockD ${fmt(opts.stockD)}）',
    '安全直徑要大於毛坯（safeX ${fmt(opts.safeX)} ≤ stockD ${fmt(opts.stockD)}）',
    'lathe',
  )
})

test('Formal TC: lathe turn 轮廓最少要 2 点 → 輪廓…點', (t) => {
  softRefuse(t, lathe, 'turn 轮廓最少要 2 点', 'turn 輪廓最少要 2 點', 'lathe')
})

test('Formal TC: lathe 轮廓超出毛坯 → 輪廓超出毛坯', (t) => {
  softRefuse(
    t,
    lathe,
    '轮廓超出毛坯（r ${fmt(p.r)} > 毛坯半径 ${fmt(stockR)}）— 该处钳到毛坯, 不切',
    '輪廓超出毛坯（r ${fmt(p.r)} > 毛坯半徑 ${fmt(stockR)}）— 該處钳到毛坯, 不切',
    'lathe',
  )
})

test('Formal TC: lathe 刀尖半径…精车留量 → 刀尖半徑…精車留量', (t) => {
  softRefuse(
    t,
    lathe,
    '刀尖半径 ${fmt(toolNoseR)} > 精车留量 ${fmt(finishStep)} — 内圆角/锥面会过切',
    '刀尖半徑 ${fmt(toolNoseR)} > 精車留量 ${fmt(finishStep)} — 內圓角/錐面會過切',
    'lathe',
  )
})

test('Formal TC: lathe turn 粗车 第…层 → 粗車…層', (t) => {
  softRefuse(
    t,
    lathe,
    '(turn 粗车 第 ${i}/${nRough} 层 半径 ${fmt(layerR)} 直径 ${dia(layerR)})',
    '(turn 粗車 第 ${i}/${nRough} 層 半徑 ${fmt(layerR)} 直徑 ${dia(layerR)})',
    'lathe',
  )
})

test('Formal TC: lathe turn 精车 沿成品轮廓 → 精車…輪廓', (t) => {
  softRefuse(t, lathe, '(turn 精车 沿成品轮廓一刀)', '(turn 精車 沿成品輪廓一刀)', 'lathe')
})

test('Formal TC: lathe face 轮廓最少要 2 点 → 輪廓…點', (t) => {
  softRefuse(t, lathe, 'face 轮廓最少要 2 点', 'face 輪廓最少要 2 點', 'lathe')
})

test('Formal TC: lathe face 端面车平 → 端面車平', (t) => {
  softRefuse(t, lathe, '(face 端面车平 Z${fmt(faceZ)})', '(face 端面車平 Z${fmt(faceZ)})', 'lathe')
})

test('Formal TC: lathe grooveDepth 必须为正数 → 必須為正數', (t) => {
  softRefuse(
    t,
    lathe,
    '参数 grooveDepth 必须为正数（目前是 ${grooveDepth}）',
    '參數 grooveDepth 必須為正數（目前是 ${grooveDepth}）',
    'lathe',
  )
})

test('Formal TC: lathe 槽深超过毛坯半径 → 超過…半徑', (t) => {
  softRefuse(
    t,
    lathe,
    '槽深 ${fmt(grooveDepth)} 超过毛坯半径 ${fmt(startR)} — 已钳到中心 X0',
    '槽深 ${fmt(grooveDepth)} 超過毛坯半徑 ${fmt(startR)} — 已钳到中心 X0',
    'lathe',
  )
})

test('Formal TC: lathe 槽宽 > 刀宽 → 槽寬…刀寬', (t) => {
  softRefuse(
    t,
    lathe,
    '槽宽 ${fmt(grooveW)} > 刀宽 ${fmt(toolW)} — 需 ${passes} 刀沿 Z 偏移清宽',
    '槽寬 ${fmt(grooveW)} > 刀寬 ${fmt(toolW)} — 需 ${passes} 刀沿 Z 偏移清寬',
    'lathe',
  )
})
