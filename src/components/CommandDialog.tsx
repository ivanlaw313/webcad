import { useEscapeLayer } from './useEscapeLayer'
import { useRef, useState, useEffect, type ReactNode } from 'react'
import { ToolIcon } from '../icons'
import { useApp } from '../store'
import { tStatus } from '../i18n'

// 可拖拽数字栏（Fusion/Blender 式）：喺命令对话框（.cmd-palette-body）任何数字输入上【左右拖】= 改值，
// 唔使打字；对话框本来实时预览 → 拖即见模型变化。拖动 <4px 当普通点击（照样可 focus 打字）。
// 用原生 value setter + 派 'input' 事件令 React 受控 onChange 触发（→ setFeatParam → 重建预览）。
// 挂一次（App 顶层），capture 阶段全局监听。零侵入逐个输入。
export function ScrubNumberDrag() {
  useEffect(() => {
    const setNative = (el: HTMLInputElement, v: number) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      setter?.call(el, String(v))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      const el = e.target as HTMLElement
      if (!(el instanceof HTMLInputElement)) return
      // P2：LenInput（type=text + inputMode=decimal，分数英寸用）都食拖刮 — 但值非纯数字（如 "1 1/2"）时唔武装，免清用户分数
      const isLen = el.type === 'text' && el.getAttribute('inputmode') === 'decimal' && el.value !== '' && !Number.isNaN(Number(el.value))
      if (el.type !== 'number' && !isLen) return
      if (!el.closest('.cmd-palette-body')) return
      const startX = e.clientX, startV = Number(el.value) || 0
      const step = Number(el.step) || 1
      const min = el.min !== '' ? Number(el.min) : -Infinity
      const max = el.max !== '' ? Number(el.max) : Infinity
      const dec = step < 1 ? 3 : step < 10 ? 2 : 0
      let scrubbing = false
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - startX
        if (!scrubbing) { if (Math.abs(dx) < 4) return; scrubbing = true; el.blur(); document.body.style.cursor = 'ew-resize'; document.body.style.userSelect = 'none' }
        let nv = startV + Math.round(dx / 3) * step
        nv = Math.min(max, Math.max(min, nv))
        nv = Math.round(nv * 10 ** dec) / 10 ** dec
        setNative(el, nv)
      }
      const up = () => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
        if (scrubbing) { document.body.style.cursor = ''; document.body.style.userSelect = '' }
      }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [])
  return null
}

// Fusion 式右侧命令 palette 共用外壳（.cmd-palette）：头 = 图标 + 标题 + ✕（按住可拖动），
// 体 = 字段行（label 自动左右分布），脚 = 蓝色「确定」+「取消」，可选灰色 summary 行。
// featDlg 同 6 个旧面板（拉伸/选边圆角/抽壳/孔/扫掠/放样）统一用呢个壳。
export function CommandDialog({ icon = 'default', title, okLabel = '确定', okDisabled = false, okTip, onOk, onCancel, width = 256, docked = false, summary, children }: {
  icon?: string
  title: string
  okLabel?: string
  okDisabled?: boolean
  okTip?: string
  onOk: () => void
  onCancel: () => void
  width?: number
  docked?: boolean
  summary?: ReactNode
  children: ReactNode
}) {
  useEscapeLayer(true, onCancel, 90)
  const lang = useApp((s) => s.lang)
  // 拖动：记住相对默认位（top 150 / right 20）嘅偏移；pointer capture 令拖出头部都唔甩手。
  const [collapsed, setCollapsed] = useState(false)
  const [off, setOff] = useState({ dx: 0, dy: 0 })
  const dialogRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ sx: number; sy: number; dx: number; dy: number } | null>(null)
  // A Fusion command palette is immediately ready for numeric entry.  Without
  // this, opening a command left focus on the ribbon button and keyboard input
  // could accidentally trigger another shortcut instead of changing a field.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const first = dialogRef.current?.querySelector<HTMLElement>('input:not(:disabled), textarea:not(:disabled)') ?? dialogRef.current?.querySelector<HTMLElement>('select:not(:disabled), button:not(:disabled)')
      first?.focus()
      if (first instanceof HTMLInputElement) first.select()
    }, 0)
    return () => window.clearTimeout(id)
  }, [])
  const clampOffset = (dx: number, dy: number) => {
    const r = dialogRef.current?.getBoundingClientRect()
    if (!r) return { dx, dy }
    const baseLeft = r.left - off.dx
    const baseTop = r.top - off.dy
    const maxLeft = Math.max(8, window.innerWidth - Math.min(r.width, window.innerWidth - 16) - 8)
    const maxTop = Math.max(8, window.innerHeight - Math.min(r.height, window.innerHeight - 16) - 8)
    return {
      dx: Math.max(8, Math.min(maxLeft, baseLeft + dx)) - baseLeft,
      dy: Math.max(8, Math.min(maxTop, baseTop + dy)) - baseTop,
    }
  }
  useEffect(() => {
    const repair = () => setOff((cur) => { const next = clampOffset(cur.dx, cur.dy); return next.dx === cur.dx && next.dy === cur.dy ? cur : next })
    const observer = new ResizeObserver(repair)
    if (dialogRef.current) observer.observe(dialogRef.current)
    repair()
    window.addEventListener('resize', repair)
    return () => { observer.disconnect(); window.removeEventListener('resize', repair) }
  })
  return (
    <div
      ref={dialogRef}
      className="cmd-palette"
      data-testid="command-dialog"
      role="dialog" aria-modal="true" tabIndex={-1}
      aria-label={tStatus(title, lang)}
      style={{ width, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)', transform: off.dx || off.dy ? `translate(${off.dx}px, ${off.dy}px)` : undefined }}
      onKeyDown={(e) => {
        // Numeric CAD command dialogs must submit with Enter just like Fusion.
        // Keep multi-line text editing intact, and never submit while an IME
        // composition is still in progress.
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCancel(); return }
        if (e.key === 'Enter' && !e.nativeEvent.isComposing && !(e.target instanceof HTMLTextAreaElement) && !('tagName' in e.target && e.target.tagName === 'BUTTON')) {
          e.preventDefault(); e.stopPropagation(); if (!okDisabled) onOk()
        }
      }}
    >
      <div
        className="cmd-palette-head"
        style={{ cursor: docked ? 'default' : 'move', touchAction: 'none' }}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          if (docked) return // Commands stay docked; canvas controls remain usable.
          if ((e.target as HTMLElement).closest('button')) return
          drag.current = { sx: e.clientX, sy: e.clientY, dx: off.dx, dy: off.dy }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => { const d = drag.current; if (d) setOff(clampOffset(d.dx + e.clientX - d.sx, d.dy + e.clientY - d.sy)) }}
        onPointerUp={() => { drag.current = null }}
        onPointerCancel={() => { drag.current = null }}
        onLostPointerCapture={() => { drag.current = null }}
      >
        <ToolIcon name={icon} size={16} />
        <span style={{ fontWeight: 700, flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{tStatus(title, lang)}</span>
        {!docked && <button type="button" className="cmd-palette-x" aria-label={lang === 'en' ? 'Reset command panel position' : '恢复命令面板位置'} onClick={() => setOff({ dx: 0, dy: 0 })}>↺</button>}
        <button type="button" className="cmd-palette-x" aria-label={collapsed ? (lang === 'en' ? 'Expand command options' : '展开命令选项') : (lang === 'en' ? 'Collapse command options' : '收起命令选项')} aria-expanded={!collapsed} onClick={() => setCollapsed(v => !v)}>{collapsed ? '▸' : '▾'}</button>
        <button type="button" className="cmd-palette-x" aria-label={tStatus('取消（Esc）', lang)} title={tStatus('取消（Esc）', lang)} onClick={onCancel}>✕</button>
      </div>
      <div className="cmd-palette-body" hidden={collapsed}>{children}</div>
      {!collapsed && summary != null && <div className="cmd-palette-summary">{summary}</div>}
      <div className="cmd-palette-foot">
        <button className="cmd-ok" data-testid="command-confirm" disabled={okDisabled} title={okTip ? tStatus(okTip, lang) : tStatus('确定（Enter）', lang)} onClick={onOk}>{tStatus(okLabel, lang)}</button>
        <button className="cmd-cancel" data-testid="command-cancel" title={tStatus('取消（Esc）', lang)} onClick={onCancel}>{tStatus('取消', lang)}</button>
      </div>
    </div>
  )
}

// Fusion 选择 chip 行：已选 → 蓝 pill「已选 N ×」（✕ 清空重选）；未选 → 灰虚线提示 pill。
export function SelectionChip({ label, count, hint, onClear, selectedText }: { label: string; count: number; hint: string; onClear?: () => void; selectedText?: string }) {
  const lang = useApp((s) => s.lang)
  return (
    <label>
      <span style={{ color: '#6b7680' }}>{tStatus(label, lang)}</span>
      {count > 0 ? (
        <span className="sel-chip" title={onClear ? tStatus('✕ = 清空所选重新点选', lang) : undefined}>
          {selectedText ?? <>{tStatus('已选', lang)} {count}</>}
          {onClear && <span className="sel-chip-x" onClick={onClear}>✕</span>}
        </span>
      ) : (
        <span className="sel-chip empty">{tStatus(hint, lang)}</span>
      )}
    </label>
  )
}
