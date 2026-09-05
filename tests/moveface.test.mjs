// moveface.test.mjs — GM-B2「移动面 Move Face」v1 实证（真 replicad_plus 内核 + 共用决策核 _moveFacePlan）。
//
// 点解要用 tsx 跑：本测既要 import 纯 TS 决策核 src/cad/moveFacePlan.ts（worker 同 test 共用同一段决策码），
//   又要载 WASM 内核跑真几何。cad.worker.ts 本体用咗 Vite `?url`/wasm import → Node/tsx 都 import 唔到；
//   故几何路径同 moveface-probe / replaceface-rotate-probe 一样【直接驱动 replicad】，但【分支决策】= worker
//   真行嘅 `_moveFacePlan`（朝内 ReplaceFaceNear / 朝外 prism fuse / 倾斜）+ 同款 kernel primitive
//   （ReplaceFaceNear + basicFaceExtrusion）。即：决策同 worker 同一码，几何同 worker 同一 API。
//
// 跑法（喺 C:\ClaudeCode\webcad）:  npx -y tsx tests/moveface.test.mjs
//
// 覆盖 spec (a)-(f)：
//   (a) box 顶 −5 朝内 → vol 18000, 6 faces, zTop 15（ReplaceFaceNear 重解）
//   (b) 圆角盒平面朝内 → valid solid, vol < 原（邻圆角一齐重解）
//   (c) 顶 +5 朝外 → prism fuse vol 30000
//   (d) 退化 −25 → ReplaceFaceNear NULL → 诚实 fallback（无 crash、warning 路径）
//   (e) tilt 15° → valid solid；tilt 铰点太尽 → 诚实 skip
//   (f) 非平面（圆柱侧）→ 诚实 reject
//   + _moveFacePlan 纯决策核断言（钳角、零跳过、方向分支）。

import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))

const { _moveFacePlan } = await import('../src/cad/moveFacePlan.ts')   // 与 worker 共用嘅纯决策核
const { setOC, cast, makeBaseBox, makeCylinder, basicFaceExtrusion } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)

// ─── 共用工具（镜 moveface-probe）───
function excMsg(e) { if (typeof e !== 'number') return e?.message || String(e); try { return OC.getExceptionMessage ? OC.getExceptionMessage(e) : 'C++exc#' + e } catch { return 'C++exc#' + e } }
function vol(shape) { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(shape, g, false, false, false); return Math.abs(g.Mass()) } catch { return NaN } }
function nfaces(shape) { try { let n = 0; const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE); for (; ex.More(); ex.Next()) n++; return n } catch { return -1 } }
function bbox(shape) { try { const b = new OC.Bnd_Box_1(); OC.BRepBndLib.Add(shape, b, false); const c = b.CornerMin(), d = b.CornerMax(); return [[c.X(), c.Y(), c.Z()], [d.X(), d.Y(), d.Z()]] } catch { return null } }
function tris(shape) {
  try {
    new OC.BRepMesh_IncrementalMesh_2(shape, 0.2, false, 0.5, false)
    let t = 0; const ex = new OC.TopExp_Explorer_2(shape, OC.TopAbs_ShapeEnum.TopAbs_FACE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
    for (; ex.More(); ex.Next()) { const loc = new OC.TopLoc_Location_1(); const h = OC.BRep_Tool.Triangulation(OC.TopoDS.Face_1(ex.Current()), loc, 0); if (!h.IsNull()) t += h.get().NbTriangles() }
    return t
  } catch (e) { return 'meshTHREW:' + excMsg(e) }
}
const notNull = (s) => !!s && !(s.IsNull && s.IsNull())
function validSolid(shape) {
  if (!notNull(shape)) return { ok: false, why: shape ? 'IsNull' : 'null-ret' }
  const v = vol(shape), tr = tris(shape), nf = nfaces(shape)
  const ok = Number.isFinite(v) && v > 1 && typeof tr === 'number' && tr > 0
  return { ok, vol: Number.isFinite(v) ? +v.toFixed(1) : v, faces: nf, tris: tr }
}
const W = OC.DirectEditWrapper

// ─── 决策核（worker 真用）+ 同款 kernel primitive 组合成 move-face（面解析用 center-nearest，对本夹具充分）───
function faceNearest(shape, near) {
  let best = null, bd = Infinity
  for (const fc of shape.faces) { const c = fc.center; const d = (c.x - near[0]) ** 2 + (c.y - near[1]) ** 2 + (c.z - near[2]) ** 2; if (d < bd) { bd = d; best = fc } }
  return best
}
// 倾斜法向 + 面心（镜 worker：面内正交基、缺省铰轴=最长面内轴、Rodrigues 绕铰轴旋外向法向）
function tiltNormalCenter(shape, bestF, n, angleDeg) {
  shape.mesh({ tolerance: 0.1, angularTolerance: 0.5 })
  const tri = bestF.triangulation()
  const V = tri.vertices, nv = V.length / 3
  let cx = 0, cy = 0, cz = 0; for (let i = 0; i < V.length; i += 3) { cx += V[i]; cy += V[i + 1]; cz += V[i + 2] }
  const ctr = [cx / nv, cy / nv, cz / nv]
  let ux = 1, uy = 0, uz = 0; if (Math.abs(n[0]) > 0.9) { ux = 0; uy = 1; uz = 0 }
  const sdn = ux * n[0] + uy * n[1] + uz * n[2]; ux -= sdn * n[0]; uy -= sdn * n[1]; uz -= sdn * n[2]
  const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul
  const vx = n[1] * uz - n[2] * uy, vy = n[2] * ux - n[0] * uz, vz = n[0] * uy - n[1] * ux
  let su = 0, sv = 0, muU = 0, muV = 0; const pu = [], pv = []
  for (let i = 0; i < V.length; i += 3) { const du = (V[i] - ctr[0]) * ux + (V[i + 1] - ctr[1]) * uy + (V[i + 2] - ctr[2]) * uz; const dv = (V[i] - ctr[0]) * vx + (V[i + 1] - ctr[1]) * vy + (V[i + 2] - ctr[2]) * vz; pu.push(du); pv.push(dv); muU += du; muV += dv }
  muU /= nv; muV /= nv
  for (let i = 0; i < nv; i++) { su += (pu[i] - muU) ** 2; sv += (pv[i] - muV) ** 2 }
  const k = su >= sv ? [ux, uy, uz] : [vx, vy, vz]
  const t = angleDeg * Math.PI / 180, ct = Math.cos(t), st = Math.sin(t)
  const cnx = k[1] * n[2] - k[2] * n[1], cny = k[2] * n[0] - k[0] * n[2], cnz = k[0] * n[1] - k[1] * n[0]
  let tnx = n[0] * ct + cnx * st, tny = n[1] * ct + cny * st, tnz = n[2] * ct + cnz * st
  const tl = Math.hypot(tnx, tny, tnz) || 1
  return { ctr, tn: [tnx / tl, tny / tl, tnz / tl] }
}
// 完整 move-face（镜 worker exec 分支）。返回 { plan, path, out, warn }。
function runMoveFace(shape, near, opts) {
  const plan = _moveFacePlan(opts)
  if (plan.op === 'skip-zero') return { plan, path: 'skip-zero', out: shape.wrapped }
  const bestF = faceNearest(shape, near)
  if (!bestF) return { plan, path: 'no-face', out: shape.wrapped, warn: 'no-face' }
  if (bestF.geomType !== 'PLANE') return { plan, path: 'reject-nonplanar', out: shape.wrapped, warn: 'reject-nonplanar:' + bestF.geomType, geomType: bestF.geomType }
  const nrm = bestF.normalAt(near).normalized(); const n = [nrm.x, nrm.y, nrm.z]
  if (plan.op === 'replace-inward') {
    const org = [near[0] + n[0] * opts.dist, near[1] + n[1] * opts.dist, near[2] + n[2] * opts.dist]
    let res = null; try { res = W.ReplaceFaceNear(shape.wrapped, near[0], near[1], near[2], org[0], org[1], org[2], n[0], n[1], n[2]) } catch { res = null }
    if (notNull(res) && vol(res) > 1e-6) return { plan, path: 'replace-inward', out: res, kernelNull: false }
    try { const prism = basicFaceExtrusion(bestF, nrm.multiply(opts.dist)); return { plan, path: 'fallback-cut', out: shape.cut(prism).wrapped, warn: 'kernel-null→fallback', kernelNull: true } }
    catch (e) { return { plan, path: 'fallback-cut', out: null, warn: 'kernel-null→fallback-empty:' + excMsg(e), kernelNull: true } }
  }
  if (plan.op === 'prism-outward') { const prism = basicFaceExtrusion(bestF, nrm.multiply(opts.dist)); return { plan, path: 'prism-outward', out: shape.fuse(prism).wrapped } }
  // tilt
  const { ctr, tn } = tiltNormalCenter(shape, bestF, n, plan.angle)
  let res = null; try { res = W.ReplaceFaceNear(shape.wrapped, near[0], near[1], near[2], ctr[0], ctr[1], ctr[2], tn[0], tn[1], tn[2]) } catch { res = null }
  if (notNull(res) && vol(res) > 1e-6) return { plan, path: 'tilt', out: res, kernelNull: false }
  return { plan, path: 'tilt-skip', out: null, warn: 'tilt-degenerate', kernelNull: true }
}

// GM-L2 v2 多面串链（镜 worker exec 多面循环 + 共用 _moveFacePlan(nfaces)）。逐面顺序：解析最近面 → 平面 check →
//   offset dist<0 逐面 ReplaceFaceNear（NULL/vol 守卫：单面退 prism-cut / 多面诚实跳该面继续，唔退 prism，cast 输出喂下一步）；
//   offset dist>0 逐面 prism fuse；tilt 多面 → 决策核 reject-multi-tilt（保原样）。返回 { plan, out, okCount, warnings }。
function runMoveFaceMulti(shape0, nears, opts) {
  const plan = _moveFacePlan({ ...opts, nfaces: nears.length })
  if (plan.op === 'skip-zero') return { plan, path: 'skip-zero', out: shape0.wrapped, okCount: 0, warnings: [] }
  if (plan.op === 'reject-multi-tilt') return { plan, path: 'reject-multi-tilt', out: shape0.wrapped, okCount: 0, warnings: [plan.note || 'reject-multi-tilt'] }
  const multi = nears.length > 1
  let shape = shape0, okCount = 0
  const warnings = []
  for (let fi = 0; fi < nears.length; fi++) {
    const P = nears[fi]
    const bestF = faceNearest(shape, P)
    if (!bestF) { warnings.push(`no-face-${fi}`); continue }
    if (bestF.geomType !== 'PLANE') { warnings.push(`nonplanar-${fi}:${bestF.geomType}`); continue }
    const nrm = bestF.normalAt(P).normalized(); const n = [nrm.x, nrm.y, nrm.z]
    if (plan.op === 'replace-inward') {
      const org = [P[0] + n[0] * opts.dist, P[1] + n[1] * opts.dist, P[2] + n[2] * opts.dist]
      let res = null; try { res = W.ReplaceFaceNear(shape.wrapped, P[0], P[1], P[2], org[0], org[1], org[2], n[0], n[1], n[2]) } catch { res = null }
      if (notNull(res) && vol(res) > 1e-6) { shape = cast(res); okCount++ }
      else if (!multi) { try { const prism = basicFaceExtrusion(bestF, nrm.multiply(opts.dist)); shape = shape.cut(prism); okCount++; warnings.push('fallback-cut') } catch (e) { warnings.push('fallback-cut-empty:' + excMsg(e)) } }
      else warnings.push(`inward-null-${fi}`)   // 多面：诚实跳该面继续串链
    } else if (plan.op === 'prism-outward') {
      const prism = basicFaceExtrusion(bestF, nrm.multiply(opts.dist)); shape = shape.fuse(prism); okCount++
    }
  }
  return { plan, path: plan.op, out: shape.wrapped, okCount, warnings }
}

// ─── 小测试框架 ───
let pass = 0, fail = 0
function report(name, ok, detail) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name} — ${JSON.stringify(detail)}`); ok ? pass++ : fail++ }

console.log('== 内核绑定 ==', 'DirectEditWrapper.ReplaceFaceNear:', !!(W && W.ReplaceFaceNear), '\n')

// ═══ 决策核（纯，worker 共用）═══
{
  const c1 = _moveFacePlan({ dist: -5 }); report('P0a plan dist<0 → replace-inward', c1.op === 'replace-inward', c1)
  const c2 = _moveFacePlan({ dist: 5 }); report('P0b plan dist>0 → prism-outward', c2.op === 'prism-outward', c2)
  const c3 = _moveFacePlan({ dist: 0 }); report('P0c plan dist==0 → skip-zero', c3.op === 'skip-zero', c3)
  const c4 = _moveFacePlan({ mode: 'tilt', angle: 15 }); report('P0d plan tilt 15° → tilt/angle 15', c4.op === 'tilt' && c4.angle === 15, c4)
  const c5 = _moveFacePlan({ mode: 'tilt', angle: 90 }); report('P0e plan tilt 90° → 钳到 60', c5.op === 'tilt' && c5.angle === 60, c5)
  const c6 = _moveFacePlan({ mode: 'tilt', angle: 0 }); report('P0f plan tilt 0° → skip-zero', c6.op === 'skip-zero', c6)
  // GM-L2 v2：nfaces 决策（缺省=1 单面逐字节；offset 多面 OK；tilt 多面诚实 reject）
  const c7 = _moveFacePlan({ dist: -5, nfaces: 2 }); report('P0g plan offset 多面 → replace-inward（支持串链）', c7.op === 'replace-inward', c7)
  const c8 = _moveFacePlan({ dist: 5, nfaces: 3 }); report('P0h plan offset 多面朝外 → prism-outward', c8.op === 'prism-outward', c8)
  const c9 = _moveFacePlan({ mode: 'tilt', angle: 15, nfaces: 2 }); report('P0i plan tilt 多面 → reject-multi-tilt', c9.op === 'reject-multi-tilt', c9)
  const c10 = _moveFacePlan({ mode: 'tilt', angle: 15, nfaces: 1 }); report('P0j plan tilt 单面 → 仍 tilt（byte-compat）', c10.op === 'tilt' && c10.angle === 15, c10)
  const c11 = _moveFacePlan({ dist: -5 }); report('P0k plan nfaces 缺省=单面（逐字节）', c11.op === 'replace-inward', c11)
}

// 基准盒 40×30×20（居中 XY，Z 0..20）
const NEAR_TOP = [0, 0, 20]

// ═══ (a) 顶面朝内 −5 ═══
{
  const r = runMoveFace(makeBaseBox(40, 30, 20), NEAR_TOP, { dist: -5 })
  const v = validSolid(r.out); const bb = notNull(r.out) ? bbox(r.out) : null; const zTop = bb ? bb[1][2] : NaN
  const ok = r.path === 'replace-inward' && v.ok && Math.abs(v.vol - 18000) < 80 && v.faces === 6 && Math.abs(zTop - 15) < 0.1
  report('(a) box 顶 −5 朝内 → vol 18000 / 6 面 / zTop 15', ok, { path: r.path, ...v, zTop: +Number(zTop).toFixed(2) })
}

// ═══ (b) 圆角盒平面朝内（邻圆角重解）═══
{
  const fb = makeBaseBox(40, 30, 20).fillet(3, (e) => e.inDirection('Z'))
  const vBefore = vol(fb.wrapped)
  const r = runMoveFace(fb, NEAR_TOP, { dist: -5 })
  const v = validSolid(r.out)
  const ok = r.path === 'replace-inward' && v.ok && v.vol < vBefore - 1
  report('(b) 圆角盒顶平面朝内 −5 → valid solid, vol < 原（邻圆角重解）', ok, { path: r.path, volBefore: +vBefore.toFixed(1), ...v })
}

// ═══ (c) 顶面朝外 +5（prism fuse）═══
{
  const r = runMoveFace(makeBaseBox(40, 30, 20), NEAR_TOP, { dist: 5 })
  const v = validSolid(r.out)
  const ok = r.path === 'prism-outward' && v.ok && Math.abs(v.vol - 30000) < 80
  report('(c) box 顶 +5 朝外 → prism fuse vol 30000', ok, { path: r.path, ...v })
}

// ═══ (d) 退化 −25（诚实 fallback，无 crash）═══
{
  let threw = false, r = null
  try { r = runMoveFace(makeBaseBox(40, 30, 20), NEAR_TOP, { dist: -25 }) } catch (e) { threw = true; r = { err: excMsg(e) } }
  // 诚实 = plan 系 replace-inward、内核返 NULL（kernelNull=true）、走 fallback、无顶层 crash
  const ok = !threw && r.plan.op === 'replace-inward' && r.kernelNull === true && r.path === 'fallback-cut'
  report('(d) 退化 −25 → ReplaceFaceNear NULL → 诚实 fallback（无 crash）', ok, { threw, path: r?.path, kernelNull: r?.kernelNull, warn: r?.warn })
}

// ═══ (e) tilt 15° 有效 ═══
{
  const r = runMoveFace(makeBaseBox(40, 30, 20), NEAR_TOP, { mode: 'tilt', angle: 15 })
  const v = validSolid(r.out)
  const ok = r.path === 'tilt' && v.ok
  report('(e1) tilt 15° → valid solid（ReplaceFaceNear 倾斜平面）', ok, { path: r.path, ...v })
}

// ═══ (e2) 内核返 NULL 时 → 诚实 skip 守卫 ═══
// 实测发现（诚实修正 probe P4 注脚）：本 Splitter 内核对呢个盒【好稳阵】—— 铰点落边缘 / 大角度 / 薄盒倾斜
//   都照样切出有效楔形实体，好难自然退化到 NULL。故本项直接用一个【确定 NULL】嘅内核结果（朝外顶替，
//   probe P1d 证实返 NULL）去验证 worker 倾斜/朝内 两条路径【共用】嘅 skip 守卫 `notNull(res) && vol>1e-6`
//   会正确判假 → 走 buildWarnings 诚实 skip、唔会用 NULL 出坏几何。
{
  let resNull = null
  try { resNull = W.ReplaceFaceNear(makeBaseBox(40, 30, 20).wrapped, 0, 0, 20, 0, 0, 25, 0, 0, 1) } catch { resNull = null }   // 顶面朝外 +5 → NULL（无 Splitter 相交）
  const guardKeeps = notNull(resNull) && vol(resNull) > 1e-6   // worker：true=采用 cast(res)；false=诚实 skip
  const ok = guardKeeps === false
  report('(e2) 内核返 NULL → 诚实 skip 守卫正确判假（唔出坏几何）', ok, { kernelNull: !notNull(resNull), guardKeeps })
}

// ═══ (f) 非平面（圆柱侧）→ 诚实 reject ═══
{
  const cyl = makeCylinder(10, 20, [0, 0, 0], [0, 0, 1])
  const r = runMoveFace(cyl, [10, 0, 10], { dist: -5 })
  const ok = r.path === 'reject-nonplanar' && /CYLIND/i.test(String(r.geomType || ''))
  report('(f) 圆柱侧面（非平面）→ 诚实 reject', ok, { path: r.path, geomType: r.geomType })
}

// 基准盒 40×30×20：顶 [0,0,20] / 底 [0,0,0] / +X 侧 [20,0,10]（居中 XY，Z 0..20）
const NEAR_BOT = [0, 0, 0]
const NEAR_PX = [20, 0, 10]

// ═══ (g) v2 多面：两【对面】各朝内 −5 → 40×30×20 → 40×30×10 vol 12000（probe P5 精确案例）═══
{
  const r = runMoveFaceMulti(makeBaseBox(40, 30, 20), [NEAR_TOP, NEAR_BOT], { dist: -5 })
  const v = validSolid(r.out); const bb = notNull(r.out) ? bbox(r.out) : null
  const zLo = bb ? bb[0][2] : NaN, zHi = bb ? bb[1][2] : NaN
  const ok = r.okCount === 2 && v.ok && Math.abs(v.vol - 12000) < 80 && v.faces === 6 && Math.abs(zLo - 5) < 0.1 && Math.abs(zHi - 15) < 0.1
  report('(g) 两对面各朝内 −5 → 串链 vol 12000 / 6 面 / z 5..15', ok, { path: r.path, okCount: r.okCount, ...v, zLo: +Number(zLo).toFixed(2), zHi: +Number(zHi).toFixed(2) })
}

// ═══ (h) v2 多面 partial：−25，一面退化（顶超切 NULL）+ 一面成功（+X 侧到 x=−5）→ 部分结果 + 警告 ═══
{
  const r = runMoveFaceMulti(makeBaseBox(40, 30, 20), [NEAR_TOP, NEAR_PX], { dist: -25 })
  const v = validSolid(r.out)
  // 顶面 −25 → 目标 z=−5（穿底）→ ReplaceFaceNear NULL → 多面诚实跳（warn inward-null），继续 +X；+X −25 → x=−5 有效 slab vol 15×30×20=9000
  const skipped = r.warnings.some((w) => /inward-null/.test(w))
  const ok = r.okCount === 1 && skipped && v.ok && Math.abs(v.vol - 9000) < 80
  report('(h) 多面 partial：一面退化跳过 + 一面成功 → 部分结果 vol 9000 + 警告', ok, { path: r.path, okCount: r.okCount, warnings: r.warnings, ...v })
}

// ═══ (i) v2 多面朝外：顶 +5 + 底 +5（prism fuse 串链）→ z −5..25 vol 36000 ═══
{
  const r = runMoveFaceMulti(makeBaseBox(40, 30, 20), [NEAR_TOP, NEAR_BOT], { dist: 5 })
  const v = validSolid(r.out); const bb = notNull(r.out) ? bbox(r.out) : null
  const zLo = bb ? bb[0][2] : NaN, zHi = bb ? bb[1][2] : NaN
  const ok = r.okCount === 2 && v.ok && Math.abs(v.vol - 36000) < 120 && Math.abs(zLo + 5) < 0.1 && Math.abs(zHi - 25) < 0.1
  report('(i) 两对面各朝外 +5 → prism fuse 串链 vol 36000 / z −5..25', ok, { path: r.path, okCount: r.okCount, ...v, zLo: +Number(zLo).toFixed(2), zHi: +Number(zHi).toFixed(2) })
}

// ═══ (j) v2 tilt 多面 → 诚实 reject（保原样，okCount 0）═══
{
  const box = makeBaseBox(40, 30, 20)
  const vBefore = vol(box.wrapped)
  const r = runMoveFaceMulti(box, [NEAR_TOP, NEAR_PX], { mode: 'tilt', angle: 15 })
  const vAfter = notNull(r.out) ? vol(r.out) : NaN
  const ok = r.plan.op === 'reject-multi-tilt' && r.okCount === 0 && Number.isFinite(vAfter) && Math.abs(vAfter - vBefore) < 1e-3
  report('(j) tilt 2 面 → reject-multi-tilt（几何不变，诚实拒绝）', ok, { path: r.path, okCount: r.okCount, volBefore: +vBefore.toFixed(1), volAfter: Number.isFinite(vAfter) ? +vAfter.toFixed(1) : vAfter })
}

// ═══ (k) v2 单面走多面码路径 = v1 逐字节（顶 −5 单面 → vol 18000，与 (a) 一致）═══
{
  const r = runMoveFaceMulti(makeBaseBox(40, 30, 20), [NEAR_TOP], { dist: -5 })
  const v = validSolid(r.out)
  const ok = r.okCount === 1 && r.path === 'replace-inward' && v.ok && Math.abs(v.vol - 18000) < 80 && v.faces === 6
  report('(k) 单面走 v2 码路径 → 同 v1（vol 18000 / 6 面，byte-compat）', ok, { path: r.path, okCount: r.okCount, ...v })
}

console.log(`\n== moveface: ${pass} pass / ${fail} fail ==`)
process.exit(fail ? 1 : 0)
