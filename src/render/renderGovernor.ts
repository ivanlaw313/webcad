// On-demand rendering governor (perf, v2.20 lag investigation).
//
// The main viewport used R3F's default frameloop="always": the full scene was
// re-rendered 60×/s even when nothing changed.  On GPU-less test boxes Chrome
// runs WebGL through SwiftShader (CPU), so one idle WebCAD tab burned ~1.5–2
// CPU cores forever and every click/rebuild had to compete with it (observed:
// three tester GPU processes at 150–190 % CPU each for 14 h).
//
// With frameloop="demand" a frame is drawn only when invalidate() is called.
// R3F already invalidates on reconciled prop changes and drei controls
// invalidate on camera change; this governor adds the remaining triggers:
//   • any store change (status, selections, imperative effects keyed on state),
//   • raw input events (hover highlights driven by refs, wheel zoom, keys),
//   • a short settle burst after each trigger (effects that mutate the scene
//     after React commits),
//   • a low-rate heartbeat as a safety net for async/imperative updates
//     (textures, worker results, Html overlays). Paused while the tab is hidden.
// Continuous animations call state.invalidate() from their own useFrame.

export type RenderGovernorDeps = {
  invalidate: () => void
  subscribe: (cb: () => void) => () => void
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null
  isHidden?: () => boolean
  setTimer?: (cb: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
  setRepeat?: (cb: () => void, ms: number) => unknown
  clearRepeat?: (id: unknown) => void
  heartbeatMs?: number
  settleMs?: number
}

export const RENDER_INPUT_EVENTS = ['pointermove', 'pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup', 'resize', 'focus'] as const
export const DEFAULT_HEARTBEAT_MS = 250
export const DEFAULT_SETTLE_MS = 120

export function startRenderGovernor(deps: RenderGovernorDeps): () => void {
  const setTimer = deps.setTimer ?? ((cb, ms) => setTimeout(cb, ms))
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>))
  const setRepeat = deps.setRepeat ?? ((cb, ms) => setInterval(cb, ms))
  const clearRepeat = deps.clearRepeat ?? ((id) => clearInterval(id as ReturnType<typeof setInterval>))
  const hidden = deps.isHidden ?? (() => false)
  const settleMs = deps.settleMs ?? DEFAULT_SETTLE_MS
  let settle: unknown = null
  const poke = () => {
    deps.invalidate()
    // One follow-up frame after effects/async handlers have run; coalesced so a
    // stream of pointermoves never queues more than one timer.
    if (settle == null) settle = setTimer(() => { settle = null; deps.invalidate() }, settleMs)
  }
  const unsub = deps.subscribe(poke)
  const t = deps.target
  if (t) for (const ev of RENDER_INPUT_EVENTS) t.addEventListener(ev, poke, { passive: true, capture: true } as AddEventListenerOptions)
  const beat = setRepeat(() => { if (!hidden()) deps.invalidate() }, deps.heartbeatMs ?? DEFAULT_HEARTBEAT_MS)
  deps.invalidate()
  return () => {
    unsub()
    if (t) for (const ev of RENDER_INPUT_EVENTS) t.removeEventListener(ev, poke, { capture: true } as EventListenerOptions)
    clearRepeat(beat)
    if (settle != null) clearTimer(settle)
  }
}
