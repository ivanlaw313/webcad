// moveface-probe.test.mjs — GM-B2 Node 实证：喺自建 plus 内核（replicad_plus）上，
// 究竟有边啲 API 可以实作 Fusion 360「Move Face / Offset Face」直接编辑
// （平移/偏移一张或多张面，邻面由内核重新求解 —— 唔係 prism fuse/cut，pushpull 已有）。
// 跑法: node tests/moveface-probe.test.mjs   （喺 C:\ClaudeCode\webcad）
//
// 结论摘要（详见每探针 detail）：
//   • 低阶 BRepOffset_MakeOffset.SetOffsetOnFace —— 未绑定，per-face-offset 无低阶路径。
//   • 真·可用逐面路径 = DirectEditWrapper.ReplaceFaceNear（BRepAlgoAPI_Splitter 平面顶替）。
//     语义：喂【绝对目标平面】(origin+normal)，只做【朝内/切到平面】—— 平面必须仍落喺实体内。
//     向外(长大)一律返 NULL（Splitter 无嘢可切）。向外长大要靠既有 prism-fuse pushpull。
//   • 整体均匀偏移(所有面) = BRepOffsetAPI_MakeOffsetShape.PerformByJoin（另一条命令，非逐面）。
//   • 圆柱孔 resize / 非平面面刚体平移 —— 无绑定内核路径。
//   • 相邻原语：ThickenFaceNear(独立带符号薄板,需归正定向)、OffsetSurfaceNear(开放平行片)。
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox, makeCylinder } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

// ─── 共用工具 ───
function excMsg(e) {
  if (typeof e !== 'number') return e?.message || String(e)
  try { return OC.getExceptionMessage ? OC.getExceptionMessage(e) : 'C++exc#' + e } catch { return 'C++exc#' + e }
}
function vol(shape) { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape, g, false, false, false); return g.Mass() } catch { return NaN } }
function nfaces(shape) { try { let n = 0; const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; ex.More(); ex.Next()) n++; return n } catch { return -1 } }
function bbox(shape) {
  try { const b = new OC.Bnd_Box_1(); OC.BRepBndLib.Add(shape, b, false); const c = b.CornerMin(), d = b.CornerMax(); return [[c.X(), c.Y(), c.Z()], [d.X(), d.Y(), d.Z()]] } catch { return null }
}
function tris(shape) {
  try {
    new OC.BRepMesh_IncrementalMesh_2(shape, 0.2, false, 0.5, false)
    let t = 0; const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
    for (; ex.More(); ex.Next()) { const loc = new OC.TopLoc_Location_1(); const h = OC.BRep_Tool.Triangulation(OC.TopoDS.Face_1(ex.Current()), loc, 0); if (!h.IsNull()) t += h.get().NbTriangles() }
    return t
  } catch (e) { return 'meshTHREW:' + excMsg(e) }
}
const notNull = (s) => !!s && !(s.IsNull && s.IsNull())
// 有效实体 = 正有限体积 + 网格出到三角形
function validSolid(shape) {
  if (!notNull(shape)) return { ok: false, why: shape ? 'IsNull' : 'null-ret' }
  const v = vol(shape), tr = tris(shape), nf = nfaces(shape)
  const ok = Number.isFinite(v) && v > 1 && typeof tr === 'number' && tr > 0
  return { ok, vol: Number.isFinite(v) ? +v.toFixed(1) : v, faces: nf, tris: tr }
}
const tryNew = (names, args) => {
  for (const nm of names) { const C = OC[nm]; if (!C) continue; for (const a of args) { try { return { obj: new C(...a), how: `${nm}(${a.length} args)` } } catch { /* next */ } } }
  return null
}

let pass = 0, fail = 0
const report = (name, ok, detail) => { console.log(`${ok ? '✅ PASS' : '❌ FAIL'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }
const W = OC.DirectEditWrapper
const PR = () => { try { return OC.Message_ProgressRange_1 ? new OC.Message_ProgressRange_1() : undefined } catch { return undefined } }

console.log('== 内核绑定盘点 ==')
console.log('  DirectEditWrapper:', !!W, W ? '静态方法=' + Object.getOwnPropertyNames(W).filter(k => /Near/i.test(k)).join(',') : '')
console.log('  BRepOffset_MakeOffset (低阶,含 SetOffsetOnFace):', !!OC.BRepOffset_MakeOffset)
console.log('  BRepOffsetAPI_MakeOffsetShape:', !!OC.BRepOffsetAPI_MakeOffsetShape, ' MakeThickSolid:', !!OC.BRepOffsetAPI_MakeThickSolid)
console.log('  LocOpe_* :', Object.keys(OC).filter(k => /^LocOpe_/.test(k)).join(',') || 'NONE-BOUND')
console.log('  BRepTools_Modifier / TrsfModification:', Object.keys(OC).filter(k => /^BRepTools_(Modif|Trsf)/.test(k)).join(',') || 'NONE-BOUND')
console.log('  BRepFeat_* :', Object.keys(OC).filter(k => /^BRepFeat/.test(k)).join(',') || 'NONE')
console.log('')

// 基准盒 40×30×20（makeBaseBox 居中于 XY，Z 由 0 起）
const box = makeBaseBox(40, 30, 20)
const bb0 = bbox(box.wrapped)
const [xmin, ymin, zmin] = bb0[0], [xmax, ymax, zmax] = bb0[1]
const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2
console.log('基准盒 bounds=', JSON.stringify(bb0.map(p => p.map(n => +n.toFixed(3)))), 'vol=', vol(box.wrapped).toFixed(0), '(期望 24000)')
console.log('  顶面中心 pick=', JSON.stringify([cx, cy, +zmax.toFixed(3)]), ' 底面=', JSON.stringify([cx, cy, +zmin.toFixed(3)]), '\n')

// ═══ P1 逐面沿法向偏移（真正嘅 Move / Offset Face along normal）═══
console.log('── P1 逐面沿法向偏移 ──')
{
  // P1a 期望路径 BRepOffset_MakeOffset.SetOffsetOnFace —— 未绑定 (不可用)
  report('P1a BRepOffset_MakeOffset.SetOffsetOnFace 可用', false,
    { bound: !!OC.BRepOffset_MakeOffset, note: '低阶类未绑定 → SetOffsetOnFace 无从调用；per-face offset 无低阶内核路径' })

  // P1b MakeOffsetShape.MakeOffset() 底层 tool 有冇 SetOffsetOnFace
  {
    let how = '', hasSet = false
    try {
      const g = tryNew(['BRepOffsetAPI_MakeOffsetShape'], [[]])
      if (g && typeof g.obj.MakeOffset === 'function') { const tool = g.obj.MakeOffset(); how = 'MakeOffset()->' + typeof tool; hasSet = !!(tool && typeof tool.SetOffsetOnFace === 'function') }
      else how = 'MakeOffset() 方法不存在'
    } catch (e) { how = 'threw:' + excMsg(e) }
    report('P1b MakeOffsetShape.MakeOffset() 暴露 SetOffsetOnFace', hasSet, { how })
  }

  // P1c ReplaceFaceNear 顶面【朝内】−5 → z=15, vol=40*30*15=18000（真·可用逐面路径）
  {
    let d = { note: 'W 未绑定' }, ok = false
    if (W && W.ReplaceFaceNear) {
      try {
        const res = W.ReplaceFaceNear(box.wrapped, cx, cy, zmax, cx, cy, zmax - 5, 0, 0, 1)
        const v = validSolid(res); const bbA = notNull(res) ? bbox(res) : null; const zTop = bbA ? bbA[1][2] : NaN
        ok = v.ok && Math.abs(v.vol - 18000) < 60 && Math.abs(zTop - 15) < 0.1
        d = { how: 'ReplaceFaceNear(shape, pick=顶心, target=(cx,cy,zmax-5), n=(0,0,1))', ...v, zTop: +zTop.toFixed(2), expect: 'vol=18000 zTop=15' }
      } catch (e) { d = { threw: excMsg(e) } }
    }
    report('P1c ReplaceFaceNear 顶面朝内 −5（可用逐面路径）', ok, d)
  }

  // P1d ReplaceFaceNear 顶面【朝外】+5 → Splitter 无相交 → 返 NULL（确认限制）
  {
    let confirmedNull = false, d = {}
    if (W && W.ReplaceFaceNear) {
      try { const res = W.ReplaceFaceNear(box.wrapped, cx, cy, zmax, cx, cy, zmax + 5, 0, 0, 1); confirmedNull = !notNull(res); d = { returned: confirmedNull ? 'NULL' : 'non-null vol=' + vol(res).toFixed(1) } }
      catch (e) { d = { threw: excMsg(e) } }
    }
    report('P1d 确认：ReplaceFaceNear 朝外 +5 返 NULL（长大无 Splitter 路径 → 用 prism-fuse pushpull）', confirmedNull, d)
  }

  // P1e 相邻原语 ThickenFaceNear（独立带符号薄板）+5 → z 20..25 slab, vol 有符号需归正
  {
    let d = {}, ok = false
    if (W && W.ThickenFaceNear) {
      try { const res = W.ThickenFaceNear(box.wrapped, cx, cy, zmax, 5); const v = vol(res); const bbA = notNull(res) ? bbox(res) : null; ok = notNull(res) && Math.abs(Math.abs(v) - 6000) < 60; d = { vol: +v.toFixed(1), bbox: bbA ? bbA.map(p => p.map(n => +n.toFixed(1))) : null, note: '独立薄板(40*30*5=6000)，负体积=定向反转，src 已 _orientSolidOutward 归正；非 in-place 长大' } }
      catch (e) { d = { threw: excMsg(e) } }
    }
    report('P1e ThickenFaceNear +5 = 独立外向薄板(相邻原语)', ok, d)
  }
}

// ═══ P2 整体壳式偏移（MakeOffsetShape，均匀所有面）═══
console.log('\n── P2 整体壳式偏移 MakeOffsetShape ──')
{
  const g = tryNew(['BRepOffsetAPI_MakeOffsetShape'], [[]])
  if (!g) report('P2 MakeOffsetShape 构造', false, 'no ctor')
  else {
    const mk = g.obj, mode = OC.BRepOffset_Mode.BRepOffset_Skin, jt = OC.GeomAbs_JoinType.GeomAbs_Arc
    let how = '', done = false, res = null
    // PerformByJoin(S, Offset, Tol, Mode, Intersection, SelfInter, Join, RemoveIntEdges, Progress)
    for (const a of [[box.wrapped, 2, 1e-4, mode, false, false, jt, false, PR()], [box.wrapped, 2, 1e-4, mode, false, false, jt, false]]) {
      try { mk.PerformByJoin(...a); how = `PerformByJoin(${a.length} args)`; done = true; break } catch (e) { how = 'threw:' + excMsg(e) }
    }
    if (done) { try { res = mk.Shape() } catch { try { res = mk.Shape_1() } catch { /**/ } } }
    const v = validSolid(res), bbA = notNull(res) ? bbox(res) : null
    const okGeom = v.ok && bbA && Math.abs((bbA[1][0] - bbA[0][0]) - 44) < 0.7
    report('P2 MakeOffsetShape 整体 +2（所有面外扩,Arc join）', okGeom, { how, ...v, bbox: bbA ? bbA.map(p => p.map(n => +n.toFixed(2))) : null, expect: '≈44×34×24, 各面均匀外扩' })
  }
}

// ═══ P3 孔 resize 语义 ═══
console.log('\n── P3 孔 resize 语义 ──')
{
  const hole = makeCylinder(5, 200, [cx, cy, zmin - 50], [0, 0, 1])
  const holed = box.cut(hole)
  const vH = vol(holed.wrapped)
  const cylFace = holed.faces.find(f => { try { return /CYLIND/i.test(f.geomType || '') } catch { return false } })
  const cylPick = cylFace ? [cylFace.center.x, cylFace.center.y, cylFace.center.z] : [cx + 5, cy, (zmin + zmax) / 2]
  console.log('  带孔盒 vol=', vH.toFixed(1), '(期望≈', (24000 - Math.PI * 25 * 20).toFixed(1), ') faces=', nfaces(holed.wrapped), ' 圆柱孔面 geomType=', cylFace ? cylFace.geomType : 'not-found')

  // P3a 整体 MakeOffsetShape +2 → 外壳外扩 + 孔缩细（无法只改孔）
  {
    const g = tryNew(['BRepOffsetAPI_MakeOffsetShape'], [[]]); let res = null, how = ''
    if (g) { const mode = OC.BRepOffset_Mode.BRepOffset_Skin, jt = OC.GeomAbs_JoinType.GeomAbs_Arc; for (const a of [[holed.wrapped, 2, 1e-4, mode, false, false, jt, false, PR()], [holed.wrapped, 2, 1e-4, mode, false, false, jt, false]]) { try { g.obj.PerformByJoin(...a); how = `PerformByJoin(${a.length})`; res = g.obj.Shape(); break } catch (e) { how = 'threw:' + excMsg(e) } } }
    const vA = res ? vol(res) : NaN
    report('P3a 整体偏移 +2 于带孔盒 → 可跑(但外壳+孔同时变)', Number.isFinite(vA) && vA > 0, { how, volBefore: +vH.toFixed(1), volAfter: Number.isFinite(vA) ? +vA.toFixed(1) : vA, note: '整体偏移不能单独 resize 孔' })
  }

  // P3b 确认：无逐-孔 resize 内核路径；喂圆柱面畀 ReplaceFaceNear 会破坏性平面切半（非 resize）
  {
    let confirmedNoPath = false, d = { note: 'cylFace 未找到 / W 未绑定' }
    if (W && W.ReplaceFaceNear && cylFace) {
      try {
        const nx = cylPick[0] - cx, ny = cylPick[1] - cy, nn = Math.hypot(nx, ny) || 1
        const res = W.ReplaceFaceNear(holed.wrapped, cylPick[0], cylPick[1], cylPick[2], cylPick[0], cylPick[1], cylPick[2], nx / nn, ny / nn, 0)
        const vA = notNull(res) ? vol(res) : NaN
        // 破坏性(体积大变/切半) 或 null → 都证实【无孔-resize 语义】
        confirmedNoPath = !Number.isFinite(vA) || Math.abs(vA - vH) > 1000
        d = { volBefore: +vH.toFixed(1), volAfter: Number.isFinite(vA) ? +vA.toFixed(1) : vA, note: '喂圆柱面 → 平面顶替把实体沿轴切半(破坏性)，非孔 resize；圆柱孔 resize 无绑定内核路径' }
      } catch (e) { confirmedNoPath = true; d = { threw: excMsg(e), note: '圆柱孔 resize 无绑定内核路径' } }
    }
    report('P3b 确认：圆柱孔 resize 无绑定内核路径', confirmedNoPath, d)
  }
}

// ═══ P4 任意方向 move-face 内核路径 ═══
console.log('\n── P4 任意方向 move-face 内核路径 ──')
{
  let rotOk = false, rotDetail = { note: 'W 未绑定' }
  if (W && W.ReplaceFaceNear) {
    try {
      // 顶面绕 X 倾 15°，平面过顶面中心(proven recipe, 见 replaceface-rotate-probe.mjs)
      const t = 15 * Math.PI / 180, nrm = [0, -Math.sin(t), Math.cos(t)]
      const res = W.ReplaceFaceNear(box.wrapped, cx, cy, zmax, cx, cy, zmax, nrm[0], nrm[1], nrm[2])
      const v = validSolid(res)
      rotOk = v.ok; rotDetail = { how: 'ReplaceFaceNear 顶面 tilt15°/X 平面过顶心', ...v, note: '倾斜法向→valid solid(有路径);惟切法保留边: 平面须真穿实体内部,铰链正正落边缘会退化 NULL,piece 选择/角度需上层把关' }
    } catch (e) { rotDetail = { threw: excMsg(e) } }
  }
  report('P4 旋转/倾斜 move-face 有路径(ReplaceFaceNear 倾斜平面)', rotOk, {
    LocOpe_bound: Object.keys(OC).filter(k => /^LocOpe_/.test(k)).join(',') || 'NONE',
    BRepTools_Modifier_TrsfModification: Object.keys(OC).filter(k => /^BRepTools_(Modif|Trsf)/.test(k)).join(',') || 'NONE',
    BRepFeat_MakePrism_Gluer: Object.keys(OC).filter(k => /^BRepFeat_MakePrism|Gluer/.test(k)).join(',') || 'NONE',
    rotate: rotDetail,
    verdict: '平面面纯侧向平移=同一平面(无几何效果)；沿法向=P1c(朝内)/prism(朝外)；倾斜=旋转(本项)。非平面面刚体平移=无绑定路径。',
  })
}

// ═══ P5 多面同偏移（顺序 ReplaceFaceNear，各朝内）═══
console.log('\n── P5 多面同偏移（顺序,各朝内）──')
{
  let ok = false, d = { note: 'W 未绑定' }
  if (W && W.ReplaceFaceNear) {
    try {
      let s = W.ReplaceFaceNear(box.wrapped, cx, cy, zmax, cx, cy, zmax - 5, 0, 0, 1)      // 顶→z=15
      if (notNull(s)) {
        const bb1 = bbox(s), z1 = bb1[0][2]
        s = W.ReplaceFaceNear(s, cx, cy, z1, cx, cy, z1 + 5, 0, 0, -1)                       // 底→z=5
        const v = validSolid(s), bb2 = notNull(s) ? bbox(s) : null, h = bb2 ? bb2[1][2] - bb2[0][2] : NaN
        ok = v.ok && Math.abs(h - 10) < 0.2 && Math.abs(v.vol - 12000) < 60                   // 40*30*10
        d = { ...v, height: +h.toFixed(2), expect: '高=10 vol=12000（顶−5 底+5 各朝内, 顺序作用）' }
      } else d = { note: '第一步 NULL' }
    } catch (e) { d = { threw: excMsg(e) } }
  }
  report('P5 顺序 ReplaceFaceNear 两相对面(各朝内)', ok, d)
}

// ═══ P6 历史 API（Modified/Generated/IsDeleted）═══
console.log('\n── P6 历史 API ──')
{
  const g = tryNew(['BRepOffsetAPI_MakeOffsetShape'], [[]]); let d = { note: 'no ctor' }, ok = false
  if (g) {
    const mk = g.obj, mode = OC.BRepOffset_Mode.BRepOffset_Skin, jt = OC.GeomAbs_JoinType.GeomAbs_Arc
    try { mk.PerformByJoin(box.wrapped, 2, 1e-4, mode, false, false, jt, false, PR()) } catch { try { mk.PerformByJoin(box.wrapped, 2, 1e-4, mode, false, false, jt, false) } catch { /**/ } }
    const hasMod = typeof mk.Modified === 'function', hasGen = typeof mk.Generated === 'function', hasDel = typeof mk.IsDeleted === 'function'
    let modN = -1; if (hasMod) { try { const l = mk.Modified(box.faces[0].wrapped); modN = l.Size ? l.Size() : (l.Extent ? l.Extent() : -1) } catch (e) { modN = 'threw:' + excMsg(e) } }
    ok = hasMod && hasGen && hasDel
    d = { hasModified: hasMod, hasGenerated: hasGen, hasIsDeleted: hasDel, modifiedCount_face0: modN, ReplaceFaceNear_history: '无(返裸 TopoDS_Shape)；逐面 move 之 S2 lineage 需靠面指纹重配,非 builder history' }
  }
  report('P6 MakeOffsetShape 暴露 Modified/Generated/IsDeleted', ok, d)
}

// ═══ P7 稳健性 ═══
console.log('\n── P7 稳健性 ──')
{
  // P7a 退化：顶面推到底面以下(z=zmin-5) → NULL（fail-safe）
  {
    let safe = false, d = {}
    if (W && W.ReplaceFaceNear) {
      try { const res = W.ReplaceFaceNear(box.wrapped, cx, cy, zmax, cx, cy, zmin - 5, 0, 0, 1); const v = validSolid(res); safe = !v.ok; d = { ...v, note: safe ? '正确 fail-safe(NULL,唔出坏实体)' : '⚠ 出咗退化实体,需上层体积守卫' } }
      catch (e) { safe = true; d = { threw: excMsg(e), note: '抛异常=fail-safe' } }
    }
    report('P7a 退化偏移 fail-safe(返 NULL)', safe, d)
  }
  // P7b 圆角盒顶平面【朝内】−5 → 邻接圆角面能否重解
  {
    let ok = false, d = {}
    try {
      const fb = makeBaseBox(40, 30, 20).fillet(3, e => e.inDirection('Z'))
      const bbf = bbox(fb.wrapped), zt = bbf[1][2], fcx = (bbf[0][0] + bbf[1][0]) / 2, fcy = (bbf[0][1] + bbf[1][1]) / 2
      const res = W.ReplaceFaceNear(fb.wrapped, fcx, fcy, zt, fcx, fcy, zt - 5, 0, 0, 1)
      const v = validSolid(res); ok = v.ok
      d = { ...v, note: ok ? '圆角盒顶平面朝内 −5 成功,邻接圆角面重解 OK' : '失败/退化' }
    } catch (e) { d = { threw: excMsg(e) } }
    report('P7b 圆角盒顶平面朝内偏移(邻圆角重解)', ok, d)
  }
}

console.log(`\n== moveface-probe: ${pass} pass / ${fail} fail ==`)
console.log('（P1a/P1b 标 FAIL = 诚实报告「该路径不可用」，非测试出错）')
process.exit(0)
