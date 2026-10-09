// perf (v2.20 lag): main viewport renders on demand; governor supplies the triggers.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { startRenderGovernor, RENDER_INPUT_EVENTS } from '../src/render/renderGovernor.ts'

function harness(hidden = false) {
  let frames = 0, subs = [], listeners = new Map(), timers = [], repeats = []
  const deps = {
    invalidate: () => { frames++ },
    subscribe: (cb) => { subs.push(cb); return () => { subs = subs.filter((x) => x !== cb) } },
    target: { addEventListener: (t, cb) => listeners.set(t, cb), removeEventListener: (t) => listeners.delete(t) },
    isHidden: () => hidden,
    setTimer: (cb) => { const t = { cb }; timers.push(t); return t },
    clearTimer: (t) => { timers = timers.filter((x) => x !== t) },
    setRepeat: (cb) => { const t = { cb }; repeats.push(t); return t },
    clearRepeat: (t) => { repeats = repeats.filter((x) => x !== t) },
  }
  return { deps, get frames() { return frames }, get subs() { return subs }, listeners, get timers() { return timers }, get repeats() { return repeats } }
}

test('store change and input events request frames; settle timer is coalesced', () => {
  const h = harness()
  const stop = startRenderGovernor(h.deps)
  assert.equal(h.frames, 1, 'initial frame')
  h.subs[0]()
  assert.equal(h.frames, 2)
  for (const ev of RENDER_INPUT_EVENTS) assert.ok(h.listeners.has(ev), ev)
  for (let i = 0; i < 50; i++) h.listeners.get('pointermove')()
  assert.equal(h.frames, 52)
  assert.equal(h.timers.length, 1, 'one coalesced settle timer, not one per event')
  h.timers[0].cb()
  assert.equal(h.frames, 53)
  stop()
  assert.equal(h.subs.length, 0)
  assert.equal(h.listeners.size, 0)
  assert.equal(h.repeats.length, 0, 'heartbeat cleared on unmount (no interval leak)')
})

test('heartbeat is paused while the tab is hidden', () => {
  const h = harness(true)
  startRenderGovernor(h.deps)
  const f = h.frames
  h.repeats[0].cb(); h.repeats[0].cb()
  assert.equal(h.frames, f)
})

test('viewport uses on-demand frameloop and continuous animations keep requesting frames', () => {
  const vp = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
  assert.match(vp, /frameloop=\{VIEWPORT_FRAMELOOP\}/)
  assert.match(vp, /<RenderGovernor \/>/)
  // The 8k-line Viewport root must not re-render on every status message.
  const root = vp.slice(vp.indexOf('export default function Viewport()'))
  assert.doesNotMatch(root, /const status = useApp\(\(s\) => s\.status\)/)
  for (const f of ['WindStreaks', 'WindSmoke', 'PathTraceLayer']) {
    assert.match(readFileSync(new URL(`../src/components/${f}.tsx`, import.meta.url), 'utf8'), /state\.invalidate\(\)/, f)
  }
  assert.match(readFileSync(new URL('../src/components/SketchLayer.tsx', import.meta.url), 'utf8'), /if \(!tw \|\| !controls\) return\n\s+state\.invalidate\(\)/)
  assert.ok((vp.match(/state\.invalidate\(\)/g) ?? []).length >= 5, 'FEA/modal/stream/recorder animations invalidate')
})
