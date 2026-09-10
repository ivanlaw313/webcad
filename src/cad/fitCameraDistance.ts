/** Distance from a sphere's center that fits both perspective frustum axes. */
export function fitCameraDistance(radius: number, fov: number, aspect: number, zoom = 1, margin = 1.15): number {
  const vertical = Math.tan(fov * Math.PI / 360) / Math.max(zoom, 1e-6)
  const limitingHalfAngle = Math.atan(vertical * Math.min(Math.max(aspect, 1e-6), 1))
  return radius * margin / Math.sin(limitingHalfAngle)
}
