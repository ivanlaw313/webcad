// sweep-edgechain.test.mjs — GM-3DV1 S5 沿实体边链扫掠：边多段线首尾接力串脊线【验收】测。
// 逐字复刻 store.ts chainEdgePolylines（贪心最近端点接力 + 反转 + 去重合），断言乱序/反向/断裂各情况。
// 跑法（喺 C:\ClaudeCode\webcad）: npx -y tsx tests/sweep-edgechain.test.mjs（或 node）
let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }

// ── 逐字复刻 store.ts（GM-3DV1 S5）──
function chainEdgePolylines(lines, tol = 1.5) {
  const segs = lines.filter((l) => l && l.length >= 2).map((l) => l.slice())
  if (!segs.length) return null
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  const used = new Array(segs.length).fill(false)
  used[0] = true
  const chain = segs[0].slice()
  const tol2 = tol * tol
  for (let step = 1; step < segs.length; step++) {
    const tail = chain[chain.length - 1]
    let bestI = -1, bestRev = false, bestD = Infinity
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue
      const s = segs[i], head = s[0], end = s[s.length - 1]
      const dh = d2(tail, head), de = d2(tail, end)
      if (dh < bestD) { bestD = dh; bestI = i; bestRev = false }
      if (de < bestD) { bestD = de; bestI = i; bestRev = true }
    }
    if (bestI < 0 || bestD > tol2) return null
    used[bestI] = true
    const s = bestRev ? segs[bestI].slice().reverse() : segs[bestI]
    for (let k = 1; k < s.length; k++) chain.push(s[k])
  }
  const out = []
  for (const p of chain) { const q = out[out.length - 1]; if (!q || d2(q, p) > 1e-8) out.push(p) }
  return out.length >= 2 ? out : null
}
const eq = (a, b) => a && b && a.length === b.length && a.every((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1], p[2] - b[i][2]) < 1e-6)

// ═══ 1：三条边顺序相连（L 形路径）→ 直接串 [0,0,0]→[10,0,0]→[10,10,0]→[10,10,10] ═══
{
  const a = [[0, 0, 0], [10, 0, 0]], b = [[10, 0, 0], [10, 10, 0]], c = [[10, 10, 0], [10, 10, 10]]
  const r = chainEdgePolylines([a, b, c])
  report('S5(1) 顺序相连三边 → 4 点连续脊线', eq(r, [[0, 0, 0], [10, 0, 0], [10, 10, 0], [10, 10, 10]]), r)
}
// ═══ 2：乱序 + 有条反向（b 反转、拾取次序打乱）→ 仍串出同一条 ═══
{
  const a = [[0, 0, 0], [10, 0, 0]]
  const bRev = [[10, 10, 0], [10, 0, 0]]   // 反向（端点 = a 尾）
  const c = [[10, 10, 0], [10, 10, 10]]
  const r = chainEdgePolylines([a, bRev, c])
  report('S5(2) 乱序+反向 → 接力自动反转，得连续脊线', eq(r, [[0, 0, 0], [10, 0, 0], [10, 10, 0], [10, 10, 10]]), r)
}
// ═══ 3：断裂（第三条边离链尾好远）→ 只串到断裂位（前两条 = 3 点） ═══
{
  const a = [[0, 0, 0], [10, 0, 0]], b = [[10, 0, 0], [10, 10, 0]]
  const far = [[100, 100, 100], [120, 100, 100]]
  const r = chainEdgePolylines([a, b, far])
  report('S5(3) 断裂：远边接唔到 → 拒绝整个已选路径', r === null, r)
}
// ═══ 4：单条边 → 原样返（2 点） ═══
{
  const r = chainEdgePolylines([[[0, 0, 0], [5, 5, 5]]])
  report('S5(4) 单边 → 原样 2 点', eq(r, [[0, 0, 0], [5, 5, 5]]), r)
}
// ═══ 5：容差内接合（间隙 1.0mm < tol 1.5）→ 接埋；间隙 3mm > tol → 断 ═══
{
  const a = [[0, 0, 0], [10, 0, 0]], gap1 = [[11, 0, 0], [11, 10, 0]]   // 间隙 1mm
  const r1 = chainEdgePolylines([a, gap1])
  report('S5(5a) 间隙 1mm < 容差 → 接合（3 点）', r1 && r1.length === 3, r1)
  const gap3 = [[13, 0, 0], [13, 10, 0]]   // 间隙 3mm
  const r2 = chainEdgePolylines([a, gap3])
  report('S5(5b) 间隙 3mm > 容差 → 拒绝断链', r2 === null, r2)
}
// ═══ 6：空输入 → null ═══
report('S5(6) 空/退化输入 → null', chainEdgePolylines([]) === null && chainEdgePolylines([[[0, 0, 0]]]) === null, {})

console.log(`\n${fail === 0 ? 'ALL PASS' : 'HAS FAIL'} — pass=${pass} fail=${fail}`)
process.exit(fail === 0 ? 0 : 1)
