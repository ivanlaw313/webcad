// GM-X4：时间轴 + 选择（TIMELINE + SELECTION）纯逻辑内核 —— 零依赖纯函数，Node 可测。
// 对标 Fusion 选择系统：Selection Priority（体/面/边）+ 逐类型 Filter 勾选表 + Select-All + Select-Through
// + 套索多边形命中 + By-Name/Size/Invert/Seed 集运算 + 时间轴 chip 色板 / 回卷 scrub 索引。
// 所有渲染 / raycast side-effect 留喺 Viewport/store；呢度只管【状态映射 + 谓词 + 集运算】，方便 headless 单元测。

// ── #13/#14 selFilter：3 枚举升级为 {priority, types, selectThrough} ────
export type SelType = 'component' | 'body' | 'face' | 'edge' | 'vertex' | 'sketch'
export type SelPriority = 'body' | 'face' | 'edge'
export type SelFilter = { priority: SelPriority; types: SelType[]; selectThrough: boolean }

export const SEL_TYPES: { key: SelType; label: string }[] = [
  { key: 'component', label: '组件' },
  { key: 'body', label: '实体' },
  { key: 'face', label: '面' },
  { key: 'edge', label: '边' },
  { key: 'vertex', label: '顶点' },
  { key: 'sketch', label: '草图' },
]
const ALL_TYPES: SelType[] = SEL_TYPES.map((t) => t.key)
const TYPE_ORDER: Record<SelType, number> = { component: 0, body: 1, face: 2, edge: 3, vertex: 4, sketch: 5 }

export const DEFAULT_SEL_FILTER: SelFilter = { priority: 'face', types: [...ALL_TYPES], selectThrough: false }

// 稳定排序（照 SEL_TYPES 次序）→ 序列化字节稳定、去重。
function sortTypes(types: SelType[]): SelType[] {
  return [...new Set(types)].sort((a, b) => TYPE_ORDER[a] - TYPE_ORDER[b])
}
function sameTypeSet(a: SelType[], b: SelType[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

// 迁移：旧 3 枚举字符串 / 新对象 / 垃圾 → 合法 SelFilter（byte-compat：旧存档照 load）。
export function migrateSelFilter(v: unknown): SelFilter {
  if (typeof v === 'string') {
    if (v === 'comp') return { priority: 'body', types: ['component'], selectThrough: false }
    if (v === 'body') return { priority: 'face', types: ['body', 'face', 'edge'], selectThrough: false }
    // 'all' 或未知字符串 → 全选（默认）
    return { priority: 'face', types: [...ALL_TYPES], selectThrough: false }
  }
  if (v && typeof v === 'object') {
    const o = v as Partial<SelFilter>
    const priority: SelPriority = o.priority === 'body' || o.priority === 'edge' || o.priority === 'face' ? o.priority : 'face'
    const raw = Array.isArray(o.types) ? o.types.filter((t): t is SelType => ALL_TYPES.includes(t as SelType)) : []
    const types = raw.length ? sortTypes(raw) : [...ALL_TYPES]
    return { priority, types, selectThrough: !!o.selectThrough }
  }
  return { priority: 'face', types: [...ALL_TYPES], selectThrough: false }
}

export function isDefaultSelFilter(sf: SelFilter): boolean {
  return sf.priority === DEFAULT_SEL_FILTER.priority && !sf.selectThrough && sameTypeSet(sf.types, ALL_TYPES)
}
// 序列化（omit-on-default）：默认态返回 undefined → 存档省略键（byte-compat）。
export function serializeSelFilter(sf: SelFilter): SelFilter | undefined {
  return isDefaultSelFilter(sf) ? undefined : { priority: sf.priority, types: sortTypes(sf.types), selectThrough: sf.selectThrough }
}

// 拾取谓词：把新 types 集映射返旧 comp/body pickable 门（保证默认态逐字节旧行为）。
export function selAllowsType(sf: SelFilter, t: SelType): boolean { return sf.types.includes(t) }
export function selPicksComp(sf: SelFilter): boolean { return sf.types.includes('component') }
export function selPicksBody(sf: SelFilter): boolean { return sf.types.includes('body') || sf.types.includes('face') || sf.types.includes('edge') }

// 不可变更新
export function withSelType(sf: SelFilter, t: SelType, on: boolean): SelFilter {
  const has = sf.types.includes(t)
  if (on === has) return sf
  const types = on ? sortTypes([...sf.types, t]) : sf.types.filter((x) => x !== t)
  return { ...sf, types }
}
export function withAllTypes(sf: SelFilter): SelFilter { return { ...sf, types: [...ALL_TYPES] } }
export function withNoTypes(sf: SelFilter): SelFilter { return { ...sf, types: [] } }
// 设优先级同时保证对应类型可拣（Fusion：把优先级设做「边」= 想拣得到边）。
export function withPriority(sf: SelFilter, p: SelPriority): SelFilter {
  const types = sf.types.includes(p) ? sf.types : sortTypes([...sf.types, p])
  return { ...sf, priority: p, types }
}
export function withSelThrough(sf: SelFilter, v: boolean): SelFilter { return { ...sf, selectThrough: v } }

// ── #15 Select Through：拾取命中解析（穿透 = 取全部命中，否则仅最近）────
// sortedHits：按距离升序排好嘅命中数组。through=true 返全部（拣被遮挡对象）。
export function resolvePickHits<T>(sortedHits: T[], through: boolean): T[] {
  if (!sortedHits.length) return []
  return through ? sortedHits.slice() : [sortedHits[0]]
}

// ── #3 命令激活【覆盖】选择过滤器（真回归修）────────────────────────────
// Fusion 语义：pick 命令武装时，对应 mesh 无视 types 过滤仍可 raycast（否则清空 types → 命令静默失灵）。
// baseAllowed = 过滤器基础允许（活动实体 selPicksBody(sf)&&mode!=='sketch'；组件 selPicksComp(sf)&&…）。
// Viewport raycast 判定与此逐字节一致（单一真相，headless 可测覆盖语义）。
export function pickableWithCmdOverride(baseAllowed: boolean, commandArmed: boolean): boolean {
  return baseAllowed || commandArmed
}

// ── #6 Selection Priority 参与拾取 tie-break（属性检查器单击选边/面）──────
// 点贴近一条棱（nearEdge=歧义区）时按优先级偏好；Alt 一律强制选边。
// priority='face'/'body'（含默认）→ wantEdge = alt（逐字节旧行为）；priority='edge' 且贴边 → 选边。
export function inspectWantEdge(priority: SelPriority, alt: boolean, nearEdge: boolean): boolean {
  return alt || (nearEdge && priority === 'edge')
}

// ── #17 套索：点是否喺多边形内（射线法，屏幕像素坐标）────────────────────
export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1]
    const intersect = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}
// 多边形轴对齐包围盒（快速预剔除，套索命中前先框判）。
export function polygonBBox(poly: [number, number][]): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (poly.length < 3) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y] of poly) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  return { minX, minY, maxX, maxY }
}

// ── #19 集运算：Invert / 并 / 差 / 交 ─────────────────────────────────────
export function invertSet(all: string[], current: string[]): string[] {
  const cur = new Set(current)
  return all.filter((id) => !cur.has(id))
}
export function unionSet(a: string[], b: string[]): string[] { return [...new Set([...a, ...b])] }
export function subtractSet(a: string[], b: string[]): string[] { const r = new Set(b); return a.filter((x) => !r.has(x)) }
export function intersectSet(a: string[], b: string[]): string[] { const r = new Set(b); return a.filter((x) => r.has(x)) }

// ── #19 By-Name（大小写不敏感子串 / *? 通配）────────────────────────────
function globToRegExp(pat: string): RegExp | null {
  if (!pat.includes('*') && !pat.includes('?')) return null
  const esc = pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp('^' + esc + '$')
}
export function matchByName(items: { id: string; name: string }[], query: string): string[] {
  const q = (query || '').trim().toLowerCase()
  if (!q) return []
  const rx = globToRegExp(q)
  return items.filter((it) => {
    const name = (it.name || '').toLowerCase()
    return rx ? rx.test(name) : name.includes(q)
  }).map((it) => it.id)
}

// ── #19 By-Size（体积 / 包围盒尺度阈值）─────────────────────────────────
export type SizeOp = '>' | '<' | '>=' | '<=' | '~'
export function sizeMatches(size: number, op: SizeOp, threshold: number): boolean {
  if (op === '>') return size > threshold
  if (op === '<') return size < threshold
  if (op === '>=') return size >= threshold
  if (op === '<=') return size <= threshold
  return Math.abs(size - threshold) <= Math.max(1e-9, Math.abs(threshold) * 0.1)   // ~ = ±10%
}
export function matchBySize(items: { id: string; size: number }[], op: SizeOp, threshold: number): string[] {
  return items.filter((it) => sizeMatches(it.size, op, threshold)).map((it) => it.id)
}

// ── #19 Seed-and-Boundary：从种子沿邻接洪泛，遇边界棱停（纯图算法）──────
// adjacency[id] = 邻接 id 列表；isBoundary(from,to)=true 时该邻接系边界，唔越过。
export function seedExpand(seeds: string[], adjacency: Record<string, string[]>, isBoundary: (from: string, to: string) => boolean): string[] {
  const out = new Set<string>(seeds)
  const queue = [...seeds]
  while (queue.length) {
    const cur = queue.shift() as string
    for (const nb of adjacency[cur] || []) {
      if (out.has(nb)) continue
      if (isBoundary(cur, nb)) continue
      out.add(nb); queue.push(nb)
    }
  }
  return [...out]
}

// ── #9 时间轴 chip 色板：按 owning component 色染，无则按特征类型稳定 hash ──
const SWATCH_PALETTE = ['#4a90d9', '#e0803a', '#3fae5a', '#c0554d', '#9b6fc4', '#d1a13a', '#4bb2b8', '#c060a0']
export function chipSwatchColor(feat: { id: string; type: string }, ownerColor?: string | null): string {
  if (ownerColor) return ownerColor
  const key = feat.type || feat.id || ''
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return SWATCH_PALETTE[h % SWATCH_PALETTE.length]
}

// ── #9 hideInactive：回卷 scrub 索引（对隐藏 chip 稳健）─────────────────
// chips 按 feature 序（fi 升）；每个 visible chip 中心喺 cursorX 左边就 idx=fi+1（最右者胜）。
// 隐藏 chip（display:none）唔计 → gotoStep(idx) 仍对齐 features 数组位置。
export function computeScrubIndex(chips: { fi: number; center: number; visible: boolean }[], cursorX: number): number {
  let idx = 0
  for (const c of chips) {
    if (!c.visible) continue
    if (cursorX > c.center) idx = c.fi + 1
  }
  return idx
}
