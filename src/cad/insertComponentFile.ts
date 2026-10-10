/**
 * Insert Component file routing — STEP/STP vs WebCAD part JSON.
 * Pure helpers (no store/DOM) so unit tests can cover sniff + Formal TC error mapping.
 */

export type InsertComponentKind = 'step' | 'json' | 'unknown'

/** Chooser accept list: STEP interchange + saved WebCAD part/project JSON. */
export const INSERT_COMPONENT_ACCEPT = '.step,.stp,.json'

const WEBCAD_JSON_EXT = new Set(['json', 'webcad'])
const STEP_EXT = new Set(['step', 'stp'])

/** Formal TC (HK written) — wrong/empty/corrupt insert file. Never surface English kernel text. */
export const INSERT_COMPONENT_BAD_FILE =
  '無法插入：檔案不是有效的 STEP／STP 或 WebCAD 零件 JSON'

export const INSERT_COMPONENT_EMPTY =
  '無法插入：檔案沒有可插入的實體或組件'

export const INSERT_COMPONENT_STEP_FAIL =
  '無法插入：STEP／STP 匯入失敗或為空'

/** Extension + content sniff. Prefer extension when decisive; otherwise peek at payload head. */
export function detectInsertComponentKind(fileName: string, head = ''): InsertComponentKind {
  const base = String(fileName || '').split(/[/\\]/).pop() || ''
  const dot = base.lastIndexOf('.')
  const ext = dot >= 0 ? base.slice(dot + 1).toLowerCase() : ''
  if (STEP_EXT.has(ext)) return 'step'
  if (WEBCAD_JSON_EXT.has(ext)) return 'json'
  const t = String(head || '').replace(/^\uFEFF/, '').trimStart()
  if (!t) return 'unknown'
  if (t.startsWith('{') || t.startsWith('[')) return 'json'
  if (/ISO-10303/i.test(t) || /^HEADER\s*;/im.test(t)) return 'step'
  return 'unknown'
}

/** Map kernel / parse failures to Formal TC — never leave English worker strings user-facing. */
export function mapInsertComponentError(err: unknown): string {
  const raw = err == null ? '' : String((err as { message?: string })?.message ?? err)
  if (/not type|is null|NullObject|Standard_Null|cannot.*parse|JSON/i.test(raw)) {
    return INSERT_COMPONENT_BAD_FILE
  }
  if (/STEP|STP|XCAF|CAFControl/i.test(raw)) return INSERT_COMPONENT_STEP_FAIL
  if (!raw.trim()) return INSERT_COMPONENT_BAD_FILE
  // Strip residual English technical noise; keep a short Formal TC status.
  return INSERT_COMPONENT_BAD_FILE
}

/** Peek first ~4KB of a buffer as UTF-8 (lossy OK for sniff). */
export function bufferHeadText(buf: ArrayBuffer, max = 4096): string {
  const n = Math.min(max, buf.byteLength)
  return new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, n))
}
