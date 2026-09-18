/**
 * BUG-BD-3201 (v1.34): File UI / picker safety after heavy ASSY (Gear Pair).
 *
 * Chrome Aw Snap Error 9 after Gear Pair → File is consistent with renderer/GPU
 * process pressure (VRAM + main-thread spike while WebGL keeps presenting and
 * the File portal / showOpenFilePicker allocates). These helpers:
 *  1. yield a couple of animation frames + a macrotask so the compositor can
 *     finish and GC can run before File chrome opens;
 *  2. broadcast `webcad:ui-overlay` so the viewport can temporarily ease GPU
 *     load (lower DPR, dispose render lists) while the menu/picker is up.
 */

export const UI_OVERLAY_EVENT = 'webcad:ui-overlay'

export type UiOverlayDetail = { busy: boolean; reason?: string }

export function setUiOverlayBusy(busy: boolean, reason?: string): void {
  if (typeof window === 'undefined') return
  const detail: UiOverlayDetail = { busy, reason }
  window.dispatchEvent(new CustomEvent(UI_OVERLAY_EVENT, { detail }))
}

/** Yield N rAF frames, then one macrotask (GC-friendly). */
export function yieldToBrowser(frames = 2): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      if (typeof setTimeout === 'undefined') { resolve(); return }
      setTimeout(() => resolve(), 0)
    }
    if (typeof requestAnimationFrame === 'undefined') { finish(); return }
    const step = (n: number) => {
      if (n <= 0) { finish(); return }
      requestAnimationFrame(() => step(n - 1))
    }
    step(Math.max(1, frames | 0))
  })
}

/**
 * Run `fn` after yielding, with overlay-busy signals around it.
 * Use before File menu open and before showOpenFilePicker / <input type=file>.
 */
export async function withFileUiSafety<T>(fn: () => Promise<T> | T, reason = 'file-ui'): Promise<T> {
  setUiOverlayBusy(true, reason)
  try {
    await yieldToBrowser(2)
    return await fn()
  } finally {
    if (typeof requestAnimationFrame === 'undefined') {
      setUiOverlayBusy(false, reason)
    } else {
      requestAnimationFrame(() => setUiOverlayBusy(false, reason))
    }
  }
}

/** Dense B-rep (involute gears) — full seam extract + line VBOs are crash amplifiers. */
export const DENSE_FACE_GROUPS = 100
export const DENSE_TRIANGLES = 90_000

export function isDenseDisplayMesh(mesh: {
  triangles?: ArrayLike<number>
  /** MeshData field from OCCT face runs (S99). */
  faceGroups?: ArrayLike<unknown> | null
}): boolean {
  const tris = mesh.triangles ? mesh.triangles.length / 3 : 0
  const groups = mesh.faceGroups ? mesh.faceGroups.length : 0
  return groups >= DENSE_FACE_GROUPS || tris >= DENSE_TRIANGLES
}
