// mesh2brep-tier2.mjs —— M4（Tier-2 解析边重建）+ M5（圆角识别/压平/重施）验收
// 跑法（C:\ClaudeCode\webcad，一条命令）:
//     node --experimental-strip-types tests/mesh2brep-tier2.mjs
//
// 管線：内核造【真解析实体】(ground truth) → 镶嵌成 mesh → M1 segmentAndFit → M4 reconstructTier2
//      → GProp 体积 / TopExp 面数 / BRepCheck，同 ground truth 嘅【解析体积】对数。
// 每件都印埋 M3（brepRebuild）嘅结果做对照 —— M4 系【一离开轴对齐就要顶上】嗰层，
// 所以 oblique_boss / tilted_hole 呢啲件 M3 系 shell（缝唔埋），M4 要 solid + 0.00%。
//
// ⚠ 内核 = _occt-build/_rebuilt 暂存内核（有 FitWrapper），唔係生产 kernel。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, cast, makeBaseBox, makeCylinder } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)
const { segmentAndFit } = await import('../src/geom/primitiveFit.ts')
const { rebuild } = await import('../src/geom/brepRebuild.ts')
const { reconstructTier2, intersectSurfaces, curvePointAt, surfValue } = await import('../src/geom/edgeReconstruct.ts')
const { recoverFillets, reapplyFillets } = await import('../src/geom/filletRecover.ts')

// ───────────────────────── 小工具 ─────────────────────────
const volOf = (s) => { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(s, g, false, false, false); return Math.abs(g.Mass()) } catch { return NaN } }
const ST = { 0: 'COMPOUND', 1: 'COMPSOLID', 2: 'SOLID', 3: 'SHELL', 4: 'FACE', 5: 'WIRE', 6: 'EDGE', 7: 'VERTEX' }
const stype = (s) => { try { const v = s.ShapeType(); const n = (v && typeof v === 'object' && 'value' in v) ? v.value : v; return ST[n] ?? String(n) } catch { return 'err' } }
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(5) + '%' : '  n/a  ')
const rel = (a, b) => Math.abs(a - b) / Math.abs(b)
let fails = 0
const ok = (cond, name, info = '') => { console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' :: ' + info : ''}`); if (!cond) fails++ }

/** replicad shape → {v,t}（M1 入口格式）+ 网格自身体积（镶嵌误差对照）。 */
function tessellate(shape, tol = 0.05, ang = 0.25) {
  const m = cast(shape.wrapped ?? shape).mesh({ tolerance: tol, angularTolerance: ang })
  const v = Float64Array.from(m.vertices)
  const t = Uint32Array.from(m.triangles)
  let vol = 0
  for (let i = 0; i < t.length; i += 3) {
    const a = t[i] * 3, b = t[i + 1] * 3, c = t[i + 2] * 3
    vol += (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1])
      - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c])
      + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) / 6
  }
  return { v, t, tris: t.length / 3, meshVol: Math.abs(vol) }
}

/** 内核直接倒圆角（fixture 用，唔经 filletRecover —— 免得自己验自己）。 */
function filletEdgeNear(shape, radius, near) {
  const mk = new OC.BRepFilletAPI_MakeFillet(shape.wrapped, OC.ChFi3d_FilletShape.ChFi3d_Rational)
  let best = null, bestD = Infinity
  const ex = new OC.TopExp_Explorer_2(shape.wrapped, OC.TopAbs_ShapeEnum.TopAbs_EDGE, OC.TopAbs_ShapeEnum.TopAbs_SHAPE)
  for (; ex.More(); ex.Next()) {
    const e = OC.TopoDS.Edge_1(ex.Current())
    const ad = new OC.BRepAdaptor_Curve_2(e)
    const t0 = ad.FirstParameter(), t1 = ad.LastParameter()
    let d = Infinity
    for (let i = 0; i <= 8; i++) {
      const q = ad.Value(t0 + (t1 - t0) * i / 8)
      d = Math.min(d, Math.hypot(q.X() - near[0], q.Y() - near[1], q.Z() - near[2]))
    }
    if (d < bestD) { bestD = d; best = e }
  }
  mk.Add_2(radius, best)
  mk.Build(new OC.Message_ProgressRange_1())
  return cast(mk.Shape())
}

// ───────────────────────── 测件（全部【故意唔轴对齐】）─────────────────────────
const TILT = [1, 2, 3]      // 转轴：任意方向 → 冇一张面系轴对齐
const D2R = Math.PI / 180

/** ① 斜盒：6 张平面，全部唔轴对齐 → 12 条 plane∧plane 直线 + 8 个三面角点。 */
function partTiltedBox() {
  return makeBaseBox(40, 30, 20).rotate(13, [0, 0, 0], TILT)
}

/** ② 斜凸台：柱轴同顶面【唔垂直】(20°) → 交线系【椭圆】。M3 嘅圆识别喺呢度必失手。 */
function partObliqueBoss() {
  const base = makeBaseBox(60, 60, 20)
  const dir = [Math.sin(20 * D2R), 0, Math.cos(20 * D2R)]
  const boss = makeCylinder(8, 25, [-6, 0, 8], dir)   // 底盘完全埋喺盒内 → 净係侧面×顶面一条椭圆
  return base.fuse(boss).rotate(13, [0, 0, 0], TILT)
}

/** ③ 斜通孔：柱面【凹】+ 上下两个面各一条椭圆交线 + 周期面切半。 */
function partObliqueHole() {
  const base = makeBaseBox(50, 40, 20)
  const dir = [Math.sin(25 * D2R), 0, Math.cos(25 * D2R)]
  const tool = makeCylinder(6, 60, [-8, 0, -20], dir)
  return base.cut(tool).rotate(13, [0, 0, 0], TILT)
}

/** ④ 圆角盒（M5）：一条竖边 r=4 倒圆 = 90° 四分一柱面带（G1）。 */
function partFilletedBox() {
  return filletEdgeNear(makeBaseBox(40, 30, 20), 4, [20, 15, 10])
}

/** ⑤ 斜圆角盒（M5 一般化）：两条【唔同半径】嘅竖边圆角 + 成件转 13° → 冇一样嘢轴对齐。 */
function partFilletedBoxTilted() {
  const one = filletEdgeNear(makeBaseBox(40, 30, 20), 4, [20, 15, 10])
  return filletEdgeNear(one, 2.5, [-20, -15, 10]).rotate(13, [0, 0, 0], TILT)
}

/** 二进制 STL（golden 资产用）。 */
function readBinarySTL(file) {
  const buf = readFileSync(file)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const n = dv.getUint32(80, true)
  const v = new Float64Array(n * 9), t = new Uint32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12
    for (let k = 0; k < 3; k++) {
      v[i * 9 + k * 3] = dv.getFloat32(o + k * 12, true)
      v[i * 9 + k * 3 + 1] = dv.getFloat32(o + k * 12 + 4, true)
      v[i * 9 + k * 3 + 2] = dv.getFloat32(o + k * 12 + 8, true)
    }
    t[i * 3] = i * 3; t[i * 3 + 1] = i * 3 + 1; t[i * 3 + 2] = i * 3 + 2
  }
  return { v, t, tris: n }
}

// ═════════════════════════ 第零部分：解析求交单元核对（零内核）═════════════════════════
// 逐对基元求交 → 喺返回曲线上取样 16 点 → 两条隐函数都要 ≈ 0。
// ★ 全部 case 都【先转去一个任意斜方向】先测 —— 轴对齐嘅 case 会掩盖 refX/法向定向嘅错。
console.log('\n' + '═'.repeat(100))
console.log('M4-a —— 解析求交单元核对（intersectSurfaces：曲线上嘅点必须同时喺两张面上）')
console.log('═'.repeat(100))
{
  const AX = (() => { const L = Math.hypot(1, 2, 3); return [1 / L, 2 / L, 3 / L] })()
  const ANG = 13 * D2R
  /** 罗德里格斯：绕 AX 转 ANG（把 canonical 摆位搬去斜方向）。 */
  const rv = (v) => {
    const c = Math.cos(ANG), s = Math.sin(ANG)
    const d = AX[0] * v[0] + AX[1] * v[1] + AX[2] * v[2]
    const cr = [AX[1] * v[2] - AX[2] * v[1], AX[2] * v[0] - AX[0] * v[2], AX[0] * v[1] - AX[1] * v[0]]
    return [v[0] * c + cr[0] * s + AX[0] * d * (1 - c), v[1] * c + cr[1] * s + AX[1] * d * (1 - c), v[2] * c + cr[2] * s + AX[2] * d * (1 - c)]
  }
  const perp = (a) => { const s = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]; const c = [a[1] * s[2] - a[2] * s[1], a[2] * s[0] - a[0] * s[2], a[0] * s[1] - a[1] * s[0]]; const L = Math.hypot(...c); return [c[0] / L, c[1] / L, c[2] / L] }
  const PL = (n, p) => { const N = rv(n), P = rv(p); return { kind: 'plane', normal: N, point: P, d: N[0] * P[0] + N[1] * P[1] + N[2] * P[2] } }
  const CY = (a, p, r) => { const A = rv(a); return { kind: 'cylinder', axis: A, point: rv(p), radius: r, hMin: -50, hMax: 50, refU: perp(A), tMin: 0, tMax: 2 * Math.PI, full: true, convex: true } }
  const CO = (a, ap, halfDeg) => { const A = rv(a); return { kind: 'cone', axis: A, apex: rv(ap), halfAngleDeg: halfDeg, hMin: 0, hMax: 50, refU: perp(A), tMin: 0, tMax: 2 * Math.PI, full: true, convex: true } }
  const SP = (c, r) => ({ kind: 'sphere', centre: rv(c), radius: r })
  const TO = (a, c, R, r) => ({ kind: 'torus', axis: rv(a), centre: rv(c), majorRadius: R, minorRadius: r, convex: true })
  const Z = [0, 0, 1], X = [1, 0, 0]
  const tilt20 = [Math.sin(20 * D2R), 0, Math.cos(20 * D2R)]

  const CASES = [
    { name: 'plane ∧ plane → 直线', a: PL(Z, [0, 0, 5]), b: PL(X, [3, 0, 0]), want: ['line'] },
    { name: 'plane ⟂ cyl → 圆', a: PL(Z, [0, 0, 7]), b: CY(Z, [0, 0, 0], 10), want: ['circle'] },
    { name: 'plane ∥ cyl → 两条母线', a: PL(X, [4, 0, 0]), b: CY(Z, [0, 0, 0], 10), want: ['line', 'line'] },
    { name: 'plane ∠ cyl → 椭圆', a: PL(tilt20, [0, 0, 6]), b: CY(Z, [0, 0, 0], 10), want: ['ellipse'] },
    { name: 'plane ⟂ cone → 圆', a: PL(Z, [0, 0, 12]), b: CO(Z, [0, 0, 0], 30), want: ['circle'] },
    { name: 'plane ∠ cone → 椭圆', a: PL(tilt20, [0, 0, 12]), b: CO(Z, [0, 0, 0], 30), want: ['ellipse'] },
    { name: 'plane ∧ sphere → 圆', a: PL(tilt20, [0, 0, 4]), b: SP([0, 0, 0], 9), want: ['circle'] },
    { name: 'plane ⟂ torus → 两个圆', a: PL(Z, [0, 0, 1]), b: TO(Z, [0, 0, 0], 20, 5), want: ['circle', 'circle'] },
    { name: 'plane ∋ axis torus → 两个圆', a: PL(X, [0, 0, 0]), b: TO(Z, [0, 0, 0], 20, 5), want: ['circle', 'circle'] },
    { name: '共轴 cyl ∧ cone → 圆', a: CY(Z, [0, 0, 0], 6), b: CO(Z, [0, 0, 0], 30), want: ['circle'] },
    { name: '共轴 cyl ∧ sphere → 两个圆', a: CY(Z, [0, 0, 0], 6), b: SP([0, 0, 2], 9), want: ['circle', 'circle'] },
    { name: '共轴 cyl ∧ torus → 两个圆', a: CY(Z, [0, 0, 0], 22), b: TO(Z, [0, 0, 0], 20, 5), want: ['circle', 'circle'] },
    { name: '共轴 cone ∧ sphere → 圆（★ 只可以係材料嗰葉）', a: CO(Z, [0, 0, 0], 30), b: SP([0, 0, 0], 9), want: ['circle'] },
    { name: 'sphere ∧ sphere → 圆', a: SP([0, 0, 0], 9), b: SP([0, 0, 8], 7), want: ['circle'] },
    { name: '★ 唔支援：歪柱 × 歪柱 → 空（唔可以乱返）', a: CY(Z, [0, 0, 0], 6), b: CY([1, 0, 0], [0, 0, 3], 5), want: [] },
    { name: '★ 唔支援：plane ∠ cone 出双曲线 → 空', a: PL([1, 0, 0.1], [0, 0, 12]), b: CO(Z, [0, 0, 0], 30), want: [] },
  ]
  for (const c of CASES) {
    const curves = intersectSurfaces(c.a, c.b)
    const kinds = curves.map((x) => x.kind)
    let worst = 0
    for (const cv of curves) {
      for (let i = 0; i < 16; i++) {
        const t = cv.kind === 'line' ? -20 + 40 * i / 15 : 2 * Math.PI * i / 16
        const p = curvePointAt(cv, t)
        worst = Math.max(worst, Math.abs(surfValue(c.a, p)), Math.abs(surfValue(c.b, p)))
      }
    }
    const kindOk = kinds.length === c.want.length && kinds.every((k, i) => k === c.want[i])
    ok(kindOk && (curves.length === 0 || worst < 1e-9), c.name,
      `得 [${kinds.join(',')}]${curves.length ? ' 最大隐函数残差 ' + worst.toExponential(2) + 'mm' : ''}`)
  }
}

// ═════════════════════════ 第一部分：M4 Tier-2 ═════════════════════════
console.log('\n' + '═'.repeat(100))
console.log('M4 —— Tier-2 解析边重建（非轴对齐件）')
console.log('═'.repeat(100))

const M4 = [
  { name: 'tilted_box_13deg', build: partTiltedBox, faces: 6, volTol: 5e-4, m3: 'solid' },
  { name: 'oblique_boss', build: partObliqueBoss, faces: 8, volTol: 5e-4, m3: 'shell' },
  { name: 'oblique_hole', build: partObliqueHole, faces: 7, volTol: 5e-4, m3: 'any' },
  // 密网格：证明结果【唔靠镶嵌密度】（网格点只做种子/分支揀选，几何全由解析参数出）
  { name: 'oblique_boss_dense', build: partObliqueBoss, faces: 8, volTol: 5e-4, m3: 'shell', tess: [0.01, 0.1] },
]
const rows = []

for (const p of M4) {
  console.log(`\n════ ${p.name} ════`)
  const shape = p.build()
  const truth = volOf(shape.wrapped)
  const mesh = tessellate(shape, ...(p.tess ?? [0.05, 0.25]))
  const seg = segmentAndFit({ v: mesh.v, t: mesh.t })
  const kinds = {}
  for (const r of seg.regions) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1
  console.log(`  truth ${truth.toFixed(4)}mm³ | mesh ${mesh.tris} tris (自身误差 ${pct(rel(mesh.meshVol, truth))}) | M1 ${seg.regions.length} 区 ${JSON.stringify(kinds)}`)

  const m3 = rebuild(seg, OC, {})
  const v3 = m3.shape ? volOf(m3.shape) : NaN
  console.log(`  M3（对照）: ${m3.tier} vol rel ${pct(rel(v3, truth))}`)

  const t0 = Date.now()
  const t2 = reconstructTier2(seg, OC, {})
  const ms = Date.now() - t0
  const v2 = t2.shape ? volOf(t2.shape) : NaN
  const st = t2.plan.stats
  console.log(`  M4 计划: ${t2.plan.faces.length} 面（组 ${st.groups}, 合并 ${st.coalesced}, 收编 ${st.absorbedRegions}）`
    + ` 曲线 ${st.lines}直/${st.circles}圆/${st.ellipses}椭/${st.seams}seam | 角点 ${st.corners}（最大残差 ${st.maxVertexResidual.toExponential(2)}mm）`)
  console.log(`  M4 结果: ${t2.tier} ${t2.shape ? stype(t2.shape) : '—'} faces=${t2.faceCount} vol=${Number.isFinite(v2) ? v2.toFixed(4) : 'n/a'} (${ms}ms)`)
  for (const r of t2.plan.reasons) console.log(`     ✖ ${r}`)
  for (const w of t2.warnings) console.log(`     ⚠ ${w}`)

  ok(t2.tier === 'solid', `${p.name} tier = solid`, `得 ${t2.tier}`)
  ok(t2.faceCount === p.faces, `${p.name} 面数 = ${p.faces}`, `得 ${t2.faceCount}`)
  ok(Number.isFinite(v2) && rel(v2, truth) < p.volTol, `${p.name} 体积 ≈ ${truth.toFixed(4)} (±${(p.volTol * 100).toFixed(2)}%)`,
    `得 ${Number.isFinite(v2) ? v2.toFixed(4) : 'n/a'} rel ${pct(rel(v2, truth))}（网格自身 ${pct(rel(mesh.meshVol, truth))}）`)
  ok(t2.valid === true, `${p.name} BRepCheck 有效`, String(t2.valid))
  ok(st.maxVertexResidual < 1e-6, `${p.name} 三面角点残差 < 1e-6mm`, st.maxVertexResidual.toExponential(2))
  if (t2.shape && t2.valid !== false) {
    let tri = -1
    try { tri = cast(t2.shape).mesh({ tolerance: 0.05, angularTolerance: 0.3 }).triangles.length / 3 } catch (e) { console.log('    mesh THROW', e?.message) }
    ok(tri > 0, `${p.name} 可镶嵌（worker 落场闸）`, `${tri} 三角`)
  }
  rows.push({
    part: p.name, tier: t2.tier, faces: t2.faceCount, want: p.faces, relErr: rel(v2, truth),
    meshErr: rel(mesh.meshVol, truth), dev: t2.deviation.max, valid: t2.valid, m3: m3.tier, m3Err: rel(v3, truth),
  })
}

// ═════════════════════════ 第二部分：M5 圆角 ═════════════════════════
console.log('\n' + '═'.repeat(100))
console.log('M5 —— 圆角识别 / 压平 / 重施')
console.log('═'.repeat(100))


const M5 = [
  {
    name: 'filleted_box', build: partFilletedBox, radii: [4],
    sharpVol: 40 * 30 * 20, sharpFaces: 6,
    analytic: 40 * 30 * 20 - (16 - Math.PI * 4) * 20,           // 竖边长 20，截面切掉 r²−πr²/4
  },
  {
    name: 'filleted_box_tilted', build: partFilletedBoxTilted, radii: [4, 2.5],
    sharpVol: 40 * 30 * 20, sharpFaces: 6,
    analytic: 40 * 30 * 20 - (16 - Math.PI * 4) * 20 - (6.25 - Math.PI * 6.25 / 4) * 20,
  },
]

for (const p of M5) {
  console.log(`\n════ ${p.name} (r=${p.radii.join(',')}) ════`)
  const filleted = p.build()
  const truthFillet = volOf(filleted.wrapped)
  console.log(`  fixture: 圆角实体 ${truthFillet.toFixed(4)}mm³（解析 ${p.analytic.toFixed(4)}）| 压平后应为 ${p.sharpVol}mm³`)
  ok(rel(truthFillet, p.analytic) < 1e-6, `${p.name} fixture 圆角体积 = 解析值`, `${truthFillet.toFixed(6)} vs ${p.analytic.toFixed(6)}`)

  const mesh = tessellate(filleted)
  const seg = segmentAndFit({ v: mesh.v, t: mesh.t })
  const kinds = {}
  for (const r of seg.regions) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1
  console.log(`  M1: ${mesh.tris} tris → ${seg.regions.length} 区 ${JSON.stringify(kinds)}`)
  for (const r of seg.regions) if (r.kind !== 'plane')
    console.log(`     区${r.index} ${r.kind} tri=${r.triCount} area=${r.area.toFixed(2)} arc=${(r.arcCoverageDeg ?? -1).toFixed(1)}° isBlend=${!!r.isBlend} blendR=${r.blendRadius?.toFixed(4)}`)

  const rec = recoverFillets(seg)
  console.log(`  M5 识别: 候选 ${rec.stats.candidates} / 接受 ${rec.stats.accepted} / 拒 ${rec.stats.rejected}`)
  for (const w of rec.warnings) console.log(`     ⚠ ${w}`)
  for (const s of rec.strips) {
    console.log(`     带 区${s.region} ${s.kind} r=${s.radius.toFixed(6)} arc=${s.arcDeg.toFixed(1)}° 支撑=[${s.supports}]`
      + ` 相切=${s.tangencyDeg.map((x) => x.toFixed(3) + '°').join('/')} 半径核对=${s.radiusCheck.map((x) => (x * 100).toFixed(4) + '%').join('/')}`
      + ` 利边=${s.sharpEdge ? s.sharpEdge.curve.kind + ' mid[' + s.sharpEdge.mid.map((x) => x.toFixed(3)) + ']' : '冇'}`)
  }
  ok(rec.strips.length === p.radii.length, `${p.name} 认到 ${p.radii.length} 条圆角带`, `得 ${rec.strips.length}`)
  const got = rec.strips.map((s) => s.radius).sort((a, b) => b - a)
  const want = p.radii.slice().sort((a, b) => b - a)
  for (let i = 0; i < Math.min(got.length, want.length); i++)
    ok(rel(got[i], want[i]) < 1e-3, `${p.name} 半径 ${i + 1} = ${want[i]} (±0.1%)`, `得 ${got[i].toFixed(6)} rel ${pct(rel(got[i], want[i]))}`)
  ok(rec.strips.every((s) => s.tangencyDeg[0] < 1 && s.tangencyDeg[1] < 1), `${p.name} 支撑面 G1 相切 (<1°)`,
    rec.strips.map((s) => s.tangencyDeg.map((x) => x.toFixed(4)).join('/')).join(' | '))
  ok(rec.strips.every((s) => s.sharpEdge && s.sharpEdge.curve.kind === 'line'), `${p.name} 压平后利边 = 直线`,
    rec.strips.map((s) => s.sharpEdge?.curve.kind ?? '冇').join('/'))

  // 压平重建 = 利边盒
  const sharp = reconstructTier2(seg, OC, { suppress: rec.suppress })
  const vSharp = sharp.shape ? volOf(sharp.shape) : NaN
  console.log(`  M5 压平重建: ${sharp.tier} faces=${sharp.faceCount} vol=${Number.isFinite(vSharp) ? vSharp.toFixed(4) : 'n/a'}`
    + ` 曲线 ${sharp.plan.stats.lines}直/${sharp.plan.stats.circles}圆/${sharp.plan.stats.ellipses}椭 角点 ${sharp.plan.stats.corners}`)
  for (const r of sharp.plan.reasons) console.log(`     ✖ ${r}`)
  for (const w of sharp.warnings) console.log(`     ⚠ ${w}`)
  ok(sharp.tier === 'solid', `${p.name} 压平 → solid`, sharp.tier)
  ok(sharp.faceCount === p.sharpFaces, `${p.name} 压平面数 = ${p.sharpFaces}（利边盒）`, String(sharp.faceCount))
  ok(Number.isFinite(vSharp) && rel(vSharp, p.sharpVol) < 5e-4, `${p.name} 压平体积 = ${p.sharpVol} (±0.05%)`,
    `得 ${Number.isFinite(vSharp) ? vSharp.toFixed(4) : 'n/a'} rel ${pct(rel(vSharp, p.sharpVol))}`)

  // 重施真圆角 feature（BRepFilletAPI_MakeFillet）
  if (sharp.shape) {
    const re = reapplyFillets(OC, sharp.shape, rec.strips)
    for (const w of re.warnings) console.log(`     ⚠ ${w}`)
    const vRe = re.shape ? volOf(re.shape) : NaN
    console.log(`  M5 重施: applied ${re.applied}/${re.requested} → vol ${Number.isFinite(vRe) ? vRe.toFixed(4) : 'n/a'}`)
    ok(re.applied === rec.strips.length, `${p.name} 重施：全部圆角揀到边`, `${re.applied}/${re.requested}`)
    ok(Number.isFinite(vRe) && rel(vRe, truthFillet) < 1e-3, `${p.name} 重施体积 ≈ 原圆角实体 (±0.1%)`,
      `得 ${Number.isFinite(vRe) ? vRe.toFixed(4) : 'n/a'} vs ${truthFillet.toFixed(4)} rel ${pct(rel(vRe, truthFillet))}`)
    rows.push({
      part: `${p.name}→sharp`, tier: sharp.tier, faces: sharp.faceCount, want: p.sharpFaces, relErr: rel(vSharp, p.sharpVol),
      meshErr: rel(mesh.meshVol, truthFillet), dev: sharp.deviation.max, valid: sharp.valid, m3: '—', m3Err: NaN,
    })
  }
}

// ═════════════════════════ 第三部分：M4 跑 golden 7（零回归 + 诚实退階）═════════════════════════
// 硬合约：M4 可以【declined】（上层照跑 M3，golden 7/7 唔受影响），但【一旦返 solid 就一定要準】。
console.log('\n' + '═'.repeat(100))
console.log('M4 × golden 7 —— 交叉核对（declined 系合法结果；solid 就必须準）')
console.log('═'.repeat(100))
{
  const gdir = fileURLToPath(new URL('./golden/', import.meta.url))
  const truth = JSON.parse(readFileSync(path.join(gdir, 'ground_truth.json'), 'utf8'))
  const gRows = []
  for (const [name, gt] of Object.entries(truth)) {
    const mesh = readBinarySTL(path.join(gdir, gt.file))
    const seg = segmentAndFit({ v: mesh.v, t: mesh.t })
    const t2 = reconstructTier2(seg, OC, {})
    const v = t2.shape ? volOf(t2.shape) : NaN
    const err = Number.isFinite(v) ? rel(v, gt.volumeMm3) : NaN
    gRows.push({ name, tier: t2.tier, faces: t2.faceCount, err, why: t2.plan.reasons[0] ?? '' })
    ok(t2.tier !== 'solid' || (Number.isFinite(err) && err < 5e-4), `golden ${name}: M4 返 solid 就必须準 (±0.05%)`,
      `${t2.tier}${t2.tier === 'solid' ? ' rel ' + pct(err) : ' — ' + (t2.plan.reasons[0] ?? '')}`)
  }
  console.log('\npart                 | M4 tier  | faces | vol rel-err    | 退階原因')
  console.log('-'.repeat(100))
  for (const r of gRows)
    console.log(`${r.name.padEnd(20)} | ${r.tier.padEnd(8)} | ${String(r.faces).padStart(5)} | ${(r.tier === 'solid' ? pct(r.err) : '—').padStart(14)} | ${r.why}`)
}

// ───────────────────────── 汇总表 ─────────────────────────
console.log('\n' + '═'.repeat(112))
console.log('part                 | M4 tier | faces      | volume rel-err | mesh rel-err   | max deviation | BRepCheck | M3 对照')
console.log('-'.repeat(112))
for (const r of rows) {
  console.log(
    `${r.part.padEnd(20)} | ${r.tier.padEnd(7)} | ${String(r.faces).padStart(3)}/${String(r.want).padEnd(6)} | `
    + `${pct(r.relErr).padStart(14)} | ${pct(r.meshErr).padStart(14)} | `
    + `${(Number.isFinite(r.dev) ? r.dev.toFixed(6) + ' mm' : 'n/a').padStart(13)} | `
    + `${(r.valid === true ? 'valid' : r.valid === false ? 'INVALID' : 'n/a').padEnd(9)} | ${r.m3}${Number.isFinite(r.m3Err) ? ' ' + pct(r.m3Err) : ''}`)
}
console.log('═'.repeat(112))
console.log(`\n${fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAIL'}`)
process.exit(fails === 0 ? 0 : 1)
