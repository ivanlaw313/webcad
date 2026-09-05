// GM-γ2a: S2 布尔血统（boolean lineage）纯 helper —— OCCT 拓扑命名 keystone 第二块。
//
// 背景：S1（变换血统，cad.worker._s1CarryMids/_s1CarryFacePts）纯靠「刚体/缩放变换保拓扑枚举顺序」
//   跨变换追踪 pick（第 i 条边变换前后仍系第 i 条）；一撞到【非变换 op】（布尔/圆角/抽壳…）就 abort 退回
//   near-point（gate 3）。布尔正正系承重裂缝：cut 一个槽落个体附近 → 新棱冒出 → near-point 会跳去新棱、
//   指纹又因点云变形而漂 → 拾中嘅原棱「跳位/miss」。S2 用 OCCT 每-op 历史 API（Modified/Generated/IsDeleted，
//   被 BRepAlgoAPI 布尔 op 继承）真正把原棱穿过布尔追踪到结果体，补 S1 喺布尔区间 abort 嘅位。
//
// 本模块【纯 helper】：跑一次 raw BRepAlgoAPI builder（ctor/Build 依 tests/history-probe*.test.mjs 实证签名 —
//   7/7 PASS，现役自建内核 replicad_plus），逐条 tracked 输入子形状查 Modified()/Generated()/IsDeleted()，
//   返回后继子形状 + 佢哋嘅代表点（边=曲线中点 / 面=曲面质心，raw OCCT 直算 → worker 跨帧【几何配对】用，
//   免 raw 句柄跨函数寿命问题）。worker 集成见 cad.worker.ts（_s2CarryThroughBool，gate 3 布尔补位）。
//
// ⚠ 句柄寿命（HANDOFF 铁律：无主 raw _oc 句柄喺 emscripten 触发不透明内核错 9108520）：
//   · 所有中间生句柄（ProgressRange / builder / Modified·Generated 列表 / BRepAdaptor / GProp / gp_Pnt）
//     全经 r()=GCWithScope 管理（镜 cad.worker.ts:4158 historyProbe 同 replicad 内部 cut/fuse 同款 idiom）。
//   · 【返回】嘅 shape（mk.Shape() = builder 内 const-ref）同 out 子形状（列表 First/Last = 列表内 const-ref）
//     系 const-ref，唔可以自己 delete；靠返回对象上嘅 __scope=r 保住 r 唔被 GC → r 撑住 builder/列表存活 →
//     const-ref 一直有效。caller 掉弃返回值后 r 先可回收 → FinalizationRegistry 统一 .delete() → 零泄漏零崩。
//   · 故 caller 唔好 cast() 呢啲 const-ref 再任由 GC 删（会 double-free builder 内部）；worker 只用【outPts
//     纯数字】做跨帧配对（安全），raw out 仅供单元测 IsSame 自证（test 跑完即退，无 GC 竞态）。

import { GCWithScope } from 'replicad'

export type BoolKind = 'cut' | 'fuse' | 'intersect'
// GM-γ2b：圆角/倒角血统种类。fillet = BRepFilletAPI_MakeFillet；chamfer = BRepFilletAPI_MakeChamfer。
export type FilletKind = 'fillet' | 'chamfer'

// 一条 tracked 输入子形状穿过布尔嘅结果。
export interface BoolHistEntry {
  inIdx: number                          // 对应 tracked[inIdx]
  out: unknown[]                         // TopoDS[] 后继子形状（Modified ∪ Generated；unchanged 穿过 → 收 sub 自身，IsSame 命中结果体）
  outPts: [number, number, number][]     // out 平行代表点（边=曲线中点 / 面=曲面质心）— worker 跨帧几何配对用
  deleted: boolean                       // IsDeleted：该子形状被布尔消耗（无后继）→ 诚实 miss
  truncated: boolean                     // 多入口列表限制：Size>2，只读到 First/Last（TopTools_ListIterator 未绑定，中间入口不可达）
}

export interface BoolHistResult {
  shape: unknown                         // TopoDS 布尔结果体（const-ref into builder；由 __scope 撑活）
  map: BoolHistEntry[]                   // 与 tracked 平行同长
  done: boolean                          // builder.IsDone()
  __scope: unknown                       // 保命引用（keep GC scope alive while result held）— caller 唔使掂
}

// 布尔 ctor 名（依 history-probe 实证：_3 = (a, b, Message_ProgressRange_1())；逐个 fall back）
const BOOL_CTORS: Record<BoolKind, string[]> = {
  cut: ['BRepAlgoAPI_Cut_3', 'BRepAlgoAPI_Cut_2', 'BRepAlgoAPI_Cut_1', 'BRepAlgoAPI_Cut'],
  fuse: ['BRepAlgoAPI_Fuse_3', 'BRepAlgoAPI_Fuse_2', 'BRepAlgoAPI_Fuse_1', 'BRepAlgoAPI_Fuse'],
  intersect: ['BRepAlgoAPI_Common_3', 'BRepAlgoAPI_Common_2', 'BRepAlgoAPI_Common_1', 'BRepAlgoAPI_Common'],
}

const TOPABS_EDGE = 6   // TopAbs_ShapeEnum.TopAbs_EDGE（边=6 面=4）
const TOPABS_FACE = 4

// ShapeType() 喺现役 emscripten 绑定返【枚举包装对象】（有 .value = 数值），并非纯 number → 归一化取数值。
function shapeTypeNum(sub: any): number {
  try {
    const st = typeof sub.ShapeType === 'function' ? sub.ShapeType() : sub?.ShapeType
    if (st && typeof st === 'object' && typeof st.value === 'number') return st.value
    return typeof st === 'number' ? st : -1
  } catch { return -1 }
}

// 代表点（质心 CentreOfMass）：边 → LinearProperties；面 → SurfaceProperties。
//   ⚠ 关键：BRepGProp::LinearProperties/SurfaceProperties 收【base TopoDS_Shape&】→ 唔使 downcast，
//     故 Modified()/Generated() 列表返嘅 base TopoDS_Shape（非 TopoDS_Edge）都直接算得（BRepAdaptor_Curve
//     则要 TopoDS_Edge，会拒收列表 base shape → 弃用）。
//   直边质心 = 中点（配 worker edge.pointAt(0.5) 口径 d2≈0，实证 [-20,15,10]）；圆弧边质心略偏离曲线（弦内），
//     但仍系稳定唯一定位点 → worker 最近配对仍中该边（诚实小误差）。全经 r() 管理生句柄，只返纯 number。
function repPoint(oc: any, r: (h: any) => any, sub: any): [number, number, number] | null {
  try {
    if (!oc.GProp_GProps_1 || !oc.BRepGProp) return null
    const st = shapeTypeNum(sub)
    const g = r(new oc.GProp_GProps_1())
    if (st === TOPABS_EDGE) {
      const lp = oc.BRepGProp.LinearProperties_1 || oc.BRepGProp.LinearProperties
      if (!lp) return null
      lp(sub, g, false, false)
    } else if (st === TOPABS_FACE) {
      const sp = oc.BRepGProp.SurfaceProperties_1 || oc.BRepGProp.SurfaceProperties
      if (!sp) return null
      sp(sub, g, false, false)
    } else {
      return null
    }
    const c = r(g.CentreOfMass())
    return [c.X(), c.Y(), c.Z()]
  } catch { return null }
}

// 读一个 TopTools_ListOfShape：Size() + First()/Last()。TopTools_ListIteratorOfListOfShape 未绑定（见 ocProbe）→
//   只可靠读首末。Size>2 → 中间入口不可达（truncated 诚实标注）。返回可读到嘅子形状（const-ref into lst）。
function readList(lst: any): { shapes: any[]; truncated: boolean } {
  const shapes: any[] = []
  if (!lst) return { shapes, truncated: false }
  let size = 0
  try { size = typeof lst.Size === 'function' ? lst.Size() : (typeof lst.Extent === 'function' ? lst.Extent() : 0) } catch { size = 0 }
  if (size <= 0) return { shapes, truncated: false }
  try { const f = lst.First ? lst.First() : (lst.First_1 ? lst.First_1() : null); if (f && (typeof f.IsNull !== 'function' || !f.IsNull())) shapes.push(f) } catch { /* First 读唔到 → 跳 */ }
  if (size >= 2) { try { const l = lst.Last ? lst.Last() : (lst.Last_1 ? lst.Last_1() : null); if (l && (typeof l.IsNull !== 'function' || !l.IsNull())) shapes.push(l) } catch { /* Last 读唔到 → 跳 */ } }
  return { shapes, truncated: size > 2 }
}

// GM-γ2b：逐条 tracked 输入子形状查一个已 Build 完嘅 OCCT history builder（布尔 BRepAlgoAPI / 圆角倒角 BRepFilletAPI
//   共用同一套 Modified/Generated/IsDeleted 语义 — history-probe*.test.mjs 实证 fillet+chamfer 亦 work）→ 后继子形状 + 代表点。
//   抽出嚟畀 boolWithHistory / filletWithHistory 共用（行为逐字节一致，免两处漂移）。mk 已 Build+IsDone；r=当前 GCWithScope。
function histMapFor(oc: any, r: (h: any) => any, mk: any, tracked: any[]): BoolHistEntry[] {
  const map: BoolHistEntry[] = []
  for (let i = 0; i < tracked.length; i++) {
    const sub = tracked[i]
    const entry: BoolHistEntry = { inIdx: i, out: [], outPts: [], deleted: false, truncated: false }
    if (!sub) { map.push(entry); continue }

    try { if (typeof mk.IsDeleted === 'function') entry.deleted = !!mk.IsDeleted(sub) } catch { /* IsDeleted 读唔到 → 当未删 */ }

    if (typeof mk.Modified === 'function') {
      try { const rd = readList(r(mk.Modified(sub))); for (const s of rd.shapes) entry.out.push(s); if (rd.truncated) entry.truncated = true } catch { /* Modified 读唔到 → 跳 */ }
    }
    if (typeof mk.Generated === 'function') {
      try { const rd = readList(r(mk.Generated(sub))); for (const s of rd.shapes) entry.out.push(s); if (rd.truncated) entry.truncated = true } catch { /* Generated 读唔到 → 跳 */ }
    }
    // unchanged 穿过：未删 + 无 Modified/Generated → 子形状原样存喺结果体（同一 TShape）→ 收 sub 自身（IsSame 命中结果体）
    if (!entry.deleted && entry.out.length === 0) entry.out.push(sub)

    for (const s of entry.out) { const p = repPoint(oc, r, s); if (p) entry.outPts.push(p) }
    map.push(entry)
  }
  return map
}

// boolWithHistory：跑 raw 布尔 builder（依 probe 签名），逐条 tracked 输入子形状查历史 → 后继 + 代表点。
//   oc      : 原始 OC 句柄（worker 传 _oc / test 传 setOC 嗰个 OC）
//   kind    : 'cut' | 'fuse' | 'intersect'
//   a       : TopoDS base（布尔左操作数 — pre-op 帧全形，tracked 系佢嘅子形状）
//   b       : TopoDS tool（布尔右操作数 — 工具体）
//   tracked : TopoDS[] 要追踪穿过布尔嘅输入子形状（边/面）
// 返回 null：oc/操作数缺、ctor 全绑唔到、Build 后 IsDone=false、结果体 null。任何一条 → caller 诚实退回今日 fallback。
export function boolWithHistory(oc: any, kind: BoolKind, a: any, b: any, tracked: any[]): BoolHistResult | null {
  if (!oc || !a || !b) return null
  const r = GCWithScope()

  let Ctor: any = null
  for (const nm of BOOL_CTORS[kind]) { if (typeof oc[nm] === 'function') { Ctor = oc[nm]; break } }
  if (!Ctor) return null

  const prog = () => (oc.Message_ProgressRange_1 ? r(new oc.Message_ProgressRange_1()) : undefined)
  let mk: any = null
  try { mk = r(new Ctor(a, b, prog())) } catch {
    try { mk = r(new Ctor(a, b)) } catch { return null }
  }
  if (!mk) return null

  // Build（带 ProgressRange → 无参 fall back，镜 probe）
  try {
    try { mk.Build(prog()) } catch { if (typeof mk.Build === 'function') mk.Build() }
  } catch { return null }

  const done = typeof mk.IsDone === 'function' ? !!mk.IsDone() : true
  if (!done) return null

  const shape = typeof mk.Shape === 'function' ? mk.Shape() : null   // const-ref into mk（__scope 撑活）
  if (!shape || (typeof shape.IsNull === 'function' && shape.IsNull())) return null

  const map = histMapFor(oc, r, mk, tracked)
  return { shape, map, done, __scope: r }
}

// GM-γ2b：圆角/倒角血统 —— 镜 boolWithHistory，改用 BRepFilletAPI_MakeFillet / BRepFilletAPI_MakeChamfer（现役自建内核
//   replicad_plus 实证：fillet ctor = MakeFillet(shape, ChFi3d_FilletShape)【2 参必需】；chamfer ctor = MakeChamfer(shape)【1 参】；
//   两者 Add_2(半径/距离, edge) 加棱、Build(prog)、IsDone、Modified/Generated/IsDeleted 全 work，filleted 棱 IsDeleted=true、
//   相邻面 Modified→trimmed 新面。见 tests/lineage-s2b.test.mjs 验收）。
//   oc      : 原始 OC 句柄
//   kind    : 'fillet' | 'chamfer'
//   shape   : TopoDS base（pre-op 帧全形，tracked + edges 全系佢嘅子形状）
//   edges   : 要圆/倒嘅棱 + 半径/距离（worker 由 _filletOpAt 录低嘅 mids 落 prior 几何解析而得）
//   tracked : TopoDS[] 要追踪穿过圆角嘅输入子形状（边/面）
// 返回 null：oc/shape/edges 缺、ctor 全绑唔到、无棱加得成、Build 后 IsDone=false、结果体 null。任何一条 → caller 诚实退回近点 fallback。
export function filletWithHistory(oc: any, kind: FilletKind, shape: any, edges: { edge: any; radius: number }[], tracked: any[]): BoolHistResult | null {
  if (!oc || !shape || !edges || !edges.length) return null
  const r = GCWithScope()

  // ── ctor（依 probe：fillet 必带 ChFi3d 第二参；chamfer 单参；逐个 fall back，每个再试带/唔带枚举）──
  let mk: any = null
  if (kind === 'fillet') {
    const filShape = (oc.ChFi3d_FilletShape && (oc.ChFi3d_FilletShape.ChFi3d_Rational ?? 0)) ?? 0
    for (const nm of ['BRepFilletAPI_MakeFillet_2', 'BRepFilletAPI_MakeFillet_1', 'BRepFilletAPI_MakeFillet']) {
      const C = oc[nm]; if (typeof C !== 'function') continue
      try { mk = r(new C(shape, filShape)); break } catch { try { mk = r(new C(shape)); break } catch { /* next name */ } }
    }
  } else {
    for (const nm of ['BRepFilletAPI_MakeChamfer_2', 'BRepFilletAPI_MakeChamfer_1', 'BRepFilletAPI_MakeChamfer']) {
      const C = oc[nm]; if (typeof C !== 'function') continue
      try { mk = r(new C(shape)); break } catch { try { mk = r(new C(shape, undefined)); break } catch { /* next name */ } }
    }
  }
  if (!mk) return null

  // ── Add 棱（Add_2(半径/距离, edge) 实证；逐个 fall back）──
  let added = 0
  for (const { edge, radius } of edges) {
    if (!edge) continue
    const rad = Math.max(0.01, radius || 0.01)
    for (const am of ['Add_2', 'Add_1', 'Add']) {
      if (typeof mk[am] !== 'function') continue
      try { mk[am](rad, edge); added++; break } catch { /* next Add 变体 */ }
    }
  }
  if (!added) return null

  // ── Build（带 ProgressRange → 无参 fall back，镜 probe）──
  const prog = () => (oc.Message_ProgressRange_1 ? r(new oc.Message_ProgressRange_1()) : undefined)
  try {
    try { mk.Build(prog()) } catch { if (typeof mk.Build === 'function') mk.Build() }
  } catch { return null }

  const done = typeof mk.IsDone === 'function' ? !!mk.IsDone() : true
  if (!done) return null   // 半径太大/几何唔支持 → 诚实 null（caller 退回近点）

  const outShape = typeof mk.Shape === 'function' ? mk.Shape() : null   // const-ref into mk（__scope 撑活）
  if (!outShape || (typeof outShape.IsNull === 'function' && outShape.IsNull())) return null

  const map = histMapFor(oc, r, mk, tracked)
  return { shape: outShape, map, done, __scope: r }
}

// GM-γ2b：多跳血统 —— 纯组合器（无 OCCT，纯数组走位；worker + 单元测共用同一逻辑）。由 walk-back 撞到嘅第一个
//   非变换 recorded op `b`（最新一跳）向前收集【全部只由变换 op 相隔嘅连续 recorded op】索引（最新在先）。
//   isRecorded(i) = 该格系咪录低咗嘅 boolean/fillet；isTransform(i) = 该格系咪拓扑保序变换。
//   返回 { ops: 最新在先嘅 recorded 索引; capped }：capped=true 表示链长会超 maxLen（≥maxLen 仲有再前一个 recorded op）
//   → caller 诚实出上限提示 + 退回近点（唔硬追唔可靠嘅超长链）。b 本身唔系 recorded → null。
export function collectLineageChain(
  b: number,
  isRecorded: (i: number) => boolean,
  isTransform: (i: number) => boolean,
  maxLen = 4,
): { ops: number[]; capped: boolean } | null {
  if (!isRecorded(b)) return null
  const ops = [b]              // 最新在先
  let earliest = b
  for (;;) {
    let p = earliest - 1
    while (p >= 0 && isTransform(p)) p--   // 跳过纯变换区间
    if (p < 0) break                        // 到头 → 喺 earliest−1（root prior）解析
    if (!isRecorded(p)) break               // 前一个非变换 op 唔系 recorded → 链到此为止
    if (ops.length >= maxLen) return { ops, capped: true }   // 已够 maxLen 仲有再前一跳 → 超上限
    ops.push(p)
    earliest = p
  }
  return { ops, capped: false }
}
