// Durable download helper (BUG-UI-002 Save/Export P0; BUG-UI-008 drawing SVG/PDF/DXF).
// Prefer the File System Access API so Save/Export write to a user-chosen path
// instead of an ephemeral Chromium managed download that QA sees as "Removed".
// Fall back to an in-document <a download> blob link when the picker is
// unavailable, cancelled mid-gesture, or blocked after async work.

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

/** Write bytes via showSaveFilePicker when the browser supports it. */
async function tryFilePickerWrite(bytes: Uint8Array, name: string, type: string): Promise<DownloadResult | null> {
  if (typeof window === 'undefined') return null
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
    if (errName === 'AbortError') return { ok: false, reason: 'aborted' }
    // SecurityError / NotAllowedError after lost user gesture → fall through to anchor.
    return null
  }
}

/** Classic blob download, hardened so Chromium actually starts a download. */
function anchorDownload(bytes: Uint8Array, name: string, type: string): DownloadResult {
  try {
    if (typeof document === 'undefined') {
      return { ok: false, reason: 'failed', message: 'no document' }
    }
    const blob = new Blob([bytes as BlobPart], { type: type || 'application/octet-stream' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.rel = 'noopener'
    a.style.display = 'none'
    // Detached <a>.click() is unreliable across Chromium/Playwright; attach first.
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Delay revoke so large STL/STEP/zip can finish landing (GM-W8 β1-#40).
    // unref in Node so unit tests do not keep the process alive for 60s.
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => URL.revokeObjectURL(url), 60_000)
    const maybeUnref = timer as unknown as { unref?: () => void }
    maybeUnref.unref?.()
    return { ok: true, method: 'anchor' }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: 'failed', message }
  }
}

/**
 * Prefer a durable File System Access write; fall back to <a download>.
 * AbortError from the picker is reported as cancelled (caller must not claim success).
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
