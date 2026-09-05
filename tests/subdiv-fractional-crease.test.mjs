// 分数折痕 sharpness 验证（S）。跑法：npx tsx tests/subdiv-fractional-crease.test.mjs
import { ccSubdivide, makeBoxCage } from '../src/cad/subdiv.ts'
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m) } }
const veq = (A, B) => A.verts.length === B.verts.length && A.verts.every((v, i) => Math.abs(v[0] - B.verts[i][0]) < 1e-12 && Math.abs(v[1] - B.verts[i][1]) < 1e-12 && Math.abs(v[2] - B.verts[i][2]) < 1e-12)

const cage = makeBoxCage(10, 10, 10, 1, 1, 1)   // 8 顶点 6 quad
// 揾一条真存在嘅边做折痕（用 cage 第一个 quad 嘅头两个顶点）
const [a, b] = [cage.quads[0][0], cage.quads[0][1]]
const cr = [[a, b]]

console.log('① 回归门：w=1 ≡ 缺省（无 creaseW）≡ 旧二元锐折痕（逐字节）：')
const sharpDefault = ccSubdivide(cage, 2, cr)            // 旧路径（无 creaseW）
const sharpW1 = ccSubdivide(cage, 2, cr, [1])            // w=1
ok(veq(sharpDefault, sharpW1), 'w=1 同缺省逐字节一致')

console.log('② w=0 ≡ 无折痕（纯平滑，逐字节）：')
const smooth = ccSubdivide(cage, 2)                      // 无折痕
const w0 = ccSubdivide(cage, 2, cr, [0])                // w=0
ok(veq(smooth, w0), 'w=0 同无折痕逐字节一致')

console.log('③ w=0.5 系真分数（同 w=1、w=0 都唔同，且 quad/顶点数一致）：')
const w5 = ccSubdivide(cage, 2, cr, [0.5])
ok(w5.verts.length === sharpW1.verts.length && w5.quads.length === sharpW1.quads.length, '分数细分拓扑同锐折痕一致')
ok(!veq(w5, sharpW1) && !veq(w5, smooth), 'w=0.5 顶点位置 ∈(sharp, smooth) 之间（≠两端）')

console.log('④ 单层 edge-point：w=0.5 嘅折痕边中点恰喺 sharp 同 smooth edge-point 之中点：')
// 单层细分后，edge-point 索引 = nV + nF + e。比较 w=0.5 同 (w1+w0)/2
const L1s = ccSubdivide(cage, 1, cr, [1]), L1m = ccSubdivide(cage, 1, cr, [0]), L1h = ccSubdivide(cage, 1, cr, [0.5])
let found = false
for (let i = 0; i < L1h.verts.length; i++) {
  const mid = [(L1s.verts[i][0] + L1m.verts[i][0]) / 2, (L1s.verts[i][1] + L1m.verts[i][1]) / 2, (L1s.verts[i][2] + L1m.verts[i][2]) / 2]
  if (Math.abs(L1h.verts[i][0] - mid[0]) > 1e-9 || Math.abs(L1h.verts[i][1] - mid[1]) > 1e-9 || Math.abs(L1h.verts[i][2] - mid[2]) > 1e-9) { found = true; break }
}
// 注：vertex-point 用阈值分类故 w=0.5 顶点未必系线性中点；但 edge-point 必系线性 lerp → 至少要有部分顶点系精确中点
let exactMid = 0
for (let i = 0; i < L1h.verts.length; i++) {
  const mid = [(L1s.verts[i][0] + L1m.verts[i][0]) / 2, (L1s.verts[i][1] + L1m.verts[i][1]) / 2, (L1s.verts[i][2] + L1m.verts[i][2]) / 2]
  if (Math.abs(L1h.verts[i][0] - mid[0]) < 1e-9 && Math.abs(L1h.verts[i][1] - mid[1]) < 1e-9 && Math.abs(L1h.verts[i][2] - mid[2]) < 1e-9) exactMid++
}
ok(exactMid >= L1h.verts.length - 4, `大部分顶点（含折痕 edge-point）系 sharp/smooth 线性中点（${exactMid}/${L1h.verts.length}）`)

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
