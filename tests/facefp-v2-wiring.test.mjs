// facefp-v2-wiring.test.mjs — 「旋转不变面指纹 v2」【接线】纯数值验证（无需 OCCT kernel）
//
// 目的：唔靠 worker / replicad / OCCT，只用合成 box 网格 + 合成全模型 vertices，验证
//   src/cad/faceFingerprint.ts 嘅 faceFingerprintV2 + src/cad/edgeFingerprint.ts 嘅 principalFrame
//   接线契约成立 —— 即 worker（_ffSelectPts / _ffCapture 嘅 try-v2-then-v1 advisory）所依赖嘅性质：
//
//   (1) ROTATION-INVARIANCE 旋转不变 —— 一张面（box 一面）刚体旋转后 v2 指纹【不变】，而同一情况下
//       v1 faceFingerprint【会漂移】（证明 v2 真有价值 + 测试真有咬合）。
//   (2) UNIQUENESS GATE 唯一闸 —— 非对称箱 wellConditioned=true，6 面 v2 各唯一（count===1）→
//       worker GATE(b) 通过 → 逐面采信 v2；旋转后仍解返【同一张面索引】（map round-trip）。
//   (3) DEGENERATE GATE 简并闸 —— 立方体 principalFrame.wellConditioned===false → worker GATE(a) 关 →
//       任何 v2 一律唔采信（无论唯一与否）→ 严格退回 v1（行为 NO-OP）。
//   (4) FALLBACK 退路语义 —— 空 v2 串 / 唔存在嘅 v2 指纹喺面集揾唔到 → worker 视为 miss → 退回 v1。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/facefp-v2-wiring.test.mjs
// 全部测试通过 → 打印 PASS 总数并 exit 0；任一失败 → 打印 FAIL 并 exit 1。
//
// ⚠ 用 REAL 导出（faceFingerprint / faceFingerprintV2 / principalFrame）。
//   纯函数、无副作用、唔 touch 任何 monolith（store.ts / cad.worker.ts / Viewport.tsx）。

import { faceFingerprint, faceFingerprintV2 } from '../src/cad/faceFingerprint.ts';
import { principalFrame } from '../src/cad/edgeFingerprint.ts';

// ------------------------------------------------------------------ 小测试框架（同其它 *.test.mjs 一致）
let passN = 0, failN = 0;
function test(name, fn) {
  const t0 = Date.now();
  try {
    const detail = fn() ?? '';
    passN++;
    console.log(`PASS ${name} (${Date.now() - t0}ms) ${detail}`);
  } catch (err) {
    failN++;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`FAIL ${name} (${Date.now() - t0}ms) ${msg}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ------------------------------------------------------------------ 测试网格：box + faceGroups（同 facefingerprint-v2.test.mjs）
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
function rotateBox(box, axis, ang) {
  const R = rotMatrix(axis, ang);
  const vertices = [];
  for (let i = 0; i + 2 < box.vertices.length; i += 3) {
    const p = applyR(R, [box.vertices[i], box.vertices[i + 1], box.vertices[i + 2]]);
    vertices.push(p[0], p[1], p[2]);
  }
  return { vertices, triangles: box.triangles, faceGroups: box.faceGroups };
}

// 逐面 v1 / v2 指纹（modelVerts = 自身全顶点云 → 框架/归一化用整个 box，镜 worker：单面三角化 vertices/triangles，
// 全模型点云做 modelVerts。本合成夹具单面三角化 = 整 box（faceGroups 切出每面），全模型点云 = box.vertices）。
function f1s(box) { return box.faceGroups.map((g) => faceFingerprint(box.vertices, box.triangles, g, box.vertices)); }
function f2s(box) { return box.faceGroups.map((g) => faceFingerprintV2(box.vertices, box.triangles, g, box.vertices)); }
// 逐面 v2 指纹，但 modelVerts 用【外部点云】（镜 worker：单面三角化 + _fpModelVerts(shape) 全模型云分开传）。
function f2sCloud(box, cloud) { return box.faceGroups.map((g) => faceFingerprintV2(box.vertices, box.triangles, g, cloud)); }
// 旋转一个 flat 顶点数组（点云用）。
function rotateFlat(v, axis, ang) {
  const R = rotMatrix(axis, ang);
  const out = [];
  for (let i = 0; i + 2 < v.length; i += 3) { const p = applyR(R, [v[i], v[i + 1], v[i + 2]]); out.push(p[0], p[1], p[2]); }
  return out;
}
// ⚠ 普通长方体【中心对称】（principalFrame.signAmbiguous 三轴全 true）→ ±X/±Y/±Z 对面经号折叠【撞同一 v2 key】
//   （faceFingerprint.ts 诚实边界 2：对称体 f2 撞率高）→ 唔满足 GATE(b) 唯一性。要验唯一闸须用【非中心对称】体：
//   主箱 + 偏一角嘅小凸块 → 三轴 skewness 全非零 → signAmbiguous 三轴全 false → 6 面 v2 各唯一。
//   该凸块只入【点云】（定主框架），唔加面 —— 仍验主箱 6 面（镜 worker 拣主箱面但框架由整体几何定）。
function steppedCloud(box) {
  // 偏 +X/+Y/+Z 一角嘅细块角点（破三轴对称）。值经验证 → signAmbiguous=[false,false,false]、6 面唯一。
  const blob = [];
  for (let b = 0; b < 8; b++) blob.push(10 + ((b & 1) ? 9 : 0), 9 + ((b & 2) ? 11 : 0), 17 + ((b & 4) ? 13 : 0));
  return box.vertices.concat(blob);
}

// ================================================================== (1) ROTATION-INVARIANCE
//
// 非对称箱（10×20×30）一面刚体旋转 37° → v2 不变（worker 旋转后仍跟同一几何面），同时 v1 漂移。
// 呢个就系 S136 接线动机：上游刚体旋转后，靠 v2 揾返同一张面；靠 v1 会 miss（退 near-point，可能跟错面）。
test('(1) ROTATION-INVARIANCE: a face v2 fp is stable across rotation where v1 drifts', () => {
  const box = makeBox(10, 20, 30, 0, 0, 0);
  const rot = rotateBox(box, [1, 2, 3], (37 * Math.PI) / 180);
  const a2 = f2s(box), b2 = f2s(rot);
  const a1 = f1s(box), b1 = f1s(rot);
  let v2Same = 0, v1Drift = 0;
  for (let i = 0; i < 6; i++) {
    assert(a2[i] === b2[i], `面${i} v2 旋转后变咗（应旋转不变）：\n  ${a2[i]}\n  ${b2[i]}`);
    v2Same++;
    if (a1[i] !== b1[i]) v1Drift++;
  }
  assert(v2Same === 6, `v2 应全 6 面旋转不变，实得 ${v2Same}`);
  assert(v1Drift > 0, `v1 应至少有面旋转后漂移（证明 v2 有价值 + 测试有咬合），实得 0`);
  return `v2 6/6 面旋转不变；v1 ${v1Drift}/6 面旋转后漂移 → worker 靠 v2 跟同一几何面`;
});

// ================================================================== (2) UNIQUENESS GATE (worker GATE b)
//
// 非对称箱 wellConditioned=true，6 面 v2 全唯一（每个 count===1）→ worker 逐面采信 v2 →
// 旋转后用 stored v2 指纹喺旋转后面集 lookup，攞返【同一张面索引】（map round-trip）。
test('(2) UNIQUENESS GATE: well-conditioned asymmetric body → 6 unique v2 fps → rotated lookup resolves same face', () => {
  const box = makeBox(10, 20, 30, 0, 0, 0);
  const cloud = steppedCloud(box);   // 非中心对称点云 → 三轴 signAmbiguous=false
  const pf = principalFrame(cloud);
  assert(pf.wellConditioned === true, '阶梯体应 wellConditioned=true（GATE a 开）');
  assert(pf.signAmbiguous.every((s) => s === false),
    `阶梯体三轴应全无号歧义（GATE b 唯一前提），实得 ${JSON.stringify(pf.signAmbiguous)}`);

  // 捕获阶段（worker _ffCapture）：原姿态算 6 面 v2 指纹（面三角化 = 主箱，框架 = 整体点云）。
  const captured = f2sCloud(box, cloud);

  // worker GATE(b) 前提：每个 v2 指纹喺面集【唯一】（count===1）。
  const counts = new Map();
  for (const fp of captured) { counts.set(fp, (counts.get(fp) ?? 0) + 1); }
  for (let i = 0; i < 6; i++) {
    assert(counts.get(captured[i]) === 1,
      `面${i} v2 指纹应唯一（GATE b），实得 count=${counts.get(captured[i])}`);
  }

  // 选取阶段（worker _ffSelectPts）：刚体旋转【面 + 点云一齐转】（镜 worker：_fpModelVerts(shape) 跟 shape 转），
  // 用 stored 指纹建 fp→idx map，逐面 lookup 应攞返原索引。
  const axis = [3, -1, 2], ang = (88 * Math.PI) / 180;
  const rv = rotateFlat(box.vertices, axis, ang);
  const rcloud = rotateFlat(cloud, axis, ang);
  assert(principalFrame(rcloud).wellConditioned === true, '旋转后框架仍应 wellConditioned=true');
  const rotFps = box.faceGroups.map((g) => faceFingerprintV2(rv, box.triangles, g, rcloud));
  const v2FpToIdx = new Map();
  for (let i = 0; i < 6; i++) { if (!v2FpToIdx.has(rotFps[i])) v2FpToIdx.set(rotFps[i], i); }
  for (let i = 0; i < 6; i++) {
    const got = v2FpToIdx.get(captured[i]);
    assert(got === i, `面${i} 旋转后 v2 round-trip：期望 idx ${i}，实得 ${got}`);
  }
  return `6/6 面 v2 唯一（非对称体）→ 旋转 88° 后 stored v2 全部 round-trip 到原索引`;
});

// ================================================================== (3) DEGENERATE GATE (worker GATE a)
//
// 立方体 principalFrame.wellConditioned===false → worker GATE(a) 关 → 一律唔采信 v2（无论唯一与否）→
// 严格退回 v1（行为 NO-OP）。本测试证 wellConditioned===false（worker 据此关闸）+ v2 前缀带 'X' advisory。
test('(3) DEGENERATE GATE: cube wellConditioned===false → worker rejects v2 (strict NO-OP, falls to v1)', () => {
  const cube = makeBox(10, 10, 10);
  const frame = principalFrame(cube.vertices);
  assert(frame.wellConditioned === false,
    `立方体惯量简并，应 wellConditioned=false（worker GATE a 关）实得 ${frame.wellConditioned}`);
  // 立方体每面 v2 应带 advisory 前缀 f2X|（worker 即使唔睇 wellConditioned，亦可由前缀侦测）。
  const fps = f2s(cube);
  for (let i = 0; i < 6; i++) {
    assert(fps[i].startsWith('f2X|'), `立方体面${i} v2 应带 advisory 前缀 f2X|，实得 ${fps[i].slice(0, 5)}`);
  }
  // 模拟 worker 闸逻辑：v2FrameOk=false → 任何 v2want 都唔采信。
  const v2FrameOk = frame.wellConditioned; // false
  const v2want = fps[0];
  const trusted = !!(v2want && v2FrameOk); // worker: v2want && v2FrameOk && (count===1)
  assert(trusted === false, '立方体应 GATE(a) 关 → 唔采信任何 v2（严格退 v1）');
  return `立方体 wellConditioned=false（6 面全 f2X|）→ worker 拒 v2，退回 v1（NO-OP）`;
});

// ================================================================== (4) FALLBACK semantics
//
// 空 v2 串（cloud 攞唔到时 _ffCapture 推 ''）+ 伪造/缺席 v2 指纹 → worker 视为 miss → 退回 v1。
test('(4) FALLBACK: empty / bogus / absent v2 fp → not found → worker falls back to v1', () => {
  const box = makeBox(10, 20, 30, 0, 0, 0);
  const fps = f2sCloud(box, steppedCloud(box));   // 用非对称体 → 6 面唯一，sanity round-trip 可靠
  const v2FpToIdx = new Map();
  for (let i = 0; i < 6; i++) { if (!v2FpToIdx.has(fps[i])) v2FpToIdx.set(fps[i], i); }

  // (a) 空串：worker `faceFpV2.some(s=>s)` 唔会因纯空串建 v2 map；逐条 `v2want && ...` 空串 falsy → 直接 fall through。
  assert([''].some((s) => s) === false, '纯空串数组 .some(s=>s) 应 false → worker 唔建 v2 map');
  const emptyWant = '';
  assert(!(emptyWant && v2FpToIdx.get(emptyWant) !== undefined),
    '空 v2 串应当 miss → 退回 v1');

  // (b) 伪造字串：唔系真 v2 格式 → lookup undefined → fall through。
  const bogus = 'f2|n:9/9/9|c:9/9/9|a:9|d:9|t:999|v:999';
  assert(v2FpToIdx.get(bogus) === undefined, `伪造 v2 fp 应缺席；实得 ${v2FpToIdx.get(bogus)}`);

  // (c) 缺席真指纹：一张【从未加入 map】嘅面（用别个 box 一面）真 v2 指纹 → 亦缺席。
  const other = makeBox(7, 13, 29, 5, 5, 5);
  const absentFp = f2s(other)[3];
  assert(v2FpToIdx.get(absentFp) === undefined,
    `缺席真 v2 fp 应 undefined；实得 ${v2FpToIdx.get(absentFp)}`);

  // sanity：真存在嗰个仍解得到 → 确保 undefined 系「缺席」而唔系坏 map。
  assert(v2FpToIdx.get(fps[2]) === 2, `sanity：在席面 idx2 应解返 2，实得 ${v2FpToIdx.get(fps[2])}`);

  return `空串/伪造/缺席真 fp 全 miss → worker 退回 v1；在席 fp 仍解返原索引`;
});

// ------------------------------------------------------------------ 汇总
const total = passN + failN;
console.log('');
console.log(`${failN === 0 ? 'PASS' : 'FAIL'} ${passN}/${total}`);
if (failN !== 0) process.exit(1);
