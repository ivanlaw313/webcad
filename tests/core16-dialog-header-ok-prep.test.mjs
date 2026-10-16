/**
 * more23 hardened: CommandDialog header ✓ (cmd-palette-ok) shares onOk with footer.
 *
 * Phase2 product (≥400c9b9) adds header chrome:
 *   className="cmd-palette-ok"
 *   onClick={() => { if (!okDisabled) onOk() }}
 * Footer data-testid="command-confirm" / "command-cancel" must stay.
 *
 * Hard PASS on Phase2/3 tip — no soft/skip.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dlg = readFileSync(
  new URL('../src/components/CommandDialog.tsx', import.meta.url),
  'utf8',
)

test('footer data-testid command-confirm + command-cancel still present', () => {
  assert.match(dlg, /data-testid="command-confirm"/)
  assert.match(dlg, /data-testid="command-cancel"/)
  assert.match(dlg, /onClick=\{onOk\}/)
})

test('CommandDialog header ✓ (cmd-palette-ok) shares onOk with footer', () => {
  assert.match(dlg, /className="cmd-palette-ok"/)
  assert.match(dlg, /onClick=\{\(\) => \{ if \(!okDisabled\) onOk\(\) \}\}/)
  // Footer confirm kept + still wired to onOk
  assert.match(dlg, /data-testid="command-confirm"/)
  assert.match(dlg, /data-testid="command-cancel"/)
  assert.match(dlg, /onClick=\{onOk\}/)
})
