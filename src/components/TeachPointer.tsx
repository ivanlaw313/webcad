import { useEffect, useState, useRef } from 'react'
import { useApp } from '../store'
import { tourAnchor } from './Tour'   // GM-W6 E：教学 sticky 指针复用同一套锚点定义

// GM-W6 E：锚点解析 —— data-cmd 优先（ribbon 掣），揾唔到再当 CSS 选择器 querySelector
// （令教学锚点可指非 data-cmd 元素，如 .sketch-bar 之类）。选择器无效时静默返 null。
function resolveAnchor(anchor: string): Element | null {
  const byCmd = document.querySelector(`[data-cmd="${anchor}"]`)
  if (byCmd) return byCmd
  try { return document.querySelector(anchor) } catch { return null }
}

type Box = { cx: number; bottom: number; label: string }

// P6 v1.1 图像指引：AI 教学高亮命令时，喺个【真掣】下方浮一个【弹跳箭头 + 命令名 pill】指住佢，
// 令用户一眼睇到「就系呢个掣」。位置用 getBoundingClientRect 实时对齐个掣中心；resize/scroll 重定位；
// auto-dismiss（略长过 .teach-pulse 2.4s）。container pointer-events:none —— 绝不阻挡 ribbon 掣点击。
// GM-W6 E：另加一个【sticky】变体畀手把手教学用 —— 唔 auto-dismiss，跟住当前步嘅锚点，
// 定时 + resize/scroll 重贴（因为切 tab / 入草图会令 DOM 重排、锚点迟啲先出现）。
export default function TeachPointer() {
  const teachHi = useApp((s) => s.teachHi)
  const tour = useApp((s) => s.tour)
  const [box, setBox] = useState<Box | null>(null)          // 一次性 AI 教学箭头
  const [sticky, setSticky] = useState<Box | null>(null)    // GM-W6 E：教学步骤常驻箭头
  const dismissRef = useRef<number | null>(null)

  // 一次性 AI 教学箭头（原行为，改用 resolveAnchor 支持选择器）
  useEffect(() => {
    if (!teachHi) { setBox(null); return }
    let alive = true
    const place = () => {
      const el = resolveAnchor(teachHi.cmdId)
      if (!el) { if (alive) setBox(null); return }   // dropdown-only 命令/草图模式揾唔到 → 静默（同 v1 一致）
      const r = el.getBoundingClientRect()
      if (alive) setBox({ cx: r.left + r.width / 2, bottom: r.bottom, label: teachHi.label })
    }
    const t0 = window.setTimeout(place, 120)   // 等切 tab 后 DOM 重排（镜 Ribbon 的 90ms，稍长确保 layout 稳）
    const onMove = () => place()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    if (dismissRef.current) window.clearTimeout(dismissRef.current)
    dismissRef.current = window.setTimeout(() => { if (alive) setBox(null) }, 3400)
    return () => {
      alive = false
      window.clearTimeout(t0)
      if (dismissRef.current) window.clearTimeout(dismissRef.current)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [teachHi])

  // GM-W6 E：sticky 教学箭头 —— 常驻直到步骤前进（tour 变即重建 effect）。
  useEffect(() => {
    const ta = tour ? tourAnchor(tour.step) : null
    if (!ta || !ta.anchor) { setSticky(null); return }
    const anchor = ta.anchor
    let alive = true
    const place = () => {
      const el = resolveAnchor(anchor)
      if (!el) { if (alive) setSticky(null); return }   // 锚点未入 DOM（未切到嗰 tab / 未入草图）→ 暂时收埋，等下一 tick
      const r = el.getBoundingClientRect()
      if (alive) setSticky({ cx: r.left + r.width / 2, bottom: r.bottom, label: ta.label })
    }
    place()
    const iv = window.setInterval(place, 500)   // DOM 会随切 tab / 入草图变 → 定时重贴锚住
    const onMove = () => place()
    window.addEventListener('resize', onMove)
    window.addEventListener('scroll', onMove, true)
    return () => {
      alive = false
      window.clearInterval(iv)
      window.removeEventListener('resize', onMove)
      window.removeEventListener('scroll', onMove, true)
    }
  }, [tour])

  return (
    <>
      {box && (
        <div className="teach-pointer" style={{ left: box.cx, top: box.bottom + 3 }}>
          <div className="teach-arrow" />
          <div className="teach-pill">{box.label}</div>
        </div>
      )}
      {sticky && (
        <div className="teach-pointer" style={{ left: sticky.cx, top: sticky.bottom + 3 }}>
          <div className="teach-arrow" />
          <div className="teach-pill">{sticky.label}</div>
        </div>
      )}
    </>
  )
}
