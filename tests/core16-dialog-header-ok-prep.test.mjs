/**
 * Phase2-prep (soft): CommandDialog header ✓ direction tests for tip 50abe04.
 *
 * Phase2 product (fix/ui-phase2-assemble-dialog) adds header chrome:
 *   className="cmd-palette-ok"
 *   onClick={() => { if (!okDisabled) onOk() }}
 * Footer data-testid="command-confirm" / "command-cancel" must stay.
 *
 * On tip 50abe04 header ✓ is absent — soft/skip those asserts with a Phase2
 * message. Footer confirm/cancel remain hard asserts (no regression).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const dlg = readFileSync(
  new URL('../src/components/CommandDialog.tsx', import.meta.url),
  'utf8',
)

const HAS_HEADER_OK = /className="cmd-palette-ok"/.test(dlg)

// --- Hard asserts that must not regress on tip ---

test('footer data-testid command-confirm + command-cancel still present', () => {
  assert.match(dlg, /data-testid="command-confirm"/)
  assert.match(dlg, /data-testid="command-cancel"/)
  assert.match(dlg, /onClick=\{onOk\}/)
})

// --- Soft / skip until Phase2 header ✓ lands ---

test(
  'CommandDialog header ✓ (cmd-palette-ok) shares onOk with footer',
  {
    skip:
      !HAS_HEADER_OK &&
      'Phase2 dialog header ✓ (cmd-palette-ok) not on tip yet',
  },
  () => {
    assert.match(dlg, /className="cmd-palette-ok"/)
    assert.match(dlg, /onClick=\{\(\) => \{ if \(!okDisabled\) onOk\(\) \}\}/)
    // Footer confirm kept + still wired to onOk
    assert.match(dlg, /data-testid="command-confirm"/)
    assert.match(dlg, /data-testid="command-cancel"/)
    assert.match(dlg, /onClick=\{onOk\}/)
  },
)
