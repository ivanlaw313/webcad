import { useEffect, useRef } from 'react'
import { registerEscapeLayer } from '../cad/escapeKey'

// Overlay priority follows its visual stacking order; the last opened peer wins.
export function useEscapeLayer(open: boolean, dismiss: () => void, priority = 100) {
  const callback = useRef(dismiss)
  callback.current = dismiss
  useEffect(() => open ? registerEscapeLayer(() => callback.current(), priority) : undefined, [open, priority])
}
