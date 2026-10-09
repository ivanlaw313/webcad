// UX1 #4：單鍵全域快捷鍵（H=孔、E=拉伸、F=圓角、Delete=刪除…）唔准由「打緊字」嘅欄位漏出去。
// App.onKey 已經擋 e.target／activeElement 係 input/textarea/select/contenteditable 嘅情況；但真瀏覽器仲有兩條漏：
//   ① 打字中欄位被 re-render 換走／預覽期間 disabled → Chrome 失焦，下一粒鍵落 body → 'h' 開咗孔命令；
//   ② 焦點喺對話框本身（容器 tabIndex=-1、標籤、滑桿、按鈕）而唔係 input → 字母當咗命令。
// 呢度兩條都擋：最近 1.5s 內喺欄位打過字（唔係 Enter/Esc/Tab 主動離開）而而家焦點冇咗（body／欄位已移除／disabled）
// → 單鍵快捷鍵吞咗；焦點喺 [role=dialog]／.cmd-palette 入面 → 單鍵快捷鍵吞咗（Enter/Esc 照舊交俾對話框）。
export type ElLike = {
  tagName?: string
  isContentEditable?: boolean
  isConnected?: boolean
  disabled?: boolean
  closest?: (sel: string) => unknown
} | null | undefined

export const isTextField = (el: ElLike): boolean => !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable)
const isBodyLike = (el: ElLike): boolean => !el || el.tagName === 'BODY' || el.tagName === 'HTML'
const LEAVE_KEYS = new Set(['Enter', 'Escape', 'Tab'])
export const FIELD_GRACE_MS = 1500
const DIALOG_SEL = '[role="dialog"], .cmd-palette'

type KeyLike = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }
/** 單鍵（冇 Ctrl/⌘/Alt）可打字符或 Delete/Backspace —— 即係會觸發單鍵命令嘅鍵。 */
export const isSingleKeyShortcut = (e: KeyLike): boolean => !e.ctrlKey && !e.metaKey && !e.altKey && (e.key.length === 1 || e.key === 'Delete' || e.key === 'Backspace')

export function createShortcutGuard(now: () => number = () => Date.now()) {
  let lastField: ElLike = null
  let lastAt = -Infinity
  let lastKey = ''
  return {
    /** capture-phase keydown：記低「喺欄位打字」（喺 React handler／re-render 之前）。 */
    note(e: KeyLike, target: ElLike, active: ElLike): void {
      const f = isTextField(target) ? target : isTextField(active) ? active : null
      if (!f) return
      lastField = f; lastAt = now(); lastKey = e.key
    },
    /** true = 呢粒單鍵唔准行全域命令。 */
    blocks(e: KeyLike, target: ElLike, active: ElLike): boolean {
      if (!isSingleKeyShortcut(e)) return false
      if (isTextField(target) || isTextField(active)) return true
      const t = now()
      if (lastField && t - lastAt < FIELD_GRACE_MS && !LEAVE_KEYS.has(lastKey)) {
        const lost = isBodyLike(active) || lastField.isConnected === false || !!lastField.disabled
        if (lost) { lastAt = t; return true }   // 連續打字繼續吞（例如 '1h2'）
      }
      const inDialog = (el: ElLike) => !!el && !isBodyLike(el) && !!el.closest?.(DIALOG_SEL)
      if (inDialog(active) || inDialog(target)) return true
      return false
    },
  }
}
