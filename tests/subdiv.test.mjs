// subdiv.test.mjs — Catmull-Clark 细分纯数学模块 (src/cad/subdiv.ts) 验证套件
// 跑法: npx -y tsx tests/subdiv.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
import { makeBoxCage, ccSubdivide, quadsToTris } from '../src/cad/subdiv.ts';

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

// ── 几何 helpers (全部独立实现, 唔依赖模块内部) ──────────────────────────────

// 散度定理体积: V = (1/6)·Σ v0·(v1×v2) — 先累加三重积、最后先除 6。
// 整数坐标场合每个三重积都系精确整数 (≪2^53), 累加同除 6 都精确 → 可以严格 ===。
function trip(ax, ay, az, bx, by, bz, cx, cy, cz) {
  return ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
}
function triVolume(tri) {
  const P = tri.vertices, T = tri.triangles;
  let six = 0;
  for (let t = 0; t < T.length; t += 3) {
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
    six += trip(P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]);
  }
  return six / 6;
}
// quad 网格直接算体积 (同 quadsToTris 一样沿短对角线切 — 独立重写, 验三角化索引无错)
function quadVolume(m) {
  let six = 0;
  for (const [a, b, c, d] of m.quads) {
    const A = m.verts[a], B = m.verts[b], C = m.verts[c], D = m.verts[d];
    const dAC = (A[0] - C[0]) ** 2 + (A[1] - C[1]) ** 2 + (A[2] - C[2]) ** 2;
    const dBD = (B[0] - D[0]) ** 2 + (B[1] - D[1]) ** 2 + (B[2] - D[2]) ** 2;
    if (dAC <= dBD) {
      six += trip(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2])
           + trip(A[0], A[1], A[2], C[0], C[1], C[2], D[0], D[1], D[2]);
    } else {
      six += trip(B[0], B[1], B[2], C[0], C[1], C[2], D[0], D[1], D[2])
           + trip(B[0], B[1], B[2], D[0], D[1], D[2], A[0], A[1], A[2]);
    }
  }
  return six / 6;
}
// 边 → 邻面数 (流形检查): key = min·nV + max
function edgeCounts(m) {
  const nV = m.verts.length;
  const map = new Map();
  for (const q of m.quads) {
    for (let s = 0; s < 4; s++) {
      const a = q[s], b = q[(s + 1) % 4];
      const key = Math.min(a, b) * nV + Math.max(a, b);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return map;
}
function checkManifold(m, label) {
  const ec = edgeCounts(m);
  let bad = 0;
  for (const n of ec.values()) if (n !== 2) bad++;
  ok(bad === 0, `${label}: 每条边恰好 2 quad (共 ${ec.size} 条边)`);
  return ec.size;
}
function centroid(verts) {
  let x = 0, y = 0, z = 0;
  for (const p of verts) { x += p[0]; y += p[1]; z += p[2]; }
  const n = verts.length;
  return [x / n, y / n, z / n];
}
function bboxOf(verts) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of verts) {
    for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
  }
  return { lo, hi };
}
// 顶点集合相同 (容差逐点最近邻, O(n²) — 测试规模细, 够快); 排序比对会俾浮点 tie 搞乱, 唔用
function sameVertexSet(A, B, tol) {
  if (A.length !== B.length) return { ok: false, why: `数量唔同 ${A.length} vs ${B.length}` };
  const used = new Array(B.length).fill(false);
  for (const p of A) {
    let found = -1;
    for (let i = 0; i < B.length; i++) {
      if (used[i]) continue;
      const q = B[i];
      if (Math.abs(p[0] - q[0]) <= tol && Math.abs(p[1] - q[1]) <= tol && Math.abs(p[2] - q[2]) <= tol) {
        found = i; break;
      }
    }
    if (found < 0) return { ok: false, why: `搵唔到匹配点 (${p.map((x) => x.toFixed(6))})` };
    used[found] = true;
  }
  return { ok: true, why: '' };
}

// ============ T1 盒 cage 拓扑: quads/verts 公式 + 流形 + 体积精确 ============
test('T1 盒 cage 拓扑 (40×30×20, 2×2×2)', () => {
  const m = makeBoxCage(40, 30, 20, 2, 2, 2);
  ok(m.quads.length === 2 * (2 * 2 + 2 * 2 + 2 * 2), `quads = 2(nx·ny+ny·nz+nx·nz) = 24 (实际 ${m.quads.length})`);
  // 表面格点 = 全格点 (nx+1)(ny+1)(nz+1) − 内部格点 (nx−1)(ny−1)(nz−1) = 3·3·3 − 1·1·1 = 27−1 = 26
  ok(m.verts.length === 27 - 1, `verts = 27 − 1 = 26 (实际 ${m.verts.length})`);
  const nE = checkManifold(m, 'cage');
  ok(m.verts.length - nE + m.quads.length === 2, `Euler V−E+F = 26−${nE}+24 = 2 (闭合亏格0)`);
  const vol = triVolume(quadsToTris(m));
  // 坐标全系细整数 (x∈{−20,0,20}, y∈{−15,0,15}, z∈{0,10,20}) → 三重积全程精确 → 严格相等
  ok(vol === 24000, `散度定理体积 === 40×30×20 = 24000 精确 (实际 ${vol})`);
  // 非整数格距 cage 都要啱: 5×4×3 (3×2×1 分段) → quads 2(6+2+3)=22, verts 4·3·2−2·1·0=24
  const m2 = makeBoxCage(5, 4, 3, 3, 2, 1);
  ok(m2.quads.length === 22 && m2.verts.length === 24, `cage(5,4,3, 3,2,1): 22 quads / 24 verts`);
  checkManifold(m2, 'cage(5,4,3)');
  eq(triVolume(quadsToTris(m2)), 60, '体积 = 5×4×3 = 60', 1e-9);
});

// ============ T2 绕向一致: 正体积 + 法线向外 ============
test('T2 绕向一致 (正体积 + 法线向外)', () => {
  const m = makeBoxCage(40, 30, 20, 2, 2, 2);
  const tri = quadsToTris(m);
  const vol = triVolume(tri);
  ok(vol > 0, `体积符号为正 (${vol}) — 绕向统一向外`);
  const c = centroid(m.verts);
  let minDot = Infinity;
  for (let v = 0; v < m.verts.length; v++) {
    const dx = m.verts[v][0] - c[0], dy = m.verts[v][1] - c[1], dz = m.verts[v][2] - c[2];
    const d = tri.normals[v * 3] * dx + tri.normals[v * 3 + 1] * dy + tri.normals[v * 3 + 2] * dz;
    if (d < minDot) minDot = d;
  }
  ok(minDot > 0, `全部 ${m.verts.length} 个顶点 normal·(vert−centroid) > 0 (最小 ${minDot.toFixed(4)})`);
});

// ============ T3 CC 不变量: 单位盒 6→24 + watertight + 质心 + bbox ============
test('T3 CC 不变量 (单位盒 1 级)', () => {
  const c0 = makeBoxCage(1, 1, 1, 1, 1, 1);
  ok(c0.quads.length === 6 && c0.verts.length === 8, 'cage: 6 quads / 8 verts');
  const s = ccSubdivide(c0, 1);
  ok(s.quads.length === 24, `CC 1 级 quads 6→24 (实际 ${s.quads.length})`);
  ok(s.verts.length === 8 + 6 + 12, `verts = 旧顶点8 + 面点6 + 边点12 = 26 (实际 ${s.verts.length})`);
  checkManifold(s, 'CC1 watertight 保持');
  const g0 = centroid(c0.verts), g1 = centroid(s.verts);
  eq(g1[0], g0[0], '质心 x 不变', 1e-9);
  eq(g1[1], g0[1], '质心 y 不变', 1e-9);
  eq(g1[2], g0[2], '质心 z 不变', 1e-9);
  // 凸输入: CC 全部新顶点都系旧顶点嘅凸组合 (系数非负、和=1) → 必然喺原 bbox 内
  const bb = bboxOf(c0.verts);
  let inside = true;
  for (const p of s.verts) {
    for (let k = 0; k < 3; k++) {
      if (p[k] < bb.lo[k] - 1e-12 || p[k] > bb.hi[k] + 1e-12) inside = false;
    }
  }
  ok(inside, '全部 26 个新顶点喺原 bbox 内 (平均性质)');
});

// ============ T4 CC 收敛 (Cauchy): 体积单调递减 + 2级vs3级 <2% ============
test('T4 CC 收敛 (盒 2×2×2 cage)', () => {
  const cage = makeBoxCage(40, 30, 20, 2, 2, 2);
  const v0 = triVolume(quadsToTris(cage));
  const s1 = ccSubdivide(cage, 1);
  const s2 = ccSubdivide(s1, 1);
  const s3 = ccSubdivide(s2, 1);
  const v1 = triVolume(quadsToTris(s1));
  const v2 = triVolume(quadsToTris(s2));
  const v3 = triVolume(quadsToTris(s3));
  // 逐层 ccSubdivide(·,1) 同一次过 levels=3 系同一条计算路径 → 体积 bitwise 相同
  ok(triVolume(quadsToTris(ccSubdivide(cage, 3))) === v3, '逐层细分 === levels=3 一次过 (体积严格相等)');
  note(`V0=${v0} → V1=${v1.toFixed(2)} → V2=${v2.toFixed(2)} → V3=${v3.toFixed(2)}`);
  ok(v0 > v1 && v1 > v2 && v2 > v3 && v3 > 0, '体积单调递减且 > 0');
  ok(v3 > 0.4 * v0, `V3 ${v3.toFixed(1)} > 0.4·V0 = ${(0.4 * v0).toFixed(0)}`);
  const diffPct = (Math.abs(v2 - v3) / v2) * 100;
  ok(diffPct < 2, `|V2−V3|/V2 = ${diffPct.toFixed(4)}% < 2% (Cauchy 收敛)`);
});

// ============ T5 对称保持: mirror 顶点集合相同 ============
test('T5 对称保持 (mirror x→−x / y→−y)', () => {
  const s = ccSubdivide(makeBoxCage(40, 30, 20, 2, 2, 2), 2);
  note(`CC 2 级: ${s.verts.length} verts / ${s.quads.length} quads`);
  const mx = s.verts.map(([x, y, z]) => [-x, y, z]);
  const rx = sameVertexSet(mx, s.verts, 1e-9);
  ok(rx.ok, `x→−x 镜像顶点集合相同 (容差 1e-9, 逐点最近邻)${rx.ok ? '' : ' — ' + rx.why}`);
  const my = s.verts.map(([x, y, z]) => [x, -y, z]);
  const ry = sameVertexSet(my, s.verts, 1e-9);
  ok(ry.ok, `y→−y 镜像顶点集合相同 (容差 1e-9)${ry.ok ? '' : ' — ' + ry.why}`);
});

// ============ T6 quadsToTris: 2×quads + 体积一致 + 单位法线 ============
test('T6 quadsToTris (cage + CC2 非平面 quad)', () => {
  const cage = makeBoxCage(40, 30, 20, 2, 2, 2);
  const cases = [['cage', cage], ['CC2', ccSubdivide(cage, 2)]];
  for (const [label, m] of cases) {
    const tri = quadsToTris(m);
    ok(tri.triangles.length === m.quads.length * 6,
      `${label}: tris = 2×quads = ${m.quads.length * 2} (索引数 ${tri.triangles.length})`);
    ok(tri.vertices.length === m.verts.length * 3 && tri.normals.length === m.verts.length * 3,
      `${label}: vertices/normals 长度 = 3×${m.verts.length}`);
    const vq = quadVolume(m), vt = triVolume(tri);
    eq(vt, vq, `${label}: 散度体积 tri vs quad 一致`, Math.abs(vq) * 1e-12);
    let worst = 0;
    for (let v = 0; v < m.verts.length; v++) {
      const l = Math.hypot(tri.normals[v * 3], tri.normals[v * 3 + 1], tri.normals[v * 3 + 2]);
      const dev = Math.abs(l - 1);
      if (dev > worst) worst = dev;
    }
    ok(worst <= 1e-6, `${label}: 法线全部单位长 ±1e-6 (最大偏差 ${worst.toExponential(2)})`);
  }
});

// ============ T7 性能: 6×6×6 cage (216 quads) CC3 + 三角化 <1000ms ============
test('T7 性能 (216 quads → CC3 → 13824 quads)', () => {
  const cage = makeBoxCage(60, 50, 40, 6, 6, 6);
  ok(cage.quads.length === 216, `cage = 2(36+36+36) = 216 quads (实际 ${cage.quads.length})`);
  const t0 = process.hrtime.bigint();
  const s = ccSubdivide(cage, 3);
  const tri = quadsToTris(s);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(s.quads.length === 216 * 64, `CC 3 级 quads = 216×4³ = 13824 (实际 ${s.quads.length})`);
  ok(tri.triangles.length === 13824 * 6, `tris = 27648 (索引数 ${tri.triangles.length})`);
  ok(ms < 1000, `CC3 + quadsToTris 实测 ${ms.toFixed(1)}ms < 1000ms`);
  checkManifold(s, 'CC3 大网格 watertight');   // 计时之外顺手验流形
});

// ============ T8 流形守卫: 开口=S192 边界细分支持 / 非流形=throw 中文错误 ============
// S192 起 ccSubdivide 支持【开放/边界】quad 网格（边界边当无限锐折痕，subdiv.ts:402）—— 开口网格唔再 throw，
// 会正常细分（边界边保留为锐边界）。只有【非流形】(同一条边 ≥3 面) 先 throw。本测试已按 S192 行为更新。
test('T8 流形守卫 (开口 5 面盒 = 边界细分支持 / 3 面共边 = throw)', () => {
  // 手砌 5 面盒 (无顶面) — 顶圈 4 条边各得 1 个 quad → 开边界
  const verts = [
    [-0.5, -0.5, 0], [0.5, -0.5, 0], [0.5, 0.5, 0], [-0.5, 0.5, 0],
    [-0.5, -0.5, 1], [0.5, -0.5, 1], [0.5, 0.5, 1], [-0.5, 0.5, 1],
  ];
  const open = {
    verts,
    quads: [
      [0, 3, 2, 1],               // 底
      [0, 1, 5, 4], [1, 2, 6, 5], // 4 个侧面
      [2, 3, 7, 6], [3, 0, 4, 7],
    ],
  };
  // S192：开口/边界 quad 网格【现支持】(边界边当无限锐折痕) — 唔再 throw，正常细分
  let sub = null, openErr = '';
  try { sub = ccSubdivide(open, 1); } catch (e) { openErr = String(e.message); }
  ok(openErr === '', `开口网格唔应 throw（S192 边界支持）：实际 throw "${openErr}"`);
  ok(!!sub && sub.quads.length === 20, `开口 5 面盒 CC1 quads = 5×4 = 20（实际 ${sub ? sub.quads.length : '(threw)'}）`);
  // 非流形 (重复一块面 → 嗰 4 条边各 3 面) 一样要 throw 闭合流形错误
  const cube = makeBoxCage(1, 1, 1, 1, 1, 1);
  const dup = { verts: cube.verts, quads: [...cube.quads, cube.quads[0]] };
  let msg2 = '';
  try { ccSubdivide(dup, 1); } catch (e) { msg2 = String(e.message); }
  ok(msg2.includes('闭合流形'), `3 面共边 (非流形) throw 中文错误: "${msg2}"`);
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
