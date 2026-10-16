/**
 * CORE16 residual more21: Dialog OK/Cancel Formal Traditional Chinese.
 * CommandDialog default okLabel =「確定」; cancel chrome「取消」—
 * not English OK/Cancel as the zh-HK / source default.
 * Complements command-dialog-accessibility-contract (Esc aria) without DOM.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const cmd = readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')
const zhHK = readFileSync(new URL('../src/i18n/locales/zh-HK.ts', import.meta.url), 'utf8')
const i18n = readFileSync(new URL('../src/i18n.ts', import.meta.url), 'utf8')

const COLLOQ = /撳|撚|嘅|唔|喺|係咪|先至|吓|咗|嗰/

/** User-visible Formal strings pinned on the dialog foot / chrome. */
function visiblePins(src) {
  const pins = []
  for (const m of src.matchAll(/okLabel\s*=\s*'([^']+)'/g)) pins.push(m[1])
  for (const m of src.matchAll(/tStatus\('([^']+)'/g)) pins.push(m[1])
  return pins
}

test('CommandDialog default okLabel is Formal 確定 (not English OK)', () => {
  assert.match(cmd, /okLabel\s*=\s*'確定'/)
  assert.doesNotMatch(cmd, /okLabel\s*=\s*'OK'/)
  assert.doesNotMatch(cmd, /okLabel\s*=\s*"OK"/)
  assert.match(cmd, /data-testid="command-confirm"/)
  assert.match(cmd, /\{tStatus\(okLabel,\s*lang\)\}/)
  assert.match(cmd, /tStatus\('確定（Enter）',\s*lang\)/)
  for (const p of visiblePins(cmd)) {
    assert.doesNotMatch(p, COLLOQ, `colloquial visible pin: ${p}`)
  }
})

test('CommandDialog cancel chrome is Formal 取消 (not English Cancel)', () => {
  assert.match(cmd, /data-testid="command-cancel"/)
  assert.match(cmd, /\{tStatus\('取消',\s*lang\)\}/)
  assert.match(cmd, /tStatus\('取消（Esc）',\s*lang\)/)
  assert.doesNotMatch(cmd, />Cancel</)
  assert.doesNotMatch(cmd, /tStatus\('Cancel'/)
  assert.doesNotMatch(cmd, /tStatus\('OK'/)
})

test('zh-HK catalog dlg.ok / dlg.cancel Formal 確定／取消', () => {
  assert.match(zhHK, /"dlg\.ok":\s*"確定"/)
  assert.match(zhHK, /"dlg\.cancel":\s*"取消"/)
  assert.doesNotMatch(zhHK, /"dlg\.ok":\s*"OK"/)
  assert.doesNotMatch(zhHK, /"dlg\.cancel":\s*"Cancel"/)
  assert.doesNotMatch(zhHK, /"dlg\.ok":\s*"确定"/) // Simplified
  if (/"hist\.ok"/.test(zhHK)) {
    assert.match(zhHK, /"hist\.ok":\s*"確定"/)
    assert.match(zhHK, /"hist\.cancel":\s*"取消"/)
  }
})

test('i18n maps 取消 for status; no OK-as-default foot label in CommandDialog', () => {
  assert.match(i18n, /'取消':\s*'cancel'/)
  assert.match(i18n, /'取消（Esc）':\s*'Cancel \(Esc\)'/)
  // Foot buttons must go through tStatus Formal source, not raw English literals
  const footStart = cmd.indexOf('cmd-ok')
  assert.ok(footStart >= 0, 'cmd-ok foot missing')
  const foot = cmd.slice(footStart, footStart + 450)
  assert.match(foot, /確定|okLabel/)
  assert.match(foot, /取消/)
  assert.doesNotMatch(foot, />\s*OK\s*</)
  assert.doesNotMatch(foot, />\s*Cancel\s*</)
})
