/**
 * v1.17 BUG-UI-001 follow-up: Timeline feature editor must show a visible
 * 「尺寸已拒绝」 alert (timeline-illegal-alert) when status is illegal, and
 * NumField must not use HTML min that blocks typing negatives before commit.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { illegalRejectStatus, ILLEGAL_REJECT_MARKER, ILLEGAL_LENGTH_DETAIL, isIllegalRejectStatus } from '../src/ui/illegalInput.ts'

const timeline = readFileSync(new URL('../src/components/Timeline.tsx', import.meta.url), 'utf8')
const version = readFileSync(new URL('../src/version.ts', import.meta.url), 'utf8')

test('v1.17: Timeline shows timeline-illegal-alert from illegal status', () => {
  assert.match(timeline, /data-testid="timeline-illegal-alert"/)
  assert.match(timeline, /isIllegalRejectStatus\(status\)/)
  assert.match(timeline, /from '\.\.\/ui\/illegalInput'/)
  assert.match(timeline, /role="alert"/)
})

test('v1.17: NumField keeps logical min commit reject without HTML min attr', () => {
  // Extract NumField block
  const start = timeline.indexOf('function NumField')
  assert.ok(start >= 0, 'NumField present')
  const end = timeline.indexOf('\n}', start)
  const block = timeline.slice(start, end + 2)
  assert.match(block, /illegalRejectStatus\(rejectDetail \|\| ILLEGAL_LENGTH_DETAIL\)/)
  assert.match(block, /skipCommit/)
  assert.match(block, /e\.key === 'Escape'/)
  // Must NOT put HTML min= on the input (logical min prop still used in commit)
  assert.doesNotMatch(block, /type="number"[^>]*\bmin=\{min\}/)
  assert.doesNotMatch(block, /\bmin=\{min\}/)
  assert.match(block, /min == null \|\| n >= min/)
  assert.match(timeline, /POSITIVE_LENGTH_KEYS\.has\(fd\.key\)\s*\?\s*1e-6/)
  assert.match(timeline, /rejectDetail=\{fd\.key === 'thickness' \? ILLEGAL_THICKNESS_DETAIL/)
})

test('v1.17: APP_VERSION is 1.17', () => {
  assert.match(version, /APP_VERSION = '1\.17'/)
})

test('helper: illegalRejectStatus still embeds marker for prim length', () => {
  assert.equal(ILLEGAL_REJECT_MARKER, '尺寸已拒绝')
  assert.equal(isIllegalRejectStatus(illegalRejectStatus(ILLEGAL_LENGTH_DETAIL)), true)
  assert.match(illegalRejectStatus(ILLEGAL_LENGTH_DETAIL), /尺寸已拒绝：尺寸必须大于 0/)
})
