// mesh2brep-golden.mjs —— M3【端到端验收】：golden STL → M1 识别 → M3 重建 → 体积/面数/偏差对账
// 跑法（C:\ClaudeCode\webcad，一条命令）:
//     node --experimental-strip-types tests/mesh2brep-golden.mjs
//
// 管線：二进制 STL → segmentAndFit()（M1）→ rebuild()（M3）→ GProp 体积 / TopExp 面数 /
//      FitWrapper.DeviationSample 偏差 → 对 tests/golden/ground_truth.json 嘅【解析】体积。
// 重点：重建出嚟嘅解析实体应该【赢过网格自己】—— 网格系镶嵌近似（圆柱 0.07%、锥 0.44%），
//      解析实体应该系 ~0.000%。所以每行都印埋「网格自身误差」做对照。
//
// ⚠ 内核 = _occt-build/_rebuilt 暂存内核（有 FitWrapper），唔係生产 kernel。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, cast } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const wasmPath = fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url))
const OC = await opencascade({ locateFile: () => wasmPath })
setOC(OC)
const { segmentAndFit } = await import('../src/geom/primitiveFit.ts')
const { rebuild } = await import('../src/geom/brepRebuild.ts')

// ───────────────────────── 二进制 STL 读取（30 行内联）─────────────────────────
function readBinarySTL(file) {
  const buf = readFileSync(file)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const n = dv.getUint32(80, true)
  if (84 + n * 50 > buf.byteLength) throw new Error(`${file}: 唔係二进制 STL 或者截断咗`)
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
/** 网格自身体积（散度定理）—— 用嚟同解析值比，量度镶嵌误差。 */
function meshVolume(m) {
  let vol = 0
  for (let i = 0; i < m.t.length; i += 3) {
    const a = m.t[i] * 3, b = m.t[i + 1] * 3, c = m.t[i + 2] * 3
    vol += (m.v[a] * (m.v[b + 1] * m.v[c + 2] - m.v[b + 2] * m.v[c + 1])
      - m.v[a + 1] * (m.v[b] * m.v[c + 2] - m.v[b + 2] * m.v[c])
      + m.v[a + 2] * (m.v[b] * m.v[c + 1] - m.v[b + 1] * m.v[c])) / 6
  }
  return Math.abs(vol)
}

// ───────────────────────── 内核小工具 ─────────────────────────
const ST = { 0: 'COMPOUND', 1: 'COMPSOLID', 2: 'SOLID', 3: 'SHELL', 4: 'FACE', 5: 'WIRE', 6: 'EDGE', 7: 'VERTEX' }
const stype = (s) => { try { const v = s.ShapeType(); const n = (v && typeof v === 'object' && 'value' in v) ? v.value : v; return ST[n] ?? String(n) } catch { return 'err' } }
const volOf = (s) => { try { const g = new OC.GProp_GProps_1(); OC.BRepGProp.VolumeProperties_1(s, g, false, false, false); return Math.abs(g.Mass()) } catch { return NaN } }
const rel = (a, b) => Math.abs(a - b) / Math.abs(b)
const pct = (x) => (Number.isFinite(x) ? (x * 100).toFixed(5) + '%' : '  n/a  ')

let fails = 0
const ok = (cond, name, info = '') => { console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}${info ? ' :: ' + info : ''}`); if (!cond) fails++ }

const dir = fileURLToPath(new URL('./golden/', import.meta.url))
const truth = JSON.parse(readFileSync(path.join(dir, 'ground_truth.json'), 'utf8'))

// 期望：tier / B-rep 面数 / 体积相对容差
// ★ box_with_hole 嘅面数 = 7（6 平面 + 1 柱面），唔係 8 ——
//   ground_truth.json 写「plane count 7」係手民之误：50×40×20 盒开一个通孔，
//   盒本身 6 张平面（顶/底/4 墙），加 1 张孔柱面 = 7 张 B-rep 面。见报告。
const EXPECT = {
  box_40x30x20: { tier: 'solid', faces: 6, volTol: 1e-4 },
  cylinder_r10_h40: { tier: 'solid', faces: 3, volTol: 5e-4 },
  sphere_r15: { tier: 'solid', faces: 1, volTol: 5e-4 },
  cone_r12_h30: { tier: 'solid', faces: 2, volTol: 5e-4 },
  box_with_hole: { tier: 'solid', faces: 7, volTol: 5e-4, faceNote: 'ground_truth 写 7 平面 → 实为 6 平面 + 1 柱 = 7 张面' },
  lbracket: { tier: 'solid', faces: 8, volTol: 1e-4 },
  stepped_shaft: { tier: 'solid', faces: 7, volTol: 5e-4 },
}

const rows = []
for (const [name, gt] of Object.entries(truth)) {
  const exp = EXPECT[name]
  console.log(`\n════ ${name} (${gt.file}) ════`)
  const mesh = readBinarySTL(path.join(dir, gt.file))
  const mVol = meshVolume(mesh)

  const tSeg = Date.now()
  const seg = segmentAndFit({ v: mesh.v, t: mesh.t })
  const msSeg = Date.now() - tSeg
  const kinds = {}
  for (const r of seg.regions) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1
  console.log(`  M1: ${mesh.tris} 三角 → ${seg.regions.length} 区 ${JSON.stringify(kinds)} (${msSeg}ms)`)

  const tReb = Date.now()
  const res = rebuild(seg, OC, {})
  const msReb = Date.now() - tReb
  console.log(`  M3: 计划 ${res.plan.faces.length} 面（组 ${res.plan.stats.groups}, 合并 ${res.plan.stats.coalesced}, 收编 ${res.plan.stats.absorbed}, 圆环 ${res.plan.stats.circleLoops}, 整形环 ${res.plan.stats.rectifiedLoops}）→ ${res.tier} (${msReb}ms)`)
  for (const w of res.warnings) console.log(`     ⚠ ${w}`)

  const v = res.shape ? volOf(res.shape) : NaN
  const relErr = Number.isFinite(v) ? rel(v, gt.volumeMm3) : NaN
  rows.push({
    part: name, tier: res.tier, faces: res.faceCount, wantFaces: exp.faces,
    relErr, meshErr: rel(mVol, gt.volumeMm3), dev: res.deviation.max, valid: res.valid,
    shapeType: res.shape ? stype(res.shape) : '—',
  })

  ok(res.tier === exp.tier, `${name} tier = ${exp.tier}`, `得 ${res.tier}${res.shape ? ' (' + stype(res.shape) + ')' : ''}`)
  ok(res.faceCount === exp.faces, `${name} 面数 = ${exp.faces}`, `得 ${res.faceCount}${exp.faceNote ? ' — ' + exp.faceNote : ''}`)
  ok(Number.isFinite(relErr) && relErr < exp.volTol, `${name} 体积 ≈ ${gt.volumeMm3.toFixed(4)} (±${(exp.volTol * 100).toFixed(2)}%)`,
    `得 ${Number.isFinite(v) ? v.toFixed(4) : 'n/a'} (rel ${pct(relErr)}；网格自身 ${pct(rel(mVol, gt.volumeMm3))})`)
  if (res.valid === false) ok(false, `${name} BRepCheck 有效`, 'BRepCheck_Analyzer 报无效')
  ok(Number.isFinite(res.deviation.max), `${name} 偏差取样 (${res.deviation.samples} 点)`, `max ${res.deviation.max.toFixed(6)}mm mean ${res.deviation.mean.toFixed(6)}mm`)
  // 落场闸：worker 一定会 tessellate。烂 shape 喺呢步会触发【唔可 catch 嘅 wasm abort】
  // （cad.worker.ts:1901 记录嘅陷阱）—— 所以只喺 BRepCheck 唔係 false 时先试。
  if (res.shape && res.valid !== false) {
    let tri = -1
    try { const mm = cast(res.shape).mesh({ tolerance: 0.05, angularTolerance: 0.3 }); tri = mm.triangles.length / 3 } catch (e) { tri = -1; console.log('    mesh THROW', e?.message) }
    ok(tri > 0, `${name} 可镶嵌（worker 落场闸）`, `${tri} 三角`)
  }
}

// ───────────────────────── 汇总表 ─────────────────────────
console.log('\n' + '═'.repeat(96))
console.log('part                 | tier   | faces      | volume rel-err | mesh rel-err | max deviation | BRepCheck')
console.log('-'.repeat(96))
for (const r of rows) {
  console.log(
    `${r.part.padEnd(20)} | ${r.tier.padEnd(6)} | ${String(r.faces).padStart(3)}/${String(r.wantFaces).padEnd(6)} | `
    + `${pct(r.relErr).padStart(14)} | ${pct(r.meshErr).padStart(12)} | ${(Number.isFinite(r.dev) ? r.dev.toFixed(6) + ' mm' : 'n/a').padStart(13)} | `
    + `${r.valid === true ? 'valid' : r.valid === false ? 'INVALID' : 'n/a'}`)
}
console.log('═'.repeat(96))
console.log(`\n${fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAIL'}`)
process.exit(fails === 0 ? 0 : 1)
