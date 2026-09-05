// 大而薄纯壳（最坏情况，似用户截图大盒）— 揾「load 一阵就冇嘢」根因：抛错 / 大量未连通。
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

function rect(w,d){ return draw().movePointerTo([-w/2,-d/2]).lineTo([w/2,-d/2]).lineTo([w/2,d/2]).lineTo([-w/2,d/2]).close() }

for (const [L,W,H,wall] of [[140,62,42,2],[120,55,38,2.5],[160,70,45,2]]) {
  let box = rect(L,W).sketchOnPlane('XY').extrude(H)
  box = box.cut(drawCircle(11).translate(-L*0.28,0).sketchOnPlane('XY').extrude(H))
  box = box.cut(drawCircle(8).translate(L*0.28,6).sketchOnPlane('XY').extrude(H))
  const topZ = box.boundingBox.bounds[1][2]
  let shell; try { shell = box.shell(wall,(ff)=>ff.inPlane('XY',topZ)) } catch(e){ console.log(`${L}×${W}×${H} 壁${wall}: 抽壳抛错 ${e?.message}`); continue }
  const m = shell.mesh({ tolerance:0.1, angularTolerance:0.5 })
  const verts=Float32Array.from(m.vertices), tris=Uint32Array.from(m.triangles)
  console.log(`\n盒 ${L}×${W}×${H} 壁${wall}mm（${verts.length/3}顶点）浇口右壁 [${(L/2).toFixed(0)},0,${(H/2).toFixed(0)}]`)
  const gate=[L/2,0,H/2]
  for (const res of [20,28,40]) {
    for (const solver of [false,true]) {
      const t0=Date.now(); let r=null,err=null
      try { r=runMoldFlow({vertices:verts,triangles:tris,gates:[gate],material:'ABS',resolution:res,solver}) } catch(e){ err=e?.message||String(e) }
      const ms=Date.now()-t0
      if (err){ console.log(`  ✗ res${res} solver=${solver?1:0} (${ms}ms) 抛错→ ${err}`); continue }
      // 数未连通（fill==tFill 即未到）
      let unreached=0; for(let i=0;i<r.fill.length;i++) if(r.fill[i]>=r.tFill-1e-9) unreached++
      const pctU=(100*unreached/r.nVox).toFixed(0)
      console.log(`  ${pctU>50?'⚠':' '} res${res} solver=${solver?1:0} (${ms}ms) nVox=${r.nVox} solid=${r.solidRatio.toFixed(3)} 未连通=${pctU}% moldable=${r.moldable}`)
    }
  }
}
