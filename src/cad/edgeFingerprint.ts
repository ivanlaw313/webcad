// edgeFingerprint.ts — 「持久边身份」几何指纹（roadmap #2 嘅【边】版本）
//
// 配套 faceFingerprint.ts（持久【面】指纹）。呢个文件做【边】嘅版本，专治 Fillet / Chamfer
// 选边跨重建漂移：
//
// 问题：而家 worker 拣边靠 near-point —— store 存一个 3D `near` 点（CAD 坐标），重建后
//   worker 喺 shape.edges 逐条 sample `pointAt(t)` 揾最近嗰条嚟圆角/倒角
//   （cad.worker.ts roundNearPoint / roundNearPoints）。问题：
//     1. 上游参数一改（尺寸 / 位置 / 布尔），原本贴住嗰个 `near` 点嘅边可能已经搬咗位 →
//        near-point 跌落另一条边 → 圆角跑去错边（drift）。
//     2. 纯距离冇用到边【本身嘅几何特征】（长度、方向、曲率），同尺寸但唔同位嘅边易撞。
//
// 解决方向（同 faceFingerprint 一致）：用【几何指纹】做一个跨重建相对稳定嘅 edge id ——
//   边几何唔变，指纹就唔变。指纹由「一条边嘅有序采样点（polyline）」算出：
//     量化（中点归一化位置 + 弧长 + 方向 + 两端点 + 直/曲标志），全部容差量化抗浮点抖动。
//   再加 remapEdgePick：把旧 near-point 拣边迁移到重建后【最近匹配指纹】嘅那条边
//   （指纹对得上→精确跟；对唔上→退回 near-point 最近边，至少唔会无故 throw）。
//
// ⚠ 诚实边界（同 faceFingerprint 一脉相承，务必睇清）：
//   1. 呢个系【几何指纹】，唔系真拓扑命名（topological naming）。边【几何】变咗
//      （长度 / 位置 / 弯曲度俾参数改动影响）→ 指纹变 → remap 退回 near-point fallback
//      （可能跟错，或跟返最近嗰条）。可接受 —— 总好过净靠裸 near-point。
//   2. 对称体撞率高（已知局限）：
//        • 立方体 12 条棱：靠归一化中点位置可全部分开（每棱中点喺 bbox 唔同位）。
//        • 正 N 棱柱 N 条竖棱 / 旋转对称体：绕轴旋转令多条边几何全等且中点喺对称位 →
//          指纹【可能撞】。几何指纹做唔到「绕轴第 k 条」嘅区分（要真拓扑序先得）。
//        • 共线 / 镜像对称边：方向 + 长度同，靠中点位置压撞，但唔保证零撞。
//      撞咗 → remap 可能跟错另一条同指纹边（同 faceFingerprint 边界 2）。
//   3. 平移 / 整体各向同性缩放：中点 / 端点用【模型 bbox 归一化】、长度用【/bbox 对角】→
//      都稳定。但【旋转】会改方向同中点方位 → 指纹变（几何指纹本质对旋转敏感，唔做主轴
//      对齐；CAD 重建一般唔旋转既有几何，可接受）。
//   4. 采样点数唔入指纹：worker `pointAt(t)` 嘅采样密度跨重建可能变（直线 2 点、曲线 N 点），
//      故只用【弧长 / 几何形状】特征，唔用裸点数（避免假阴性）。
//
// 纯函数、无副作用、唔 import 任何现有文件 —— 接线（worker sample 边成 polyline 存落
// feature.near 旁边、重建时 call remapEdgePick）由调用方自己做。

// ── 量化容差（归一化后无量纲）────────────────────────────────────────────────
// 量化 = 把浮点 round 到容差格，令 ±抖动落同一格 → 同 key。越大越稳（抗抖）但越易撞；
// 越细越能分辨但越易因抖动裂开。数值同 faceFingerprint 对齐（mm 级 CAD + OCCT 三角化容差）。
const POS_TOL = 0.01      // 中点 / 端点归一化位置量化：0.01（~bbox 千分之一格）
const DIR_TOL = 0.01      // 方向分量量化：0.01（~0.57° 角分辨）
const LEN_TOL = 1e-3      // 归一化弧长量化格（占 bbox 对角比）
const SAG_TOL = 1e-3      // 直/曲（弦中点偏离 sagitta 占弧长比）量化格
const EPS = 1e-9

/** round 到容差格再转定长整数串，保证同格 → 同字串（负零归一）。 */
function q(value: number, tol: number): string {
  const n = Math.round(value / tol)
  return n === 0 ? '0' : String(n)   // -0 / +0 都变 '0'
}

type Vec3 = [number, number, number]

/** 一条边 = 有序采样点 polyline，每点 [x,y,z]（CAD 坐标）。worker 用 e.pointAt(t) sample 出。 */
export type EdgePolyline = ReadonlyArray<Vec3>

// 内部几何量（畀测试同 debug 用，唔系对外契约）。
export type EdgeGeom = {
  length: number            // 弧长（沿 polyline 累加段长；CAD 单位，未归一化）
  midpoint: Vec3            // 弧长中点（沿边一半长度嗰点；CAD 坐标，未归一化）
  start: Vec3              // 起点（CAD 坐标）
  end: Vec3                // 终点（CAD 坐标）
  sagitta: number          // 弦中点偏离弧（最大偏离 / 弧长）—— 直线≈0、弧>0，区分直/曲
  closed: boolean          // 起点≈终点（闭合环，如整圆边）
}

/** 两点距离。 */
function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/**
 * 从一条 polyline 抽取原始几何量。
 * - length：逐段累加（弧长，曲线亦准）。
 * - midpoint：沿弧长行到一半嗰点（线性插值落正确段内）—— 比「中间采样点」稳，唔受采样密度影响。
 * - sagitta：每个内部采样点到「首尾弦」嘅最大垂距 / 弧长 —— 直线≈0、弧>0（区分直/曲，量化抗抖）。
 */
export function edgeGeom(poly: EdgePolyline): EdgeGeom {
  const n = poly.length
  if (n === 0) return { length: 0, midpoint: [0, 0, 0], start: [0, 0, 0], end: [0, 0, 0], sagitta: 0, closed: true }
  const start: Vec3 = [poly[0][0], poly[0][1], poly[0][2]]
  const end: Vec3 = [poly[n - 1][0], poly[n - 1][1], poly[n - 1][2]]
  if (n === 1) return { length: 0, midpoint: start, start, end, sagitta: 0, closed: true }
  // 累加弧长 + 记每段起始累积长（畀弧长中点插值用）
  let length = 0
  const cum: number[] = [0]
  for (let i = 1; i < n; i++) { length += dist(poly[i - 1], poly[i]); cum.push(length) }
  // 弧长中点：行到 length/2，喺所在段内线性插值
  let midpoint: Vec3 = start
  if (length > EPS) {
    const half = length / 2
    let seg = 1
    while (seg < n && cum[seg] < half) seg++
    if (seg >= n) seg = n - 1
    const segLen = cum[seg] - cum[seg - 1]
    const f = segLen > EPS ? (half - cum[seg - 1]) / segLen : 0
    const a = poly[seg - 1], b = poly[seg]
    midpoint = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]
  }
  // sagitta：内部点到首尾弦嘅最大垂距 / 弧长（弦零长 = 闭环 → 用最大「到起点距」代理）
  const closed = dist(start, end) < Math.max(EPS, length * 1e-4)
  let maxDev = 0
  const chord: Vec3 = [end[0] - start[0], end[1] - start[1], end[2] - start[2]]
  const chordLen = Math.hypot(chord[0], chord[1], chord[2])
  for (let i = 1; i < n - 1; i++) {
    const p = poly[i]
    let dev: number
    if (chordLen > EPS) {
      // 点到直线（start→end）距离 = |(p-start) × chordDir|
      const wx = p[0] - start[0], wy = p[1] - start[1], wz = p[2] - start[2]
      const cx = wy * chord[2] - wz * chord[1]
      const cy = wz * chord[0] - wx * chord[2]
      const cz = wx * chord[1] - wy * chord[0]
      dev = Math.hypot(cx, cy, cz) / chordLen
    } else {
      dev = dist(p, start)   // 闭环：弦退化 → 用「离起点几远」做曲率代理
    }
    if (dev > maxDev) maxDev = dev
  }
  const sagitta = length > EPS ? maxDev / length : 0
  return { length, midpoint, start, end, sagitta, closed }
}

/**
 * 模型整体 bbox（全 vertices）—— 用嚟把中点 / 端点 / 长度【归一化】到模型尺度，
 * 令整体平移 + 各向同性缩放唔影响指纹（同 faceFingerprint.modelBox 同款）。
 */
export function modelBox(vertices: ArrayLike<number>): { min: Vec3; max: Vec3; diag: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2]
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z
  }
  if (!Number.isFinite(minX)) { minX = minY = minZ = 0; maxX = maxY = maxZ = 0 }
  const diag = Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], diag }
}

/** 把一个 CAD 点归一化到 [0,1]ish（相对 bbox min、除以对角）。 */
function normPt(p: Vec3, box: { min: Vec3; diag: number }, scale: number): Vec3 {
  return [(p[0] - box.min[0]) / scale, (p[1] - box.min[1]) / scale, (p[2] - box.min[2]) / scale]
}

/** 量化一个归一化点成 key 片段。 */
function ptKey(p: Vec3): string {
  return `${q(p[0], POS_TOL)}/${q(p[1], POS_TOL)}/${q(p[2], POS_TOL)}`
}

/**
 * 几何指纹（跨重建相对稳定嘅 edge id）。
 *
 * 用嘅特征（全部量化到容差，对刚体平移 + 各向同性缩放稳定；对旋转【敏感】，见文件头诚实边界）：
 *   - 归一化弧长（length / bbox对角；量化 LEN_TOL）—— 平移/缩放不变；区分长短边
 *   - 归一化弧长中点位置（量化 POS_TOL）—— 压撞主力（同长同向但唔同位嘅边分得开）
 *   - 端点对（两端各归一化、量化；【排序】令 polyline 反转方向都同 key）—— 钉死边喺空间嘅位置
 *   - 方向（端点弦方向，分量取绝对值再排序 → 反向 / 反射对称都同 key）—— 区分朝向唔同嘅边
 *   - 直/曲标志（sagitta 量化）—— 同端点嘅直线 vs 弧分得开（fillet 弧 vs 原直棱）
 *   - 闭合标志 —— 整圆边（闭环）同开放边分开
 *
 * @param vertices 全模型 flat 顶点 [x,y,z,...]（CAD 坐标，用嚟定归一化尺度）
 * @param edge     该 B-rep 边嘅有序采样 polyline（worker `pointAt(t)` 出，t∈[0,1]）
 * @returns 稳定字串 id；同一几何边跨重建应一致。⚠ 唔保证全局唯一（对称 / 共线边可能撞）。
 */
export function edgeFingerprint(vertices: ArrayLike<number>, edge: EdgePolyline): string {
  const g = edgeGeom(edge)
  const box = modelBox(vertices)
  const scale = box.diag > EPS ? box.diag : 1     // 归一化尺度（模型对角）；退化模型 → 1（不归一）
  const normLen = g.length / scale
  const mid = normPt(g.midpoint, box, scale)
  // 两端点归一化后【排序】→ polyline 起终调转都得同一 key（边无方向）
  const e0 = normPt(g.start, box, scale)
  const e1 = normPt(g.end, box, scale)
  const eA = ptKey(e0), eB = ptKey(e1)
  const ends = eA <= eB ? `${eA};${eB}` : `${eB};${eA}`
  // 方向：弦向量，分量取 |·| 再排序 → 反向（±）同坐标轴镜像都得同 key（对应端点排序后嘅无向性）
  const dx = Math.abs(g.end[0] - g.start[0])
  const dy = Math.abs(g.end[1] - g.start[1])
  const dz = Math.abs(g.end[2] - g.start[2])
  const dLen = Math.hypot(dx, dy, dz) || 1
  const dirs = [dx / dLen, dy / dLen, dz / dLen].sort((a, b) => a - b)
  const dkey = `${q(dirs[0], DIR_TOL)}/${q(dirs[1], DIR_TOL)}/${q(dirs[2], DIR_TOL)}`
  const mkey = ptKey(mid)
  const lkey = q(normLen, LEN_TOL)
  const skey = q(g.sagitta, SAG_TOL)
  const ckey = g.closed ? 'C' : 'O'
  // 拼成稳定字串（版本前缀 e1 → 将来改特征唔会同旧 key 静默撞）
  return `e1|l:${lkey}|m:${mkey}|e:${ends}|d:${dkey}|s:${skey}|${ckey}`
}

// ════════════════════════════════════════════════════════════════════════════
// v2：旋转不变边指纹（rotation-invariant edge fingerprint）—— FIRST SLICE
// ════════════════════════════════════════════════════════════════════════════
//
// v1（e1|…）用【模型 bbox】归一化（modelBox / normPt）：平移 + 各向同性缩放稳定，但
// 对【旋转】敏感（bbox 同点喺 bbox 内嘅方位都随旋转改）。CAD 重建一般唔旋转既有几何，
// 故 v1 够用且简单。但部分场景（导入旋转过嘅模型 / 上游旋转操作）想要旋转不变 id。
//
// v2（e2|…）改用模型嘅【主惯量框架】（principal frame，PCA on vertices）做坐标系：
//   centroid（质心）做原点、协方差矩阵嘅特征向量做轴 → 框架本身随模型刚体旋转一齐转，
//   故边喺框架坐标系内嘅位置 / 方向【旋转不变】。特征集同 v1 完全一样（length / midpoint /
//   ends / dir / sagitta / closed），只系换咗坐标系（normPtFrame 取代 normPt、方向点落框架轴）。
//
// ⚠ 诚实边界（v2 特有，务必睇清）：
//   1. 唯一性靠特征值【有间隔】（gap）：两个惯量差得够远 → 主轴方向唯一稳定（wellConditioned）。
//      但【近对称体】（立方体 / 球 / 正棱柱 / 正方形截面柱）惯量近相等 → 特征向量喺简并子空间
//      内任意（绕简并轴旋转都系合法特征向量）→ 框架【唔唯一】→ v2 指纹【唔可靠】。
//      呢种情况 principalFrame 返 wellConditioned=false；本 slice 照计指纹但加 'X' 标志，
//      由【将来嘅 resolver】决定降级（advisory），唔喺呢度接线。
//   2. 符号歧义：特征向量 ±v 都系合法 → 必须 canonicalize。
//      ⚠ S136 修正：旧规则「翻到最大绝对值分量为正」系【坐标系相关】，模型绕轴转过 ~45° 后
//        另一分量变最大 → sign 翻转 → 同一几何边 v2 指纹变（只对 <45° 不变）。
//      新规则用顶点云沿轴嘅【三阶矩（skewness）】定号：Σ(投影坐标)³>0 当 +向，<0 翻 -向。
//        skewness 系点云内禀几何量（旋转时轴同点云一齐转、投影标量唔变）→ 符号【任意角度旋转
//        不变】。
//      skewness≈0（该轴方向上点云【对称】= 号真歧义；中心对称体如纯长方体三轴皆如此，奇数阶矩
//        恒为 0，数学上分唔出号）→ 标记 signAmbiguous[k]=true，指纹对该轴坐标取 |·| 折叠
//        （normPtFrame）：折叠后翻号唔影响 key → 该轴仍【任意角度旋转不变】。
//      ⚠ 号歧义【唔】拉低 wellConditioned —— 轴【方向】是否唯一只睇特征值间隔（边界 1），
//        同号歧义正交。长方体（惯量分离 + 中心对称）→ 方向唯一 wellConditioned=true，但三轴
//        皆 |·| 折叠。几何特征仍用 |dir| 排序 + 端点排序（同 v1）对反射对称 → 镜像唔影响指纹。
//   3. 仍受 v1 边界 1/2 限制：几何真变 → 指纹变；对称体撞率高。v2 只多解决【旋转】一项。
//      ⚠ 折叠代价（边界 2 引申）：对【中心+轴对称】体（如长方体），三轴全 |·| 折叠把由对称
//        关联嘅平行边映到同一 key → v2 撞率【高过 v1】（v1 靠固定 bbox 框架硬分，但嗰种「分得开」
//        本身唔旋转不变、系坐标系假象）。即「旋转不变」同「对称体高分辨」对中心对称体本质冲突：
//        几何上 4 条平行棱被本体对称关联，旋转不变指纹理应当佢哋等价。需要分对称体平行棱 →
//        要真拓扑序，几何指纹（v1/v2 都）做唔到。非对称体（skewness 有效、号确定保留符号）唔折叠
//        → v2 分辨同 v1 相当。
//   4. 缩放：scale 用框架内点云 bbox 对角（随各向同性缩放线性变）→ 各向同性缩放不变（同 v1）。
//
// 纯函数、零新 import（特征分解内联 closed-form 对称 3×3）。唔接线、唔改 v1。

/** 模型主惯量框架（PCA）。axes = 特征向量（按特征值降序），已做符号 canonicalize。 */
export type PrincipalFrame = {
  centroid: Vec3
  axes: [Vec3, Vec3, Vec3]   // [e0,e1,e2]，特征值 λ0≥λ1≥λ2 对应
  scale: number              // 长度归一化尺度（框架内点云 bbox 对角）
  wellConditioned: boolean   // 三个特征值都唔简并（两间隔够大）→ 轴【方向】唯一稳定；
                             //   对称体（立方/球，惯量简并）→ false
  // 每条轴嘅【号（±）】是否几何歧义（skewness≈0 = 该轴向点云对称，正负向真系分唔出）。
  //   中心对称体（如纯长方体 8 角点云）三轴皆歧义 → 全 true，但轴【方向】仍可由分离特征值定
  //   （wellConditioned 仍可 true）。指纹靠对【号歧义轴】嘅坐标取 |·| 折叠 → 旋转不变（号翻唔影响）。
  signAmbiguous: [boolean, boolean, boolean]
}

const FRAME_GAP_TOL = 0.05   // 相对特征值间隔阈值：(λi-λj)/λ0 要 > 呢个先算 wellConditioned
const SKEW_TOL = 1e-6        // 三阶矩（skewness）相对阈：|Σt³| / (n·σ³) 要 > 呢个先算「方向唔歧义」

/**
 * 符号 canonicalize 一条特征向量 —— 旋转不变版（S136 修 ≥45° sign-flip）。
 *
 * 旧规则（max-|component| 为正）有致命缺陷：把符号绑死喺「边个 Cartesian 分量绝对值最大」，
 * 而呢个会随【模型整体旋转】改变（绕轴转过 45° 后另一分量变最大）→ 同一条几何边嘅特征向量
 * sign 翻转 → v2 指纹变 → 解析错。max-|component| 系【坐标系相关】嘅，本质对旋转敏感。
 *
 * 新规则：把符号绑死喺【顶点云沿该轴嘅几何不对称性（三阶矩 / skewness）】——
 *   对轴 v，把所有 (p-centroid) 投影落 v 得标量 t_i，算 Σ t_i³。
 *     • Σt³ > 0：点云「重」嘅一侧落喺 +v 方向 → 保留 v（+v 当正向）。
 *     • Σt³ < 0：重侧落 -v → 翻成 -v。
 *   Σt³ 系点云【内禀几何量】：模型刚体旋转时，v 同点云一齐转，投影标量 t_i 完全唔变 →
 *   Σt³ 符号唔变 → 选出嘅正向跟住几何走、对【任意角度】旋转不变（唔再 45° 翻）。
 *
 * 退化处理（skewness ≈ 0 = 该轴方向上点云【对称】，正负向真系几何歧义 ——
 *   注意：中心对称体如纯长方体（8 角点云）三轴 skewness 皆 0，呢个系数学事实，
 *   任何奇数阶矩都分唔出号）：
 *   - 退回确定性 fallback：用 max-|component| 为正（旧规则）做稳定占位，保证同一几何【每次一致】；
 *     呢个占位号【可能随旋转翻】，但调用方对 ambiguous 轴嘅坐标取 |·| 折叠 → 翻唔影响指纹。
 *   - 返 ambiguous=true：调用方据此对该轴坐标做 |·| 折叠（指纹旋转不变嘅关键），
 *     且若所有有效轴都歧义（球状）可参考降级 —— 但【轴方向】是否唯一由 wellConditioned（特征值
 *     间隔）独立判定，唔受 ambiguous 影响（长方体轴方向唯一 → wellConditioned 仍 true）。
 *
 * @param v        特征向量（已单位化、未定号）
 * @param skewness 顶点云沿 v 嘅归一化三阶矩 Σt³/(n·σ³)（投影到 v 后算；旋转不变）
 * @returns { axis: 定号后嘅向量, ambiguous: skewness≈0（号几何歧义，需 |·| 折叠） }
 */
function canonicalizeAxis(v: Vec3, skewness: number): { axis: Vec3; ambiguous: boolean } {
  if (Math.abs(skewness) > SKEW_TOL) {
    // 不对称 → 跟几何 skewness 定号（旋转不变）
    const s = skewness < 0 ? -1 : 1
    return { axis: [v[0] * s, v[1] * s, v[2] * s], ambiguous: false }
  }
  // 对称（skewness≈0）→ 号几何歧义；退回确定性 max-|component| fallback（稳定占位，调用方会 |·| 折叠）
  let bi = 0, bmag = Math.abs(v[0])
  for (let i = 1; i < 3; i++) {
    const m = Math.abs(v[i])
    if (m > bmag + EPS) { bmag = m; bi = i }   // 严格大先换 → 平手保留索引细嗰个
  }
  const s = v[bi] < 0 ? -1 : 1
  return { axis: [v[0] * s, v[1] * s, v[2] * s], ambiguous: true }
}

/**
 * 算顶点云沿单位轴 v 嘅归一化三阶矩（skewness）= Σ t³ / (n · σ³)，t = (p-centroid)·v。
 * 旋转不变（v 同点云一齐转 → t 唔变）。σ≈0（点云沿该轴零展开）→ 返 0（视作对称/歧义）。
 */
function axisSkewness(
  vertices: ArrayLike<number>, n: number, centroid: Vec3, v: Vec3,
): number {
  let sum2 = 0, sum3 = 0
  for (let i = 0; i < n; i++) {
    const dx = vertices[i * 3] - centroid[0]
    const dy = vertices[i * 3 + 1] - centroid[1]
    const dz = vertices[i * 3 + 2] - centroid[2]
    const t = dx * v[0] + dy * v[1] + dz * v[2]
    sum2 += t * t
    sum3 += t * t * t
  }
  const variance = sum2 / n
  const sigma = Math.sqrt(variance)
  if (sigma < EPS) return 0                    // 沿该轴零展开 → 对称/歧义
  return (sum3 / n) / (sigma * sigma * sigma)  // 归一化（无量纲、对各向同性缩放亦不变）
}

/**
 * 对称 3×3 实矩阵特征分解（closed-form 解析/三角法，无外部依赖、无迭代）。
 * 入：上三角分量 a11 a12 a13 a22 a23 a33（矩阵对称）。
 * 出：特征值 [λ0,λ1,λ2]（降序）+ 对应特征向量（已正交、未 canonicalize）。
 *
 * 方法：Smith / Deledalle 嘅对称 3×3 解析特征值（cos/acos 三角公式）+ 用「(M-λI) 各列叉积取
 *   最大模」逐个解特征向量（避开退化列）。详见 Wikipedia「Eigenvalue algorithm § 3×3 matrices」。
 */
function symEig3(
  a11: number, a12: number, a13: number,
  a22: number, a23: number, a33: number,
): { vals: [number, number, number]; vecs: [Vec3, Vec3, Vec3] } {
  // ── 特征值：解析三角法 ──
  const p1 = a12 * a12 + a13 * a13 + a23 * a23
  let l0: number, l1: number, l2: number
  if (p1 < EPS * EPS) {
    // 已对角 → 特征值即对角元
    l0 = a11; l1 = a22; l2 = a33
  } else {
    const q = (a11 + a22 + a33) / 3                       // trace/3
    const d11 = a11 - q, d22 = a22 - q, d33 = a33 - q
    const p2 = d11 * d11 + d22 * d22 + d33 * d33 + 2 * p1
    const p = Math.sqrt(p2 / 6)
    // B = (1/p)(M - qI)；det(B)/2 ∈ [-1,1] → r
    const b11 = d11 / p, b22 = d22 / p, b33 = d33 / p
    const b12 = a12 / p, b13 = a13 / p, b23 = a23 / p
    const detB =
      b11 * (b22 * b33 - b23 * b23) -
      b12 * (b12 * b33 - b23 * b13) +
      b13 * (b12 * b23 - b22 * b13)
    let r = detB / 2
    if (r <= -1) r = -1; else if (r >= 1) r = 1
    const phi = Math.acos(r) / 3
    // 三个特征值（升序 e1≤e2≤e3 → 转降序 l0≥l1≥l2）
    const eig1 = q + 2 * p * Math.cos(phi)
    const eig3 = q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3)
    const eig2 = 3 * q - eig1 - eig3
    l0 = eig1; l1 = eig2; l2 = eig3
  }
  // 排序确保降序（解析公式 eig1 已最大，但稳妥起见显式排）
  const triple: [number, number, number] = [l0, l1, l2]
  triple.sort((a, b) => b - a)
  ;[l0, l1, l2] = triple

  // ── 特征向量：对每个 λ 解 (M-λI) v = 0 ──
  // 用「(M-λI) 三列两两叉积取最大模」嗰条 → 落入零空间，避开退化（行近线性相关）列。
  const vecFor = (lam: number): Vec3 => {
    const m11 = a11 - lam, m22 = a22 - lam, m33 = a33 - lam
    // (M-λI) 三列：c0=[m11,a12,a13], c1=[a12,m22,a23], c2=[a13,a23,m33]
    const c0: Vec3 = [m11, a12, a13]
    const c1: Vec3 = [a12, m22, a23]
    const c2: Vec3 = [a13, a23, m33]
    const cross = (u: Vec3, v: Vec3): Vec3 => [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ]
    const x01 = cross(c0, c1)
    const x02 = cross(c0, c2)
    const x12 = cross(c1, c2)
    const n01 = x01[0] ** 2 + x01[1] ** 2 + x01[2] ** 2
    const n02 = x02[0] ** 2 + x02[1] ** 2 + x02[2] ** 2
    const n12 = x12[0] ** 2 + x12[1] ** 2 + x12[2] ** 2
    let best = x01, bestN = n01
    if (n02 > bestN) { best = x02; bestN = n02 }
    if (n12 > bestN) { best = x12; bestN = n12 }
    if (bestN < EPS * EPS) {
      // 全退化（λ 简并、(M-λI) 秩太低）→ 揾任意单位向量做占位（框架反正会被判 not wellConditioned）
      return [1, 0, 0]
    }
    const inv = 1 / Math.sqrt(bestN)
    return [best[0] * inv, best[1] * inv, best[2] * inv]
  }
  const v0 = vecFor(l0)
  let v2 = vecFor(l2)
  // v1 = v2 × v0（强制三轴正交，避免简并时两条解出来撞）
  const dot = v0[0] * v2[0] + v0[1] * v2[1] + v0[2] * v2[2]
  // 若 v0,v2 唔够正交（简并）→ Gram-Schmidt 一下 v2
  if (Math.abs(dot) > 1e-6) {
    const t: Vec3 = [v2[0] - dot * v0[0], v2[1] - dot * v0[1], v2[2] - dot * v0[2]]
    const tn = Math.hypot(t[0], t[1], t[2])
    if (tn > EPS) v2 = [t[0] / tn, t[1] / tn, t[2] / tn]
  }
  const v1: Vec3 = [
    v2[1] * v0[2] - v2[2] * v0[1],
    v2[2] * v0[0] - v2[0] * v0[2],
    v2[0] * v0[1] - v2[1] * v0[0],
  ]
  const v1n = Math.hypot(v1[0], v1[1], v1[2]) || 1
  const v1u: Vec3 = [v1[0] / v1n, v1[1] / v1n, v1[2] / v1n]
  return { vals: [l0, l1, l2], vecs: [v0, v1u, v2] }
}

/**
 * 模型主惯量框架（PCA on flat vertices）—— v2 指纹嘅旋转不变坐标系。
 *
 * - centroid：全顶点均值。
 * - 协方差 M = Σ (p_i - c) ⊗ (p_i - c)（对称半正定）。
 * - 特征分解（symEig3 closed-form）→ 特征值降序，轴 = 对应特征向量。
 * - 符号 canonicalize（canonicalizeAxis）用顶点云沿轴 skewness 定号 → 杀 ±v 歧义、
 *   且【任意角度旋转不变】（S136 修旧 max-|comp| 规则嘅 ≥45° sign-flip）。
 * - scale：把点云投影落框架轴后嘅【bbox 对角】（旋转不变、随各向同性缩放线性）。
 * - wellConditioned：(λ0-λ1)/λ0 > TOL 且 (λ1-λ2)/λ0 > TOL（轴方向唯一）
 *   AND 三轴 skewness 都非零（号定得实）→ 框架唯一稳定；
 *   对称体（立方/球/正棱柱）惯量近相等 或 轴向对称（skewness≈0）→ false
 *   （框架唔可靠，由 resolver 降级处理）。
 *
 * @param vertices 全模型 flat 顶点 [x,y,z,...]（CAD 坐标）
 */
export function principalFrame(vertices: ArrayLike<number>): PrincipalFrame {
  const n = Math.floor(vertices.length / 3)
  if (n === 0) {
    return { centroid: [0, 0, 0], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], scale: 1, wellConditioned: false, signAmbiguous: [true, true, true] }
  }
  // 质心
  let cx = 0, cy = 0, cz = 0
  for (let i = 0; i < n; i++) { cx += vertices[i * 3]; cy += vertices[i * 3 + 1]; cz += vertices[i * 3 + 2] }
  cx /= n; cy /= n; cz /= n
  const centroid: Vec3 = [cx, cy, cz]
  // 协方差（对称，只算上三角）
  let m11 = 0, m12 = 0, m13 = 0, m22 = 0, m23 = 0, m33 = 0
  for (let i = 0; i < n; i++) {
    const dx = vertices[i * 3] - cx, dy = vertices[i * 3 + 1] - cy, dz = vertices[i * 3 + 2] - cz
    m11 += dx * dx; m12 += dx * dy; m13 += dx * dz
    m22 += dy * dy; m23 += dy * dz; m33 += dz * dz
  }
  const { vals, vecs } = symEig3(m11, m12, m13, m22, m23, m33)
  // 符号 canonicalize：用顶点云沿每条轴嘅三阶矩（skewness）定号 → 旋转不变（修 ≥45° sign-flip）。
  const sk0 = axisSkewness(vertices, n, centroid, vecs[0])
  const sk1 = axisSkewness(vertices, n, centroid, vecs[1])
  const sk2 = axisSkewness(vertices, n, centroid, vecs[2])
  const c0 = canonicalizeAxis(vecs[0], sk0)
  const c1 = canonicalizeAxis(vecs[1], sk1)
  const c2 = canonicalizeAxis(vecs[2], sk2)
  const a0 = c0.axis, a1 = c1.axis, a2 = c2.axis
  // 每条轴嘅号是否几何歧义（skewness≈0）—— 指纹据此对该轴坐标做 |·| 折叠（旋转不变关键）。
  const signAmbiguous: [boolean, boolean, boolean] = [c0.ambiguous, c1.ambiguous, c2.ambiguous]
  const axes: [Vec3, Vec3, Vec3] = [a0, a1, a2]
  // scale：点云投影落框架轴后嘅 bbox 对角（旋转不变）
  let s0min = Infinity, s0max = -Infinity, s1min = Infinity, s1max = -Infinity, s2min = Infinity, s2max = -Infinity
  for (let i = 0; i < n; i++) {
    const dx = vertices[i * 3] - cx, dy = vertices[i * 3 + 1] - cy, dz = vertices[i * 3 + 2] - cz
    const s = dx * a0[0] + dy * a0[1] + dz * a0[2]
    const t = dx * a1[0] + dy * a1[1] + dz * a1[2]
    const u = dx * a2[0] + dy * a2[1] + dz * a2[2]
    if (s < s0min) s0min = s; if (s > s0max) s0max = s
    if (t < s1min) s1min = t; if (t > s1max) s1max = t
    if (u < s2min) s2min = u; if (u > s2max) s2max = u
  }
  const ext0 = s0max - s0min, ext1 = s1max - s1min, ext2 = s2max - s2min
  const scaleRaw = Math.hypot(ext0, ext1, ext2)
  const scale = scaleRaw > EPS ? scaleRaw : 1
  // wellConditioned：三个特征值都唔简并（两间隔都够大）→ 轴【方向】唯一稳定。
  //   ⚠ 只看特征值间隔，唔睇号歧义 —— 号由 skewness 定（不对称体）或 |·| 折叠中和（对称体，
  //   见 signAmbiguous）。长方体（惯量分离、但中心对称）轴方向唯一 → wellConditioned=true；
  //   立方体/球（惯量简并）→ false（连方向都唔唯一，advisory 'X' 由 resolver 降级）。
  const lam0 = vals[0]
  const wellConditioned =
    lam0 > EPS &&
    (vals[0] - vals[1]) / lam0 > FRAME_GAP_TOL &&
    (vals[1] - vals[2]) / lam0 > FRAME_GAP_TOL
  return { centroid, axes, scale, wellConditioned, signAmbiguous }
}

/**
 * 把一个 CAD 点投影落主框架（减质心 → 点落三轴 → 除 scale）→ [s,t,n]。
 *
 * ⚠ 号歧义折叠（S136 旋转不变关键）：对 frame.signAmbiguous[k]=true 嘅轴（skewness≈0，
 *   该轴正负向几何分唔出，如中心对称长方体三轴），把投影坐标取 |·|。原因：呢种轴嘅号由
 *   max-|component| fallback 定，会随模型旋转翻；翻号 → 投影坐标变符号。取 |·| 后翻号唔影响
 *   → 同一几何点喺框架内嘅 key 对任意角度旋转都一致。对【号确定】嘅轴（skewness 有效）保留
 *   符号（更高分辨、压撞），因为佢嘅号本身已旋转不变。
 */
function normPtFrame(p: Vec3, frame: PrincipalFrame): Vec3 {
  const dx = p[0] - frame.centroid[0], dy = p[1] - frame.centroid[1], dz = p[2] - frame.centroid[2]
  const a = frame.axes
  const amb = frame.signAmbiguous
  const c0 = (dx * a[0][0] + dy * a[0][1] + dz * a[0][2]) / frame.scale
  const c1 = (dx * a[1][0] + dy * a[1][1] + dz * a[1][2]) / frame.scale
  const c2 = (dx * a[2][0] + dy * a[2][1] + dz * a[2][2]) / frame.scale
  return [
    amb[0] ? Math.abs(c0) : c0,
    amb[1] ? Math.abs(c1) : c1,
    amb[2] ? Math.abs(c2) : c2,
  ]
}

/**
 * v2 旋转不变边指纹（e2|…）。
 *
 * 同 v1 完全同一套特征（length / midpoint / ends / dir / sagitta / closed），只系坐标系换成
 * 主惯量框架（principalFrame）：所有位置经 normPtFrame、方向点落框架三轴（再取 |·| 排序 →
 * 同 v1 一样反向 / 反射不变）、长度除 frame.scale。框架随模型刚体旋转一齐转 → 指纹【旋转不变】。
 *
 * sagitta / closed 系几何内禀量（本来就旋转不变）→ 同 v1 逐字搬。
 *
 * 框架 not wellConditioned（对称体）→ 照计但前缀加 'X'（e2X|…）做 advisory 标志；
 * resolver（将来 slice）见到 'X' 应降级处理。本 slice 唔接线、唔降级。
 *
 * @param vertices 全模型 flat 顶点 [x,y,z,...]（定主框架）
 * @param edge     该 B-rep 边嘅有序采样 polyline
 * @returns e2|…（wellConditioned）或 e2X|…（degenerate frame，advisory）
 */
export function edgeFingerprintV2(vertices: ArrayLike<number>, edge: EdgePolyline): string {
  const g = edgeGeom(edge)
  const frame = principalFrame(vertices)
  const normLen = g.length / frame.scale
  const mid = normPtFrame(g.midpoint, frame)
  // 两端点投影落框架后【排序】→ polyline 反转都同 key（同 v1）
  const e0 = normPtFrame(g.start, frame)
  const e1 = normPtFrame(g.end, frame)
  const eA = ptKey(e0), eB = ptKey(e1)
  const ends = eA <= eB ? `${eA};${eB}` : `${eB};${eA}`
  // 方向：弦向量点落框架三轴 → 框架坐标系内嘅方向分量（旋转不变），再取 |·| 排序（同 v1 反向/镜像不变）
  const cdx = g.end[0] - g.start[0], cdy = g.end[1] - g.start[1], cdz = g.end[2] - g.start[2]
  const a = frame.axes
  const f0 = cdx * a[0][0] + cdy * a[0][1] + cdz * a[0][2]
  const f1 = cdx * a[1][0] + cdy * a[1][1] + cdz * a[1][2]
  const f2 = cdx * a[2][0] + cdy * a[2][1] + cdz * a[2][2]
  const dLen = Math.hypot(f0, f1, f2) || 1
  const dirs = [Math.abs(f0) / dLen, Math.abs(f1) / dLen, Math.abs(f2) / dLen].sort((x, y) => x - y)
  const dkey = `${q(dirs[0], DIR_TOL)}/${q(dirs[1], DIR_TOL)}/${q(dirs[2], DIR_TOL)}`
  const mkey = ptKey(mid)
  const lkey = q(normLen, LEN_TOL)
  const skey = q(g.sagitta, SAG_TOL)     // sagitta 内禀 → 旋转不变，同 v1 搬
  const ckey = g.closed ? 'C' : 'O'      // closed 内禀 → 旋转不变，同 v1 搬
  const prefix = frame.wellConditioned ? 'e2' : 'e2X'   // X = degenerate frame（advisory）
  return `${prefix}|l:${lkey}|m:${mkey}|e:${ends}|d:${dkey}|s:${skey}|${ckey}`
}

// ── 一条边嘅拣选记录（旧 / 新 mesh 都系呢个形）──────────────────────────────────
// near = 用户原本拣边嘅 3D 点（store 已存喺 feature.near / feature.nears）；
// poly = 该边嘅采样 polyline（worker 重建后逐条边 sample 出，畀指纹用）。
export type EdgeRecord = { poly: EdgePolyline }

/**
 * 整组边嘅【指纹 → 索引】映射（重建后嘅 shape.edges 顺序索引）。
 * ⚠ 撞指纹 → 后者覆盖前者（Map.set 行为）。撞率见文件头边界 2（对称体）。
 */
export function buildEdgeFingerprintMap(
  vertices: ArrayLike<number>,
  edges: ReadonlyArray<EdgeRecord>,
): Map<string, number> {
  const map = new Map<string, number>()
  for (let i = 0; i < edges.length; i++) {
    map.set(edgeFingerprint(vertices, edges[i].poly), i)
  }
  return map
}

/**
 * 把【旧 near-point 拣边】迁移到重建后嘅边集，返回应拣嗰条新边嘅索引 + 命中方式。
 *
 * 流程：
 *   1. 喺【旧】边集用 near-point 揾返用户当初拣咗边条（同 worker roundNearPoint 一样：sample 最近）。
 *   2. 算嗰条旧边嘅指纹。
 *   3. 喺【新】边集揾同指纹嘅边 → 命中即【精确跟】（'fingerprint'）。
 *   4. 揾唔到（几何变咗 / 撞咗冇命中）→ 退回喺新边集用同一个 near 点做 near-point（'fallback'）；
 *      至少唔会无故 throw，行为退化到「同而家一样」。
 *
 * 用法（worker 接线）：
 *   旧重建时已经为每条 shape.edges sample 咗 poly（EdgeRecord[]），连同当初 near 一齐传入；
 *   新重建出新 EdgeRecord[] 后 call 呢个 → 攞返 newIndex → 用 newEdges[newIndex] 嘅中点做 containsPoint。
 *
 * 边界（诚实）：
 *   - 旧/新边集任何一边为空 → 返 null（冇得迁移）。
 *   - 指纹撞（对称体）→ 可能跟错另一条同指纹边（method='fingerprint' 但跟错）；见文件头边界 2。
 *   - 几何真系变咗 → method='fallback'，结果同而家裸 near-point 一样（唔会更差）。
 *
 * @returns { newIndex, method } 或 null。method='fingerprint'（精确）/ 'fallback'（退回 near-point）。
 */
export function remapEdgePick(
  near: Vec3,
  oldVertices: ArrayLike<number>,
  oldEdges: ReadonlyArray<EdgeRecord>,
  newVertices: ArrayLike<number>,
  newEdges: ReadonlyArray<EdgeRecord>,
): { newIndex: number; method: 'fingerprint' | 'fallback' } | null {
  if (oldEdges.length === 0 || newEdges.length === 0) return null
  // 1. 旧边集 near-point：揾用户当初拣咗边条（sample polyline 最近点，同 worker 行为一致）
  const oldIdx = nearestEdge(near, oldEdges)
  if (oldIdx < 0) return null
  // 2. 旧边指纹
  const fp = edgeFingerprint(oldVertices, oldEdges[oldIdx].poly)
  // 3. 新边集找同指纹
  const newMap = buildEdgeFingerprintMap(newVertices, newEdges)
  const hit = newMap.get(fp)
  if (hit != null) return { newIndex: hit, method: 'fingerprint' }
  // 4. 退回 near-point（行为退化到而家）
  const fb = nearestEdge(near, newEdges)
  if (fb < 0) return null
  return { newIndex: fb, method: 'fallback' }
}

/**
 * near-point 揾最近边（复刻 worker roundNearPoint 嘅「逐边 sample pointAt 揾最近」逻辑）。
 * @returns 最近边索引；边集空 → -1。
 */
export function nearestEdge(near: Vec3, edges: ReadonlyArray<EdgeRecord>): number {
  let best = -1, bestD = Infinity
  for (let i = 0; i < edges.length; i++) {
    const poly = edges[i].poly
    let dmin = Infinity
    for (let k = 0; k < poly.length; k++) {
      const d = (poly[k][0] - near[0]) ** 2 + (poly[k][1] - near[1]) ** 2 + (poly[k][2] - near[2]) ** 2
      if (d < dmin) dmin = d
    }
    if (dmin < bestD) { bestD = dmin; best = i }
  }
  return best
}
