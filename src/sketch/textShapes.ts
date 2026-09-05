// textShapes.ts — 草图文字轮廓（Sketch Text，roadmap #5）几何核心
//
// 对标 Fusion 草图 Text 工具：把一串文字变成草图平面上嘅【闭合字形轮廓】（一堆 poly SketchShape），
// 之后可同任何手画轮廓一样拉伸 / 切割 / 雕刻。
//
// 字体来源：复用同 3D「文字 / 雕刻」特征【一模一样】嘅 CC0 字体 —— src/fonts/kenpixel.ttf
// （Kenney Fonts, CC0 公共领域），由 replicad 嘅 loadFont('cad') 喺 worker / 主线程加载、opentype.js
// 解析。本模块【唔】直接 import replicad / opentype.js（pnpm 严格隔离，opentype 系 replicad 嘅私有
// 依赖，顶层 import 唔到；而且 import replicad 会拖埋 OCCT WASM 内核，测试冇得离线跑）。
// 所以采【依赖注入】：调用方传入「字形路径命令」provider —— 同 replicad textBlueprints 内部一样，
// 攞 opentype Font.getPath(text, x, y, size).commands。咁就：零新依赖、零新字体、纯几何、可离线测。
//
// 孔（A/B/D/O/P/Q/R 嘅内圈）约定：跟足项目既有「偶奇规则」（src/geom/slicePreview.ts pointInSolid /
// store.ts extrudeFeatsFromShapes「same even-odd hole nesting」）—— 每个字形轮廓环 = 一个独立闭合
// poly SketchShape，唔配对 outer↔hole；拉伸时被【奇数】个环包住嘅区域自动抠走 = 孔。所以本模块只需
// 老实把【每个】contour 离散成一个闭合 poly 返出去，孔由下游 even-odd 机制处理，同多轮廓草图同一真相。
//
// 注：项目自带嘅 kenpixel 系【像素字体】—— 字形系一堆【唔互相嵌套】嘅实心条/方块砌出嚟（'A' 嘅
// 中空、'O' 嘅圈都系靠条之间嘅空隙，唔系真嵌套内环）。所以用呢只字体本身，even-odd 数出嚟系【零孔】。
// 本模块嘅孔逻辑对【任何】真矢量字体（嵌套 counter）都啱；要真孔请换一只矢量 CC0/OFL 字体（见文末建议）。

import type { Pt, SketchShape } from '../store'

// opentype.js PathCommand 嘅最小子集（鸭子类型 —— 唔 import opentype，只复制形状）。
// y 系【字体坐标】：opentype Font.getPath 已经把 y 翻负（屏幕系 y 向下），所以呢度 y 多数系负数，
// 代表基线以上嘅笔画。本模块统一【翻返正】（toMath）令输出系数学系 y 向上、基线 = pos.y。
export type GlyphCommand =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'Q'; x: number; y: number; x1: number; y1: number }
  | { type: 'C'; x: number; y: number; x1: number; y1: number; x2: number; y2: number }
  | { type: 'Z' }

// 鸭子类型嘅 opentype Font（只用到 getPath）。调用方喺 app 传 replicad getFont('cad')。
export interface GlyphFontLike {
  getPath(text: string, x: number, y: number, fontSize: number, options?: unknown): { commands: GlyphCommand[] }
}

// 命令 provider：俾文字 + 字号 → 全串字形路径命令（已含字距 / advance / kerning，由字体引擎排版）。
// 同 replicad textBlueprints 嘅 font.getPath(text, -startX, -startY, fontSize) 同一来源。
export type GlyphCommandProvider = (text: string, fontSize: number) => GlyphCommand[]

export interface TextToShapesOpts {
  size: number                       // 字高（em 高 → mm），同 3D text 特征嘅 fontSize 语义一致
  pos: [number, number]              // 草图平面坐标：基线左端（align:'left'）或基线中点（align:'center'）
  spacing?: number                   // 额外【附加】字距（mm，加喺字体自身 advance 之上；负 = 收紧），默认 0
  align?: 'left' | 'center'          // 'left'（默认）= pos 系左基线起点；'center' = 整体 bbox 关于 pos.x 对称
  curveTol?: number                  // 曲线离散弦高容差（mm，越细折线越密），默认 size 嘅 2%（封顶 [0.05, 0.6]）
  font?: GlyphFontLike               // 直接传 opentype/replicad Font（内部转成 provider）
  provider?: GlyphCommandProvider    // 或直接传命令 provider（测试 / 自定义排版用）
}

// ── 小工具 ─────────────────────────────────────────────────────────────────

const isFin = (n: number): boolean => Number.isFinite(n)

// 字体坐标 → 数学坐标 + 缩放到 pos：opentype y 已翻负，呢度再翻返正令 y 向上。
// （x, y 已经系 getPath 出嚟嘅【mm 尺度】值，因为我哋直接用 size 做 fontSize 去 getPath。）
const toMath = (x: number, y: number, ox: number, oy: number): Pt => [x + ox, -y + oy]

// 二次贝塞尔 p0→(c)→p1：按弦高容差自适应密度离散（唔含起点，含终点）。
function tessQuad(p0: Pt, c: Pt, p1: Pt, tol: number, out: Pt[]): void {
  // 段数估计：用控制多边形长度 / 容差，封顶喺 [2, 48]。
  const chord = Math.hypot(p1[0] - p0[0], p1[1] - p0[1])
  const poly = Math.hypot(c[0] - p0[0], c[1] - p0[1]) + Math.hypot(p1[0] - c[0], p1[1] - c[1])
  const n = Math.max(2, Math.min(48, Math.ceil((poly + chord) / Math.max(tol * 8, 1e-6))))
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t
    out.push([u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]])
  }
}

// 三次贝塞尔 p0→(c1,c2)→p1：同上自适应离散。
function tessCubic(p0: Pt, c1: Pt, c2: Pt, p1: Pt, tol: number, out: Pt[]): void {
  const poly = Math.hypot(c1[0] - p0[0], c1[1] - p0[1]) + Math.hypot(c2[0] - c1[0], c2[1] - c1[1]) + Math.hypot(p1[0] - c2[0], p1[1] - c2[1])
  const n = Math.max(2, Math.min(64, Math.ceil(poly / Math.max(tol * 8, 1e-6))))
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t
    const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t
    out.push([a * p0[0] + b * c1[0] + d * c2[0] + e * p1[0], a * p0[1] + b * c1[1] + d * c2[1] + e * p1[1]])
  }
}

// 鞋带有符号面积（同 slicePreview.signedArea）—— 退化判定用。
function signedArea(loop: Pt[]): number {
  let s = 0
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) s += loop[j][0] * loop[i][1] - loop[i][0] * loop[j][1]
  return s / 2
}

// 去尾点重复（闭合环唔需要尾点 == 首点；poly SketchShape 隐式闭合）+ 相邻重复点。
function dedupeClose(loop: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of loop) {
    const last = out[out.length - 1]
    if (!last || Math.abs(p[0] - last[0]) > 1e-7 || Math.abs(p[1] - last[1]) > 1e-7) out.push(p)
  }
  // 闭合环：首尾若重合，删尾
  if (out.length >= 2) {
    const a = out[0], b = out[out.length - 1]
    if (Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7) out.pop()
  }
  return out
}

// ── 命令串 → 一堆闭合 loop（数学坐标，已缩放 / 平移）──────────────────────────
// 每遇 'M' 开一个新 contour；'Z' 或下一个 'M' 收口。返回每个 contour 嘅折线点。
function commandsToLoops(cmds: GlyphCommand[], ox: number, oy: number, tol: number): Pt[][] {
  const loops: Pt[][] = []
  let cur: Pt[] | null = null
  let pen: Pt = [0, 0]
  const flush = () => { if (cur) { const c = dedupeClose(cur); if (c.length >= 3) loops.push(c); cur = null } }
  for (const cmd of cmds) {
    if (cmd.type === 'M') {
      flush()
      pen = toMath(cmd.x, cmd.y, ox, oy)
      cur = [pen]
    } else if (cmd.type === 'L') {
      if (!cur) continue
      pen = toMath(cmd.x, cmd.y, ox, oy)
      cur.push(pen)
    } else if (cmd.type === 'Q') {
      if (!cur) continue
      const c = toMath(cmd.x1, cmd.y1, ox, oy)
      const p1 = toMath(cmd.x, cmd.y, ox, oy)
      tessQuad(pen, c, p1, tol, cur)
      pen = p1
    } else if (cmd.type === 'C') {
      if (!cur) continue
      const c1 = toMath(cmd.x1, cmd.y1, ox, oy)
      const c2 = toMath(cmd.x2, cmd.y2, ox, oy)
      const p1 = toMath(cmd.x, cmd.y, ox, oy)
      tessCubic(pen, c1, c2, p1, tol, cur)
      pen = p1
    } else { // 'Z'
      flush()
    }
  }
  flush()
  return loops
}

// ── 主导出：文字 → 闭合 poly SketchShape[] ─────────────────────────────────
//
// 返回值：每个字形 contour = 一个 { type:'poly', pts:Pt[] } —— 隐式闭合（pts 唔含重复尾点），
// pts.length ≥ 3，方向保留字体原绕向（even-odd 判孔唔依赖绕向，所以唔强行规整）。
// 孔【唔】单独标记：被奇数个其他 poly 包住嘅环，下游拉伸用偶奇规则自动当孔抠走（项目既有约定）。
//
// 排版：x/y 字距、advance、kerning 全部由字体引擎（opentype getPath）负责，本模块只做几何离散。
// align:'center' = 量出全部 loop 嘅 bbox，整体平移令 bbox 中心 x == pos.x（y 仍以基线 = pos.y）。
export function textToSketchShapes(text: string, opts: TextToShapesOpts): SketchShape[] {
  const size = opts.size
  if (!isFin(size) || size <= 0) throw new Error(`textToSketchShapes: 非法字号 size=${size}`)
  if (!opts.pos || !isFin(opts.pos[0]) || !isFin(opts.pos[1])) throw new Error('textToSketchShapes: 非法 pos')
  if (!text) return []

  const provider: GlyphCommandProvider | undefined =
    opts.provider ?? (opts.font ? (t, s) => opts.font!.getPath(t, 0, 0, s).commands : undefined)
  if (!provider) throw new Error('textToSketchShapes: 需要 opts.font（opentype/replicad Font）或 opts.provider')

  const align = opts.align ?? 'left'
  const spacing = opts.spacing ?? 0
  // 曲线弦高容差：默认字号 2%，钳喺 [0.05, 0.6]mm —— 同 3D drawText 既有密度同档（够顺又唔爆点）。
  const tol = isFin(opts.curveTol as number) && (opts.curveTol as number) > 0
    ? (opts.curveTol as number)
    : Math.min(0.6, Math.max(0.05, size * 0.02))

  // 1) 攞字形命令（字距/advance/kerning 已由字体排版）。size 直接做 fontSize → 命令已系 mm 尺度。
  let cmds = provider(text, size)
  if (!Array.isArray(cmds)) cmds = []

  // 2) 额外字距 spacing：若有，逐字重排（字体 advance 之上每个字符再加 spacing 累进）。
  //    （冇 spacing 就一次过 getPath，保留字体原生 kerning —— 更准。）
  let loops: Pt[][]
  if (Math.abs(spacing) > 1e-9 && text.length > 1) {
    loops = []
    let cursorX = 0
    for (const ch of text) {
      const cc = provider(ch, size)
      // 量呢个字嘅 advance：用「字 + 占位」差值唔可靠，改用 bbox 右沿 + 一个名义字距；
      // 但最稳阵系直接攞单字命令嘅 x 范围做宽度，再加 size 嘅一成做字间默认 advance。
      const sub = commandsToLoops(Array.isArray(cc) ? cc : [], cursorX, 0, tol)
      for (const lp of sub) loops.push(lp)
      let maxx = -Infinity, minx = Infinity
      for (const lp of sub) for (const p of lp) { if (p[0] > maxx) maxx = p[0]; if (p[0] < minx) minx = p[0] }
      const w = maxx > minx ? (maxx - cursorX) : size * 0.5  // 空白字符（如空格）退化用半字宽
      cursorX += w + spacing + size * 0.08
    }
  } else {
    loops = commandsToLoops(cmds, 0, 0, tol)
  }

  // 3) bbox（对齐 + 平移到 pos）。
  let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity
  for (const lp of loops) for (const p of lp) {
    if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0]
    if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1]
  }
  if (!isFin(minx)) return []  // 全部退化 / 空（如纯空格）

  // align:'left' → 命令系由 x=0 基线起，直接平移到 pos；
  // align:'center' → 令 bbox 中心 x 落喺 pos.x（x 方向居中），y 仍以基线对齐到 pos.y。
  const cx = (minx + maxx) / 2
  const dx = align === 'center' ? opts.pos[0] - cx : opts.pos[0]
  const dy = opts.pos[1]

  // 4) 出 SketchShape：逐 loop 一个闭合 poly；丢退化（面积 ~0 / 点 < 3）。
  const shapes: SketchShape[] = []
  for (const lp of loops) {
    const pts: Pt[] = lp.map((p) => [p[0] + dx, p[1] + dy] as Pt)
    // NaN/Inf 守卫：任何点非有限 → 跳过呢个环（诚实唔出垃圾几何）。
    if (pts.length < 3 || pts.some((p) => !isFin(p[0]) || !isFin(p[1]))) continue
    if (Math.abs(signedArea(pts)) < 1e-9) continue
    shapes.push({ type: 'poly', pts })
  }
  return shapes
}

// 便利分组：把 textToSketchShapes 嘅扁平 poly 列表，按偶奇嵌套深度拆成 { outer, holes }。
// 唔系拉伸必需（拉伸行 even-odd 即可），但 UI 着色 / 选择「字形 vs 内孔」时有用。
// 规则同 slicePreview.classifyLoops：偶深 = 外轮廓，奇深 = 孔。
export function classifyTextRings(shapes: SketchShape[]): { outer: SketchShape[]; holes: SketchShape[] } {
  const polys = shapes.filter((s): s is Extract<SketchShape, { type: 'poly' }> => s.type === 'poly')
  const outer: SketchShape[] = []
  const holes: SketchShape[] = []
  const pinl = (x: number, y: number, lp: Pt[]): boolean => {
    let ins = false
    for (let i = 0, j = lp.length - 1; i < lp.length; j = i++) {
      const yi = lp[i][1], yj = lp[j][1]
      if ((yi > y) !== (yj > y) && x < ((lp[j][0] - lp[i][0]) * (y - yi)) / (yj - yi) + lp[i][0]) ins = !ins
    }
    return ins
  }
  // 代表点用环嘅【顶点 0】（照抄 slicePreview.classifyLoops / mill25d 既有约定）：顶点喺自己环
  // 边界上，唔会落入任何【被自己包住】嘅细环入面 —— 用质心反而会撞（外环质心可能跌入近中心嘅
  // counter，令外环被误判成孔）。除非两环顶点恰好相切重合，否则顶点法稳阵。
  for (let i = 0; i < polys.length; i++) {
    const lp = polys[i].pts
    const rx = lp[0][0], ry = lp[0][1]
    let depth = 0
    for (let j = 0; j < polys.length; j++) if (j !== i && pinl(rx, ry, polys[j].pts)) depth++
    if (depth % 2 === 0) outer.push(polys[i]); else holes.push(polys[i])
  }
  return { outer, holes }
}
