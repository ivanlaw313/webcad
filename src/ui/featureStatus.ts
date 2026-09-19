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
  // v1.63: HK Traditional — Solid QA toast fragments (向內／開／個／所選／切線／抽殼)
  const dirLbl = opts.dir === 'outside' ? '向外' : opts.dir === 'both' ? '兩側' : '向內'
  const body =
    opts.shellType === 'closed'
      ? '封閉實體'
      : `開 ${opts.openCount} 個所選面${opts.tangentChain ? '，切線鏈開' : ''}`
  return `已抽殼 壁厚 ${opts.thickness}（${dirLbl}，${body}）`
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
  const lbl = opts.op === 'cut' ? '切除' : opts.op === 'common' ? '相交' : '合併'
  const sym = opts.op === 'cut' ? '−' : opts.op === 'common' ? '∩' : '+'
  if (opts.kind === 'combine') {
    const n = opts.toolCount ?? 1
    const keep = opts.keepTools ? '·保留工具體' : ''
    return `已合併：活動實體 ${sym} ${n} 個工具體（${lbl}${keep}，B-rep 級 — 時間軸可改/可刪）`
  }
  return `已實體布爾：活動實體 ${sym} 泊車實體（${lbl}，B-rep 級 — 時間軸可改/可刪）`
}

/** New body (park active) success. */
export function newBodySuccessStatus(n: number): string {
  return `已開新實體 —「實體${n}」已泊車（灰顯）。而家建嘅嘢全部屬於新實體；完成後撳「實體布爾」合併/切除/相交`
}
