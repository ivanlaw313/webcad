// =====================================================================================
// facefea-select.test.mjs — 数值校验 faceFeaSelect（拣咗嘅 B-rep 面 → voxelfea 节点集合）
//
// 跑：  npx -y tsx tests/facefea-select.test.mjs
//
// 策略（杜绝「自圆其说」）：
//   * 体素网格直接 import voxelfea.ts 真嘅 voxelize() —— 与 runVoxelFea 用同一函数同一 solid[]，
//     所以「网格构造 / 节点编号是否对得上」唔系我自己复刻嘅，而系直接借真组件，bit-for-bit 一致。
//   * faceFeaSelect 内部复算 nodeId 嘅逻辑（实体角节点升序编号）镜 voxelfea L662-673。
//     本测试额外独立复算一次「x=xmax 平面上嘅角节点理论数」做交叉核对，唔靠 helper 自报。
//
// 用例：一个轴对齐立方体盒（水密三角网，12 三角 / 6 面），分辨率令 nx=ny=nz=N。
//   盒充满包围盒 → 全部 (N+1)³ 角节点都系实体角节点（每个角节点至少贴一实体体素）。
//   * +X 面（x=xmax 平面）应得 exactly (ny+1)*(nz+1) 个节点，且全部喺 x=xmax。
//   * 顶面（z=zmax 平面）应得 exactly (nx+1)*(ny+1) 个节点，且全部喺 z=zmax。
//   * 两者都唔可以含内部 / 对侧面节点。
// =====================================================================================

import { voxelize } from '../src/analysis/voxelfea.ts'
import { faceFeaSelect } from '../src/analysis/faceFeaSelect.ts'

let failures = 0
function assert(cond, msg) {
  if (cond) { console.log(`  PASS  ${msg}`) }
  else { console.log(`  FAIL  ${msg}`); failures++ }
}

// ---- 立方体盒网格（[x0,x1]×[y0,y1]×[z0,z1]），外向法向，水密 12 三角 ----
function boxMesh(x0, y0, z0, x1, y1, z1) {
  const v = [
    x0, y0, z0, // 0
    x1, y0, z0, // 1
    x1, y1, z0, // 2
    x0, y1, z0, // 3
    x0, y0, z1, // 4
    x1, y0, z1, // 5
    x1, y1, z1, // 6
    x0, y1, z1, // 7
  ]
  // CCW 外向（右手）。每面 2 三角。
  const t = [
    // -Z (bottom)
    0, 2, 1, 0, 3, 2,
    // +Z (top)
    4, 5, 6, 4, 6, 7,
    // -Y (front)
    0, 1, 5, 0, 5, 4,
    // +Y (back)
    3, 7, 6, 3, 6, 2,
    // -X (left)
    0, 4, 7, 0, 7, 3,
    // +X (right)
    1, 2, 6, 1, 6, 5,
  ]
  return { vertices: v, triangles: t }
}

// ---- 抽某个轴=极值平面嘅面三角（flat xyz，模拟 faceGroupTris 输出）----
// axis: 0=x,1=y,2=z；side:'max'|'min'。返回该面 2 三角嘅 18 个数。
function faceTrisOf(mesh, axis, side, lo, hi) {
  const v = mesh.vertices, t = mesh.triangles
  const target = side === 'max' ? hi : lo
  const out = []
  const eps = 1e-6
  const nt = t.length / 3
  for (let k = 0; k < nt; k++) {
    const i0 = t[3 * k] * 3, i1 = t[3 * k + 1] * 3, i2 = t[3 * k + 2] * 3
    const c0 = v[i0 + axis], c1 = v[i1 + axis], c2 = v[i2 + axis]
    if (Math.abs(c0 - target) < eps && Math.abs(c1 - target) < eps && Math.abs(c2 - target) < eps) {
      out.push(v[i0], v[i0 + 1], v[i0 + 2], v[i1], v[i1 + 1], v[i1 + 2], v[i2], v[i2 + 1], v[i2 + 2])
    }
  }
  return out
}

console.log('=== faceFeaSelect 数值校验 ===\n')

// 立方体盒：边长 30，原点偏移 (5, -3, 2)（验证 origin 非零都对得上）
const x0 = 5, y0 = -3, z0 = 2, x1 = 35, y1 = 27, z1 = 32
const mesh = boxMesh(x0, y0, z0, x1, y1, z1)

// 分辨率：longest=30，res=6 → h=5 → nx=ny=nz=6
const res = 6
const grid = voxelize(mesh.vertices, mesh.triangles, res)
console.log(`体素网格：h=${grid.h}  nx=${grid.nx} ny=${grid.ny} nz=${grid.nz}  origin=(${grid.ox},${grid.oy},${grid.oz})  nVox=${grid.nVox}`)
console.log(`节点网格：nnx=${grid.nx + 1} nny=${grid.ny + 1} nnz=${grid.nz + 1}\n`)

assert(grid.h === 5, `h === 5 (实际 ${grid.h})`)
assert(grid.nx === 6 && grid.ny === 6 && grid.nz === 6, `nx=ny=nz=6 (实际 ${grid.nx},${grid.ny},${grid.nz})`)
assert(grid.nVox === 6 * 6 * 6, `实心盒 nVox === 216 (实际 ${grid.nVox})`)

const nnx = grid.nx + 1, nny = grid.ny + 1, nnz = grid.nz + 1

// 实心盒 → 全部 (N+1)³ 角节点都有 DOF。核对 helper 自报 nNodesTotal。
const expectTotalNodes = nnx * nny * nnz

// =========================== 用例 1：+X 面（x=xmax 平面） ===========================
console.log('--- 用例 1：+X 面 (x=xmax) ---')
const triPlusX = faceTrisOf(mesh, 0, 'max', x0, x1)
assert(triPlusX.length === 18, `+X 面抽到 2 三角 (${triPlusX.length / 9} 三角)`)
const rPlusX = faceFeaSelect({ faceTris: triPlusX, grid })
assert(rPlusX.ok, `+X 选择 ok=true${rPlusX.ok ? '' : '：' + rPlusX.error}`)
assert(rPlusX.nNodesTotal === expectTotalNodes, `全体节点数 === (nx+1)(ny+1)(nz+1) = ${expectTotalNodes} (实际 ${rPlusX.nNodesTotal})`)

const expectPlusX = nny * nnz   // x 固定，y/z 自由
console.log(`  期望 +X 面节点数 = (ny+1)*(nz+1) = ${nny}*${nnz} = ${expectPlusX}`)
console.log(`  实际 +X 面节点数 = ${rPlusX.nNodes}`)
assert(rPlusX.nNodes === expectPlusX, `+X 面节点数 期望 ${expectPlusX} === 实际 ${rPlusX.nNodes}`)

// 几何核对：选中节点必须全部喺 x=xmax 平面（= ox + nx*h）
{
  const xmaxGridNode = grid.ox + grid.nx * grid.h
  // 复算 nodeId → nodeGrid（同 helper / voxelfea 同款），反查每个选中节点坐标验 x。
  const nodeIdArr = new Int32Array(nnx * nny * nnz).fill(-1)
  for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    if (!grid.solid[i + grid.nx * (j + grid.ny * k)]) continue
    for (let az = 0; az <= 1; az++) for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) {
      nodeIdArr[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
    }
  }
  let cnt = 0
  for (let g = 0; g < nodeIdArr.length; g++) if (nodeIdArr[g] === 0) nodeIdArr[g] = cnt++
  const nodeGrid = new Int32Array(cnt)
  for (let g = 0; g < nodeIdArr.length; g++) { const c = nodeIdArr[g]; if (c >= 0) nodeGrid[c] = g }

  let allOnXmax = true, anyInterior = false
  for (const cId of rPlusX.nodes) {
    const g = nodeGrid[cId]
    const ix = g % nnx
    const px = grid.ox + ix * grid.h
    if (Math.abs(px - xmaxGridNode) > 1e-9) allOnXmax = false
    if (ix !== grid.nx) anyInterior = true   // 唔喺最外 x 层 → 内部/对侧
  }
  assert(allOnXmax, `+X 选中节点全部喺 x=xmax 平面 (${xmaxGridNode})`)
  assert(!anyInterior, `+X 选中节点无一个喺内部/对侧 (ix 全 === nx=${grid.nx})`)
}

// 面积 / 法向核对（pressure→force 用）
{
  const expectArea = (y1 - y0) * (z1 - z0)   // 30×30 = 900
  console.log(`  +X 面面积 期望 ${expectArea}  实际 ${rPlusX.area.toFixed(3)}`)
  assert(Math.abs(rPlusX.area - expectArea) < 1e-6, `+X 面面积 === ${expectArea}`)
  assert(Math.abs(rPlusX.normal[0] - 1) < 1e-9 && Math.abs(rPlusX.normal[1]) < 1e-9 && Math.abs(rPlusX.normal[2]) < 1e-9,
    `+X 面外向法向 === [1,0,0] (实际 [${rPlusX.normal.map((x) => x.toFixed(3)).join(',')}])`)
}

// =========================== 用例 2：顶面（z=zmax 平面） ===========================
console.log('\n--- 用例 2：顶面 (z=zmax) ---')
const triTop = faceTrisOf(mesh, 2, 'max', z0, z1)
assert(triTop.length === 18, `顶面抽到 2 三角 (${triTop.length / 9} 三角)`)
const rTop = faceFeaSelect({ faceTris: triTop, grid })
assert(rTop.ok, `顶面选择 ok=true${rTop.ok ? '' : '：' + rTop.error}`)

const expectTop = nnx * nny   // z 固定，x/y 自由
console.log(`  期望 顶面节点数 = (nx+1)*(ny+1) = ${nnx}*${nny} = ${expectTop}`)
console.log(`  实际 顶面节点数 = ${rTop.nNodes}`)
assert(rTop.nNodes === expectTop, `顶面节点数 期望 ${expectTop} === 实际 ${rTop.nNodes}`)

{
  const zmaxGridNode = grid.oz + grid.nz * grid.h
  const nodeIdArr = new Int32Array(nnx * nny * nnz).fill(-1)
  for (let k = 0; k < grid.nz; k++) for (let j = 0; j < grid.ny; j++) for (let i = 0; i < grid.nx; i++) {
    if (!grid.solid[i + grid.nx * (j + grid.ny * k)]) continue
    for (let az = 0; az <= 1; az++) for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) {
      nodeIdArr[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
    }
  }
  let cnt = 0
  for (let g = 0; g < nodeIdArr.length; g++) if (nodeIdArr[g] === 0) nodeIdArr[g] = cnt++
  const nodeGrid = new Int32Array(cnt)
  for (let g = 0; g < nodeIdArr.length; g++) { const c = nodeIdArr[g]; if (c >= 0) nodeGrid[c] = g }

  let allOnZmax = true, anyInterior = false
  for (const cId of rTop.nodes) {
    const g = nodeGrid[cId]
    const iz = (g / (nnx * nny)) | 0
    const pz = grid.oz + iz * grid.h
    if (Math.abs(pz - zmaxGridNode) > 1e-9) allOnZmax = false
    if (iz !== grid.nz) anyInterior = true
  }
  assert(allOnZmax, `顶面选中节点全部喺 z=zmax 平面 (${zmaxGridNode})`)
  assert(!anyInterior, `顶面选中节点无一个喺内部/对侧 (iz 全 === nz=${grid.nz})`)
}

{
  const expectArea = (x1 - x0) * (y1 - y0)   // 900
  console.log(`  顶面面积 期望 ${expectArea}  实际 ${rTop.area.toFixed(3)}`)
  assert(Math.abs(rTop.area - expectArea) < 1e-6, `顶面面积 === ${expectArea}`)
  assert(Math.abs(rTop.normal[2] - 1) < 1e-9 && Math.abs(rTop.normal[0]) < 1e-9 && Math.abs(rTop.normal[1]) < 1e-9,
    `顶面外向法向 === [0,0,1] (实际 [${rTop.normal.map((x) => x.toFixed(3)).join(',')}])`)
}

// =========================== 用例 3：交叉验证 — 两面无交集应只共一条边 ===========================
console.log('\n--- 用例 3：+X 与 顶面 共享节点 = 公共边 (z=zmax & x=xmax) ---')
{
  const setX = new Set(Array.from(rPlusX.nodes))
  let shared = 0
  for (const c of rTop.nodes) if (setX.has(c)) shared++
  const expectShared = nny   // x=xmax 且 z=zmax 嗰条边 → (ny+1) 个节点
  console.log(`  期望共享节点（公共边） = ny+1 = ${nny}  实际 ${shared}`)
  assert(shared === expectShared, `+X∩顶面 = 公共边 ${expectShared} 节点 (实际 ${shared})`)
}

console.log(`\n=== ${failures === 0 ? 'ALL PASS ✅' : failures + ' FAIL ❌'} ===`)
process.exit(failures === 0 ? 0 : 1)
