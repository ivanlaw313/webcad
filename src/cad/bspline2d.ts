// bspline2d.ts — 纯 2D 立方 B 样条曲线模块 (Cox–de Boor, 零依赖)
//
// 草图样条嘅「真 B 样条」实现 — 取代 catmullRomClosed（插值型 Catmull-Rom）。
// 与 Catmull-Rom 的区别:
//   - B 样条「逼近」控制多边形（曲线落喺控制点凸包内, 一般唔过控制点），
//     而插值样条「流过」每个控制点。
//   - clamped（夹紧）端点结点重数 = degree+1 → 曲线精确过首/末控制点, 端点切线沿首/末控制边。
//   - periodic（周期）闭合 → 控制点环绕复用, 接缝处 C^(degree-1) 连续（立方即 C2, 无折角）。
//
// 算法: Cox–de Boor 基函数递推 + 均匀结点向量。纯函数, 唔修改入参, 零 import。
//
// 参考惯例:
//   阶数 p（degree, 默认 3 = 立方）, 控制点 n 个（索引 0..n-1）。
//   clamped uniform 结点向量 U 长度 = n + p + 1:
//     头 p+1 个 = 0, 尾 p+1 个 = 1, 中间 (n-p-1) 个均匀分布于 (0,1)。
//   periodic uniform 结点向量: 均匀整数结点, 控制点环绕 (P[i mod n]) 扩展 p 个 → 接缝平滑。

export type Vec2 = [number, number];

export interface BSplineOpts {
  /** 阶数 (degree), 默认 3 (立方)。degree=1 → 折线 (= 控制多边形)。 */
  degree?: number;
  /** 闭合 → 周期 B 样条 (接缝 C^(p-1) 连续)。默认 false (夹紧开放曲线)。 */
  closed?: boolean;
  /** 输出采样点总数, 默认 100。至少 2。 */
  samples?: number;
}

/**
 * 采样一条 2D 立方 (默认) B 样条曲线。
 *
 * @param ctrl 控制点列 [[x,y], ...]。
 * @param opts degree / closed / samples。
 * @returns 沿曲线均匀参数采样嘅点列 [[x,y], ...]。
 *
 * 行为约定:
 *   - degree=1 → 返回精确穿过每个控制点嘅折线 (线性插值)。
 *   - clamped (closed=false) 立方 → 曲线精确过首 ctrl[0] 同末 ctrl[n-1]。
 *   - 任何情况下采样点都落喺控制点凸包内 (B 样条凸包性)。
 *   - periodic (closed=true) → 闭合环, 接缝处切线连续 (无折角)。
 */
export function sampleBSpline(ctrl: Vec2[], opts: BSplineOpts = {}): Vec2[] {
  const degree = opts.degree ?? 3;
  const closed = opts.closed ?? false;
  const samples = Math.max(2, opts.samples ?? 100);

  const n = ctrl.length;
  if (n === 0) return [];
  if (degree < 1) throw new Error('bspline2d: degree 须 ≥ 1');
  if (n === 1) {
    // 单控制点 → 退化为该点重复。
    const out: Vec2[] = [];
    for (let i = 0; i < samples; i++) out.push([ctrl[0][0], ctrl[0][1]]);
    return out;
  }

  if (closed) return samplePeriodic(ctrl, degree, samples);
  return sampleClamped(ctrl, degree, samples);
}

// ---------- 夹紧 (clamped) 开放 B 样条 ----------

function sampleClamped(ctrl: Vec2[], degree: number, samples: number): Vec2[] {
  const n = ctrl.length;
  // 控制点太少, 无法支撑该阶数 → 降阶到 n-1。
  const p = Math.min(degree, n - 1);

  // clamped uniform 结点: 头 p+1 个 0, 尾 p+1 个 1, 中间均匀。
  const m = n + p + 1; // 结点总数
  const U = new Array<number>(m);
  for (let i = 0; i <= p; i++) U[i] = 0;
  for (let i = m - p - 1; i < m; i++) U[i] = 1;
  const interior = n - p - 1; // 中间内部结点个数
  for (let j = 1; j <= interior; j++) {
    U[p + j] = j / (interior + 1);
  }

  const out: Vec2[] = [];
  const uStart = U[p];
  const uEnd = U[n]; // = U[m-p-1]
  for (let s = 0; s < samples; s++) {
    // 最后一个采样点取 uEnd 但略向内收 (避免落喺定义域外), 保证精确过末控制点。
    let u = uStart + ((uEnd - uStart) * s) / (samples - 1);
    if (u >= uEnd) u = uEnd - 1e-12;
    if (u < uStart) u = uStart;
    out.push(deBoor(ctrl, U, p, u));
  }
  // 强制端点精确 (浮点收尾): clamped 端点理论上 = ctrl[0] / ctrl[n-1]。
  out[0] = [ctrl[0][0], ctrl[0][1]];
  out[samples - 1] = [ctrl[n - 1][0], ctrl[n - 1][1]];
  return out;
}

// ---------- 周期 (periodic) 闭合 B 样条 ----------

function samplePeriodic(ctrl: Vec2[], degree: number, samples: number): Vec2[] {
  const n = ctrl.length;
  const p = Math.min(degree, n); // 周期情况下 n 个控制点足够 (环绕复用)

  // 环绕扩展控制点: P[0..n-1] 再续 p 个 P[i mod n] → 共 n+p 个。
  const cp: Vec2[] = [];
  for (let i = 0; i < n + p; i++) cp.push(ctrl[i % n]);

  const nn = cp.length; // = n + p
  // 周期均匀结点: 0,1,2,...,nn+p (整数, 等距)。
  const m = nn + p + 1;
  const U = new Array<number>(m);
  for (let i = 0; i < m; i++) U[i] = i;

  // 有效参数域: [U[p], U[nn]]。该区间上曲线扫过完整闭合环一圈。
  const uStart = U[p];
  const uEnd = U[nn];

  const out: Vec2[] = [];
  // 闭合 → 末点 = 首点, 故采 samples 段 → samples 个唯一点 (尾不重复首)。
  for (let s = 0; s < samples; s++) {
    let u = uStart + ((uEnd - uStart) * s) / samples;
    if (u < uStart) u = uStart;
    if (u >= uEnd) u = uEnd - 1e-12;
    out.push(deBoor(cp, U, p, u));
  }
  return out;
}

// ---------- Cox–de Boor 评估 (de Boor 算法) ----------

/**
 * de Boor 算法: 在参数 u 处评估 p 阶 B 样条曲线 (结点向量 U, 控制点 ctrl)。
 * 数值稳定, 等价于 Cox–de Boor 基函数线性组合。
 */
function deBoor(ctrl: Vec2[], U: number[], p: number, u: number): Vec2 {
  const k = findSpan(U, p, ctrl.length, u);

  // d[j] = ctrl[k-p+j], j=0..p (复制, 唔改入参)
  const dx = new Array<number>(p + 1);
  const dy = new Array<number>(p + 1);
  for (let j = 0; j <= p; j++) {
    const idx = k - p + j;
    dx[j] = ctrl[idx][0];
    dy[j] = ctrl[idx][1];
  }

  for (let r = 1; r <= p; r++) {
    for (let j = p; j >= r; j--) {
      const i = k - p + j;
      const denom = U[i + p - r + 1] - U[i];
      const alpha = denom > 0 ? (u - U[i]) / denom : 0;
      dx[j] = (1 - alpha) * dx[j - 1] + alpha * dx[j];
      dy[j] = (1 - alpha) * dy[j - 1] + alpha * dy[j];
    }
  }
  return [dx[p], dy[p]];
}

/**
 * 找结点区间索引 k 使 U[k] <= u < U[k+1] (右端特例归入最后一段)。
 * @param nCtrl 控制点个数 n; 有效区间索引落于 [p, n-1]。
 */
function findSpan(U: number[], p: number, nCtrl: number, u: number): number {
  const high = nCtrl - 1; // 最大可作为 span 起点嘅控制点索引
  // 右端钳制: u >= U[n] (定义域上界) → 归最后一段。
  if (u >= U[nCtrl]) return high;
  if (u <= U[p]) return p;
  // 二分查找
  let lo = p;
  let hi = nCtrl;
  let mid = (lo + hi) >> 1;
  while (u < U[mid] || u >= U[mid + 1]) {
    if (u < U[mid]) hi = mid;
    else lo = mid;
    mid = (lo + hi) >> 1;
  }
  return mid;
}
