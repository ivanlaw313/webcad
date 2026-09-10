// Prevent browser defaults without stealing Esc from a focused editor or IME.
// Repeated keydown events must never walk through several cancellation layers.
export function protectEscape(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  if (e.repeat) e.stopImmediatePropagation()
}

type Layer = { priority: number; dismiss: () => void }
const layers: Layer[] = []
const dispatch = (e: KeyboardEvent) => {
  if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return
  const top = layers.reduce<Layer | undefined>((a, b) => !a || b.priority >= a.priority ? b : a, undefined)
  if (!top) return
  e.preventDefault()
  e.stopImmediatePropagation()
  if (!e.repeat) top.dismiss()
}
export function registerEscapeLayer(dismiss: () => void, priority = 100): () => void {
  const layer = { dismiss, priority }
  if (!layers.length) window.addEventListener('keydown', dispatch, true)
  layers.push(layer)
  return () => {
    const i = layers.indexOf(layer)
    if (i >= 0) layers.splice(i, 1)
    if (!layers.length) window.removeEventListener('keydown', dispatch, true)
  }
}
