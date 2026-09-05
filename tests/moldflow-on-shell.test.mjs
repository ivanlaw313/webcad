// 全链路：方块→钻孔→正确抽壳→取真 OCCT mesh→跑 runMoldFlow。
// 验证模流喺【真薄壳件】上会唔会「冇结果/唔 run」（抛错 / 空 / solidRatio 闸）。
// 跑：npx -y tsx tests/moldflow-on-shell.test.mjs
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

// 方块 80×60×40 + 3 通孔 + 抽壳 2mm（默认顶面=真 bbox 顶 Z，同修复后 worker 一致）
let box = draw().movePointerTo([-40,-30]).lineTo([40,-30]).lineTo([40,30]).lineTo([-40,30]).close().sketchOnPlane('XY').extrude(40)
for (const [cx,cy] of [[18,8],[-18,-8],[0,0]]) box = box.cut(drawCircle(5).translate(cx,cy).sketchOnPlane('XY').extrude(40))
const topZ = box.boundingBox.bounds[1][2]
const shell = box.shell(2, (ff) => ff.inPlane('XY', topZ))
const m = shell.mesh({ tolerance: 0.1, angularTolerance: 0.5 })
console.log(`薄壳 mesh：${m.vertices.length/3} 顶点 / ${m.triangles.length/3} 三角`)
ok(m.triangles.length >= 3, 'mesh 三角足够')

// worker mesh 系 CAD 坐标（draw 默认 XY 中心、extrude +Z），runMoldFlow 食 CAD mm。
const verts = Float32Array.from(m.vertices)
const tris = Uint32Array.from(m.triangles)

// 多个浇口位 × 分辨率，逐个跑，记低有冇抛错 / 空结果
const gates = {
  '底面中心': [0, 0, 1],
  '侧壁外': [0, -30, 20],
  '顶边角': [38, 28, 39],
}
for (const res of [20, 28, 40]) {
  for (const [name, g] of Object.entries(gates)) {
    let r = null, err = null
    try { r = runMoldFlow({ vertices: verts, triangles: tris, gates: [g], material: 'ABS', resolution: res, solver: false }) }
    catch (e) { err = e?.message || String(e) }
    if (err) { console.log(`  ✗ res${res} 浇口@${name}: 抛错 → ${err}`); fail++; continue }
    const good = r && r.nVox > 0 && Number.isFinite(r.tCool) && r.tCool > 0
    console.log(`  ${good?'✓':'✗'} res${res} 浇口@${name}: nVox=${r.nVox} solidRatio=${r.solidRatio.toFixed(3)} wallMed=${r.wallMedian.toFixed(1)} moldable=${r.moldable} tCool=${r.tCool.toFixed(1)}s`)
    if (good) pass++; else fail++
  }
}

console.log(`\n${fail === 0 ? '✅' : '❌'} 模流@薄壳全链路 (${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
