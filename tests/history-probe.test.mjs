// history-probe.test.mjs — γ批 B1 Node 实证：真内核（replicad_plus 自建 kernel）上
// OCCT 逐 op 历史 API（Modified/Generated/IsDeleted）究竟可唔可用。跑法: npx -y tsx tests/history-probe.test.mjs
// 三探针：① BRepFilletAPI_MakeFillet（镜 in-tree historyProbe）② BRepAlgoAPI_Cut ③ BRepAlgoAPI_Fuse
// —— 布尔先係 S2 lineage 命脉（S1 变换承载喺 boolean 区间 abort，正正要 Modified/Generated 补位）。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

const listSize = (lst) => {
  if (!lst) return -1
  try { if (typeof lst.Size === 'function') return lst.Size() } catch {}
  try { if (typeof lst.Extent === 'function') return lst.Extent() } catch {}
  return -1
}
const probeBuilder = (mk, label, inFace, inEdge) => {
  const out = { label, hasModified: false, modFace: -1, hasGenerated: false, genEdge: -1, hasIsDeleted: false, isDel: null, firstReadable: false }
  if (typeof mk.Modified === 'function') {
    out.hasModified = true
    try { const l = mk.Modified(inFace); out.modFace = listSize(l); if (out.modFace > 0 && typeof l.First === 'function') { const f = l.First(); out.firstReadable = !!f && (typeof f.IsNull !== 'function' || !f.IsNull()) } } catch (e) { out.modFace = 'threw:' + (e?.message || e) }
  }
  if (typeof mk.Generated === 'function') {
    out.hasGenerated = true
    try { out.genEdge = listSize(mk.Generated(inEdge)) } catch (e) { out.genEdge = 'threw:' + (e?.message || e) }
  }
  if (typeof mk.IsDeleted === 'function') {
    out.hasIsDeleted = true
    try { out.isDel = !!mk.IsDeleted(inEdge) } catch (e) { out.isDel = 'threw:' + (e?.message || e) }
  }
  return out
}
const tryNew = (names, args) => {
  for (const nm of names) {
    const C = OC[nm]
    if (!C) continue
    for (const a of args) { try { return { mk: new C(...a), how: `${nm}(${a.length} args)` } } catch {} }
  }
  return null
}

let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? '✅' : '❌'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }

// ── ① FILLET 探针 ──
{
  const box = makeBaseBox(40, 30, 20)
  const edge0 = box.edges[0].wrapped, face0 = box.faces[0].wrapped
  const filShape = (OC.ChFi3d_FilletShape && (OC.ChFi3d_FilletShape.ChFi3d_Rational ?? 0)) ?? 0
  const got = tryNew(['BRepFilletAPI_MakeFillet_2', 'BRepFilletAPI_MakeFillet_1', 'BRepFilletAPI_MakeFillet'], [[box.wrapped, filShape], [box.wrapped]])
  if (!got) { report('fillet.construct', false, 'no ctor') } else {
    const mk = got.mk
    let added = false
    for (const nm of ['Add_2', 'Add_1', 'Add']) { if (typeof mk[nm] === 'function') { try { mk[nm](4, edge0); added = true; break } catch {} } }
    let built = false
    try { const prog = OC.Message_ProgressRange_1 ? new OC.Message_ProgressRange_1() : undefined; try { mk.Build(prog); built = true } catch { mk.Build(); built = true } } catch {}
    const done = built && typeof mk.IsDone === 'function' ? !!mk.IsDone() : built
    const p = probeBuilder(mk, 'fillet', face0, edge0)
    report('fillet.history', done && p.hasModified && p.hasGenerated && typeof p.modFace === 'number' && p.modFace >= 0, { how: got.how, added, done, ...p })
  }
}

// ── ② 布尔 CUT 探针（S2 命脉）──
{
  const a = makeBaseBox(40, 30, 20)
  const b = makeBaseBox(16, 16, 40).translate([12, 7, -10])   // 直插穿 a 顶底 → 顶/底面被开洞 = Modified；侧棱可能被切 = Generated/IsDeleted
  const aFaceTop = a.faces.find((f) => Math.abs(f.center.z - 20) < 1e-6) ?? a.faces[0]
  const aEdge0 = a.edges[0]
  const got = tryNew(['BRepAlgoAPI_Cut_3', 'BRepAlgoAPI_Cut_2', 'BRepAlgoAPI_Cut_1', 'BRepAlgoAPI_Cut'],
    [[a.wrapped, b.wrapped, new (OC.Message_ProgressRange_1 || Object)()], [a.wrapped, b.wrapped]])
  if (!got) { report('cut.construct', false, 'no ctor') } else {
    const mk = got.mk
    let built = true
    try { if (typeof mk.Build === 'function') { try { mk.Build(new (OC.Message_ProgressRange_1 || Object)()) } catch { mk.Build() } } } catch { built = false }
    const done = typeof mk.IsDone === 'function' ? !!mk.IsDone() : built
    const p = probeBuilder(mk, 'cut', aFaceTop.wrapped, aEdge0.wrapped)
    report('cut.history', done && p.hasModified && typeof p.modFace === 'number' && p.modFace > 0, { how: got.how, done, ...p })
  }
}

// ── ③ 布尔 FUSE 探针 ──
{
  const a = makeBaseBox(40, 30, 20)
  const b = makeBaseBox(20, 20, 20).translate([30, 5, 0])   // 侧面搭接 → a 右面被改 = Modified
  const aFaceRight = a.faces.find((f) => Math.abs(f.center.x - 40) < 1e-6) ?? a.faces[0]
  const aEdge0 = a.edges[0]
  const got = tryNew(['BRepAlgoAPI_Fuse_3', 'BRepAlgoAPI_Fuse_2', 'BRepAlgoAPI_Fuse_1', 'BRepAlgoAPI_Fuse'],
    [[a.wrapped, b.wrapped, new (OC.Message_ProgressRange_1 || Object)()], [a.wrapped, b.wrapped]])
  if (!got) { report('fuse.construct', false, 'no ctor') } else {
    const mk = got.mk
    try { if (typeof mk.Build === 'function') { try { mk.Build(new (OC.Message_ProgressRange_1 || Object)()) } catch { mk.Build() } } } catch {}
    const done = typeof mk.IsDone === 'function' ? !!mk.IsDone() : true
    const p = probeBuilder(mk, 'fuse', aFaceRight.wrapped, aEdge0.wrapped)
    report('fuse.history', done && p.hasModified && typeof p.modFace === 'number' && p.modFace >= 0, { how: got.how, done, ...p })
  }
}

console.log(`\n== history-probe: ${pass} pass / ${fail} fail ==`)
process.exit(fail ? 1 : 0)
