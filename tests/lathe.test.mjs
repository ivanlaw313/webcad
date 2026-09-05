// lathe.test.mjs — 2 轴 CNC 车削刀路模块 (src/cam/lathe.ts) 验证套件
// 跑法: npx -y tsx tests/lathe.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表（风格照 mill25d.test.mjs / gears.test.mjs）
import { latheToGcode } from '../src/cam/lathe.ts';

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

// ============ 自写 G-code 解析器（oracle 量度用） ============
// 逐行解析 G0/G1，modal X/Z 延续（车床 2 轴 ZX 平面，本模块全 G1 直线无 G2/G3）。
// G90 绝对坐标，起点 X/Z = NaN（首次出现先定）。每个 motion 记低 code、X(直径)、Z。
function parseG(g) {
  const lines = g.split('\n').map((l) => l.trim());
  let x = NaN, z = NaN;
  const moves = [];
  for (const l of lines) {
    if (!l || l.startsWith('(')) continue;
    const m = /^(G0|G1)\b/.exec(l); // \b 令 "G18"/"G90"/"G21" 唔会误中 "G1"
    if (!m) continue;
    const code = m[1];
    const W = (c) => {
      const r = new RegExp('(?:^|\\s)' + c + '(-?\\d*\\.?\\d+)').exec(l);
      return r ? parseFloat(r[1]) : null;
    };
    const nx = W('X'); const nz = W('Z');
    if (nx !== null) x = nx;
    if (nz !== null) z = nz;
    moves.push({ code, x, z, line: l });
  }
  return { lines, moves };
}
function countLines(p, re) {
  return p.lines.filter((l) => re.test(l)).length;
}
// 某 substr 第一次出现嘅行号
function lineIdx(p, substr, from = 0) {
  for (let i = from; i < p.lines.length; i++) if (p.lines[i].includes(substr)) return i;
  return -1;
}
// 所有 G1 切削动作（用嚟验 X 序列等）
function cutMoves(p) {
  return p.moves.filter((m) => m.code === 'G1');
}
// 某注释段（如「精车」）之后嘅 G1 切削动作 —— 隔离粗车干扰
function cutMovesAfter(g, substr) {
  const idx = g.indexOf(substr);
  const tail = idx < 0 ? g : g.slice(idx);
  return parseG(tail).moves.filter((m) => m.code === 'G1');
}

// ============ 共用底盘 ============
const base = { stockD: 24, doc: 2, feed: 120, rpm: 1200, safeX: 30, safeZ: 5 };

// ============ T1 turn 直柱: 毛坯 R12 车到 R10, 直径模式验 X20 唔系 X10 ============
test('T1 turn 直柱 R10 stockD24 doc2 finishStep0.3: 1 层粗车 X20.6 + 精车 X20', () => {
  const profile = [{ z: 0, r: 10 }, { z: -30, r: 10 }];
  // toolNoseR 0.2 ≤ finishStep 0.3 → 唔触发「刀尖过切」warning（验干净路径）
  const { gcode, warnings } = latheToGcode(profile, { ...base, op: 'turn', finishStep: 0.3, toolNoseR: 0.2 });
  const p = parseG(gcode);
  // 手算: maxFinishR=10, finishLine=10.3; nRough=ceil((12-10.3)/2)=ceil(0.85)=1
  //       粗车层 R=max(10.3, 12-2)=10.3 → 直径 20.6; 精车 R=10 → 直径 20.0
  ok(countLines(p, /turn 粗车 第 1\/1 层/) === 1, '粗车恰好 1 层 (nRough=1)');
  ok(gcode.includes('X20.6'), 'G-code 含粗车直径 X20.6 (留量层 R10.3)');
  ok(/(?:^|\s)X20(?:\s|$)/m.test(gcode), 'G-code 含精车直径 X20 (R10×2)');
  // diameter mode 铁证: 全程冇出现半径值 X10（独立 token, 唔系 X10x.x 的前缀）
  ok(!/(?:^|\s)X10(?:\s|$)/m.test(gcode), 'G-code 唔含半径值 X10（diameter mode 验证）');
  // 精车段 G1 全部 X=20（直柱）、覆盖 z=0 到 z=-30
  const cuts = cutMovesAfter(gcode, '精车');
  ok(cuts.every((m) => Math.abs(m.x - 20) < 1e-6), `精车 G1 全部 X=20 (直柱, ${cuts.length} 段)`);
  ok(cuts.some((m) => Math.abs(m.z + 30) < 1e-6) && cuts.some((m) => Math.abs(m.z) < 1e-6),
    '精车覆盖 z=0 到 z=-30 全程');
  ok(warnings.length === 0, `无 warning (实际 ${JSON.stringify(warnings)})`);
});

// ============ T2 turn 阶梯轴: z<-15 车 R6(X12), z>-15 车 R10(X20) ============
test('T2 turn 阶梯轴: 精车一刀走两段 X20→X12, 台阶处先大径后细径', () => {
  const profile = [{ z: 0, r: 10 }, { z: -15, r: 10 }, { z: -15, r: 6 }, { z: -30, r: 6 }];
  const { gcode } = latheToGcode(profile, { ...base, op: 'turn', finishStep: 0.3 });
  const p = parseG(gcode);
  // 粗车层 R=10.3(X20.6) 全程平 (所有成品 r≤10<10.3); 精车走轮廓 X20(z 0..-15) → X12(z -15..-30)
  ok(gcode.includes('X20'), '精车含粗段直径 X20 (z>-15, R10)');
  ok(gcode.includes('X12'), '精车含细段直径 X12 (z<-15, R6)');
  // 精车段最尾一段必到 X12 @ z=-30
  const cuts = cutMoves(p);
  const last = cuts[cuts.length - 1];
  ok(Math.abs(last.x - 12) < 1e-6 && Math.abs(last.z + 30) < 1e-6,
    `精车末点 X12 Z-30 (实际 X${last.x} Z${last.z})`);
  // 台阶处走刀向: 喺精车段内, X20 嘅 z=-15 出现喺 X12 嘅 z=-15 之前（先车大外径平台）
  const fin = lineIdx(p, '精车');
  const finLines = p.lines.slice(fin);
  const i20at15 = finLines.findIndex((l) => /X20\b/.test(l) && /Z-15\b/.test(l));
  const i12at15 = finLines.findIndex((l) => /X12\b/.test(l) && /Z-15\b/.test(l));
  ok(i20at15 >= 0 && i12at15 > i20at15, `台阶处先 X20@Z-15 (行${i20at15}) 后 X12@Z-15 (行${i12at15})`);
});

// ============ T3 turn 锥面: 精车 X 由 10 线性到 20, 有中间过渡 X 值 ============
test('T3 turn 锥面 R5→R10 over z 0→-20: 精车密铺出中间 X 值 (非纯阶梯)', () => {
  const profile = [{ z: 0, r: 5 }, { z: -20, r: 10 }];
  const { gcode } = latheToGcode(profile, { ...base, op: 'turn', finishStep: 0.3 });
  const p = parseG(gcode);
  // 精车锥段 dr=5 > DENSIFY_DR(1) → steps=5, 中间 t=1/5..4/5 → R=6,7,8,9 → 直径 X12,14,16,18
  const fin = lineIdx(p, '精车');
  const finLines = p.lines.slice(fin).join('\n');
  ok(/X10\b/.test(finLines), '锥段含起点直径 X10 (R5)');
  ok(/X20\b/.test(finLines), '锥段含终点直径 X20 (R10)');
  // 中间过渡 X 值: 至少有一个 X14 / X16 呢类非端点直径
  ok(/X14\b/.test(finLines) && /X16\b/.test(finLines),
    '锥段含中间过渡直径 X14/X16 (密铺, 非纯阶梯)');
  // 锥段 X 随 z 由细到大单调 (z 0→-20 倒序行, X 由 10 升到 20) —— 只睇精车段
  const cuts = cutMovesAfter(gcode, '精车');
  let mono = true;
  for (let i = 1; i < cuts.length; i++) if (cuts[i].x < cuts[i - 1].x - 1e-6) mono = false;
  ok(mono, `精车锥段直径单调递增 X10→X20 (${cuts.map((m) => m.x).join(',')})`);
});

// ============ T4 face 端面车平: G1 X 递减序列 @ z=0 ============
test('T4 face 端面 stockD24 doc2: 由 X24 径向车到 X0, X 递减', () => {
  const { gcode, warnings } = latheToGcode([{ z: 0, r: 12 }, { z: -10, r: 12 }], { ...base, op: 'face' });
  const p = parseG(gcode);
  // 端面: stockR=12 半径递减 2 到 0 → X 直径序列 20,16,12,8,4,0 (起手 G0 X24)
  const faceCuts = cutMoves(p).filter((m) => Math.abs(m.z) < 1e-6);
  ok(faceCuts.length >= 2, `端面 G1 切削 ≥2 段 (实际 ${faceCuts.length})`);
  // X 严格递减
  let dec = true;
  for (let i = 1; i < faceCuts.length; i++) if (faceCuts[i].x >= faceCuts[i - 1].x - 1e-9) dec = false;
  ok(dec, `端面 X 递减序列 (${faceCuts.map((m) => m.x).join(' → ')})`);
  // 末点车到中心 X0
  eq(faceCuts[faceCuts.length - 1].x, 0, '端面末点车到中心 X0');
  // 全部端面切削 z=0
  ok(faceCuts.every((m) => Math.abs(m.z) < 1e-6), '所有端面切削 @ z=0');
  ok(warnings.length === 0, `无 warning (实际 ${JSON.stringify(warnings)})`);
});

// ============ T5 groove 切槽: R10→R6 (X12), 槽宽 3>刀宽 2 → 多刀清宽 + warning ============
test('T5 groove grooveZ-10 W3 depth4 doc2 stockD20: 切到 X12, 2 刀清宽 + warning', () => {
  const opts = { stockD: 20, doc: 2, feed: 100, rpm: 1500, safeX: 26, safeZ: 5,
    op: 'groove', grooveZ: -10, grooveW: 3, grooveDepth: 4 };
  const { gcode, warnings } = latheToGcode([], opts);
  const p = parseG(gcode);
  // startR=10, bottomR=10-4=6 → 切到底直径 X12; 径向层 nLayers=ceil(4/2)=2
  ok(gcode.includes('X12'), 'G-code 含槽底直径 X12 (R6 = R10-depth4)');
  // 槽宽 3 > 刀宽 doc=2 → passes=ceil(3/2)=2 刀
  ok(countLines(p, /groove 切槽 第 \d+\/2 刀/) === 2, '切槽恰好 2 刀清宽 (passes=2)');
  ok(warnings.some((w) => w.includes('清宽')), `warning 含「清宽」: ${JSON.stringify(warnings)}`);
  // 槽切削 z 喺槽宽范围 [-11.5, -8.5] 内 (grooveZ-10 ± W/2)
  const cuts = cutMoves(p);
  ok(cuts.every((m) => m.z >= -11.5 - 1e-6 && m.z <= -8.5 + 1e-6),
    `所有切槽 G1 喺 z∈[-11.5,-8.5] (实际 z=${[...new Set(cuts.map((m) => m.z))].join(',')})`);
  // 切到底直径就系 X12（最细直径）
  const minX = Math.min(...cuts.map((m) => m.x));
  eq(minX, 12, '最深切到 X12 (R6)');
});

// ============ T6 参数 guard throw ============
test('T6 guard: safeX≤stockD / doc≤0 / profile<2 点 全 throw 中文', () => {
  // safeX ≤ stockD → throw「安全直径」
  let m1 = '';
  try { latheToGcode([{ z: 0, r: 10 }, { z: -10, r: 10 }], { ...base, safeX: 24, op: 'turn' }); }
  catch (e) { m1 = e.message; }
  ok(/安全直径/.test(m1), `safeX≤stockD → throw「安全直径」(${m1})`);
  // doc ≤ 0 → throw 必须为正
  let m2 = '';
  try { latheToGcode([{ z: 0, r: 10 }, { z: -10, r: 10 }], { ...base, doc: 0, op: 'turn' }); }
  catch (e) { m2 = e.message; }
  ok(/必须为正/.test(m2) && /doc/.test(m2), `doc=0 → throw「doc 必须为正」(${m2})`);
  // 其余必须为正参数逐个验
  for (const k of ['stockD', 'feed', 'rpm', 'safeX', 'safeZ']) {
    let threw = false;
    try { latheToGcode([{ z: 0, r: 10 }, { z: -10, r: 10 }], { ...base, op: 'turn', [k]: 0 }); }
    catch (e) { threw = /必须为正/.test(e.message); }
    ok(threw, `${k}=0 → throw 中文「必须为正」`);
  }
  // profile < 2 点 (turn) → throw
  let m3 = '';
  try { latheToGcode([{ z: 0, r: 10 }], { ...base, op: 'turn' }); }
  catch (e) { m3 = e.message; }
  ok(/最少要 2 点/.test(m3), `turn profile 1 点 → throw「最少要 2 点」(${m3})`);
  // profile < 2 点 (face) → throw
  let m4 = '';
  try { latheToGcode([{ z: 0, r: 10 }], { ...base, op: 'face' }); }
  catch (e) { m4 = e.message; }
  ok(/最少要 2 点/.test(m4), `face profile 1 点 → throw「最少要 2 点」(${m4})`);
});

// ============ T7 G-code 语法 + 头尾结构 + X 全部 ≥0 ============
test('T7 语法: GRBL 车床白名单逐行 + 头 G21/G90/G18 + M3 先于 G1 + 尾 M5/M2 + X≥0', () => {
  const cases = [
    latheToGcode([{ z: 0, r: 10 }, { z: -15, r: 10 }, { z: -15, r: 6 }, { z: -30, r: 6 }], { ...base, op: 'turn' }).gcode,
    latheToGcode([{ z: 0, r: 12 }, { z: -10, r: 12 }], { ...base, op: 'face' }).gcode,
    latheToGcode([], { stockD: 20, doc: 2, feed: 100, rpm: 1500, safeX: 26, safeZ: 5, op: 'groove', grooveZ: -10, grooveW: 3, grooveDepth: 4 }).gcode,
  ];
  // 行首白名单: 注释 / G0 / G1 / G18 / G21 / G90 / M3 / M5 / M2 (S/F 喺 M3/G1 行尾, 唔会独立成行)
  const re = /^(\(|G0|G1|G18|G21|G90|M3|M5|M2)/;
  for (const g of cases) {
    const lines = g.split('\n');
    for (const l of lines) {
      if (l.trim() === '') continue;
      if (!re.test(l)) throw new Error(`非法行: "${l}"`);
    }
    // 头三行 G21/G90/G18
    ok(lines[0] === 'G21' && lines[1] === 'G90' && lines[2] === 'G18', '首三行 G21/G90/G18');
    // M3 喺第一条 G1 之前
    const iM3 = lines.findIndex((l) => /^M3(\s|$)/.test(l));
    const iG1 = lines.findIndex((l) => /^G1(\s|$)/.test(l)); // G18 都系 G1 开头 → 用 \s/$ 边界
    ok(iM3 >= 0 && iG1 > iM3, `M3 (行${iM3}) 喺第一条 G1 (行${iG1}) 之前`);
    // 尾 M5 → M2
    const ne = lines.filter((l) => l.trim() !== '');
    ok(ne[ne.length - 2] === 'M5' && ne[ne.length - 1] === 'M2', '尾 M5 → M2');
    // X 全部 ≥0 (直径非负): 逐行抽 X token
    for (const l of lines) {
      const mm = /(?:^|\s)X(-?\d*\.?\d+)/.exec(l);
      if (mm && parseFloat(mm[1]) < 0) throw new Error(`X 出现负值: "${l}"`);
    }
  }
  note('3 个 case (turn/face/groove) 全部通过 GRBL 车床白名单 + 头尾 + X≥0');
});

// ============ T8 轮廓超毛坯 warning + 钳到毛坯 ============
test('T8 turn 轮廓含 r15 但 stockD24(R12): warning 超出毛坯 + 该处钳到 R12(X24)', () => {
  const profile = [{ z: 0, r: 15 }, { z: -20, r: 10 }];
  const { gcode, warnings } = latheToGcode(profile, { ...base, stockD: 24, safeX: 40, op: 'turn' });
  ok(warnings.some((w) => w.includes('超出毛坯')), `warning 含「超出毛坯」: ${JSON.stringify(warnings)}`);
  // 默认 toolNoseR 0.4 > finishStep 0.3 → 同时触发刀尖过切提示（规格行为）
  ok(warnings.some((w) => w.includes('刀尖半径') && w.includes('过切')),
    'warning 含「刀尖半径 > 精车留量 过切」（默认 noseR0.4 > finishStep0.3）');
  // 钳到毛坯 R12 → 直径 X24; 全程冇任何 X 超过毛坯直径 24 嘅切削（safeX=40 退刀除外）
  const p = parseG(gcode);
  ok(gcode.includes('X24'), 'r15 处钳到毛坯 R12 → 切削直径 X24');
  // 切削 G1 嘅 X 永远 ≤ 24（毛坯直径），唔会去到 X30(r15)
  const cuts = cutMoves(p);
  const maxCut = Math.max(...cuts.map((m) => m.x));
  ok(maxCut <= 24 + 1e-6, `所有 G1 切削 X ≤ 24 (毛坯直径), 实际最大 ${maxCut} — 冇切到 r15(X30)`);
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
