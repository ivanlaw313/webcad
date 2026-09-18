/**
 * v1.43 BUG-BD-4101 — DOM wiring for mesh drag-drop (singleton).
 * Document-level capture always sees OS/automation drag events; optional viewport
 * overlay sits above WebGL <canvas> while armed so the canvas cannot swallow drops.
 */
import {
  MESH_DROP_ARMED_STATUS,
  MESH_DROP_EMPTY_STATUS,
  resolveMeshDropFromDataTransfer,
  shouldAcceptMeshDropNow,
  shouldAllowMeshDragOver,
} from './meshDrop'

export type MeshDropAccept = (file: File) => void | Promise<void>
export type MeshDropStatus = (status: string) => void

type HostState = {
  accept: MeshDropAccept
  setStatus?: MeshDropStatus
  overlay: HTMLElement | null
  armed: boolean
  leaveTimer: ReturnType<typeof setTimeout> | null
  cleanup: (() => void) | null
  refCount: number
}

const state: HostState = {
  accept: () => {},
  setStatus: undefined,
  overlay: null,
  armed: false,
  leaveTimer: null,
  cleanup: null,
  refCount: 0,
}

function applyOverlayArmed() {
  const el = state.overlay
  if (!el) return
  el.dataset.meshDropArmed = state.armed ? '1' : '0'
  el.style.pointerEvents = state.armed ? 'auto' : 'none'
  el.style.opacity = state.armed ? '1' : '0'
  el.setAttribute('aria-hidden', state.armed ? 'false' : 'true')
}

function setArmed(next: boolean) {
  if (state.armed === next) return
  state.armed = next
  applyOverlayArmed()
  if (next && state.setStatus) {
    try { state.setStatus(MESH_DROP_ARMED_STATUS) } catch { /* ignore */ }
  }
}

function clearLeaveTimer() {
  if (state.leaveTimer != null) {
    clearTimeout(state.leaveTimer)
    state.leaveTimer = null
  }
}

function onDragEnter(e: DragEvent) {
  if (!shouldAllowMeshDragOver(e.dataTransfer) && !state.armed) return
  e.preventDefault()
  try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' } catch { /* ignore */ }
  clearLeaveTimer()
  setArmed(true)
}

function onDragOver(e: DragEvent) {
  const allow = state.armed || shouldAllowMeshDragOver(e.dataTransfer)
  if (!allow) return
  e.preventDefault()
  try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy' } catch { /* ignore */ }
  if (!state.armed && shouldAllowMeshDragOver(e.dataTransfer)) setArmed(true)
}

function onDragLeave(e: DragEvent) {
  const related = e.relatedTarget as Node | null
  if (related && document.documentElement.contains(related)) return
  clearLeaveTimer()
  state.leaveTimer = setTimeout(() => setArmed(false), 80)
}

function onDrop(e: DragEvent) {
  clearLeaveTimer()
  const file = resolveMeshDropFromDataTransfer(e.dataTransfer)
  if (state.armed || file || shouldAllowMeshDragOver(e.dataTransfer)) {
    e.preventDefault()
    e.stopPropagation()
  }
  setArmed(false)
  if (!file) {
    if (state.setStatus) {
      try { state.setStatus(MESH_DROP_EMPTY_STATUS) } catch { /* ignore */ }
    }
    return
  }
  if (!shouldAcceptMeshDropNow(file)) return
  void state.accept(file)
}

function onDragEnd() {
  clearLeaveTimer()
  setArmed(false)
}

/**
 * Ensure document/window capture listeners exist. Idempotent — safe from App + Viewport.
 * Updates accept / setStatus callbacks on each call.
 */
export function ensureMeshDropHost(opts: {
  accept: MeshDropAccept
  setStatus?: MeshDropStatus
}): () => void {
  state.accept = opts.accept
  state.setStatus = opts.setStatus
  state.refCount += 1

  if (!state.cleanup) {
    const cap: AddEventListenerOptions = { capture: true }
    document.addEventListener('dragenter', onDragEnter as EventListener, cap)
    document.addEventListener('dragover', onDragOver as EventListener, cap)
    document.addEventListener('dragleave', onDragLeave as EventListener, cap)
    document.addEventListener('drop', onDrop as EventListener, cap)
    document.addEventListener('dragend', onDragEnd as EventListener, cap)
    window.addEventListener('dragend', onDragEnd, true)
    window.addEventListener('drop', onDrop as EventListener, true)

    state.cleanup = () => {
      clearLeaveTimer()
      document.removeEventListener('dragenter', onDragEnter as EventListener, cap)
      document.removeEventListener('dragover', onDragOver as EventListener, cap)
      document.removeEventListener('dragleave', onDragLeave as EventListener, cap)
      document.removeEventListener('drop', onDrop as EventListener, cap)
      document.removeEventListener('dragend', onDragEnd as EventListener, cap)
      window.removeEventListener('dragend', onDragEnd, true)
      window.removeEventListener('drop', onDrop as EventListener, true)
      state.cleanup = null
      setArmed(false)
    }
  }

  let released = false
  return () => {
    if (released) return
    released = true
    state.refCount = Math.max(0, state.refCount - 1)
    if (state.refCount === 0 && state.cleanup) state.cleanup()
  }
}

/** Register / clear the viewport overlay element that sits above the WebGL canvas. */
export function setMeshDropOverlay(el: HTMLElement | null): void {
  state.overlay = el
  applyOverlayArmed()
}
