// FISHING14 P2：基本體面板（長方體／圓柱／球／圓錐／圓環…）正常速度打字唔掉字、Tab 唔走出面板、訊息行唔推郁按鈕；
// P3：草圖圓角半徑尺寸狀態列顯示「R … mm」而唔係內部類型「rad」。
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createSettledCommit, trapTabIndex, PRIM_PANEL_KINDS, PRIM_FIELD_SETTLE_MS } from '../src/ui/fieldInput.ts'
import { sketchDimLabel } from '../src/sketch/dimLabel.ts'

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const fakeTimers = () => {
  const q = new Map(); let id = 0
  return { set: (fn) => { q.set(++id, fn); return id }, clear: (h) => q.delete(h), fire: () => { const fns = [...q.values()]; q.clear(); fns.forEach((f) => f()) }, size: () => q.size }
}

test('settled commit: keystrokes only touch the draft; one store write after the user stops', () => {
  const t = fakeTimers(); const writes = []
  const c = createSettledCommit((raw) => writes.push(raw), 180, t)
  c.push('1'); c.push('11'); c.push('110')
  assert.deepEqual(writes, [], 'no per-keystroke store write (no re-render / preview from "1")')
  assert.equal(t.size(), 1, 'one pending timer, restarted per key')
  t.fire()
  assert.deepEqual(writes, ['110'])
  assert.equal(c.flush(), false, 'nothing pending → flush is a no-op')
})

test('settled commit: Tab / Enter / blur flush immediately and exactly once', () => {
  const t = fakeTimers(); const writes = []
  const c = createSettledCommit((raw) => writes.push(raw), 180, t)
  c.push('7'); c.push('70')
  assert.equal(c.flush(), true)
  assert.deepEqual(writes, ['70'])
  assert.equal(t.size(), 0, 'timer cleared by the flush')
  t.fire(); c.flush()
  assert.deepEqual(writes, ['70'], 'no duplicate write')
  c.push('8'); c.cancel(); t.fire()
  assert.deepEqual(writes, ['70'], 'cancel drops the draft')
  assert.ok(PRIM_FIELD_SETTLE_MS >= 100 && PRIM_FIELD_SETTLE_MS <= 300)
})

test('focus trap: Tab on the last control wraps to the first, Shift+Tab on the first wraps to the last', () => {
  assert.equal(trapTabIndex(9, 8, false), 0)
  assert.equal(trapTabIndex(9, 0, true), 8, 'Shift+Tab from 長 no longer leaves the page for the Chrome toolbar')
  assert.equal(trapTabIndex(9, 3, false), null, 'middle fields keep the native order')
  assert.equal(trapTabIndex(9, 3, true), null)
  assert.equal(trapTabIndex(9, -1, false), 0, 'focus on the dialog container → first control')
  assert.equal(trapTabIndex(9, -1, true), 8)
  assert.equal(trapTabIndex(0, -1, false), null)
})

test('every primitive panel kind uses the draft/settle fields', () => {
  for (const k of ['box', 'cylinder', 'sphere', 'cone', 'torus', 'wedge', 'dome', 'prism', 'pyramid', 'tube', 'coil', 'gear']) assert.ok(PRIM_PANEL_KINDS.has(k), k)
  for (const k of ['pattern', 'move', 'shell-edit', 'extrude-edit']) assert.ok(!PRIM_PANEL_KINDS.has(k), k + ' keeps per-keystroke reporting')
})

test('wiring: LenInput / FeatNum live-report inside primitive panels; dialog traps Tab and never steals focus; message slot fixed height', () => {
  const vp = src('components/Viewport.tsx')
  assert.match(vp, /<PrimFieldCtx\.Provider value=\{PRIM_PANEL_KINDS\.has\(featDlg\.kind\)\}>/)
  assert.equal((vp.match(/useSettledField\(/g) || []).length, 3, 'hook defined once + used by LenInput and FeatNum')
  // preview-lag：每鍵即時 report(raw)，唔再 if (settle) push —— 預覽／體積跟欄位草稿
  assert.match(vp, /change: \(raw: string\) => \{ report\(raw\) \}/)
  assert.doesNotMatch(vp, /if \(settle\) ref\.current!\.push\(raw\)/)
  assert.match(vp, /onBlur=\{\(\) => \{ fld\.flush\(\)/)
  assert.match(vp, /data-testid="feat-msg-slot"[^>]*style=\{slot\}/)
  assert.match(vp, /height: 32, flex: '0 0 32px'/)
  assert.match(vp, /data-testid="prim-illegal-alert"/)
  assert.match(vp, /\[data-dim-editor\],\.cmd-palette'\)\) ae\.blur\(\)/, 'clicking dialog padding/labels keeps the field focused')
  const cd = src('components/CommandDialog.tsx')
  assert.match(cd, /trapTabIndex\(list\.length/)
  assert.match(cd, /if \(ae && ae !== dialogRef\.current && dialogRef\.current\?\.contains\(ae\)\) return/)
})

test('preview-lag: prim panel docs require live store report (not settle-before-preview)', () => {
  const fi = src('ui/fieldInput.ts')
  assert.match(fi, /每粒鍵即時 report/)
  assert.match(fi, /基本體面板改走 live report|基本體面板改用即時 report/)
  const vp = src('components/Viewport.tsx')
  assert.match(vp, /每鍵即時 report store/)
})

test('P3: sketch radius / diameter dimension labels use R / Ø + length unit, never "rad"', () => {
  assert.equal(sketchDimLabel({ type: 'rad', value: 21 }), 'R 21 mm')
  assert.equal(sketchDimLabel({ type: 'rad', value: 5, radDiaFlip: true }), 'Ø 10 mm')
  assert.equal(sketchDimLabel({ type: 'dia', value: 10 }), 'Ø 10 mm')
  assert.equal(sketchDimLabel({ type: 'dia', value: 10, radDiaFlip: true }), 'R 5 mm')
  assert.equal(sketchDimLabel({ type: 'rad', value: 25.4 }, 'inch'), 'R 1 in')
  assert.equal(sketchDimLabel({ type: 'angle', value: 30 }), '角度 30°')
  assert.equal(sketchDimLabel({ type: 'len', value: 40 }), '長度 40 mm')
  const st = src('store.ts')
  assert.match(st, /sketchDimLabel\(c, s\.unit === 'inch' \? 'inch' : 'mm'\)/)
  assert.doesNotMatch(st, /`尺寸 \$\{c\.name \?\? ''\}（\$\{c\.type\}）`/)
})
