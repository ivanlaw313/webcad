/**
 * Sweep dialog 扭轉／末端縮放欄位政策（純邏輯）。
 * 本地草稿：打字唔即 Number() 寫 store（唔好食字）；0／空白扭轉 OK；非法 → Formal TC 原因。
 */
export type SweepFieldResult =
  | { ok: true; value: number; reason: null }
  | { ok: false; value: null; reason: string }

const STRICT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/

/** 扭轉角°：空白／0 合法（=0°）；非數字／非有限 → Formal TC。 */
export function parseSweepTwistDraft(raw: string | null | undefined): SweepFieldResult {
  const t = String(raw ?? '').trim()
  if (t === '') return { ok: true, value: 0, reason: null }
  if (!STRICT.test(t)) return { ok: false, value: null, reason: `尺寸已拒絕：扭轉必須是有效數值（你打了「${t}」）` }
  const n = Number(t)
  if (!Number.isFinite(n)) return { ok: false, value: null, reason: `尺寸已拒絕：扭轉必須是有效數值（你打了「${t}」）` }
  return { ok: true, value: n, reason: null }
}

/** 末端縮放：必須 >0 有限；空白／≤0／非數字 → Formal TC（唔准靜默變 1）。 */
export function parseSweepScaleDraft(raw: string | null | undefined): SweepFieldResult {
  const t = String(raw ?? '').trim()
  if (t === '') return { ok: false, value: null, reason: '尺寸已拒絕：末端縮放不可留空（必須大於 0）' }
  if (!STRICT.test(t)) return { ok: false, value: null, reason: `尺寸已拒絕：末端縮放必須是有效數值（你打了「${t}」）` }
  const n = Number(t)
  if (!Number.isFinite(n) || !(n > 0)) return { ok: false, value: null, reason: `尺寸已拒絕：末端縮放必須大於 0（你打了「${t}」）` }
  return { ok: true, value: n, reason: null }
}

/**
 * FISHING31 P1：掃掠欄位草稿狀態機（<SweepDraftField> 實際用嘅邏輯）。
 * draft=null → 顯示 store 值；打字期間 draft 係用家原文，store 值（預覽重建後）唔會覆寫。
 * 回傳 write = 要寫入 store 嘅值（合法且有變先寫 → 預覽跟打字），null = 唔寫。
 */
export type SweepDraftState = { draft: string | null }
export function sweepDraftShown(s: SweepDraftState, storeValue: number): string { return s.draft ?? String(storeValue) }
export function sweepDraftType(raw: string, storeValue: number, parse: (raw: string) => SweepFieldResult): { next: SweepDraftState; write: number | null } {
  const r = parse(raw)
  return { next: { draft: raw }, write: r.ok && r.value !== storeValue ? r.value : null }
}
export function sweepDraftBlur(s: SweepDraftState, storeValue: number, parse: (raw: string) => SweepFieldResult): { next: SweepDraftState; write: number | null } {
  if (s.draft == null) return { next: s, write: null }
  const r = parse(s.draft)
  if (!r.ok) return { next: s, write: null }   // 非法：留原文＋紅框
  return { next: { draft: null }, write: r.value !== storeValue ? r.value : null }
}
