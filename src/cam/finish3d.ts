// finish3d.ts — 3D 平行精加工（parallel / raster finishing）刀路纯数学模块。
// 把 CAM 由 2.5D（轮廓/挖槽/钻孔，见 mill25d.ts）推向真 3D 曲面精加工 —— 对标 Fusion
// 「3D → 平行（Parallel）」精加工策略。球头铣刀（ball-nose），GRBL 业余机方言（同 mill25d）。
//
// 算法（经典 z-map「落刀」drop-cutter，纯自写，零依赖）：
//   ① 把 3D 三角网格栅格化成【顶面高度图 zmap】：逐三角形找其 XY 投影覆盖嘅格，
//      格中心在三角形内就用重心坐标插出该点 Z，逐格取最高（顶面）。无三角覆盖 = 无料。
//   ② 平行 raster 线：沿 X 行进，按 stepover 在 Y 分行，zigzag（来回）减空程。
//   ③ 每采样点【球头 drop-cutter】：刀盘半径 r footprint 内取
//        球心 Z = max_p[ zmap(p) + √(r²−d²) ]（d = p 到刀心水平距，≤r），
//        刀尖 Z = 球心 Z − r  →  球面刚好贴住顶面而【唔过切】（gouge-free）。
//      footprint 内无料 → 抬刀 safeZ 跳过该段。
//
// 单位：长度 mm、Z 向上（CAD 坐标）；进给 mm/min。数字格式同 mill25d：|x|<1e-9→0，3 位剪尾零。
//
// 诚实边界（非商用 CAM 级）：净系球头「落刀」精加工单一策略，gouge-free 但
//   · 唔做刀杆/夹头碰撞检查（只防球头过切）· 唔做余量再加工(rest)/陡峭分区
//   · zmap 精度受 gridPitch 限（细 = 准但慢）· 适合 GRBL 3018/Shapeoko 级雕铣木/软料/塑胶。

export interface Finish3DOpts {
  toolD: number        // 球头刀【直径】mm（半径 r = toolD/2）
  stepover: number     // 行距 mm（Y 方向，越细越光但越慢；典型 0.1~0.4×toolD）
  feedXY: number       // 切削进给 mm/min
  feedZ: number        // 下刀(plunge)进给 mm/min
  rpm: number          // 主轴 S
  safeZ: number        // 安全高 mm（须 > 毛坯顶）
  stockTop?: number    // 毛坯顶 Z（默认 = 网格最高 Z）— 暂仅记录，落刀本身按 zmap
  zFloor?: number      // 刀尖最低限位 mm（默认 = 网格最低 Z；防切穿垫板）
  gridPitch?: number   // zmap 格距 mm（默认 = clamp(min(stepover,r)/1.5, 0.15, 2)）
  samplePitch?: number // 沿线采样步距 mm（默认 = gridPitch）
}

export interface Finish3DResult {
  gcode: string
  warnings: string[]
  nx: number; ny: number            // zmap 维度
  gridPitch: number
  passes: number                    // raster 行数
  points: number                    // 切削点数
  cutLen: number                    // 切削路程 mm（XYZ）
  zRange: [number, number]          // 刀尖 Z 范围
}

const fmt = (x: number): string => String(+(Math.abs(x) < 1e-9 ? 0 : x).toFixed(3))
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x))

/**
 * 3D 平行精加工：三角网格（CAD mm，xyz 三元组 + 索引）→ GRBL 球头 raster G-code。
 */
export function meshToFinishGcode(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  opts: Finish3DOpts,
): Finish3DResult {
  const warnings: string[] = []
  const empty = (msg: string): Finish3DResult => {
    warnings.push(msg)
    return { gcode: '', warnings, nx: 0, ny: 0, gridPitch: 0, passes: 0, points: 0, cutLen: 0, zRange: [0, 0] }
  }
  if (!vertices || !triangles || vertices.length < 9 || triangles.length < 3) return empty('空网格（顶点/三角形不足）')
  const r = opts.toolD / 2
  if (!(r > 0)) return empty('刀径无效（需 > 0）')

  // ---- 包围盒（CAD）
  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2]
    if (x < minx) minx = x; if (y < miny) miny = y; if (z < minz) minz = z
    if (x > maxx) maxx = x; if (y > maxy) maxy = y; if (z > maxz) maxz = z
  }
  const spanX = maxx - minx, spanY = maxy - miny
  if (!(spanX > 0) || !(spanY > 0)) return empty('包围盒退化（XY 无范围）')

  const pitch = clamp(opts.gridPitch && opts.gridPitch > 0 ? opts.gridPitch : Math.min(opts.stepover, r) / 1.5, 0.15, 2)
  const nx = Math.max(2, Math.ceil(spanX / pitch) + 1)
  const ny = Math.max(2, Math.ceil(spanY / pitch) + 1)
  if (nx * ny > 4_000_000) return empty(`zmap 过大（${nx}×${ny}）：请放大 gridPitch 或缩小模型`)

  // ---- ① 顶面高度图 zmap（-Inf = 无料）
  const NEG = -Infinity
  const zmap = new Float64Array(nx * ny).fill(NEG)
  const idxAt = (ix: number, iy: number): number => iy * nx + ix
  const tri = triangles, vx = vertices
  for (let t = 0; t < tri.length; t += 3) {
    const ia = tri[t] * 3, ib = tri[t + 1] * 3, ic = tri[t + 2] * 3
    const ax = vx[ia], ay = vx[ia + 1], az = vx[ia + 2]
    const bx = vx[ib], by = vx[ib + 1], bz = vx[ib + 2]
    const cx = vx[ic], cy = vx[ic + 1], cz = vx[ic + 2]
    // 三角 XY 投影退化（竖直面/线）跳过 —— 对顶面高度图无贡献
    const txmin = Math.min(ax, bx, cx), txmax = Math.max(ax, bx, cx)
    const tymin = Math.min(ay, by, cy), tymax = Math.max(ay, by, cy)
    if (txmax - txmin < 1e-12 && tymax - tymin < 1e-12) continue
    // 重心坐标预备（XY）
    const v0x = bx - ax, v0y = by - ay, v1x = cx - ax, v1y = cy - ay
    const d00 = v0x * v0x + v0y * v0y, d01 = v0x * v1x + v0y * v1y, d11 = v1x * v1x + v1y * v1y
    const denom = d00 * d11 - d01 * d01
    if (Math.abs(denom) < 1e-18) continue   // 退化三角（共线投影）
    const invDen = 1 / denom
    let ix0 = Math.floor((txmin - minx) / pitch), ix1 = Math.ceil((txmax - minx) / pitch)
    let iy0 = Math.floor((tymin - miny) / pitch), iy1 = Math.ceil((tymax - miny) / pitch)
    ix0 = Math.max(0, ix0); iy0 = Math.max(0, iy0); ix1 = Math.min(nx - 1, ix1); iy1 = Math.min(ny - 1, iy1)
    for (let iy = iy0; iy <= iy1; iy++) {
      const py = miny + iy * pitch
      const py_ay = py - ay
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = minx + ix * pitch
        const px_ax = px - ax
        const d20 = px_ax * v0x + py_ay * v0y
        const d21 = px_ax * v1x + py_ay * v1y
        const v = (d11 * d20 - d01 * d21) * invDen
        const w = (d00 * d21 - d01 * d20) * invDen
        const u = 1 - v - w
        if (u < -1e-7 || v < -1e-7 || w < -1e-7) continue   // 格心唔喺三角内
        const z = u * az + v * bz + w * cz
        const id = idxAt(ix, iy)
        if (z > zmap[id]) zmap[id] = z
      }
    }
  }

  // 有料格数
  let filled = 0
  for (let i = 0; i < zmap.length; i++) if (zmap[i] > NEG) filled++
  if (filled === 0) return empty('栅格化后无顶面（网格可能无水平投影面）')

  const zFloor = (opts.zFloor !== undefined && Number.isFinite(opts.zFloor)) ? opts.zFloor : minz
  const safeZ = (Number.isFinite(opts.safeZ) ? opts.safeZ : maxz + 5)
  if (safeZ <= maxz) warnings.push(`安全高 ${safeZ} ≤ 顶面 ${maxz.toFixed(2)}：可能撞料，建议调高`)

  // footprint 内格偏移（相对刀心格），预算 √(r²−d²)
  const rCells = Math.max(1, Math.ceil(r / pitch))
  const offs: { dix: number; diy: number; rise: number }[] = []
  for (let dy = -rCells; dy <= rCells; dy++) for (let dx = -rCells; dx <= rCells; dx++) {
    const d2 = (dx * pitch) * (dx * pitch) + (dy * pitch) * (dy * pitch)
    if (d2 > r * r) continue
    offs.push({ dix: dx, diy: dy, rise: Math.sqrt(Math.max(0, r * r - d2)) })
  }

  // drop-cutter：刀心 (cx,cy) → 刀尖 Z（null = footprint 无料）
  const tipZAt = (cx: number, cy: number): number | null => {
    const cix = Math.round((cx - minx) / pitch)
    const ciy = Math.round((cy - miny) / pitch)
    let best = NEG
    for (let k = 0; k < offs.length; k++) {
      const ix = cix + offs[k].dix, iy = ciy + offs[k].diy
      if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) continue
      const z = zmap[idxAt(ix, iy)]
      if (z === NEG) continue
      const ballC = z + offs[k].rise
      if (ballC > best) best = ballC
    }
    if (best === NEG) return null
    return Math.max(zFloor, best - r)
  }

  // ---- ②③ 平行 raster + zigzag 落刀
  const samplePitch = clamp(opts.samplePitch && opts.samplePitch > 0 ? opts.samplePitch : pitch, 0.1, 5)
  const stepover = opts.stepover > 0 ? opts.stepover : r * 0.6
  const L: string[] = []
  L.push('G21', 'G90', 'G17', `G0 Z${fmt(safeZ)}`, `M3 S${fmt(opts.rpm)}`)
  let modalF = -1
  const fw = (f: number): string => { if (Math.abs(f - modalF) < 1e-9) return ''; modalF = f; return ` F${fmt(f)}` }

  const nRows = Math.max(1, Math.floor(spanY / stepover) + 1)
  const nSamp = Math.max(2, Math.floor(spanX / samplePitch) + 1)
  let points = 0, cutLen = 0
  let zMinTip = Infinity, zMaxTip = -Infinity
  let prevX = 0, prevY = 0, prevZ = safeZ, cutting = false
  let passes = 0

  for (let row = 0; row < nRows; row++) {
    const y = miny + Math.min(spanY, row * stepover)
    const fwd = (row % 2) === 0
    let rowHadCut = false
    for (let s = 0; s < nSamp; s++) {
      const xi = fwd ? s : (nSamp - 1 - s)
      const x = minx + Math.min(spanX, xi * samplePitch)
      const tz = tipZAt(x, y)
      if (tz === null) {
        if (cutting) { L.push(`G0 Z${fmt(safeZ)}`); prevZ = safeZ; cutting = false }
        continue
      }
      if (tz < zMinTip) zMinTip = tz; if (tz > zMaxTip) zMaxTip = tz
      if (!cutting) {
        // 进料：抬刀(已 safe)→ 快移到 xy → 下刀
        L.push(`G0 Z${fmt(safeZ)}`)
        L.push(`G0 X${fmt(x)} Y${fmt(y)}`)
        L.push(`G1 Z${fmt(tz)}${fw(opts.feedZ)}`)
        cutting = true; rowHadCut = true
        prevX = x; prevY = y; prevZ = tz; points++
      } else {
        L.push(`G1 X${fmt(x)} Y${fmt(y)} Z${fmt(tz)}${fw(opts.feedXY)}`)
        cutLen += Math.hypot(x - prevX, y - prevY, tz - prevZ)
        prevX = x; prevY = y; prevZ = tz; points++
      }
    }
    if (cutting) { L.push(`G0 Z${fmt(safeZ)}`); prevZ = safeZ; cutting = false }
    if (rowHadCut) passes++
  }
  L.push(`G0 Z${fmt(safeZ)}`, 'M5', 'M2')

  if (points === 0) return empty('无切削点（footprint 全程无料 — 检查刀径/模型）')
  if (!Number.isFinite(zMinTip)) { zMinTip = zFloor; zMaxTip = maxz }

  return {
    gcode: L.join('\n') + '\n',
    warnings, nx, ny, gridPitch: pitch, passes, points, cutLen,
    zRange: [zMinTip, zMaxTip],
  }
}

// =====================================================================================
// 3D 粗加工（roughing / Z-level pocket clearing）— 对标 Fusion「3D → 挖槽粗加工/自适应」。
// 平端铣刀逐层（stepdown）清除毛坯里【高过零件顶面】嘅料，留 allowance 余量畀精加工。
// 复用同一 z-map：喺层高 z，只喺「零件顶面低过 z + 余量」嘅格切削（z ≥ zmap+allowance），
// 保证唔切入零件（gouge-free，因 z > zmap）。zigzag raster 每层来回。
// =====================================================================================

export interface Rough3DOpts {
  toolD: number        // 平端刀直径 mm（决定 stepover 默认）
  stepover: number     // 径向行距 mm（Y 方向）
  stepdown: number     // 轴向每层切深 mm
  feedXY: number; feedZ: number; rpm: number; safeZ: number
  allowance?: number   // 留畀精加工嘅余量 mm（默认 0.5）
  stockTop?: number    // 毛坯顶 Z（默认 = 网格最高 Z）
  gridPitch?: number; samplePitch?: number
}
export interface Rough3DResult {
  gcode: string; warnings: string[]
  nx: number; ny: number; gridPitch: number
  layers: number; points: number; cutLen: number; minClearance: number   // min(z − zmap) 喺切削点（>0 = gouge-free）
}

export function meshToRoughGcode(vertices: ArrayLike<number>, triangles: ArrayLike<number>, opts: Rough3DOpts): Rough3DResult {
  const warnings: string[] = []
  const empty = (msg: string): Rough3DResult => { warnings.push(msg); return { gcode: '', warnings, nx: 0, ny: 0, gridPitch: 0, layers: 0, points: 0, cutLen: 0, minClearance: 0 } }
  if (!vertices || !triangles || vertices.length < 9 || triangles.length < 3) return empty('空网格（顶点/三角形不足）')
  const r = opts.toolD / 2
  if (!(r > 0)) return empty('刀径无效')
  if (!(opts.stepdown > 0)) return empty('每层切深 stepdown 需 > 0')

  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2]
    if (x < minx) minx = x; if (y < miny) miny = y; if (z < minz) minz = z
    if (x > maxx) maxx = x; if (y > maxy) maxy = y; if (z > maxz) maxz = z
  }
  const spanX = maxx - minx, spanY = maxy - miny
  if (!(spanX > 0) || !(spanY > 0)) return empty('包围盒退化（XY 无范围）')
  const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
  const fmt = (x: number) => String(+(Math.abs(x) < 1e-9 ? 0 : x).toFixed(3))
  const pitch = clamp(opts.gridPitch && opts.gridPitch > 0 ? opts.gridPitch : Math.min(opts.stepover, r) / 1.5, 0.15, 2)
  const nx = Math.max(2, Math.ceil(spanX / pitch) + 1), ny = Math.max(2, Math.ceil(spanY / pitch) + 1)
  if (nx * ny > 4_000_000) return empty(`zmap 过大（${nx}×${ny}）`)

  // 顶面高度图（同 finish）
  const NEG = -Infinity
  const zmap = new Float64Array(nx * ny).fill(NEG)
  const idxAt = (ix: number, iy: number) => iy * nx + ix
  const tri = triangles, vx = vertices
  for (let t = 0; t < tri.length; t += 3) {
    const ia = tri[t] * 3, ib = tri[t + 1] * 3, ic = tri[t + 2] * 3
    const ax = vx[ia], ay = vx[ia + 1], az = vx[ia + 2], bx = vx[ib], by = vx[ib + 1], bz = vx[ib + 2], cx = vx[ic], cy = vx[ic + 1], cz = vx[ic + 2]
    const txmin = Math.min(ax, bx, cx), txmax = Math.max(ax, bx, cx), tymin = Math.min(ay, by, cy), tymax = Math.max(ay, by, cy)
    if (txmax - txmin < 1e-12 && tymax - tymin < 1e-12) continue
    const v0x = bx - ax, v0y = by - ay, v1x = cx - ax, v1y = cy - ay
    const d00 = v0x * v0x + v0y * v0y, d01 = v0x * v1x + v0y * v1y, d11 = v1x * v1x + v1y * v1y
    const denom = d00 * d11 - d01 * d01
    if (Math.abs(denom) < 1e-18) continue
    const invDen = 1 / denom
    const ix0 = Math.max(0, Math.floor((txmin - minx) / pitch)), ix1 = Math.min(nx - 1, Math.ceil((txmax - minx) / pitch))
    const iy0 = Math.max(0, Math.floor((tymin - miny) / pitch)), iy1 = Math.min(ny - 1, Math.ceil((tymax - miny) / pitch))
    for (let iy = iy0; iy <= iy1; iy++) {
      const py = miny + iy * pitch, py_ay = py - ay
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = minx + ix * pitch, px_ax = px - ax
        const d20 = px_ax * v0x + py_ay * v0y, d21 = px_ax * v1x + py_ay * v1y
        const v = (d11 * d20 - d01 * d21) * invDen, w = (d00 * d21 - d01 * d20) * invDen, u = 1 - v - w
        if (u < -1e-7 || v < -1e-7 || w < -1e-7) continue
        const z = u * az + v * bz + w * cz, id = idxAt(ix, iy)
        if (z > zmap[id]) zmap[id] = z
      }
    }
  }
  const zAt = (cx: number, cy: number): number => {
    const ix = Math.round((cx - minx) / pitch), iy = Math.round((cy - miny) / pitch)
    if (ix < 0 || iy < 0 || ix >= nx || iy >= ny) return NEG
    return zmap[idxAt(ix, iy)]
  }

  const allowance = (opts.allowance !== undefined && opts.allowance >= 0) ? opts.allowance : 0.5
  const stockTop = (opts.stockTop !== undefined && Number.isFinite(opts.stockTop)) ? opts.stockTop : maxz
  const safeZ = Number.isFinite(opts.safeZ) ? opts.safeZ : maxz + 5
  if (safeZ <= stockTop) warnings.push(`安全高 ${safeZ} ≤ 毛坯顶 ${stockTop.toFixed(2)}：建议调高`)
  const samplePitch = clamp(opts.samplePitch && opts.samplePitch > 0 ? opts.samplePitch : pitch, 0.1, 5)
  const stepover = opts.stepover > 0 ? opts.stepover : r * 0.8

  // 层高：stockTop 往下每 stepdown 一层，到 ≥ minz（最深层贴 minz）
  const levels: number[] = []
  for (let z = stockTop - opts.stepdown; z > minz + 1e-6; z -= opts.stepdown) levels.push(z)
  levels.push(minz)   // 最底层贴零件最低

  const L: string[] = []
  L.push('G21', 'G90', 'G17', `G0 Z${fmt(safeZ)}`, `M3 S${fmt(opts.rpm)}`)
  let modalF = -1
  const fw = (f: number): string => { if (Math.abs(f - modalF) < 1e-9) return ''; modalF = f; return ` F${fmt(f)}` }
  const nSamp = Math.max(2, Math.floor(spanX / samplePitch) + 1)
  let points = 0, cutLen = 0, minClear = Infinity
  let prevX = 0, prevY = 0, cutting = false

  for (let li = 0; li < levels.length; li++) {
    const z = levels[li]
    const nRows = Math.max(1, Math.floor(spanY / stepover) + 1)
    for (let row = 0; row < nRows; row++) {
      const y = miny + Math.min(spanY, row * stepover)
      const fwd = (row % 2) === 0
      for (let s = 0; s < nSamp; s++) {
        const xi = fwd ? s : (nSamp - 1 - s)
        const x = minx + Math.min(spanX, xi * samplePitch)
        const zm = zAt(x, y)
        // 有料可清 = 零件顶面（或无料处 = 毛坯底）低过 当前层 + 余量
        const partTop = zm === NEG ? minz : zm
        const clear = z >= partTop + allowance - 1e-9
        if (!clear) { if (cutting) { L.push(`G0 Z${fmt(safeZ)}`); cutting = false } continue }
        const cl = z - partTop; if (cl < minClear) minClear = cl
        if (!cutting) {
          L.push(`G0 Z${fmt(safeZ)}`, `G0 X${fmt(x)} Y${fmt(y)}`, `G1 Z${fmt(z)}${fw(opts.feedZ)}`)
          cutting = true; prevX = x; prevY = y; points++
        } else {
          L.push(`G1 X${fmt(x)} Y${fmt(y)}${fw(opts.feedXY)}`)
          cutLen += Math.hypot(x - prevX, y - prevY); prevX = x; prevY = y; points++
        }
      }
      if (cutting) { L.push(`G0 Z${fmt(safeZ)}`); cutting = false }
    }
  }
  L.push(`G0 Z${fmt(safeZ)}`, 'M5', 'M2')
  if (points === 0) return empty('无粗加工切削点（零件已填满毛坯，或余量太大）')
  if (!Number.isFinite(minClear)) minClear = 0
  return { gcode: L.join('\n') + '\n', warnings, nx, ny, gridPitch: pitch, layers: levels.length, points, cutLen, minClearance: minClear }
}
