// faceFingerprint.ts — 「持久面身份」几何指纹（roadmap #2 / 审计第 2 大差距）
//
// 问题：B-rep 面 id 而家 = OCCT hashCode（MeshData.faceGroups[].faceId），跨重建唔稳 →
//   逐面外观（store.faceColors，key=String(faceId)）重建即失、Fillet/Chamfer 选边漂移、
//   逐面材质无法持久。
//
// 解决方向：用【几何指纹】做一个跨重建相对稳定嘅 face id —— face 几何唔变，指纹就唔变。
//   指纹由「一张 B-rep 面嘅三角集」（vertices 子集 + 法向 + 面积 + 拓扑计数）算出，
//   全部特征量化到容差格，令浮点抖动唔影响结果。
//
// ⚠ 诚实边界（务必睇清，唔好当 100% topological naming）：
//   1. 呢个系【几何指纹】，唔系真拓扑命名（topological naming / persistent naming）。
//      面【几何】变咗（俾参数改动影响：尺寸、位置、被布尔切走一截…）→ 指纹变 →
//      该面色丢失。呢个【可接受】——总好过而家「任何重建一律清空」。
//   2. 共面 / 对称 / 同尺寸嘅多张面【可能指纹撞】。我哋叠多个特征（连质心位置）压低撞率，
//      但【唔保证零撞】。撞咗 → buildFingerprintMap 后者覆盖前者（Map 行为），remap 时
//      该面色可能错跟另一张同指纹面。旋转对称体（正 N 棱柱侧面、立方体六面在某啲归一化下）
//      系已知高撞风险，下面 quantizeNormal / 质心位置系主要缓解。
//   3. 平移 / 整体缩放：质心用【模型 bbox 归一化】→ 平移+各向同性缩放都稳定；面积用
//      【相对 bbox 体积/面积尺度归一化】→ 缩放亦稳定。但【旋转】会改法向同质心方位 →
//      指纹变（几何指纹本质对旋转敏感，唔做主轴对齐；CAD 重建一般唔旋转既有几何，可接受）。
//
// 纯函数、无副作用。v1（f1|…）唔 import 任何现有文件；v2（f2|…，S136）只 import 同目录
// edgeFingerprint.ts 嘅 principalFrame（纯函数、零副作用）做旋转不变坐标系 —— 接线（worker
// 写 faceGroups / store 重建时 call remapFaceColors）由调用方自己做。

import { principalFrame, type PrincipalFrame } from './edgeFingerprint'

// ── 量化容差（毫米 / 单位法向）────────────────────────────────────────────────
// 量化 = 把浮点 round 到容差格，令 ±抖动落同一格 → 同 key。容差越大越稳（抗抖）但越易撞；
// 越细越能分辨但越易因抖动裂开。下面数值针对 mm 级 CAD + OCCT 0.04mm 三角化容差调校。
const POS_TOL = 0.01      // 质心位置量化：0.01（归一化后无量纲，~bbox 千分之一格）
const NORMAL_TOL = 0.01   // 法向分量量化：0.01（~0.57° 角分辨）
const AREA_TOL = 1e-4     // 面积（归一化后无量纲）量化格
const LEN_TOL = 1e-3      // 长度尺度（bbox 对角占比）量化格
const EPS = 1e-9

/** round 到容差格再转定长整数串，保证同格 → 同字串（负零归一）。 */
function q(value: number, tol: number): string {
  const n = Math.round(value / tol)
  return n === 0 ? '0' : String(n)   // -0 / +0 都变 '0'
}

type Vec3 = [number, number, number]
export type FaceGroup = { start: number; count: number; faceId: number }

// 内部几何量（畀测试同 debug 用，唔系对外契约）。
export type FaceGeom = {
  area: number              // 面三角集总面积（CAD 单位，未归一化）
  centroid: Vec3            // 面积加权质心（CAD 坐标，未归一化）
  normal: Vec3              // 面积加权平均单位法向（CAD 坐标）
  triCount: number          // 三角形数
  vertCount: number         // 去重顶点数（量化到 POS_TOL 格后）
  bboxDiag: number          // 该面自身 bbox 对角（CAD 单位）
}

/** 从一个三角 run（faceGroup）抽取原始几何量。start/count 系 triangles【数组下标】。 */
export function faceGeom(vertices: ArrayLike<number>, triangles: ArrayLike<number>, group: { start: number; count: number }): FaceGeom {
  let area2x = 0                                  // Σ|cross| = 2×面积
  let cx = 0, cy = 0, cz = 0                      // 面积加权质心累加
  let nx = 0, ny = 0, nz = 0                      // 面积加权法向累加（cross 本身带面积权）
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  const seen = new Set<string>()                  // 去重顶点（量化后）
  const end = group.start + group.count
  for (let i = group.start; i < end; i += 3) {
    const a = triangles[i] * 3, b = triangles[i + 1] * 3, c = triangles[i + 2] * 3
    const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2]
    const bx = vertices[b], by = vertices[b + 1], bz = vertices[b + 2]
    const ccx = vertices[c], ccy = vertices[c + 1], ccz = vertices[c + 2]
    // 边向量 + 叉积（= 2×三角面积×单位法向）
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az
    const e2x = ccx - ax, e2y = ccy - ay, e2z = ccz - az
    const crx = e1y * e2z - e1z * e2y
    const cry = e1z * e2x - e1x * e2z
    const crz = e1x * e2y - e1y * e2x
    const triA2 = Math.hypot(crx, cry, crz)       // 2×三角面积
    area2x += triA2
    // 质心：三角形心 ×面积权
    const tcx = (ax + bx + ccx) / 3, tcy = (ay + by + ccy) / 3, tcz = (az + bz + ccz) / 3
    cx += tcx * triA2; cy += tcy * triA2; cz += tcz * triA2
    // 法向：cross 已带面积权（共面三角同向叠加，曲面则平均朝向）
    nx += crx; ny += cry; nz += crz
    // bbox + 去重顶点
    for (const [vx, vy, vz] of [[ax, ay, az], [bx, by, bz], [ccx, ccy, ccz]] as Vec3[]) {
      if (vx < minX) minX = vx; if (vy < minY) minY = vy; if (vz < minZ) minZ = vz
      if (vx > maxX) maxX = vx; if (vy > maxY) maxY = vy; if (vz > maxZ) maxZ = vz
      seen.add(`${q(vx, POS_TOL)},${q(vy, POS_TOL)},${q(vz, POS_TOL)}`)
    }
  }
  const area = area2x / 2
  // 退化面（零面积）→ 用 bbox 算术中心避免除零
  const centroid: Vec3 = area2x > EPS
    ? [cx / area2x, cy / area2x, cz / area2x]
    : [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
  const nLen = Math.hypot(nx, ny, nz)
  const normal: Vec3 = nLen > EPS ? [nx / nLen, ny / nLen, nz / nLen] : [0, 0, 0]
  const triCount = Math.max(0, Math.floor(group.count / 3))
  const bboxDiag = Number.isFinite(minX)
    ? Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
    : 0
  return { area, centroid, normal, triCount, vertCount: seen.size, bboxDiag }
}

/**
 * 模型整体 bbox（全 vertices）—— 用嚟把质心 / 面积 / 长度【归一化】到模型尺度，
 * 令整体平移 + 各向同性缩放唔影响指纹（题目稳定性要求）。
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

/**
 * 几何指纹（跨重建相对稳定嘅 face id）。
 *
 * 用嘅特征（全部量化到容差，对刚体平移 + 各向同性缩放稳定；对旋转【敏感】，见文件头诚实边界）：
 *   - 法向方向（量化到 NORMAL_TOL）—— 平移/缩放不变；区分朝向唔同嘅面
 *   - 归一化质心位置（质心相对模型 bbox min，除以 bbox 对角；量化 POS_TOL）—— 平移+缩放不变；
 *     系压撞率嘅主力（同朝向但唔同位置嘅面分得开）
 *   - 归一化面积（面积 / bbox对角²；量化 AREA_TOL）—— 平移+缩放不变
 *   - 归一化自身 bbox 对角（/ 模型 bbox 对角；量化 LEN_TOL）—— 形状尺度特征
 *   - 三角数 + 去重顶点数 —— 纯拓扑计数，对任何刚体变换完全稳定（区分平面 vs 曲面细分密度）
 *
 * @param vertices  全模型 flat 顶点 [x,y,z,...]（CAD 坐标）
 * @param triangles 全模型三角索引（每 3 个一三角，值系顶点序号）
 * @param group     该 B-rep 面嘅三角 run（start/count 系 triangles 数组下标）
 * @returns 稳定字串 id；同一几何面跨重建应一致。⚠ 唔保证全局唯一（共面/对称面可能撞）。
 */
export function faceFingerprint(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  group: { start: number; count: number },
  modelVerts?: ArrayLike<number>,   // S125：归一化 bbox 用嘅模型顶点（缺省=vertices）。worker shell 接线传【全模型 bbox 角点】，
                                    // 而 vertices/triangles 传【单张面自身三角化】→ 归一化跨重建一致。缺省时同 S114 逐面色路径字节一致。
): string {
  const g = faceGeom(vertices, triangles, group)
  const box = modelBox(modelVerts ?? vertices)
  const scale = box.diag > EPS ? box.diag : 1     // 归一化尺度（模型对角）；退化模型 → 1（不归一）
  // 质心 → 相对 bbox min、除以尺度 → [0,1]ish 无量纲
  const rcx = (g.centroid[0] - box.min[0]) / scale
  const rcy = (g.centroid[1] - box.min[1]) / scale
  const rcz = (g.centroid[2] - box.min[2]) / scale
  const normArea = g.area / (scale * scale)       // 面积 / 尺度² → 缩放不变
  const normDiag = g.bboxDiag / scale             // 自身对角占模型对角比
  // 法向量化（先 round 再标准化符号：法向同 -法向喺曲面平均后可能差极小，量化吸收）
  const nkey = `${q(g.normal[0], NORMAL_TOL)}/${q(g.normal[1], NORMAL_TOL)}/${q(g.normal[2], NORMAL_TOL)}`
  const ckey = `${q(rcx, POS_TOL)}/${q(rcy, POS_TOL)}/${q(rcz, POS_TOL)}`
  const akey = q(normArea, AREA_TOL)
  const dkey = q(normDiag, LEN_TOL)
  // 拼成稳定字串（版本前缀 f1 → 将来改特征唔会同旧 key 静默撞）
  return `f1|n:${nkey}|c:${ckey}|a:${akey}|d:${dkey}|t:${g.triCount}|v:${g.vertCount}`
}

// ════════════════════════════════════════════════════════════════════════════
// v2：旋转不变面指纹（rotation-invariant face fingerprint）—— S136
// ════════════════════════════════════════════════════════════════════════════
//
// v1（f1|…）用【模型 bbox】归一化（modelBox）：平移 + 各向同性缩放稳定，但对【旋转】敏感
// （bbox 同质心方位 / 法向都随旋转改）。v2（f2|…）改用模型嘅【主惯量框架】（principalFrame，
// 同 edgeFingerprintV2 共用嗰个 PCA 框架）做坐标系：框架随模型刚体旋转一齐转 → 面喺框架坐标系内
// 嘅质心位置 / 法向 / 面积 / 对角【任意角度旋转不变】。特征集同 v1 完全一样（normal / centroid /
// area / diag / triCount / vertCount），只系换咗坐标系。
//
// ⚠ 诚实边界（同 edgeFingerprintV2 一脉相承，务必睇清）：
//   1. 框架唯一性靠特征值【有间隔】：principalFrame.wellConditioned=false（立方/球，惯量简并）→
//      框架方向唔唯一 → f2 指纹唔可靠 → 前缀加 'X'（f2X|…）做 advisory，由 resolver 降级。
//   2. 号歧义折叠：对 signAmbiguous[k]=true 嘅轴（skewness≈0，中心对称体），质心 / 法向喺该轴
//      嘅分量取 |·| 折叠（同 edge normPtFrame）→ 翻号唔影响 key → 该轴旋转不变。代价同 edge 边界 3：
//      中心+轴对称体（如立方体）由对称关联嘅多张面（±X/±Y/±Z）会折叠到同一 key → f2 撞率高过 f1
//      （f1 靠固定 bbox 框架硬分，但嗰种分得开非旋转不变、系坐标系假象）。分对称面要真拓扑序，
//      几何指纹做唔到。非对称体唔折叠 → f2 分辨同 f1 相当。
//   3. 仍受 v1 边界 1 限制：面几何真变 → 指纹变。v2 只多解决【旋转】一项。
//   4. 缩放：area / scale²、diag / scale（scale=框架内点云 bbox 对角，随各向同性缩放线性）→
//      各向同性缩放不变（同 v1）。
//
// 纯函数、零副作用；只多 import 同目录 principalFrame（亦纯函数）。唔接线、唔改 v1。

/**
 * 把一个 CAD 点投影落主框架（减质心 → 点落三轴 → 除 scale），对号歧义轴取 |·| 折叠 → [s,t,n]。
 * 同 edgeFingerprint.normPtFrame 同款逻辑（旋转不变关键），喺此独立实现以免改 edge 文件对外契约。
 */
function projPtFrame(p: Vec3, frame: PrincipalFrame): Vec3 {
  const dx = p[0] - frame.centroid[0], dy = p[1] - frame.centroid[1], dz = p[2] - frame.centroid[2]
  const a = frame.axes
  const amb = frame.signAmbiguous
  const c0 = (dx * a[0][0] + dy * a[0][1] + dz * a[0][2]) / frame.scale
  const c1 = (dx * a[1][0] + dy * a[1][1] + dz * a[1][2]) / frame.scale
  const c2 = (dx * a[2][0] + dy * a[2][1] + dz * a[2][2]) / frame.scale
  return [amb[0] ? Math.abs(c0) : c0, amb[1] ? Math.abs(c1) : c1, amb[2] ? Math.abs(c2) : c2]
}

/**
 * 把一个【方向向量】（如法向，唔减质心）转入主框架三轴，对号歧义轴取 |·| 折叠 → [s,t,n]。
 * 法向唔减质心（系自由向量）、唔除 scale（系单位向量）—— 同 projPtFrame 唯一分别。
 */
function projDirFrame(d: Vec3, frame: PrincipalFrame): Vec3 {
  const a = frame.axes
  const amb = frame.signAmbiguous
  const c0 = d[0] * a[0][0] + d[1] * a[0][1] + d[2] * a[0][2]
  const c1 = d[0] * a[1][0] + d[1] * a[1][1] + d[2] * a[1][2]
  const c2 = d[0] * a[2][0] + d[1] * a[2][1] + d[2] * a[2][2]
  return [amb[0] ? Math.abs(c0) : c0, amb[1] ? Math.abs(c1) : c1, amb[2] ? Math.abs(c2) : c2]
}

/**
 * 该面喺【主框架坐标系】嘅 bbox 对角（除 scale）—— 旋转不变嘅尺寸特征。
 *
 * ⚠ 唔可以用 faceGeom.bboxDiag：嗰个系【世界 XYZ 轴对齐】嘅 bbox，单张面旋转后世界 AABB 会变
 *   （非旋转不变）。改为把面嘅每个三角顶点投影落框架三轴，取框架内 AABB → 对角随刚体旋转不变。
 *   号歧义轴只影响【号】唔影响【展开范围】（max-min），故无需折叠（min/max 自动吸收平移、号无关）。
 */
function frameDiag(
  vertices: ArrayLike<number>, triangles: ArrayLike<number>,
  group: { start: number; count: number }, frame: PrincipalFrame,
): number {
  let min0 = Infinity, min1 = Infinity, min2 = Infinity
  let max0 = -Infinity, max1 = -Infinity, max2 = -Infinity
  const a = frame.axes, c = frame.centroid
  const end = group.start + group.count
  let any = false
  for (let i = group.start; i < end; i++) {
    const v = triangles[i] * 3
    const dx = vertices[v] - c[0], dy = vertices[v + 1] - c[1], dz = vertices[v + 2] - c[2]
    const p0 = dx * a[0][0] + dy * a[0][1] + dz * a[0][2]
    const p1 = dx * a[1][0] + dy * a[1][1] + dz * a[1][2]
    const p2 = dx * a[2][0] + dy * a[2][1] + dz * a[2][2]
    if (p0 < min0) min0 = p0; if (p0 > max0) max0 = p0
    if (p1 < min1) min1 = p1; if (p1 > max1) max1 = p1
    if (p2 < min2) min2 = p2; if (p2 > max2) max2 = p2
    any = true
  }
  if (!any) return 0
  return Math.hypot(max0 - min0, max1 - min1, max2 - min2) / frame.scale
}

/**
 * v2 旋转不变面指纹（f2|…）。
 *
 * 同 v1 完全同一套特征（normal / centroid / area / diag / triCount / vertCount），只系坐标系换成
 * 主惯量框架（principalFrame）：质心经 projPtFrame、法向经 projDirFrame（号歧义轴 |·| 折叠）、
 * 面积除 scale²、对角除 scale。框架随模型刚体旋转一齐转 → 指纹【旋转不变】。
 *
 * triCount / vertCount 系拓扑计数（本来旋转不变）→ 同 v1 逐字搬。
 *
 * 框架 not wellConditioned（对称体，惯量简并）→ 照计但前缀加 'X'（f2X|…）做 advisory；
 * resolver（将来 slice）见到 'X' 应降级处理。本 slice 唔接线、唔降级。
 *
 * @param vertices  全模型 flat 顶点（或单张面三角化顶点）—— faceGeom 用嚟算面几何量
 * @param triangles 三角索引（每 3 个一三角）
 * @param group     该 B-rep 面嘅三角 run（start/count 系 triangles 数组下标）
 * @param modelVerts 定主框架 + scale 嘅模型点云（缺省 = vertices）。worker 接线传【全模型顶点云】，
 *                   而 vertices/triangles 传【单张面三角化】→ 框架跨重建一致（同 v1 modelVerts 角色）。
 * @returns f2|…（wellConditioned）或 f2X|…（degenerate frame，advisory）
 */
export function faceFingerprintV2(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  group: { start: number; count: number },
  modelVerts?: ArrayLike<number>,
): string {
  const g = faceGeom(vertices, triangles, group)
  const frame = principalFrame(modelVerts ?? vertices)
  // 质心 → 框架坐标（号歧义轴折叠）
  const c = projPtFrame(g.centroid, frame)
  // 法向 → 框架坐标（号歧义轴折叠）。再【取 |·| 排序】令反向 / 反射对称同 key（同 v1 法向量化精神 +
  // edge dir 处理一致：曲面平均法向 ±n 喺号确定轴亦可能差极小，排序吸收朝向歧义）。
  const nf = projDirFrame(g.normal, frame)
  const nsorted = [Math.abs(nf[0]), Math.abs(nf[1]), Math.abs(nf[2])].sort((x, y) => x - y)
  const normArea = g.area / (frame.scale * frame.scale)   // 面积 / 框架尺度² → 缩放不变（内禀，旋转不变）
  const normDiag = frameDiag(vertices, triangles, group, frame)  // 面喺框架内 AABB 对角 / scale → 旋转不变
  const nkey = `${q(nsorted[0], NORMAL_TOL)}/${q(nsorted[1], NORMAL_TOL)}/${q(nsorted[2], NORMAL_TOL)}`
  const ckey = `${q(c[0], POS_TOL)}/${q(c[1], POS_TOL)}/${q(c[2], POS_TOL)}`
  const akey = q(normArea, AREA_TOL)
  const dkey = q(normDiag, LEN_TOL)
  const prefix = frame.wellConditioned ? 'f2' : 'f2X'     // X = degenerate frame（advisory）
  return `${prefix}|n:${nkey}|c:${ckey}|a:${akey}|d:${dkey}|t:${g.triCount}|v:${g.vertCount}`
}

/**
 * 整个 mesh 嘅【指纹 → faceId(hashCode)】映射。
 * ⚠ 撞指纹 → 后处理嘅 group 覆盖前者（Map.set 行为）。一张 B-rep 面可能拆成多个 faceGroup
 *    （同 faceId）；佢哋指纹相同（同一几何）会互相覆盖落同一 faceId，符合预期（同面同色）。
 */
export function buildFingerprintMap(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  faceGroups: ReadonlyArray<FaceGroup>,
): Map<string, number> {
  const map = new Map<string, number>()
  // 先把同 faceId 嘅多个 group 合并算指纹（用第一个 group 之 start 算？唔得 —— 要全 run）。
  // 做法：按 faceId 收集所有 group，合并成一个虚拟 run 逐个算。但 group 嘅 start/count 唔连续，
  // 故对每个 faceId 自建一个合并三角索引子集去算指纹，确保「整张面」嘅几何（唔系单个 group 碎片）。
  const byFace = new Map<number, { start: number; count: number }[]>()
  for (const g of faceGroups) {
    const arr = byFace.get(g.faceId) ?? []
    arr.push({ start: g.start, count: g.count })
    byFace.set(g.faceId, arr)
  }
  for (const [faceId, groups] of byFace) {
    const fp = faceFingerprintMerged(vertices, triangles, groups)
    map.set(fp, faceId)
  }
  return map
}

/** 多个 run（同一 B-rep 面拆成几段）合并算一个指纹 —— 等同把佢哋当一整张面。 */
export function faceFingerprintMerged(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  groups: ReadonlyArray<{ start: number; count: number }>,
): string {
  if (groups.length === 1) return faceFingerprint(vertices, triangles, groups[0])
  // 合并：把所有 run 嘅三角索引拼成一个新连续数组，再当单一 run 算（start=0, count=全长）。
  const merged: number[] = []
  for (const g of groups) {
    const end = g.start + g.count
    for (let i = g.start; i < end; i++) merged.push(triangles[i])
  }
  return faceFingerprint(vertices, merged, { start: 0, count: merged.length })
}

/**
 * 用几何指纹把【旧 faceColors】（key=旧 hashCode 字串）迁移到【新 mesh 嘅 hashCode 字串】。
 * → 重建后保住逐面色（红色跟返同一几何面）。
 *
 * 流程：
 *   1. 旧 mesh 建【指纹 → 旧 faceId】（buildFingerprintMap）→ 反过来畀【旧 faceId → 指纹】查。
 *   2. 新 mesh 建【指纹 → 新 faceId】。
 *   3. 逐条旧色：旧 hashCode-key → 旧指纹 → 新 faceId → 写新 hashCode-key。
 *
 * 边界（诚实）：
 *   - 旧 key 喺旧 mesh 揾唔到对应 faceGroup（mesh 同 colors 唔配套）→ 跳过该色。
 *   - 旧指纹喺新 mesh 揾唔到（该面几何变咗/无咗）→ 跳过（颜色丢失，可接受）。
 *   - 多张面撞指纹 → 可能错迁移（跟咗另一张同指纹面）；同文件头边界 2。
 *
 * @returns 新 faceColors（key=新 hashCode 字串, value=hex）。
 */
export function remapFaceColors(
  oldColors: Record<string, string>,
  oldGroups: ReadonlyArray<FaceGroup>,
  oldVerts: ArrayLike<number>,
  oldTris: ArrayLike<number>,
  newGroups: ReadonlyArray<FaceGroup>,
  newVerts: ArrayLike<number>,
  newTris: ArrayLike<number>,
): Record<string, string> {
  if (!oldColors || Object.keys(oldColors).length === 0) return {}
  // 旧 faceId(数字) → 指纹
  const oldFaceToFp = new Map<number, string>()
  {
    const byFace = new Map<number, { start: number; count: number }[]>()
    for (const g of oldGroups) {
      const arr = byFace.get(g.faceId) ?? []
      arr.push({ start: g.start, count: g.count })
      byFace.set(g.faceId, arr)
    }
    for (const [faceId, groups] of byFace) oldFaceToFp.set(faceId, faceFingerprintMerged(oldVerts, oldTris, groups))
  }
  // 新指纹 → 新 faceId
  const newFpToFace = buildFingerprintMap(newVerts, newTris, newGroups)
  const out: Record<string, string> = {}
  for (const [oldKey, hex] of Object.entries(oldColors)) {
    const oldFaceId = Number(oldKey)
    if (!Number.isFinite(oldFaceId)) continue                 // 非数字 key（防御）→ 跳
    const fp = oldFaceToFp.get(oldFaceId)
    if (fp == null) continue                                   // 旧 mesh 揾唔到该面 → 跳
    const newFaceId = newFpToFace.get(fp)
    if (newFaceId == null) continue                            // 新 mesh 无对应几何面 → 颜色丢失（诚实）
    out[String(newFaceId)] = hex
  }
  return out
}
