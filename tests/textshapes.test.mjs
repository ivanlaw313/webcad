// textshapes.test.mjs — 草图文字轮廓（Sketch Text，roadmap #5）数值验证
//   src/sketch/textShapes.ts: textToSketchShapes / classifyTextRings
//
// 对标 Fusion 草图 Text：文字 → 草图平面闭合字形轮廓（poly SketchShape），可拉伸/切割/雕刻。
//
// 跑法（喺 C:\ClaudeCode\webcad 目录执行）：
//   npx -y tsx tests/textshapes.test.mjs
// 全部测试通过 → exit 0；任一失败 → exit 1。
//
// 字体注入说明：项目自带嘅 CC0 kenpixel.ttf 系【像素字体】，字形系唔嵌套嘅实心条砌出嚟（even-odd
// 数出零孔），无法验证「A 内孔」。而 opentype.js 系 replicad 嘅【私有】依赖（pnpm 严格隔离，顶层
// import 唔到）。所以本测试用一个【合成 provider】喂入同 opentype 一致格式嘅字形命令（y 已翻负、随
// fontSize 线性缩放、含真嵌套 counter + 真贝塞尔曲线段），老实行勻 textToSketchShapes 嘅完整离散 +
// 偶奇判孔 + 对齐 + 缩放 + NaN 守卫逻辑。app 入面接线时换成 replicad getFont('cad')（真 kenpixel）。

import { textToSketchShapes, classifyTextRings } from '../src/sketch/textShapes.ts';

// ------------------------------------------------------------------ 小框架
const rows = [];
function test(name, fn) {
  const t0 = Date.now();
  try {
    const detail = fn() ?? '';
    rows.push({ name, pass: true, ms: Date.now() - t0, detail });
    console.log(`PASS ${name} (${Date.now() - t0}ms) ${detail}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    rows.push({ name, pass: false, ms: Date.now() - t0, detail: msg });
    console.log(`FAIL ${name} (${Date.now() - t0}ms) ${msg}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }
function fmt(x, d = 3) { return Number(x).toFixed(d); }

// ------------------------------------------------------------------ 合成字形 provider
//
// 命令系【字体坐标】：opentype Font.getPath 已把 y 翻负（屏幕 y 向下）→ 基线以上嘅笔画 y 系负数。
// textToSketchShapes 内部 toMath 会翻返正令 y 向上。每只字 advance = ADV（em 单位）。
// 'A' = 外三角轮廓 + 内嵌套三角孔（真 counter）；'B' = 外框（含一段二次贝塞尔曲右肚）+ 一个内孔；
// ' '（空格）= 无命令（纯 advance）。坐标定义喺 1 单位 em，getPath(_, _, _, size) 时乘 size。
const ADV = 0.75;   // 每字 advance（em）—— 字宽 0.6 + 字距 0.15
// em 模板（y 系字体系：基线 0，向上为负）。
const GLYPH_EM = {
  A: {
    // 外轮廓：底宽 0.6、顶尖嘅三角（顺时针闭合）。
    outer: [[0, 0], [0.6, 0], [0.3, -0.7]],
    // 内孔：细一圈三角（counter）—— 嵌喺 outer 入面。
    hole: [[0.18, -0.12], [0.42, -0.12], [0.3, -0.45]],
  },
  B: {
    // 外轮廓：矩形左直 + 右边一段二次贝塞尔凸肚（Q 命令验离散）。
    outerCmds: [
      { type: 'M', x: 0.0, y: 0.0 },
      { type: 'L', x: 0.0, y: -0.7 },
      { type: 'L', x: 0.4, y: -0.7 },
      { type: 'Q', x: 0.4, y: 0.0, x1: 0.7, y1: -0.35 },  // 右肚二次贝塞尔
      { type: 'Z' },
    ],
    // 内孔：矩形 counter。
    hole: [[0.12, -0.15], [0.32, -0.15], [0.32, -0.55], [0.12, -0.55]],
  },
};
function glyphCommands(ch, emX, size) {
  // 把 em 模板按 size 缩放、平移到 emX*size（x），返 opentype 风格命令（y 翻负已喺模板入面）。
  const S = (v) => v * size;
  const ringToCmds = (ring) => {
    const out = [{ type: 'M', x: S(ring[0][0]) + emX * size, y: S(ring[0][1]) }];
    for (let i = 1; i < ring.length; i++) out.push({ type: 'L', x: S(ring[i][0]) + emX * size, y: S(ring[i][1]) });
    out.push({ type: 'Z' });
    return out;
  };
  if (ch === 'A') {
    const g = GLYPH_EM.A;
    return [...ringToCmds(g.outer), ...ringToCmds(g.hole)];
  }
  if (ch === 'B') {
    const g = GLYPH_EM.B;
    const oc = g.outerCmds.map((c) => {
      const m = { ...c };
      if (m.x != null) m.x = S(m.x) + emX * size;
      if (m.y != null) m.y = S(m.y);
      if (m.x1 != null) m.x1 = S(m.x1) + emX * size;
      if (m.y1 != null) m.y1 = S(m.y1);
      return m;
    });
    return [...oc, ...ringToCmds(g.hole)];
  }
  return []; // 空格 / 未知 = 无几何（只 advance）
}
// provider：模拟 opentype font.getPath(text, 0, 0, size).commands —— 逐字累进 advance。
function makeProvider() {
  return (text, size) => {
    const cmds = [];
    let pen = 0;
    for (const ch of text) {
      for (const c of glyphCommands(ch, pen, size)) cmds.push(c);
      pen += ADV;  // advance（em）
    }
    return cmds;
  };
}
const provider = makeProvider();

// bbox 工具（poly SketchShape[]）。
function bboxOf(shapes) {
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
  for (const s of shapes) for (const p of s.pts) {
    if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
    if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
  }
  return { minx, maxx, miny, maxy, w: maxx - minx, h: maxy - miny };
}
function signedArea(lp) {
  let s = 0;
  for (let i = 0, j = lp.length - 1; i < lp.length; j = i++) s += lp[j][0] * lp[i][1] - lp[i][0] * lp[j][1];
  return s / 2;
}

// ================================================================== T1
test('T1 "AB" → ≥2 外轮廓 + A 有 1 内孔，全闭合非退化', () => {
  const shapes = textToSketchShapes('AB', { size: 10, pos: [0, 0], provider });
  // A: outer+hole=2；B: outer+hole=2 → 共 4 个 poly。
  assert(shapes.length >= 3, `poly 数 ${shapes.length} < 3（A/B 外轮廓 + 孔）`);
  for (const s of shapes) {
    assert(s.type === 'poly', `非 poly 形状：${s.type}`);
    assert(Array.isArray(s.pts) && s.pts.length >= 3, `点数 ${s.pts?.length} < 3`);
    assert(Math.abs(signedArea(s.pts)) > 1e-6, '退化轮廓（面积≈0）');
    // 闭合 = 隐式（pts 唔含重复尾点）；验首尾唔重复（poly 约定）。
    const a = s.pts[0], b = s.pts[s.pts.length - 1];
    assert(Math.abs(a[0] - b[0]) > 1e-7 || Math.abs(a[1] - b[1]) > 1e-7, 'poly 尾点重复了首点（应隐式闭合）');
  }
  const { outer, holes } = classifyTextRings(shapes);
  assert(outer.length >= 2, `外轮廓数 ${outer.length} < 2（A、B 各一）`);
  assert(holes.length >= 1, `内孔数 ${holes.length} < 1（A 应有 1 个 counter 孔）`);
  return `polys=${shapes.length} outer=${outer.length} holes=${holes.length}`;
});

// ================================================================== T2
test('T2 字宽随 size 线性缩放（×2 → bbox 宽 ×2）', () => {
  const a = bboxOf(textToSketchShapes('AB', { size: 10, pos: [0, 0], provider }));
  const b = bboxOf(textToSketchShapes('AB', { size: 20, pos: [0, 0], provider }));
  const ratio = b.w / a.w;
  assert(Math.abs(ratio - 2) < 0.02, `宽度比 ${fmt(ratio, 4)} ≠ 2（size 应线性缩放）`);
  // 高度亦应 ×2。
  const hr = b.h / a.h;
  assert(Math.abs(hr - 2) < 0.02, `高度比 ${fmt(hr, 4)} ≠ 2`);
  return `w@10=${fmt(a.w, 3)} w@20=${fmt(b.w, 3)} 宽比=${fmt(ratio, 4)} 高比=${fmt(hr, 4)}`;
});

// ================================================================== T3
test('T3 align:center 令整体 bbox 关于 pos.x 对称', () => {
  const px = 37.5;
  const c = bboxOf(textToSketchShapes('AB', { size: 12, pos: [px, 0], align: 'center', provider }));
  const mid = (c.minx + c.maxx) / 2;
  assert(Math.abs(mid - px) < 1e-6, `中心 x=${fmt(mid, 4)} ≠ pos.x=${px}（应居中对称）`);
  // 对照：align:left 时 minx 应 ≈ pos.x（基线左端起）。
  const l = bboxOf(textToSketchShapes('AB', { size: 12, pos: [px, 0], align: 'left', provider }));
  assert(Math.abs(l.minx - px) < 1e-6, `left 模式 minx=${fmt(l.minx, 4)} ≠ pos.x=${px}`);
  return `center: mid=${fmt(mid, 4)}(=pos.x ${px}) | left: minx=${fmt(l.minx, 4)}`;
});

// ================================================================== T4
test('T4 所有点有限（NaN/Inf 守卫）+ y 基线对齐 pos.y', () => {
  const py = -5;
  const shapes = textToSketchShapes('AB', { size: 8, pos: [3, py], provider });
  let n = 0;
  for (const s of shapes) for (const p of s.pts) {
    assert(Number.isFinite(p[0]) && Number.isFinite(p[1]), `非有限点 [${p[0]}, ${p[1]}]`);
    n++;
  }
  // y 向上：基线 = pos.y，笔画喺基线之上 → maxy > py、miny ≈ py（外轮廓底边贴基线）。
  const bb = bboxOf(shapes);
  assert(bb.maxy > py, `maxy=${fmt(bb.maxy, 3)} 应 > 基线 pos.y=${py}（笔画在基线上方）`);
  assert(Math.abs(bb.miny - py) < 1e-6, `miny=${fmt(bb.miny, 3)} 应 ≈ 基线 pos.y=${py}`);
  return `点数=${n} 全有限；bbox.y=[${fmt(bb.miny, 2)}, ${fmt(bb.maxy, 2)}] 基线=${py}`;
});

// ================================================================== T5
test('T5 贝塞尔曲线段被密铺成折线（B 右肚 Q 段点数充足）', () => {
  // 单独画 B：外轮廓含一段 Q 曲线，离散后外轮廓点数应明显 > 4（纯直线角点）。
  const shapes = textToSketchShapes('B', { size: 20, pos: [0, 0], provider });
  const { outer } = classifyTextRings(shapes);
  assert(outer.length >= 1, '未识别 B 外轮廓');
  const maxPts = Math.max(...outer.map((s) => s.pts.length));
  assert(maxPts >= 8, `外轮廓最大点数 ${maxPts} < 8（Q 曲线应被密铺）`);
  return `B 外轮廓最大点数=${maxPts}（含 Q 曲线密铺）`;
});

// ================================================================== T6
test('T6 守卫：非法 size 抛错；空串 / 空格返 []', () => {
  let threw = false;
  try { textToSketchShapes('A', { size: 0, pos: [0, 0], provider }); } catch { threw = true; }
  assert(threw, 'size=0 应抛错');
  threw = false;
  try { textToSketchShapes('A', { size: NaN, pos: [0, 0], provider }); } catch { threw = true; }
  assert(threw, 'size=NaN 应抛错');
  const empty = textToSketchShapes('', { size: 10, pos: [0, 0], provider });
  assert(Array.isArray(empty) && empty.length === 0, '空串应返 []');
  const spaces = textToSketchShapes('   ', { size: 10, pos: [0, 0], provider });
  assert(Array.isArray(spaces) && spaces.length === 0, '纯空格应返 []（无几何）');
  return `size=0/NaN 抛错；空串/空格→[]`;
});

// ================================================================== 结果
console.log('\n================ 结果一览 ================');
let nFail = 0;
for (const r of rows) {
  if (!r.pass) nFail++;
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  (${r.ms}ms)`);
  if (r.detail) console.log(`        ${r.detail}`);
}
console.log(`==========================================`);
console.log(`${rows.length - nFail}/${rows.length} 通过${nFail ? `，${nFail} 个失败` : ''}`);
process.exit(nFail ? 1 : 0);
