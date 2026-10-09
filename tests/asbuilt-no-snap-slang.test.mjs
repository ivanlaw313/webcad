import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
test('as-built joint tooltip is formal Traditional without English snap slang', () => {
  const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  const tip = tree.match(/title=\{tStatus\('([^']*按現狀關節[^']*)'/)
  assert.ok(tip, 'as-built tooltip present')
  assert.doesNotMatch(tip[1], /snap/i)
  assert.match(tip[1], /不會先移動或吸附組件/)
  const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')
  assert.match(i18n, /不會先移動或吸附組件/)
  assert.doesNotMatch(i18n, /不 snap 不移動位/)
})
