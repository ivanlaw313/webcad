// 模流诊断 probe — 实心方块 vs 薄壳箱，solver on/off，计时 + 数值合理性
// 跑：npx -y tsx tests/moldflow-probe.mjs
import { runMoldFlow } from '../src/analysis/moldflow.ts'

// box mesh：min/max 角，outward(out=true) / inward(out=false) 法向
function box(min, max, out = true) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  const v = [
    x0, y0, z0,  x1, y0, z0,  x1, y1, z0,  x0, y1, z0,
    x0, y0, z1,  x1, y0, z1,  x1, y1, z1,  x0, y1, z1,
  ]
  // 6 面 ×2 三角，CCW outward
  let f = [
    [0, 2, 1], [0, 3, 2], // -z
    [4, 5, 6], [4, 6, 7], // +z
    [0, 1, 5], [0, 5, 4], // -y
    [3, 7, 6], [3, 6, 2], // +y
    [0, 4, 7], [0, 7, 3], // -x
    [1, 2, 6], [1, 6, 5], // +x
  ]
  if (!out) f = f.map(([a, b, c]) => [a, c, b]) // 翻转 winding → inward
  return { v, f }
}

function merge(...parts) {
  const verts = [], tris = []
  for (const p of parts) {
    const base = verts.length / 3
    for (const x of p.v) verts.push(x)
    for (const [a, b, c] of p.f) tris.push(base + a, base + b, base + c)
  }
  return { vertices: Float32Array.from(verts), triangles: Uint32Array.from(tris) }
}

const solidBox = (() => { const b = box([0, 0, 0], [80, 40, 40]); return merge(b) })()
// 薄壳箱：外 80×40×40，内腔 74×34×34（3mm 壁，封闭中空）
const shellBox = (() => {
  const outer = box([0, 0, 0], [80, 40, 40], true)
  const inner = box([3, 3, 3], [77, 37, 37], false) // 反向 → 中空
  return merge(outer, inner)
})()

const gate = [40, 0, 20] // 右/前面中点附近

function run(name, mesh, solver, res = 28) {
  const t0 = Date.now()
  let r, err = null
  try {
    r = runMoldFlow({ vertices: mesh.vertices, triangles: mesh.triangles, gates: [gate], material: 'ABS', resolution: res, solver })
  } catch (e) { err = e?.message || String(e) }
  const ms = Date.now() - t0
  if (err) { console.log(`  ✗ ${name} [solver=${solver}] THREW (${ms}ms): ${err}`); return }
  const finite = (x) => Number.isFinite(x)
  const ok = finite(r.tFill) && finite(r.tCool) && finite(r.cycle) && r.tCool >= 0
  console.log(`  ${ok ? '✓' : '✗'} ${name} [solver=${solver}] ${ms}ms · nVox=${r.nVox} · h=${r.h.toFixed(2)}mm`)
  console.log(`      tFill=${r.tFill.toFixed(2)}s  tCool=${r.tCool.toFixed(1)}s  cycle=${r.cycle.toFixed(1)}s  pPeakMPa=${r.pPeakMPa.toFixed(1)}  clampkN=${r.clampForceKN.toFixed(0)}`)
  console.log(`      wallMedian=${r.wallMedian.toFixed(1)}mm  wallMax=${r.wallMax.toFixed(1)}mm  moldable=${r.moldable}`)
  if (r.moldable !== 'ok') console.log(`      忠告: ${r.warnings[0].slice(0, 70)}…`)
}

console.log('实心方块 80×40×40（最厚壁≈40mm — 注塑唔会咁整）：')
run('solid', solidBox, false)
run('solid', solidBox, true)
console.log('薄壳箱 3mm 壁（注塑典型）：')
run('shell', shellBox, false)
run('shell', shellBox, true)
console.log('薄壳箱 res=40（接近用户 中=28，加大睇 solver 慢几多）：')
run('shell', shellBox, true, 40)
