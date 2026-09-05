// S192：ccSubdivide 开放/边界支持 —— 开放 patch 唔再 throw，边界跟 B-spline，patch 角钉死，平面保平面。
// 闭合盒回归（仍合法 + 唔 throw）。tsx 直接跑（subdiv.ts 零 import）。
import { makeBoxCage, ccSubdivide } from '../src/cad/subdiv.ts'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++ } else { fail++; console.log('  ✗', m) } }

// ── 开放平面 patch：N×N quad 网格 @ z=0（四周开边界）──
function flatPatch(n, size = 1) {
  const verts = [], quads = []
  const vid = (i, j) => i * (n + 1) + j
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) verts.push([i * size, j * size, 0])
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) quads.push([vid(i, j), vid(i + 1, j), vid(i + 1, j + 1), vid(i, j + 1)])
  return { verts, quads }
}

// 边流形统计：返 {bnd, nonman} = 边界边数 / ≥3 面边数
function edgeStats(m) {
  const cnt = new Map()
  for (const q of m.quads) for (let s = 0; s < 4; s++) {
    const a = q[s], b = q[(s + 1) & 3]; const k = a < b ? a + '_' + b : b + '_' + a
    cnt.set(k, (cnt.get(k) || 0) + 1)
  }
  let bnd = 0, nonman = 0
  for (const c of cnt.values()) { if (c === 1) bnd++; else if (c > 2) nonman++ }
  return { bnd, nonman }
}

console.log('开放平面 patch 2×2 → ccSubdivide L1：')
const p = flatPatch(2, 1)   // 9 verts, 4 quads, corners (0,0)(2,0)(2,2)(0,2)
let sub = null, threw = false
try { sub = ccSubdivide(p, 1) } catch (e) { threw = true; console.log('  ✗ threw:', e.message) }
ok(!threw, '开放 patch 唔再 throw')
if (sub) {
  // 1) 仍 quad mesh，quad 数 = 4×4
  ok(sub.quads.length === 16, `quad 数 16（实 ${sub.quads.length}）`)
  // 2) 平面保平面：所有 z ≈ 0
  let maxZ = 0; for (const v of sub.verts) maxZ = Math.max(maxZ, Math.abs(v[2]))
  ok(maxZ < 1e-9, `平面保平面 max|z|<1e-9（实 ${maxZ.toExponential(1)}）`)
  // 3) 仍开放（有边界边），无非流形
  const st = edgeStats(sub)
  ok(st.bnd > 0, `仍开放（边界边 ${st.bnd} > 0）`)
  ok(st.nonman === 0, `无非流形边（≥3面 ${st.nonman}）`)
  // 4) patch 4 角钉死（坐标不变）—— 开放 patch 角点系 valence-2 边界顶点
  const corners = [[0, 0, 0], [2, 0, 0], [2, 2, 0], [0, 2, 0]]
  let cornersPinned = 0
  for (const c of corners) if (sub.verts.some((v) => Math.hypot(v[0] - c[0], v[1] - c[1], v[2] - c[2]) < 1e-9)) cornersPinned++
  ok(cornersPinned === 4, `4 角钉死保留坐标（实 ${cornersPinned}/4）`)
  // 5) 边界收缩入但仍在 [0,2]×[0,2] 内（B-spline 边界唔出界）
  let inBox = true; for (const v of sub.verts) if (v[0] < -1e-9 || v[0] > 2 + 1e-9 || v[1] < -1e-9 || v[1] > 2 + 1e-9) inBox = false
  ok(inBox, '边界 B-spline 唔出 [0,2]² 控制多边形界')
  // 6) 多层唔 throw
  let threw2 = false; try { ccSubdivide(p, 3) } catch { threw2 = true }
  ok(!threw2, '开放 patch L3 多层唔 throw')
}

console.log('闭合盒回归（仍合法 + 唔 throw）：')
const box = makeBoxCage(10, 10, 10, 1, 1, 1)
let bsub = null, bthrew = false
try { bsub = ccSubdivide(box, 2) } catch (e) { bthrew = true; console.log('  ✗ box threw:', e.message) }
ok(!bthrew, '闭合盒唔 throw')
if (bsub) {
  const st = edgeStats(bsub)
  ok(st.bnd === 0, `闭合盒细分后仍闭合（边界边 ${st.bnd}=0）`)
  ok(st.nonman === 0, '闭合盒无非流形边')
}

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
