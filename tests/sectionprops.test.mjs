// sectionprops.test.mjs — 2D 截面属性（src/cad/sectionProps.ts）解析验证
//
// 对标 Fusion「草图 → 截面属性」：闭合多边形（外轮廓 + 可选孔）的面积、形心、关于形心/原点
// 的二阶面积矩、主惯性矩、周长。全部断言【解析闭式解】（矩形 bh³/12、带孔相减、直角三角形
// 形心 1/3），不是回归快照 —— 数学错就会 FAIL。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/sectionprops.test.mjs
// 全部测试通过 → exit 0；任一失败 → exit 1。

import { sectionProps } from '../src/cad/sectionProps.ts';

// ------------------------------------------------------------------ 小框架（仿 facefingerprint.test.mjs）
const rows = [];
function test(name, fn) {
  const t0 = Date.now();
  try {
    const detail = fn() ?? '';
    rows.push({ name, pass: true, ms: Date.now() - t0, detail });
    console.log(`PASS ${name} (${Date.now() - t0}ms) ${detail}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    rows.push({ name, pass: false, ms: Date.now() - t0, detail: msg });
    console.log(`FAIL ${name} (${Date.now() - t0}ms) ${msg}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function near(a, b, tol, what) {
  assert(Math.abs(a - b) <= tol, `${what}: 期望 ${b}，实得 ${a}（差 ${(a - b).toExponential(2)}，容差 ${tol}）`);
}
function fmt(x, d = 4) { return Number(x).toFixed(d); }

// 闭合矩形（逆时针），左下角 (ox,oy)，宽 b、高 h。
function rect(b, h, ox = 0, oy = 0) {
  return [[ox, oy], [ox + b, oy], [ox + b, oy + h], [ox, oy + h]];
}

const TOL = 1e-6;  // 解析值精确，鞋带是闭式 → 仅浮点级误差

// ------------------------------------------------------------------ T1 矩形：面积 / 形心 / Ixx / Iyy / Ixy
// b×h 矩形（b=40, h=20），左下角在原点。解析：
//   area = b·h = 800；形心 = (b/2, h/2) = (20,10)
//   Ixx = b·h³/12 = 40·8000/12 = 26666.6667
//   Iyy = h·b³/12 = 20·64000/12 = 106666.6667
//   Ixy = 0（关于形心，矩形对称）
test('T1 矩形 40×20：area / centroid / Ixx=bh³/12 / Iyy=hb³/12 / Ixy=0', () => {
  const b = 40, h = 20;
  const p = sectionProps([rect(b, h)]);
  near(p.area, b * h, TOL, 'area');
  near(p.centroid[0], b / 2, TOL, 'Cx');
  near(p.centroid[1], h / 2, TOL, 'Cy');
  near(p.Ixx, (b * h ** 3) / 12, 1e-6, 'Ixx');
  near(p.Iyy, (h * b ** 3) / 12, 1e-6, 'Iyy');
  near(p.Ixy, 0, TOL, 'Ixy');
  near(p.perimeter, 2 * (b + h), TOL, 'perimeter');
  return `A=${fmt(p.area)} C=(${fmt(p.centroid[0],2)},${fmt(p.centroid[1],2)}) Ixx=${fmt(p.Ixx)} Iyy=${fmt(p.Iyy)} Ixy=${fmt(p.Ixy)}`;
});

// ------------------------------------------------------------------ T2 平移不变：矩形挪到 (100,50)，形心矩不变
// Ixx/Iyy/Ixy 关于【形心】→ 平移整体几何不改变它们；原点矩 Ixx0/Iyy0 则会随平移变大。
test('T2 平移不变性：矩形挪到 (100,50)，关于形心的 Ixx/Iyy/Ixy 不变', () => {
  const b = 40, h = 20;
  const at0 = sectionProps([rect(b, h)]);
  const moved = sectionProps([rect(b, h, 100, 50)]);
  near(moved.area, at0.area, TOL, 'area 平移不变');
  near(moved.centroid[0], 100 + b / 2, TOL, 'Cx 跟随平移');
  near(moved.centroid[1], 50 + h / 2, TOL, 'Cy 跟随平移');
  near(moved.Ixx, at0.Ixx, 1e-6, 'Ixx 形心矩平移不变');
  near(moved.Iyy, at0.Iyy, 1e-6, 'Iyy 形心矩平移不变');
  near(moved.Ixy, 0, TOL, 'Ixy 仍 0');
  // 原点矩按平行轴定理应增大：Ixx0 = Ixx + A·Cy²
  near(moved.Ixx0, at0.Ixx + at0.area * (50 + h / 2) ** 2, 1e-3, 'Ixx0 平行轴');
  return `形心矩平移不变；Ixx0 由 ${fmt(at0.Ixx0,1)} → ${fmt(moved.Ixx0,1)}（平行轴增大）`;
});

// ------------------------------------------------------------------ T3 带居中孔的矩形：面积/惯性矩相减
// 外 60×40，居中孔 30×20，同心于 (30,20)。解析（相减）：
//   area = 60·40 − 30·20 = 2400 − 600 = 1800
//   形心仍在中心 (30,20)（同心对称）
//   Ixx = 60·40³/12 − 30·20³/12 = 320000 − 20000 = 300000
//   Iyy = 40·60³/12 − 20·30³/12 = 720000 − 45000 = 675000
//   Ixy = 0
test('T3 矩形带居中矩形孔：area 与 Ixx/Iyy 逐项相减', () => {
  const outer = rect(60, 40, 0, 0);
  const hole = rect(30, 20, 15, 10);   // 居中：(15,10)..(45,30)，中心 (30,20)
  const p = sectionProps([outer, hole]);
  near(p.area, 60 * 40 - 30 * 20, TOL, 'area = 外 − 孔');
  near(p.centroid[0], 30, TOL, 'Cx 同心中点');
  near(p.centroid[1], 20, TOL, 'Cy 同心中点');
  const IxxAnalytic = (60 * 40 ** 3) / 12 - (30 * 20 ** 3) / 12;
  const IyyAnalytic = (40 * 60 ** 3) / 12 - (20 * 30 ** 3) / 12;
  near(p.Ixx, IxxAnalytic, 1e-5, 'Ixx = 外bh³/12 − 孔bh³/12');
  near(p.Iyy, IyyAnalytic, 1e-5, 'Iyy = 外hb³/12 − 孔hb³/12');
  near(p.Ixy, 0, TOL, 'Ixy=0（对称）');
  // 周长 = 外周 + 孔周（两者皆计）
  near(p.perimeter, 2 * (60 + 40) + 2 * (30 + 20), TOL, 'perimeter = 外周 + 孔周');
  return `A=${fmt(p.area)} Ixx=${fmt(p.Ixx)} Iyy=${fmt(p.Iyy)}（外−孔逐项对上）`;
});

// ------------------------------------------------------------------ T4 孔的绕向无关：孔传【顺时针】也得同结果
// 我哋用 |signed area| + 「index>0 即孔」叠加，所以孔点序点都正确。
test('T4 孔绕向无关：孔以顺时针给出，结果与逆时针孔一致', () => {
  const outer = rect(60, 40, 0, 0);
  const holeCCW = rect(30, 20, 15, 10);                 // 逆时针
  const holeCW = [...rect(30, 20, 15, 10)].reverse();   // 同一孔，顺时针
  const a = sectionProps([outer, holeCCW]);
  const b = sectionProps([outer, holeCW]);
  near(a.area, b.area, TOL, 'area 与孔绕向无关');
  near(a.Ixx, b.Ixx, 1e-6, 'Ixx 与孔绕向无关');
  near(a.Iyy, b.Iyy, 1e-6, 'Iyy 与孔绕向无关');
  near(b.area, 1800, TOL, '顺时针孔 area 仍 1800');
  return `孔顺/逆时针 → area=${fmt(b.area)}, Ixx=${fmt(b.Ixx)} 一致`;
});

// ------------------------------------------------------------------ T5 直角三角形：面积 + 形心在 1/3 处
// 直角边在原点，沿 +x（长 b=30）和 +y（长 h=15）：顶点 (0,0),(30,0),(0,15)。解析：
//   area = ½·b·h = 225
//   形心 = (b/3, h/3) = (10, 5)
//   关于形心：Ixx = b·h³/36 = 30·3375/36 = 2812.5；Iyy = h·b³/36 = 15·27000/36 = 11250
//   关于形心 惯性积 Ixy = −b²h²/72 = −(900·225)/72 = −2812.5（此朝向为负）
test('T5 直角三角形 (30,15)：area=½bh / 形心在 (b/3,h/3) / Ixx=bh³/36', () => {
  const b = 30, h = 15;
  const tri = [[0, 0], [b, 0], [0, h]];
  const p = sectionProps([tri]);
  near(p.area, 0.5 * b * h, TOL, 'area = ½bh');
  near(p.centroid[0], b / 3, TOL, 'Cx = b/3');
  near(p.centroid[1], h / 3, TOL, 'Cy = h/3');
  near(p.Ixx, (b * h ** 3) / 36, 1e-6, 'Ixx = bh³/36');
  near(p.Iyy, (h * b ** 3) / 36, 1e-6, 'Iyy = hb³/36');
  near(p.Ixy, -(b * b * h * h) / 72, 1e-6, 'Ixy = −b²h²/72');
  return `A=${fmt(p.area)} C=(${fmt(p.centroid[0],3)},${fmt(p.centroid[1],3)}) Ixx=${fmt(p.Ixx)} Ixy=${fmt(p.Ixy)}`;
});

// ------------------------------------------------------------------ T6 主惯性矩：矩形主轴对齐坐标轴
// 关于形心 Ixy=0 → 主轴即坐标轴。40×20 矩形：Ixx=bh³/12=26667（绕 x），Iyy=hb³/12=106667
// （绕 y）。I1=max=Iyy，其轴 = 【y 轴】→ angleDeg=90°（I1 轴相对 x 轴方向，同 Fusion 报告）。
test('T6 主惯性矩：40×20 矩形 I1=Iyy（绕y）, I2=Ixx, I1 轴角 = 90°', () => {
  const p = sectionProps([rect(40, 20)]);
  near(p.principal.I1, Math.max(p.Ixx, p.Iyy), 1e-6, 'I1 = max(Ixx,Iyy)');
  near(p.principal.I2, Math.min(p.Ixx, p.Iyy), 1e-6, 'I2 = min(Ixx,Iyy)');
  near(Math.abs(p.principal.angleDeg), 90, 1e-6, 'I1=Iyy → 其轴是 y 轴 → ±90°');
  return `I1=${fmt(p.principal.I1)} I2=${fmt(p.principal.I2)} θ=${fmt(p.principal.angleDeg)}°（I1 轴 = y 轴）`;
});

// ------------------------------------------------------------------ T6b 主轴角非平凡：宽扁矩形旋转 → I1 轴跟着转
// 40×10 矩形（b=40 沿 x，h=10 沿 y）：Ixx=bh³/12=3333（绕 x），Iyy=hb³/12=53333（绕 y）。
// I1=max=Iyy → 其轴是【y 轴】→ 未旋转 angleDeg=90°（质量在 x 方向铺得最开 → 绕 y 的二阶矩最大，
// 即「I1 轴 ⊥ 几何长边」的物理直觉）。把【几何】绕形心 +30°（数学正方向，逆时针）：长边方向
// 由 0°→30°，而 I1（主）轴 ⊥ 长边 → 由 90° 转到 90+30=120° ≡ −60°（归一化到 (−90,90]）。
// 即几何 +φ → I1 轴角 = 90°+φ（mod 180）。已用网格采样真截面（不依赖任何张量公式）独立确认
// 主轴方向系 −60°。这条真正考验 atan2 角度公式的【符号】（非 0/±90 平凡值）。I1/I2 大小旋转不变。
test('T6b 主轴角：40×10 矩形几何旋转 +30° → I1=I2 不变, I1 轴角 90° → −60°', () => {
  const b = 40, h = 10, deg = 30, rad = (deg * Math.PI) / 180;
  const flat = sectionProps([rect(b, h)]);
  near(Math.abs(flat.principal.angleDeg), 90, 1e-6, '未旋转：I1=Iyy → 轴是 y → ±90°');
  // 绕中心 (b/2,h/2) 旋转 30°
  const cx = b / 2, cy = h / 2, c = Math.cos(rad), s = Math.sin(rad);
  const rotated = rect(b, h).map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    return [cx + dx * c - dy * s, cy + dx * s + dy * c];
  });
  const p = sectionProps([rotated]);
  near(p.principal.I1, flat.principal.I1, 1e-5, 'I1 旋转不变');
  near(p.principal.I2, flat.principal.I2, 1e-5, 'I2 旋转不变');
  // 主（I1）轴 ⊥ 几何长边：长边转到 +30° → 主轴 = 120° ≡ −60°（物理正确，网格采样确认）
  near(p.principal.angleDeg, -60, 1e-4, 'I1 轴角 = (90°+30°) mod180 = −60°（物理惯性张量 eigenvector）');
  return `I1=${fmt(p.principal.I1)} (不变), I1 轴角 ${fmt(flat.principal.angleDeg)}° → ${fmt(p.principal.angleDeg)}°`;
});

// ------------------------------------------------------------------ T7 主惯性矩旋转 45°：正方形各向同性，I1=I2
// 正方形关于形心 Ixx=Iyy 且 Ixy=0 → 主惯性矩相等（各向同性），任意方向皆主轴。把一个 20×20
// 方形旋转 45° 后用顶点描述（菱形），I1 应仍 = I2 = 边长⁴/12。
test('T7 主惯性矩：20×20 方形 I1=I2（各向同性，旋转无关）', () => {
  const s = 20;
  const sq = rect(s, s);                       // 轴对齐方形
  const p = sectionProps([sq]);
  near(p.principal.I1, p.principal.I2, 1e-6, '方形 I1=I2（各向同性）');
  near(p.principal.I1, (s * s ** 3) / 12, 1e-6, 'I = s⁴/12');
  // 旋转 45° 的同一方形（菱形顶点，半对角 = s/√2）→ 主惯性矩不变。
  const r = s / Math.SQRT2;
  const cx = 50, cy = 50;
  const diamond = [[cx + r, cy], [cx, cy + r], [cx - r, cy], [cx, cy - r]];
  const pr = sectionProps([diamond]);
  near(pr.area, s * s, 1e-6, '菱形 area = s²（旋转不变）');
  near(pr.principal.I1, p.principal.I1, 1e-6, '旋转 45° 后 I1 不变（各向同性）');
  near(pr.principal.I2, p.principal.I2, 1e-6, '旋转 45° 后 I2 不变');
  return `方形 I1=I2=${fmt(p.principal.I1)}；旋转45° 后 I1=${fmt(pr.principal.I1)} 不变`;
});

// ------------------------------------------------------------------ T8 原点二阶矩自洽：Ixx0 = Ixx + A·Cy²
// 平行轴定理双向自洽检查（矩形不在原点）。
test('T8 平行轴自洽：Ixx0=Ixx+A·Cy², Iyy0=Iyy+A·Cx², Ixy0=Ixy+A·Cx·Cy', () => {
  const p = sectionProps([rect(25, 12, 7, 9)]);
  const { area: A, centroid: [Cx, Cy], Ixx, Iyy, Ixy, Ixx0, Iyy0, Ixy0 } = p;
  near(Ixx0, Ixx + A * Cy * Cy, 1e-4, 'Ixx0 = Ixx + A·Cy²');
  near(Iyy0, Iyy + A * Cx * Cx, 1e-4, 'Iyy0 = Iyy + A·Cx²');
  near(Ixy0, Ixy + A * Cx * Cy, 1e-4, 'Ixy0 = Ixy + A·Cx·Cy');
  return `Ixx0=${fmt(Ixx0,2)}=Ixx+A·Cy² ✓；三条平行轴关系全自洽`;
});

// ------------------------------------------------------------------ 汇总
const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((r) => r.name).join(', '));
  process.exit(1);
}
process.exit(0);
