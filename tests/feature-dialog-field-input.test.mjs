// Extrude ƒx distance field (and every feature-dialog field): click → Ctrl+A → "25" must give 25,
// not "02". Pure draft/commit logic + global key guard, plus wiring contracts.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { idleDraft, focusDraft, editDraft, shownText, commitDraft, isTextEntry, fieldKeyOwner } from '../src/ui/fieldInput.ts'

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')

test('draft: focused field shows what the user typed even when the store value is re-derived', () => {
  let s = focusDraft('0')                       // dialog opens with 0, field focused
  assert.equal(shownText(s, '0'), '0')
  s = editDraft(s, '2')                         // select-all + "2"
  assert.equal(shownText(s, '0'), '2', 'store not yet updated → still the draft')
  assert.equal(shownText(s, '2'), '2')
  // preview / canvas / dialog writes re-derive the store text mid-typing — must not overwrite the draft
  assert.equal(shownText(s, '2.0'), '2')
  assert.equal(shownText(s, '0'), '2')
  s = editDraft(s, '25')
  assert.equal(shownText(s, '0'), '25')
  // the draft keeps the user's raw text, never normalised
  assert.equal(shownText(editDraft(s, '025'), '25'), '025')
  assert.equal(shownText(editDraft(s, 'd1*2 '), '0'), 'd1*2 ')
})

test('draft: commit on blur/Enter only when changed; blur hands display back to the model', () => {
  const s = editDraft(focusDraft('10'), '25')
  const enter = commitDraft(s, '10', { keepFocus: true })
  assert.equal(enter.commit, '25'); assert.equal(enter.next.focused, true); assert.equal(enter.next.draft, '25')
  const blur = commitDraft(s, '10')
  assert.equal(blur.commit, '25'); assert.deepEqual(blur.next, idleDraft)
  assert.equal(shownText(blur.next, '25'), '25')
  assert.equal(commitDraft(s, '25').commit, null, 'already reported live → no duplicate commit')
  assert.equal(commitDraft(idleDraft, '10').commit, null, 'unfocused blur never commits')
  assert.equal(shownText(idleDraft, '40'), '40')
})

test('key guard: any focused input/textarea/select/contenteditable owns its keys', () => {
  const input = { tagName: 'INPUT' }, body = { tagName: 'BODY' }, canvas = { tagName: 'CANVAS' }
  for (const el of [input, { tagName: 'TEXTAREA' }, { tagName: 'SELECT' }, { tagName: 'DIV', isContentEditable: true }]) assert.equal(isTextEntry(el), true)
  for (const el of [body, canvas, null, undefined]) assert.equal(isTextEntry(el), false)
  // digits / letters / caret keys typed into the dialog field: never sketch type-to-place or E/F/D hotkeys
  for (const key of ['2', '5', '0', '.', '-', 'e', 'f', 'd', 'r', 'Backspace', 'Delete', 'ArrowLeft', 'Home', 'Tab', ' '])
    assert.equal(fieldKeyOwner({ key }, input, input), 'field', key)
  // target retargeted to body mid re-render but focus still in the field → still the field's
  assert.equal(fieldKeyOwner({ key: '5' }, body, input), 'field')
  // Ctrl/Cmd + A/C/V/X/Z/Y are native text editing (select-all, clipboard, text undo)
  for (const key of ['a', 'A', 'c', 'v', 'x', 'z', 'y']) {
    assert.equal(fieldKeyOwner({ key, ctrlKey: true }, input, input), 'field', 'Ctrl+' + key)
    assert.equal(fieldKeyOwner({ key, metaKey: true }, input, input), 'field', 'Cmd+' + key)
  }
  // app-wide modifier shortcuts still work from a field
  assert.equal(fieldKeyOwner({ key: 's', ctrlKey: true }, input, input), 'global')
  // Enter / Esc are dialog keys (commit / cancel) — not sketch typing
  assert.equal(fieldKeyOwner({ key: 'Enter' }, input, input), 'dialog')
  assert.equal(fieldKeyOwner({ key: 'Escape' }, input, input), 'dialog')
  // no field focused → normal hotkeys
  assert.equal(fieldKeyOwner({ key: '2' }, canvas, body), 'global')
  assert.equal(fieldKeyOwner({ key: 'a', ctrlKey: true }, body, body), 'global')
})

test('wiring: ExpressionInput keeps a local draft, select-all survives click, keys isolated', () => {
  const ei = src('components/ExpressionInput.tsx')
  assert.match(ei, /const shown=shownText\(fd,text\)/)
  assert.match(ei, /value=\{shown\}/)
  assert.doesNotMatch(ei, /value=\{text\}/, 'field must not be a direct controlled view of the store')
  assert.match(ei, /onBlur=\{\(\)=>\{keepSel\.current=false;flush\(\)\}\}/)
  assert.match(ei, /onMouseUp=/)
  assert.match(ei, /fieldKeyOwner\(e,e\.currentTarget,e\.currentTarget\)==='field'\)e\.stopPropagation\(\)/)
})

test('wiring: CommandDialog isolates field keys for every feature dialog; App guard skips sketch typing in fields', () => {
  assert.match(src('components/CommandDialog.tsx'), /className="cmd-palette-body" hidden=\{collapsed\} onKeyDown=\{\(e\) => \{ if \(fieldKeyOwner\(e, e\.target as HTMLElement, document\.activeElement as HTMLElement \| null\) === 'field'\) e\.stopPropagation\(\)/)
  const app = src('App.tsx')
  assert.match(app, /editingText && \(e\.ctrlKey \|\| e\.metaKey\) && \['a', 'c', 'v', 'x'\]\.includes\(e\.key\.toLowerCase\(\)\)\) return/)
  assert.match(app, /if \(!editingText && s\.mode === 'sketch' && s\.sizing &&/)
  assert.match(app, /if \(!editingText && s\.mode === 'sketch' && \(s\.sketchStart != null \|\| s\.polyPts\.length > 0\) &&/)
  assert.match(app, /if \(!editingText && s\.mode === 'sketch' && s\.sketchStart == null && s\.polyPts\.length === 0/)
})
