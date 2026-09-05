// Importing a large mesh expands substantially: binary STL becomes three JS number
// arrays (positions, normals and indices), so the on-disk size is not a safe RAM bound.
export const LARGE_MESH_TRIANGLES = 500_000
export const LARGE_MESH_BYTES = 64 * 1024 * 1024

export type MeshImportRisk = { triangles: number | null; bytes: number; requiresConfirm: boolean; reason: string }

export function binaryStlTriangleCount(buf: ArrayBuffer): number | null {
  if (buf.byteLength < 84) return null
  const n = new DataView(buf).getUint32(80, true)
  return n > 0 && 84 + n * 50 <= buf.byteLength ? n : null
}

export function meshImportRisk(buf: ArrayBuffer, kind: 'stl' | '3mf' = 'stl'): MeshImportRisk {
  const triangles = kind === 'stl' ? binaryStlTriangleCount(buf) : null
  const requiresConfirm = buf.byteLength >= LARGE_MESH_BYTES || (triangles != null && triangles >= LARGE_MESH_TRIANGLES)
  const reason = triangles != null
    ? `${triangles.toLocaleString()} 三角面`
    : `${(buf.byteLength / 1048576).toFixed(1)} MB 壓縮檔`
  return { triangles, bytes: buf.byteLength, requiresConfirm, reason }
}

export function textMeshImportRisk(text: string, limitBytes = LARGE_MESH_BYTES): MeshImportRisk {
  // JS strings are UTF-16; this is intentionally a conservative memory estimate without allocating an encoder buffer.
  const bytes = text.length * 2
  return { triangles: null, bytes, requiresConfirm: bytes >= limitBytes, reason: `${(bytes / 1048576).toFixed(1)} MB 文字網格檔` }
}
