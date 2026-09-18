/**
 * v1.37 — Feature success status builders (Chinese source of truth).
 *
 * Status HUD runs every string through tStatus(s, lang). Short EN phrase tokens
 * (已→Done:, 抽壳→shell, 壁厚→Wall, 所选→selected, 圆角→fillet, …) previously
 * mangled these into hybrid EN/CN toasts e.g.
 *   `Done: shell Wall 2 (向内, 开 1 个selected 面, 切线链)`
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
