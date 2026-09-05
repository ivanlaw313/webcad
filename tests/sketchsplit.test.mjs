// sketchsplit.test.mjs — S179 splitPathAt 验证（草图打断 Sketch Break）
import { splitPathAt } from '../src/sketch/sketchOps.ts';
let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };
const close = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const TOL = 2;

// T1 开放折线 [[0,0],[10,0],[10,10]] 喺第一段中点 [5,0] 打断 → 2 段
const openP = { verts: [[0,0],[10,0],[10,10]], bulges: [0,0], closed: false };
const r1 = splitPathAt(openP, [], [5,0], TOL);
ok(r1 && r1.kind === 'parts' && r1.parts.length === 2, `开放折线中点打断 → 2 段 (实际 ${r1?.parts?.length})`);
// part1 = [0,0]→[5,0]; part2 = [5,0]→[10,0]→[10,10]
const p1 = r1.parts[0], p2 = r1.parts[1];
ok(p1.verts.length === 2 && close(p1.verts[1][0], 5) && close(p1.verts[1][1], 0), `段1 末点 = 断点 [5,0] (实际 ${p1.verts[p1.verts.length-1]})`);
ok(p2.verts.length === 3 && close(p2.verts[0][0], 5) && close(p2.verts[0][1], 0), `段2 首点 = 断点 [5,0] (实际 ${p2.verts[0]})`);
ok(p1.closed === false && p2.closed === false, '两段都系开放');

// T2 断喺顶点 [10,0]（U 落喺段界）→ 仍切成 2 段（顶点处打断合法，非端点）
const r2 = splitPathAt(openP, [], [10,0], TOL);
ok(r2 && r2.parts.length === 2, `内部顶点打断 → 2 段 (实际 ${r2?.parts?.length})`);

// T3 断喺端点 [0,0] → null（端点打断无意义）
const r3 = splitPathAt(openP, [], [0,0], TOL);
ok(r3 === null, '端点打断 → null');

// T4 click 远离 → null
ok(splitPathAt(openP, [], [100,100], TOL) === null, '远离 → null');

// T5 闭合方形 [[0,0],[10,0],[10,10],[0,10]] 喺 [5,0] 打断 → 1 条开放路径（绕一圈）
const sq = { verts: [[0,0],[10,0],[10,10],[0,10]], bulges: [0,0,0,0], closed: true };
const r5 = splitPathAt(sq, [], [5,0], TOL);
ok(r5 && r5.parts.length === 1 && r5.parts[0].closed === false, `闭合方形打断 → 1 开放路径 (实际 ${r5?.parts?.length}, closed=${r5?.parts?.[0]?.closed})`);
// 开放路径首尾都 = 断点 [5,0]（绕一圈）
const op = r5.parts[0];
ok(close(op.verts[0][0],5) && close(op.verts[0][1],0) && close(op.verts[op.verts.length-1][0],5) && close(op.verts[op.verts.length-1][1],0), `开放路径首尾 = 断点 [5,0] (首 ${op.verts[0]} 尾 ${op.verts[op.verts.length-1]})`);

// T6 退化 target (<2 顶点) → null
ok(splitPathAt({ verts: [[0,0]], bulges: [], closed: false }, [], [0,0], TOL) === null, '单点 target → null');

// T7 交点吸附：开放折线 + 一条 cutter 穿过 [10,0] 附近 → 断点吸到精确交点
const cutter = { verts: [[10,-5],[10,5]], bulges: [0], closed: false };   // 竖线穿 x=10 (过顶点 [10,0])
const r7 = splitPathAt(openP, [cutter], [9.6, 0.3], TOL);   // click 近 [10,0] 交点
ok(r7 && r7.parts.length === 2, `交点附近打断 → 2 段 (实际 ${r7?.parts?.length})`);

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
