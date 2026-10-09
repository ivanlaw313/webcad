// UX1 #4：單鍵全域快捷鍵唔准由欄位打字漏出（H=孔…）。真瀏覽器：scripts/e2e-shortcut-guard.mjs（修正前：
// 焦點喺對話框容器打 hef → hole/extrude/fillet；欄位打字中被 unmount → 'h' 開孔）。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createShortcutGuard, isSingleKeyShortcut, isTextField, FIELD_GRACE_MS } from '../src/cad/shortcutGuard.ts'

const el = (tagName, extra = {}) => ({ tagName, isConnected: true, closest: () => null, ...extra })
const body = el('BODY')
const dialogBtn = el('BUTTON', { closest: (s) => (s.includes('role="dialog"') ? {} : null) })
const k = (key, mods = {}) => ({ key, ...mods })

test('classification helpers', () => {
  assert.ok(isTextField(el('INPUT')) && isTextField(el('TEXTAREA')) && isTextField(el('SELECT')) && isTextField(el('DIV', { isContentEditable: true })))
  assert.ok(!isTextField(el('BUTTON')) && !isTextField(null))
  assert.ok(isSingleKeyShortcut(k('h')) && isSingleKeyShortcut(k('Delete')) && isSingleKeyShortcut(k('Backspace')))
  assert.ok(!isSingleKeyShortcut(k('z', { ctrlKey: true })) && !isSingleKeyShortcut(k('Enter')) && !isSingleKeyShortcut(k('Escape')) && !isSingleKeyShortcut(k('h', { altKey: true })))
})

test('focused input / textarea / contenteditable blocks single keys (ƒx, params, rename fields)', () => {
  const g = createShortcutGuard(() => 0)
  for (const f of [el('INPUT'), el('TEXTAREA'), el('DIV', { isContentEditable: true })]) assert.ok(g.blocks(k('h'), f, f))
  assert.ok(!g.blocks(k('z', { ctrlKey: true }), el('INPUT'), el('INPUT')), 'modifier shortcuts are not this guard’s business')
})

test('field removed / disabled while typing → next letters still blocked; Enter/Tab/Esc = deliberate leave', () => {
  let t = 1000; const g = createShortcutGuard(() => t)
  const field = el('INPUT')
  g.note(k('1'), field, field)
  field.isConnected = false; t += 100
  assert.ok(g.blocks(k('h'), body, body), 'unmounted under the caret')
  t += 200; assert.ok(g.blocks(k('2'), body, body), 'keeps blocking while the user keeps typing')
  t += FIELD_GRACE_MS + 10; assert.ok(!g.blocks(k('h'), body, body), 'after the grace period shortcuts work again')
  const f2 = el('INPUT'); g.note(k('5'), f2, f2); f2.disabled = true; t += 50
  assert.ok(g.blocks(k('h'), f2, body), 'field disabled during preview → Chrome dropped focus')
  const f3 = el('INPUT'); g.note(k('Enter'), f3, f3); t += 50
  assert.ok(!g.blocks(k('e'), body, body), 'Enter committed the field → E is a real shortcut')
  const f4 = el('INPUT'); g.note(k('3'), f4, f4); t += 50
  assert.ok(!g.blocks(k('e'), el('CANVAS'), el('CANVAS')), 'user deliberately moved focus to the canvas')
})

test('focus parked on a dialog (container / button / label) blocks single keys; body with no dialog focus does not', () => {
  const g = createShortcutGuard(() => 0)
  assert.ok(g.blocks(k('h'), dialogBtn, dialogBtn))
  assert.ok(!g.blocks(k('h'), body, body))
  assert.ok(!g.blocks(k('Enter'), dialogBtn, dialogBtn), 'Enter/Esc still go to the dialog')
})

test('App wires the guard: capture-phase note + early return in onKey', () => {
  const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  assert.match(app, /import \{ createShortcutGuard \} from '\.\/cad\/shortcutGuard'/)
  assert.match(app, /window\.addEventListener\('keydown', noteFieldKey, true\)/)
  assert.match(app, /if \(guard\.blocks\(e, e\.target as HTMLElement \| null, document\.activeElement as HTMLElement \| null\)\) return/)
  assert.ok(app.indexOf('guard.blocks(') < app.indexOf("case 'h': if (s.mode === 'model') s.runCommand('hole'"))
})
