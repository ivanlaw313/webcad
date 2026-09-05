// T805（报告 R3）：统一应用内对话框 — 取代 native window.prompt/alert/confirm。
// 报告指出旧做法有两个问题：(1) Chrome 喺自动化/iframe 会「抑制」原生弹窗,prompt() 静默返回 null,
// 功能默默唔执行;(2) 原生弹窗样式与 app 割裂、无校验。呢个居中模态由 store.uiDialog 驱动,
// appPrompt/appConfirm/appAlert 系 Promise 化,撳确定/取消即 resolve。Enter 确定、Esc 取消。
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'

export default function PromptDialog() {
  const dlg = useApp((s) => s.uiDialog)
  const resolveDialog = useApp((s) => s.resolveDialog)
  const [val, setVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // 每次打开新框：重置输入为默认值,聚焦并全选（方便直接覆写）。
  useEffect(() => {
    if (dlg?.kind === 'prompt') {
      setVal(dlg.def)
      // 等 DOM 上咗先聚焦
      const id = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
      return () => clearTimeout(id)
    }
  }, [dlg])

  if (!dlg) return null

  const ok = () => resolveDialog(dlg.kind === 'prompt' ? val : dlg.kind === 'confirm' ? true : null)
  const cancel = () => resolveDialog(dlg.kind === 'confirm' ? false : null)
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); ok() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label={dlg.title}
      onMouseDown={(e) => { if (e.target === e.currentTarget) cancel() }}  // 撳遮罩 = 取消
      style={{
        position: 'fixed', inset: 0, zIndex: 30000, display: 'flex',
        alignItems: 'center', justifyContent: 'center', background: 'rgba(20,24,28,0.42)',
      }}
    >
      <div
        onKeyDown={onKey}
        style={{
          width: 'min(440px, 92vw)', background: '#fff', borderRadius: 10,
          boxShadow: '0 12px 48px rgba(0,0,0,0.32)', overflow: 'hidden',
          fontSize: 13, color: '#222', display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-soft)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{dlg.kind === 'alert' ? '💬' : dlg.kind === 'confirm' ? '❓' : '✎'}</span>
          <span>{dlg.title}</span>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 讯息支持多行（\n）；用 pre-line 保留换行 */}
          <div style={{ whiteSpace: 'pre-line', lineHeight: 1.55, color: '#3a4248' }}>{dlg.msg}</div>
          {dlg.kind === 'prompt' && (
            <input
              ref={inputRef}
              value={val}
              aria-label={dlg.title}
              onChange={(e) => setVal(e.target.value)}
              style={{
                padding: '8px 10px', border: '1px solid #c8d0d8', borderRadius: 6,
                fontSize: 14, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
          )}
        </div>
        {/* GM-G4b：脚部按钮统一用 .cmd-cancel / .cmd-ok（与 CommandDialog 同一 palette token），视觉一致、零逻辑改动 */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {dlg.kind !== 'alert' && (
            <button className="cmd-cancel" onClick={cancel}>
              取消
            </button>
          )}
          <button className="cmd-ok" onClick={ok} autoFocus={dlg.kind !== 'prompt'}>
            {dlg.kind === 'confirm' ? '确定' : dlg.kind === 'alert' ? '知道了' : '确定'}
          </button>
        </div>
      </div>
    </div>
  )
}
