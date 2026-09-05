// 模流薄壁/厚件适用性分类回归测试
// 跑：npx -y tsx tests/moldflow-thinwall.test.mjs
import { runMoldFlow } from '../src/analysis/moldflow.ts'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

function box(min, max, out = true) {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  const v = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0, x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1]
  let f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [3, 7, 6], [3, 6, 2], [0, 4, 7], [0, 7, 3], [1, 2, 6], [1, 6, 5]]
  if (!out) f = f.map(([a, b, c]) => [a, c, b])
  return { v, f }
}
function merge(...parts) {
  const verts = [], tris = []
  for (const p of parts) { const base = verts.length / 3; for (const x of p.v) verts.push(x); for (const [a, b, c] of p.f) tris.push(base + a, base + b, base + c) }
  return { vertices: Float32Array.from(verts), triangles: Uint32Array.from(tris) }
}
const mesh = (m) => ({ vertices: m.vertices, triangles: m.triangles })

const solid = mesh(merge(box([0, 0, 0], [80, 40, 40])))
const shell = mesh(merge(box([0, 0, 0], [80, 40, 40], true), box([3, 3, 3], [77, 37, 37], false))) // 3mm 壁

const gate = [40, 0, 20]
const opt = { gates: [gate], material: 'ABS', resolution: 28 }

console.log('实心方块 → solid + 忠告：')
const rS = runMoldFlow({ ...solid, ...opt })
ok(rS.moldable === 'solid', `moldable='solid'（实得 '${rS.moldable}'）`)
ok(rS.wallMedian > 6, `中位壁厚 ${rS.wallMedian.toFixed(1)}mm > 6mm`)
ok(rS.wallMax > 20, `最厚 ${rS.wallMax.toFixed(1)}mm`)
ok(rS.warnings.length > 0 && rS.warnings[0].includes('抽壳'), '首条 warning 含「抽壳」建议')
ok(Number.isFinite(rS.tCool) && rS.tCool > 0, `tCool 有限 ${rS.tCool.toFixed(0)}s`)

console.log('薄壳箱（3mm 壁）→ ok，无误报：')
const rT = runMoldFlow({ ...shell, ...opt })
ok(rT.moldable === 'ok', `moldable='ok'（实得 '${rT.moldable}'）`)
ok(rT.wallMedian <= 6, `中位壁厚 ${rT.wallMedian.toFixed(1)}mm ≤ 6mm`)
ok(rT.tCool < 60, `tCool ${rT.tCool.toFixed(1)}s < 60s（薄壁快冷，唔会爆）`)
ok(!rT.warnings.some(w => w.includes('抽壳')), '无「抽壳」误报')

console.log(`\n${fail === 0 ? '✅' : '❌'} 薄壁/厚件分类 (${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
