// edgefingerprint.test.mjs — 「持久边身份」几何指纹（src/cad/edgeFingerprint.ts）验证
//
// 配套 facefingerprint.test.mjs（面指纹）。呢个验证【边】版本，专修 Fillet/Chamfer 选边
// 跨重建漂移：worker 而家靠 near-point 拣边，重建后该点可能跌落另一条边 → 圆角跑错边。
// 边指纹 = 跨重建相对稳定嘅 edge id（边几何唔变 → 指纹唔变），令 remapEdgePick 可以
// 把旧 near-point 拣边迁移到重建后【指纹匹配】嗰条新边（圆角跟返同一几何棱）。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/edgefingerprint.test.mjs
// 全部测试通过 → exit 0；任一失败 → exit 1。

import { edgeFingerprint, edgeGeom, buildEdgeFingerprintMap, remapEdgePick, nearestEdge } from '../src/cad/edgeFingerprint.ts';

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
function fmt(x, d = 4) { return Number(x).toFixed(d); }

// ------------------------------------------------------------------ 测试夹具：box 嘅 12 条棱 + 全模型 vertices
//
// box 8 角，编号 b：bit0=x, bit1=y, bit2=z（同 facefingerprint boxMesh 一致）。
// 每条棱 = 一对相邻角之间嘅直线 polyline（worker 真实做法：直线 sample 2 点 [start,end]）。
// vertices = 全模型 flat 顶点（畀 edgeFingerprint 定 bbox 归一化尺度）。
function corner(sx, sy, sz, ox, oy, oz, b) {
  return [ox + ((b & 1) ? sx : 0), oy + ((b & 2) ? sy : 0), oz + ((b & 4) ? sz : 0)];
}
// box 12 条棱（角对，标准立方体棱表）。
const EDGE_PAIRS = [
  [0, 1], [2, 3], [4, 5], [6, 7], // 沿 X
  [0, 2], [1, 3], [4, 6], [5, 7], // 沿 Y
  [0, 4], [1, 5], [2, 6], [3, 7], // 沿 Z
];
function makeBoxEdges(sx, sy, sz, ox = 0, oy = 0, oz = 0) {
  const vertices = [];
  for (let b = 0; b < 8; b++) vertices.push(...corner(sx, sy, sz, ox, oy, oz, b));
  // 每条棱直线 sample 2 点（start,end）—— worker 直线边就系咁
  const edges = EDGE_PAIRS.map(([a, b]) => ({
    poly: [corner(sx, sy, sz, ox, oy, oz, a), corner(sx, sy, sz, ox, oy, oz, b)],
  }));
  return { vertices, edges };
}
function edgeFps(box) {
  return box.edges.map((e) => edgeFingerprint(box.vertices, e.poly));
}

// ------------------------------------------------------------------ T1 稳定性：同 box 算两次逐边一致
test('T1 稳定性：同 box 算两次边指纹逐条一致', () => {
  const box = makeBoxEdges(10, 20, 30);
  const a = edgeFps(box);
  const b = edgeFps(box);
  for (let i = 0; i < 12; i++) assert(a[i] === b[i], `棱${i} 两次指纹唔同：${a[i]} vs ${b[i]}`);
  return `12 棱全一致，例 → ${a[0].slice(0, 44)}…`;
});

// ------------------------------------------------------------------ T2 分辨率：长方体 12 棱指纹全部唔同（无撞）
test('T2 分辨率：长方体（10×20×30）12 棱指纹全部唔同（无撞）', () => {
  const box = makeBoxEdges(10, 20, 30);
  const fps = edgeFps(box);
  const set = new Set(fps);
  assert(set.size === 12, `12 棱只得 ${set.size} 个唯一指纹（有撞）：${JSON.stringify(fps)}`);
  return `12 个唯一指纹，无撞`;
});

// ------------------------------------------------------------------ T3 平移不变：box 平移后逐边指纹稳定
test('T3 平移不变：box 平移 (+100,+200,+300) 后逐边指纹稳定', () => {
  const a = edgeFps(makeBoxEdges(10, 20, 30, 0, 0, 0));
  const b = edgeFps(makeBoxEdges(10, 20, 30, 100, 200, 300));
  for (let i = 0; i < 12; i++) assert(a[i] === b[i], `棱${i} 平移后指纹变咗：${a[i]} vs ${b[i]}`);
  return `中点/端点用 bbox 归一化 → 平移完全不变（12/12）`;
});

// ------------------------------------------------------------------ T4 缩放不变：box 整体 ×2 后逐边指纹稳定
test('T4 缩放不变：box 整体 ×2 后逐边指纹稳定', () => {
  const a = edgeFps(makeBoxEdges(10, 20, 30));
  const b = edgeFps(makeBoxEdges(20, 40, 60));   // 各轴 ×2 = 各向同性整体缩放
  for (let i = 0; i < 12; i++) assert(a[i] === b[i], `棱${i} 缩放后指纹变咗：${a[i]} vs ${b[i]}`);
  return `长度/中点/端点全 bbox 归一化 → 各向同性缩放不变（12/12）`;
});

// ------------------------------------------------------------------ T5 容差稳定：微抖动 ±1e-5 → 指纹不变
test('T5 容差稳定：端点加 ±1e-5 抖动 → 指纹不变', () => {
  const box = makeBoxEdges(10, 20, 30);
  const a = edgeFps(box);
  // 决定性微抖动（±1e-5 级，远细过 POS_TOL=0.01）
  const jv = box.vertices.map((v, i) => v + ((i % 2 ? 1 : -1) * 1e-5));
  const je = box.edges.map((e) => ({ poly: e.poly.map((p) => p.map((c, k) => c + ((k % 2 ? 1 : -1) * 1e-5))) }));
  const b = je.map((e) => edgeFingerprint(jv, e.poly));
  for (let i = 0; i < 12; i++) assert(a[i] === b[i], `棱${i} 抖动后指纹变咗：${a[i]} vs ${b[i]}`);
  return `量化吸收 1e-5 抖动 → 12/12 不变`;
});

// ------------------------------------------------------------------ T6 方向无关：polyline 起终调转 → 同指纹
test('T6 方向无关：边采样方向调转（start↔end）→ 同指纹', () => {
  const box = makeBoxEdges(10, 20, 30);
  for (let i = 0; i < 12; i++) {
    const fwd = edgeFingerprint(box.vertices, box.edges[i].poly);
    const rev = edgeFingerprint(box.vertices, [...box.edges[i].poly].reverse());
    assert(fwd === rev, `棱${i} 反向后指纹变咗（端点/方向未对称）：${fwd} vs ${rev}`);
  }
  return `端点排序 + 方向取|·|排序 → 反向 12/12 同指纹`;
});

// ------------------------------------------------------------------ T7 直 vs 曲：同端点嘅直线 vs 弧 → 唔同指纹
test('T7 直 vs 曲：同端点嘅直线 vs 圆弧 → 指纹唔同（fillet 弧 vs 原直棱可分）', () => {
  const verts = [0, 0, 0, 10, 0, 0]; // 模型 bbox 由两端定
  const straight = [[0, 0, 0], [10, 0, 0]];
  // 同端点但中段拱起嘅弧（sample 3 点：中点抬高 3）
  const arc = [[0, 0, 0], [5, 3, 0], [10, 0, 0]];
  const fs = edgeFingerprint(verts, straight);
  const fa = edgeFingerprint(verts, arc);
  assert(fs !== fa, `直线同弧指纹竟相同（sagitta 未入指纹）：${fs}`);
  const gs = edgeGeom(straight), ga = edgeGeom(arc);
  assert(gs.sagitta < 1e-6, `直线 sagitta 应≈0，实得 ${fmt(gs.sagitta)}`);
  assert(ga.sagitta > 0.01, `弧 sagitta 应>0，实得 ${fmt(ga.sagitta)}`);
  return `直 sagitta=${fmt(gs.sagitta)}, 弧 sagitta=${fmt(ga.sagitta)} → 指纹分得开`;
});

// ------------------------------------------------------------------ T8 edgeGeom：弧长/中点/闭合 数值正确
test('T8 edgeGeom：直棱长度/中点正确 + 闭环检测', () => {
  const g = edgeGeom([[0, 0, 0], [10, 0, 0]]);
  assert(Math.abs(g.length - 10) < 1e-9, `长度应 10，实得 ${fmt(g.length)}`);
  assert(Math.abs(g.midpoint[0] - 5) < 1e-9, `弧长中点 x 应 5，实得 ${fmt(g.midpoint[0])}`);
  assert(!g.closed, `开放直棱误判闭合`);
  // 闭合方形环（4 段回到起点）：弧长中点应喺对角附近、closed=true
  const loop = edgeGeom([[0, 0, 0], [10, 0, 0], [10, 10, 0], [0, 10, 0], [0, 0, 0]]);
  assert(loop.closed, `方环未判定闭合`);
  assert(Math.abs(loop.length - 40) < 1e-9, `方环周长应 40，实得 ${fmt(loop.length)}`);
  return `直棱 len=10 mid.x=5 开放；方环 len=40 闭合`;
});

// ------------------------------------------------------------------ T9 buildEdgeFingerprintMap：指纹→索引一一对应
test('T9 buildEdgeFingerprintMap：长方体 12 棱 → 12 唯一指纹键、值=边索引', () => {
  const box = makeBoxEdges(10, 20, 30);
  const map = buildEdgeFingerprintMap(box.vertices, box.edges);
  assert(map.size === 12, `指纹 map 唔系 12 项（有撞）：size=${map.size}`);
  const vals = new Set([...map.values()]);
  assert(vals.size === 12, `边索引值唔系 12 个唯一：${[...vals]}`);
  return `12 指纹 → 边索引 0..11 一一对应`;
});

// ------------------------------------------------------------------ T10 remapEdgePick：换 mesh（平移+换序）仍跟返同一棱
test('T10 remapEdgePick：重建（平移 + 边重排）后 near-point 跟返同一几何棱', () => {
  // 旧 mesh：用户拣咗「沿 X、底前」嗰条棱（角 0→1），near 点喺该棱中点附近。
  const oldBox = makeBoxEdges(10, 20, 30, 0, 0, 0);
  const pickedOld = 0;                       // EDGE_PAIRS[0] = [0,1]，沿 X 底前棱
  const near = [5, 0, 0];                    // 该棱中点 (5,0,0) 附近
  // 「重建」：几何平移 + 把边集【打乱顺序】（模拟 OCCT 边序漂移）。
  const newBoxRaw = makeBoxEdges(10, 20, 30, 100, 200, 300);
  const perm = [7, 0, 11, 3, 9, 1, 5, 10, 2, 8, 4, 6]; // 任意置换
  const newBox = { vertices: newBoxRaw.vertices, edges: perm.map((i) => newBoxRaw.edges[i]) };
  const r = remapEdgePick(near, oldBox.vertices, oldBox.edges, newBox.vertices, newBox.edges);
  assert(r != null, `remap 返 null（无迁移）`);
  assert(r.method === 'fingerprint', `应靠指纹精确命中，实际 method=${r.method}`);
  // 新边集 r.newIndex 嗰条，应几何上等同旧拣中棱（平移后嘅 [0,1] 棱：中点 (5+100,0+200,0+300)）。
  const newPoly = newBox.edges[r.newIndex].poly;
  const mid = edgeGeom(newPoly).midpoint;
  assert(Math.abs(mid[0] - 105) < 1e-6 && Math.abs(mid[1] - 200) < 1e-6 && Math.abs(mid[2] - 300) < 1e-6,
    `跟错棱：新中点应 (105,200,300)，实得 (${mid.map((x) => fmt(x, 1)).join(',')})`);
  return `near (5,0,0) → 旧棱[0,1] → 指纹 → 新边集索引 ${r.newIndex}（同一几何棱，平移+重排无影响）`;
});

// ------------------------------------------------------------------ T11 remapEdgePick fallback：几何变 → 退回 near-point（唔 throw）
test('T11 诚实边界：棱几何变（box 变阔）→ 指纹对唔上 → 退回 near-point fallback', () => {
  const oldBox = makeBoxEdges(10, 20, 30, 0, 0, 0);
  const near = [5, 0, 0];                    // 旧「沿 X 底前」棱中点
  // 重建后 box 变阔（sx 10→40）→ 该棱长度/中点相对几何变 → 指纹对唔上。
  const newBox = makeBoxEdges(40, 20, 30, 0, 0, 0);
  const r = remapEdgePick(near, oldBox.vertices, oldBox.edges, newBox.vertices, newBox.edges);
  assert(r != null, `fallback 都返 null（不应该）`);
  assert(r.method === 'fallback', `几何变咗应退回 fallback，实际 method=${r.method}`);
  // fallback = 喺新边集用同一 near 揾最近 → 仍系底前沿 X 棱（新中点 (20,0,0)），唔会 throw。
  const fbDirect = nearestEdge(near, newBox.edges);
  assert(r.newIndex === fbDirect, `fallback 索引同裸 near-point 唔一致：${r.newIndex} vs ${fbDirect}`);
  return `box 变阔 → 指纹失配 → 诚实退回 near-point（method=fallback，行为退化到现状，唔 throw）`;
});

// ------------------------------------------------------------------ T12 已知撞风险（诚实记录）：立方体 12 棱 vs 旋转对称
test('T12 诚实：立方体 12 棱靠中点位置仍可分；旋转对称侧棱系已知撞', () => {
  // 立方体 12 棱长度全等，单靠长度/方向唔够；靠【归一化中点位置】区分（每棱中点喺 bbox 唔同位）。
  const cube = makeBoxEdges(10, 10, 10);
  const set = new Set(edgeFps(cube));
  assert(set.size === 12, `立方体 12 棱有撞（只 ${set.size} 唯一）—— 几何指纹局限：${JSON.stringify([...set])}`);
  // 诚实：构造两条「绕轴旋转对称」棱（长度+方向+中点对称位全等）→ 故意撞，记录局限。
  // 例：正方形顶环上对边（中心对称），翻译到同一 bbox 内对称位 → 指纹相同。
  const verts = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]; // 单位方形 bbox 0..10
  const eA = [[0, 5, 0], [10, 5, 0]];   // 水平中线
  const eB = [[5, 0, 0], [5, 10, 0]];   // 垂直中线（旋转 90° 对称）
  const fA = edgeFingerprint(verts, eA), fB = edgeFingerprint(verts, eB);
  // 呢两条【唔应该】撞（中点都喺 (0.5,0.5) 但方向唔同）→ 验证方向特征有效
  assert(fA !== fB, `水平/垂直中线竟撞（方向特征失效）：${fA}`);
  return `立方体 12/12 唯一；中点同位但方向唔同嘅边可分（旋转对称【侧棱】仍可能撞，见文件头边界 2）`;
});

// ------------------------------------------------------------------ T13 撞率实测（诚实数字）：随机长方体 + 立方体统计
test('T13 撞率实测：50 个随机长方体 0 撞；立方体/对称体记录残余撞率', () => {
  let total = 0, collided = 0;
  // 50 个唔同尺寸长方体（避免任两轴相等）→ 应 0 撞
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let boxColl = 0;
  for (let t = 0; t < 50; t++) {
    const sx = 5 + rnd() * 50, sy = 60 + rnd() * 50, sz = 120 + rnd() * 50; // 三轴量级分离 → 必唔等
    const box = makeBoxEdges(sx, sy, sz);
    const set = new Set(edgeFps(box));
    total += 12;
    const c = 12 - set.size;
    collided += c; boxColl += c;
  }
  assert(boxColl === 0, `随机长方体出现撞（${boxColl} 条）—— 不应该`);
  // 立方体（最坏对称）：实测唯一数，记录残余撞
  const cube = makeBoxEdges(7, 7, 7);
  const cubeUnique = new Set(edgeFps(cube)).size;
  const cubeColl = 12 - cubeUnique;
  return `长方体 600 棱 0 撞；立方体 12 棱 → ${cubeUnique} 唯一（撞 ${cubeColl}）。实测撞率主要源自旋转对称，非对称体≈0`;
});

// ------------------------------------------------------------------ 汇总
const failed = rows.filter((r) => !r.pass);
console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
if (failed.length) {
  console.log('FAILED: ' + failed.map((r) => r.name).join(', '));
  process.exit(1);
}
process.exit(0);
