// gears.test.mjs — 齿轮传动纯数学模块 (src/cad/gears.ts) 验证套件
// 跑法: npx -y tsx tests/gears.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表
import {
  suggestGearTrain,
  meshPhase,
  centerDistance,
  gearFeature,
  wormFeature,
  wormBuild,
  WORM_NO_WHEEL_NOTE,
  crownFeature,
  internalGearFeatures,
  backlashPhaseDeg,
  GEARTRAIN_ERR_TOL,
} from '../src/cad/gears.ts';

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

// 重算 ∏ zOut/zIn — 同模块一样左折叠连乘, 浮点逐位一致 → 可以严格 ===
function recomputeAchieved(plan) {
  let a = 1;
  for (const s of plan.stages) a *= s.zOut / s.zIn;
  return a;
}
// plan 通用校验: 齿数整数喺 [zMin,zMax]、achieved 严格等于重算、errPct 公式一致、cds 逐级公式严格相等
function checkPlanInvariants(plan, target, m, zMin, zMax, label) {
  ok(plan.stages.length >= 1, `${label}: 至少 1 级 (实际 ${plan.stages.length})`);
  for (const s of plan.stages) {
    ok(Number.isInteger(s.zIn) && Number.isInteger(s.zOut), `${label}: 齿数系整数 (${s.zIn}:${s.zOut})`);
    ok(s.zIn >= zMin && s.zIn <= zMax && s.zOut >= zMin && s.zOut <= zMax,
      `${label}: 齿数喺 [${zMin},${zMax}] (${s.zIn}:${s.zOut})`);
  }
  ok(plan.achieved === recomputeAchieved(plan), `${label}: achieved === 重算 ∏zOut/zIn (严格相等, ${plan.achieved})`);
  const t = Math.min(10000, Math.max(1, target));
  ok(plan.errPct === (Math.abs(plan.achieved - t) / t) * 100, `${label}: errPct 公式一致 (${plan.errPct.toFixed(6)}%)`);
  ok(plan.cds.length === plan.stages.length, `${label}: cds 长度 = 级数`);
  for (let i = 0; i < plan.stages.length; i++) {
    const s = plan.stages[i];
    ok(plan.cds[i] === (m * (s.zIn + s.zOut)) / 2, `${label}: cds[${i}] === m(zIn+zOut)/2 = ${plan.cds[i]}`);
  }
}

// ============ T1 自动级数: 代表性 target 误差界 + 齿数范围 + achieved 严格重算 ============
test('T1 suggestGearTrain 代表性 targets', () => {
  const targets = [2, 3.5, 9.75, 40, 120, 1];
  for (const t of targets) {
    const plan = suggestGearTrain(t, 2);
    const chain = plan.stages.map((s) => `${s.zIn}:${s.zOut}`).join(' → ');
    note(`target ${t} → ${plan.stages.length} 级 [${chain}] achieved=${plan.achieved.toFixed(6)} err=${plan.errPct.toFixed(4)}%`);
    checkPlanInvariants(plan, t, 2, 12, 120, `target ${t}`);
    const bound = t <= 6 ? 0.1 : 1;
    ok(plan.errPct <= bound, `target ${t}: errPct ${plan.errPct.toFixed(4)}% ≤ ${bound}%`);
  }
});

// ============ T2 中心距公式精确性 ============
test('T2 centerDistance 精确', () => {
  ok(centerDistance(2, 20, 40) === 60, 'centerDistance(2,20,40) === 60 (严格相等)');
  ok(centerDistance(1, 12, 13) === 12.5, 'centerDistance(1,12,13) === 12.5');
  ok(centerDistance(0.5, 17, 31) === 12, 'centerDistance(0.5,17,31) === 12');
  // 唔同模数嘅 plan, cds 逐级严格 = m(zIn+zOut)/2 (checkPlanInvariants 内已逐项断言)
  checkPlanInvariants(suggestGearTrain(7.5, 1.5), 7.5, 1.5, 12, 120, 'm1.5 t7.5');
  checkPlanInvariants(suggestGearTrain(33, 3), 33, 3, 12, 120, 'm3 t33');
});

// ============ T3 啮合相位 ============
test('T3 meshPhase 偶/奇齿数', () => {
  ok(meshPhase(12) === 15, 'meshPhase(12) === 15 (偶 → 180/z)');
  ok(meshPhase(13) === 0, 'meshPhase(13) === 0 (奇 → 0)');
  ok(meshPhase(20) === 9, 'meshPhase(20) === 9');
  ok(meshPhase(24) === 7.5, 'meshPhase(24) === 7.5');
  ok(meshPhase(17) === 0, 'meshPhase(17) === 0');
});

// ============ T4 强制多级 ============
test('T4 强制 2 级 target 40', () => {
  const plan = suggestGearTrain(40, 2, { stages: 2 });
  const chain = plan.stages.map((s) => `${s.zIn}:${s.zOut}`).join(' → ');
  note(`40 ×2级 → [${chain}] achieved=${plan.achieved.toFixed(6)} err=${plan.errPct.toFixed(4)}%`);
  ok(plan.stages.length === 2, `恰好 2 级 (实际 ${plan.stages.length})`);
  ok(plan.errPct <= 1, `errPct ${plan.errPct.toFixed(4)}% ≤ 1%`);
  checkPlanInvariants(plan, 40, 2, 12, 120, '40×2级');
});

// ============ T5 性能: 20 个随机 target 自动级数 (定值种子 LCG) ============
test('T5 性能 <2s 总 / <100ms 单次', () => {
  // 自写 LCG (Numerical-Recipes 常数), 定值种子 → 完全确定性
  let seed = 0x6ea51234 >>> 0;
  const rnd = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let totalNs = 0n;
  let worstNs = 0n;
  let worstT = 0;
  for (let k = 0; k < 20; k++) {
    const t = 1.5 + rnd() * 1998.5;
    const t0 = process.hrtime.bigint();
    const plan = suggestGearTrain(t, 2);
    const dt = process.hrtime.bigint() - t0;
    totalNs += dt;
    if (dt > worstNs) { worstNs = dt; worstT = t; }
    if (plan.errPct > 1) throw new Error(`target ${t.toFixed(3)}: errPct ${plan.errPct.toFixed(4)}% > 1% (健全性)`);
  }
  const totalMs = Number(totalNs) / 1e6;
  const worstMs = Number(worstNs) / 1e6;
  note(`20 个 target ∈[1.5,2000] 全部 errPct ≤ 1%`);
  ok(totalMs < 2000, `总耗时 ${totalMs.toFixed(1)}ms < 2000ms`);
  ok(worstMs < 100, `单次最差 ${worstMs.toFixed(1)}ms < 100ms (target ${worstT.toFixed(2)})`);
  // 极端: target=10000 强制 4 级都要 <100ms
  const t0 = process.hrtime.bigint();
  const plan = suggestGearTrain(10000, 1, { stages: 4 });
  const extremeMs = Number(process.hrtime.bigint() - t0) / 1e6;
  ok(plan.stages.length === 4, 'target 10000 强制 4 级');
  ok(extremeMs < 100, `target 10000 ×4级 耗时 ${extremeMs.toFixed(1)}ms < 100ms (err ${plan.errPct.toFixed(4)}%)`);
});

// ============ T6 Feature 样板形状 ============
test('T6 gearFeature/wormFeature/crownFeature 形状', () => {
  const g = gearFeature(2, 24, 10, 8, { phase: 7.5, helix: 15 });
  ok(g.type === 'gear', `gearFeature.type === 'gear'`);
  ok(typeof g.id === 'string' && g.id.length > 0, `id 非空字符串 (${g.id})`);
  ok(g.module === 2 && g.teeth === 24 && g.thickness === 10 && g.bore === 8, 'module/teeth/thickness/bore 透传');
  ok(g.phase === 7.5, 'phase 透传 = 7.5');
  ok(g.helix === 15, 'helix 透传 = 15');
  const g2 = gearFeature(1.5, 30, 6, 5);
  ok(g2.phase === undefined && g2.helix === undefined, '无 opts → phase/helix undefined');
  ok(g2.id !== g.id, `id 唯一 (${g.id} ≠ ${g2.id})`);
  const w = wormFeature(2, 2, 60);
  ok(w.type === 'worm', `wormFeature.type === 'worm'`);
  ok(w.module === 2 && w.starts === 2 && w.length === 60, 'worm module/starts/length 透传');
  ok(typeof w.id === 'string' && w.id !== g2.id, 'worm id 唯一');
  const c = crownFeature(2, 30, 6, 8, 5);
  ok(c.type === 'crowngear', `crownFeature.type === 'crowngear'`);
  ok(c.module === 2 && c.teeth === 30 && c.discH === 6 && c.faceW === 8 && c.bore === 5,
    'crown module/teeth/discH/faceW/bore 透传');
  ok(typeof c.id === 'string' && c.id !== w.id, 'crown id 唯一');
});

// ============ T7 内齿圈 Feature 组 (默认带侧隙 backlash, #93) ============
test('T7 internalGearFeatures 圆盘+负形切 (默认侧隙)', () => {
  const m = 2, z = 24, th = 12, rimW = 8;
  const feats = internalGearFeatures(m, z, th, rimW);   // 默认 backlash = 0.05·m > 0 → 分 ±δ 两刀
  ok(Array.isArray(feats) && feats.length === 3, `默认侧隙 → 3 个 Feature：盘+±δ两刀 (实际 ${feats.length})`);
  const disk = feats[0];
  ok(disk.type === 'extrude', `首元素系 extrude 圆盘`);
  ok(disk.profile.kind === 'circle', '盘 profile 系 circle');
  ok(disk.profile.r === (m * z) / 2 + m + rimW, `盘半径 = ra+rimW = ${disk.profile.r} (期望 34)`);
  ok(disk.height === th && disk.operation === 'new', `盘 height=${th} operation='new'`);
  const cuts = feats.slice(1);
  for (const cut of cuts) {
    ok(cut.type === 'gear', '切刀系 gear');
    ok(cut.op === 'cut', `切刀 op === 'cut'`);
    ok(cut.bore === 0, '切刀 bore === 0 (负形齿轮无孔)');
    ok(cut.module === m && cut.teeth === z, `负形 module=${m} teeth=${z}`);
    ok(cut.thickness > th, `切厚 ${cut.thickness} > 盘厚 ${th} (保证切穿)`);
    ok(typeof cut.phase === 'number' && Number.isFinite(cut.phase), `切刀有有限 phase (${cut.phase})`);
  }
  ok(new Set(feats.map((f) => f.id)).size === 3, 'id 互不相同');
  // 侧隙: 两刀相位 ±δ, 分度圆侧隙 = rp·(φ_hi−φ_lo)·π/180 应 ≈ 0.05·m 且 > 0 (唔再零间隙互锁)
  const phases = cuts.map((c) => c.phase).sort((a, b) => a - b);
  const rp = (m * z) / 2;
  const clearance = rp * ((phases[1] - phases[0]) * Math.PI) / 180;
  ok(clearance > 0, `分度圆侧隙 ${clearance.toFixed(4)}mm > 0 (非零间隙)`);
  eq(clearance, 0.05 * m, `分度圆侧隙 === 默认 backlash 0.05·m = ${0.05 * m}`, 1e-9);
  const delta = backlashPhaseDeg(m, z, 0.05 * m);
  eq(phases[1], delta, `+δ 相位 = backlashPhaseDeg = ${delta.toFixed(5)}°`, 1e-12);
  eq(phases[0], -delta, `−δ 相位 = −backlashPhaseDeg`, 1e-12);
  // backlash=0 → 退回单刀零侧隙老样式 (byte-compat)
  const zero = internalGearFeatures(m, z, th, rimW, 0);
  ok(zero.length === 2, `backlash=0 → 恰好 2 个 Feature (老样式, 实际 ${zero.length})`);
  ok(zero[1].type === 'gear' && zero[1].op === 'cut' && zero[1].bore === 0, '老样式尾元素系 op=cut bore=0 gear');
  ok(zero[1].phase === undefined, '老样式切刀无 phase 偏摆 (零侧隙)');
  eq(backlashPhaseDeg(m, z, 0), 0, 'backlashPhaseDeg(...,0) === 0');
  eq(backlashPhaseDeg(m, 0, 0.1), 0, 'backlashPhaseDeg 非法齿数 → 0');
});

// ============ T8 totalWidth 跨度估算 ============
test('T8 totalWidth: 单级 20:40 m2 → 124', () => {
  // zMin=20 zMax=40 下 target 2 嘅唯一精确对就系 20:40
  const plan = suggestGearTrain(2, 2, { zMin: 20, zMax: 40 });
  ok(plan.stages.length === 1, `恰好 1 级 (实际 ${plan.stages.length})`);
  ok(plan.stages[0].zIn === 20 && plan.stages[0].zOut === 40, `配对 20:40 (实际 ${plan.stages[0].zIn}:${plan.stages[0].zOut})`);
  ok(plan.errPct === 0, 'errPct === 0 (精确比)');
  ok(plan.cds.length === 1 && plan.cds[0] === 60, `cd === 60 (实际 ${plan.cds[0]})`);
  // totalWidth = cd + ra(zIn首) + ra(zOut尾) = 60 + 2·(20+2)/2 + 2·(40+2)/2 = 60+22+42
  ok(plan.totalWidth === 124, `totalWidth === 124 (实际 ${plan.totalWidth})`);
  checkPlanInvariants(plan, 2, 2, 20, 40, 't8');
  // 多级跨度公式: Σcd + 首 zIn 齿顶半径 + 尾 zOut 齿顶半径
  const p2 = suggestGearTrain(40, 2, { stages: 2 });
  const expect2 = p2.cds.reduce((a, b) => a + b, 0)
    + (2 * (p2.stages[0].zIn + 2)) / 2
    + (2 * (p2.stages[p2.stages.length - 1].zOut + 2)) / 2;
  ok(p2.totalWidth === expect2, `双级 totalWidth === Σcd+首末ra = ${p2.totalWidth}`);
});

// ============ T9 蜗杆诚实元数据 (#90) ============
test('T9 wormBuild 诚实标记「仅蜗杆（无蜗轮配对）」', () => {
  const wb = wormBuild(2, 2, 60);
  ok(wb.hasWheel === false, 'hasWheel === false (本模块无配套蜗轮)');
  ok(WORM_NO_WHEEL_NOTE === '仅蜗杆（无蜗轮配对）', 'WORM_NO_WHEEL_NOTE 精确串');
  ok(typeof wb.status === 'string' && wb.status.includes(WORM_NO_WHEEL_NOTE), `status 含「${WORM_NO_WHEEL_NOTE}」(UI 唔会过度承诺)`);
  ok(wb.feature.type === 'worm', 'feature.type === worm');
  ok(wb.feature.module === 2 && wb.feature.starts === 2 && wb.feature.length === 60, 'feature 参数透传');
  eq(wb.meshRatio(40), 20, 'meshRatio(40齿蜗轮)=40/2=20 (纯运动学参考, 无几何)');
  // 头数取整 + 下限 1
  const wb2 = wormBuild(1.5, 0, 30);
  ok(wb2.feature.starts === 1, 'starts 下限 1 (输入 0 → 1)');
  eq(wb2.meshRatio(30), 30, 'meshRatio 用取整后头数 = 30/1');
});

// ============ T10 suggestGearTrain 达标判定 ok/warning (#94) ============
test('T10 suggestGearTrain ok/warning 硬性拦截', () => {
  ok(GEARTRAIN_ERR_TOL === 5, `GEARTRAIN_ERR_TOL === 5 (%)`);
  // 达标: 自动级数
  const good = suggestGearTrain(9.75, 2);
  ok(good.ok === true, `自动级数达标 → ok=true (err ${good.errPct.toFixed(3)}%)`);
  ok(good.warning === undefined, '达标 → 无 warning');
  ok(good.errPct <= GEARTRAIN_ERR_TOL, `errPct ${good.errPct.toFixed(3)}% ≤ ${GEARTRAIN_ERR_TOL}%`);
  ok(good.maxReach === Math.pow(120 / 12, good.stages.length), `maxReach === (zMax/zMin)^n = ${good.maxReach}`);
  // 达标: 强制 2 级但目标可达
  const good2 = suggestGearTrain(40, 2, { stages: 2 });
  ok(good2.ok === true && good2.warning === undefined, `强制2级 target40 可达 → ok=true 无 warning (err ${good2.errPct.toFixed(3)}%)`);
  // 未达标: 强制 2 级但目标 200 (2 级最多 (120/12)^2=100 倍) → 硬性拦截
  const bad = suggestGearTrain(200, 2, { stages: 2 });
  ok(bad.stages.length === 2, '强制 2 级');
  ok(bad.maxReach === 100, `maxReach = 10^2 = 100 (实际 ${bad.maxReach})`);
  ok(bad.errPct > GEARTRAIN_ERR_TOL, `errPct ${bad.errPct.toFixed(1)}% > ${GEARTRAIN_ERR_TOL}% (远未达标)`);
  ok(bad.ok === false, 'ok === false (唔当成功)');
  ok(typeof bad.warning === 'string' && bad.warning.includes('请加级数'), `warning 提示加级数: "${bad.warning}"`);
  ok(bad.warning.includes('200'), 'warning 点名目标倍数 200');
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
