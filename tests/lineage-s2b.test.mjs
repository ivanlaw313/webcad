// lineage-s2b.test.mjs — GM-γ2b S2 血统扩展【验收】测。三块：
//   (a) FILLET 血统：box → 追踪一张侧面 + 被圆嗰条棱 → filletWithHistory：侧面 Modified→trimmed 新面（IsSame 命中结果体、
//       代表点合理）；被圆嘅棱 IsDeleted=true → 诚实 miss。
//   (b) CHAMFER 血统：同 (a)，kind='chamfer'（倒角棱 IsDeleted、相邻面 Modified）。
//   (c) 多跳链：box → cut 槽 → fuse 凸台 → 追踪一条两次都存活嘅角棱 → 逐跳（boolWithHistory ×2，镜 worker _s2CarryMids
//       多跳编排）threading 后继身份 → 2 跳后 carry 到正确最终边（断言代表点）。
//   (d) 链上限：collectLineageChain 5 连续 recorded op → capped=true（worker 据此出诚实上限提示 + 退回 null）。
// 跑法（喺 C:\ClaudeCode\webcad）: npx -y tsx tests/lineage-s2b.test.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox, cast } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)
const { filletWithHistory, collectLineageChain, boolWithHistory } = await import('../src/cad/lineage.ts')

let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }
const P = (q) => [+q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2)]
const close = (a, b, tol = 0.5) => a && b && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < tol
const finite3 = (p) => Array.isArray(p) && p.length === 3 && p.every((v) => Number.isFinite(v))
// naive 近点选边（镜 worker roundNearPoints 口径）→ 返命中索引 + 中点。
const nearestEdge = (shape, p) => {
  let bi = -1, bd = Infinity
  shape.edges.forEach((e, i) => { let dm = Infinity; for (const t of [0, 0.25, 0.5, 0.75, 1]) { const q = e.pointAt(t); const d = (q.x - p[0]) ** 2 + (q.y - p[1]) ** 2 + (q.z - p[2]) ** 2; if (d < dm) dm = d } if (dm < bd) { bd = dm; bi = i } })
  return { idx: bi, mid: bi >= 0 ? P(shape.edges[bi].pointAt(0.5)) : null }
}
// out 面喺【结果体】faces 度 IsSame 配对 → 命中索引 + 该面中心。
const isSameResultFace = (out, resShape) => {
  const rc = cast(resShape)
  for (let i = 0; i < rc.faces.length; i++) for (const o of out) { try { if (o.IsSame(rc.faces[i].wrapped)) { const c = rc.faces[i].center; return { idx: i, cen: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)], nFaces: rc.faces.length } } } catch { /* skip */ } }
  return { idx: -1, cen: null, nFaces: rc.faces.length }
}

// ═══════════════════════ (a) FILLET 血统 ═══════════════════════
// box 40×30×20：x∈[−20,20] y∈[−15,15] z∈[0,20]。edge0 = 角竖棱 (−20,15)，中点 [−20,15,10]。
// 追踪【左侧面 x=−20】（含 edge0）+ edge0 本身。圆 edge0（r=4）：左面 Modified→trimmed 新面（仍系 x=−20 平面）；edge0 被圆 → IsDeleted。
{
  const box = makeBaseBox(40, 30, 20)
  const edge0 = box.edges[0]
  const edge0Mid = P(edge0.pointAt(0.5))
  const leftFace = box.faces.find((f) => Math.abs(f.center.x + 20) < 1e-6) ?? box.faces[0]
  report('(a) setup: edge0 角竖棱中点 [−20,15,10]、左面中心 x=−20', close(edge0Mid, [-20, 15, 10]) && Math.abs(leftFace.center.x + 20) < 1e-6, { edge0Mid, leftCen: P({ x: leftFace.center.x, y: leftFace.center.y, z: leftFace.center.z }) })

  const res = filletWithHistory(OC, 'fillet', box.wrapped, [{ edge: edge0.wrapped, radius: 4 }], [leftFace.wrapped, edge0.wrapped])
  report('(a) filletWithHistory 成功（done + map 长度 2）', !!res && res.done && res.map.length === 2, { done: res?.done, nMap: res?.map?.length })
  const fFace = res.map[0], fEdge = res.map[1]
  // 面：Modified→trimmed 新面，未删、有后继、IsSame 命中结果体
  const faceMatch = isSameResultFace(fFace.out, res.shape)
  report('(a) 侧面：IsDeleted=false + out 非空 + IsSame 命中结果体（面身份守住）', fFace.deleted === false && fFace.out.length > 0 && faceMatch.idx >= 0, { deleted: fFace.deleted, nOut: fFace.out.length, matchIdx: faceMatch.idx, matchCen: faceMatch.cen })
  // 代表点合理：trimmed 面仍系 x≈−20 平面，质心 x≈−20、有限
  report('(a) 侧面：追踪代表点合理（仍 x≈−20 平面、有限）', finite3(fFace.outPts[0]) && Math.abs(fFace.outPts[0][0] + 20) < 0.5, { outPt: fFace.outPts[0]?.map((v) => +v.toFixed(2)) })
  // 棱：被圆 → IsDeleted=true（棱本身消失；Generated 出嘅系圆角【面】而非边后继）。worker 嘅 miss 触发 = (deleted || 无 outPts)
  //   → deleted=true 即已诚实 miss（退回近点，唔会当圆角面做边身份）。
  const edgeMiss = fEdge.deleted || fEdge.out.length === 0
  report('(a) 被圆棱：IsDeleted=true → worker 诚实 miss（deleted || 无 outPts）', fEdge.deleted === true && edgeMiss === true, { deleted: fEdge.deleted, nOut: fEdge.out.length, note: 'Generated=圆角面（非边后继）' })
}

// ═══════════════════════ (b) CHAMFER 血统 ═══════════════════════
{
  const box = makeBaseBox(40, 30, 20)
  const edge0 = box.edges[0]
  const leftFace = box.faces.find((f) => Math.abs(f.center.x + 20) < 1e-6) ?? box.faces[0]
  const res = filletWithHistory(OC, 'chamfer', box.wrapped, [{ edge: edge0.wrapped, radius: 4 }], [leftFace.wrapped, edge0.wrapped])
  report('(b) chamfer filletWithHistory 成功（done + map 长度 2）', !!res && res.done && res.map.length === 2, { done: res?.done, nMap: res?.map?.length })
  const cFace = res.map[0], cEdge = res.map[1]
  const faceMatch = isSameResultFace(cFace.out, res.shape)
  report('(b) 侧面：IsDeleted=false + IsSame 命中结果体（倒角相邻面 Modified）', cFace.deleted === false && cFace.out.length > 0 && faceMatch.idx >= 0, { deleted: cFace.deleted, nOut: cFace.out.length, matchIdx: faceMatch.idx, matchCen: faceMatch.cen })
  const cEdgeMiss = cEdge.deleted || cEdge.out.length === 0
  report('(b) 被倒角棱：IsDeleted=true → worker 诚实 miss（deleted || 无 outPts）', cEdge.deleted === true && cEdgeMiss === true, { deleted: cEdge.deleted, nOut: cEdge.out.length, note: 'Generated=倒角面（非边后继）' })
}

// ═══════════════════════ (c) 多跳链 cut→fuse ═══════════════════════
// box → cut 一个远离角棱嘅槽（+x 侧）→ fuse 一个远离角棱嘅顶凸台。追踪角竖棱 (−20,15)（两次都不受触碰、原样穿过）。
// 逐跳 boolWithHistory + 后继代表点几何配对 post → threading 典范索引到下一跳（镜 worker _s2CarryMids 多跳编排）。
{
  const box = makeBaseBox(40, 30, 20)
  const trackMid = [-20, 15, 10]                        // 角竖棱，两次布尔都存活
  const eIdx = nearestEdge(box, trackMid).idx
  const sub0 = box.edges[eIdx].wrapped
  // ── hop1: cut 槽（x∈[8,20] 缺口，远离 x=−20 角）──
  const slot = makeBaseBox(12, 12, 30).translate([14, 0, 5])
  const post1 = box.clone().cut(slot.clone())           // replicad simplified post 帧（几何配对用）
  const r1 = boolWithHistory(OC, 'cut', box.wrapped, slot.clone().wrapped, [sub0])
  const e1 = r1.map[0]
  const ok1 = !e1.deleted && e1.outPts.length > 0
  const rep1 = e1.outPts[0]
  const nm1 = nearestEdge(post1, rep1)
  const idx1 = nm1.idx
  const d1 = idx1 >= 0 ? Math.hypot(...['x', 'y', 'z'].map((a, i) => post1.edges[idx1].pointAt(0.5)[a] - rep1[i])) : Infinity
  // ── hop2: fuse 顶凸台（z∈[20,30] 顶心，远离角棱）──
  const boss = makeBaseBox(12, 12, 10).translate([0, 0, 20])
  const sub1 = idx1 >= 0 ? post1.edges[idx1].wrapped : null   // 上一跳典范索引边 = 本跳 tracked（中间无变换 → 同索引）
  const post2 = post1.clone().fuse(boss.clone())
  const r2 = sub1 ? boolWithHistory(OC, 'fuse', post1.wrapped, boss.clone().wrapped, [sub1]) : null
  const e2 = r2?.map?.[0]
  const ok2 = !!e2 && !e2.deleted && e2.outPts.length > 0
  const rep2 = e2?.outPts?.[0]
  const idx2 = ok2 ? nearestEdge(post2, rep2).idx : -1
  const carried = idx2 >= 0 ? P(post2.edges[idx2].pointAt(0.5)) : null
  report('(c) 多跳：2 跳链（cut→fuse）threading 追踪边到正确最终边 [−20,15,10]', ok1 && ok2 && d1 < 0.01 && close(carried, trackMid), { eIdx, idx1, idx2, rep1, rep2, carried, expect: trackMid })
  // sanity：edge 集数目跨跳变化（cut/fuse 增边、枚举重排）→ 证 naive「同索引硬 carry」会失效，而代表点 threading 稳
  report('(c) sanity：边集数目跨跳有变（naive 同索引会漂 → 需身份 threading）', box.edges.length !== post1.edges.length || post1.edges.length !== post2.edges.length, { nBox: box.edges.length, nPost1: post1.edges.length, nPost2: post2.edges.length })
}

// ═══════════════════════ (d) 链上限 collectLineageChain ═══════════════════════
{
  const pred = (arr) => (i) => !!arr[i]
  // 5 连续 recorded op（索引 1..5；0 = base 非 recorded）→ 走 walk-back b=5 → capped（超 maxLen=4）
  const rec5 = [false, true, true, true, true, true]
  const noTr6 = [false, false, false, false, false, false]
  const chain5 = collectLineageChain(5, pred(rec5), pred(noTr6), 4)
  report('(d) budget：5 连续 recorded op → capped=true、ops 长度封顶 4（worker 据此退回 null + 上限提示）', !!chain5 && chain5.capped === true && chain5.ops.length === 4, chain5)
  // 4 连续 → 唔 capped，ops=[4,3,2,1]
  const rec4 = [false, true, true, true, true]
  const chain4 = collectLineageChain(4, pred(rec4), pred([false, false, false, false, false]), 4)
  report('(d) 4 连续 recorded op → capped=false、ops=[4,3,2,1]（刚好唔超）', !!chain4 && chain4.capped === false && JSON.stringify(chain4.ops) === '[4,3,2,1]', chain4)
  // 变换相隔：recorded@1 — transform@2 — recorded@3 → 链 [3,1]（跳过变换收集）
  const recT = [false, true, false, true]
  const trT = [false, false, true, false]
  const chainT = collectLineageChain(3, pred(recT), pred(trT), 4)
  report('(d) 变换相隔：recorded@1—transform@2—recorded@3 → 链 [3,1]、capped=false', !!chainT && chainT.capped === false && JSON.stringify(chainT.ops) === '[3,1]', chainT)
  // b 本身非 recorded → null（唔 claim）
  report('(d) b 非 recorded op → null（唔 claim）', collectLineageChain(2, pred(recT), pred(trT), 4) === null, {})
}

console.log(`\n== lineage-s2b: ${pass} pass / ${fail} fail ==`)
process.exit(fail ? 1 : 0)
