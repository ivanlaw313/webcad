// Regression: openPropertiesDialog re-formats the mass row for massUnit kg/oz/lb by
// finding the row by label; propsReport emits '質量' but store looked for '质量',
// so the massUnit override silently never applied.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildPropsReport } from '../src/cad/propsReport.ts'

test('store mass-row lookup matches the label propsReport actually emits', () => {
  const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  const m = store.match(/const mr = rows\.find\(\(r\) => ([^\n]*?)\)\s/)
  assert.ok(m, 'mass row lookup present')
  const pred = new Function('r', 'return ' + m[1])
  const src = readFileSync(new URL('../src/cad/propsReport.ts', import.meta.url), 'utf8')
  const emitted = src.match(/rows\.push\(\{ label: '([^']+)', value: fmtMass\(/)
  assert.ok(emitted, 'propsReport mass row present')
  assert.equal(pred({ label: emitted[1] }), true, `lookup must match emitted label ${emitted[1]}`)
  assert.equal(typeof buildPropsReport, 'function')
})
