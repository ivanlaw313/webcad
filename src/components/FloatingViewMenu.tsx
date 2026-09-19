import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Portal outside the draggable/scrolled navigation bar, then fit above its button.
export function FloatingViewMenu({ children, styleName }: { children: ReactNode; styleName: string }) {
  const menu = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 300 })
  useLayoutEffect(() => {
    const fit = () => {
      const el = menu.current, anchor = document.querySelector('[data-testid="visual-style-menu-trigger"]')?.getBoundingClientRect()
      if (!el || !anchor) return
      const maxHeight = Math.max(80, Math.min(window.innerHeight - 16, anchor.top - 14))
      const next = { left: Math.max(8, Math.min(anchor.left, window.innerWidth - el.offsetWidth - 8)), top: Math.max(8, anchor.top - Math.min(el.scrollHeight, maxHeight) - 6), maxHeight }
      setPosition(old => old.left === next.left && old.top === next.top && old.maxHeight === next.maxHeight ? old : next)
    }
    fit()
    const observer = new ResizeObserver(fit)
    if (menu.current) observer.observe(menu.current)
    window.addEventListener('resize', fit)
    window.addEventListener('scroll', fit, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); window.removeEventListener('scroll', fit, true) }
  }, [])
  return createPortal(<div ref={menu} role="menu" aria-label="顯示方式" data-testid="visual-style-picker" data-visual-style={styleName} className="panel-menu" style={{ position: 'fixed', ...position, zIndex: 260, width: 240, maxWidth: 'calc(100vw - 16px)', overflowY: 'auto', boxSizing: 'border-box' }}>{children}</div>, document.body)
}
