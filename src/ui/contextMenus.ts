// Fusion-style context-sensitive menus (viewport marking menu + browser tree) and body visibility helpers.
// Pure module — no React / store imports — so the filtering and visibility rules are unit-testable.

/** What the right-click landed on in the 3D viewport (model mode). */
export type ViewportHit = 'face' | 'edge' | 'body' | 'component' | 'empty'

/** Keys understood by Viewport's model-mode item table. null = empty radial sector; 'sep' = list separator. */
export type MenuLayout = { sectors: (string | null)[]; overflow: (string | 'sep')[] }

export type ModelMenuOpts = {
  hasSelection?: boolean   // a feature/component is selected (enables generic 刪除 in empty space)
  anyHidden?: boolean      // something is hidden → offer 顯示全部 in the overflow list too
}

const VIEWS = ['vfront', 'vtop', 'vright', 'viso'] as const

/**
 * Model-mode marking-menu layout for a hit kind. Always exactly 8 sectors (N NE E SE S SW W NW; N = repeat).
 * face  → sketch / press-pull / shell / delete-face / face-fillet / measure / appearance …
 * edge  → fillet / chamfer / measure …
 * body  → (parked body) measure / move / hide …
 * component → move / measure / hide / delete / focus …
 * empty → repeat / fit / standard views / show-all …
 */
export function modelMenuLayout(hit: ViewportHit, opts: ModelMenuOpts = {}): MenuLayout {
  const showAll = opts.anyHidden ? ['showall'] : []
  switch (hit) {
    case 'face':
      return {
        sectors: ['repeat', 'sketch', 'presspull', 'measure', 'delface', 'move', 'shell', 'fit'],
        overflow: ['facefillet', 'appearance', 'physmat', 'hidebody', ...showAll, 'sep', 'createcomp', 'sep', 'bsection', 'expq', 'sep', ...VIEWS],
      }
    case 'edge':
      return {
        sectors: ['repeat', 'fillet', 'chamfer', 'measure', 'del', 'move', 'presspull', 'fit'],
        overflow: ['hidebody', ...showAll, 'sep', ...VIEWS],
      }
    case 'body':
      return {
        sectors: ['repeat', 'measure', 'move', 'hidebody', 'activate', 'createcomp', 'props', 'fit'],  // ASM2 P1：設為活動
        overflow: [...showAll, 'sep', ...VIEWS],
      }
    case 'component':
      return {
        sectors: ['repeat', 'move', 'measure', 'hidecomp', 'del', 'focus', 'props', 'fit'],
        overflow: ['ground', ...showAll, 'sep', 'compitems', 'sep', ...VIEWS],
      }
    case 'empty':
    default:
      return {
        sectors: ['repeat', 'sketch', 'viso', 'vtop', 'fit', 'vfront', 'vright', 'showall'],
        overflow: [...(opts.hasSelection ? ['del'] : []), 'measure', 'sep', 'compitems', 'sep', 'multicomp'],
      }
  }
}

/** Tiny pure filter: keep only items whose key appears in the layout (order follows the layout). */
export function pickItems<T extends { key: string }>(keys: (string | null | 'sep')[], table: Record<string, T | T[] | undefined>): (T | null | 'sep')[] {
  const out: (T | null | 'sep')[] = []
  for (const k of keys) {
    if (k === null) { out.push(null); continue }
    if (k === 'sep') { if (out.length && out[out.length - 1] !== 'sep') out.push('sep'); continue }
    const it = table[k]
    if (!it) continue
    if (Array.isArray(it)) { if (it.length) out.push(...it) } else out.push(it)
  }
  while (out.length && out[out.length - 1] === 'sep') out.pop()
  return out
}

/** Browser-tree row kinds that get an app context menu. */
export type TreeNodeKind = 'activeBody' | 'parkedBody' | 'component' | 'componentBody' | 'sketch' | 'feature' | 'joint' | 'root'

export type TreeMenuOpts = { hidden?: boolean; canRename?: boolean; canDelete?: boolean; canEdit?: boolean; anyHidden?: boolean; suppressed?: boolean; grounded?: boolean }

/** Item keys for a browser-tree row context menu (Fusion browser right-click). */
export function treeMenuKeys(kind: TreeNodeKind, o: TreeMenuOpts = {}): string[] {
  const vis = o.hidden ? 'show' : 'hide'
  switch (kind) {
    // UX1 #6：活動實體行同 Fusion 實體一樣可「重新命名」／「刪除」
    case 'activeBody': return [vis, 'rename', 'createComp', 'sep', 'appearance', 'physmat', 'props', 'sep', 'fit', ...(o.canDelete === false ? [] : ['sep', 'delete'])]
    case 'parkedBody': return [vis, 'activate', 'createComp', 'sep', 'props']  // ASM2 P1：設為活動（之後孔／切除作用於此體）
    // ASM2 #4：組件右鍵亦有「固定／取消固定」（之前只喺 ⋯ 選項列）
    case 'component': return [vis, 'isolate', ...(o.canEdit ? ['edit'] : []), ...(o.canRename ? ['rename'] : []), 'sep', o.grounded ? 'unground' : 'ground', 'sep', 'focus', 'props', 'sep', ...(o.canDelete === false ? [] : ['delete'])]
    case 'componentBody': return [vis]
    case 'sketch': return ['editSketch', vis, ...(o.canRename ? ['rename'] : []), ...(o.canDelete ? ['sep', 'delete'] : [])]
    // RETEST19 #7：瀏覽樹特徵行（同時間軸 chip 同一套處理：編輯／改名／抑制／刪除＋依賴警告）
    case 'feature': return [...(o.canEdit ? ['editFeature'] : []), 'rename', o.suppressed ? 'unsuppress' : 'suppress', 'sep', 'delete']
    // ASM2 #7：瀏覽樹「關節」資料夾
    case 'joint': return ['editJoint', 'rename', 'sep', ...(o.canDelete === false ? [] : ['delete'])]
    case 'root':
    default: return ['showAll', 'fit']
  }
}

// ── Body visibility (root bodies: active body + parked bodies) ──────────────────────────────

export const ACTIVE_BODY_KEY = 'active'
/** Stable-ish key for a parked body: its name (unique in practice); index fallback for nameless bodies. */
export function parkedBodyKey(name: string | undefined, index: number): string { return name ? 'pk:' + name : 'pk#' + index }

export function isBodyHidden(hidden: readonly string[], key: string): boolean { return hidden.includes(key) }

export function toggleHiddenKey(hidden: readonly string[], key: string): string[] {
  return hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key]
}

export function setHiddenKey(hidden: readonly string[], key: string, hide: boolean): string[] {
  const has = hidden.includes(key)
  if (hide === has) return hidden as string[]
  return hide ? [...hidden, key] : hidden.filter((k) => k !== key)
}

/** Load-side sanitiser for the persisted `bodyHidden` field (old files → []). */
export function sanitizeBodyHidden(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return [...new Set(v.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length < 200))]
}

// ── Edge-vs-face discrimination (screen space) ──────────────────────────────────────────────

/** Squared distance from point p to segment ab in 2D. */
export function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay
  const L = dx * dx + dy * dy
  let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const qx = ax + t * dx - px, qy = ay + t * dy - py
  return qx * qx + qy * qy
}

/**
 * True when screen point (px,py) lies within tolPx of any projected edge segment.
 * `seg2d` = flat [ax,ay,bx,by, …] in pixels; NaN entries (behind camera) are skipped.
 */
export function nearEdgePx(seg2d: ArrayLike<number>, px: number, py: number, tolPx = 6): boolean {
  return nearestEdgePx(seg2d, px, py, tolPx) >= 0
}
/** Index (segment number) of the closest projected segment within tolPx, or -1. */
export function nearestEdgePx(seg2d: ArrayLike<number>, px: number, py: number, tolPx = 6): number {
  let best = -1, bd = tolPx * tolPx
  for (let i = 0; i + 3 < seg2d.length; i += 4) {
    const ax = seg2d[i], ay = seg2d[i + 1], bx = seg2d[i + 2], by = seg2d[i + 3]
    if (!(Number.isFinite(ax) && Number.isFinite(ay) && Number.isFinite(bx) && Number.isFinite(by))) continue
    const d = segDist2(px, py, ax, ay, bx, by)
    if (d <= bd) { bd = d; best = i / 4 }
  }
  return best
}
