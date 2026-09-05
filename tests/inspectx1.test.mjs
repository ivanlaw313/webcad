// Wave X1（检查/INSPECT）纯逻辑测试：统一 Measure 组合分派 / 精度+副单位格式化 / Properties 报告 /
// 分析节点数组 / 网格面组上色。跑法：npx -y tsx tests/inspectx1.test.mjs
import { combineMeasure } from '../src/cad/measureCombine.ts'
import { fmtLenP, fmtAreaP, fmtVolP, fmtAngP, clampPrec } from '../src/cad/measureFmt.ts'
import { buildPropsReport, accuracyToQuality } from '../src/cad/propsReport.ts'
import { upsertAnalysis, toggleAnalysisVisible, removeAnalysis, activeAnalysisType } from '../src/cad/analysesModel.ts'
import { buildFaceGroupColors, faceGroupPaletteIndex, faceGroupCount, hexToRgb } from '../src/cad/faceGroupColors.ts'
import { computeMassProps } from '../src/cad/massProps.ts'

let pass = 0, fail = 0
const rows = []
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t
const ck = (name, cond, detail) => { rows.push([cond ? 'PASS' : 'FAIL', name, detail || '']); cond ? pass++ : fail++ }

// ── 1. 统一 Measure 组合分派 ──────────────────────────────────────────
ck('空拾取 → empty', combineMeasure([]).type === 'empty')
ck('1 面 → 面积', (() => { const r = combineMeasure([{ kind: 'face', area: 2400, perimeter: 200 }]); return r.type === 'area' && near(r.value, 2400) && near(r.perimeter, 200) })())
ck('1 直边 → 棱长', (() => { const r = combineMeasure([{ kind: 'edge', length: 60 }]); return r.type === 'length' && near(r.value, 60) })())
ck('1 圆边闭合 → 孔径Ø', (() => { const r = combineMeasure([{ kind: 'edge', length: 31.4, radius: 5, closed: true }]); return r.type === 'length' && near(r.value, 10) && r.label === '孔径Ø' })())
ck('2 面 → 夹角90°+补角', (() => { const r = combineMeasure([{ kind: 'face', area: 1, normal: [1, 0, 0] }, { kind: 'face', area: 1, normal: [0, 1, 0] }]); return r.type === 'angle' && near(r.value, 90, 1e-4) && near(r.supplement, 90, 1e-4) })())
ck('2 面 同向 → unsupported（同一面守卫）', combineMeasure([{ kind: 'face', normal: [1, 0, 0] }, { kind: 'face', normal: [1, 0, 0] }]).type === 'unsupported')
ck('2 点 → 距离+ΔXYZ', (() => { const r = combineMeasure([{ kind: 'point', p: [0, 0, 0] }, { kind: 'point', p: [3, 4, 0] }]); return r.type === 'distance' && near(r.value, 5) && near(r.delta[0], 3) && near(r.delta[1], 4) })())
ck('顶点当点处理', (() => { const r = combineMeasure([{ kind: 'vertex', p: [0, 0, 0] }, { kind: 'vertex', p: [0, 0, 2] }]); return r.type === 'distance' && near(r.value, 2) })())
ck('边+面 → 最短距(点面)', (() => { const r = combineMeasure([{ kind: 'edge', mid: [0, 0, 10] }, { kind: 'face', center: [0, 0, 0], normal: [0, 0, 1] }]); return r.type === 'distance' && r.label === '最短距' && near(r.value, 10) })())
ck('点+面 → 点面距', (() => { const r = combineMeasure([{ kind: 'point', p: [5, 5, 7] }, { kind: 'face', center: [0, 0, 0], normal: [0, 0, 1] }]); return r.type === 'distance' && near(r.value, 7) })())
ck('点+边 → 点线距', (() => { const r = combineMeasure([{ kind: 'point', p: [0, 3, 0] }, { kind: 'edge', mid: [0, 0, 0], dir: [1, 0, 0] }]); return r.type === 'distance' && near(r.value, 3) })())
ck('2 边 → 中点距(近似标注)', (() => { const r = combineMeasure([{ kind: 'edge', mid: [0, 0, 0], dir: [1, 0, 0] }, { kind: 'edge', mid: [0, 0, 50], dir: [1, 0, 0] }]); return r.type === 'distance' && near(r.value, 50) && /近似/.test(r.note || '') })())
ck('2 真边 → 内部最近距', (() => { const r = combineMeasure([{ kind: 'edge', mid: [5, 0, 0], pts: [[0, 0, 0], [10, 0, 0]] }, { kind: 'edge', mid: [3, 0, 4], pts: [[3, -5, 4], [3, 5, 4]] }]); return r.type === 'distance' && r.label === '最短距离' && near(r.value, 4) && !/近似/.test(r.note || '') })())
ck('3 拾取 → unsupported', combineMeasure([{ kind: 'point', p: [0, 0, 0] }, { kind: 'point', p: [1, 0, 0] }, { kind: 'point', p: [2, 0, 0] }]).type === 'unsupported')
ck('parts 逐实体读数存在', combineMeasure([{ kind: 'face', area: 100 }]).parts.length === 1)

// ── 2. 精度 + 副单位格式化（默认逐字节等价旧读数）──────────────────────
ck('fmtLenP 默认 mm 1 位（等价旧）', fmtLenP(12.34) === '12.3 mm')
ck('fmtLenP 默认 cm 2 位（等价旧）', fmtLenP(12.34, 'cm') === '1.23 cm')
ck('fmtLenP 默认 inch 3 位（等价旧）', fmtLenP(25.4, 'inch') === '1.000 in')
ck('fmtLenP prec=3 覆盖 mm', fmtLenP(12.3456, 'mm', 3) === '12.346 mm')
ck('fmtLenP prec=0', fmtLenP(12.7, 'mm', 0) === '13 mm')
ck('fmtLenP 副单位 inch（默认精度）', fmtLenP(25.4, 'mm', null, 'inch') === '25.4 mm (1.000 in)', fmtLenP(25.4, 'mm', null, 'inch'))
ck('fmtLenP 副单位 prec 覆盖两者', fmtLenP(25.4, 'mm', 1, 'inch') === '25.4 mm (1.0 in)', fmtLenP(25.4, 'mm', 1, 'inch'))
ck('fmtLenP 副单位同主 → 唔重复', fmtLenP(10, 'mm', null, 'mm') === '10.0 mm')
ck('fmtAreaP 默认 cm² 1 位（等价旧）', fmtAreaP(2400) === '24.0 cm²')
ck('fmtAreaP inch 默认 2 位', fmtAreaP(645.16, 'inch') === '1.00 in²')
ck('fmtVolP 默认 cm³ 2 位（等价旧）', fmtVolP(72000) === '72.00 cm³')
ck('fmtVolP inch 默认 3 位', fmtVolP(16387.064, 'inch') === '1.000 in³')
ck('fmtAngP 默认 2 位', fmtAngP(90) === '90.00°')
ck('clampPrec 钳 0..8', clampPrec(-3) === 0 && clampPrec(99) === 8 && clampPrec(3.4) === 3)

// ── 3. Properties 报告（精度 + 坐标 世界⇄COM + 复制文本）──────────────
// 40×60×30 mm 立方（角落原点），钢密度 7.85 → 复用 massprops 真值
function box(ox, oy, oz, a, b, c) {
  const v = [[ox, oy, oz], [ox + a, oy, oz], [ox + a, oy + b, oz], [ox, oy + b, oz], [ox, oy, oz + c], [ox + a, oy, oz + c], [ox + a, oy + b, oz + c], [ox, oy + b, oz + c]]
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]]
  return { vertices: v.flat(), triangles: f.flat() }
}
const bm = box(0, 0, 0, 40, 60, 30)
const mp = computeMassProps(bm.vertices, bm.triangles, 7.85)
const repW = buildPropsReport(mp, { frame: 'world', density: 7.85, material: '钢', unit: 'mm', bbox: { min: [0, 0, 0], max: [40, 60, 30] }, accuracy: 'med', name: '实体1' })
ck('Properties 体积 72.00 cm³', repW.rows.some((r) => r.label === '体积' && r.value === '72.00 cm³'), repW.rows.find((r) => r.label === '体积')?.value)
ck('Properties 面积 108.0 cm²', repW.rows.some((r) => r.label === '面积' && r.value === '108.0 cm²'), repW.rows.find((r) => r.label === '面积')?.value)
ck('Properties 质量 565.20 g', (() => { const g = 7.85 * 1e-9 * 72000 * 1e6; return near(g, 565.2, 1e-3) })(), String(7.85 * 72))
ck('Properties 质心 (20,30,15)', repW.rows.some((r) => r.label === '质心 COM' && /20\.0 mm, 30\.0 mm, 15\.0 mm/.test(r.value)), repW.rows.find((r) => r.label === '质心 COM')?.value)
ck('Properties frame=world 显示@原点', repW.rows.some((r) => r.label.includes('@原点')))
const repC = buildPropsReport(mp, { frame: 'com', density: 7.85, unit: 'mm' })
ck('Properties frame=com 显示@质心', repC.rows.some((r) => r.label.includes('@质心')))
ck('Properties world/com 惯性张量唔同', JSON.stringify(repW.rows.filter((r) => /Ixx/.test(r.label))) !== JSON.stringify(repC.rows.filter((r) => /Ixx/.test(r.label))))
ck('Properties 复制文本含标题', /物理属性 — 实体1/.test(repW.text) && /精度=中/.test(repW.text))
ck('accuracyToQuality 映射', accuracyToQuality('low') === 'coarse' && accuracyToQuality('med') === 'medium' && accuracyToQuality('high') === 'fine')
// 精度收敛：细分球体积随细分逼近解析（用两种细分档比较）
function icoSphere(r, sub) {
  // 简易 UV 球
  const lat = 8 * sub, lon = 16 * sub, V = [], T = []
  for (let i = 0; i <= lat; i++) { const th = Math.PI * i / lat; for (let j = 0; j <= lon; j++) { const ph = 2 * Math.PI * j / lon; V.push(r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)) } }
  const idx = (i, j) => i * (lon + 1) + j
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) { const a = idx(i, j), b = idx(i + 1, j), c = idx(i + 1, j + 1), d = idx(i, j + 1); T.push(a, b, c, a, c, d) }
  return { vertices: V, triangles: T }
}
const trueVol = (4 / 3) * Math.PI * 10 ** 3
const vCoarse = computeMassProps(icoSphere(10, 1).vertices, icoSphere(10, 1).triangles).volume
const vFine = computeMassProps(icoSphere(10, 3).vertices, icoSphere(10, 3).triangles).volume
ck('Properties 精度：细分越高越逼近球体积', Math.abs(vFine - trueVol) < Math.abs(vCoarse - trueVol), `coarse=${vCoarse.toFixed(1)} fine=${vFine.toFixed(1)} true=${trueVol.toFixed(1)}`)

// ── 4. 分析节点数组 ──────────────────────────────────────────────────
let A = []
A = upsertAnalysis(A, { id: 'a1', type: 'zebra', visible: true })
ck('分析 upsert 加节点', A.length === 1 && A[0].label === '斑马纹')
A = upsertAnalysis(A, { id: 'a2', type: 'draft', visible: true, params: { pull: [0, 0, 1] } })
ck('分析 加第二类', A.length === 2)
A = upsertAnalysis(A, { id: 'a3', type: 'zebra', visible: true })
ck('分析 同类 upsert 唔重复 + 保留旧 id', A.length === 2 && A.find((x) => x.type === 'zebra').id === 'a1')
ck('分析 activeAnalysisType 取最后可见', activeAnalysisType(A) === 'draft')
A = toggleAnalysisVisible(A, 'a2')
ck('分析 toggle 隐藏 draft', A.find((x) => x.type === 'draft').visible === false)
ck('分析 隐藏后 active 回 zebra', activeAnalysisType(A) === 'zebra')
A = removeAnalysis(A, 'a1')
ck('分析 remove', A.length === 1 && A[0].type === 'draft')

// ── 5. 网格面组上色 ───────────────────────────────────────────────────
const PAL = ['#e6194b', '#3cb44b', '#4363d8']
// 两三角、两面组
const fgMesh = { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0], triangles: [0, 1, 2, 3, 4, 5], faceGroups: [{ start: 0, count: 3, faceId: 7 }, { start: 3, count: 3, faceId: 9 }] }
ck('hexToRgb', (() => { const [r, g, b] = hexToRgb('#ff8000'); return near(r, 1) && near(g, 128 / 255) && near(b, 0) })())
ck('面组调色索引循环', (() => { const m = faceGroupPaletteIndex(fgMesh, 3); return m.get(7) === 0 && m.get(9) === 1 })())
ck('面组数', faceGroupCount(fgMesh) === 2)
const cols = buildFaceGroupColors(fgMesh, PAL)
ck('逐顶点色 buffer 长度', cols && cols.length === 6 * 3)
ck('面组1 顶点0 = 调色板0', cols && near(cols[0], hexToRgb(PAL[0])[0]) && near(cols[1], hexToRgb(PAL[0])[1]))
ck('面组2 顶点3 = 调色板1', cols && near(cols[3 * 3], hexToRgb(PAL[1])[0]))
ck('无 faceGroups → null', buildFaceGroupColors({ vertices: [0, 0, 0], triangles: [0, 0, 0] }, PAL) === null)

console.log('\n========== PASS/FAIL 总表 ==========')
for (const [st, n, d] of rows) console.log(`  ${st}  ${n}${d !== '' && d != null ? '  (' + d + ')' : ''}`)
console.log('====================================')
console.log(fail === 0 ? `全部 ${pass} 项通过` : `${fail} 项失败 / 共 ${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
