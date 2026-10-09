import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const ribbon = readFileSync(new URL('../src/ribbon.ts', import.meta.url), 'utf8')

// Simulate the old vs new keystroke binding for typing "10" into 字高.
const typeInto = (onChange, keys) => { let v = 12, shown = ''; for (const k of keys) { shown = shown === '' ? k : shown + k; v = onChange(shown); shown = String(v || '') } return v }

test('字高 field: typing "10" yields 10 (no per-keystroke clamp)', () => {
  const oldBind = (raw) => Math.max(2, Number(raw) || 12)
  const newBind = (raw) => Number(raw) || 0
  assert.equal(typeInto(oldBind, ['1', '0']), 20)   // the bug
  assert.equal(typeInto(newBind, ['1', '0']), 10)
  assert.match(vp, /data-testid="sktext-size" value=\{dlg\.size \|\| ''\} onChange=\{\(e\) => g\(\)\.setSkTextDlg\(\{ size: Number\(e\.target\.value\) \|\| 0 \}\)\}/)
  assert.doesNotMatch(vp, /setSkTextDlg\(\{ size: Math\.max/)
  assert.doesNotMatch(vp, /setSkTextDlg\(\{ height: Math\.max/)
})

test('commit still clamps and sketch text yields extrudable poly profiles', () => {
  assert.match(store, /size = Math\.max\(2, dlg\.size \|\| 12\), h = Math\.max\(0\.2, dlg\.height \|\| 4\)/)
  assert.match(store, /cad\.textSketchContours\(txt, size\)/)
  assert.match(store, /sketchProfiles: \[\.\.\.s3\.sketchProfiles, \.\.\.shapes\]/)
})

test('sketch Text is a visible quick tool in SKETCH ▸ CREATE', () => {
  assert.match(ribbon, /id: 'sk_text', label: '文字', icon: 'default', glyph: 'T', quick: true/)
})
