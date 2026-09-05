import { useEffect, useState } from 'react'
import { useApp, dbgLog, dbgCount, dbgClear } from '../store'
import { useDraggable } from './useDraggable'

// 诊断录制模式 HUD：开咗记低用户每个动作（鼠标坐标/时间/撳边个掣）+ 背后状态变化 → 一键复制问题报告畀 AI。
// 纯被动监听（capture 阶段、唔 preventDefault）→ 唔影响 app 行为；只喺开咗先挂监听。
function describe(el: Element | null): string {
  if (!el) return '?'
  const tag = el.tagName.toLowerCase()
  if (tag === 'canvas') return 'canvas(3D视口)'
  const btn = el.closest('button')
  if (btn) { const t = (btn.textContent || btn.title || '').replace(/\s+/g, ' ').trim().slice(0, 26); return `掣「${t || btn.className.slice(0, 18)}」` }
  if (tag === 'select' || tag === 'input') return `${tag}[${String((el as HTMLInputElement).value ?? '').slice(0, 14)}]`
  const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : ''
  return `${tag}${cls ? '.' + cls : ''}`
}

const snap = (st = useApp.getState()) => ({ status: st.status, tool: st.sketchTool, mode: st.mode, sel: st.skSel.length, feat: st.features.length })

export default function DebugHud() {
  const debugMode = useApp((s) => s.debugMode)
  const setDebugMode = useApp((s) => s.setDebugMode)
  const copyDebugReport = useApp((s) => s.copyDebugReport)
  const [count, setCount] = useState(0)
  const drag = useDraggable('webcad-dbg-hud', { right: 18, bottom: 74 })   // 默认叠喺 AI ✦ 钮上面（唔再重叠）；可拖移到任何位（记住）

  // 录制：鼠标 down/up（坐标 + 撳中边个元素）+ 状态变化（程式有冇反应）
  useEffect(() => {
    if (!debugMode) return
    const down = (e: PointerEvent) => dbgLog(`↓鼠标 @(${Math.round(e.clientX)},${Math.round(e.clientY)}) btn${e.button} → ${describe(e.target as Element)}`)
    const up = (e: PointerEvent) => dbgLog(`↑放开 @(${Math.round(e.clientX)},${Math.round(e.clientY)})`)
    const key = (e: KeyboardEvent) => { if (e.key.length > 1 || e.ctrlKey || e.altKey || e.metaKey) dbgLog(`⌨ ${e.ctrlKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.key}`) }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('keydown', key, true)
    let prev = snap()
    const unsub = useApp.subscribe((st) => {
      const n = snap(st), ch: string[] = []
      if (n.status !== prev.status) ch.push(`状态="${n.status}"`)
      if (n.tool !== prev.tool) ch.push(`草图工具 ${prev.tool}→${n.tool}`)
      if (n.mode !== prev.mode) ch.push(`模式 ${prev.mode}→${n.mode}`)
      if (n.sel !== prev.sel) ch.push(`选择数 ${prev.sel}→${n.sel}`)
      if (n.feat !== prev.feat) ch.push(`特征数 ${prev.feat}→${n.feat}`)
      if (ch.length) dbgLog('   ⟳ ' + ch.join(' · '))
      prev = n
    })
    const id = setInterval(() => setCount(dbgCount()), 400)
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('keydown', key, true); unsub(); clearInterval(id) }
  }, [debugMode])

  return (
    <div ref={drag.ref} onPointerDown={drag.onPointerDown} title="可拖移：揿住拖去你想要嘅位（位置会记住）" style={{ position: 'fixed', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', fontFamily: '-apple-system,Segoe UI,sans-serif', fontSize: 12, cursor: 'grab', touchAction: 'none', ...drag.style }}>
      {debugMode && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#1a1d22', border: '1px solid #d6694e', borderRadius: 6, padding: '5px 8px', color: '#e6ebf0', boxShadow: '0 2px 8px rgba(0,0,0,.35)' }}>
          <span style={{ color: '#d6694e' }}>● 录制中 {count} 条</span>
          <button onClick={() => { if (drag.consumeClick()) return; copyDebugReport() }} style={{ background: '#2f6fb0', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontWeight: 600 }}>📋 复制问题报告</button>
          <button onClick={() => { if (drag.consumeClick()) return; dbgClear(); setCount(0) }} style={{ background: '#3a3f47', color: '#cfd6dd', border: 'none', borderRadius: 4, padding: '4px 6px', cursor: 'pointer' }}>清除</button>
        </div>
      )}
      <button onClick={() => { if (drag.consumeClick()) return; setDebugMode(!debugMode) }} title="诊断录制模式：记低你嘅鼠标/撳掣/状态变化 → 撳「复制问题报告」贴返畀 AI 帮你睇问题（揿住可拖移）"
        style={{ background: debugMode ? '#d6694e' : 'rgba(42,46,53,.85)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 2px 6px rgba(0,0,0,.3)' }}>
        {debugMode ? '● 诊断录制中（点关）' : '🩺 诊断'}
      </button>
    </div>
  )
}
