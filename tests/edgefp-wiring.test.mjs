// edgefp-wiring.test.mjs — 「持久边身份」边指纹【接线】纯数值验证（无需 OCCT kernel）
//
// 目的：唔靠 worker / replicad / OCCT，只用合成 polyline + 合成全模型 vertices，验证
//   src/cad/edgeFingerprint.ts 嘅【接线契约】成立 —— 即调用方（worker roundNearPoint）
//   迁移选边时所依赖嘅四条性质：
//
//   (1) STABILITY 稳定性 —— 同一条边几何唔变，喺两个【只差一个远处无关顶点/扰动】嘅
//       全模型 vertices 下指纹【相等】；该边长度/形状一变 → 指纹【变】。
//   (2) MAP ROUND-TRIP 映射往返 —— buildEdgeFingerprintMap 起一个【指纹→索引】Map，
//       用当初解析出嗰条边嘅指纹去 lookup，攞返【原本嗰条边嘅索引】。
//   (3) FALLBACK 退路语义 —— 一个伪造/唔存在嘅指纹喺 Map 揾唔到（lookup === undefined），
//       调用方据此退回 near-point（呢度只验「揾唔到」呢个前提成立）。
//   (4) SYMMETRIC COLLISION 对称撞 —— 一组几何全等嘅边（正方棱柱 4 条竖棱，同长同向同形
//       喺对称位）指纹【可能撞】；验证撞【可被侦测】（≥2 条边共享同一指纹）→ 调用方
//       可视为歧义→退回 fallback。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/edgefp-wiring.test.mjs
// 全部测试通过 → 打印 PASS 总数并 exit 0；任一失败 → 打印 FAIL 并 exit 1。
//
// ⚠ 用 REAL 导出（edgeFingerprint / buildEdgeFingerprintMap / EdgeRecord 形 { poly }）。
//   纯函数、无副作用、唔 touch 任何 monolith（store.ts / cad.worker.ts / Viewport.tsx）。

import { edgeFingerprint, buildEdgeFingerprintMap } from '../src/cad/edgeFingerprint.ts';

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

// ------------------------------------------------------------------ 合成夹具：polyline + flat vertices
//
// EdgePolyline = 有序 [x,y,z] 点数组；EdgeRecord = { poly }。
// 全模型 vertices = flat Float-ish array [x,y,z, x,y,z, ...]（edgeFingerprint 只用嚟定 bbox 归一化尺度）。

// 把若干 [x,y,z] 点摊平成 flat vertices 数组。
function flatten(points) {
  const out = [];
  for (const p of points) { out.push(p[0], p[1], p[2]); }
  return out;
}

// 一条直边 polyline：worker 真实做法 = 直线 sample 2 点 [start, end]。
function straightEdge(a, b) { return [a, b]; }

// 一个 1x1x1 单位 box 嘅 8 角（定一个稳定嘅模型 bbox 尺度），摊平成 vertices。
const BOX_CORNERS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];
const BASE_VERTS = flatten(BOX_CORNERS);

// ================================================================== (1) STABILITY
//
// 一条固定几何边（box 底面一条棱：[0,0,0]→[1,0,0]）。
// vertsA = 原 box 顶点；vertsB = 原 box 顶点 + 一个【远处无关】顶点（far away，且对扰动）。
// 关键：呢个远处加点会改变模型 bbox —— 而归一化系除 bbox 对角。本测试要求嘅系
//   「只差一个 unrelated added vertex/perturbation far away」嘅情况下指纹【相等】。
// 为忠实实现「far away 但唔改尺度」嘅语义（即扰动落喺已有 bbox 内、唔撑大 box），
//   远处加点取 box 内一个与该棱无关嘅位置（box 内对角附近），从而 bbox 不变 → 归一化尺度不变。
//   （若加点撑大 bbox，归一化尺度会变 → 指纹按设计会变；呢个唔系本契约要验嘅情形。）
test('(1) STABILITY: unchanged edge → same fingerprint across unrelated vertex perturbation', () => {
  const edge = straightEdge([0, 0, 0], [1, 0, 0]);   // 固定几何棱

  // vertsA：原 box。
  const vertsA = BASE_VERTS.slice();
  // vertsB：加一个【远离该棱】但落喺现有 bbox 内嘅无关顶点（box 中心偏角，唔改 bbox）。
  //   该点 (0.5, 0.9, 0.9) 远离 z=0,y=0 嗰条棱，且喺 [0,1]^3 内 → bbox 不变。
  const vertsB = BASE_VERTS.slice();
  vertsB.push(0.5, 0.9, 0.9);

  const fpA = edgeFingerprint(vertsA, edge);
  const fpB = edgeFingerprint(vertsB, edge);
  assert(fpA === fpB,
    `expected equal fingerprints for unchanged edge; A=${fpA} B=${fpB}`);
  return `fp stable = ${fpA}`;
});

test('(1) STABILITY: changing the edge length/shape → fingerprint CHANGES', () => {
  const edge0 = straightEdge([0, 0, 0], [1, 0, 0]);        // 原长 1 直棱
  const edgeLonger = straightEdge([0, 0, 0], [0.6, 0, 0]); // 缩短：长度 0.6（形状变）
  const edgeBent = [[0, 0, 0], [0.5, 0.4, 0], [1, 0, 0]];  // 同端点但弯曲（sagitta 变 → 形状变）

  const fp0 = edgeFingerprint(BASE_VERTS, edge0);
  const fpLen = edgeFingerprint(BASE_VERTS, edgeLonger);
  const fpBent = edgeFingerprint(BASE_VERTS, edgeBent);

  assert(fp0 !== fpLen, `length change should change fp; both=${fp0}`);
  assert(fp0 !== fpBent, `shape (bend) change should change fp; both=${fp0}`);
  return `fp0=${fp0} | len→${fpLen !== fp0 ? 'changed' : 'SAME'} | bend→${fpBent !== fp0 ? 'changed' : 'SAME'}`;
});

// ================================================================== (2) MAP ROUND-TRIP
//
// 起一组【几何唔同】嘅 EdgeRecord（box 底面 4 条棱 + 一条竖棱），buildEdgeFingerprintMap，
// 然后揾「当初解析出嗰条边」嘅指纹 → 应攞返【该边原本索引】。
test('(2) MAP ROUND-TRIP: captured fingerprint resolves to its original edge index', () => {
  // 5 条几何各异嘅边（唔同位置/方向 → 唔会撞）。
  const edges = [
    { poly: straightEdge([0, 0, 0], [1, 0, 0]) }, // idx 0: 底前棱（沿 x, y=0,z=0）
    { poly: straightEdge([0, 1, 0], [1, 1, 0]) }, // idx 1: 底后棱（沿 x, y=1,z=0）
    { poly: straightEdge([0, 0, 0], [0, 1, 0]) }, // idx 2: 底左棱（沿 y, x=0,z=0）
    { poly: straightEdge([1, 0, 0], [1, 1, 0]) }, // idx 3: 底右棱（沿 y, x=1,z=0）
    { poly: straightEdge([0, 0, 0], [0, 0, 1]) }, // idx 4: 一条竖棱（沿 z）
  ];
  const map = buildEdgeFingerprintMap(BASE_VERTS, edges);

  // 该 5 条边几何唯一 → Map 应有 5 个不同 key。
  assert(map.size === edges.length,
    `expected ${edges.length} distinct fingerprints, got ${map.size}`);

  // 逐条：捕获嗰条边嘅指纹 → lookup 应攞返原索引。
  for (let i = 0; i < edges.length; i++) {
    const captured = edgeFingerprint(BASE_VERTS, edges[i].poly);
    const got = map.get(captured);
    assert(got === i, `edge ${i} round-trip: expected idx ${i}, got ${got}`);
  }
  return `${edges.length}/${edges.length} edges round-trip to original index`;
});

// ================================================================== (3) FALLBACK semantics
//
// 伪造/唔存在嘅指纹 → Map.get 返 undefined → 调用方据此退回 near-point（fallback）。
test('(3) FALLBACK: bogus/absent fingerprint is not found → lookup returns undefined', () => {
  const edges = [
    { poly: straightEdge([0, 0, 0], [1, 0, 0]) },
    { poly: straightEdge([0, 0, 0], [0, 1, 0]) },
    { poly: straightEdge([0, 0, 0], [0, 0, 1]) },
  ];
  const map = buildEdgeFingerprintMap(BASE_VERTS, edges);

  // (a) 完全捏造嘅字串：唔系真指纹格式 → 必揾唔到。
  const bogus = 'e1|l:DOES-NOT-EXIST|m:9999/9999/9999|e:bogus;bogus|d:0/0/0|s:0|O';
  assert(map.get(bogus) === undefined, `bogus fp should be absent; got ${map.get(bogus)}`);

  // (b) 一条【从未加入 Map】嘅真实边（box 顶面棱）嘅真指纹 → 亦应缺席。
  const absentEdge = straightEdge([0, 1, 1], [1, 1, 1]); // 顶后棱，唔喺 edges 入面
  const absentFp = edgeFingerprint(BASE_VERTS, absentEdge);
  assert(map.get(absentFp) === undefined,
    `absent (never-inserted) edge fp should be undefined; got ${map.get(absentFp)}`);

  // 验证：唔系因为 Map 空 —— 真存在嗰条仍揾得到（确保 undefined 系「缺席」而唔系坏 Map）。
  const present = edgeFingerprint(BASE_VERTS, edges[0].poly);
  assert(map.get(present) === 0, `sanity: present edge 0 should resolve; got ${map.get(present)}`);

  return `bogus→undefined, absent-real→undefined, present→0 (caller falls back on undefined)`;
});

// ================================================================== (4) SYMMETRIC COLLISION
//
// 正方棱柱（square prism）4 条竖棱：边长相同、方向相同（沿 z）、形状相同（直），喺绕中轴
// 旋转对称嘅 4 个角位 —— 几何全等。几何指纹做唔到「绕轴第 k 条」嘅区分（要真拓扑序先得），
// 故呢 4 条【可能撞】成同一 key。本测试断言【撞可被侦测】：≥2 条边共享同一指纹 →
// 调用方可视为歧义→退回 near-point fallback（见 edgeFingerprint.ts 文件头【诚实边界 2】）。
//
// 落地细节（务必睇清，否则会拣错夹具）：指纹嘅【归一化中点位置 m:key】系压撞主力 ——
//   中点 / 端点除以【模型 bbox 对角】再量化（POS_TOL=0.01）。
//   • 若用一个 1×1×1 box，4 条竖棱中点喺 bbox 内分处 4 个唔同角列 (0,0)/(1,0)/(0,1)/(1,1)，
//     归一化后落唔同位置格 → 反而【唔撞】（box 棱靠中点位置可分，正是文件头边界 2 第一点讲嘅）。
//   • 真正会撞嘅【对称体】= 一条【高瘦正方棱柱】（截面 1×1，高 H≫1）：bbox 对角由【高度】主导，
//     令 4 条竖棱嘅 XY 间距归一化后【缩到 POS_TOL 以下】→ 4 个中点 / 端点落【同一位置格】→
//     4 条几何全等竖棱得到【同一指纹】。呢个就系绕轴旋转对称体「指纹做唔到绕轴区分」嘅真实体现。
test('(4) SYMMETRIC COLLISION: 4 geometrically-identical square-prism verticals collide → DETECTABLE', () => {
  // 高瘦正方棱柱：截面 1×1，高 200。4 条竖棱同长(=200)、同向(+z)、同形(直)，喺旋转对称角位。
  const W = 1, H = 200;
  const corners = [[0, 0], [W, 0], [0, W], [W, W]];
  const verticalEdges = corners.map(([x, y]) => ({ poly: straightEdge([x, y, 0], [x, y, H]) }));
  // 全模型 vertices = 该棱柱 8 角（bbox 对角由 H 主导 → XY 归一化间距 < POS_TOL）。
  const verts = flatten(corners.flatMap(([x, y]) => [[x, y, 0], [x, y, H]]));

  // 逐条算指纹，统计共享次数。
  const counts = new Map();
  const fps = [];
  for (const e of verticalEdges) {
    const fp = edgeFingerprint(verts, e.poly);
    fps.push(fp);
    counts.set(fp, (counts.get(fp) ?? 0) + 1);
  }

  // 撞可侦测 (a)：存在某指纹被 ≥2 条边共享。
  let maxShare = 0;
  for (const c of counts.values()) if (c > maxShare) maxShare = c;
  assert(maxShare >= 2,
    `expected collision (>=2 edges sharing a fp), max share=${maxShare}; fps=${JSON.stringify(fps)}`);

  // 撞可侦测 (b)：去重后 key 数 < 边数 → 调用方可判「指纹非唯一→歧义→fallback」。
  const distinct = counts.size;
  assert(distinct < verticalEdges.length,
    `distinct fps (${distinct}) should be < edges (${verticalEdges.length}) → ambiguity detectable`);

  // 撞可侦测 (c)：buildEdgeFingerprintMap 上嘅可见后果 —— 撞令 Map 坍缩，
  //   map.size < edges.length；调用方亦可由此侦测歧义并退回 near-point。
  const map = buildEdgeFingerprintMap(verts, verticalEdges);
  assert(map.size < verticalEdges.length,
    `map should collapse colliding edges: size ${map.size} should be < ${verticalEdges.length}`);

  return `max share=${maxShare}, distinct=${distinct}/${verticalEdges.length}, mapSize=${map.size} → ambiguity detectable`;
});

// ------------------------------------------------------------------ 汇总
const total = passN + failN;
console.log('');
console.log(`${failN === 0 ? 'PASS' : 'FAIL'} ${passN}/${total}`);
if (failN !== 0) process.exit(1);
