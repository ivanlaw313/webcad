// =====================================================================================
// faceFeaSelect.ts — 「拾取嘅 B-rep 面」 → 「voxelfea 节点集合」嘅桥（FEA 载荷/约束按真面贴）
//
// 背景（Fusion 对标缺口）：今日 voxelfea 嘅载荷/约束系用「平面 + band 容差」拣节点
//   （PlanePick {point, normal}，节点喺 |（p−planePoint)·n| ≤ 0.6h 即入带）—— 系区域/平面拣，
//   唔系真 B-rep 面。问题：一个无限平面会扫中所有共面节点（包括对侧或其它共面特征），
//   而真 CAD 面系有界嘅 → 误拣。
//
// 本文件解决：俾一张面嘅三角（subset of bodyMesh，来自 faceGroupTris / faceGroup），
//   + voxelfea 嘅体素网格描述（origin/spacing/dims，必须同 voxelize() 一字不差），
//   返回属于该面嘅 voxel 节点索引（紧凑 nodeId，同 runVoxelFea 一致）。
//   呢个就系「拣咗嘅面」→「要加载/锁嘅 FEA 节点」嘅精确映射。
//
// ⚠ 全部自写，零 import，零依赖，纯 TypeScript，自包含。唔 import monolith。
//
// 网格 / 节点索引约定（必须同 voxelfea.ts 完全一致，否则节点对唔上）：
//   网格原点 (ox,oy,oz) = 包围盒最小角（voxelize: ox=minX 等）。
//   h = 体素边长。nx/ny/nz = 体素数。节点网格维度 nnx=nx+1, nny=ny+1, nnz=nz+1。
//   节点网格索引 g = ix + nnx*(iy + nny*iz)，节点 CAD 坐标 = (ox+ix*h, oy+iy*h, oz+iz*h)。
//   （见 voxelfea.ts runVoxelFea L659/L689-690。）
//
//   关键：runVoxelFea 嘅紧凑 nodeId 只俾「实体体素嘅角节点」分配 DOF（L662-673），
//   编号顺序 = 遍历 grid 索引 g 升序（0..nnx*nny*nnz-1）逐个递增。所以本文件必须用
//   同一套 solid[] + 同一遍历顺序复算 nodeId，先至同 voxelfea 嘅节点编号对得上。
//   → 故调用方必须传入 voxelize() 出嘅 solid[]（或等价描述）。
//
// 几何判定：节点「属于」该面 = 节点到该面任一三角形嘅距离 ≤ selectTol（默认 ~0.6h，
//   即半个体素左右，同 voxelfea 嘅 bandTol 量级一致）。用点-三角最近距离（含面内/边/角三种情况）。
//   有界 → 唔会扫中对侧共面节点（除非真喺该面 selectTol 内）。
// =====================================================================================

export interface VoxelGridDesc {
  h: number                   // 体素边长 mm
  nx: number; ny: number; nz: number   // 体素数（每轴）
  ox: number; oy: number; oz: number   // 网格原点 = 包围盒最小角
  solid: ArrayLike<number>    // nx*ny*nz，i + nx*(j + ny*k)；voxelize() 出嘅 solid（决定哪些角节点有 DOF）
}

export interface FaceFeaSelectInput {
  faceTris: ArrayLike<number>   // 该面三角 flat 顶点 xyz（来自 faceGroupTris：每 9 个数 = 1 三角）。
                                //   注：呢个系「面三角顶点直铺」格式（无索引），同 faceGroupTris 输出一致。
  grid: VoxelGridDesc
  selectTol?: number            // 节点-面距离阈值，默认 0.6*h（半体素带，对齐 voxelfea bandTol）
}

export interface FaceFeaSelectResult {
  ok: boolean
  error?: string
  nodes: Int32Array             // 属于该面嘅紧凑 nodeId 列表（同 runVoxelFea 编号；可直接拣 DOF cId*3+{0,1,2}）
  nNodes: number                // = nodes.length（方便）
  nNodesTotal: number           // 全体紧凑节点数（= runVoxelFea nDof/3），核对用
  area: number                  // 面面积 mm²（面三角面积和）→ 压力换力用
  normal: [number, number, number]   // 面外向单位法向（面积加权平均三角法向）→ pressure→force 方向
  centroid: [number, number, number] // 面三角面积加权质心（CAD mm）→ 兜底 PlanePick.point 用
}

// ------------------------------------------------------------------ 小工具

/** 点 P 到三角 (A,B,C) 嘅最近距离平方（含面内投影 + 三边 + 三角三种退化）。
 *  标准 Ericson《Real-Time Collision Detection》重心区域法（自实现，无复制）。 */
function pointTriDist2(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az
  const acx = cx - ax, acy = cy - ay, acz = cz - az
  const apx = px - ax, apy = py - ay, apz = pz - az
  const d1 = abx * apx + aby * apy + abz * apz
  const d2 = acx * apx + acy * apy + acz * apz
  if (d1 <= 0 && d2 <= 0) { // 角 A
    const dx = px - ax, dy = py - ay, dz = pz - az
    return dx * dx + dy * dy + dz * dz
  }
  const bpx = px - bx, bpy = py - by, bpz = pz - bz
  const d3 = abx * bpx + aby * bpy + abz * bpz
  const d4 = acx * bpx + acy * bpy + acz * bpz
  if (d3 >= 0 && d4 <= d3) { // 角 B
    const dx = px - bx, dy = py - by, dz = pz - bz
    return dx * dx + dy * dy + dz * dz
  }
  const vc = d1 * d4 - d3 * d2
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { // 边 AB
    const w = d1 / (d1 - d3)
    const qx = ax + w * abx, qy = ay + w * aby, qz = az + w * abz
    const dx = px - qx, dy = py - qy, dz = pz - qz
    return dx * dx + dy * dy + dz * dz
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz
  const d5 = abx * cpx + aby * cpy + abz * cpz
  const d6 = acx * cpx + acy * cpy + acz * cpz
  if (d6 >= 0 && d5 <= d6) { // 角 C
    const dx = px - cx, dy = py - cy, dz = pz - cz
    return dx * dx + dy * dy + dz * dz
  }
  const vb = d5 * d2 - d1 * d6
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { // 边 AC
    const w = d2 / (d2 - d6)
    const qx = ax + w * acx, qy = ay + w * acy, qz = az + w * acz
    const dx = px - qx, dy = py - qy, dz = pz - qz
    return dx * dx + dy * dy + dz * dz
  }
  const va = d3 * d6 - d5 * d4
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { // 边 BC
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6))
    const qx = bx + w * (cx - bx), qy = by + w * (cy - by), qz = bz + w * (cz - bz)
    const dx = px - qx, dy = py - qy, dz = pz - qz
    return dx * dx + dy * dy + dz * dz
  }
  // 面内：用重心坐标
  const denom = 1 / (va + vb + vc)
  const w = vb * denom, ww = vc * denom
  const qx = ax + abx * w + acx * ww, qy = ay + aby * w + acy * ww, qz = az + abz * w + acz * ww
  const dx = px - qx, dy = py - qy, dz = pz - qz
  return dx * dx + dy * dy + dz * dz
}

// ------------------------------------------------------------------ 主函数

/**
 * 把一张拣咗嘅 B-rep 面（其三角 faceTris）映射到 voxelfea 嘅节点集合。
 *
 * 算法：
 *   1. 复算 runVoxelFea 嘅紧凑 nodeId（用同一 solid[] + 同一遍历顺序），保证编号一致。
 *   2. 逐「实体角节点」算其 CAD 坐标 (ox+ix*h, oy+iy*h, oz+iz*h)。
 *   3. 用三角 AABB（+selectTol）粗筛 → 点-三角最近距离细判：节点到任一面三角 ≤ selectTol 即入选。
 *   4. 同时累加面面积、面积加权法向、面积加权质心（pressure→force / 兜底用）。
 *
 * 纯函数，唔 throw：退化/空输入返 { ok:false, error }。
 */
export function faceFeaSelect(inp: FaceFeaSelectInput): FaceFeaSelectResult {
  const fail = (error: string): FaceFeaSelectResult => ({
    ok: false, error, nodes: new Int32Array(0), nNodes: 0, nNodesTotal: 0,
    area: 0, normal: [0, 0, 0], centroid: [0, 0, 0],
  })
  if (!inp || !inp.grid || !inp.faceTris) return fail('空输入（缺 grid/faceTris）')
  const { h, nx, ny, nz, ox, oy, oz, solid } = inp.grid
  if (!(h > 0) || !Number.isFinite(h)) return fail('h 无效（需 > 0）')
  if (!(nx > 0 && ny > 0 && nz > 0)) return fail('nx/ny/nz 无效（需 > 0）')
  if (!solid || solid.length < nx * ny * nz) return fail('solid 长度同 nx*ny*nz 唔一致')
  const nTri = Math.floor(inp.faceTris.length / 9)
  if (nTri < 1) return fail('面三角不足（faceTris 需 ≥ 9 个数 = 1 三角）')

  // ---- 1. 复算紧凑 nodeId（镜 runVoxelFea L662-673：实体体素 8 角标记 → 升序编号）
  const nnx = nx + 1, nny = ny + 1, nnz = nz + 1
  const nodeId = new Int32Array(nnx * nny * nnz).fill(-1)
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!solid[i + nx * (j + ny * k)]) continue
    for (let az = 0; az <= 1; az++) for (let ay = 0; ay <= 1; ay++) for (let ax = 0; ax <= 1; ax++) {
      nodeId[(i + ax) + nnx * ((j + ay) + nny * (k + az))] = 0
    }
  }
  let nNodesTotal = 0
  // nodeGrid[cId] = grid 索引 g（反查节点坐标）。先数 nNodesTotal 再填。
  for (let g = 0; g < nodeId.length; g++) if (nodeId[g] === 0) nodeId[g] = nNodesTotal++
  if (nNodesTotal < 1) return fail('无实体角节点（solid 全空？）')
  const nodeGrid = new Int32Array(nNodesTotal)
  for (let g = 0; g < nodeId.length; g++) { const cId = nodeId[g]; if (cId >= 0) nodeGrid[cId] = g }

  // ---- 2. 面三角度量（面积、面积加权法向、质心）+ 总 AABB（粗筛节点用）
  const ft = inp.faceTris
  let area = 0
  let nAx = 0, nAy = 0, nAz = 0          // 面积加权法向（未归一）
  let cX = 0, cY = 0, cZ = 0             // 面积加权质心累加
  let fMinX = Infinity, fMinY = Infinity, fMinZ = Infinity
  let fMaxX = -Infinity, fMaxY = -Infinity, fMaxZ = -Infinity
  for (let t = 0; t < nTri; t++) {
    const o = t * 9
    const ax = ft[o], ay = ft[o + 1], az = ft[o + 2]
    const bx = ft[o + 3], by = ft[o + 4], bz = ft[o + 5]
    const cx = ft[o + 6], cy = ft[o + 7], cz = ft[o + 8]
    const ux = bx - ax, uy = by - ay, uz = bz - az
    const wx = cx - ax, wy = cy - ay, wz = cz - az
    const crx = uy * wz - uz * wy, cry = uz * wx - ux * wz, crz = ux * wy - uy * wx
    const tw2 = Math.hypot(crx, cry, crz)   // = 2 × 三角面积
    const ta = tw2 * 0.5
    area += ta
    // 面积加权法向（cr 长度本身 = 2A，故直接加 cr = 加 2A·n̂ → 面积加权）
    nAx += crx; nAy += cry; nAz += crz
    // 三角质心 × 面积
    const gx = (ax + bx + cx) / 3, gy = (ay + by + cy) / 3, gz = (az + bz + cz) / 3
    cX += gx * ta; cY += gy * ta; cZ += gz * ta
    if (ax < fMinX) fMinX = ax; if (ax > fMaxX) fMaxX = ax
    if (bx < fMinX) fMinX = bx; if (bx > fMaxX) fMaxX = bx
    if (cx < fMinX) fMinX = cx; if (cx > fMaxX) fMaxX = cx
    if (ay < fMinY) fMinY = ay; if (ay > fMaxY) fMaxY = ay
    if (by < fMinY) fMinY = by; if (by > fMaxY) fMaxY = by
    if (cy < fMinY) fMinY = cy; if (cy > fMaxY) fMaxY = cy
    if (az < fMinZ) fMinZ = az; if (az > fMaxZ) fMaxZ = az
    if (bz < fMinZ) fMinZ = bz; if (bz > fMaxZ) fMaxZ = bz
    if (cz < fMinZ) fMinZ = cz; if (cz > fMaxZ) fMaxZ = cz
  }
  const nLen = Math.hypot(nAx, nAy, nAz)
  const normal: [number, number, number] = nLen > 1e-12 ? [nAx / nLen, nAy / nLen, nAz / nLen] : [0, 0, 0]
  const centroid: [number, number, number] = area > 1e-12 ? [cX / area, cY / area, cZ / area] : [0, 0, 0]

  // ---- 3. 选节点：到任一面三角距离 ≤ selectTol
  const selectTol = (inp.selectTol !== undefined && Number.isFinite(inp.selectTol) && inp.selectTol > 0)
    ? inp.selectTol : 0.6 * h
  const tol2 = selectTol * selectTol
  // 面 AABB 扩 selectTol（节点先要落喺扩张盒内先值得逐三角算距离）
  const bMinX = fMinX - selectTol, bMaxX = fMaxX + selectTol
  const bMinY = fMinY - selectTol, bMaxY = fMaxY + selectTol
  const bMinZ = fMinZ - selectTol, bMaxZ = fMaxZ + selectTol

  const picked: number[] = []
  for (let cId = 0; cId < nNodesTotal; cId++) {
    const g = nodeGrid[cId]
    const ix = g % nnx
    const iy = ((g / nnx) | 0) % nny
    const iz = (g / (nnx * nny)) | 0
    const px = ox + ix * h, py = oy + iy * h, pz = oz + iz * h
    if (px < bMinX || px > bMaxX || py < bMinY || py > bMaxY || pz < bMinZ || pz > bMaxZ) continue
    // 逐面三角算最近距离，命中即收（早退）
    let hit = false
    for (let t = 0; t < nTri; t++) {
      const o = t * 9
      const d2 = pointTriDist2(
        px, py, pz,
        ft[o], ft[o + 1], ft[o + 2],
        ft[o + 3], ft[o + 4], ft[o + 5],
        ft[o + 6], ft[o + 7], ft[o + 8],
      )
      if (d2 <= tol2) { hit = true; break }
    }
    if (hit) picked.push(cId)
  }

  return {
    ok: true,
    nodes: Int32Array.from(picked),
    nNodes: picked.length,
    nNodesTotal,
    area,
    normal,
    centroid,
  }
}
