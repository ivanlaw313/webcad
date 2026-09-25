// Aero Design Lab — tiny UI store (panel open state) kept out of the big app store so the lab's
// state never touches store.ts beyond one ribbon dispatch line.
import { create } from 'zustand'

export const useAeroUi = create<{ open: boolean }>(() => ({ open: false }))
export const openAeroLab = (): void => useAeroUi.setState({ open: true })
export const closeAeroLab = (): void => useAeroUi.setState({ open: false })
