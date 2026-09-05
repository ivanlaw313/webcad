/** Fusion-style coarse canvas manipulators. Numeric fields remain the precise input path. */
export function chamferDistanceFromDrag(startMm: number, deltaMm: number): number {
  const raw = Math.max(0, startMm + deltaMm)
  if (deltaMm > 0 && raw > 0 && raw < 5) return 5
  return Math.max(0, Math.round(raw / 5) * 5)
}

/** Fusion's Distance and Angle arc decreases when dragged to the right. */
export function chamferAngleFromDrag(startDeg: number, deltaXPx: number): number {
  return Math.min(90, Math.max(0, Math.round(startDeg - deltaXPx)))
}

export function filletRadiusFromDrag(startMm: number, deltaMm: number): number {
  return Math.round(Math.max(0.5, startMm + deltaMm) * 10) / 10
}
