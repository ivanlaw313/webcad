// meshrepair.test.mjs — 网格修复/简化纯模块 (src/io/meshRepair.ts) 验证套件
// 跑法: npx -y tsx tests/meshrepair.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
// 全部断言分析式: 盒/球解析生成, 体积用散度定理重算, 水密用焊接 id 边计数验证
import { repairMesh, simplifyMesh, qemSimplify, isotropicRemesh, wouldFlipCollapse, linkConditionOk, _internals } from '../src/io/meshRepair.ts';
import { meshManifold } from '../src/geom/meshCheck.ts';

const rows = [];
let notes = [];

function note(s) {
  notes.push(s);
  console.log(`    ${s}`);
}
function ok(cond, msg) {
  if (!cond) throw new Error(msg);
  note(msg);
}
function eq(actual, expected, msg, tol = 1e-9) {
  if (!(Math.abs(actual - expected) <= tol)) {
    throw new Error(`${msg}: 期望 ${expected}, 实际 ${actual} (tol ${tol})`);
  }
  note(`${msg}: ${actual} ≈ ${expected}`);
}
function test(name, fn) {
  console.log(`\n## ${name}`);
  notes = [];
  try {
    fn();
    rows.push({ name, pass: true, info: '' });
  } catch (e) {
    rows.push({ name, pass: false, info: String(e.message) });
    console.log(`    !! FAIL: ${e.message}`);
  }
}

// ---------------- 解析几何生成 ----------------

// 闭合盒 w×h×d, 8 顶点 12 三角形, CCW 朝外 (每面法线已逐面手验)
function makeBox(w, h, d) {
  const vertices = [0, 0, 0, w, 0, 0, w, h, 0, 0, h, 0, 0, 0, d, w, 0, d, w, h, d, 0, h, d];
  const triangles = [
    0, 2, 1, 0, 3, 2, // 底 -z (tri 0,1)
    4, 5, 6, 4, 6, 7, // 顶 +z (tri 2,3)
    0, 1, 5, 0, 5, 4, // 前 -y (tri 4,5)
    2, 3, 7, 2, 7, 6, // 后 +y (tri 6,7)
    0, 4, 7, 0, 7, 3, // 左 -x (tri 8,9)
    1, 2, 6, 1, 6, 5, // 右 +x (tri 10,11)
  ];
  return { vertices, triangles };
}

function removeTris(triangles, dropTriIdx) {
  const drop = new Set(dropTriIdx);
  const out = [];
  for (let t = 0; t < triangles.length / 3; t++) {
    if (!drop.has(t)) out.push(triangles[3 * t], triangles[3 * t + 1], triangles[3 * t + 2]);
  }
  return out;
}

// UV 球 (经纬), 单极点 + 共享环顶点 → 生成即焊接、即水密; tris = segs×(2×stacks−2), CCW 朝外
function makeSphere(r, segs, stacks) {
  const vertices = [0, 0, r];
  for (let i = 1; i < stacks; i++) {
    const phi = (Math.PI * i) / stacks, sp = Math.sin(phi), cp = Math.cos(phi);
    for (let j = 0; j < segs; j++) {
      const th = (2 * Math.PI * j) / segs;
      vertices.push(r * sp * Math.cos(th), r * sp * Math.sin(th), r * cp);
    }
  }
  vertices.push(0, 0, -r);
  const ring = (i, j) => 1 + (i - 1) * segs + (j % segs);
  const south = vertices.length / 3 - 1;
  const triangles = [];
  for (let j = 0; j < segs; j++) triangles.push(0, ring(1, j), ring(1, j + 1)); // 北极扇
  for (let i = 1; i < stacks - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j + 1), dd = ring(i + 1, j);
      triangles.push(a, dd, c, a, c, b); // 带状四边形 → 两个 CCW 外向三角形
    }
  }
  for (let j = 0; j < segs; j++) triangles.push(south, ring(stacks - 1, j + 1), ring(stacks - 1, j)); // 南极扇
  return { vertices, triangles };
}

// 散度定理体积: V = Σ v0·(v1×v2)/6 — CCW 朝外 → 正
function volumeOf(vertices, triangles) {
  let v6 = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const o0 = triangles[t] * 3, o1 = triangles[t + 1] * 3, o2 = triangles[t + 2] * 3;
    const ax = vertices[o0], ay = vertices[o0 + 1], az = vertices[o0 + 2];
    const bx = vertices[o1], by = vertices[o1 + 1], bz = vertices[o1 + 2];
    const cx = vertices[o2], cy = vertices[o2 + 1], cz = vertices[o2 + 2];
    v6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return v6 / 6;
}

// 焊接 id 上数无向边邻接三角形数 → min/max 计数 (水密 ⇔ min===max===2)
function edgeStats(vertices, triangles) {
  const { canon, nWelded } = _internals.weldVertices(vertices);
  const counts = new Map();
  let degen = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const ids = [canon[triangles[t]], canon[triangles[t + 1]], canon[triangles[t + 2]]];
    if (ids[0] === ids[1] || ids[1] === ids[2] || ids[2] === ids[0]) { degen++; continue; }
    for (let e = 0; e < 3; e++) {
      const a = ids[e], b = ids[(e + 1) % 3];
      const key = a < b ? a * nWelded + b : b * nWelded + a;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  let min = Infinity, max = 0;
  for (const c of counts.values()) { if (c < min) min = c; if (c > max) max = c; }
  return { nEdges: counts.size, min: counts.size ? min : 0, max, degen };
}

// ============ T1 闭合盒 → 修复系 no-op ============
test('T1 闭合盒 12 tris → 0 洞 0 边界边, 网格不变', () => {
  const box = makeBox(2, 3, 4);
  const r = repairMesh(box.vertices, box.triangles);
  ok(r.boundaryEdgesBefore === 0, `boundaryEdgesBefore === 0 (实际 ${r.boundaryEdgesBefore})`);
  ok(r.holesFilled === 0, `holesFilled === 0 (实际 ${r.holesFilled})`);
  ok(r.boundaryEdgesAfter === 0, `boundaryEdgesAfter === 0 (实际 ${r.boundaryEdgesAfter})`);
  ok(r.mesh.triangles.length === 36, `三角形数不变 = 12 (实际 ${r.mesh.triangles.length / 3})`);
  ok(r.mesh.vertices.length === box.vertices.length, '顶点数不变 (唔加唔减)');
  ok(r.mesh.normals.length === r.mesh.vertices.length, 'normals 长度 === vertices 长度');
  for (let i = 0; i < r.mesh.normals.length; i += 3) {
    const L = Math.hypot(r.mesh.normals[i], r.mesh.normals[i + 1], r.mesh.normals[i + 2]);
    if (Math.abs(L - 1) > 1e-9) throw new Error(`normals[${i / 3}] 唔系单位长 (${L})`);
  }
  note('normals 全部单位长');
  eq(volumeOf(r.mesh.vertices, r.mesh.triangles), 24, '体积 = 2×3×4 = 24');
  ok(r.warnings.length === 0, '无警告');
});

// ============ T2 盒去顶面 → 补 1 个洞 ============
test('T2 盒去顶面 (10 tris, 4 边界边) → 补洞复原', () => {
  const box = makeBox(2, 3, 4);
  const tris = removeTris(box.triangles, [2, 3]); // 去咗顶面 (z=4) 两个三角形
  const lp = _internals.findBoundaryLoops(box.vertices, tris);
  ok(lp.loops.length === 1 && lp.loops[0].length === 4, `findBoundaryLoops: 1 个环 4 顶点 (实际 ${lp.loops.length} 环)`);
  ok(lp.boundaryEdges === 4 && lp.openChains === 0, `4 条边界边 0 断链`);
  const r = repairMesh(box.vertices, tris);
  ok(r.boundaryEdgesBefore === 4, `boundaryEdgesBefore === 4 (实际 ${r.boundaryEdgesBefore})`);
  ok(r.holesFilled === 1, `holesFilled === 1 (实际 ${r.holesFilled})`);
  ok(r.boundaryEdgesAfter === 0, `boundaryEdgesAfter === 0 (实际 ${r.boundaryEdgesAfter})`);
  const es = edgeStats(r.mesh.vertices, r.mesh.triangles);
  ok(es.min === 2 && es.max === 2 && es.degen === 0, `水密复核: 每条边恰好 2 个三角形 (${es.nEdges} 条边)`);
  eq(volumeOf(r.mesh.vertices, r.mesh.triangles), 24, '体积复原 ≈ 24', 1e-6);
  // 补片三角形 = 第 10 个之后; 全部法线必须朝外 dot(faceN, faceC − boxC) > 0
  const C = [1, 1.5, 2];
  const V = r.mesh.vertices, T = r.mesh.triangles;
  let nFill = 0;
  for (let t = 10; t < T.length / 3; t++) {
    const o0 = T[3 * t] * 3, o1 = T[3 * t + 1] * 3, o2 = T[3 * t + 2] * 3;
    const e1 = [V[o1] - V[o0], V[o1 + 1] - V[o0 + 1], V[o1 + 2] - V[o0 + 2]];
    const e2 = [V[o2] - V[o0], V[o2 + 1] - V[o0 + 1], V[o2 + 2] - V[o0 + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const cc = [(V[o0] + V[o1] + V[o2]) / 3 - C[0], (V[o0 + 1] + V[o1 + 1] + V[o2 + 1]) / 3 - C[1], (V[o0 + 2] + V[o1 + 2] + V[o2 + 2]) / 3 - C[2]];
    const d = n[0] * cc[0] + n[1] * cc[1] + n[2] * cc[2];
    if (!(d > 0)) throw new Error(`补片三角形 ${t} 法线唔系朝外 (dot=${d})`);
    nFill++;
  }
  ok(nFill === 2, `补片 ${nFill} 个三角形全部朝外 (期望 2 个)`);
  ok(r.warnings.length === 0, '无警告');
});

// ============ T3 两个独立洞 (去顶+底) ============
test('T3 盒去顶+底两面 (8 tris) → 补 2 个洞', () => {
  const box = makeBox(2, 3, 4);
  const tris = removeTris(box.triangles, [0, 1, 2, 3]); // 去埋底面同顶面
  const r = repairMesh(box.vertices, tris);
  ok(r.boundaryEdgesBefore === 8, `boundaryEdgesBefore === 8 (实际 ${r.boundaryEdgesBefore})`);
  ok(r.holesFilled === 2, `holesFilled === 2 (实际 ${r.holesFilled})`);
  ok(r.boundaryEdgesAfter === 0, `boundaryEdgesAfter === 0 (实际 ${r.boundaryEdgesAfter})`);
  const es = edgeStats(r.mesh.vertices, r.mesh.triangles);
  ok(es.min === 2 && es.max === 2 && es.degen === 0, `水密复核: 每条边恰好 2 个三角形 (${es.nEdges} 条边)`);
  eq(volumeOf(r.mesh.vertices, r.mesh.triangles), 24, '体积复原 ≈ 24', 1e-6);
});

// ============ T4 开放平面条带 → 文档化行为: 照填 → 零体积闭合壳 ============
test('T4 平面条带 (2 tris) → 照填边界环 → 零体积闭合壳', () => {
  // 文档化行为 (诚实范围第 5 点): 平面薄片嘅边界环系一个合法闭合环, 照填,
  // 产生零体积闭合壳 — 边界边清零, 唔系实体, 但行为一致、唔特判、唔掟错。
  // 薄片对角线揀 1-3; 耳切确定性产生对角线 0-2 → 每条边恰好 2 个三角形。
  const vertices = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
  const tris = [0, 1, 3, 1, 2, 3];
  const r = repairMesh(vertices, tris);
  ok(r.boundaryEdgesBefore === 4, `boundaryEdgesBefore === 4 (实际 ${r.boundaryEdgesBefore})`);
  ok(r.holesFilled === 1, `holesFilled === 1 (实际 ${r.holesFilled})`);
  ok(r.boundaryEdgesAfter === 0, `boundaryEdgesAfter === 0 (实际 ${r.boundaryEdgesAfter})`);
  ok(r.mesh.triangles.length === 12, `输出 4 个三角形 (实际 ${r.mesh.triangles.length / 3})`);
  const es = edgeStats(r.mesh.vertices, r.mesh.triangles);
  ok(es.min === 2 && es.max === 2 && es.degen === 0, `每条边恰好 2 个三角形 — 零体积闭合壳 (${es.nEdges} 条边)`);
  eq(volumeOf(r.mesh.vertices, r.mesh.triangles), 0, '体积 = 0 (平面壳)', 1e-12);
});

// ============ T5 简化: 1920-tri UV 球 → 0.2 ============
test('T5 简化 1920-tri 球 targetRatio 0.2 → 比例/体积/水密', () => {
  const s = makeSphere(1, 40, 25); // 40×(2×25−2) = 1920 tris
  ok(s.triangles.length / 3 === 1920, `输入球 1920 tris (实际 ${s.triangles.length / 3})`);
  const es0 = edgeStats(s.vertices, s.triangles);
  ok(es0.min === 2 && es0.max === 2, '生成器自检: 输入球水密');
  const r = simplifyMesh(s.vertices, s.triangles, 0.2);
  ok(r.trisBefore === 1920, `trisBefore === 1920`);
  const target = Math.round(1920 * 0.2); // 384
  ok(r.trisAfter >= target / 2 && r.trisAfter <= target * 2,
    `trisAfter ${r.trisAfter} 喺目标 ${target} 嘅 ×2 范围内 [${target / 2}, ${target * 2}]`);
  const vol = volumeOf(r.mesh.vertices, r.mesh.triangles);
  const trueVol = (4 * Math.PI) / 3;
  ok(Math.abs(vol - trueVol) / trueVol <= 0.15,
    `体积 ${vol.toFixed(4)} 喺解析球体积 ${trueVol.toFixed(4)} ±15% 内 (偏差 ${(100 * Math.abs(vol - trueVol) / trueVol).toFixed(1)}%)`);
  const es = edgeStats(r.mesh.vertices, r.mesh.triangles);
  ok(es.min === 2 && es.max === 2 && es.degen === 0, `水密保持: 每条边恰好 2 个三角形 (${es.nEdges} 条边)`);
  ok(r.mesh.normals.length === r.mesh.vertices.length, 'normals 长度 === vertices 长度');
  note(`警告: [${r.warnings.join('; ')}]`);
});

// ============ T6 退化输入防御 ============
test('T6 空网格 → 空输出 + 警告, 唔掟错', () => {
  const r = simplifyMesh([], [], 0.2);
  ok(r.trisBefore === 0 && r.trisAfter === 0, 'trisBefore/After === 0');
  ok(r.mesh.vertices.length === 0 && r.mesh.triangles.length === 0 && r.mesh.normals.length === 0, '输出全空');
  ok(r.warnings.length >= 1, `有警告: ${r.warnings[0]}`);
  const r2 = repairMesh([], []);
  ok(r2.holesFilled === 0 && r2.boundaryEdgesBefore === 0 && r2.warnings.length >= 1,
    `repairMesh 空输入都唔掟错: ${r2.warnings[0]}`);
  // 全部顶点重合 → 简化都要斯文收场
  const r3 = simplifyMesh([1, 2, 3, 1, 2, 3, 1, 2, 3], [0, 1, 2], 0.2);
  ok(r3.trisAfter === 0 && r3.warnings.length >= 1, `顶点全重合 → 空输出 + 警告: ${r3.warnings[r3.warnings.length - 1]}`);
});

// ============ T7 性能: 50k-tri 球 ============
test('T7 性能: 49920-tri 球 修复(no-op)+简化 0.2 总 < 3s', () => {
  const s = makeSphere(1, 160, 157); // 160×(2×157−2) = 49920 tris
  ok(s.triangles.length / 3 === 49920, `49920 tris (实际 ${s.triangles.length / 3})`);
  const t0 = process.hrtime.bigint();
  const rep = repairMesh(s.vertices, s.triangles);
  const t1 = process.hrtime.bigint();
  const sim = simplifyMesh(s.vertices, s.triangles, 0.2);
  const t2 = process.hrtime.bigint();
  ok(rep.holesFilled === 0 && rep.boundaryEdgesBefore === 0, '闭合球修复系 no-op (0 洞 0 边界边)');
  ok(sim.trisAfter > 0, `简化有输出 (${sim.trisBefore} → ${sim.trisAfter} tris)`);
  const repMs = Number(t1 - t0) / 1e6, simMs = Number(t2 - t1) / 1e6;
  note(`修复 ${repMs.toFixed(0)}ms + 简化 ${simMs.toFixed(0)}ms`);
  ok(repMs + simMs < 3000, `总耗时 ${(repMs + simMs).toFixed(0)}ms < 3000ms`);
});

// ============ T8 QEM 简化: 768-tri 细分立方体 → 0.3 ============
function makeSubdivCube(n){
  const verts=[], idx=new Map(), key=(x,y,z)=>`${x},${y},${z}`
  const vid=(x,y,z)=>{const k=key(x,y,z);let i=idx.get(k);if(i===undefined){i=verts.length/3;idx.set(k,i);verts.push(x,y,z)}return i}
  const tris=[]; const S=1/n
  const quad=(p00,p10,p11,p01)=>{tris.push(p00,p10,p11, p00,p11,p01)}
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){const a=i*S,b=(i+1)*S,c=j*S,d=(j+1)*S
    quad(vid(a,c,0),vid(a,d,0),vid(b,d,0),vid(b,c,0))
    quad(vid(a,c,1),vid(b,c,1),vid(b,d,1),vid(a,d,1))
    quad(vid(a,0,c),vid(b,0,c),vid(b,0,d),vid(a,0,d))
    quad(vid(a,1,c),vid(a,1,d),vid(b,1,d),vid(b,1,c))
    quad(vid(0,a,c),vid(0,a,d),vid(0,b,d),vid(0,b,c))
    quad(vid(1,a,c),vid(1,b,c),vid(1,b,d),vid(1,a,d))}
  return {vertices:verts, triangles:tris}
}
test('T8 QEM 768-tri 细分立方体 → 0.3 减面', () => {
  const cube = makeSubdivCube(8)
  ok(cube.triangles.length/3 === 768, `输入 768 tris (实际 ${cube.triangles.length/3})`)
  const r = qemSimplify(cube.vertices, cube.triangles, 0.3)
  const tOut = r.triangles.length/3
  ok(Math.abs(tOut - 230) <= 35, `三角数 ${tOut} ≈ 230 (±35)`)
  let mn=[Infinity,Infinity,Infinity], mx=[-Infinity,-Infinity,-Infinity]
  for(let i=0;i<r.vertices.length;i+=3)for(let k=0;k<3;k++){const v=r.vertices[i+k];if(v<mn[k])mn[k]=v;if(v>mx[k])mx[k]=v}
  for(let k=0;k<3;k++){ eq(mn[k],0,`bbox min[${k}]≈0`,0.5); eq(mx[k],1,`bbox max[${k}]≈1`,0.5) }
  const vol = volumeOf(r.vertices, r.triangles)
  ok(Math.abs(vol-1) <= 0.02, `体积 ${vol.toFixed(4)} ≈ 1 (±2%)`)
  const es = edgeStats(r.vertices, r.triangles)
  ok(es.min===2 && es.max===2 && es.degen===0, `水密保持 (${es.nEdges} 条)`)
  ok(r.normals.length === r.vertices.length, 'normals 长度匹配')
})

// ---------------- T9/T10 等向重网格生成器 ----------------

// 逐面 20mm 立方体 (每面 2 三角, 复制顶点 — 似 STL), 中心喺原点 → 角点喺 (±10,±10,±10)
function makeFaceCube(s) {
  const h = s / 2;
  const verts = [], tris = [];
  const add = (p) => { const i = verts.length / 3; verts.push(p[0], p[1], p[2]); return i; };
  const quad = (a, b, c, d) => { const i0 = add(a), i1 = add(b), i2 = add(c), i3 = add(d); tris.push(i0, i1, i2, i0, i2, i3); };
  const C = [[-h, -h, -h], [h, -h, -h], [h, h, -h], [-h, h, -h], [-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h]];
  quad(C[0], C[3], C[2], C[1]); // -z
  quad(C[4], C[5], C[6], C[7]); // +z
  quad(C[0], C[1], C[5], C[4]); // -y
  quad(C[3], C[7], C[6], C[2]); // +y
  quad(C[0], C[4], C[7], C[3]); // -x
  quad(C[1], C[2], C[6], C[5]); // +x
  return { vertices: verts, triangles: tris };
}

// 闭合圆柱 (半径 r, 高 h, segs 段, 上下圆盘封顶), STL 风格逐面顶点; CCW 朝外
function makeCylinder(r, h, segs) {
  const verts = [], tris = [];
  const add = (x, y, z) => { const i = verts.length / 3; verts.push(x, y, z); return i; };
  const bot = [], top = [];
  for (let j = 0; j < segs; j++) { const th = (2 * Math.PI * j) / segs; bot.push(add(r * Math.cos(th), r * Math.sin(th), 0)); }
  for (let j = 0; j < segs; j++) { const th = (2 * Math.PI * j) / segs; top.push(add(r * Math.cos(th), r * Math.sin(th), h)); }
  for (let j = 0; j < segs; j++) { const a = bot[j], b = bot[(j + 1) % segs], c = top[(j + 1) % segs], d = top[j]; tris.push(a, b, c, a, c, d); } // 侧面
  const cb = add(0, 0, 0), ct = add(0, 0, h);
  for (let j = 0; j < segs; j++) tris.push(cb, bot[(j + 1) % segs], bot[j]); // 底盘 (朝 -z)
  for (let j = 0; j < segs; j++) tris.push(ct, top[j], top[(j + 1) % segs]); // 顶盘 (朝 +z)
  return { vertices: verts, triangles: tris };
}

// 点到三角形最近点 (Ericson) — 测试独立实现, 校验 isotropicRemesh 内部投影
function closestPtTri(p, a, b, c) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
  const d1 = ab[0] * ap[0] + ab[1] * ap[1] + ab[2] * ap[2], d2 = ac[0] * ap[0] + ac[1] * ap[1] + ac[2] * ap[2];
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = [p[0] - b[0], p[1] - b[1], p[2] - b[2]], d3 = ab[0] * bp[0] + ab[1] * bp[1] + ab[2] * bp[2], d4 = ac[0] * bp[0] + ac[1] * bp[1] + ac[2] * bp[2];
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2; if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
  const cp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], d5 = ab[0] * cp[0] + ab[1] * cp[1] + ab[2] * cp[2], d6 = ac[0] * cp[0] + ac[1] * cp[1] + ac[2] * cp[2];
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6; if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
  const va = d3 * d6 - d5 * d4; if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
// 重网格输出每个顶点到原始表面嘅最大距离 (蛮力最近三角形) — 证明形状保持 / 捉缩水
function maxVertexDevToSurface(outV, origV, origT) {
  let mx = 0;
  for (let i = 0; i < outV.length; i += 3) {
    const p = [outV[i], outV[i + 1], outV[i + 2]];
    let best = Infinity;
    for (let t = 0; t < origT.length; t += 3) {
      const a = [origV[origT[t] * 3], origV[origT[t] * 3 + 1], origV[origT[t] * 3 + 2]];
      const b = [origV[origT[t + 1] * 3], origV[origT[t + 1] * 3 + 1], origV[origT[t + 1] * 3 + 2]];
      const c = [origV[origT[t + 2] * 3], origV[origT[t + 2] * 3 + 1], origV[origT[t + 2] * 3 + 2]];
      const q = closestPtTri(p, a, b, c);
      const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2], d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    if (best > mx) mx = best;
  }
  return Math.sqrt(mx);
}

// ============ T8b 重构守卫: wouldFlipCollapse / linkConditionOk 系导出纯函数, 显式参数 ============
test('T8b 共享塌缩守卫 wouldFlipCollapse / linkConditionOk 导出 + 行为正确', () => {
  ok(typeof wouldFlipCollapse === 'function', 'wouldFlipCollapse 系导出函数');
  ok(typeof linkConditionOk === 'function', 'linkConditionOk 系导出函数');
  // 一个细四面体 (4 顶点 4 面, 闭合): 顶点 0,1,2,3
  //  坐标: 0=(0,0,0) 1=(1,0,0) 2=(0,1,0) 3=(0,0,1)
  const X = [0, 1, 0, 0], Y = [0, 0, 1, 0], Z = [0, 0, 0, 1];
  // CCW 朝外 4 面
  const tA = [0, 0, 0, 1], tB = [2, 1, 3, 2], tC = [1, 3, 2, 3];
  const nV = 4;
  const faces = Array.from({ length: nV }, () => []);
  const alive = new Uint8Array(tA.length).fill(1);
  for (let f = 0; f < tA.length; f++) { faces[tA[f]].push(f); faces[tB[f]].push(f); faces[tC[f]].push(f); }
  // 边 (0,1): 公共邻居 = {2,3}, 对面顶点 = {2,3} → 链接条件 OK
  ok(linkConditionOk(tA, tB, tC, faces, alive, 0, 1) === true, '四面体边 (0,1) 链接条件 OK (公共邻居=对面顶点)');
  // 两端无任何共享面 (空邻接) → 非合法边 → false (opp.size===0)
  const emptyFaces = Array.from({ length: nV }, () => []);
  ok(linkConditionOk(tA, tB, tC, emptyFaces, alive, 0, 1) === false, '无共享面 → 链接条件 false (非边)');
  // wouldFlipCollapse: 将边 (0,1) 塌到一个远离面嘅离谱位置 → 必有面翻向
  const flip = wouldFlipCollapse(tA, tB, tC, X, Y, Z, faces, alive, 0, 1, [10, 10, 10]);
  ok(flip === true, '塌到远点 (10,10,10) → 至少一个相邻面翻向 (wouldFlipCollapse=true)');
  // 塌到边 (0,1) 中点附近 (0.5,0,0) → 唔应翻向 (退化消失嘅面跳过)
  const noflip = wouldFlipCollapse(tA, tB, tC, X, Y, Z, faces, alive, 0, 1, [0.5, 0, 0]);
  ok(noflip === false, '塌到中点 (0.5,0,0) → 无面翻向 (wouldFlipCollapse=false)');
});

// ============ T9 等向重网格: 逐面 20mm 立方体 (平面) ============
test('T9 等向重网格 逐面 20mm 立方体 targetLen=4 → 水密/体积/均匀/角点保持', () => {
  const cube = makeFaceCube(20); // 6 面 × 2 三角 = 12 三角, 角点 (±10,±10,±10)
  ok(cube.triangles.length / 3 === 12, `输入 12 三角 (实际 ${cube.triangles.length / 3})`);
  const trisIn = cube.triangles.length / 3;
  const r = isotropicRemesh(cube.vertices, cube.triangles, 4, 5);
  note(`体积 ${volumeOf(r.vertices, r.triangles).toFixed(2)} | trisOut ${r.trisOut} | edgeLenMean ${r.edgeLenMean.toFixed(3)} std ${r.edgeLenStd.toFixed(3)} (std/mean ${(r.edgeLenStd / r.edgeLenMean).toFixed(3)})`);
  // 水密: 每条边恰好 2 三角, 0 边界 (edgeStats + meshManifold 双重)
  const es = edgeStats(r.vertices, r.triangles);
  ok(es.min === 2 && es.max === 2 && es.degen === 0, `水密: 每条边恰好 2 三角 (${es.nEdges} 条边)`);
  const mm = meshManifold(r.vertices, r.triangles);
  ok(mm.closed && mm.boundary === 0 && mm.nonManifold === 0, `meshManifold: closed, 0 boundary, 0 nonManifold`);
  // 体积 ≈ 8000 ±1.5%
  const vol = volumeOf(r.vertices, r.triangles);
  ok(Math.abs(vol - 8000) / 8000 <= 0.015, `体积 ${vol.toFixed(2)} ≈ 8000 ±1.5% (偏差 ${(100 * Math.abs(vol - 8000) / 8000).toFixed(2)}%)`);
  // 均匀: edgeLenStd/edgeLenMean < 0.4
  ok(r.edgeLenStd / r.edgeLenMean < 0.4, `edgeLenStd/edgeLenMean = ${(r.edgeLenStd / r.edgeLenMean).toFixed(3)} < 0.4`);
  // split 有开火: trisOut 显著 > 输入
  ok(r.trisOut > trisIn * 3, `trisOut ${r.trisOut} 显著 > 输入 ${trisIn} (split 开火)`);
  // 8 个角点仍喺 (±10,±10,±10) → bbox 保持 ±0.5 (pinned 角点)
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < r.vertices.length; i += 3) for (let k = 0; k < 3; k++) { const v = r.vertices[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
  for (let k = 0; k < 3; k++) { eq(mn[k], -10, `bbox min[${k}] ≈ -10 (角点保持)`, 0.5); eq(mx[k], 10, `bbox max[${k}] ≈ 10 (角点保持)`, 0.5); }
  // 8 个角点真係仲喺度 (每个 (±10,±10,±10) 都有顶点)
  let nCorner = 0;
  for (const sx of [-10, 10]) for (const sy of [-10, 10]) for (const sz of [-10, 10]) {
    for (let i = 0; i < r.vertices.length; i += 3) {
      if (Math.abs(r.vertices[i] - sx) < 0.5 && Math.abs(r.vertices[i + 1] - sy) < 0.5 && Math.abs(r.vertices[i + 2] - sz) < 0.5) { nCorner++; break; }
    }
  }
  ok(nCorner === 8, `8 个角点全部保留 (实际 ${nCorner})`);
  ok(r.normals.length === r.vertices.length, 'normals 长度 === vertices 长度');
});

// ============ T10 等向重网格: 闭合圆柱 (曲面) — 形状保持 / 捉缩水 ============
test('T10 等向重网格 闭合圆柱 r=10 h=20 targetLen≈3 → 体积 + 表面偏差 (证明重投影)', () => {
  const cyl = makeCylinder(10, 20, 48); // 闭合圆柱
  const es0 = edgeStats(cyl.vertices, cyl.triangles);
  ok(es0.min === 2 && es0.max === 2, '生成器自检: 输入圆柱水密');
  const r = isotropicRemesh(cyl.vertices, cyl.triangles, 3, 5);
  const vol = volumeOf(r.vertices, r.triangles);
  const maxDev = maxVertexDevToSurface(r.vertices, cyl.vertices, cyl.triangles);
  // 解析圆柱体积 π r² h = π·100·20
  const trueVol = Math.PI * 100 * 20;
  note(`体积 ${vol.toFixed(2)} (解析 ${trueVol.toFixed(2)}) | 最大表面偏差 ${maxDev.toFixed(4)}mm | trisOut ${r.trisOut} | std/mean ${(r.edgeLenStd / r.edgeLenMean).toFixed(3)}`);
  // 水密保持
  const es = edgeStats(r.vertices, r.triangles);
  ok(es.min === 2 && es.max === 2 && es.degen === 0, `水密保持: 每条边恰好 2 三角 (${es.nEdges} 条边)`);
  const mm = meshManifold(r.vertices, r.triangles);
  ok(mm.closed, 'meshManifold: closed');
  // 体积容差: 已实现重投影 (reprojection) → 紧容差 ±5% (实测 ~2.4%)。
  // 若无重投影, 曲面会向轴缩, 偏差会 >10% — 呢条断言就系捉缩水嘅守卫。
  ok(Math.abs(vol - trueVol) / trueVol <= 0.05,
    `体积 ${vol.toFixed(2)} 喺解析圆柱体积 ${trueVol.toFixed(2)} ±5% 内 (偏差 ${(100 * Math.abs(vol - trueVol) / trueVol).toFixed(2)}%)`);
  // 最大顶点到原始表面偏差: 重投影令每个顶点贴返原始表面。阈值 1.5mm —
  // 离散尺度 (targetLen=3) 嘅一半左右, 远细过无重投影时嘅数 mm 缩水。
  ok(maxDev < 1.5, `最大表面偏差 ${maxDev.toFixed(4)}mm < 1.5mm (重投影令顶点贴原始表面 → 形状保持)`);
});

// ============ 总表 ============
console.log('\n========== PASS/FAIL 总表 ==========');
let nFail = 0;
for (const r of rows) {
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : ' — ' + r.info}`);
  if (!r.pass) nFail++;
}
console.log(`====================================`);
console.log(nFail === 0 ? `全部 ${rows.length} 组通过` : `${nFail}/${rows.length} 组失败`);
process.exit(nFail === 0 ? 0 : 1);
