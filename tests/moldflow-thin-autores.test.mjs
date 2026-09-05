// 薄壁件自动加密回归：大而薄壳喺「中(28)」分辨率，旧版抛「占比<5%」（用户「load一阵冇嘢」），
// 修复后自动加密 → 出结果、未连通低。跑：npx -y tsx tests/moldflow-thin-autores.test.mjs
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import path from 'node:path'
globalThis.require = createRequire(import.meta.url)
globalThis.__dirname = path.dirname(fileURLToPath(import.meta.url))
const { setOC, draw, drawCircle } = await import('replicad')
const { default: opencascade } = await import('../src/kernel/replicad_plus.js')
const OC = await opencascade({ locateFile: () => fileURLToPath(new URL('../src/kernel/replicad_plus.wasm', import.meta.url)) })
setOC(OC)
const { runMoldFlow } = await import('../src/analysis/moldflow.ts')

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }
const rect = (w, d) => draw().movePointerTo([-w/2,-d/2]).lineTo([w/2,-d/2]).lineTo([w/2,d/2]).lineTo([-w/2,d/2]).close()

function thinShellMesh(L, W, H, wall) {
  let b = rect(L, W).sketchOnPlane('XY').extrude(H)
  b = b.cut(drawCircle(11).translate(-L*0.28, 0).sketchOnPlane('XY').extrude(H))
  b = b.cut(drawCircle(8).translate(L*0.28, 6).sketchOnPlane('XY').extrude(H))
  const s = b.shell(wall, (ff) => ff.inPlane('XY', b.boundingBox.bounds[1][2]))
  const m = s.mesh({ tolerance: 0.1, angularTolerance: 0.5 })
  return { vertices: Float32Array.from(m.vertices), triangles: Uint32Array.from(m.triangles) }
}

// 大而薄（旧版 res28 必抛「<5%」）
for (const [L, W, H, wall] of [[140, 62, 42, 2], [160, 70, 45, 2]]) {
  const mesh = thinShellMesh(L, W, H, wall)
  const gate = [L / 2, 0, H / 2]
  for (const solver of [false, true]) {
    let r = null, err = null
    try { r = runMoldFlow({ ...mesh, gates: [gate], material: 'ABS', resolution: 28, solver }) }
    catch (e) { err = e?.message || String(e) }
    if (err) { ok(false, `${L}×${W} 壁${wall} res28 solver=${solver?1:0}: 仍抛错 → ${err}`); continue }
    let unreached = 0; for (let i = 0; i < r.fill.length; i++) if (r.fill[i] >= r.tFill - 1e-9) unreached++
    const pctU = 100 * unreached / r.nVox
    const autoBumped = r.warnings.some(w => w.includes('自动加密'))
    ok(r.nVox > 0 && Number.isFinite(r.tCool) && pctU < 25 && autoBumped,
      `${L}×${W} 壁${wall} res28 solver=${solver?1:0}: nVox=${r.nVox} 未连通=${pctU.toFixed(0)}% 自动加密=${autoBumped} moldable=${r.moldable}`)
  }
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 薄壁自动加密 (${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
