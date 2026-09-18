/**
 * v1.41 / v1.42 — mesh drag-and-drop helpers (STL / OBJ / 3MF).
 * Pure file-name / DataTransfer checks so contracts can assert filters without a browser.
 * Parse / insert still go through store openMeshInsert / import3MF (no duplicated parsers).
 *
 * v1.42: broaden dragover accept (automation often lacks `Files` in types until drop)
 * and prefer capture-phase listeners on viewport/app so WebGL <canvas> cannot block drop.
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
  const types = Array.from(dt.types as ArrayLike<string>)
  if (types.includes('Files')) return true
  if (types.includes('application/x-moz-file')) return true
  try {
    const items = dt.items
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        if (items[i]?.kind === 'file') return true
      }
    }
  } catch {
    /* DataTransferItemList may throw in some synthetic drags */
  }
  return false
}

/**
 * v1.42: during dragover, automation / some browsers omit `Files` from types until drop.
 * Still preventDefault so the subsequent drop is allowed (canvas otherwise swallows it).
 */
export function shouldAllowMeshDragOver(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false
  if (isFilesDrag(dt)) return true
  const types = dt.types ? Array.from(dt.types as ArrayLike<string>) : []
  if (types.length === 0) {
    const ea = String(dt.effectAllowed || '').toLowerCase()
    // OS file drags + Playwright/CDP file payloads often report these before types settle
    if (!ea || ea === 'all' || ea === 'copy' || ea === 'copymove' || ea === 'uninitialized' || ea === 'move') {
      return true
    }
  }
  return false
}

/** Shared drop resolve: prefer mesh file; else first file (store shows 不支持…); null if empty. */
export function resolveMeshDropFile(files: ArrayLike<File> | null | undefined): File | null {
  if (!files || !files.length) return null
  return firstMeshDropFile(files) ?? (files[0] ?? null)
}
