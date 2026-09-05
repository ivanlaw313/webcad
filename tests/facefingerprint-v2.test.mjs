// facefingerprint-v2.test.mjs — 「旋转不变面指纹 v2」（src/cad/faceFingerprint.ts）验证
//
// v1（f1|…）用模型 bbox 归一化 → 对旋转敏感（by construction）。
// v2（f2|…）用主惯量框架（principalFrame / PCA，同 edgeFingerprintV2 共用）做坐标系 →
//   对刚体旋转【不变】。
//
// 本 suite 证「NO-HOLLOW」：
//   (a) 非对称长方体面：刚体旋转 37° → faceFingerprintV2 不变；同时 v1 faceFingerprint【会变】
//       （证明测试真有咬合 + v2 加咗实在价值）。
//   (b) 同 (a) 但转 137°（>45°，专证 principalFrame 嘅 skewness 定号已修旧 sign-flip）。
//   (c) 立方体 → principalFrame.wellConditioned===false（惯量简并）→ 面 v2 前缀 f2X|（advisory）。
//   (d) 非对称体加 1e-5 抖动 → faceFingerprintV2 不变（数值噪声稳定）。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/facefingerprint-v2.test.mjs
// 全部通过 → exit 0；任一失败 → exit 1。

import { faceFingerprint, faceFingerprintV2 } from '../src/cad/faceFingerprint.ts';
import { principalFrame } from '../src/cad/edgeFingerprint.ts';

// ------------------------------------------------------------------ 小框架
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

// ------------------------------------------------------------------ 测试网格：box + faceGroups（同 facefingerprint.test.mjs）
function makeBox(sx, sy, sz, ox = 0, oy = 0, oz = 0, faceIds = [101, 102, 103, 104, 105, 106]) {
  const vertices = [];
  for (let b = 0; b < 8; b++) {
    vertices.push(ox + ((b & 1) ? sx : 0), oy + ((b & 2) ? sy : 0), oz + ((b & 4) ? sz : 0));
  }
  const triangles = [
    0, 2, 3, 0, 3, 1, // z=0  (-Z)
    4, 5, 7, 4, 7, 6, // z=sz (+Z)
    0, 1, 5, 0, 5, 4, // y=0  (-Y)
    2, 6, 7, 2, 7, 3, // y=sy (+Y)
    0, 4, 6, 0, 6, 2, // x=0  (-X)
    1, 3, 7, 1, 7, 5, // x=sx (+X)
  ];
  const faceGroups = [];
  for (let f = 0; f < 6; f++) faceGroups.push({ start: f * 6, count: 6, faceId: faceIds[f] });
  return { vertices, triangles, faceGroups };
}

// ------------------------------------------------------------------ 刚体旋转（任意轴 + 角，Rodrigues）
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
// 旋转整个 box 顶点（flat），triangles / faceGroups 不变（索引拓扑唔受旋转影响）。
function rotateBox(box, axis, ang) {
  const R = rotMatrix(axis, ang);
  const vertices = [];
  for (let i = 0; i + 2 < box.vertices.length; i += 3) {
    const p = applyR(R, [box.vertices[i], box.vertices[i + 1], box.vertices[i + 2]]);
    vertices.push(p[0], p[1], p[2]);
  }
  return { vertices, triangles: box.triangles, faceGroups: box.faceGroups };
}

// 逐面 v1 / v2 指纹（modelVerts = 自身全顶点云 → 框架/归一化用整个 box）
function f1s(box) { return box.faceGroups.map((g) => faceFingerprint(box.vertices, box.triangles, g, box.vertices)); }
function f2s(box) { return box.faceGroups.map((g) => faceFingerprintV2(box.vertices, box.triangles, g, box.vertices)); }

// ------------------------------------------------------------------ 共用：某角度旋转下 v2 不变 + v1 会变
function faceRotInvarianceAtAngle(deg) {
  const box = makeBox(10, 20, 30, 0, 0, 0);
  const rot = rotateBox(box, [1, 2, 3], (deg * Math.PI) / 180);
  const a2 = f2s(box), b2 = f2s(rot);
  const a1 = f1s(box), b1 = f1s(rot);
  let v2Same = 0, v1Changed = 0;
  for (let i = 0; i < 6; i++) {
    assert(a2[i] === b2[i], `[${deg}°] 面${i} v2 旋转后变咗（应旋转不变）：\n  ${a2[i]}\n  ${b2[i]}`);
    assert(a2[i].startsWith('f2|'), `[${deg}°] 面${i} 非对称箱应 wellConditioned（前缀 f2|），实得 ${a2[i].slice(0, 4)}`);
    v2Same++;
    if (a1[i] !== b1[i]) v1Changed++;
  }
  assert(v2Same === 6, `[${deg}°] v2 应全 6 面旋转不变，实得 ${v2Same}`);
  assert(v1Changed > 0, `[${deg}°] v1 应至少有面改变（证明旋转有影响 + v2 有价值），实得 0 —— 测试冇咬合`);
  return v1Changed;
}

// ------------------------------------------------------------------ (a) 37° 旋转不变 + v1 会变
test('A 旋转不变：非对称箱 (10×20×30) 6 面绕任意轴转 37° → f2 不变、f1 会变', () => {
  const v1Changed = faceRotInvarianceAtAngle(37);
  return `f2 6/6 面旋转不变（f2|）；f1 ${v1Changed}/6 面旋转后改变（证明 v2 加咗实在价值）`;
});

// ------------------------------------------------------------------ (b) 137° 旋转不变（>45°，证 sign-flip 已修）
test('A2 ≥45° 旋转不变：非对称箱 6 面绕任意轴转 137° → f2 全 6 面不变、f1 会变', () => {
  const v1Changed = faceRotInvarianceAtAngle(137);
  return `137°（>45°）：f2 6/6 面不变（skewness 定号修咗旧 sign-flip）；f1 ${v1Changed}/6 面改变`;
});

// ------------------------------------------------------------------ (c) 立方体：principalFrame 简并 → f2X| advisory
test('B 简并检测：立方体 principalFrame.wellConditioned=false → 面 v2 前缀 f2X|', () => {
  const cube = makeBox(10, 10, 10);
  const frame = principalFrame(cube.vertices);
  assert(frame.wellConditioned === false,
    `立方体惯量简并，应 wellConditioned=false，实得 ${frame.wellConditioned}`);
  // 立方体每面 v2 应带 advisory 前缀 f2X|（框架唔可靠）
  const fps = f2s(cube);
  for (let i = 0; i < 6; i++) {
    assert(fps[i].startsWith('f2X|'), `立方体面${i} v2 应带 advisory 前缀 f2X|，实得 ${fps[i].slice(0, 5)}`);
  }
  // 对照：高非方柱（10×20×60，三惯量分离）→ wellConditioned=true → 面前缀 f2|
  const prism = makeBox(10, 20, 60);
  const pf = principalFrame(prism.vertices);
  assert(pf.wellConditioned === true,
    `高非方柱三轴分离，应 wellConditioned=true，实得 ${pf.wellConditioned}`);
  const pfps = f2s(prism);
  for (let i = 0; i < 6; i++) {
    assert(pfps[i].startsWith('f2|'), `高非方柱面${i} v2 应 f2|，实得 ${pfps[i].slice(0, 4)}`);
  }
  return `立方体 wellConditioned=false（6 面全 f2X|）；高非方柱(10×20×60) wellConditioned=true（6 面 f2|）`;
});

// ------------------------------------------------------------------ (d) 数值噪声稳定：±1e-5 抖动 → f2 不变
test('C 噪声稳定：非对称箱 (10×20×30) 顶点加 ±1e-5 抖动 → f2 不变', () => {
  const box = makeBox(10, 20, 30, 0, 0, 0);
  const jiggle = (c, i) => c + ((i % 2 ? 1 : -1) * 1e-5);
  const jv = box.vertices.map((v, i) => jiggle(v, i));
  const jbox = { vertices: jv, triangles: box.triangles, faceGroups: box.faceGroups };
  const a = f2s(box), b = f2s(jbox);
  let same = 0;
  for (let i = 0; i < 6; i++) {
    assert(a[i] === b[i], `面${i} 抖动后 f2 变咗（应吸收 1e-5 噪声）：\n  ${a[i]}\n  ${b[i]}`);
    same++;
  }
  assert(same === 6, `应全 6 面稳定，实得 ${same}`);
  return `量化 + 框架对 1e-5 抖动稳定 → 6/6 f2 不变`;
});

// ------------------------------------------------------------------ 汇总
const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((r) => r.name).join(', '));
  process.exit(1);
}
process.exit(0);
