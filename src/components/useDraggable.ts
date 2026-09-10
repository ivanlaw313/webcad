import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'

// 浮动钮/HUD 可拖移：返回 { style, onPointerDown, consumeClick }。
//   · 位置存 localStorage[key]，下次开记返。未拖过 → 用 right/bottom 锚（同旧版一致）；拖过 → 转 left/top 绝对定位。
//   · 区分「click」同「drag」：移动 >4px 先当拖；拖完 consumeClick() 返 true，俾 onClick 吞一次（唔会拖完误触发钮）。
//   解决：浮动 AI ✦ / 🩺诊断 钮叠埋一齐 + 挡住底部状态栏 → 用户可自由拖去唔挡嘅位。
// The resting position can be any CSS position.  Most older callers use a
// right/bottom dock, while HUDs such as the navigation bar keep a centred
// resting position until the user drags them.
type Anchor = React.CSSProperties
type Pos = { left: number; top: number }

export function useDraggable(key: string, anchor: Anchor) {
  const [pos, setPos] = useState<Pos | null>(() => {
    try { const s = localStorage.getItem(key); if (s) { const p = JSON.parse(s); if (p && typeof p.left === 'number' && typeof p.top === 'number') return p } } catch { /* ignore */ }
    return null
  })
  // A panel can become a collapsed button.  Measure either form so saved
  // positions stay recoverable after a resize or a content-size change.
  const elementRef = useRef<HTMLElement | null>(null)
  const st = useRef<{ sx: number; sy: number; ox: number; oy: number; width: number; height: number; boundWidth: number; boundHeight: number; moved: boolean } | null>(null)
  const justDragged = useRef(false)

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    // The drag handle is only a small child of the panel.  Measure the panel
    // itself and express its position in its offset parent's coordinates.
    // Otherwise an absolute HUD inside the viewport gets clamped against the
    // window but written as viewport-relative `left/top`, letting it escape by
    // the ribbon/browser-tree offset.
    const el = elementRef.current ?? (e.currentTarget as HTMLElement)
    const r = el.getBoundingClientRect()
    const parent = el.offsetParent?.getBoundingClientRect()
    const px = parent?.left ?? 0, py = parent?.top ?? 0
    const boundWidth = parent?.width ?? window.innerWidth, boundHeight = parent?.height ?? window.innerHeight
    st.current = { sx: e.clientX, sy: e.clientY, ox: r.left - px, oy: r.top - py, width: r.width, height: r.height, boundWidth, boundHeight, moved: false }
  }
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      const s = st.current; if (!s) return
      const dx = e.clientX - s.sx, dy = e.clientY - s.sy
      if (!s.moved && Math.abs(dx) + Math.abs(dy) > 4) s.moved = true
      if (s.moved) {
        // Keep the whole dragged panel reachable.  The old 40px fixed limit
        // worked for round buttons, but let a full-width timeline disappear
        // outside the viewport after a drag.
        const left = Math.max(2, Math.min(Math.max(2, s.boundWidth - Math.min(s.width, s.boundWidth - 4)), s.ox + dx))
        const top = Math.max(2, Math.min(Math.max(2, s.boundHeight - Math.min(s.height, s.boundHeight - 4)), s.oy + dy))
        setPos({ left, top })
      }
    }
    const up = () => { const s = st.current; if (!s) return; if (s.moved) justDragged.current = true; st.current = null }
    window.addEventListener('pointermove', mv)
    window.addEventListener('pointerup', up)
    // Pointer cancellation and a window losing focus are common while using
    // CAD navigation with a pen, touchpad or OS gesture.  Never leave a HUD
    // in a "dragging" state after either event.
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up) }
  }, [])
  useEffect(() => { if (pos) { try { localStorage.setItem(key, JSON.stringify(pos)) } catch { /* ignore */ } } }, [pos, key])
  // Repair positions saved by older versions of this hook as soon as the
  // caller attaches its element.  This is especially important for the
  // timeline because it can be much wider than a floating icon.
  useLayoutEffect(() => {
    const el = elementRef.current
    if (!el || !pos) return
    const r = el.getBoundingClientRect()
    const parent = el.offsetParent?.getBoundingClientRect()
    const boundWidth = parent?.width ?? window.innerWidth, boundHeight = parent?.height ?? window.innerHeight
    const left = Math.max(2, Math.min(Math.max(2, boundWidth - Math.min(r.width, boundWidth - 4)), pos.left))
    const top = Math.max(2, Math.min(Math.max(2, boundHeight - Math.min(r.height, boundHeight - 4)), pos.top))
    if (left !== pos.left || top !== pos.top) setPos({ left, top })
  }, [pos])
  // A saved position may be valid on a desktop screen, then become unreachable
  // when the browser is narrowed. Clamp it immediately instead of waiting for
  // a reload or forcing the user to discover Reset.
  useEffect(() => {
    if (!pos) return
    const clampToViewport = () => {
      const el = elementRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const parent = el.offsetParent?.getBoundingClientRect()
      const boundWidth = parent?.width ?? window.innerWidth, boundHeight = parent?.height ?? window.innerHeight
      setPos((cur) => {
        if (!cur) return cur
        const left = Math.max(2, Math.min(Math.max(2, boundWidth - Math.min(r.width, boundWidth - 4)), cur.left))
        const top = Math.max(2, Math.min(Math.max(2, boundHeight - Math.min(r.height, boundHeight - 4)), cur.top))
        return left === cur.left && top === cur.top ? cur : { left, top }
      })
    }
    window.addEventListener('resize', clampToViewport)
    return () => window.removeEventListener('resize', clampToViewport)
  }, [pos])
  // A dialog can grow after its first render (for example when a command adds
  // validation text or a long component list).  Re-clamp on that resize too;
  // otherwise a previously valid bottom/right position can end up unreachable.
  useEffect(() => {
    if (!pos || typeof ResizeObserver === 'undefined') return
    const el = elementRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const parent = el.offsetParent?.getBoundingClientRect()
      const boundWidth = parent?.width ?? window.innerWidth, boundHeight = parent?.height ?? window.innerHeight
      setPos((cur) => {
        if (!cur) return cur
        const left = Math.max(2, Math.min(Math.max(2, boundWidth - Math.min(r.width, boundWidth - 4)), cur.left))
        const top = Math.max(2, Math.min(Math.max(2, boundHeight - Math.min(r.height, boundHeight - 4)), cur.top))
        return left === cur.left && top === cur.top ? cur : { left, top }
      })
    })
    observer.observe(el)
    if (el.offsetParent) observer.observe(el.offsetParent)
    return () => observer.disconnect()
  }, [pos])

  const style: React.CSSProperties = pos
    ? { left: pos.left, top: pos.top, right: 'auto', bottom: 'auto', transform: 'none' }
    : { right: anchor.right, bottom: anchor.bottom }
  // A persisted drag position is useful until it is not: a panel can be
  // intentionally moved off a familiar dock, or an old compact viewport can
  // leave a position awkward on a larger screen.  Expose a safe reset so the
  // user never has to clear all browser data to recover the default layout.
  const reset = () => {
    try { localStorage.removeItem(key) } catch { /* ignore */ }
    setPos(null)
  }
  const consumeClick = () => { if (justDragged.current) { justDragged.current = false; return true } return false }
  // A callback ref is deliberately used instead of exposing the mutable ref:
  // callers render either a <div> or the collapsed <button>, and both need to
  // attach to the same measurement lifecycle without unsafe element casts.
  const ref = (el: HTMLElement | null) => { elementRef.current = el }
  return { style: pos ? style : anchor, onPointerDown, consumeClick, reset, ref, isDragged: !!pos }
}
