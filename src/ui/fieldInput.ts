/**
 * Shared text-field semantics for feature-dialog inputs (Extrude ƒx distance, fillet/chamfer/shell
 * edit, pattern, offset …) and the global hotkey guard.
 *
 * Bug (Extrude ƒx field, a5a059f live): click → Ctrl+A → type "25" gave "02" (ƒx = 2 mm). The
 * ExpressionInput was a fully *controlled* view of the store (`extrudeExpression ??
 * toLenInput(extrudeHeight)` / `featDlg.params.heightExpr`), so any store write while typing
 * (setExtrudeHeight from the canvas arrow / ext dimension, dialog re-open reset, preview
 * recompute) re-derived the visible text and reset caret/selection; and the window keydown
 * guard still let Ctrl+A/C/V/X and Enter fall through to sketch-mode handlers (the Extrude
 * dialog lives in sketch mode: Ctrl+V = paste sketch selection, Enter/digits = type-to-place).
 *
 * Rules:
 *   · while focused the field shows its own DRAFT string; external values never overwrite it;
 *   · every edit is reported (live preview / OK gating) but the draft is not re-formatted;
 *   · blur / Enter flush the draft once more (idempotent) and hand display back to the model;
 *   · editing keys inside any input/textarea/select/contenteditable never reach global hotkeys.
 */

export type FieldDraft = { focused: boolean; draft: string }

export const idleDraft: FieldDraft = { focused: false, draft: '' }

/** Focus: start a draft from what the field was showing. */
export const focusDraft = (external: string): FieldDraft => ({ focused: true, draft: external })

/** Typing: the draft is exactly what the user typed — never normalised. */
export const editDraft = (s: FieldDraft, text: string): FieldDraft => ({ ...s, draft: text })

/** What the <input> shows: the draft while focused, the model value otherwise. */
export const shownText = (s: FieldDraft, external: string): string => (s.focused ? s.draft : external)

/** Blur/Enter: text to commit (only when it differs from the model) and the next state. */
export function commitDraft(s: FieldDraft, external: string, opts: { keepFocus?: boolean } = {}): { next: FieldDraft; commit: string | null } {
  if (!s.focused) return { next: s, commit: null }
  const commit = s.draft !== external ? s.draft : null
  return { next: opts.keepFocus ? s : idleDraft, commit }
}

type ElLike = { tagName?: string; isContentEditable?: boolean; type?: string } | null | undefined

/** ASM2 #6：冇文字可撤銷嘅 <input>（滑桿／勾選／顏色…）— 焦點喺佢身上時 Ctrl+Z／Ctrl+Y 照樣係「模型撤銷／重做」。 */
const NON_TEXT_INPUT = new Set(['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file', 'image'])
/** 焦點元素自己有原生文字撤銷（Ctrl+Z 應留畀欄位）？滑桿等非文字 input → false。 */
export const ownsTextUndo = (el: ElLike): boolean =>
  !!el && (el.tagName === 'TEXTAREA' || !!el.isContentEditable || (el.tagName === 'INPUT' && !NON_TEXT_INPUT.has(String(el.type || 'text').toLowerCase())))

/** input / textarea / select / contenteditable — anything that owns its own keystrokes. */
export const isTextEntry = (el: ElLike): boolean =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || !!el.isContentEditable)

type KeyLike = { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }

/** Clipboard / select-all / text undo-redo: always native inside a field (never sketch copy/paste or model undo). */
const FIELD_NATIVE_CTRL = new Set(['a', 'c', 'v', 'x', 'z', 'y'])

/**
 * Should a window-level hotkey handler ignore this key because a field owns it?
 *   'field'  → yes, return immediately (typing, caret keys, Ctrl+A/C/V/X/Z/Y);
 *   'dialog' → Enter/Escape in a field: dialog-level only (commit/cancel), never sketch type-to-place;
 *   'global' → not in a field (or an app-wide modifier shortcut like Ctrl+S) — normal hotkeys.
 */
export function fieldKeyOwner(e: KeyLike, target: ElLike, active: ElLike): 'field' | 'dialog' | 'global' {
  if (!isTextEntry(target) && !isTextEntry(active)) return 'global'
  if (e.ctrlKey || e.metaKey) {
    const k = e.key.toLowerCase()
    if ((k === 'z' || k === 'y') && !ownsTextUndo(target) && !ownsTextUndo(active)) return 'global'   // ASM2 #6：滑桿上 Ctrl+Z = 模型撤銷
    return FIELD_NATIVE_CTRL.has(k) ? 'field' : 'global'
  }
  if (e.key === 'Enter' || e.key === 'Escape') return 'dialog'
  return 'field'
}

/** T4: F2 on a selected feature → its browser-tree row turns into the rename input (detail = feature id). */
export const FEATURE_RENAME_EVENT = 'webcad:rename-feature'
/** FISHING3 P3: F2 on selected body / component → browser-tree rename input. */
export const BODY_RENAME_EVENT = 'webcad:rename-body'
export const COMPONENT_RENAME_EVENT = 'webcad:rename-component'
