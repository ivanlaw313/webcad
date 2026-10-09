import { useEffect, useState } from 'react'
import { useApp, dbgLog, dbgCount, dbgClear } from '../store'
import { useDraggable } from './useDraggable'

// 診斷錄製模式 HUD：開咗記低用戶每個動作（滑鼠座標／時間／撳邊個掣）＋背後狀態變化 → 一鍵複製／匯出問題報告畀 AI（JOINT #7：全繁體）。
// 纯被动监听（capture 阶段、唔 preventDefault）→ 唔影响 app 行为；只喺开咗先挂监听。
function describe(el: Element | null): string {
  if (!el) return '?'
  const tag = el.tagName.toLowerCase()
  if (tag === 'canvas') return 'canvas(3D視口)'
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
  const exportDebugReport = useApp((s) => s.exportDebugReport)
  const [count, setCount] = useState(0)
  const drag = useDraggable('webcad-dbg-hud', { right: 18, bottom: 74 })   // 預設疊喺 AI ✦ 鈕上面（唔再重疊）；可拖移到任何位（記住）

  // 錄製：滑鼠 down/up（座標 + 撳中邊個元素）+ 狀態變化（程式有冇反應）
  useEffect(() => {
    if (!debugMode) return
    const down = (e: PointerEvent) => dbgLog(`↓滑鼠 @(${Math.round(e.clientX)},${Math.round(e.clientY)}) btn${e.button} → ${describe(e.target as Element)}`)
    const up = (e: PointerEvent) => dbgLog(`↑放開 @(${Math.round(e.clientX)},${Math.round(e.clientY)})`)
    const key = (e: KeyboardEvent) => { if (e.key.length > 1 || e.ctrlKey || e.altKey || e.metaKey) dbgLog(`⌨ ${e.ctrlKey ? 'Ctrl+' : ''}${e.altKey ? 'Alt+' : ''}${e.key}`) }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', up, true)
    window.addEventListener('keydown', key, true)
    let prev = snap()
    const unsub = useApp.subscribe((st) => {
      const n = snap(st), ch: string[] = []
      if (n.status !== prev.status) ch.push(`狀態="${n.status}"`)
      if (n.tool !== prev.tool) ch.push(`草圖工具 ${prev.tool}→${n.tool}`)
      if (n.mode !== prev.mode) ch.push(`模式 ${prev.mode}→${n.mode}`)
      if (n.sel !== prev.sel) ch.push(`選擇數 ${prev.sel}→${n.sel}`)
      if (n.feat !== prev.feat) ch.push(`特徵數 ${prev.feat}→${n.feat}`)
      if (ch.length) dbgLog('   ⟳ ' + ch.join(' · '))
      prev = n
    })
    const id = setInterval(() => setCount(dbgCount()), 400)
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('keydown', key, true); unsub(); clearInterval(id) }
  }, [debugMode])

  if (!debugMode) return null
  return (
    <div ref={drag.ref} onPointerDown={drag.onPointerDown} title="可拖移：撳住拖去你想要嘅位（位置會記住）" style={{ position: 'fixed', zIndex: 99999, display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', fontFamily: '-apple-system,Segoe UI,sans-serif', fontSize: 12, cursor: 'grab', touchAction: 'none', ...drag.style }}>
      {debugMode && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#1a1d22', border: '1px solid #d6694e', borderRadius: 6, padding: '5px 8px', color: '#e6ebf0', boxShadow: '0 2px 8px rgba(0,0,0,.35)' }}>
          <span style={{ color: '#d6694e' }}>● 錄製中 {count} 條</span>
          <button onClick={() => { if (drag.consumeClick()) return; copyDebugReport() }} style={{ background: '#2f6fb0', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontWeight: 600 }}>📋 複製問題報告</button>
          <button data-testid="dbg-export" title="將問題報告存做 .txt 檔（剪貼簿用唔到或者報告太長時用）" onClick={() => { if (drag.consumeClick()) return; exportDebugReport() }} style={{ background: '#2b7a4b', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 8px', cursor: 'pointer', fontWeight: 600 }}>💾 匯出檔案</button>
          <button onClick={() => { if (drag.consumeClick()) return; dbgClear(); setCount(0) }} style={{ background: '#3a3f47', color: '#cfd6dd', border: 'none', borderRadius: 4, padding: '4px 6px', cursor: 'pointer' }}>清除</button>
        </div>
      )}
      <button onClick={() => { if (drag.consumeClick()) return; setDebugMode(!debugMode) }} title="診斷錄製模式：記低你嘅滑鼠／撳掣／狀態變化 → 撳「複製問題報告」貼返畀 AI，或者「匯出檔案」存做 .txt（撳住可拖移）"
        style={{ background: debugMode ? '#d6694e' : 'rgba(42,46,53,.85)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontWeight: 600, boxShadow: '0 2px 6px rgba(0,0,0,.3)' }}>
        {debugMode ? '● 診斷錄製中（撳一下關閉）' : '🩺 診斷'}
      </button>
    </div>
  )
}
