// mill25d.test.mjs — 2.5D CNC 铣削刀路模块 (src/cam/mill25d.ts) 验证套件
// 跑法: npx -y tsx tests/mill25d.test.mjs   (喺 C:\ClaudeCode\webcad 目录)
// 失败 → exit 1; 末尾输出 PASS/FAIL 总表（风格照 gears.test.mjs）
import { profilesToMillGcode } from '../src/cam/mill25d.ts';

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
// 逐行解析 G0/G1/G2/G3，modal X/Y/Z 延续，G90 绝对坐标，起点 (0,0,0)。
// 每个 motion 记低起/终点、XY 行程长度（G1 直线 hypot；G2/G3 弧长 R·θ，
// I,J 圆心相对段起点，G2 顺时针 / G3 逆时针，起终重合 = 整圆）。
function parseG(g) {
  const lines = g.split('\n').map((l) => l.trim());
  let x = 0, y = 0, z = 0;
  const moves = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l || l.startsWith('(')) continue;
    const m = /^(G0|G1|G2|G3)\b/.exec(l); // \b 令 "G21" 唔会误中 "G2"
    if (!m) continue;
    const code = m[1];
    const W = (c) => {
      const r = new RegExp('(?:^|\\s)' + c + '(-?\\d*\\.?\\d+)').exec(l);
      return r ? parseFloat(r[1]) : null;
    };
    const nx = W('X') ?? x, ny = W('Y') ?? y, nz = W('Z') ?? z;
    let xyLen = 0, cx = null, cy = null, R = 0;
    if (code === 'G1') xyLen = Math.hypot(nx - x, ny - y);
    else if (code === 'G2' || code === 'G3') {
      cx = x + (W('I') ?? 0); cy = y + (W('J') ?? 0);
      R = Math.hypot(x - cx, y - cy);
      const a0 = Math.atan2(y - cy, x - cx), a1 = Math.atan2(ny - cy, nx - cx);
      let th = code === 'G2' ? a0 - a1 : a1 - a0;
      th %= 2 * Math.PI;
      if (th < 0) th += 2 * Math.PI;
      if (th < 1e-9) th = 2 * Math.PI; // 起终同点 = 整圆
      xyLen = R * th;
    }
    moves.push({ i, code, x0: x, y0: y, z0: z, x: nx, y: ny, z: nz, xyLen, cx, cy, R });
    x = nx; y = ny; z = nz;
  }
  return { lines, moves };
}
// 某一 Z 层嘅切削行程（G1/G2/G3 嘅 XY 长度；纯 Z 插刀 xyLen=0 自然唔计）
function cutLenAt(p, zLevel) {
  let L = 0;
  for (const m of p.moves) {
    if (m.code !== 'G0' && Math.abs(m.z0 - zLevel) < 1e-9 && Math.abs(m.z - m.z0) < 1e-9) L += m.xyLen;
  }
  return L;
}
// 行号区间 [i0, i1) 内嘅切削行程
function cutLenBetween(p, i0, i1) {
  let L = 0;
  for (const m of p.moves) if (m.i >= i0 && m.i < i1 && m.code !== 'G0') L += m.xyLen;
  return L;
}
function lineIdx(p, substr, from = 0) {
  for (let i = from; i < p.lines.length; i++) if (p.lines[i].includes(substr)) return i;
  return -1;
}
function countLines(p, re) {
  return p.lines.filter((l) => re.test(l)).length;
}

// ============ 共用形状 ============
const SQ40 = { pts: [[0, 0], [40, 0], [40, 40], [0, 40]] }; // CCW 方板, 无 bulges
const SQ30 = { pts: [[0, 0], [30, 0], [30, 30], [0, 30]] };
// 圆形 Profile2D：2-vert ±1 bulge 形式（pts 密铺净系分类用）
function circle(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 24; i++) pts.push([cx + r * Math.cos((i / 24) * 2 * Math.PI), cy + r * Math.sin((i / 24) * 2 * Math.PI)]);
  return { pts, verts: [[cx - r, cy], [cx + r, cy]], bulges: [1, 1] };
}
const base = { toolD: 6, depth: 5, stepdown: 2.5, feedXY: 600, feedZ: 200, rpm: 8000, safeZ: 5 };

// ============ T1 contour 方板: 2 层 + 刀心周长 178.850 ============
test('T1 contour 方板 40×40 tool Ø6: 每层刀心周长 = 4×40 + 2π×3', () => {
  const { gcode, warnings } = profilesToMillGcode([SQ40], { ...base, op: 'contour' });
  const p = parseG(gcode);
  // 切削层 = 出现过切削行程嘅 Z 值集合
  const zSet = [...new Set(p.moves.filter((m) => m.code !== 'G0' && m.xyLen > 1e-9).map((m) => m.z0))].sort((a, b) => b - a);
  ok(zSet.length === 2, `2 层 (实际 ${zSet.length}: ${zSet.join(', ')})`);
  eq(zSet[0], -2.5, '第 1 层 Z = -2.5');
  eq(zSet[1], -5, '最尾层 Z = -depth = -5（唔过切）');
  const want = 4 * 40 + 2 * Math.PI * 3; // 178.850（凸角圆角弧由偏移出）
  eq(cutLenAt(p, -2.5), want, `第 1 层刀心周长 ≈ ${want.toFixed(3)}`, 0.5);
  eq(cutLenAt(p, -5), want, `第 2 层刀心周长 ≈ ${want.toFixed(3)}`, 0.5);
  ok(warnings.length === 0, `无 warning (实际 ${JSON.stringify(warnings)})`);
});

// ============ T2 contour 孔优先 + 孔刀心 Ø4 周长 ============
test('T2 contour 方板+孔 Ø10: 孔刀心周长 12.566, 孔段先过外框段', () => {
  const { gcode } = profilesToMillGcode([SQ40, circle(20, 20, 5)], { ...base, depth: 3, stepdown: 3, op: 'contour' });
  const p = parseG(gcode);
  // 孔刀心 = Ø10 向内偏 3 → Ø4 → 周长 4π = 12.566
  const holeArcs = p.moves.filter((m) => (m.code === 'G2' || m.code === 'G3') && m.cx !== null && Math.hypot(m.cx - 20, m.cy - 20) < 0.01);
  ok(holeArcs.length > 0, `孔出真弧 G2/G3 (${holeArcs.length} 段)`);
  eq(holeArcs[0].R, 2, '孔刀心半径 = 2 (Ø4)', 0.01);
  eq(holeArcs.reduce((a, m) => a + m.xyLen, 0), 4 * Math.PI, '孔刀心周长 ≈ 12.566', 0.1);
  // 先孔后外框（外框切甩咗件就郁）
  const ih = lineIdx(p, 'contour 孔');
  const io = lineIdx(p, 'contour 外框');
  ok(ih >= 0 && io >= 0 && ih < io, `孔段 (行${ih}) 喺外框段 (行${io}) 之前`);
});

// ============ T3 pocket 环数 + 切割顺序内→外 ============
test('T3 pocket 30×30 tool Ø6 stepover 2.7: 4 环, 内→外', () => {
  // 边界 inset 3 (24×24), 再 5.7/8.4/11.1; 13.8 嘅刀内缘 16.8>15 塌陷 → 唔收
  const { gcode, warnings } = profilesToMillGcode([SQ30], { ...base, depth: 2, stepdown: 2, op: 'pocket', stepover: 2.7 });
  const p = parseG(gcode);
  const ringLines = p.lines.map((l, i) => ({ l, i })).filter((o) => /^\(环 \d+\/\d+\)$/.test(o.l));
  ok(ringLines.length === 4, `环数 = 4 (实际 ${ringLines.length})`);
  ok(ringLines.every((o) => o.l.endsWith('/4)')), '每个环注释都系 x/4');
  // 首环（最内, inset 11.1 → 7.8×7.8 周长 31.2）
  const len1 = cutLenBetween(p, ringLines[0].i, ringLines[1].i);
  eq(len1, 4 * (30 - 2 * 11.1), '首环（最内）周长 ≈ 31.2', 0.5);
  // 尾环（边界 24×24 周长 96 + 环间平移）→ 一定长过首环 = 内→外顺序
  const len4 = cutLenBetween(p, ringLines[3].i, p.lines.length);
  ok(len4 > len1, `尾环行程 ${len4.toFixed(2)} > 首环 ${len1.toFixed(2)}（内→外）`);
  eq(len4, 96 + 2.7 * Math.SQRT2, '尾环 = 96 + 环间平移 3.818', 0.5);
  ok(warnings.some((w) => w.includes('直插下刀')), `有「直插下刀」warning: ${JSON.stringify(warnings)}`);
});

// ============ T4 drill 啄钻展开 ============
test('T4 drill Ø3 tool Ø3.175 depth 6 stepdown 2: 3 啄', () => {
  const opts = { toolD: 3.175, depth: 6, stepdown: 2, feedXY: 300, feedZ: 80, rpm: 9000, safeZ: 5, op: 'drill', drillMaxD: 6.35 };
  const { gcode, warnings } = profilesToMillGcode([circle(7, 9, 1.5)], opts);
  const p = parseG(gcode);
  ok(p.lines.some((l) => l === 'G0 X7 Y9'), '圆心坐标 G0 X7 Y9 出现');
  // 每啄: G1 落 / G0 升 safeZ / G0 落返上次深+0.5
  ok(countLines(p, /^G1 Z-2(\s|$)/) === 1 && countLines(p, /^G1 Z-4(\s|$)/) === 1 && countLines(p, /^G1 Z-6(\s|$)/) === 1, '3 啄: G1 Z-2 / Z-4 / Z-6 各一次');
  ok(countLines(p, /^G1 Z-/) === 3, `落刀 G1 总数 = 3 啄 (实际 ${countLines(p, /^G1 Z-/)})`);
  ok(countLines(p, /^G0 Z-1\.5(\s|$)/) === 1 && countLines(p, /^G0 Z-3\.5(\s|$)/) === 1, '排屑后 G0 落返上次深+0.5 (Z-1.5 / Z-3.5)');
  // G0 Z5 = 头(1) + 钻起手(1) + 每啄排屑升(3) + 尾(1) = 6
  ok(countLines(p, /^G0 Z5(\s|$)/) === 6, `G0 升 safeZ 次数 = 6 (实际 ${countLines(p, /^G0 Z5(\s|$)/)})`);
  const zMin = Math.min(...p.moves.map((m) => m.z));
  eq(zMin, -6, '最终 Z = -6（准确到底, 冇过切）');
  ok(warnings.length === 0, `无 warning (实际 ${JSON.stringify(warnings)})`);
});

// ============ T5 塌陷警告: 孔细过刀 ============
test('T5 contour 孔 Ø5 + tool Ø6: 警告 + 唔出该孔段', () => {
  const { gcode, warnings } = profilesToMillGcode([SQ40, circle(20, 20, 2.5)], { ...base, depth: 2, stepdown: 2, op: 'contour' });
  ok(warnings.some((w) => w.includes('细过刀')), `warnings 含「细过刀」: ${JSON.stringify(warnings)}`);
  const p = parseG(gcode);
  // 塌陷孔乜都唔准出 — 所有运动点离孔心 (20,20) 都要远（外框路径最近都 23mm）
  let dMin = Infinity;
  for (const m of p.moves) dMin = Math.min(dMin, Math.hypot(m.x - 20, m.y - 20));
  ok(dMin > 10, `所有运动点离 (20,20) ≥ ${dMin.toFixed(2)} > 10 — 冇孔段`);
  ok(lineIdx(p, 'contour 孔') === -1, 'G-code 冇「contour 孔」段');
});

// ============ T6 tabs 留料桥: 净系最后一层 ============
test('T6 contour tabs=4 depth 5: 最后层 4 次升 Z-4, 非最后层冇桥', () => {
  const { gcode, warnings } = profilesToMillGcode([SQ40], { ...base, op: 'contour', tabs: 4 });
  const p = parseG(gcode);
  // 桥高 1mm → 升到 -(5-1) = -4; 全文净系最后层先有 → 总数恰好 4
  ok(countLines(p, /^G1 Z-4(\s|$)/) === 4, `升 Z 到 -4 次数 = 4 (实际 ${countLines(p, /^G1 Z-4(\s|$)/)})`);
  // 落返 -5: 最后层起手插刀 1 次 + 每条桥落返 4 次 = 5
  ok(countLines(p, /^G1 Z-5(\s|$)/) === 5, `落 Z 到 -5 次数 = 5 (实际 ${countLines(p, /^G1 Z-5(\s|$)/)})`);
  // 桥面行程 = 4 桥 × 6mm = 24
  eq(cutLenAt(p, -4), 4 * 6, '桥高 Z-4 行程 ≈ 24 (4×6mm)', 0.5);
  // 非最后层（-2.5）系正常整圈, 周长照旧
  const want = 4 * 40 + 2 * Math.PI * 3;
  eq(cutLenAt(p, -2.5), want, `第 1 层照旧 ${want.toFixed(3)}（冇桥）`, 0.5);
  // 最后层切深行程 = 周长 - 桥位 24（密铺折线, 容差松少少）
  eq(cutLenAt(p, -5), want - 24, '最后层 Z-5 行程 ≈ 周长 - 24', 1);
  ok(warnings.some((w) => w.includes('桥层直线密铺')), `warnings 含「桥层直线密铺」: ${JSON.stringify(warnings)}`);
});

// ============ T7 语法: GRBL 方言逐行 + 头尾结构 ============
test('T7 G-code 语法 + 头 G21/G90/G17 + M3 先于 G1 + 尾 M5/M2', () => {
  const { gcode } = profilesToMillGcode([SQ40, circle(20, 20, 5)], { ...base, depth: 3, stepdown: 3, op: 'contour' });
  const lines = gcode.split('\n');
  const re = /^(\(|G0|G1|G2|G3|G21|G90|G17|M3|M5|M2)/;
  for (const l of lines) {
    if (l.trim() === '') continue;
    if (!re.test(l)) throw new Error(`非法行: "${l}"`);
  }
  note(`全部 ${lines.length} 行通过 GRBL 白名单 regex`);
  ok(lines[0] === 'G21' && lines[1] === 'G90' && lines[2] === 'G17', '首三行 G21/G90/G17');
  const iM3 = lines.findIndex((l) => /^M3(\s|$)/.test(l));
  const iG1 = lines.findIndex((l) => /^G1(\s|$)/.test(l)); // \b 唔够 — "G17" 都系 G1 开头
  ok(iM3 >= 0 && iG1 > iM3, `M3 (行${iM3}) 喺第一条 G1 (行${iG1}) 之前`);
  const ne = lines.filter((l) => l.trim() !== '');
  ok(ne[ne.length - 2] === 'M5' && ne[ne.length - 1] === 'M2', '尾 M5 → M2');
  ok(ne[ne.length - 3].startsWith('G0 Z'), '完场前先升安全高 G0 Z');
});

// ============ T8 参数 guard + stepover clamp + drill 拒非圆/超径 ============
test('T8 参数 guard throw + stepover clamp + drill 跳过规则', () => {
  for (const k of ['toolD', 'depth', 'stepdown', 'feedXY', 'feedZ', 'rpm', 'safeZ']) {
    let threw = false;
    try { profilesToMillGcode([SQ40], { ...base, op: 'contour', [k]: 0 }); } catch (e) { threw = /必须为正/.test(e.message); }
    ok(threw, `${k}=0 → throw 中文信息`);
  }
  // stepover clamp 上限 0.9×toolD=5.4: 环 inset 3, 8.4 (13.8 刀内缘 16.8 塌) = 2 环
  const hi = parseG(profilesToMillGcode([SQ30], { ...base, depth: 2, stepdown: 2, op: 'pocket', stepover: 100 }).gcode);
  ok(countLines(hi, /^\(环 \d+\/2\)$/) === 2, `stepover=100 clamp 到 5.4 → 2 环 (实际 ${countLines(hi, /^\(环 /)})`);
  // clamp 下限 0.2×toolD=1.2: 环 inset 3,4.2,…,11.4 = 8 环 (12.6 刀内缘 15.6 塌)
  const lo = parseG(profilesToMillGcode([SQ30], { ...base, depth: 2, stepdown: 2, op: 'pocket', stepover: 0.1 }).gcode);
  ok(countLines(lo, /^\(环 \d+\/8\)$/) === 8, `stepover=0.1 clamp 到 1.2 → 8 环 (实际 ${countLines(lo, /^\(环 /)})`);
  // drill: 非圆 → 跳过; 超 drillMaxD → 跳过; 大过刀径×1.05 → 提示改 contour
  const d1 = profilesToMillGcode([SQ40], { ...base, op: 'drill' });
  ok(d1.warnings.some((w) => w.includes('非圆形')) && !/G0 X/.test(d1.gcode), '非圆 profile → warning + 冇刀路');
  const d2 = profilesToMillGcode([circle(5, 5, 5)], { ...base, op: 'drill', drillMaxD: 6.35 });
  ok(d2.warnings.some((w) => w.includes('drillMaxD')), `Ø10 > drillMaxD 6.35 → warning: ${JSON.stringify(d2.warnings)}`);
  const d3 = profilesToMillGcode([circle(5, 5, 2.5)], { ...base, toolD: 3, op: 'drill' });
  ok(d3.warnings.some((w) => w.includes('contour')), `Ø5 > toolD 3×1.05 → 提示改 contour: ${JSON.stringify(d3.warnings)}`);
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
