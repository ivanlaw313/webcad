// lineage-s2.test.mjs — GM-γ2a S2 布尔血统【验收】测（repro #2：拾竖棱 → 附近开槽/切角）。
// 证 src/cad/lineage.ts boolWithHistory 喺现役自建内核（replicad_plus）上真正把原棱穿过布尔追踪，
// 补 S1 变换血统喺布尔区间 abort（gate 3）嘅位。三大断言：
//   (a) 老解析器脆弱：附近开槽后，naive 近点选边【跳去新棱】（存在比原棱更近嘅新棱）→ 拾错。
//   (b) boolWithHistory 追踪原棱穿过 cut：unchanged 穿过 / Modified 皆可 → out 子形状 IsSame 命中【结果体】
//       嗰条棱（原棱身份守住，rep 点落返原棱）。
//   (c) cut 消耗咗原棱（切角）→ IsDeleted=true → 诚实 miss（caller 退回近点，唔乱指）。
// 兼验 fuse 面追踪。跑法（喺 C:\ClaudeCode\webcad）: npx -y tsx tests/lineage-s2.test.mjs
// 全过 → 打印 PASS 总数 exit 0；任一 fail → 打印 FAIL exit 1。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox, cast } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)
const { boolWithHistory } = await import('../src/cad/lineage.ts')

let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }
const P = (q) => [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]
// naive 近点选边（镜 worker roundNearPoints 口径：5-t 采样 min-over-t）→ 拾中最近棱嘅索引 + 中点。
const nearestEdge = (shape, p) => {
  let bi = -1, bd = Infinity
  shape.edges.forEach((e, i) => { let dm = Infinity; for (const t of [0, 0.25, 0.5, 0.75, 1]) { const q = e.pointAt(t); const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2; if (d < dm) dm = d } if (dm < bd) { bd = dm; bi = i } })
  return { idx: bi, dist: +Math.sqrt(bd).toFixed(2), mid: P(shape.edges[bi].pointAt(0.5)) }
}
// out 子形状喺【结果体】edges 度 IsSame 配对 → 返命中索引（-1 = 无）。
const isSameResultEdge = (out, resShape) => {
  const rc = cast(resShape)
  for (let i = 0; i < rc.edges.length; i++) for (const o of out) { try { if (o.IsSame(rc.edges[i].wrapped)) return { idx: i, mid: P(rc.edges[i].pointAt(0.5)), nEdges: rc.edges.length } } catch { /* skip */ } }
  return { idx: -1, mid: null, nEdges: rc.edges.length }
}
const close = (a, b, tol = 0.5) => a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < tol

// ── 场景：box 40×30×20；拾一条竖棱 edge0（角 (−20,15)，中点 [−20,15,10]）──
const box = makeBaseBox(40, 30, 20)
const edge0 = box.edges[0]
const edge0Mid = P(edge0.pointAt(0.5))
report('setup: edge0 系竖棱、中点 [−20,15,10]', close(edge0Mid, [-20, 15, 10]), { edge0Mid, nEdges: box.edges.length })

// ═══ (a) 老解析器脆弱：附近开槽 → naive 近点选边跳去新棱 ═══
// 工具：贴近角落嘅贯穿凹槽（x[−19,−1] y[−4,14] z 全高）—— 唔掂 edge0（x=−20 / y=15），但喺 (−19,14) 生一条新竖棱。
const nearTool = makeBaseBox(18, 18, 30).translate([-10, 5, 5])
// 拾取近点：用户手拣略入内（唔系像素级 pin 喺角）— [−19,14,10]。
const storedNear = [-19, 14, 10]
const preNearest = nearestEdge(box, storedNear)             // 切前：最近棱应系 edge0
const cutRes = boolWithHistory(OC, 'cut', box.wrapped, nearTool.wrapped, [edge0.wrapped])
const postNearest = nearestEdge(cast(cutRes.shape), storedNear)  // 切后：最近棱【跳】去新槽棱
report('(a) 切前 naive 近点 → edge0（中点 [−20,15,10]）', close(preNearest.mid, [-20, 15, 10]), { storedNear, preNearest })
report('(a) 切后 naive 近点【跳位】到新棱（≠ edge0）→ 老逻辑拾错', !close(postNearest.mid, [-20, 15, 10]) && postNearest.idx !== preNearest.idx, { postNearest, note: '存在比原棱更近嘅新棱 → naive 近点选边失效' })

// ═══ (b) boolWithHistory 追踪原棱穿过 cut（unchanged 穿过）═══
const e = cutRes.map[0]
const bMatch = isSameResultEdge(e.out, cutRes.shape)
report('(b) unchanged：IsDeleted=false 且 out 非空（原棱守住）', e.deleted === false && e.out.length > 0, { deleted: e.deleted, nOut: e.out.length, truncated: e.truncated })
report('(b) unchanged：out IsSame 命中【结果体】某棱（跨布尔身份守住）', bMatch.idx >= 0, bMatch)
report('(b) unchanged：追踪代表点落返原棱 [−20,15,10]（≠ naive 跳去嘅位）', close(e.outPts[0], [-20, 15, 10]) && !close(e.outPts[0], postNearest.mid), { outPt: e.outPts[0], naiveJumpedTo: postNearest.mid })

// ═══ (b2) Modified：切角凹槽削短 edge0 顶端 → Modified 后继仍 IsSame 命中结果体（唔系 unchanged 都追到）═══
const clipTool = makeBaseBox(10, 10, 14).translate([-18, 17, 17])
const clipRes = boolWithHistory(OC, 'cut', box.wrapped, clipTool.wrapped, [edge0.wrapped])
const c2 = clipRes.map[0]
const b2Match = isSameResultEdge(c2.out, clipRes.shape)
report('(b2) Modified：IsDeleted=false + out 非空 + IsSame 命中结果体', c2.deleted === false && c2.out.length > 0 && b2Match.idx >= 0, { deleted: c2.deleted, nOut: c2.out.length, outPts: c2.outPts, isSameResIdx: b2Match.idx })

// ═══ (c) cut 消耗原棱（斜切角）→ IsDeleted=true → 诚实 miss ═══
const consumeTool = makeBaseBox(14, 14, 40).rotate(45, [0, 0, 0], [0, 0, 1]).translate([-20, 15, 0])
const consRes = boolWithHistory(OC, 'cut', box.wrapped, consumeTool.wrapped, [edge0.wrapped])
const c3 = consRes.map[0]
report('(c) consume：IsDeleted=true 且无后继 out（诚实 miss → caller 退回近点）', c3.deleted === true && c3.out.length === 0, { deleted: c3.deleted, nOut: c3.out.length })

// ═══ 兼验 fuse：追踪一张面穿过并集 ═══
const fTool = makeBaseBox(20, 20, 20).translate([30, 5, 0])   // 右侧搭接 → 部分面被改
const faceTop = box.faces.find((f) => Math.abs(f.center.z - 20) < 1e-6) ?? box.faces[0]
const fRes = boolWithHistory(OC, 'fuse', box.wrapped, fTool.wrapped, [faceTop.wrapped])
const f0 = fRes.map[0]
report('fuse：面追踪 done + 有后继 + 代表点非空', fRes.done && !f0.deleted && f0.out.length > 0 && f0.outPts.length > 0, { done: fRes.done, deleted: f0.deleted, nOut: f0.out.length, outPt: f0.outPts[0] })

// ═══ (d) 端到端 resolver-flow 模拟：完整重演 worker _s2CarryMids 编排（gate-3 布尔补位）═══
// 帧链：prior=box（布尔前）→ post=prior.cut(nearTool)（布尔后，用 replicad cut = 有 SimplifyResult，同真 build 一致）
//       → current=post.translate（下游变换，S1 保序区间）。拾取 edge0，证 S2 跨【布尔+变换】追返正确边。
// ⚠ 关键交叉验证：boolWithHistory 用 raw builder（无 SimplifyResult），post 用 replicad（有 SimplifyResult）→
//   代表点几何配对 post 仍中，证 cross-simplify 稳健（worker 真实情形：re-exec 未 simplify vs _shapeHistory 已 simplify）。
// ⚠ replicad Shape.translate 会 delete 源体（this.delete()）→ 用 clone 平移，post/box 唔受损。
//   worker 无此忧（_shapeHistory 存嘅系 clone，变换作用喺 live shape）。
{
  const prior = box.clone()                              // 布尔前帧（clone，免 .cut 消耗到测试后面用嘅 box）
  const post = box.clone().cut(nearTool.clone())         // 布尔后帧（replicad，simplified）— 同真 build merge() 一致
  const storedNear2 = [-20, 15, 10]                      // edge0 拾取近点
  // ① resolve edge0 喺 prior（布尔前，near 食正）→ 典范索引
  const pIdx = nearestEdge(prior, storedNear2).idx
  const sub = prior.edges[pIdx].wrapped
  // ② boolWithHistory 追踪 sub 穿过 cut
  const r2 = boolWithHistory(OC, 'cut', prior.wrapped, nearTool.clone().wrapped, [sub])
  const ent = r2.map[0]
  const okStep2 = !ent.deleted && ent.outPts.length > 0
  // ③ 后继代表点几何配对 post（post=replicad simplified；rep 来自 raw builder，未 simplify）→ 典范索引 idxK
  const rep = ent.outPts[0]
  const idxK = nearestEdge(post, rep).idx
  const matchD = idxK >= 0 ? Math.hypot(...['x', 'y', 'z'].map((a, i) => post.edges[idxK].pointAt(0.5)[a] - rep[i])) : Infinity
  // ④ (k,current) 全变换 → 读 current 同索引边 = carry 结果；current = post 平移 → edge0 应 [−15,15,10]
  const current = post.clone().translate([5, 0, 0])      // 下游纯变换（保拓扑枚举顺序；clone 免删 post）
  const carried = idxK >= 0 && idxK < current.edges.length ? P(current.edges[idxK].pointAt(0.5)) : null
  report('(d) 端到端：S2 编排跨【布尔→变换】carry 到正确边 [−15,15,10]', okStep2 && matchD < 0.01 && close(carried, [-15, 15, 10]), { pIdx, rep, idxK, crossSimplifyMatchDist: +matchD.toFixed(4), carried, expect: [-15, 15, 10] })
}

// ═══ null-safety：缺操作数 / 坏 kind → 返 null（caller 诚实退回今日 fallback）═══
report('null-safety：缺 tool → null', boolWithHistory(OC, 'cut', box.wrapped, null, [edge0.wrapped]) === null, {})

console.log(`\n== lineage-s2: ${pass} pass / ${fail} fail ==`)
process.exit(fail ? 1 : 0)
