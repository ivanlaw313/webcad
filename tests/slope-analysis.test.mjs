// slope-analysis.test.mjs — S187 面斜度分析（面相对参考平面倾角分类）
import { analyzeSlope } from '../src/cad/slopeAnalysis.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };

// 立方 [0,10]³ 8 顶点 12 三角，6 面各 2 三角
const V = [0,0,0, 10,0,0, 10,10,0, 0,10,0, 0,0,10, 10,0,10, 10,10,10, 0,10,10];
const T = [0,1,2, 0,2,3,  4,6,5, 4,7,6,  0,4,5, 0,5,1,  2,6,7, 2,7,3,  0,3,7, 0,7,4,  1,5,6, 1,6,2];
// faceGroups：start = 首三角×3，count = 三角数×3
const FG = [
  { start: 0,  count: 6, faceId: 0 },  // 底 z=0  法向 -Z
  { start: 6,  count: 6, faceId: 1 },  // 顶 z=10 法向 +Z
  { start: 12, count: 6, faceId: 2 },  // 前 y=0  法向 -Y
  { start: 18, count: 6, faceId: 3 },  // 后 y=10 法向 +Y
  { start: 24, count: 6, faceId: 4 },  // 左 x=0  法向 -X
  { start: 30, count: 6, faceId: 5 },  // 右 x=10 法向 +X
];

// ref = +Z（水平基准）：顶/底面平(0°)，4 侧壁竖直(90°)
const r = analyzeSlope(V, T, FG, [0, 0, 1]);
const byId = (id) => r.faces.find((f) => f.faceId === id);
ok(Math.abs(byId(0).slopeDeg - 0) < 1e-6 && byId(0).cls === 'flat', `底面 slope=0 flat (实际 ${byId(0).slopeDeg.toFixed(1)} ${byId(0).cls})`);
ok(Math.abs(byId(1).slopeDeg - 0) < 1e-6 && byId(1).cls === 'flat', `顶面 slope=0 flat (实际 ${byId(1).slopeDeg.toFixed(1)} ${byId(1).cls})`);
ok(Math.abs(byId(2).slopeDeg - 90) < 1e-6 && byId(2).cls === 'steep', `前壁 slope=90 steep (实际 ${byId(2).slopeDeg.toFixed(1)} ${byId(2).cls})`);
ok(Math.abs(byId(4).slopeDeg - 90) < 1e-6 && byId(4).cls === 'steep', `左壁 slope=90 steep (实际 ${byId(4).slopeDeg.toFixed(1)} ${byId(4).cls})`);
ok(r.faces.filter((f) => f.cls === 'flat').length === 2, `2 个平面 (实际 ${r.faces.filter((f) => f.cls === 'flat').length})`);
ok(r.faces.filter((f) => f.cls === 'steep').length === 4, `4 个竖直壁 (实际 ${r.faces.filter((f) => f.cls === 'steep').length})`);
ok(Math.abs(r.min - 0) < 1e-6 && Math.abs(r.max - 90) < 1e-6, `min=0 max=90 (实际 ${r.min.toFixed(1)} ${r.max.toFixed(1)})`);

// ref = +X：±X 面变平，其余变竖直（证 ref 改变即重算）
const rx = analyzeSlope(V, T, FG, [1, 0, 0]);
const bx = (id) => rx.faces.find((f) => f.faceId === id);
ok(bx(4).cls === 'flat' && bx(5).cls === 'flat', '换 ref=X：±X 面变平');
ok(bx(0).cls === 'steep' && bx(1).cls === 'steep', '换 ref=X：顶/底变竖直');

// 45° 斜面 → transition。四边形 (0,0,0)(10,0,0)(10,10,10)(0,10,10)：法向(0,-.707,.707)，|n·Z|=.707 → 45°
const V2 = [0,0,0, 10,0,0, 10,10,10, 0,10,10];
const T2 = [0,1,2, 0,2,3];
const r45 = analyzeSlope(V2, T2, [{ start: 0, count: 6, faceId: 0 }], [0, 0, 1]);
ok(Math.abs(r45.faces[0].slopeDeg - 45) < 1e-6 && r45.faces[0].cls === 'transition', `45°斜面 → transition (实际 ${r45.faces[0].slopeDeg.toFixed(1)} ${r45.faces[0].cls})`);

// 门槛可调：flatDeg=50 令 45° 当 flat
const r45b = analyzeSlope(V2, T2, [{ start: 0, count: 6, faceId: 0 }], [0, 0, 1], { flatDeg: 50 });
ok(r45b.faces[0].cls === 'flat', '门槛 flatDeg=50 → 45° 归 flat');

// 退化：空 faceGroups → min=max=0；零长 ref → 全部 flat(0)
ok(analyzeSlope(V, T, [], [0, 0, 1]).min === 0 && analyzeSlope(V, T, [], [0, 0, 1]).max === 0, '空 faceGroups → min=max=0');
const rz = analyzeSlope(V, T, FG, [0, 0, 0]);
ok(rz.faces.every((f) => f.slopeDeg === 0 && f.cls === 'flat'), '零长 ref → 全部退化当 flat(0)');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
