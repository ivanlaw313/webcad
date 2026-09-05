// conic2d.ts — 纯 2D 有理二次（圆锥曲线 Conic）采样模块，零依赖。
//
// Fusion「圆锥曲线 Conic」工具：起点 P0 → 终点 P2 → 顶点 apex(= 两端切线交点 = 中控制点 P1) + rho 充满度。
// rho ∈ (0,1)：<0.5 椭圆弧, =0.5 抛物线, >0.5 双曲线（Fusion 同款 ρ 语义）。
//
// 数学 = 有理二次 Bézier（NURBS 阶 2）：中控制点权 w = rho/(1−rho)，
//   B(t) = [(1−t)²·P0 + 2t(1−t)·w·P1 + t²·P2] / [(1−t)² + 2t(1−t)·w + t²]
//   w=1 (rho=0.5) → 退化为普通二次 Bézier = 抛物线。
//   肩点（曲线 t=0.5 上点）S = B(0.5) = M + rho·(P1 − M)，M = 弦 P0P2 中点
//     —— 即 rho = 沿「弦中点 → 顶点」中线嘅比例（Fusion 约定）。
//
// 纯函数：唔修改入参，零 import。采样首尾精确落 P0/P2。
// replicad pen 冇有理圆锥曲线原语 → 上层把密采样点做 smooth poly（worker smoothSplineTo 拟合真 B-rep 边），
// 同已发布嘅样条/B 样条工具（S127）一致：几何忠实嘅逼近，唔系解析圆锥。

export type Pt2 = [number, number];

/** rho（充满度，∈(0,1)）→ 中控制点权 w。rho=0.5→w=1（抛物线）；clamp 到 (0.001,0.999) 避免 0/∞。 */
export function rhoToWeight(rho: number): number {
  const r = Math.min(0.999, Math.max(0.001, rho));
  return r / (1 - r);
}

/**
 * 采样一条 2D 有理二次圆锥曲线。
 * @param p0 起点（精确落点）
 * @param p2 终点（精确落点）
 * @param apex 顶点 = 两端切线交点（= 中控制点 P1）
 * @param rho 充满度 ∈(0,1)，默认 0.5（抛物线）
 * @param samples 采样点总数，默认 64（至少 2）
 * @returns 沿曲线均匀参数采样嘅点列
 */
export function sampleConic(p0: Pt2, p2: Pt2, apex: Pt2, rho = 0.5, samples = 64): Pt2[] {
  const n = Math.max(2, Math.floor(samples));
  const w = rhoToWeight(rho);
  const out: Pt2[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const u = 1 - t;
    const b0 = u * u, b1 = 2 * t * u * w, b2 = t * t;
    const denom = b0 + b1 + b2 || 1;
    out.push([
      (b0 * p0[0] + b1 * apex[0] + b2 * p2[0]) / denom,
      (b0 * p0[1] + b1 * apex[1] + b2 * p2[1]) / denom,
    ]);
  }
  // 浮点收尾：端点精确（有理二次端点理论上 = P0/P2）。
  out[0] = [p0[0], p0[1]];
  out[n - 1] = [p2[0], p2[1]];
  return out;
}

/** 肩点（曲线 t=0.5 上点）= 弦中点 M 向 apex 移 rho。供预览/标注，不依赖采样。 */
export function conicShoulder(p0: Pt2, p2: Pt2, apex: Pt2, rho = 0.5): Pt2 {
  const r = Math.min(0.999, Math.max(0.001, rho));
  const mx = (p0[0] + p2[0]) / 2, my = (p0[1] + p2[1]) / 2;
  return [mx + r * (apex[0] - mx), my + r * (apex[1] - my)];
}

// ── S193：曲率半径（radius of curvature）—— 供曲率检视/标注/G2 匹配（纯几何，零 import、零 solver） ──

/** bulge 圆弧嘅曲率半径。圆弧曲率恒定 → 曲率半径 = 弧半径 R（处处一样，唔似 conic 变化）。
 *  bulge b：含角 θ=4·atan|b|；弦长 c；R = c·(1+b²)/(4|b|)。直线（|b|≈0）→ ∞（曲率 0）。退化弦→0。 */
export function bulgeShoulderCurvature(a: Pt2, b: Pt2, bulge: number): number {
  const eps = 1e-9;
  if (!Number.isFinite(bulge) || Math.abs(bulge) < eps) return Infinity;   // 直线段 = 无穷大曲率半径
  const c = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (c < eps) return 0;
  return (c * (1 + bulge * bulge)) / (4 * Math.abs(bulge));                  // 圆弧半径 = 曲率半径（恒定）
}

/** 有理二次圆锥曲线喺肩点（t=0.5）嘅曲率半径 ρ = |B'|³/|B'×B''|（osculating circle）。
 *  conic 曲率沿弧变化 → 肩点系最弯/最关键处。用中心差分数值求 B'/B''（稳健、零解析推导误差）。
 *  直线退化（B'×B''≈0）→ ∞。供 conic 曲率检视 + G2 连续匹配（纯几何，无 solver）。 */
export function conicShoulderCurvature(p0: Pt2, p2: Pt2, apex: Pt2, rho = 0.5): number {
  const w = rhoToWeight(rho);
  const ev = (t: number): Pt2 => {
    const u = 1 - t, b0 = u * u, b1 = 2 * t * u * w, b2 = t * t, d = b0 + b1 + b2 || 1;
    return [(b0 * p0[0] + b1 * apex[0] + b2 * p2[0]) / d, (b0 * p0[1] + b1 * apex[1] + b2 * p2[1]) / d];
  };
  const h = 1e-4;
  const A = ev(0.5 - h), B = ev(0.5), C = ev(0.5 + h);
  const dx = (C[0] - A[0]) / (2 * h), dy = (C[1] - A[1]) / (2 * h);            // B'(0.5)
  const ddx = (C[0] - 2 * B[0] + A[0]) / (h * h), ddy = (C[1] - 2 * B[1] + A[1]) / (h * h);  // B''(0.5)
  const cross = Math.abs(dx * ddy - dy * ddx), sp = Math.hypot(dx, dy);
  return cross < 1e-12 ? Infinity : (sp * sp * sp) / cross;                    // ρ = |B'|³ / |B'×B''|
}
