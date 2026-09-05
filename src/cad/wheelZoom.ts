/**
 * Convert browser wheel events to a bounded pixel-like delta.
 *
 * Browsers report wheels in pixels, lines, or pages.  More importantly, modern
 * high-resolution wheels and trackpads emit many tiny events.  Keeping those
 * events tiny is what makes zoom continuous; imposing a minimum step makes the
 * camera race to its distance limits.
 */
export function normalizeWheelDelta(deltaY: number, deltaMode = 0): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1)
  return Math.max(-120, Math.min(120, pixels))
}

/** A smooth multiplicative camera-distance factor for one wheel event. */
export function wheelZoomFactor(
  deltaY: number,
  deltaMode = 0,
  fine = false,
  direction: 1 | -1 = 1,
): number {
  const delta = normalizeWheelDelta(deltaY, deltaMode) * direction
  // A conventional 100px mouse notch changes distance by about 5.7%; tiny
  // trackpad deltas remain proportionally tiny. Shift gives precision control.
  return Math.exp(delta * (fine ? 0.00018 : 0.00055))
}
