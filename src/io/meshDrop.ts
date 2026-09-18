/**
 * v1.41 — mesh drag-and-drop helpers (STL / OBJ / 3MF).
 * Pure file-name / DataTransfer checks so contracts can assert filters without a browser.
 * Parse / insert still go through store openMeshInsert / import3MF (no duplicated parsers).
 */

export type MeshDropKind = 'stl' | 'obj' | '3mf'

/** Extensions accepted for MESH drag-drop (same families as openStlDialog / openObjDialog / open3MFDialog). */
export const MESH_DROP_EXTS = ['.stl', '.obj', '.3mf'] as const

export function meshDropKind(filename: string): MeshDropKind | null {
  const m = /\.([^.]+)$/.exec(String(filename || '').trim().toLowerCase())
  if (!m) return null
  const ext = m[1]
  if (ext === 'stl') return 'stl'
  if (ext === 'obj') return 'obj'
  if (ext === '3mf') return '3mf'
  return null
}

export function firstMeshDropFile(files: ArrayLike<File> | null | undefined): File | null {
  if (!files || !files.length) return null
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    if (f && meshDropKind(f.name)) return f
  }
  return null
}

/** True when a drag event carries OS files (extensions unknown until drop). */
export function isFilesDrag(dt: DataTransfer | null | undefined): boolean {
  if (!dt || !dt.types) return false
  return Array.from(dt.types as ArrayLike<string>).includes('Files')
}
