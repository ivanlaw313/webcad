// Wave X3（插入/INSERT）纯逻辑内核 —— 全 headless 可测（tests/insertx3.test.mjs）。
// 无 store / three / DOM 耦合：只做数据变换。字节兼容原则贯穿全篇 —— 新字段【默认值时省略】，
// 令旧存档照常 load、默认态存档逐字节等于本波前。
//
// 覆盖：
//   · 多张 Canvas 数据层（canvases[]）+ 逐张字段（displayThrough/selectable/renderable/scaleX/Y/zAngle/flipH/V）
//   · Canvas 四角/UV 几何（非等比 + 旋转 + 翻转）
//   · Decal 逐项字段（chainFaces/opacity/keepAspect/w/h/u/v/flipH/V）+ 投影盒尺寸 + UV 翻转
//   · SVG/DXF 导入轮廓 → 可编辑草图源（ImpProfile → SketchShape，重开判据 = 有 sketchId）
//   · Mesh 插入 单位换算 + flip-up（Y↔Z）+ 落地/居中偏移

// ── 类型（与 store 解耦：plane 用 string，arb 用裸数组）─────────────────────────────
export type ArbLike = { o: number[]; xd: number[]; n: number[] }
export type CanvasItem = {
  id: string
  url: string
  w: number            // 图宽 mm（高按图比例）
  cx: number; cy: number   // 中心（草图坐标）
  opacity: number
  plane: string        // 'XY' | 'XZ' | 'YZ'（复用 datum/面拾取的草图面）
  baseZ: number        // 沿面法向偏移
  arb?: ArbLike        // 斜面草图基（拾取任意平面面）
  // #3 逐张字段 —— 全 optional，默认省略（byte-compat）
  displayThrough?: boolean   // 穿透显示：关深度测试，永远画喺几何前
  selectable?: boolean       // 可被 raycast 拾取（默认 false = 描摹时点穿到草图面）
  renderable?: boolean       // true = 建模态也显示（Fusion 附着底图）；absent/false = 仅草图模式（旧快速描摹零回归）
  scaleX?: number            // 非等比 X 缩放（默认 1）
  scaleY?: number            // 非等比 Y 缩放（默认 1）
  zAngle?: number            // 绕面法向旋转（弧度，默认 0）
  flipH?: boolean            // 水平翻转（镜像 U）
  flipV?: boolean            // 垂直翻转（镜像 V）
  inArchive?: boolean        // 入存档（持久化 dataURL；默认 false = 会话级，避 payload 暴肥）
  name?: string
}
export type LegacyCanvasImg = { url: string; w: number; cx: number; cy: number; opacity: number } | null

// 旧 canvasImg 单值默认（与 store setCanvasImg 一致）
export const CANVAS_DEFAULT = { w: 100, cx: 0, cy: 0, opacity: 0.5 }

let _cvN = 0
export function nextCanvasId(existing: { id: string }[] = []): string {
  for (const c of existing) { const n = Number(String(c.id).replace(/^cv/, '')); if (Number.isFinite(n) && n > _cvN) _cvN = n }
  return 'cv' + (++_cvN)
}

// 新建一张 canvas（贴指定面）。overrides 覆盖默认。
export function makeCanvas(id: string, url: string, ref: { plane?: string; baseZ?: number; arb?: ArbLike }, overrides: Partial<CanvasItem> = {}): CanvasItem {
  const base: CanvasItem = {
    id, url,
    w: overrides.w ?? CANVAS_DEFAULT.w,
    cx: overrides.cx ?? CANVAS_DEFAULT.cx,
    cy: overrides.cy ?? CANVAS_DEFAULT.cy,
    opacity: overrides.opacity ?? CANVAS_DEFAULT.opacity,
    plane: ref.plane ?? 'XY',
    baseZ: ref.baseZ ?? 0,
  }
  if (ref.arb) base.arb = ref.arb
  // 逐张字段：只在非默认时写入
  const opt: (keyof CanvasItem)[] = ['displayThrough', 'selectable', 'renderable', 'scaleX', 'scaleY', 'zAngle', 'flipH', 'flipV', 'inArchive', 'name']
  for (const k of opt) if (overrides[k] !== undefined) (base as Record<string, unknown>)[k] = overrides[k]
  return base
}

// patch 一张 canvas（返回新数组）。清除到默认值的字段自动 delete（保持 byte-compat）。
const CANVAS_FIELD_DEFAULT: Record<string, unknown> = { displayThrough: false, selectable: false, renderable: false, scaleX: 1, scaleY: 1, zAngle: 0, flipH: false, flipV: false, inArchive: false }
export function patchCanvas(list: CanvasItem[], id: string, patch: Partial<CanvasItem>): CanvasItem[] {
  return list.map((c) => {
    if (c.id !== id) return c
    const next: CanvasItem = { ...c, ...patch }
    // 归一：等于默认值的 optional 字段删掉
    for (const k of Object.keys(CANVAS_FIELD_DEFAULT)) {
      if ((next as Record<string, unknown>)[k] === CANVAS_FIELD_DEFAULT[k]) delete (next as Record<string, unknown>)[k]
    }
    if (next.w !== undefined) next.w = Math.max(0.5, next.w)
    if (next.opacity !== undefined) next.opacity = Math.min(1, Math.max(0.05, next.opacity))
    if (next.name === '') delete next.name
    return next
  })
}

// 存档时只保留【入存档】的 canvas（保留 dataURL）；其余会话级不落盘。
export function archivedCanvases(list: CanvasItem[]): CanvasItem[] {
  return list.filter((c) => c.inArchive)
}

// 旧读数桥：活动 canvas → 旧 canvasImg 形状（令既有 sketch-bar / calibrate 无改动照跑）。
export function canvasToLegacyImg(list: CanvasItem[], activeId: string | null): LegacyCanvasImg {
  const c = list.find((x) => x.id === activeId) ?? null
  if (!c) return null
  return { url: c.url, w: c.w, cx: c.cx, cy: c.cy, opacity: c.opacity }
}

// 载入清洗：接受 d.canvases 数组，或把旧 canvasImg 单值迁移入 canvases[0]（byte-compat 迁移路径）。
export function sanitizeCanvases(v: unknown, legacyCanvasImg?: unknown): CanvasItem[] {
  const out: CanvasItem[] = []
  if (Array.isArray(v)) {
    for (const raw of v) {
      if (!raw || typeof raw !== 'object') continue
      const d = raw as Record<string, unknown>
      if (typeof d.url !== 'string' || !d.url) continue
      const id = typeof d.id === 'string' ? d.id : nextCanvasId(out)
      const plane = (d.plane === 'XZ' || d.plane === 'YZ') ? d.plane : 'XY'
      const c: CanvasItem = {
        id, url: d.url,
        w: Number.isFinite(d.w) ? Math.max(0.5, d.w as number) : CANVAS_DEFAULT.w,
        cx: Number.isFinite(d.cx) ? d.cx as number : 0,
        cy: Number.isFinite(d.cy) ? d.cy as number : 0,
        opacity: Number.isFinite(d.opacity) ? Math.min(1, Math.max(0.05, d.opacity as number)) : CANVAS_DEFAULT.opacity,
        plane, baseZ: Number.isFinite(d.baseZ) ? d.baseZ as number : 0,
      }
      if (d.arb && typeof d.arb === 'object') {
        const a = d.arb as ArbLike
        const ok3 = (x: unknown): x is number[] => Array.isArray(x) && x.length === 3 && x.every((v) => Number.isFinite(v))
        if (ok3(a.o) && ok3(a.xd) && ok3(a.n)) c.arb = { o: [a.o[0], a.o[1], a.o[2]], xd: [a.xd[0], a.xd[1], a.xd[2]], n: [a.n[0], a.n[1], a.n[2]] }
      }
      if (d.displayThrough === true) c.displayThrough = true
      if (d.selectable === true) c.selectable = true
      if (d.renderable === true) c.renderable = true
      if (Number.isFinite(d.scaleX) && (d.scaleX as number) !== 1) c.scaleX = d.scaleX as number
      if (Number.isFinite(d.scaleY) && (d.scaleY as number) !== 1) c.scaleY = d.scaleY as number
      if (Number.isFinite(d.zAngle) && (d.zAngle as number) !== 0) c.zAngle = d.zAngle as number
      if (d.flipH === true) c.flipH = true
      if (d.flipV === true) c.flipV = true
      if (d.inArchive === true) c.inArchive = true
      if (typeof d.name === 'string' && d.name) c.name = d.name
      out.push(c)
    }
    return out
  }
  // 迁移旧单值 canvasImg
  if (legacyCanvasImg && typeof legacyCanvasImg === 'object') {
    const d = legacyCanvasImg as Record<string, unknown>
    if (typeof d.url === 'string' && d.url) {
      out.push(makeCanvas(nextCanvasId(), d.url, { plane: 'XY', baseZ: 0 }, {
        w: Number.isFinite(d.w) ? d.w as number : CANVAS_DEFAULT.w,
        cx: Number.isFinite(d.cx) ? d.cx as number : 0,
        cy: Number.isFinite(d.cy) ? d.cy as number : 0,
        opacity: Number.isFinite(d.opacity) ? d.opacity as number : CANVAS_DEFAULT.opacity,
        inArchive: true,
      }))
    }
  }
  return out
}

// Canvas 四角（2D 面坐标）：非等比缩放 + 绕中心旋转 zAngle。角序 = 左下·右下·右上·左上（与 UV 对齐）。
export function canvasQuad(c: Pick<CanvasItem, 'w' | 'cx' | 'cy' | 'scaleX' | 'scaleY' | 'zAngle'>, aspect: number): [number, number][] {
  const w = Math.max(0.01, c.w) * Math.abs(c.scaleX ?? 1)
  const h = (Math.max(0.01, c.w) / Math.max(0.05, aspect)) * Math.abs(c.scaleY ?? 1)
  const hw = w / 2, hh = h / 2
  const base: [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]]
  const a = c.zAngle ?? 0, ca = Math.cos(a), sa = Math.sin(a)
  return base.map(([x, y]) => [c.cx + x * ca - y * sa, c.cy + x * sa + y * ca])
}

// Canvas UV（8 数 = 4 角 × uv），随 flipH/flipV 镜像。角序对齐 canvasQuad。
export function canvasUV(flipH?: boolean, flipV?: boolean): number[] {
  let uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]]
  if (flipH) uv = uv.map(([u, v]) => [1 - u, v])
  if (flipV) uv = uv.map(([u, v]) => [u, 1 - v])
  return uv.flat()
}

// ── Decal 逐项字段 ───────────────────────────────────────────────────────────────
export type DecalRaw = {
  id: string; url: string; p: [number, number, number]; n: [number, number, number]; size: number; rot: number
  chainFaces?: boolean; opacity?: number; keepAspect?: boolean
  w?: number; h?: number; u?: number; v?: number; flipH?: boolean; flipV?: boolean
}
// 逐项默认（清到默认自动省略）
const DECAL_FIELD_DEFAULT: Record<string, unknown> = { chainFaces: false, keepAspect: true, u: 0, v: 0, flipH: false, flipV: false }
// 抽出 decal 的非默认扩展字段（omit-on-default）—— 供 store sanitize/patch 复用，逐字段 byte-compat。
export function decalExtras(d: Partial<DecalRaw>): Partial<DecalRaw> {
  const out: Partial<DecalRaw> = {}
  if (d.chainFaces === true) out.chainFaces = true
  if (Number.isFinite(d.opacity) && (d.opacity as number) < 1) out.opacity = Math.min(1, Math.max(0.05, d.opacity as number))
  if (d.keepAspect === false) out.keepAspect = false
  if (Number.isFinite(d.w) && (d.w as number) > 0) out.w = Math.max(0.5, Math.min(500, d.w as number))
  if (Number.isFinite(d.h) && (d.h as number) > 0) out.h = Math.max(0.5, Math.min(500, d.h as number))
  if (Number.isFinite(d.u) && (d.u as number) !== 0) out.u = d.u as number
  if (Number.isFinite(d.v) && (d.v as number) !== 0) out.v = d.v as number
  if (d.flipH === true) out.flipH = true
  if (d.flipV === true) out.flipV = true
  return out
}
// patch decal 字段（清到默认自动删）。
export function patchDecalFields(d: DecalRaw, patch: Partial<DecalRaw>): DecalRaw {
  const next: DecalRaw = { ...d, ...patch }
  for (const k of Object.keys(DECAL_FIELD_DEFAULT)) if ((next as Record<string, unknown>)[k] === DECAL_FIELD_DEFAULT[k]) delete (next as Record<string, unknown>)[k]
  if (next.opacity !== undefined) { next.opacity = Math.min(1, Math.max(0.05, next.opacity)); if (next.opacity >= 1) delete next.opacity }
  if (next.w !== undefined) next.w = Math.max(0.5, Math.min(500, next.w))
  if (next.h !== undefined) next.h = Math.max(0.5, Math.min(500, next.h))
  // keepAspect：改 w 时按图比例联动 h（若提供 aspect）
  return next
}
// keepAspect 联动：改 w 时按 aspect 算 h（aspect = 图宽/高）。
export function decalLinkAspect(w: number, aspect: number): number { return Math.max(0.5, w / Math.max(0.05, aspect)) }

// Decal 投影盒尺寸（three DecalGeometry 用）。w/h 覆盖单 size；depth = 半个最大边（够穿透曲面）。
export function decalBox(d: Pick<DecalRaw, 'size' | 'w' | 'h'>): { w: number; h: number; depth: number } {
  const w = Math.max(0.5, d.w ?? d.size)
  const h = Math.max(0.5, d.h ?? d.size)
  return { w, h, depth: Math.max(2, Math.max(w, h) * 0.5) }
}
// 翻转 UV 数组（Float32/number[] 皆可）：flipH → u=1-u，flipV → v=1-v。返回新数组。
export function flipUVArray(uvs: ArrayLike<number>, flipH?: boolean, flipV?: boolean): number[] {
  const out: number[] = []
  for (let i = 0; i + 1 < uvs.length; i += 2) {
    out.push(flipH ? 1 - uvs[i] : uvs[i], flipV ? 1 - uvs[i + 1] : uvs[i + 1])
  }
  return out
}

// ── SVG / DXF 导入轮廓 → 可编辑草图源 ─────────────────────────────────────────────
export type ImpProfileLike = ({ kind: 'circle'; c: [number, number]; r: number } | { kind: 'poly'; pts: [number, number][] }) & { layer?: string }
export type ImpItem = { profile: ImpProfileLike; operation: 'new' | 'cut'; layer?: string }
// 真实 DXF 产物把 layer 嵌喺 profile 内（classifyProfiles spread），顶层 it.layer 恒 undefined。
// 两处都读，顶层作后备，令手搓顶层 layer 的旧测试与真产物都命中。
const layerOf = (it: ImpItem): string => it.profile?.layer ?? it.layer ?? '0'
export type SketchShapeLike =
  | { type: 'circle'; c: [number, number]; r: number }
  | { type: 'poly'; pts: [number, number][] }

// 2D 相似变换：缩放（uniform）+ 绕原点旋转 zAngle。用于导入前套 Scale / Z-Angle。
export function xform2D(p: [number, number], scale: number, zAngle: number): [number, number] {
  const s = scale || 1, ca = Math.cos(zAngle || 0), sa = Math.sin(zAngle || 0)
  const x = p[0] * s, y = p[1] * s
  return [x * ca - y * sa, x * sa + y * ca]
}
export function transformImpProfile(p: ImpProfileLike, scale: number, zAngle: number): ImpProfileLike {
  if (p.kind === 'circle') { const c = xform2D(p.c, scale, zAngle); return { kind: 'circle', c, r: p.r * (scale || 1) } }
  return { kind: 'poly', pts: p.pts.map((pt) => xform2D(pt, scale, zAngle)) }
}
// ImpProfile → SketchShape（可编辑草图曲线）。
export function impToSketchShape(p: ImpProfileLike): SketchShapeLike {
  return p.kind === 'circle' ? { type: 'circle', c: [p.c[0], p.c[1]], r: p.r } : { type: 'poly', pts: p.pts.map((q) => [q[0], q[1]]) }
}
// 逐层包含过滤：只保留 layer ∈ include 的项（include 为 null/空 = 全收）。
export function filterByLayers(items: ImpItem[], include: Set<string> | null): ImpItem[] {
  if (!include || include.size === 0) return items
  return items.filter((it) => include.has(layerOf(it)))
}
// 收集轮廓涉及的所有 layer（去重排序）。
export function collectLayers(items: ImpItem[]): string[] {
  const s = new Set<string>()
  for (const it of items) s.add(layerOf(it))
  return [...s].sort()
}
// 构建【一张】草图源（多轮廓合并入同一 sketchId，重开时经 even-odd 嵌套重算孔）。
export function buildImportSketchSource(items: ImpItem[], opt: { plane?: string; baseZ?: number; op?: string; height?: number; scale?: number; zAngle?: number }): { shapes: SketchShapeLike[]; cons: []; plane: string; baseZ: number; op: string; height: number } {
  const scale = opt.scale ?? 1, zAngle = opt.zAngle ?? 0
  const shapes = items.map((it) => impToSketchShape((scale !== 1 || zAngle !== 0) ? transformImpProfile(it.profile, scale, zAngle) : it.profile))
  return { shapes, cons: [], plane: opt.plane ?? 'XY', baseZ: opt.baseZ ?? 0, op: opt.op ?? 'new', height: Number.isFinite(opt.height) && (opt.height as number) > 0 ? opt.height as number : 5 }
}
// 重开判据（对齐 Timeline.tsx:212 的 hasSketch）：extrude/revolve/sweep/sketch/extgroup 有 sketchId + 草图源存在。
export function isReopenableSketchFeature(feature: { type?: string; sketchId?: string }, srcs: Record<string, unknown>): boolean {
  const t = feature.type
  if (!t) return false
  const kinds = ['extrude', 'revolve', 'sweep', 'sketch', 'extgroup']
  return kinds.includes(t) && !!feature.sketchId && !!srcs[feature.sketchId]
}

// ── Mesh 插入：单位换算 + flip-up + 落地/居中 ─────────────────────────────────────
export type MeshUnit = 'mm' | 'cm' | 'm' | 'inch' | 'ft'
export const MESH_UNITS: Record<MeshUnit, number> = { mm: 1, cm: 10, m: 1000, inch: 25.4, ft: 304.8 }
export function meshUnitScaleMm(u: string): number { return MESH_UNITS[u as MeshUnit] ?? 1 }

// flip-up：Y-up ↔ Z-up（绕 X 轴 -90°）(x, y, z) → (x, z, -y)。法向同样旋转。
export function flipUpVec(x: number, y: number, z: number): [number, number, number] { return [x, z, -y] }

export type MeshLike = { vertices: number[]; triangles: number[]; normals?: number[] }
// 套用 单位缩放 + flip-up 到 mesh 顶点/法向（返回新 mesh，triangles 原样）。
export function transformMesh(mesh: MeshLike, opt: { scale?: number; flipUp?: boolean }): MeshLike {
  const s = opt.scale ?? 1, flip = !!opt.flipUp
  const v = mesh.vertices, out = new Array(v.length)
  for (let i = 0; i + 2 < v.length; i += 3) {
    let x = v[i] * s, y = v[i + 1] * s, z = v[i + 2] * s
    if (flip) { const r = flipUpVec(x, y, z); x = r[0]; y = r[1]; z = r[2] }
    out[i] = x; out[i + 1] = y; out[i + 2] = z
  }
  const res: MeshLike = { vertices: out, triangles: mesh.triangles.slice() }
  if (mesh.normals && mesh.normals.length) {
    const nn = new Array(mesh.normals.length)
    for (let i = 0; i + 2 < mesh.normals.length; i += 3) {
      let nx = mesh.normals[i], ny = mesh.normals[i + 1], nz = mesh.normals[i + 2]
      if (flip) { const r = flipUpVec(nx, ny, nz); nx = r[0]; ny = r[1]; nz = r[2] }
      nn[i] = nx; nn[i + 1] = ny; nn[i + 2] = nz
    }
    res.normals = nn
  }
  return res
}
// 轴对齐包围盒。
export function meshBBox(vertices: number[]): { min: [number, number, number]; max: [number, number, number] } | null {
  if (vertices.length < 3) return null
  const mn: [number, number, number] = [Infinity, Infinity, Infinity]
  const mx: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i + 2 < vertices.length; i += 3) for (let k = 0; k < 3; k++) { const val = vertices[i + k]; if (val < mn[k]) mn[k] = val; if (val > mx[k]) mx[k] = val }
  return Number.isFinite(mn[0]) ? { min: mn, max: mx } : null
}
// 落地/居中偏移（应用到 component.pos 或顶点）：
//   'ground' = 抬起令最低点贴 Z=0（webcad 竖轴 = Y-three / Z-cad；这里按 mesh 第 3 分量 = 竖轴处理时用 axis=2）
//   'center' = 令包围盒中心落原点（保留竖轴）
// axis 指定竖轴分量（默认 1 = three Y-up；导入 mesh 摆位由调用方决定）。返回 [dx,dy,dz]。
export function meshPlaceOffset(bbox: { min: [number, number, number]; max: [number, number, number] }, mode: 'ground' | 'center' | 'none', axis = 1): [number, number, number] {
  if (mode === 'none') return [0, 0, 0]
  const cx = (bbox.min[0] + bbox.max[0]) / 2, cy = (bbox.min[1] + bbox.max[1]) / 2, cz = (bbox.min[2] + bbox.max[2]) / 2
  if (mode === 'center') return [-cx, -cy, -cz]
  // ground：竖轴抬到 min=0，其余居中
  const off: [number, number, number] = [-cx, -cy, -cz]
  off[axis] = -bbox.min[axis]
  return off
}

// New mesh occurrences are unrotated at insertion time.  Mesh data is CAD
// Z-up, while the Assembly world is three.js Y-up (world XZ = CAD X,-Y).
// This lets Insert apply Center/Ground before committing the occurrence, so a
// single Ctrl+Z removes the import rather than first undoing its placement.
export function meshInsertPosition(vertices: ArrayLike<number>, originX: number, mode: 'none' | 'center' | 'ground' = 'none'): [number, number, number] {
  if (mode === 'none') return [originX, 0, 0]
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity
  for (let i = 0; i + 2 < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2]
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
    if (z < minZ) minZ = z
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(minZ)) return [originX, 0, 0]
  return [-(minX + maxX) / 2, mode === 'ground' ? -minZ : 0, (minY + maxY) / 2]
}
