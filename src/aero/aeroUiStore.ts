// Aero Design Lab — tiny UI store (panel open state) kept out of the big app store so the lab's
// state never touches store.ts beyond one ribbon dispatch line.
import { create } from 'zustand'
import type { DesignSpec } from './designSpace'

export const LS_AUTO_LOOP = 'webcad.aero.autoLoop'
/** A running auto-design loop survives reloads: reopen the lab so it resumes watching its CFD jobs. */
function loopActiveInStorage(): boolean {
  try { return JSON.parse(localStorage.getItem(LS_AUTO_LOOP) || 'null')?.status === 'running' } catch { return false }
}

/** specReq: a design space pushed from outside the panel (AI Copilot) — the lab adopts it once per nonce. */
export interface AeroSpecReq { spec: DesignSpec; brief: string; nonce: number }
export const useAeroUi = create<{ open: boolean; specReq: AeroSpecReq | null; labSpec: DesignSpec | null }>(() => ({ open: loopActiveInStorage(), specReq: null, labSpec: null }))
export const openAeroLab = (): void => useAeroUi.setState({ open: true })
export const requestAeroSpec = (spec: DesignSpec, brief = ''): void => useAeroUi.setState({ open: true, specReq: { spec, brief, nonce: Date.now() + Math.random() } })
export const closeAeroLab = (): void => useAeroUi.setState({ open: false })
