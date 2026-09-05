// section-depth.test.mjs — S186 截面属性嵌套深度奇偶分类（多体/嵌套岛 + 默认字节兼容）
// 跑：cd C:\ClaudeCode\webcad && npx -y tsx tests/section-depth.test.mjs
import { sectionProps } from '../src/cad/sectionProps.ts';
import { classifyLoops } from '../src/geom/slicePreview.ts';

let fail = 0; const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fail++; };
// 中心 (cx,cy) 边长 s 嘅方 loop（首尾隐式闭合）
const sq = (cx, cy, s) => { const h = s / 2; return [[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h], [cx - h, cy + h]]; };
// depth-parity 调用（同 store 两个 reducer）：classifyLoops → signs → sectionProps(loops, signs)
const props = (loops) => { const cls = classifyLoops(loops); const signs = cls.depth.map((d) => (d % 2 === 0 ? 1 : -1)); return { r: sectionProps(loops, signs), cls, signs }; };

// ---- 深度分类正确性 ----
ok(Math.abs(props([sq(0, 0, 10)]).r.area - 100) === 0, `单方 area=100 (实际 ${props([sq(0,0,10)]).r.area})`);
const two = props([sq(-20, 0, 10), sq(20, 0, 10)]);
ok(Math.abs(two.r.area - 200) < 1e-9, `两分离方 area=200（旧码只算最大块=100）(实际 ${two.r.area})`);
ok(two.cls.depth.every((d) => d === 0), '两分离方都 depth 0（实体）');
const hole = props([sq(0, 0, 10), sq(0, 0, 6)]);
ok(Math.abs(hole.r.area - (100 - 36)) < 1e-9, `方带孔 area=64 (实际 ${hole.r.area})`);
const island = props([sq(0, 0, 10), sq(0, 0, 6), sq(0, 0, 2)]);
ok(Math.abs(island.r.area - (100 - 36 + 4)) < 1e-9, `嵌套岛（外10−孔6+岛2）area=68 (实际 ${island.r.area})`);
ok(island.cls.depth[0] === 0 && island.cls.depth[1] === 1 && island.cls.depth[2] === 2, '嵌套深度 [0,1,2]');

// ---- 默认（无 signs）= 旧 index-0 规则，逐字节兼容 ----
ok(Math.abs(sectionProps([sq(0, 0, 10), sq(0, 0, 6)]).area - 64) < 1e-9, '默认(无 signs) 方带孔 = 64（同旧）');
// 旧 bug 行为：两分离方默认会把第二个当孔减掉 → 0（证明默认路径字节不变）
ok(Math.abs(sectionProps([sq(-20, 0, 10), sq(20, 0, 10)]).area - 0) < 1e-9, '默认(无 signs) 两分离 → 0（旧 bug 行为，证默认未改）');

// ---- 周长不受 signs 影响（实体+孔边界全加）----
ok(Math.abs(hole.r.perimeter - (40 + 24)) < 1e-9, `方带孔周长=64（外40+孔24，实际 ${hole.r.perimeter}）`);

// ---- 绕向无关（顺/逆时针孔都正确扣）----
const cwHole = [...sq(0, 0, 6)].reverse();   // 顺时针孔
ok(Math.abs(props([sq(0, 0, 10), cwHole]).r.area - 64) < 1e-9, '顺时针孔一样正确扣（area=64）');

console.log(fail === 0 ? '\n全部通过' : `\n${fail} 项失败`);
process.exit(fail === 0 ? 0 : 1);
