// 复现用户：薄壳 + 凸台/管 + 压力求解器 ON。捉「load 零点几秒就冇嘢」嘅真抛错。
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

function rect(w, d) { return draw().movePointerTo([-w/2,-d/2]).lineTo([w/2,-d/2]).lineTo([w/2,d/2]).lineTo([-w/2,d/2]).close() }

// 似截图：扁长盒 120×55×38，抽壳 2.5mm 开顶，内部企几条竖管/柱（凸台）
let box = rect(120, 55).sketchOnPlane('XY').extrude(38)
// 几个通孔
for (const [cx,cy,r] of [[-35,0,11],[35,5,8]]) box = box.cut(drawCircle(r).translate(cx,cy).sketchOnPlane('XY').extrude(38))
const topZ = box.boundingBox.bounds[1][2]
let shell = box.shell(2.5, (ff)=>ff.inPlane('XY', topZ))
// 内部凸台（实心柱 + 空心管），企喺底
shell = shell.fuse(drawCircle(6).translate(0,-12).sketchOnPlane('XY').extrude(28))          // 实心柱
let tube = drawCircle(9).translate(10,12).sketchOnPlane('XY').extrude(30)
tube = tube.cut(drawCircle(6).translate(10,12).sketchOnPlane('XY').extrude(30))
shell = shell.fuse(tube)                                                                       // 空心管
const m = shell.mesh({ tolerance: 0.1, angularTolerance: 0.5 })
const verts = Float32Array.from(m.vertices), tris = Uint32Array.from(m.triangles)
console.log(`复杂薄壳件 mesh：${verts.length/3} 顶点 / ${tris.length/3} 三角`)

const gate = [60, 0, 19]  // 右侧壁外（似截图洋红点）
for (const res of [20, 28, 40]) {
  for (const solver of [false, true]) {
    const t0 = Date.now()
    let r=null, err=null
    try { r = runMoldFlow({ vertices: verts, triangles: tris, gates:[gate], material:'ABS', resolution: res, solver }) }
    catch(e){ err = e?.message || String(e) }
    const ms = Date.now()-t0
    if (err) { console.log(`  ✗ res${res} solver=${solver} (${ms}ms) 抛错 → ${err}`); continue }
    console.log(`  ✓ res${res} solver=${solver} (${ms}ms) nVox=${r.nVox} solidRatio=${r.solidRatio.toFixed(3)} moldable=${r.moldable} tCool=${r.tCool.toFixed(1)}s tFill=${r.tFill.toFixed(2)}s ${r.warnings.find(w=>w.includes('到唔到')||w.includes('孤岛'))||''}`)
  }
}
