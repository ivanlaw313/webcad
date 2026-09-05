// p5-buckling-probe2.mjs — 细化：给截面更多体素（缓解粗网格偏刚 + 截面整数化跳变）
import { runVoxelBuckling } from '../src/analysis/voxelfea.ts'

function column(a, L) {
  const h = a / 2
  const v = [-h,-h,0, h,-h,0, h,h,0, -h,h,0,  -h,-h,L, h,-h,L, h,h,L, -h,h,L]
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[2,3,7],[2,7,6],[1,2,6],[1,6,5],[3,0,4],[3,4,7]]
  return { vertices: Float32Array.from(v), triangles: Uint32Array.from(f.flat()) }
}
const E = 2000, nu = 0.3, F = 1000
const euler = (a, L, K) => (Math.PI**2)*E*((a**4)/12)/((K*L)**2)

console.log('=== P5 屈曲细化：截面体素数扫描（K=2 固定-自由）===')
console.log('(nAcross = 截面每边体素数 ≈ a/h；越大越接近 Euler)')
// 目标 nVox<12000。柱沿 Z，res 控制最长维 L。nAcross = a/h = a·res/L。
// 取 a/L 大一啲 → 同 res 下 nAcross 更多，但太粗短 Euler 失效。折衷 L/a≈8~10。
for (const [a, L, res] of [[10,80,48],[10,80,64],[12,96,64],[10,60,64],[14,84,64]]) {
  const m = column(a, L)
  const Pe = euler(a, L, 2)
  const t0 = Date.now()
  const r = runVoxelBuckling({
    vertices: m.vertices, triangles: m.triangles,
    fixed: { point:[0,0,0], normal:[0,0,1] },
    load:  { point:[0,0,L], normal:[0,0,1] },
    force: [0,0,-F], E, nu, resolution: res,
    cgTol: 1e-8, maxIter: 20000, bIter: 200, bTol: 1e-5,
  })
  const dt = ((Date.now()-t0)/1000).toFixed(1)
  if (!r.ok) { console.log(`a=${a} L=${L} res=${res}: FAIL ${r.error} (${dt}s)`); continue }
  const nAcross = a / r.h
  const rel = (r.Pcr - Pe)/Pe*100
  console.log(`a=${a} L=${L} L/a=${(L/a).toFixed(1)} res=${res} nVox=${r.nVox} h=${r.h.toFixed(3)} nAcross≈${nAcross.toFixed(1)}  Pcr=${r.Pcr.toFixed(1)}N Euler=${Pe.toFixed(1)}N rel=${rel>=0?'+':''}${rel.toFixed(1)}% ${r.converged?'conv':'NOCONV'} ${dt}s`)
}
