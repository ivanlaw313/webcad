// fitwrapper-solid.mjs —— M2 FitWrapper【端到端缝合】测试（跑 _occt-build/_rebuilt 暂存内核）
//   A) 40×30×20 盒：6 张解析平面 → SewSolidify(wantClosed) → SOLID，体积 24000（±0.1%）
//   B) r10 h25 圆柱：解析柱面 + 2 张圆盘盖 → SOLID，体积 πr²h = 7853.98（±0.1%）
//   C) ★ 有效性闸：只喂 6 面里嘅 5 面 + wantClosed=true → 【必须返 null】（唔准返烂实体）
//      —— 烂实体 tessellate 会触发唔可 catch 嘅 wasm abort（cad.worker.ts:1901 记录嘅陷阱）
//   D) 同 5 面 + wantClosed=false → 治愈开放壳（Tier-1 fallback），FreeBoundaryInfo 报自由边
//   E) 全部 mesh 得（真·唔 abort）+ 内核存活
// 跑法（C:\ClaudeCode\webcad）: node tests/fitwrapper-solid.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, makeBaseBox, cast, makeCircle, makeFace, assembleWire } = await import('replicad')
const { default: opencascade } = await import('../_occt-build/_rebuilt/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../_occt-build/_rebuilt/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)

let fails = 0
const ok = (cond, name, info = '') => { console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' :: ' + info : ''}`); if (!cond) fails++ }
const ST = { 0: 'COMPOUND', 1: 'COMPSOLID', 2: 'SOLID', 3: 'SHELL', 4: 'FACE', 5: 'WIRE', 6: 'EDGE', 7: 'VERTEX', 8: 'SHAPE' }
const stype = (s) => { try { const v = s.ShapeType(); const n = (v && typeof v === 'object' && 'value' in v) ? v.value : v; return ST[n] ?? String(n) } catch { return 'err' } }
const isValid = (s) => {
  try { const a = new OC.BRepCheck_Analyzer(s, true, false); return a.IsValid_2 ? a.IsValid_2() : a.IsValid() }
  catch { try { const a = new OC.BRepCheck_Analyzer(s, true, false, false); return a.IsValid_2 ? a.IsValid_2() : a.IsValid() } catch (e) { return 'n/a(' + (e && e.message) + ')' } }
}
const vol = (s) => { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(s, g, false, false, false); return g.Mass() } catch { return NaN } }
const nFaces = (s) => { try { let n = 0; const ex = new OC.TopExp_Explorer_2(s, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; ex.More(); ex.Next()) n++; return n } catch { return -1 } }
const meshOk = (s) => { try { const m = cast(s).mesh({ tolerance: 0.1, angularTolerance: 0.5 }); return !!(m && m.triangles && m.triangles.length) ? m.triangles.length / 3 : 0 } catch (e) { return 'THROW:' + (e && e.message) } }
const rel = (a, b) => Math.abs(a - b) / Math.abs(b)
const W = OC.FitWrapper
if (!W) { console.log('FATAL: OC.FitWrapper 唔存在 —— 内核未重建'); process.exit(1) }

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

// ── A) 盒 40×30×20：6 张解析平面 → 实体 ────────────────────────────────────────
console.log('== A) box 40×30×20 from 6 analytic planes ==')
const BX = 40, BY = 30, BZ = 20
const corners = []
for (const x of [0, BX]) for (const y of [0, BY]) for (const z of [0, BZ]) corners.push([x, y, z])
// 平面参数化：P(u,v) = O + u·X + v·Y，Y = N × X（右手）→ uv 界由 8 个角投影取 min/max
function planeFace(origin, n, xd) {
  const yd = cross(n, xd)
  const us = corners.map(c => dot(sub(c, origin), xd))
  const vs = corners.map(c => dot(sub(c, origin), yd))
  const uv = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]
  const f = W.MakeAnalyticFace(0, [...origin, ...n, ...xd], uv)
  return { f, uv }
}
const specs = [
  { name: 'z=0',  o: [0, 0, 0],   n: [0, 0, 1], x: [1, 0, 0] },
  { name: 'z=20', o: [0, 0, BZ],  n: [0, 0, 1], x: [1, 0, 0] },
  { name: 'x=0',  o: [0, 0, 0],   n: [1, 0, 0], x: [0, 1, 0] },
  { name: 'x=40', o: [BX, 0, 0],  n: [1, 0, 0], x: [0, 1, 0] },
  { name: 'y=0',  o: [0, 0, 0],   n: [0, 1, 0], x: [0, 0, 1] },
  { name: 'y=30', o: [0, BY, 0],  n: [0, 1, 0], x: [0, 0, 1] },
]
const boxFaces = []
for (const s of specs) {
  const { f, uv } = planeFace(s.o, s.n, s.x)
  const good = f && !f.IsNull() && stype(f) === 'FACE'
  ok(good, `face ${s.name}`, `uv=[${uv.map(v => v.toFixed(0)).join(',')}] ${good ? 'FACE' : 'NULL'}`)
  if (good) boxFaces.push(f)
}
ok(boxFaces.length === 6, '6/6 faces built', String(boxFaces.length))
let boxSolid = null
{
  let err = ''
  try { boxSolid = W.SewSolidify(boxFaces, 1e-6, true) } catch (e) { err = 'THROW:' + (e && e.message || e) }
  const nul = boxSolid ? boxSolid.IsNull() : true
  ok(!nul, 'SewSolidify(6 faces, wantClosed=true) non-null', err || `IsNull=${nul}`)
  if (!nul) {
    const v = vol(boxSolid)
    ok(stype(boxSolid) === 'SOLID', 'result is SOLID', stype(boxSolid))
    ok(isValid(boxSolid) === true, 'BRepCheck valid', String(isValid(boxSolid)))
    ok(rel(v, 24000) < 1e-3, 'volume ≈ 24000 (±0.1%)', `got ${v.toFixed(6)} (rel ${(rel(v, 24000) * 100).toFixed(5)}%)`)
    ok(nFaces(boxSolid) === 6, 'face count 6 (UnifySameDomain 无乱合)', String(nFaces(boxSolid)))
    const tri = meshOk(boxSolid)
    ok(typeof tri === 'number' && tri > 0, 'tessellates without abort', `${tri} triangles`)
  }
}

// ── B) 圆柱 r10 h25：解析柱面 + 2 圆盘盖 → 实体 ────────────────────────────────
console.log('== B) cylinder r10 h25 = analytic lateral + 2 planar caps ==')
{
  const R = 10, H = 25, TAU = Math.PI * 2
  const lat = W.MakeAnalyticFace(1, [0, 0, 0, 0, 0, 1, R, 1, 0, 0], [0, TAU, 0, H])
  ok(lat && !lat.IsNull() && stype(lat) === 'FACE', 'lateral cylinder face', lat && !lat.IsNull() ? stype(lat) : 'NULL')
  // 圆盘盖：真圆边（同柱面接缝圆几何全等）→ wire → planar face
  const cap0 = makeFace(assembleWire([makeCircle(R, [0, 0, 0], [0, 0, 1])]))
  const cap1 = makeFace(assembleWire([makeCircle(R, [0, 0, H], [0, 0, 1])]))
  ok(!!cap0.wrapped && !!cap1.wrapped, 'both caps built', 'ok')
  let cyl = null, err = ''
  try { cyl = W.SewSolidify([lat, cap0.wrapped, cap1.wrapped], 1e-6, true) } catch (e) { err = 'THROW:' + (e && e.message || e) }
  const nul = cyl ? cyl.IsNull() : true
  ok(!nul, 'SewSolidify(lateral+2 caps) non-null', err || `IsNull=${nul}`)
  if (!nul) {
    const v = vol(cyl), want = Math.PI * R * R * H
    ok(stype(cyl) === 'SOLID', 'result is SOLID', stype(cyl))
    ok(isValid(cyl) === true, 'BRepCheck valid', String(isValid(cyl)))
    ok(rel(v, want) < 1e-3, `volume ≈ πr²h = ${want.toFixed(4)} (±0.1%)`, `got ${v.toFixed(6)} (rel ${(rel(v, want) * 100).toFixed(5)}%)`)
    const tri = meshOk(cyl)
    ok(typeof tri === 'number' && tri > 0, 'tessellates without abort', `${tri} triangles`)
    console.log('    FreeBoundaryInfo(cyl solid):', W.FreeBoundaryInfo(cyl))
  }
}

// ── C) ★ 有效性闸：5/6 面 + wantClosed=true → 必须 null ─────────────────────────
console.log('== C) gate: 5 of 6 box faces, wantClosed=true ==')
const five = boxFaces.slice(0, 5)
{
  let r = null, err = ''
  try { r = W.SewSolidify(five, 1e-6, true) } catch (e) { err = 'THROW:' + (e && e.message || e) }
  ok(!err, 'no throw (null-contract, 唔准抛)', err || 'clean')
  ok(!!r && r.IsNull(), '★ 5-face wantClosed=true → IsNull (gate works, no abort)', r ? `IsNull=${r.IsNull()} type=${r.IsNull() ? '—' : stype(r)}` : 'undefined')
}

// ── D) Tier-1 fallback：同 5 面 wantClosed=false → 治愈开放壳 + 自由边界报告 ─────
console.log('== D) Tier-1 fallback: same 5 faces, wantClosed=false ==')
{
  let sh = null, err = ''
  try { sh = W.SewSolidify(five, 1e-6, false) } catch (e) { err = 'THROW:' + (e && e.message || e) }
  const nul = sh ? sh.IsNull() : true
  ok(!nul, 'open shell returned', err || `IsNull=${nul}`)
  if (!nul) {
    ok(stype(sh) === 'SHELL', 'result is SHELL', stype(sh))
    ok(isValid(sh) === true, 'shell BRepCheck valid', String(isValid(sh)))
    ok(nFaces(sh) === 5, 'shell has 5 faces', String(nFaces(sh)))
    const raw = W.FreeBoundaryInfo(sh)
    console.log('    FreeBoundaryInfo(open shell):', raw)
    let o = null; try { o = JSON.parse(raw) } catch { /* */ }
    ok(!!o, 'FreeBoundaryInfo parseable', raw)
    if (o) {
      ok(o.freeEdges === 4, '★ 开放壳报 4 条自由边（= 缺面嘅口）', `freeEdges=${o.freeEdges} closedWires=${o.closedWires} openWires=${o.openWires}`)
      ok((o.closedWires + o.openWires) >= 1, '自由边界成 ≥1 条 wire', `closed=${o.closedWires} open=${o.openWires}`)
    }
    const tri = meshOk(sh)
    ok(typeof tri === 'number' && tri > 0, 'open shell tessellates without abort', `${tri} triangles`)
  }
  // 对照：闭合实体自由边 = 0
  if (boxSolid && !boxSolid.IsNull()) {
    const raw2 = W.FreeBoundaryInfo(boxSolid)
    console.log('    FreeBoundaryInfo(closed box solid):', raw2)
    let o2 = null; try { o2 = JSON.parse(raw2) } catch { /* */ }
    ok(o2 && o2.freeEdges === 0, '闭合实体 freeEdges = 0', raw2)
  }
}

// ── E) 偏差采样 vs 重建盒 + 内核存活 ──────────────────────────────────────────
console.log('== E) DeviationSample on rebuilt box + kernel alive ==')
if (boxSolid && !boxSolid.IsNull()) {
  const pts = [20, 15, 25, 20, 15, 10, -4, 15, 10]     // 顶面外 5 / 体心 10 / x=0 面外 4
  const raw = W.DeviationSample(boxSolid, pts)
  console.log('    raw:', raw)
  let d = null; try { d = JSON.parse(raw) } catch { /* */ }
  ok(Array.isArray(d) && d.length === 3, 'DeviationSample → 3 距离', raw)
  if (Array.isArray(d) && d.length === 3) {
    ok(Math.abs(d[0] - 5) < 1e-6, 'pt 顶面外 5mm', String(d[0]))
    ok(Math.abs(d[1] - 10) < 1e-6, 'pt 体心 → 10mm', String(d[1]))
    ok(Math.abs(d[2] - 4) < 1e-6, 'pt x=0 面外 4mm', String(d[2]))
  }
}
try {
  const b = makeBaseBox(5, 5, 5)
  ok(Math.abs(vol(b.wrapped) - 125) < 1e-6, 'makeBaseBox(5,5,5) = 125 —— kernel ALIVE', String(vol(b.wrapped)))
} catch (e) { ok(false, 'kernel DEAD', e && e.message) }

console.log(`\n${fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAIL'}`)
process.exit(fails === 0 ? 0 : 1)
