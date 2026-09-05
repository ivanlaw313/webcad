/**
 * meshProject.ts — 网格正交投影模块（零依赖，main thread 可用）
 *
 * 用途：装配工程图。装配组件系烘焙网格（无 B-rep），呢度从三角网格直接
 * 提取「工程图线条」：轮廓边（silhouette）+ 特征边（dihedral > 24°）。
 *
 * 诚实声明：呢个系 mesh 级近似 ——
 *   - 冇隐藏线消除（HLR），所有线条都画出嚟；
 *   - 冇圆弧识别，曲面输出嘅系细碎直线段；
 *   - 特征边判据同视口 Edges threshold 24° 同款。
 *
 * 坐标约定：
 *   - 输入网格系 CAD Z-up 坐标；matrix 系 CAD→世界 CAD 嘅 4×4 column-major
 *     变换（three.js Matrix4.elements 同款布局）。three 场景嘅 -90°X 唔关呢度事，
 *     调用方负责传啱。
 *   - 视图 2D 映射（右手，工程图惯例，Z 向上 = 画面向上）：
 *       front（前视，望 -Y）  → 2D = (x, z)
 *       top  （顶视，望 -Z）  → 2D = (x, y)
 *       right（右视，望 -X，即从 +X 望返嚟）→ 2D = (y, z)
 */

/** 一条 2D 线段：x1, y1, x2, y2（视图 2D 坐标） */
export type Seg2 = [number, number, number, number];

export type ViewName = 'front' | 'top' | 'right';

export interface MeshEdgeProjection {
  segs: Seg2[];
  /** minx, miny, maxx, maxy；无输出线段时为 [0,0,0,0] */
  bbox: [number, number, number, number];
}

/** 特征边二面角阈值（度） —— 同视口 Edges threshold 一致 */
const FEATURE_ANGLE_DEG = 24;
const FEATURE_DOT = Math.cos((FEATURE_ANGLE_DEG * Math.PI) / 180);
/** 顶点焊接量化步长 */
const WELD_QUANT = 1e-4;
/** 朝向/退化判断容差 */
const EPS = 1e-9;

/** 每条唯一边记低嘅资料：焊接后端点 + 各相邻三角形嘅世界法线 */
interface EdgeRec {
  a: number;
  b: number;
  nx: number[];
  ny: number[];
  nz: number[];
}

/**
 * 从三角网格提取工程图线条（轮廓边 + 特征边）嘅正交投影。
 *
 * @param vertices  扁平顶点数组 [x0,y0,z0, x1,y1,z1, ...]（CAD Z-up）
 * @param triangles 扁平索引数组，每 3 个一个三角形
 * @param matrix    16 元 column-major 世界变换（three.js Matrix4.elements 同款）
 * @param view      视图名
 */
export function projectMeshEdges(
  vertices: number[],
  triangles: number[],
  matrix: number[],
  view: ViewName,
): MeshEdgeProjection {
  const segs: Seg2[] = [];
  const vCount = Math.floor(vertices.length / 3);
  const triCount = Math.floor(triangles.length / 3);
  if (vCount === 0 || triCount === 0) {
    return { segs, bbox: [0, 0, 0, 0] };
  }
  if (matrix.length < 16) {
    throw new Error('projectMeshEdges: matrix 需要 16 个元素（column-major）');
  }

  // ── 1. 顶点世界变换（column-major：x' = m0·x + m4·y + m8·z + m12 …） ──
  const m = matrix;
  const wx = new Float64Array(vCount);
  const wy = new Float64Array(vCount);
  const wz = new Float64Array(vCount);
  for (let i = 0; i < vCount; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    wx[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    wy[i] = m[1] * x + m[5] * y + m[9] * z + m[13];
    wz[i] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }

  // ── 2. 焊接重复顶点（量化 1e-4），等三角形 soup（如 STL）都拼到边表 ──
  const inv = 1 / WELD_QUANT;
  const weldOf = new Int32Array(vCount); // 原索引 → 焊接索引
  const px: number[] = [];
  const py: number[] = [];
  const pz: number[] = [];
  const keyMap = new Map<string, number>();
  for (let i = 0; i < vCount; i++) {
    const key = `${Math.round(wx[i] * inv)},${Math.round(wy[i] * inv)},${Math.round(wz[i] * inv)}`;
    let w = keyMap.get(key);
    if (w === undefined) {
      w = px.length;
      keyMap.set(key, w);
      px.push(wx[i]);
      py.push(wy[i]);
      pz.push(wz[i]);
    }
    weldOf[i] = w;
  }

  // ── 3. 建边表：每条唯一边记低两侧三角形嘅世界法线 ──
  const edges = new Map<string, EdgeRec>();
  const addEdge = (a: number, b: number, nx: number, ny: number, nz: number): void => {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    let rec = edges.get(key);
    if (rec === undefined) {
      rec = { a: Math.min(a, b), b: Math.max(a, b), nx: [], ny: [], nz: [] };
      edges.set(key, rec);
    }
    rec.nx.push(nx);
    rec.ny.push(ny);
    rec.nz.push(nz);
  };

  for (let t = 0; t < triCount; t++) {
    const i0 = triangles[t * 3];
    const i1 = triangles[t * 3 + 1];
    const i2 = triangles[t * 3 + 2];
    if (
      !(i0 >= 0 && i0 < vCount) ||
      !(i1 >= 0 && i1 < vCount) ||
      !(i2 >= 0 && i2 < vCount)
    ) {
      continue; // 索引越界守卫
    }
    const a = weldOf[i0];
    const b = weldOf[i1];
    const c = weldOf[i2];
    if (a === b || b === c || c === a) continue; // 焊接后塌缩 → 退化

    // 世界系面法线（用变换后顶点计，自动啱非均匀缩放）
    const abx = px[b] - px[a];
    const aby = py[b] - py[a];
    const abz = pz[b] - pz[a];
    const acx = px[c] - px[a];
    const acy = py[c] - py[a];
    const acz = pz[c] - pz[a];
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz);
    if (len < EPS) continue; // 面积≈0 嘅退化三角形跳过
    nx /= len;
    ny /= len;
    nz /= len;

    addEdge(a, b, nx, ny, nz);
    addEdge(b, c, nx, ny, nz);
    addEdge(c, a, nx, ny, nz);
  }

  // ── 4. 视向 ──
  let vdx = 0;
  let vdy = 0;
  let vdz = 0;
  if (view === 'front') vdy = -1;
  else if (view === 'top') vdz = -1;
  else vdx = -1; // right：望 -X（从 +X 望返嚟）

  // ── 5. 筛选输出边 + 2D 投影 + bbox ──
  let minx = Infinity;
  let miny = Infinity;
  let maxx = -Infinity;
  let maxy = -Infinity;

  for (const e of edges.values()) {
    const nFaces = e.nx.length;
    let out = false;

    if (nFaces === 1) {
      // ①b 边界边（开网格只有一侧）→ 直接输出
      out = true;
    } else {
      // 多面（含非流形 >2）逐对检查
      for (let i = 0; i < nFaces && !out; i++) {
        const fi = e.nx[i] * vdx + e.ny[i] * vdy + e.nz[i] * vdz;
        for (let j = i + 1; j < nFaces; j++) {
          // ①a 轮廓边：一面朝镜头一面背（朝向 dot 异号）
          const fj = e.nx[j] * vdx + e.ny[j] * vdy + e.nz[j] * vdz;
          if ((fi > EPS && fj < -EPS) || (fi < -EPS && fj > EPS)) {
            out = true;
            break;
          }
          // ② 特征边：二面角 > 24°（dot(n1,n2) < cos 24°）
          const d = e.nx[i] * e.nx[j] + e.ny[i] * e.ny[j] + e.nz[i] * e.nz[j];
          if (d < FEATURE_DOT) {
            out = true;
            break;
          }
        }
      }
    }
    if (!out) continue;

    let u1: number, v1: number, u2: number, v2: number;
    if (view === 'front') {
      u1 = px[e.a]; v1 = pz[e.a]; u2 = px[e.b]; v2 = pz[e.b];
    } else if (view === 'top') {
      u1 = px[e.a]; v1 = py[e.a]; u2 = px[e.b]; v2 = py[e.b];
    } else {
      u1 = py[e.a]; v1 = pz[e.a]; u2 = py[e.b]; v2 = pz[e.b];
    }
    segs.push([u1, v1, u2, v2]);
    if (u1 < minx) minx = u1;
    if (u2 < minx) minx = u2;
    if (u1 > maxx) maxx = u1;
    if (u2 > maxx) maxx = u2;
    if (v1 < miny) miny = v1;
    if (v2 < miny) miny = v2;
    if (v1 > maxy) maxy = v1;
    if (v2 > maxy) maxy = v2;
  }

  if (segs.length === 0) {
    return { segs, bbox: [0, 0, 0, 0] };
  }
  return { segs, bbox: [minx, miny, maxx, maxy] };
}

/**
 * 将线段集拼成一条 SVG path（"M x y L x y M …"）。
 * yFlip 时 y 取负：SVG y 轴向下，而工程图 z 向上。
 */
export function segsToSvgPath(segs: Seg2[], yFlip = true): string {
  const sy = yFlip ? -1 : 1;
  const parts: string[] = [];
  for (const s of segs) {
    parts.push(
      `M ${fmtNum(s[0])} ${fmtNum(s[1] * sy)} L ${fmtNum(s[2])} ${fmtNum(s[3] * sy)}`,
    );
  }
  return parts.join(' ');
}

/** 数字格式化：1e-6 取整，避免 "-0" 同超长小数尾巴 */
function fmtNum(v: number): string {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? '0' : String(r);
}
