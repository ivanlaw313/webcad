/** Split Body status: report active + total volume (all bodies), not just the active half. */
export function meshVolumeMm3(vertices: ArrayLike<number>, triangles: ArrayLike<number>): number {
  let v6 = 0
  for (let i = 0; i + 2 < triangles.length; i += 3) {
    const a = triangles[i] * 3, b = triangles[i + 1] * 3, c = triangles[i + 2] * 3
    const ax = vertices[a], ay = vertices[a + 1], az = vertices[a + 2]
    const bx = vertices[b], by = vertices[b + 1], bz = vertices[b + 2]
    const cx = vertices[c], cy = vertices[c + 1], cz = vertices[c + 2]
    v6 += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)
  }
  return Math.abs(v6) / 6
}

const cm3 = (mm3: number) => (mm3 / 1000).toFixed(2)

/** e.g. `（活動體 8.00 cm³ · 合共 20.00 cm³）` — Traditional source; tStatus handles zh-CN. */
export function splitVolumeNote(activeMm3: number, totalMm3: number): string {
  if (!(totalMm3 > 0)) return ''
  return `（活動體 ${cm3(activeMm3)} cm³ · 合共 ${cm3(totalMm3)} cm³）`
}

export function splitVolumeNoteForMesh(m: { vertices: ArrayLike<number>; triangles: ArrayLike<number>; parked?: { vertices: ArrayLike<number>; triangles: ArrayLike<number> }[] } | null | undefined): string {
  if (!m) return ''
  const active = meshVolumeMm3(m.vertices, m.triangles)
  const total = active + (m.parked ?? []).reduce((acc, p) => acc + meshVolumeMm3(p.vertices, p.triangles), 0)
  return splitVolumeNote(active, total)
}
