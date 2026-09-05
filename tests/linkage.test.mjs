// linkage.test.mjs — 闭环平面连杆求解器 (src/assembly/linkage.ts) 验证套件
// 跑法: npx -y tsx tests/linkage.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// oracle 全部嚟自 kinematics.ts 现成解析解 (solve4Bar / solveSliderCrank)；失败 → exit 1
import { findLoops, loopPlane, solveLoop } from '../src/assembly/linkage.ts';
import { solve4Bar, solveSliderCrank, sliderCrankReachability, _fourbar } from '../src/assembly/kinematics.ts';

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

// ── 构造工具 ─────────────────────────────────────────────────────────────────
// 2D(solve4Bar 坐标) → 3D 嵌入: (x,y) ↦ x·U + y·V, U=(0,0,1), V=(1,0,0) ⇒ U×V=(0,1,0)=关节轴
// → 关节角喺 2D 帧入面就系标准 CCW（同 solve4Bar 嘅 θ 同号），唔使任何符号修正
const AX = [0, 1, 0];
const E = (x, y) => [y, 0, x];
const rev = (id, parent, child, p2, extra = {}) =>
  ({ id, name: id, type: 'revolute', parent, child, anchor: E(p2[0], p2[1]), axis: AX, angle: 0, slide: 0, ...extra });
// slider: 2D 方向 (dx,dy) ↦ 3D 轴 (dy,0,dx)（面内，|axis·n̂|=0）
const sli = (id, parent, child, d2, extra = {}) =>
  ({ id, name: id, type: 'slider', parent, child, anchor: [0, 0, 0], axis: [d2[1], 0, d2[0]], angle: 0, slide: 0, ...extra });

const rad = (d) => (d * Math.PI) / 180;
const rotAbout = (c, th, p) => {
  const cs = Math.cos(th), sn = Math.sin(th), x = p[0] - c[0], y = p[1] - c[1];
  return [c[0] + cs * x - sn * y, c[1] + sn * x + cs * y];
};
const dd = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
// 模拟 store 写返语义：solveLoop 返嘅 Map 全部 entry（驱动+未知数+剪开）原样写落 joints
const applyMap = (joints, map) => {
  for (const [id, v] of map) {
    const j = joints.find((q) => q.id === id);
    if (!j) throw new Error(`map 含未知关节 ${id}`);
    if (v.angle !== undefined) j.angle = v.angle;
    if (v.slide !== undefined) j.slide = v.slide;
  }
};

// store makeFourBar 默认静止几何（Grashof 曲柄摇杆: 曲柄20 连杆≈50.99 摇杆≈31.62 机架60）
const FB = { A: [-30, 0], D: [30, 0], B0: [-30, 20], C0: [20, 30] };
const mkFourBar = () => ({
  comps: ['GND', 'L1', 'L2', 'L3'],
  joints: [
    rev('J1', 'GND', 'L1', FB.A),   // 驱动曲柄
    rev('J2', 'L1', 'L2', FB.B0),
    rev('J3', 'L2', 'L3', FB.C0),
    rev('J4', 'L3', 'GND', FB.D),   // 闭合关节 (L3→GND)
  ],
});
// 滑块曲柄: r=20 曲柄 + L=60 连杆 + 沿 x 滑动嘅活塞（滑线 y=e）；静止 θ=0 闭合
const mkSC = (e) => {
  const C0x = 20 + Math.sqrt(60 * 60 - e * e);
  return {
    comps: ['GND', 'CRK', 'ROD', 'PST'],
    joints: [
      rev('G1', 'GND', 'CRK', [0, 0]),
      rev('G2', 'CRK', 'ROD', [20, 0]),
      rev('G3', 'ROD', 'PST', [C0x, e]),
      sli('G4', 'GND', 'PST', [1, 0]),
    ],
    C0x,
  };
};

// ============ T1 findLoops 拓扑 + loopPlane 诚实范围 ============
test('T1 findLoops 拓扑 / loopPlane', () => {
  // 齿轮对树（GND→C1, GND→C2）→ 0 环
  const tree = findLoops(['GND', 'C1', 'C2'], [rev('A1', 'GND', 'C1', [0, 0]), rev('A2', 'GND', 'C2', [40, 0])]);
  ok(tree.length === 0, `齿轮对树 → 0 环 (实际 ${tree.length})`);
  // 四连杆 → 1 环 4 关节
  const fb = mkFourBar();
  const loops = findLoops(fb.comps, fb.joints);
  ok(loops.length === 1, `四连杆 → 1 环 (实际 ${loops.length})`);
  ok(loops[0].joints.length === 4 && loops[0].bodies.length === 4, `环 4 关节 4 body (实际 ${loops[0].joints.length}/${loops[0].bodies.length})`);
  ok(loops[0].joints.some((j) => j.id === loops[0].cut), `cut=${loops[0].cut} 系环成员`);
  ok(fb.joints.find((j) => j.id === loops[0].cut).type === 'revolute', 'cut 系 revolute');
  for (let i = 0; i < 4; i++) {
    const j = loops[0].joints[i], b1 = loops[0].bodies[i], b2 = loops[0].bodies[(i + 1) % 4];
    ok((j.parent === b1 && j.child === b2) || (j.parent === b2 && j.child === b1), `环序: joints[${i}]=${j.id} 连 ${b1}—${b2}`);
  }
  // Stephenson 六杆图 → 2 基本环 (E−V+1 = 7−6+1)
  const sixJ = [
    rev('J1', 'GND', 'L1', [-30, 0]), rev('J2', 'L1', 'L2', [-30, 20]), rev('J3', 'L2', 'L3', [20, 30]),
    rev('J4', 'L3', 'GND', [30, 0]), rev('J5', 'L2', 'L4', [-5, 45]), rev('J6', 'L4', 'L5', [20, 50]),
    rev('J7', 'L5', 'GND', [14, -55]),
  ];
  const six = findLoops(['GND', 'L1', 'L2', 'L3', 'L4', 'L5'], sixJ);
  ok(six.length === 2, `六杆 → 2 基本环 (实际 ${six.length})`);
  const sizes = six.map((L) => L.joints.length).sort((a, b) => a - b);
  ok(sizes[0] === 4 && sizes[1] === 5, `环大小 4+5 (实际 ${sizes.join('+')})`);
  six.forEach((L, i) => ok(L.cut !== '' && L.joints.some((j) => j.id === L.cut) && L.joints.length === L.bodies.length,
    `环${i}: cut=${L.cut} 有效, 关节数=body数=${L.joints.length}`));
  // loopPlane: 平面环 → 右手正交基
  const pl = loopPlane(loops[0]);
  ok(pl !== null, 'loopPlane 平面环非 null');
  ok(Math.abs(Math.abs(pl.n[1]) - 1) < 1e-12, `n̂ ≈ ±Y (${pl.n.join(',')})`);
  ok(Math.abs(pl.u[0] * pl.v[0] + pl.u[1] * pl.v[1] + pl.u[2] * pl.v[2]) < 1e-12, 'u ⊥ v');
  // 诚实范围: 轴唔平行 / ball 关节 → loopPlane null 且 solveLoop null
  const tilt = mkFourBar();
  tilt.joints[2] = { ...tilt.joints[2], axis: [1, 0, 0] };
  ok(loopPlane(findLoops(tilt.comps, tilt.joints)[0]) === null, '轴唔平行 → loopPlane null');
  ok(solveLoop(tilt.joints, tilt.comps, 'J1', { angle: 10 }) === null, '非平面环 solveLoop → null');
  const ball = mkFourBar();
  ball.joints[2] = { ...ball.joints[2], type: 'ball' };
  ok(loopPlane(findLoops(ball.comps, ball.joints)[0]) === null, 'ball 入环 → loopPlane null');
  ok(solveLoop(ball.joints, ball.comps, 'J1', { angle: 10 }) === null, 'ball 环 solveLoop → null');
});

// ============ T2 四连杆 vs solve4Bar oracle (曲柄 0→360° 每 1°) ============
test('T2 四连杆扫描 vs solve4Bar (361 步)', () => {
  const { comps, joints } = mkFourBar();
  let maxErr = 0, maxJump = 0, maxTree = 0;
  let prev = null;
  for (let th = 0; th <= 360; th++) {
    const map = solveLoop(joints, comps, 'J1', { angle: th });
    if (!map) throw new Error(`θ=${th}° solveLoop 返 null`);
    for (const id of ['J1', 'J2', 'J3', 'J4']) if (!map.has(id)) throw new Error(`θ=${th}° map 冇 ${id}`);
    applyMap(joints, map);
    // 用解出嘅关节值沿生成树 (J1,J2) 自己做 2D FK 重建 B/C
    const a1 = rad(joints[0].angle), a2 = rad(joints[1].angle), a4 = rad(joints[3].angle);
    const B = rotAbout(FB.A, a1, FB.B0);
    const C = rotAbout(FB.A, a1, rotAbout(FB.B0, a2, FB.C0));
    // oracle: 两支解取 min（本机构 Grashof 严格 s+l<p+q，分支永不相交 → 实际应恒贴 branch −1）
    let best = Infinity;
    for (const br of [1, -1]) {
      const s = solve4Bar(FB, th, br);
      if (!s.ok) continue;
      best = Math.min(best, Math.max(dd(B, s.B), dd(C, s.C)));
    }
    maxErr = Math.max(maxErr, best);
    // 剪开关节值写返 → 任何生成树 FK 一致：经 J4 摇杆侧反推 C（M_GND = M_L3·A_J4 = I ⇒ M_L3 = Rot(D,−a4)）
    maxTree = Math.max(maxTree, dd(C, rotAbout(FB.D, -a4, FB.C0)));
    if (prev) for (let k = 0; k < 4; k++) maxJump = Math.max(maxJump, Math.abs(joints[k].angle - prev[k]));
    prev = joints.map((j) => j.angle);
  }
  ok(maxErr <= 1e-6, `min-branch 最大位置误差 ${maxErr.toExponential(2)} ≤ 1e-6`);
  ok(maxTree <= 1e-6, `两生成树 C 点最大分歧 ${maxTree.toExponential(2)} ≤ 1e-6 (环一致性)`);
  ok(maxJump <= 10, `1° 步间最大关节值跳变 ${maxJump.toFixed(3)}° ≤ 10° (连续, 无跳支)`);
});

// ============ T3 滑块曲柄 vs solveSliderCrank ============
test('T3 滑块曲柄 vs solveSliderCrank', () => {
  for (const [e, maxTh, lbl] of [[0, 360, 'e=0 全转'], [10, 180, 'e=10 偏置半程']]) {
    const { comps, joints, C0x } = mkSC(e);
    let maxErr = 0;
    for (let th = 0; th <= maxTh; th++) {
      const map = solveLoop(joints, comps, 'G1', { angle: th });
      if (!map) throw new Error(`${lbl} θ=${th}° null`);
      applyMap(joints, map);
      const o = solveSliderCrank({ r: 20, L: 60, e, theta: th });
      if (!o.ok) throw new Error(`${lbl} θ=${th}° oracle 不闭合 (参数应恒可达)`);
      maxErr = Math.max(maxErr, Math.abs(joints[3].slide - (o.C[0] - C0x)));
    }
    ok(maxErr <= 1e-6, `${lbl}: slide 对闭式解最大误差 ${maxErr.toExponential(2)} ≤ 1e-6`);
  }
});

// ============ T4 Grashof 锁死 → null 唔 throw ============
test('T4 非全转四杆驱入不可达 → null', () => {
  // 机架 50 曲柄 40 连杆 20 摇杆 30：|B−D| ∈ [10,90] 但闭合要求 ∈ [10,50] → 曲柄唔可以全转。
  // 静止位曲柄抬 30°（|B−D|≈25.2 可闭合）；驱到相对 +150°（绝对 180°, |B−D|=90）必锁死。
  const A = [-25, 0], D = [25, 0], al = rad(30);
  const B0 = [A[0] + 40 * Math.cos(al), A[1] + 40 * Math.sin(al)];
  const C0 = _fourbar.circleCircle(B0, 20, D, 30, 1);
  ok(C0 !== null, `静止位可闭合 C0=(${C0[0].toFixed(2)},${C0[1].toFixed(2)})`);
  const comps = ['GND', 'L1', 'L2', 'L3'];
  const mk = () => [rev('J1', 'GND', 'L1', A), rev('J2', 'L1', 'L2', B0), rev('J3', 'L2', 'L3', C0), rev('J4', 'L3', 'GND', D)];
  const j1 = mk();
  ok(solveLoop(j1, comps, 'J1', { angle: 20 }) !== null, '可达驱动 θ=+20° 解到 (健全性)');
  const j2 = mk();
  let res = null, threw = false;
  try { res = solveLoop(j2, comps, 'J1', { angle: 150 }); } catch { threw = true; }
  ok(!threw, '不可达驱动唔 throw');
  ok(res === null, '不可达 (锁死) → null');
  ok(j2.every((j) => j.angle === 0 && j.slide === 0), '输入 joints 无被改动 (纯函数)');
});

// ============ T5 限位违反 → null (绝不夹帽) ============
test('T5 关节限位违反 → null', () => {
  const base = mkFourBar();
  const map = solveLoop(base.joints, base.comps, 'J1', { angle: 90 });
  ok(map !== null, '无限位 θ=90° 解到');
  let tested = 0;
  for (const id of ['J2', 'J3', 'J4']) {
    const val = map.get(id).angle;
    if (Math.abs(val) < 1.5) { note(`${id} 解角 ${val.toFixed(2)}° 太细, 跳过`); continue; }
    const t = mkFourBar();
    const j = t.joints.find((q) => q.id === id);
    if (val > 0) j.aMax = val - 1; else j.aMin = val + 1; // 限位窗刻意排除解值 (但容纳静止位 0)
    ok(solveLoop(t.joints, t.comps, 'J1', { angle: 90 }) === null, `${id} 解角 ${val.toFixed(2)}° 超限 → null`);
    tested++;
  }
  ok(tested >= 2, `至少 2 个关节实测限位拒绝 (实际 ${tested})`);
  // 宽限位 → 照解 (限位检查唔系误杀)
  const wide = mkFourBar();
  wide.joints.forEach((j) => { j.aMin = -1000; j.aMax = 1000; });
  ok(solveLoop(wide.joints, wide.comps, 'J1', { angle: 90 }) !== null, '宽限位 ±1000° → 照解');
});

// ============ T6 性能: 360 步四连杆扫描 ============
test('T6 性能 <5ms/步 且 <1.8s 总', () => {
  const { comps, joints } = mkFourBar();
  const t0 = process.hrtime.bigint();
  for (let th = 1; th <= 360; th++) {
    const map = solveLoop(joints, comps, 'J1', { angle: th });
    if (!map) throw new Error(`θ=${th}° null`);
    applyMap(joints, map);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(ms < 1800, `360 步总耗时 ${ms.toFixed(1)}ms < 1800ms`);
  ok(ms / 360 < 5, `平均 ${(ms / 360).toFixed(3)}ms/步 < 5ms`);
});

// ============ T7 滑块曲柄可达性掩码 (#92) ============
test('T7 sliderCrankReachability 逐角掩码 + 可达比例', () => {
  // e=0 在线: 连杆 L=60 > 曲柄 r=20 → 全程可达
  const inl = sliderCrankReachability({ r: 20, L: 60, e: 0 }, 360);
  ok(inl.reachable.length === 361 && inl.thetas.length === 361, `361 步掩码 (实际 ${inl.reachable.length})`);
  ok(inl.allReachable === true && inl.fraction === 1, 'e=0 全程可达 fraction=1');
  ok(inl.reachable.every((b) => b === true), '每个曲柄角都可达');
  // 逐角掩码同 solveSliderCrank.ok 严格一致 (无静默偏差)
  let mismatch = 0;
  for (let i = 0; i < inl.thetas.length; i++) {
    if (solveSliderCrank({ r: 20, L: 60, e: 0, theta: inl.thetas[i] }).ok !== inl.reachable[i]) mismatch++;
  }
  ok(mismatch === 0, 'e=0 掩码逐角 === solveSliderCrank.ok');
  // e=50 大偏置 (triage 场景 r=20 L=60): 部分曲柄角 disc<0 不可达 → fraction ∈ (0,1)
  const off = sliderCrankReachability({ r: 20, L: 60, e: 50 }, 360);
  ok(off.allReachable === false, 'e=50 大偏置 → 非全程可达');
  ok(off.reachable.some((b) => b === false), '至少一个曲柄角不可达 (disc<0)');
  ok(off.reachable.some((b) => b === true), '至少一个曲柄角可达 (非全断)');
  ok(off.fraction > 0 && off.fraction < 1, `可达比例 ${(off.fraction * 100).toFixed(1)}% ∈ (0,100%) — 可用作「部分曲柄角不可达」提示`);
  // 掩码逐角同 oracle 一致
  let m2 = 0;
  for (let i = 0; i < off.thetas.length; i++) {
    if (solveSliderCrank({ r: 20, L: 60, e: 50, theta: off.thetas[i] }).ok !== off.reachable[i]) m2++;
  }
  ok(m2 === 0, 'e=50 掩码逐角 === solveSliderCrank.ok');
  // 纯函数: 唔改输入 sc
  const sc = { r: 20, L: 60, e: 50 };
  sliderCrankReachability(sc, 60);
  ok(sc.r === 20 && sc.L === 60 && sc.e === 50, '输入 sc 无被改动 (纯函数)');
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
