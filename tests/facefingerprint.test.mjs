// facefingerprint.test.mjs — 「持久面身份」几何指纹（src/cad/faceFingerprint.ts）验证
//
// 对标审计 roadmap #2：B-rep 面 id 而家 = OCCT hashCode 跨重建唔稳 → 逐面色重建即失。
// 几何指纹 = 跨重建相对稳定嘅 face id（面几何唔变 → 指纹唔变），令 remapFaceColors 可以
// 把旧 hashCode-key 嘅 faceColors 迁移到新 hashCode-key（红色跟返同一几何面）。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/facefingerprint.test.mjs
// 全部测试通过 → exit 0；任一失败 → exit 1。

import { faceFingerprint, buildFingerprintMap, remapFaceColors, faceGeom } from '../src/cad/faceFingerprint.ts';

// ------------------------------------------------------------------ 小框架（仿 thermalstress.test.mjs）
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

// ------------------------------------------------------------------ 测试网格：box + faceGroups
//
// OCCT 真实行为：每张 B-rep 面 = 一个 faceGroup（box → 6 个，各 2 三角）。
// faceGroups.start/count 系 triangles【数组下标】(=三角序号×3)。下面 box 用 8 共享顶点、
// 12 三角，按面分 6 个 run（每 run 2 三角 = 6 个下标）。
//
// 顶点编号 b：bit0=x, bit1=y, bit2=z（同 thermalstress boxMesh 一致）。
// faceId 用任意整数模拟 OCCT hashCode（跨重建会变 → 测试故意畀两套唔同 faceId）。
function makeBox(sx, sy, sz, ox = 0, oy = 0, oz = 0, faceIds = [101, 102, 103, 104, 105, 106]) {
  const vertices = [];
  for (let b = 0; b < 8; b++) {
    vertices.push(ox + ((b & 1) ? sx : 0), oy + ((b & 2) ? sy : 0), oz + ((b & 4) ? sz : 0));
  }
  // 6 张面，每面 2 三角，绕向令法向朝外（区分 +/− 面）。
  const triangles = [
    0, 2, 3, 0, 3, 1, // z=0  (法向 -Z)
    4, 5, 7, 4, 7, 6, // z=sz (法向 +Z)
    0, 1, 5, 0, 5, 4, // y=0  (法向 -Y)
    2, 6, 7, 2, 7, 3, // y=sy (法向 +Y)
    0, 4, 6, 0, 6, 2, // x=0  (法向 -X)
    1, 3, 7, 1, 7, 5, // x=sx (法向 +X)
  ];
  // 每面一个 faceGroup：start = 面序×6（每面 6 个三角下标），count = 6。
  const faceGroups = [];
  for (let f = 0; f < 6; f++) faceGroups.push({ start: f * 6, count: 6, faceId: faceIds[f] });
  return { vertices, triangles, faceGroups };
}

// 全部 6 面指纹（按 faceGroup 顺序）
function faceFps(box) {
  return box.faceGroups.map((g) => faceFingerprint(box.vertices, box.triangles, g));
}

// ------------------------------------------------------------------ T1 稳定性：同一 box 算两次完全一致
test('T1 稳定性：同 box 算两次指纹逐面一致', () => {
  const box = makeBox(10, 20, 30);
  const a = faceFps(box);
  const b = faceFps(box);
  for (let i = 0; i < 6; i++) assert(a[i] === b[i], `面${i} 两次指纹唔同：${a[i]} vs ${b[i]}`);
  return `6 面全一致，例 z=0 面 → ${a[0].slice(0, 40)}…`;
});

// ------------------------------------------------------------------ T2 分辨率：box 6 面指纹全部唔同（无撞）
test('T2 分辨率：box 6 面指纹全部唔同（无撞）', () => {
  const box = makeBox(10, 20, 30);
  const fps = faceFps(box);
  const set = new Set(fps);
  assert(set.size === 6, `6 面只得 ${set.size} 个唯一指纹（有撞）：${JSON.stringify(fps)}`);
  return `6 个唯一指纹，无撞`;
});

// ------------------------------------------------------------------ T3 平移不变：box 平移后逐面指纹稳定
test('T3 平移不变：box 平移 (+100,+200,+300) 后逐面指纹稳定', () => {
  const a = faceFps(makeBox(10, 20, 30, 0, 0, 0));
  const b = faceFps(makeBox(10, 20, 30, 100, 200, 300));
  for (let i = 0; i < 6; i++) assert(a[i] === b[i], `面${i} 平移后指纹变咗：${a[i]} vs ${b[i]}`);
  return `质心用 bbox 归一化 → 平移完全不变（6/6）`;
});

// ------------------------------------------------------------------ T4 缩放不变：box 整体 ×2 后逐面指纹稳定
test('T4 缩放不变：box 整体 ×2 后逐面指纹稳定', () => {
  const a = faceFps(makeBox(10, 20, 30));
  const b = faceFps(makeBox(20, 40, 60));   // 各轴 ×2 = 各向同性整体缩放
  for (let i = 0; i < 6; i++) assert(a[i] === b[i], `面${i} 缩放后指纹变咗：${a[i]} vs ${b[i]}`);
  return `面积/质心/对角全 bbox 归一化 → 各向同性缩放不变（6/6）`;
});

// ------------------------------------------------------------------ T5 容差稳定：微抖动 ±1e-5 → 指纹不变
test('T5 容差稳定：顶点加 ±1e-5 抖动 → 指纹不变', () => {
  const box = makeBox(10, 20, 30);
  const a = faceFps(box);
  // 决定性微抖动（±1e-5 级，远细过 POS_TOL=0.01）
  const jittered = { ...box, vertices: box.vertices.map((v, i) => v + ((i % 2 ? 1 : -1) * 1e-5)) };
  const b = faceFps(jittered);
  for (let i = 0; i < 6; i++) assert(a[i] === b[i], `面${i} 抖动后指纹变咗：${a[i]} vs ${b[i]}`);
  return `量化吸收 1e-5 抖动 → 6/6 不变`;
});

// ------------------------------------------------------------------ T6 remapFaceColors：重建换 hashCode 仍保住色
test('T6 remapFaceColors：重建（换 faceId）后红色跟返同一几何面', () => {
  // 旧 mesh：6 面 faceId = 101..106；畀 z=0 面（faceId 101）上红色。
  const oldBox = makeBox(10, 20, 30, 0, 0, 0, [101, 102, 103, 104, 105, 106]);
  const oldColors = { '101': '#f00' };   // store.faceColors：key = String(faceId)
  // 「重建」：同几何、同 faceGroups 划分，但 faceId 全换一套（模拟 hashCode 漂移）。
  const newBox = makeBox(10, 20, 30, 0, 0, 0, [777, 888, 999, 555, 444, 333]);
  const out = remapFaceColors(
    oldColors, oldBox.faceGroups, oldBox.vertices, oldBox.triangles,
    newBox.faceGroups, newBox.vertices, newBox.triangles,
  );
  // 期望：红色迁移到【新 z=0 面】嘅新 faceId(777) key。
  assert(out['777'] === '#f00', `红色无迁移到新 z=0 面(777)：${JSON.stringify(out)}`);
  // 只迁移咗一条色，无散到其他面。
  assert(Object.keys(out).length === 1, `迁移咗多过 1 条色（撞/散色）：${JSON.stringify(out)}`);
  // 旧 key 101 唔应该残留。
  assert(!('101' in out), `旧 hashCode key 101 残留：${JSON.stringify(out)}`);
  return `#f00: 101 → 777（同一 z=0 几何面），仅 1 条色`;
});

// ------------------------------------------------------------------ T7 remapFaceColors：平移+换id 重建仍保住色
test('T7 remapFaceColors：几何平移 + 换 faceId 重建后仍保住逐面色', () => {
  const oldBox = makeBox(10, 20, 30, 0, 0, 0, [1, 2, 3, 4, 5, 6]);
  // 畀 +X 面（faceGroup index 5, faceId 6）上蓝色 + z=0 面(faceId 1)上红色。
  const oldColors = { '6': '#00f', '1': '#f00' };
  // 重建：平移 + 换全新 faceId。
  const newBox = makeBox(10, 20, 30, 50, 60, 70, [60, 50, 40, 30, 20, 10]);
  const out = remapFaceColors(
    oldColors, oldBox.faceGroups, oldBox.vertices, oldBox.triangles,
    newBox.faceGroups, newBox.vertices, newBox.triangles,
  );
  // 新 +X 面 faceId = 10（faceGroup index 5）；新 z=0 面 faceId = 60（index 0）。
  assert(out['10'] === '#00f', `蓝色无跟返 +X 面(新id 10)：${JSON.stringify(out)}`);
  assert(out['60'] === '#f00', `红色无跟返 z=0 面(新id 60)：${JSON.stringify(out)}`);
  assert(Object.keys(out).length === 2, `迁移色数唔系 2：${JSON.stringify(out)}`);
  return `蓝→+X(10), 红→z=0(60)，平移不影响迁移`;
});

// ------------------------------------------------------------------ T8 颜色丢失（诚实边界）：面几何变 → 该色丢失
test('T8 诚实边界：面几何改变 → 指纹变 → 该面色丢失（可接受）', () => {
  const oldBox = makeBox(10, 20, 30, 0, 0, 0, [1, 2, 3, 4, 5, 6]);
  const oldColors = { '6': '#00f' };   // +X 面上蓝
  // 重建后 box 变阔（sx 10→40）→ +X 面位置/面积/法向相对几何变 → 指纹应变 → 蓝色丢失。
  const newBox = makeBox(40, 20, 30, 0, 0, 0, [60, 50, 40, 30, 20, 10]);
  const out = remapFaceColors(
    oldColors, oldBox.faceGroups, oldBox.vertices, oldBox.triangles,
    newBox.faceGroups, newBox.vertices, newBox.triangles,
  );
  // 诚实：+X 面几何变（相对 bbox 比例唔同），指纹对唔上 → 颜色丢失（out 应为空或唔含错迁移）。
  assert(Object.keys(out).length === 0, `面几何变咗但色仲迁移咗（应丢失）：${JSON.stringify(out)}`);
  return `box 变阔 → +X 面指纹变 → 蓝色诚实丢失（0 条迁移），无错跟其他面`;
});

// ------------------------------------------------------------------ T9 buildFingerprintMap：指纹→faceId 一一对应
test('T9 buildFingerprintMap：6 面 → 6 个唯一指纹键、值=对应 faceId', () => {
  const box = makeBox(10, 20, 30, 0, 0, 0, [11, 22, 33, 44, 55, 66]);
  const map = buildFingerprintMap(box.vertices, box.triangles, box.faceGroups);
  assert(map.size === 6, `指纹 map 唔系 6 项（有撞）：size=${map.size}`);
  const vals = new Set([...map.values()]);
  assert(vals.size === 6, `faceId 值唔系 6 个唯一：${[...vals]}`);
  for (const id of [11, 22, 33, 44, 55, 66]) assert(vals.has(id), `缺 faceId ${id}`);
  return `6 指纹 → {11,22,33,44,55,66} 一一对应`;
});

// ------------------------------------------------------------------ T10 faceGeom：几何量正确性（面积/法向）
test('T10 faceGeom：z=0 面 面积/法向数值正确', () => {
  const box = makeBox(10, 20, 30);   // z=0 面 = 10×20 矩形，法向 -Z
  const g = faceGeom(box.vertices, box.triangles, box.faceGroups[0]);
  assert(Math.abs(g.area - 200) < 1e-6, `z=0 面面积应 200，实得 ${fmt(g.area)}`);
  assert(Math.abs(g.normal[2] + 1) < 1e-6 && Math.abs(g.normal[0]) < 1e-6 && Math.abs(g.normal[1]) < 1e-6,
    `z=0 面法向应 (0,0,-1)，实得 (${g.normal.map((x) => fmt(x, 3)).join(',')})`);
  assert(g.triCount === 2, `z=0 面三角数应 2，实得 ${g.triCount}`);
  assert(g.vertCount === 4, `z=0 面去重顶点数应 4，实得 ${g.vertCount}`);
  return `area=${fmt(g.area)}, n=(0,0,-1), tri=2, vert=4`;
});

// ------------------------------------------------------------------ T11 已知撞风险（诚实记录）：立方体 + 对称
test('T11 诚实：立方体（6 面全等）质心位置令各面仍分得开', () => {
  // 立方体 6 面面积/形状全等，单靠面积/法向唔够（+Z 同 -Z 法向唔同但面积同）。
  // 靠【归一化质心位置】区分：每面质心喺 bbox 唔同位（如 -Z 面 z=0、+Z 面 z=1）。
  const cube = makeBox(10, 10, 10);
  const fps = faceFps(cube);
  const set = new Set(fps);
  assert(set.size === 6, `立方体 6 面指纹有撞（只 ${set.size} 唯一）—— 几何指纹局限：${JSON.stringify(fps)}`);
  return `立方体 6 面靠质心位置仍 6 个唯一指纹（已是几何指纹能力上限；旋转对称体侧面仍可能撞，见文件头）`;
});

// ------------------------------------------------------------------ 汇总
const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((r) => r.name).join(', '));
  process.exit(1);
}
process.exit(0);
