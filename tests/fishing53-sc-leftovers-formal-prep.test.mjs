/**
 * BOT-D more33 / FISHING53 prep — soft→hard Formal TC pins for other-product UV
 * still SC on tip a288e85 (post FISHING52 Formal).
 *
 * Soft: t.skip while SC phrase remains (product not yet converted).
 * Hard: when SC removed and Formal TC present → PASS (no soft).
 * Always-hard: files readable + FISHING52 Formal regressions + MATERIALS keys stay SC.
 *
 * FISHING53 hardens remaining softs (ai/tools, feacsv, moldflow/moldsolve, voxelfea,
 * gears, inferConstraints, viewBookmark, brepRebuild, primitiveFit, slicePreview,
 * imageTrace, laserGcode, meshProject, pdf, threeMfImport, projectLinks, textShapes).
 * Hint: fishing53 WIP on fix/fishing53-product-formal-uv (dirty — do not base tip on it).
 * Slash: Formal TC may use ASCII `/` or fullwidth `／` (either OK).
 * Skip: MATERIALS/DENSITY_PREF storage keys, i18n SC→EN map keys, comments-only / scanner FPs,
 *       aeroI18n zh-CN, Viewport/SketchLayer FPs.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

const toolsPath = join(root, 'src/ai/tools.ts')
const feaCsvPath = join(root, 'src/analysis/feacsv.ts')
const moldPath = join(root, 'src/analysis/moldflow.ts')
const moldSolPath = join(root, 'src/analysis/moldsolve.ts')
const voxelPath = join(root, 'src/analysis/voxelfea.ts')
const gearsPath = join(root, 'src/cad/gears.ts')
const inferPath = join(root, 'src/cad/inferConstraints.ts')
const viewPath = join(root, 'src/cad/viewBookmark.ts')
const brepPath = join(root, 'src/geom/brepRebuild.ts')
const primPath = join(root, 'src/geom/primitiveFit.ts')
const slicePath = join(root, 'src/geom/slicePreview.ts')
const imgPath = join(root, 'src/io/imageTrace.ts')
const laserPath = join(root, 'src/io/laserGcode.ts')
const meshPath = join(root, 'src/io/meshProject.ts')
const pdfPath = join(root, 'src/io/pdf.ts')
const mfPath = join(root, 'src/io/threeMfImport.ts')
const linksPath = join(root, 'src/sketch/projectLinks.ts')
const textPath = join(root, 'src/sketch/textShapes.ts')
const storePath = join(root, 'src/store.ts')
const facePath = join(root, 'src/analysis/faceFeaSelect.ts')
const matePath = join(root, 'src/assembly/mateSolve.ts')
const fastPath = join(root, 'src/cad/fasteners.ts')
const lathePath = join(root, 'src/cam/lathe.ts')

const tools = read('src/ai/tools.ts')
const feaCsv = read('src/analysis/feacsv.ts')
const mold = read('src/analysis/moldflow.ts')
const moldSol = read('src/analysis/moldsolve.ts')
const voxel = read('src/analysis/voxelfea.ts')
const gears = read('src/cad/gears.ts')
const infer = read('src/cad/inferConstraints.ts')
const view = read('src/cad/viewBookmark.ts')
const brep = read('src/geom/brepRebuild.ts')
const prim = read('src/geom/primitiveFit.ts')
const slice = read('src/geom/slicePreview.ts')
const img = read('src/io/imageTrace.ts')
const laser = read('src/io/laserGcode.ts')
const mesh = read('src/io/meshProject.ts')
const pdf = read('src/io/pdf.ts')
const mf = read('src/io/threeMfImport.ts')
const links = read('src/sketch/projectLinks.ts')
const text = read('src/sketch/textShapes.ts')
const st = read('src/store.ts')
const face = read('src/analysis/faceFeaSelect.ts')
const mate = read('src/assembly/mateSolve.ts')
const fast = read('src/cad/fasteners.ts')
const lathe = read('src/cam/lathe.ts')

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
 * While SC remains → skip (FISHING53 pending).
 * When SC removed and TC present → hard PASS.
 */
function softRefuse(t, src, sc, tc, where) {
  const hasSC = hasSlashTol(src, sc)
  if (hasSC) {
    t.skip(`FISHING53 pending: still SC «${sc}» (${where})`)
    return
  }
  assert.ok(hasSlashTol(src, tc), `expected Formal TC «${tc}» (or slash alt) in ${where}`)
  assert.equal(hasSC, false, `must not keep SC «${sc}» in ${where}`)
}

// ── always-hard sanity + FISHING52 Formal regressions ────────────

test('sanity: F53 Formal target sources readable', () => {
  assert.ok(existsSync(toolsPath), 'src/ai/tools.ts missing')
  assert.ok(existsSync(feaCsvPath), 'src/analysis/feacsv.ts missing')
  assert.ok(existsSync(moldPath), 'src/analysis/moldflow.ts missing')
  assert.ok(existsSync(moldSolPath), 'src/analysis/moldsolve.ts missing')
  assert.ok(existsSync(voxelPath), 'src/analysis/voxelfea.ts missing')
  assert.ok(existsSync(gearsPath), 'src/cad/gears.ts missing')
  assert.ok(existsSync(inferPath), 'src/cad/inferConstraints.ts missing')
  assert.ok(existsSync(viewPath), 'src/cad/viewBookmark.ts missing')
  assert.ok(existsSync(brepPath), 'src/geom/brepRebuild.ts missing')
  assert.ok(existsSync(primPath), 'src/geom/primitiveFit.ts missing')
  assert.ok(existsSync(slicePath), 'src/geom/slicePreview.ts missing')
  assert.ok(existsSync(imgPath), 'src/io/imageTrace.ts missing')
  assert.ok(existsSync(laserPath), 'src/io/laserGcode.ts missing')
  assert.ok(existsSync(meshPath), 'src/io/meshProject.ts missing')
  assert.ok(existsSync(pdfPath), 'src/io/pdf.ts missing')
  assert.ok(existsSync(mfPath), 'src/io/threeMfImport.ts missing')
  assert.ok(existsSync(linksPath), 'src/sketch/projectLinks.ts missing')
  assert.ok(existsSync(textPath), 'src/sketch/textShapes.ts missing')
  assert.ok(existsSync(storePath), 'src/store.ts missing')
  assert.ok(tools.length > 500 && mold.length > 500 && voxel.length > 500)
  assert.ok(gears.length > 200 && brep.length > 200 && prim.length > 500)
})

test('FISHING52 regression: faceFea / mate / fast / lathe Formal still on tip', () => {
  assert.match(face, /空輸入（缺 grid\/faceTris）/)
  assert.match(mate, /殘差非有限（幾何退化）— 已還原求解前姿態/)
  assert.match(fast, /capscrew: '內六角螺絲 \(ISO 4762\)'/)
  assert.match(lathe, /安全直徑要大於毛坯/)
  assert.doesNotMatch(face, /空输入（缺 grid\/faceTris）/)
  assert.doesNotMatch(fast, /capscrew: '内六角螺丝 \(ISO 4762\)'/)
})

test('FISHING52 MATERIALS keys stay SC (storage ids — do not Formal-convert)', () => {
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

// ── soft: ai/tools (representative subset) ───────────────────────

test('Formal TC: tools 布尔操作 → 布爾操作', (t) => {
  softRefuse(
    t,
    tools,
    '布尔操作：new=新实体 / cut=从现有实体切走 / join=合并入现有实体（默认 new）',
    '布爾操作：new=新實體 / cut=從現有實體切走 / join=合併入現有實體（預設 new）',
    'ai/tools',
  )
})

test('Formal TC: tools 读取当前模型摘要 → 讀取', (t) => {
  softRefuse(t, tools, '读取当前模型摘要', '讀取當前模型摘要', 'ai/tools')
})

test('Formal TC: tools 清空当前文档 → 清空當前文檔', (t) => {
  softRefuse(t, tools, '清空当前文档，由零开始', '清空當前文檔，由零開始', 'ai/tools')
})

test('Formal TC: tools 建立长方体 → 建立長方體', (t) => {
  softRefuse(t, tools, '建立长方体（mm）', '建立長方體（mm）', 'ai/tools')
})

test('Formal TC: tools 建立圆柱 → 建立圓柱', (t) => {
  softRefuse(t, tools, '建立圆柱（mm）', '建立圓柱（mm）', 'ai/tools')
})

test("Formal TC: tools 直径 (mm) → 直徑 (mm)", (t) => {
  softRefuse(t, tools, "description: '直径 (mm)'", "description: '直徑 (mm)'", 'ai/tools')
})

test('Formal TC: tools 建立圆锥/圆台 → 建立圓錐/圓台', (t) => {
  softRefuse(t, tools, '建立圆锥/圆台（mm，顶直径 0 = 尖锥）', '建立圓錐/圓台（mm，頂直徑 0 = 尖錐）', 'ai/tools')
})

test('Formal TC: tools 建立圆环 → 建立圓環', (t) => {
  softRefuse(t, tools, '建立圆环（甜甜圈，mm）', '建立圓環（甜甜圈，mm）', 'ai/tools')
})

test('Formal TC: tools 倒圆角 所有棱 → 所有稜', (t) => {
  softRefuse(
    t,
    tools,
    '对当前实体【所有棱】倒圆角（半径 mm，免选边）',
    '對當前實體【所有稜】倒圓角（半徑 mm，免選邊）',
    'ai/tools',
  )
})

test('Formal TC: tools 字号 mm（默认 → 字號 mm（預設', (t) => {
  softRefuse(t, tools, '字号 mm（默认 12）', '字號 mm（預設 12）', 'ai/tools')
})

test('Formal TC: tools 设置实体材质 → 設置實體材質', (t) => {
  softRefuse(
    t,
    tools,
    '设置实体材质/外观（影响颜色 + 质量密度计算）',
    '設置實體材質/外觀（影響顏色 + 質量密度計算）',
    'ai/tools',
  )
})

test('Formal TC: tools 机械设计速算 → 機械設計速算', (t) => {
  softRefuse(
    t,
    tools,
    '机械设计速算（只返回结果，不改模型）。支持齿轮啮合 / 螺栓预紧',
    '機械設計速算（只返回結果，不改模型）。支持齒輪嚙合 / 螺栓預緊',
    'ai/tools',
  )
})

test('Formal TC: tools 将视图缩放 → 將視圖縮放', (t) => {
  softRefuse(
    t,
    tools,
    '将视图缩放到刚好框住模型（适应窗口）',
    '將視圖縮放到剛好框住模型（適應窗口）',
    'ai/tools',
  )
})

test('Formal TC: tools 导出当前模型 → 導出當前模型', (t) => {
  softRefuse(t, tools, '导出当前模型为档案（触发下载）', '導出當前模型為檔案（觸發下載）', 'ai/tools')
})

test('Formal TC: tools 运行模态分析 → 運行模態分析', (t) => {
  softRefuse(t, tools, '运行模态分析（体素 FEM', '運行模態分析（體素 FEM', 'ai/tools')
})

test('Formal TC: tools 运行线性屈曲 → 運行線性屈曲', (t) => {
  softRefuse(t, tools, '运行线性屈曲分析（体素 FEM', '運行線性屈曲分析（體素 FEM', 'ai/tools')
})

test('Formal TC: tools 从现有实体切走 → 從現有實體切走', (t) => {
  softRefuse(t, tools, '从现有实体切走', '從現有實體切走', 'ai/tools')
})

test('Formal TC: tools 加凸起/凹刻文字 → 英數/字號', (t) => {
  softRefuse(
    t,
    tools,
    '加凸起/凹刻文字（英数；放在 XY 面，时间轴可改字号/高度/基准Z）',
    '加凸起/凹刻文字（英數；放在 XY 面，時間軸可改字號/高度/基準Z）',
    'ai/tools',
  )
})

// ── soft: feacsv ─────────────────────────────────────────────────

test('Formal TC: feacsv （无） → （無）', (t) => {
  softRefuse(t, feaCsv, "'（无）'", "'（無）'", 'feacsv')
})

// ── soft: moldflow ───────────────────────────────────────────────

test("Formal TC: moldflow '体素化' → '體素化'", (t) => {
  softRefuse(t, mold, "'体素化'", "'體素化'", 'moldflow')
})

test("Formal TC: moldflow 体素化（薄壁加密） → 體素化（薄壁加密）", (t) => {
  softRefuse(t, mold, "'体素化（薄壁加密）'", "'體素化（薄壁加密）'", 'moldflow')
})

test("Formal TC: moldflow '厚度场' → '厚度場'", (t) => {
  softRefuse(t, mold, "'厚度场'", "'厚度場'", 'moldflow')
})

test("Formal TC: moldflow '后处理' → '後處理'", (t) => {
  softRefuse(t, mold, "'后处理'", "'後處理'", 'moldflow')
})

test('Formal TC: moldflow 已启用自动流道平衡 → 已啟用自動流道平衡', (t) => {
  softRefuse(t, mold, '已启用自动流道平衡', '已啟用自動流道平衡', 'moldflow')
})

test('Formal TC: moldflow 多浇口未平衡 → 多澆口未平衡', (t) => {
  softRefuse(t, mold, '多浇口未平衡', '多澆口未平衡', 'moldflow')
})

test('Formal TC: moldflow 零件偏厚/实心 → 零件偏厚/實心', (t) => {
  softRefuse(t, mold, '零件偏厚/实心', '零件偏厚/實心', 'moldflow')
})

test('Formal TC: moldflow 薄壁建议 → 薄壁建議', (t) => {
  softRefuse(t, mold, '薄壁建议', '薄壁建議', 'moldflow')
})

// ── soft: moldsolve ──────────────────────────────────────────────

test('Formal TC: moldsolve 翘曲位移 → 翹曲位移', (t) => {
  softRefuse(t, moldSol, '非 FEM 翘曲位移（未解残余应力', '非 FEM 翹曲位移（未解殘餘應力', 'moldsolve')
})

test('Formal TC: moldsolve 约束刚度/结晶 → 約束剛度/結晶', (t) => {
  softRefuse(
    t,
    moldSol,
    '残余应力/约束刚度/结晶取向/回弹',
    '殘餘應力/約束剛度/結晶取向/回彈',
    'moldsolve',
  )
})

// ── soft: voxelfea ───────────────────────────────────────────────

test('Formal TC: voxelfea 截面自适应加密 → 截面自適應加密', (t) => {
  softRefuse(t, voxel, '截面自适应加密', '截面自適應加密', 'voxelfea')
})

test('Formal TC: voxelfea 轴承载荷：载荷方向 → 軸承載荷', (t) => {
  softRefuse(
    t,
    voxel,
    '轴承载荷：载荷方向≈孔轴向，轴承推力须【垂直】孔轴',
    '軸承載荷：載荷方向≈孔軸向，軸承推力須【垂直】孔軸',
    'voxelfea',
  )
})

test('Formal TC: voxelfea 轴承载荷：孔面带内无受推节点 → 軸承載荷', (t) => {
  softRefuse(
    t,
    voxel,
    '轴承载荷：孔面带内无受推节点',
    '軸承載荷：孔面帶內無受推節點',
    'voxelfea',
  )
})

test('Formal TC: voxelfea 部分单元 vm 非有限 → 部分單元', (t) => {
  softRefuse(
    t,
    voxel,
    '部分单元 vm 非有限：已跳过不参与平均（保留原值）',
    '部分單元 vm 非有限：已跳過不參與平均（保留原值）',
    'voxelfea',
  )
})

test('Formal TC: voxelfea 法向量为零 → 法向量為零', (t) => {
  softRefuse(t, voxel, '法向量为零', '法向量為零', 'voxelfea')
})

// ── soft: gears / infer / viewBookmark ───────────────────────────

test('Formal TC: gears 目标…无法达 → 目標…無法達', (t) => {
  softRefuse(
    t,
    gears,
    '目标 ${t} 倍无法达（实得 ${achieved.toFixed(2)}，误差 ${errPct.toFixed(1)}%）— 请加级数',
    '目標 ${t} 倍無法達（實得 ${achieved.toFixed(2)}，誤差 ${errPct.toFixed(1)}%）— 請加級數',
    'gears',
  )
})

test('Formal TC: gears 纯运动学参考 → 純運動學參考', (t) => {
  softRefuse(
    t,
    gears,
    '（纯运动学参考，本模块不生成蜗轮）',
    '（純運動學參考，本模塊不生成蝸輪）',
    'gears',
  )
})

test('Formal TC: infer 夹角 → 夾角', (t) => {
  softRefuse(t, infer, '(夹角 ${between.toFixed(2)}°)', '(夾角 ${between.toFixed(2)}°)', 'inferConstraints')
})

test("Formal TC: viewBookmark default name 视图 → 視圖", (t) => {
  softRefuse(t, view, ": '视图'", ": '視圖'", 'viewBookmark')
})

// ── soft: brepRebuild ────────────────────────────────────────────

test('Formal TC: brep 平面没有边界环 → 平面沒有邊界環', (t) => {
  softRefuse(t, brep, '平面没有边界环（网格坏）', '平面沒有邊界環（網格壞）', 'brepRebuild')
})

test('Formal TC: brep 有边界环 → 有邊界環', (t) => {
  softRefuse(
    t,
    brep,
    '有边界环（v1 用自然整球，会缝不埋）',
    '有邊界環（v1 用自然整球，會縫不埋）',
    'brepRebuild',
  )
})

test('Formal TC: brep 无法参数化 → 無法參數化', (t) => {
  softRefuse(
    t,
    brep,
    'freeform 无法参数化（网格投影不单射）',
    'freeform 無法參數化（網格投影不單射）',
    'brepRebuild',
  )
})

// ── soft: primitiveFit ───────────────────────────────────────────

test('Formal TC: prim 半径 > 5× 包围盒 → 半徑…包圍盒', (t) => {
  softRefuse(
    t,
    prim,
    '半径 > 5× 包围盒（其实是平面）',
    '半徑 > 5× 包圍盒（其實是平面）',
    'primitiveFit',
  )
})

test('Formal TC: prim 弧覆盖 → 弧覆蓋', (t) => {
  softRefuse(t, prim, '弧覆盖 ${span.coverageDeg.toFixed(0)}°', '弧覆蓋 ${span.coverageDeg.toFixed(0)}°', 'primitiveFit')
})

test('Formal TC: prim 半顶角 → 半頂角', (t) => {
  softRefuse(
    t,
    prim,
    '半顶角 ${halfAngleDeg.toFixed(1)}° 退化（≈圆柱/平面）',
    '半頂角 ${halfAngleDeg.toFixed(1)}° 退化（≈圓柱/平面）',
    'primitiveFit',
  )
})

test('Formal TC: prim 不足简单者 → 不足簡單者', (t) => {
  softRefuse(t, prim, '不足简单者', '不足簡單者', 'primitiveFit')
})

test('Formal TC: prim 轴 → 全域 → 軸 → 全域', (t) => {
  softRefuse(t, prim, '轴 → 全域', '軸 → 全域', 'primitiveFit')
})

test('Formal TC: prim 共轴 → 共軸', (t) => {
  softRefuse(t, prim, '共轴（轴距', '共軸（軸距', 'primitiveFit')
})

test('Formal TC: prim 等半径 → 等半徑', (t) => {
  softRefuse(t, prim, '等半径 →', '等半徑 →', 'primitiveFit')
})

// ── soft: slicePreview / imageTrace / laser / mesh / pdf ─────────

test('Formal TC: slice 超 400 层上限 → 超 400 層上限', (t) => {
  softRefuse(
    t,
    slice,
    '超 400 层上限，分析层距已加大到',
    '超 400 層上限，分析層距已加大到',
    'slicePreview',
  )
})

test('Formal TC: imageTrace 识别…个轮廓 → 識別…個輪廓', (t) => {
  softRefuse(
    t,
    img,
    '识别 ${contours.length} 个轮廓',
    '識別 ${contours.length} 個輪廓',
    'imageTrace',
  )
})

test('Formal TC: laser 光束半宽 → 光束半寬', (t) => {
  softRefuse(t, laser, '（光束半宽）', '（光束半寬）', 'laserGcode')
})

test('Formal TC: meshProject 16 个元素 → 16 個元素', (t) => {
  softRefuse(
    t,
    mesh,
    'matrix 需要 16 个元素（column-major）',
    'matrix 需要 16 個元素（column-major）',
    'meshProject',
  )
})

test('Formal TC: pdf 无效图像 → 無效圖像', (t) => {
  softRefuse(t, pdf, 'jpegToPdf: 无效图像', 'jpegToPdf: 無效圖像', 'pdf')
})

// ── soft: threeMfImport ──────────────────────────────────────────

test('Formal TC: 3mf 格式有错 → 格式有錯', (t) => {
  softRefuse(t, mf, '模型 XML 格式有错', '模型 XML 格式有錯', 'threeMfImport')
})

test('Formal TC: 3mf 没有 <model> → 沒有 <model>', (t) => {
  softRefuse(t, mf, 'XML 内没有 <model> 根节点', 'XML 內沒有 <model> 根節點', 'threeMfImport')
})

test('Formal TC: 3mf 顶点坐标 → 頂點坐標', (t) => {
  softRefuse(t, mf, '顶点坐标不是有效数字', '頂點坐標不是有效數字', 'threeMfImport')
})

test('Formal TC: 3mf 三角形索引超出 → 超出頂點範圍', (t) => {
  softRefuse(t, mf, '三角形索引超出顶点范围', '三角形索引超出頂點範圍', 'threeMfImport')
})

test('Formal TC: 3mf 内没有任何网格几何 → 內沒有任何網格幾何', (t) => {
  softRefuse(t, mf, '内没有任何网格几何', '內沒有任何網格幾何', 'threeMfImport')
})

// ── soft: projectLinks / textShapes ──────────────────────────────

test("Formal TC: projectLinks 开放/闭合 → 開放/閉合", (t) => {
  softRefuse(t, links, "'开放':'闭合'", "'開放':'閉合'", 'projectLinks')
})

test('Formal TC: projectLinks N 点 → N 點', (t) => {
  softRefuse(t, links, '} 点 · X', '} 點 · X', 'projectLinks')
})

test('Formal TC: textShapes 非法字号 → 非法字號', (t) => {
  softRefuse(t, text, '非法字号 size=', '非法字號 size=', 'textShapes')
})
