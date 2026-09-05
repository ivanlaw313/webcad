// hole-tonext.test.mjs — GM-3DV1 S10 孔「到下一面」纯几何【验收】测。
// 逐字复刻 store.ts holeNextFaceZ（由孔心向 −z 揾正下方最近面 z）+ _ptInTriXY，喺人手砌嘅 CAD 三角网上断言。
// 跑法（喺 C:\ClaudeCode\webcad）: npx -y tsx tests/hole-tonext.test.mjs（或 node）
let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }
const near = (a, b, tol = 0.05) => a != null && Math.abs(a - b) < tol

// ── 逐字复刻 store.ts（GM-3DV1 S10）──
function _ptInTriXY(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0, hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}
function holeNextFaceZ(verts, tris, cx, cy, top) {
  let bestZ = -Infinity
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const a = tris[i] * 3, b = tris[i + 1] * 3, c = tris[i + 2] * 3
    const ax = verts[a], ay = verts[a + 1], az = verts[a + 2]
    const bx = verts[b], by = verts[b + 1], bz = verts[b + 2]
    const cx2 = verts[c], cy2 = verts[c + 1], cz = verts[c + 2]
    if (!_ptInTriXY(cx, cy, ax, ay, bx, by, cx2, cy2)) continue
    const denom = (by - cy2) * (ax - cx2) + (cx2 - bx) * (ay - cy2)
    if (Math.abs(denom) < 1e-9) continue
    const w1 = ((by - cy2) * (cx - cx2) + (cx2 - bx) * (cy - cy2)) / denom
    const w2 = ((cy2 - ay) * (cx - cx2) + (ax - cx2) * (cy - cy2)) / denom
    const z = w1 * az + w2 * bz + (1 - w1 - w2) * cz
    if (z < top - 0.05 && z > bestZ) bestZ = z
  }
  return bestZ > -Infinity ? bestZ : null
}

// helper：一块水平矩形板（z 恒定）→ 两个三角（CAD 坐标 verts flat + tris idx）
function quadZ(x0, y0, x1, y1, z, base = []) {
  const off = base.length / 3
  base.push(x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z)
  return { verts: base, tris: [off, off + 1, off + 2, off, off + 2, off + 3] }
}

// ═══ 场景 1：单层顶/底面（top z=20、bottom z=0），孔心 (5,5) ═══
{
  const V = []
  const t1 = quadZ(-10, -10, 10, 10, 20, V).tris   // 顶面 z=20
  const t2 = quadZ(-10, -10, 10, 10, 0, V).tris    // 底面 z=0
  const tris = [...t1, ...t2]
  const nz = holeNextFaceZ(V, tris, 5, 5, 20)
  report('S10(1) 单块：入口 top=20 → 下一面 = 底面 z=0', near(nz, 0), { nz })
}

// ═══ 场景 2：内有台阶（顶 z=20、中间台阶面 z=8、底 z=0）——「到下一面」= 台阶 z=8（非底） ═══
{
  const V = []
  const tris = [
    ...quadZ(-10, -10, 10, 10, 20, V).tris,   // 顶 z=20
    ...quadZ(-10, -10, 10, 10, 8, V).tris,    // 台阶面 z=8（最近下方）
    ...quadZ(-10, -10, 10, 10, 0, V).tris,    // 底 z=0
  ]
  const nz = holeNextFaceZ(V, tris, 3, -2, 20)
  report('S10(2) 台阶：入口 top=20 → 下一面 = 台阶 z=8（非底 0）', near(nz, 8), { nz })
}

// ═══ 场景 3：孔心落喺板范围【外】→ 无正下方面 → null（退回贯通） ═══
{
  const V = []
  const tris = [...quadZ(-10, -10, 10, 10, 20, V).tris, ...quadZ(-10, -10, 10, 10, 0, V).tris]
  const nz = holeNextFaceZ(V, tris, 50, 50, 20)
  report('S10(3) 孔心出界：正下方冇面 → null', nz === null, { nz })
}

// ═══ 场景 4：入口面本身（z≈top）唔算「下一面」——只有顶面时 → null ═══
{
  const V = []
  const tris = quadZ(-10, -10, 10, 10, 20, V).tris   // 只有 z=20 顶面
  const nz = holeNextFaceZ(V, tris, 0, 0, 20)
  report('S10(4) 只顶面：忽略入口面本身 → null', nz === null, { nz })
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAIL'} — pass=${pass} fail=${fail}`)
process.exit(fail === 0 ? 0 : 1)
