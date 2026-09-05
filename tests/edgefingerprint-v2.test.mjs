// edgefingerprint-v2.test.mjs — 「旋转不变边指纹 v2」（src/cad/edgeFingerprint.ts）验证
//
// v1（e1|…）用模型 bbox 归一化 → 对旋转敏感（by construction）。
// v2（e2|…）用主惯量框架（principalFrame / PCA）做坐标系 → 对刚体旋转【不变】。
//
// 本 suite 证「NO-HOLLOW」：
//   (a) 非对称长方体棱：刚体旋转 37° → edgeFingerprintV2 不变；同时 v1 edgeFingerprint 【会变】
//       （证明测试真有咬合 + v2 加咗实在价值）。
//   (b) 立方体 → principalFrame.wellConditioned === false（惯量简并）；高非方柱 → true。
//   (c) 非对称体加 1e-5 抖动 → edgeFingerprintV2 不变（数值噪声稳定）。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/edgefingerprint-v2.test.mjs
// 全部通过 → exit 0；任一失败 → exit 1。

import { edgeFingerprint, edgeFingerprintV2, principalFrame } from '../src/cad/edgeFingerprint.ts';

// ------------------------------------------------------------------ 小框架（仿 edgefingerprint.test.mjs）
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
function fmt(x, d = 4) { return Number(x).toFixed(d); }

// ------------------------------------------------------------------ 几何夹具
// box 8 角（同 v1 测试）：bit0=x bit1=y bit2=z。
function corner(sx, sy, sz, ox, oy, oz, b) {
  return [ox + ((b & 1) ? sx : 0), oy + ((b & 2) ? sy : 0), oz + ((b & 4) ? sz : 0)];
}
const EDGE_PAIRS = [
  [0, 1], [2, 3], [4, 5], [6, 7], // 沿 X
  [0, 2], [1, 3], [4, 6], [5, 7], // 沿 Y
  [0, 4], [1, 5], [2, 6], [3, 7], // 沿 Z
];
function makeBoxEdges(sx, sy, sz, ox = 0, oy = 0, oz = 0) {
  const vertices = [];
  for (let b = 0; b < 8; b++) vertices.push(...corner(sx, sy, sz, ox, oy, oz, b));
  const edges = EDGE_PAIRS.map(([a, b]) => ({
    poly: [corner(sx, sy, sz, ox, oy, oz, a), corner(sx, sy, sz, ox, oy, oz, b)],
  }));
  return { vertices, edges };
}

// ------------------------------------------------------------------ 刚体旋转（任意轴 + 角度，Rodrigues）
// 单位轴 axis、角 ang → 旋转矩阵（行优先 3×3）。
function rotMatrix(axis, ang) {
  const n = Math.hypot(axis[0], axis[1], axis[2]);
  const [ux, uy, uz] = [axis[0] / n, axis[1] / n, axis[2] / n];
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [
    [t * ux * ux + c, t * ux * uy - s * uz, t * ux * uz + s * uy],
    [t * ux * uy + s * uz, t * uy * uy + c, t * uy * uz - s * ux],
    [t * ux * uz - s * uy, t * uy * uz + s * ux, t * uz * uz + c],
  ];
}
function applyR(R, p) {
  return [
    R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2],
    R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2],
    R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2],
  ];
}
// 旋转整个 box（vertices flat + 每条边 polyline）。
function rotateBox(box, axis, ang) {
  const R = rotMatrix(axis, ang);
  const vertices = [];
  for (let i = 0; i + 2 < box.vertices.length; i += 3) {
    const p = applyR(R, [box.vertices[i], box.vertices[i + 1], box.vertices[i + 2]]);
    vertices.push(p[0], p[1], p[2]);
  }
  const edges = box.edges.map((e) => ({ poly: e.poly.map((p) => applyR(R, p)) }));
  return { vertices, edges };
}

// ------------------------------------------------------------------ (a) 旋转不变 + v1 会变（NO-HOLLOW 核心）
// S136：测 37°、137°、200° 三个角（含 >45°，专证旧 max-|component| sign-flip 已修）。
//   旧规则喺 ~45° 后某条主轴 sign 翻转 → V2 指纹漂；新 skewness 定号对【任意角度】不变。
function rotInvarianceAtAngle(deg) {
  const box = makeBoxEdges(10, 20, 30, 0, 0, 0);
  const axis = [1, 2, 3];                       // 任意轴（非坐标轴）
  const rot = rotateBox(box, axis, (deg * Math.PI) / 180);

  let v2Same = 0, v1Changed = 0;
  for (let i = 0; i < EDGE_PAIRS.length; i++) {
    const v2a = edgeFingerprintV2(box.vertices, box.edges[i].poly);
    const v2b = edgeFingerprintV2(rot.vertices, rot.edges[i].poly);
    assert(v2a === v2b, `[${deg}°] 棱${i} V2 旋转后变咗（应旋转不变）：\n  ${v2a}\n  ${v2b}`);
    assert(v2a.startsWith('e2|'), `[${deg}°] 棱${i} 非对称箱应 wellConditioned（前缀 e2|），实得 ${v2a.slice(0, 4)}`);
    v2Same++;
    const v1a = edgeFingerprint(box.vertices, box.edges[i].poly);
    const v1b = edgeFingerprint(rot.vertices, rot.edges[i].poly);
    if (v1a !== v1b) v1Changed++;
  }
  assert(v2Same === EDGE_PAIRS.length, `[${deg}°] V2 应全 12 棱旋转不变，实得 ${v2Same}`);
  assert(v1Changed > 0, `[${deg}°] v1 应至少有棱改变（证明旋转有影响），实得 0 —— 测试冇咬合`);
  return v1Changed;
}

test('A 旋转不变：非对称箱 (10×20×30) 棱绕任意轴转 37° → V2 不变、且 v1 会变', () => {
  const v1Changed = rotInvarianceAtAngle(37);
  return `V2 12/12 棱旋转不变（e2|）；v1 ${v1Changed}/12 棱旋转后改变（证明 v2 加咗实在价值）`;
});

test('A2 ≥45° 旋转不变（修 sign-flip）：137° 绕任意轴转 → V2 全 12 棱不变', () => {
  const v1Changed = rotInvarianceAtAngle(137);
  return `137°（>45°）：V2 12/12 不变（旧 max-|component| 规则喺此处 sign-flip，新 skewness 已修）；v1 ${v1Changed}/12 改变`;
});

test('A3 ≥45° 旋转不变（修 sign-flip）：200° 绕任意轴转 → V2 全 12 棱不变', () => {
  const v1Changed = rotInvarianceAtAngle(200);
  return `200°（>45°）：V2 12/12 不变（旧规则此处只 4/12，证明新 skewness 定号对任意角度不变）；v1 ${v1Changed}/12 改变`;
});

// ------------------------------------------------------------------ (b) 简并检测：立方 → false、高非方柱 → true
test('B 简并检测：立方体 wellConditioned=false；高非方柱 wellConditioned=true', () => {
  const cube = makeBoxEdges(10, 10, 10);
  const fc = principalFrame(cube.vertices);
  assert(fc.wellConditioned === false,
    `立方体惯量简并，应 wellConditioned=false，实得 ${fc.wellConditioned}`);

  // 高非方柱：三轴全唔同（截面 10×20、高 60）→ 三惯量分离 → wellConditioned=true
  const prism = makeBoxEdges(10, 20, 60);
  const fp = principalFrame(prism.vertices);
  assert(fp.wellConditioned === true,
    `高非方柱三轴分离，应 wellConditioned=true，实得 ${fp.wellConditioned}`);

  // 顺手验：立方体棱 V2 应带 advisory 标志 e2X|（框架唔可靠）
  const v2cube = edgeFingerprintV2(cube.vertices, cube.edges[0].poly);
  assert(v2cube.startsWith('e2X|'), `立方体棱 V2 应带 advisory 前缀 e2X|，实得 ${v2cube.slice(0, 5)}`);
  return `立方体 wellConditioned=false（棱前缀 e2X|）；高非方柱(10×20×60) wellConditioned=true`;
});

// ------------------------------------------------------------------ (c) 数值噪声稳定：±1e-5 抖动 → V2 不变
test('C 噪声稳定：非对称箱 (10×20×30) 顶点加 ±1e-5 抖动 → V2 不变', () => {
  const box = makeBoxEdges(10, 20, 30, 0, 0, 0);
  // 决定性 ±1e-5 抖动（远细过量化容差）
  const jiggle = (c, k) => c + ((k % 2 ? 1 : -1) * 1e-5);
  const jv = box.vertices.map((v, i) => jiggle(v, i));
  const je = box.edges.map((e) => ({ poly: e.poly.map((p) => p.map((c, k) => jiggle(c, k))) }));

  let same = 0;
  for (let i = 0; i < EDGE_PAIRS.length; i++) {
    const a = edgeFingerprintV2(box.vertices, box.edges[i].poly);
    const b = edgeFingerprintV2(jv, je[i].poly);
    assert(a === b, `棱${i} 抖动后 V2 变咗（应吸收 1e-5 噪声）：\n  ${a}\n  ${b}`);
    same++;
  }
  assert(same === EDGE_PAIRS.length, `应全 12 棱稳定，实得 ${same}`);
  return `量化 + 框架对 1e-5 抖动稳定 → 12/12 V2 不变`;
});

// ------------------------------------------------------------------ 汇总
const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((r) => r.name).join(', '));
  process.exit(1);
}
process.exit(0);
