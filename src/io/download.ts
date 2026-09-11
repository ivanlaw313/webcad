// Durable download helper (BUG-UI-002 Save/Export P0; BUG-UI-008 drawing SVG/PDF/DXF).
// Prefer the File System Access API so Save/Export write to a user-chosen path
// instead of an ephemeral Chromium managed download that QA sees as "Removed"/"Deleted".
// When the picker is unavailable, blocked after async work, or cancelled, fall back to a
// hardened in-document <a download> that keeps a named File object URL alive long enough
// for Chromium to finish landing the bytes (GM-W8 β1-#40).

export type DownloadOk = { ok: true; method: 'file-picker' | 'anchor' }
export type DownloadFail = { ok: false; reason: 'aborted' | 'failed'; message?: string }
export type DownloadResult = DownloadOk | DownloadFail

type SavePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string
    types?: { description?: string; accept: Record<string, string[]> }[]
    excludeAcceptAllOption?: boolean
  }) => Promise<FileSystemFileHandle>
}

/** How long to keep the object URL + anchor in the document before cleanup. */
const ANCHOR_REVOKE_MS = 120_000

function extensionOf(name: string): string | null {
  const i = name.lastIndexOf('.')
  if (i <= 0 || i === name.length - 1) return null
  return name.slice(i).toLowerCase()
}

function toUint8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

/** Copy into a fresh ArrayBuffer-backed view so FS write typings accept it. */
function asWriteChunk(bytes: Uint8Array): Blob {
  return new Blob([bytes as BlobPart])
}

function hasSavePicker(): boolean {
  if (typeof window === 'undefined') return false
  return typeof (window as SavePickerWindow).showSaveFilePicker === 'function'
}

/**
 * Automation (Playwright / webdriver) often cannot complete a real save picker and ends up
 * on the ephemeral managed-download path. Prefer the hardened anchor there; real users still
 * get the picker via durableDownload / durableDownloadFrom.
 */
function preferFilePicker(): boolean {
  if (!hasSavePicker()) return false
  try {
    if (typeof navigator !== 'undefined' && 'webdriver' in navigator && navigator.webdriver) return false
  } catch {
    /* ignore */
  }
  return true
}

/** Named File when available — Chromium treats this closer to Content-Disposition filename=. */
function toDownloadBlob(bytes: Uint8Array, name: string, type: string): Blob {
  const mime = type || 'application/octet-stream'
  try {
    if (typeof File === 'function') {
      return new File([bytes as BlobPart], name, { type: mime })
    }
  } catch {
    /* fall through to Blob */
  }
  return new Blob([bytes as BlobPart], { type: mime })
}

function scheduleCleanup(url: string, anchor: HTMLAnchorElement | null): void {
  const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
    try {
      anchor?.remove()
    } catch {
      /* already detached */
    }
    try {
      URL.revokeObjectURL(url)
    } catch {
      /* ignore */
    }
  }, ANCHOR_REVOKE_MS)
  // unref in Node so unit tests do not keep the process alive for the revoke delay.
  const maybeUnref = timer as unknown as { unref?: () => void }
  maybeUnref.unref?.()
}

/** Write bytes via showSaveFilePicker when the browser supports it and we prefer it. */
async function tryFilePickerWrite(bytes: Uint8Array, name: string, type: string): Promise<DownloadResult | null> {
  if (!preferFilePicker()) return null
  const picker = (window as SavePickerWindow).showSaveFilePicker
  if (typeof picker !== 'function') return null
  const ext = extensionOf(name)
  try {
    const handle = await picker.call(window, {
      suggestedName: name,
      ...(ext
        ? { types: [{ description: name, accept: { [type || 'application/octet-stream']: [ext] } }] }
        : {}),
    })
    const writable = await handle.createWritable()
    await writable.write(asWriteChunk(bytes))
    await writable.close()
    return { ok: true, method: 'file-picker' }
  } catch (err) {
    const errName = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : ''
    // AbortError (user / automation cancelled) → fall through to hardened anchor so Save still
    // lands a lasting download when possible (v1.3 smoke: Deleted shelf entries).
    if (errName === 'AbortError') return null
    // SecurityError / NotAllowedError after lost user gesture → fall through to anchor.
    return null
  }
}

/**
 * Acquire a save handle while the user gesture is still fresh (before heavy produce work).
 * Returns null when picker is unavailable / blocked / cancelled (caller should anchor-fallback).
 */
async function tryAcquireSaveHandle(name: string, type: string): Promise<FileSystemFileHandle | null> {
  if (!preferFilePicker()) return null
  const picker = (window as SavePickerWindow).showSaveFilePicker
  if (typeof picker !== 'function') return null
  const ext = extensionOf(name)
  try {
    return await picker.call(window, {
      suggestedName: name,
      ...(ext
        ? { types: [{ description: name, accept: { [type || 'application/octet-stream']: [ext] } }] }
        : {}),
    })
  } catch {
    // AbortError / SecurityError / NotAllowedError → caller uses hardened anchor.
    return null
  }
}

async function writeToSaveHandle(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<DownloadResult> {
  try {
    const writable = await handle.createWritable()
    await writable.write(asWriteChunk(bytes))
    await writable.close()
    return { ok: true, method: 'file-picker' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: 'failed', message }
  }
}

/** Classic blob download, hardened so Chromium actually starts a named, lasting download. */
export function anchorDownload(bytes: Uint8Array, name: string, type: string): DownloadResult {
  try {
    if (typeof document === 'undefined') {
      return { ok: false, reason: 'failed', message: 'no document' }
    }
    const blob = toDownloadBlob(bytes, name, type)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // setAttribute + property: some Chromium builds only honour one; empty name → UUID shelf entry.
    a.setAttribute('download', name)
    a.download = name
    a.rel = 'noopener'
    a.type = type || 'application/octet-stream'
    a.style.display = 'none'
    // Detached <a>.click() is unreliable across Chromium/Playwright; attach first and keep it
    // until revoke so the download pipeline can resolve the named File object URL.
    document.body.appendChild(a)
    try {
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }))
    } catch {
      a.click()
    }
    scheduleCleanup(url, a)
    return { ok: true, method: 'anchor' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: 'failed', message }
  }
}

/**
 * Prefer a durable File System Access write; fall back to hardened <a download>.
 * Picker cancel / block / unavailability all fall through to the anchor path so Save still
 * produces a lasting download when possible. Prefer picker for real (non-webdriver) users.
 */
export async function durableDownload(
  data: ArrayBuffer | Uint8Array,
  name: string,
  type: string,
): Promise<DownloadResult> {
  const bytes = toUint8(data)
  const picked = await tryFilePickerWrite(bytes, name, type)
  if (picked) return picked
  return anchorDownload(bytes, name, type)
}

/**
 * Gesture-preserving variant: open the save picker *before* producing bytes (JSON.stringify,
 * mesh encode, …) so Chromium still treats the call as user-activated. On picker
 * cancel/unavailability, produce bytes and use the hardened anchor fallback.
 */
export async function durableDownloadFrom(
  name: string,
  type: string,
  produce: () => ArrayBuffer | Uint8Array | Promise<ArrayBuffer | Uint8Array>,
): Promise<DownloadResult> {
  const handle = await tryAcquireSaveHandle(name, type)
  let bytes: Uint8Array
  try {
    bytes = toUint8(await produce())
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: 'failed', message }
  }
  if (handle) {
    const written = await writeToSaveHandle(handle, bytes)
    if (written.ok) return written
    // Handle write failed after pick — still try anchor so the user does not lose the file.
  }
  return anchorDownload(bytes, name, type)
}
