/**
 * Explicit URL opt-in for browser UI checks: keep the test document in memory.
 *
 * ★ BUG-401 修（2026-10-02）★
 * ───────────────────────────
 * 外部 QA 報：`?ui-test` 仍然自動還原上次自動存檔，同任務書講法唔符，
 * 害到每條測試線開局都要手動「新建」。
 *
 * 根因 = 兩個閘用唔同嘅判斷：
 *   · 呢度（隔離）原本要 `?ui-test=1`      → `get('ui-test') === '1'`
 *   · main.tsx（暴露 window.useApp）只要參數存在 → `has('ui-test')`
 * 所以 `?ui-test`（冇值）會拎到 store 鈎但【拎唔到】乾淨開局 —— 做一半。
 * 一個「寫唔寫 `=1` 決定做一半定做全套」嘅旗標本身就係陷阱。
 *
 * 改成【存在即生效】，同 main.tsx 對齊。保留明示關閉嘅逃生門
 * （`?ui-test=0` / `=false` / `=no`），方便喺同一條 URL 上面對照測試。
 */

/** 明示關閉嘅值 —— 除此之外，參數一存在就當開。 */
const OFF = new Set(['0', 'false', 'no', 'off'])

export function isUiTestIsolation(search?: string): boolean {
  const value = search ?? (typeof window === 'undefined' ? '' : window.location.search)
  try {
    const params = new URLSearchParams(value)
    if (!params.has('ui-test')) return false
    const raw = (params.get('ui-test') ?? '').trim().toLowerCase()
    return !OFF.has(raw)
  } catch { return false }
}

export function documentPersistenceEnabled(search?: string): boolean {
  return !isUiTestIsolation(search)
}
