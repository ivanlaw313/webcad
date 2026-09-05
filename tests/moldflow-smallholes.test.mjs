// moldflow-smallholes.test.mjs — 验证「模流细孔解析」修复
// 跑: npx -y tsx tests/moldflow-smallholes.test.mjs
//
// 修复内容:
//   Fix#1 voxelize() 旧版内部 clampResolution 硬封 res=64 → UI 256 滑杆形同虚设、细孔 carve 唔到。
//          加 maxRes 参数(default 64=FEA 字节兼容),moldflow 传 256 → 高分辨率真生效。
//   Fix#2 表面体素回收会填实孔 rim 封死细孔 → 改成只喺 parity 未解析壁厚(medHalf<0.65h)时先跑,
//          res 够细即跳过 → 细孔按 parity z-列奇偶干净保留。
import { voxelize } from '../src/analysis/voxelfea.ts'
import { runMoldFlow } from '../src/analysis/moldflow.ts'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m) } else { fail++; console.log('  ✗ ' + m) } }

// ---- 带【一个方形通孔】嘅水密薄板 mesh ----
// 板 [0,W]×[0,H]×[0,T]，孔 [a,b]×[c,d] 贯穿 Z。
// voxelize 用 z-列奇偶(唔理 winding,只数竖直射线交点)：物料列命中顶/底「画框」三角 2 次→填；
// 孔内列命中 0 次(画框喺孔外、侧壁竖直 xy 投影退化)→ void。侧壁三角仍加(俾表面回收扫=孔 rim)。
function plateWithSquareHole(W, H, T, a, b, c, d) {
  const v = [], f = []
  const vid = (x, y, z) => { v.push(x, y, z); return v.length / 3 - 1 }
  // 8 外角 + 8 内角
  const O = [vid(0,0,0), vid(W,0,0), vid(W,H,0), vid(0,H,0), vid(0,0,T), vid(W,0,T), vid(W,H,T), vid(0,H,T)]
  const I = [vid(a,c,0), vid(b,c,0), vid(b,d,0), vid(a,d,0), vid(a,c,T), vid(b,c,T), vid(b,d,T), vid(a,d,T)]
  const quad = (p, q, r, s) => { f.push([p, q, r], [p, r, s]) }   // winding 唔影响 voxelize
  // 画框(annulus) z=0 底 + z=T 顶：4 梯形 tile 满整个框
  for (const o of [0, 4]) {   // o=0 用外底/内底角，o=4 用外顶/内顶角
    quad(O[o+0], O[o+1], I[o+1], I[o+0])   // 南
    quad(O[o+1], O[o+2], I[o+2], I[o+1])   // 东
    quad(O[o+2], O[o+3], I[o+3], I[o+2])   // 北
    quad(O[o+3], O[o+0], I[o+0], I[o+3])   // 西
  }
  // 外侧壁 4(竖直 → voxelize 当退化跳过,但俾回收扫=外 rim)
  quad(O[0],O[1],O[5],O[4]); quad(O[1],O[2],O[6],O[5]); quad(O[2],O[3],O[7],O[6]); quad(O[3],O[0],O[4],O[7])
  // 内侧壁(孔壁)4 —— 表面回收会扫到 = 孔 rim(旧版填实封孔嘅元凶)
  quad(I[0],I[1],I[5],I[4]); quad(I[1],I[2],I[6],I[5]); quad(I[2],I[3],I[7],I[6]); quad(I[3],I[0],I[4],I[7])
  return { vertices: Float32Array.from(v), triangles: Uint32Array.from(f.flat()) }
}

// 纯实心板(同尺寸,无孔)做对照
function solidPlate(W, H, T) {
  const v = [0,0,0, W,0,0, W,H,0, 0,H,0, 0,0,T, W,0,T, W,H,T, 0,H,T]
  const f = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]]
  return { vertices: Float32Array.from(v), triangles: Uint32Array.from(f.flat()) }
}

// 孔区域体素计数(center 落喺孔 xy 矩形 + z∈[0,T] 内)
function holeVox(grid, a, b, c, d, T) {
  const { nx, ny, nz, ox, oy, oz, h, solid } = grid
  let n = 0
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!solid[i + nx * (j + ny * k)]) continue
    const cx = ox + (i + 0.5) * h, cy = oy + (j + 0.5) * h, cz = oz + (k + 0.5) * h
    if (cx > a && cx < b && cy > c && cy < d && cz > 0 && cz < T) n++
  }
  return n
}

const W = 60, H = 40, T = 3
const a = 26, b = 34, c = 17, d = 23   // 8×6mm 方孔(细,中心区)
const holey = plateWithSquareHole(W, H, T, a, b, c, d)
const solidM = solidPlate(W, H, T)

console.log('A. 分辨率解封(core fix)：voxelize 唔再硬封 64')
const gLo = voxelize(solidM.vertices, solidM.triangles, 200, undefined, 64)   // 显式 maxRes=64(=FEA 旧行为)
const gHi = voxelize(solidM.vertices, solidM.triangles, 200, undefined, 256)  // 模流 maxRes=256
ok(gLo.nx <= 64, `maxRes=64(FEA 默认): nx=${gLo.nx} ≤ 64(字节兼容,无回归)`)
ok(gHi.nx > 150, `maxRes=256(模流): res=200 真生效 nx=${gHi.nx} > 150`)
const gDefault = voxelize(solidM.vertices, solidM.triangles, 200)             // 唔传 maxRes → 默认 64
ok(gDefault.nx <= 64, `voxelize 唔传 maxRes → 默认封 64 (nx=${gDefault.nx}) — FEA caller 不受影响`)

console.log('\nB. 高分辨率 voxelize：方孔被 carve(孔区 ≈ 空)')
const ghHi = voxelize(holey.vertices, holey.triangles, 200, undefined, 256)
const hvHi = holeVox(ghHi, a, b, c, d, T)
const ghTot = ghHi.nVox
ok(hvHi <= ghTot * 0.01, `孔区体素 ${hvHi} ≪ 全板 ${ghTot}(孔已 carve 成 void)`)
// 对照:同 res 实心板,孔区位置应【满】(证明个测试位真係板面、唔係偶然空)
const gsHi = voxelize(solidM.vertices, solidM.triangles, 200, undefined, 256)
const svHi = holeVox(gsHi, a, b, c, d, T)
ok(svHi > 20, `实心板同区域 ${svHi} 体素(满) → 孔板该区 ${hvHi} = 真係孔,唔係取样偏差`)

console.log('\nC. runMoldFlow 端到端：res 生效 + 孔保留')
const optLo = { ...holey, gates: [[1, 20, 1.5]], material: 'ABS', resolution: 28 }
const optHi = { ...holey, gates: [[1, 20, 1.5]], material: 'ABS', resolution: 160 }
const rLo = runMoldFlow(optLo)
const rHi = runMoldFlow(optHi)
ok(rHi.nVox > rLo.nVox * 3, `高 res nVox ${rHi.nVox} ≫ 低 res ${rLo.nVox}(×${(rHi.nVox / Math.max(1, rLo.nVox)).toFixed(1)}) → 解封生效`)
// 高 res 结果嘅 centers 应避开孔
let cInHole = 0
for (let e = 0; e < rHi.nVox; e++) {
  const cx = rHi.centers[e * 3], cy = rHi.centers[e * 3 + 1], cz = rHi.centers[e * 3 + 2]
  if (cx > a && cx < b && cy > c && cy < d && cz > 0 && cz < T) cInHole++
}
ok(cInHole <= rHi.nVox * 0.01, `高 res 模流 centers 落孔内 ${cInHole} ≈ 0(细孔保留,熔体绕流)`)
console.log(`     (低 res warnings 含回收提示: ${rLo.warnings.some(w => w.includes('表面体素回收')) ? 'Y' : 'N'}; 高 res 跳过回收: ${!rHi.warnings.some(w => w.includes('表面体素回收')) ? 'Y' : 'N'})`)

console.log('\nD. 厚件预算守卫：方块高 res 唔爆(回退 + warning)')
const cube = solidPlate(100, 100, 100)
const rCube = runMoldFlow({ ...cube, gates: [[1, 50, 50]], material: 'ABS', resolution: 256 })
ok(rCube.nVox > 0 && Number.isFinite(rCube.tCool), `100³ 方块 res256 → 完成 nVox=${rCube.nVox}(预算回退,无爆内存)`)

console.log(`\n${fail === 0 ? '✅' : '❌'} 模流细孔解析 (${pass} pass / ${fail} fail)`)
if (fail > 0) process.exit(1)
