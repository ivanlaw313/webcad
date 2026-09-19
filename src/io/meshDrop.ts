/**
 * v1.41–v1.43 — mesh drag-and-drop helpers (STL / OBJ / 3MF).
 * Pure file-name / DataTransfer checks so contracts can assert filters without a browser.
 * Parse / insert still go through store openMeshInsert / import3MF (no duplicated parsers).
 *
 * v1.42: broaden dragover accept (automation often lacks `Files` in types until drop)
 * and prefer capture-phase listeners on viewport/app so WebGL <canvas> cannot block drop.
 *
 * v1.43 BUG-BD-4101: document-level capture + viewport overlay drop target; read files via
 * DataTransferItemList.getAsFile when `.files` is empty; never silent-no-op on empty drop;
 * more permissive dragover so OS/automation drags actually arm dropEffect=copy.
 */

export type MeshDropKind = 'stl' | 'obj' | '3mf'

/** Extensions accepted for MESH drag-drop (same families as openStlDialog / openObjDialog / open3MFDialog). */
export const MESH_DROP_EXTS = ['.stl', '.obj', '.3mf'] as const

/** Shown when drop fires but no File payload could be read (remote DnD / automation). */
export const MESH_DROP_EMPTY_STATUS =
  '未能读取拖放文件（请确认拖的是本地 .stl/.obj/.3mf，或改用 File→导入 STL）'

/** Brief status while a file-like drag is over the viewport overlay. */
export const MESH_DROP_ARMED_STATUS = '放開以匯入網格（.stl / .obj / .3mf）'

/** v1.44: status when user switches to MESH tab — surfaces drag-drop as primary import path. */
export const MESH_TAB_DROP_HINT =
  '可将 .stl / .obj / .3mf 拖到视口导入（或用「插入STL」/ File→导入）'

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
 * Collect File objects from a DataTransfer.
 * Prefer `.files`; fall back to `items[i].getAsFile()` (some automation / CDP paths
 * populate items but leave FileList empty until/unless getAsFile is called).
 */
export function filesFromDataTransfer(dt: DataTransfer | null | undefined): File[] {
  if (!dt) return []
  const out: File[] = []
  try {
    if (dt.files && dt.files.length > 0) {
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files[i]
        if (f) out.push(f)
      }
      if (out.length) return out
    }
  } catch {
    /* ignore */
  }
  try {
    const items = dt.items
    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (!it || it.kind !== 'file') continue
        try {
          const f = it.getAsFile()
          if (f) out.push(f)
        } catch {
          /* getAsFile may throw for non-file items */
        }
      }
    }
  } catch {
    /* ignore */
  }
  return out
}

/**
 * v1.42/v1.43: during dragover, automation / some browsers omit `Files` from types until drop.
 * Still preventDefault so the subsequent drop is allowed (canvas otherwise swallows it).
 * v1.43: also accept uri-list / plain / empty effectAllowed file-like payloads.
 */
export function shouldAllowMeshDragOver(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false
  if (isFilesDrag(dt)) return true
  const types = dt.types ? Array.from(dt.types as ArrayLike<string>) : []
  const ea = String(dt.effectAllowed || '').toLowerCase()
  const fileLikeEffect =
    !ea ||
    ea === 'all' ||
    ea === 'copy' ||
    ea === 'copymove' ||
    ea === 'uninitialized' ||
    ea === 'move' ||
    ea === 'link' ||
    ea === 'allcopylink' ||
    ea === 'copylink' ||
    ea.includes('copy')
  if (types.length === 0) {
    return fileLikeEffect
  }
  // Chromium/CDP / some OS bridges advertise these before Files settles.
  // Avoid arming on in-page text selections (usually text/plain + text/html together).
  if (types.includes('text/uri-list')) return fileLikeEffect
  if (types.includes('text/plain') && !types.includes('text/html')) return fileLikeEffect
  // application/* without Files still often means a file payload is coming
  if (types.some((t) => t.startsWith('application/') && t !== 'application/json')) {
    return true
  }
  return false
}

/** Shared drop resolve: prefer mesh file; else first file (store shows 不支持…); null if empty. */
export function resolveMeshDropFile(files: ArrayLike<File> | null | undefined): File | null {
  if (!files || !files.length) return null
  return firstMeshDropFile(files) ?? (files[0] ?? null)
}

/** Resolve from a full DataTransfer (files + items fallback). */
export function resolveMeshDropFromDataTransfer(dt: DataTransfer | null | undefined): File | null {
  return resolveMeshDropFile(filesFromDataTransfer(dt))
}

/** Dedup rapid double-dispatch from document + overlay + viewport hosts. */
let _lastDropKey = ''
let _lastDropAt = 0

export function meshDropDedupeKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`
}

export function shouldAcceptMeshDropNow(file: File, now = Date.now()): boolean {
  const key = meshDropDedupeKey(file)
  if (key === _lastDropKey && now - _lastDropAt < 800) return false
  _lastDropKey = key
  _lastDropAt = now
  return true
}

/** Test helper — reset dedupe between contract runs if needed. */
export function resetMeshDropDedupe(): void {
  _lastDropKey = ''
  _lastDropAt = 0
}
