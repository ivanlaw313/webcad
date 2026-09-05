// S193：setSymmetricFormVert 对称编辑 —— 移一点自动镜像伙伴同步；落对称平面锁轴；非法返 null。
import { makeBoxCage, setSymmetricFormVert } from '../src/cad/subdiv.ts'
let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗', m) } }
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e

// 盒中心 x,y∈[-1,1]、z∈[0,2]、nx=ny=nz=2 → 中点落 0（x=0 顶点喺对称平面上）
const box = makeBoxCage(2, 2, 2, 2, 2, 2)
const find = (x, y, z) => box.verts.findIndex((v) => near(v[0], x) && near(v[1], y) && near(v[2], z))

console.log('① 离面顶点 + 镜像伙伴同步：')
const i = find(-1, -1, 0)            // x=-1 离对称平面 x=0
const mi = find(1, -1, 0)            // 其镜像 x=+1
ok(i >= 0 && mi >= 0, '搵到镜像对 (-1,-1,0)/(1,-1,0)')
const r = setSymmetricFormVert(box, i, [-1.3, -1.2, 0.1], 0, 0)
ok(r != null, '对称编辑成功（非 null）')
if (r) {
  ok(near(r.verts[i][0], -1.3) && near(r.verts[i][1], -1.2) && near(r.verts[i][2], 0.1), '被移点落新位')
  ok(near(r.verts[mi][0], 1.3) && near(r.verts[mi][1], -1.2) && near(r.verts[mi][2], 0.1), '镜像伙伴落对称新位 [1.3,-1.2,0.1]')
  // 其它顶点唔郁
  let others = 0; for (let k = 0; k < box.verts.length; k++) if (k !== i && k !== mi) { const a = box.verts[k], b = r.verts[k]; if (!near(a[0], b[0]) || !near(a[1], b[1]) || !near(a[2], b[2])) others++ }
  ok(others === 0, '其余顶点纹丝不动')
}

console.log('② 落对称平面顶点 → 锁轴只移自己：')
const j = find(0, -1, 0)             // x=0 落对称平面
ok(j >= 0, '搵到平面上顶点 (0,-1,0)')
const r2 = setSymmetricFormVert(box, j, [0.5, -1.2, 0.1], 0, 0)   // 试图移离平面
ok(r2 != null, '平面顶点编辑成功')
if (r2) {
  ok(near(r2.verts[j][0], 0), '锁喺对称平面 x=0（唔俾移离）')
  ok(near(r2.verts[j][1], -1.2) && near(r2.verts[j][2], 0.1), '平面内分量照跟')
}

console.log('③ 守卫：非法输入 / 镜像唔存在 → null：')
ok(setSymmetricFormVert(box, -1, [0, 0, 0], 0, 0) === null, '越界 index → null')
ok(setSymmetricFormVert(box, 0, [NaN, 0, 0], 0, 0) === null, 'NaN 位 → null')
// 平移盒令冇 x=0 对称（mirror 唔存在）
const off = { verts: box.verts.map((v) => [v[0] + 10, v[1], v[2]]), quads: box.quads }
ok(setSymmetricFormVert(off, find(-1, -1, 0) >= 0 ? 0 : 0, [11, 0, 0], 0, 0) === null, '非对称笼（无镜像伙伴）→ null')

console.log(`\n${fail === 0 ? '✅ 全部通过' : '❌ 有失败'} (${pass} pass / ${fail} fail)`)
process.exit(fail === 0 ? 0 : 1)
