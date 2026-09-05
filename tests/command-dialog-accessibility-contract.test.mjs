import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('all draggable command palettes expose their purpose to assistive technology', () => {
  const source = readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')
  // Attribute order is not an accessibility contract.  The dialog now also
  // carries a measuring ref/test id for viewport clamping, so verify the two
  // semantic attributes independently.
  assert.match(source, /className="cmd-palette"/)
  assert.match(source, /role="dialog"\s+aria-modal="true"/)
  assert.match(source, /aria-label=\{tStatus\(title, lang\)\}/)
  assert.match(source, /<button type="button" className="cmd-palette-x" aria-label=\{tStatus\('取消（Esc）', lang\)\}/)
})

test('command palettes focus a usable control while ribbon icon commands retain names', () => {
  const source = readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')
  const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
  const icons = readFileSync(new URL('../src/icons.tsx', import.meta.url), 'utf8')
  assert.match(source, /querySelector<HTMLElement>\('input:not\(:disabled\), textarea:not\(:disabled\)/)
  assert.match(source, /first instanceof HTMLInputElement\) first\.select\(\)/)
  assert.match(source, /window\.setTimeout/)
  assert.match(source, /tabIndex=\{-1\}/)
  assert.match(ribbon, /aria-label=\{tLabel\(t\.label, lang\)\}/)
  assert.match(ribbon, /aria-pressed=\{active \|\| undefined\}/)
  assert.match(icons, /aria-hidden="true" focusable="false"/)
})

test('numeric command dialogs submit on Enter and cancel on Escape', () => {
  const source = readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')
  assert.match(source, /onKeyDown=\{\(e\) => \{[\s\S]*?e\.key === 'Escape'[\s\S]*?onCancel\(\)/)
  assert.match(source, /e\.key === 'Enter' && !e\.nativeEvent\.isComposing[\s\S]*?!\(e\.target instanceof HTMLTextAreaElement\)[\s\S]*?!okDisabled/)
  assert.match(source, /e\.preventDefault\(\); e\.stopPropagation\(\); onOk\(\)/)
})
