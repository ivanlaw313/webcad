/** Neutral CAD edges must remain visible against both dark and light materials. */
export function visibleEdgeColor(color: string): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1]
  if (!hex) return '#17212b'
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
  const luminance = .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2]
  return luminance < .18 ? '#bfc8d2' : '#17212b'
}
