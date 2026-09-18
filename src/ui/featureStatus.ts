/**
 * v1.37 / v1.38 — Feature success status builders (Chinese source of truth).
 *
 * Status HUD runs every string through tStatus(s, lang). Short EN phrase tokens
 * (已→Done:, 抽壳→shell, 壁厚→Wall, 所选→selected, 圆角→fillet, 拉伸→extrude,
 * 实体→body, …) previously mangled these into hybrid EN/CN toasts e.g.
 *   `Done: shell Wall 2 (向内, 开 1 个selected 面, 切线链)`
 *   `Done: extrudeto make a body — real  OCCT B-rep`
 * Keep builders here so contracts can assert the Chinese pattern, and pair with
 * long STATUS_PHRASES_X guards so EN mode preserves proper Chinese for these.
 */

export type ShellDir = 'inside' | 'outside' | 'both'
export type ShellType = 'open' | 'closed'

/** CLEAN shell commit success toast (no fallback/cavity wording). */
export function shellSuccessStatus(opts: {
  thickness: number
  dir: ShellDir
  shellType: ShellType
  openCount: number
  tangentChain: boolean
}): string {
  const dirLbl = opts.dir === 'outside' ? '向外' : opts.dir === 'both' ? '两侧' : '向内'
  const body =
    opts.shellType === 'closed'
      ? '封闭实体'
      : `开 ${opts.openCount} 个所选面${opts.tangentChain ? '，切线链开' : ''}`
  return `已抽壳 壁厚 ${opts.thickness}（${dirLbl}，${body}）`
}

/** Extrude / Cut success (single-body path). */
export function extrudeSuccessStatus(opts: {
  op: 'new' | 'cut' | 'stack'
  extra?: string
}): string {
  const base =
    opts.op === 'cut'
      ? '已切割（布尔减）— 真实 OCCT B-rep'
      : opts.op === 'stack'
        ? '已在顶面叠加拉伸特征'
        : '已拉伸出实体 — 真实 OCCT B-rep'
  return base + (opts.extra ?? '')
}

/** Multi-profile Extrude / Cut success. */
export function multiProfileExtrudeStatus(opts: {
  op: 'new' | 'cut'
  count: number
  holes?: number
  groupNodes?: number
}): string {
  if (opts.op === 'cut') {
    const grp = opts.groupNodes != null ? `（组节点 ×${opts.groupNodes}）` : ''
    return `已切除 ${opts.count} 个轮廓${grp}— 真实 OCCT B-rep`
  }
  const holes = opts.holes ?? 0
  const grp = opts.groupNodes != null ? '，组节点' : ''
  return `已拉伸 ${opts.count} 个轮廓（含 ${holes} 个孔${grp}）— 真实 OCCT B-rep`
}

export type BoolOp = 'join' | 'cut' | 'common'

/** Body boolean / combine (Fuse) success. */
export function booleanSuccessStatus(opts: {
  kind: 'body' | 'combine'
  op: BoolOp
  toolCount?: number
  keepTools?: boolean
}): string {
  const lbl = opts.op === 'cut' ? '切除' : opts.op === 'common' ? '相交' : '合并'
  const sym = opts.op === 'cut' ? '−' : opts.op === 'common' ? '∩' : '+'
  if (opts.kind === 'combine') {
    const n = opts.toolCount ?? 1
    const keep = opts.keepTools ? '·保留工具体' : ''
    return `已合并：活动实体 ${sym} ${n} 个工具体（${lbl}${keep}，B-rep 级 — 时间轴可改/可删）`
  }
  return `已实体布尔：活动实体 ${sym} 泊车实体（${lbl}，B-rep 级 — 时间轴可改/可删）`
}

/** New body (park active) success. */
export function newBodySuccessStatus(n: number): string {
  return `已开新实体 —「实体${n}」已泊车（灰显）。而家建嘅嘢全部属于新实体；完成后撳「实体布尔」合并/切除/相交`
}
