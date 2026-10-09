import { useEscapeLayer } from './useEscapeLayer'
// T805（报告 R3）：统一应用内对话框 — 取代 native window.prompt/alert/confirm。
// 报告指出旧做法有两个问题：(1) Chrome 喺自动化/iframe 会「抑制」原生弹窗,prompt() 静默返回 null,
// 功能默默唔执行;(2) 原生弹窗样式与 app 割裂、无校验。呢个居中模态由 store.uiDialog 驱动,
// appPrompt/appConfirm/appAlert 系 Promise 化,撳确定/取消即 resolve。Enter 确定、Esc 取消。
import { useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { msg, tStatus, isZhFamily } from '../i18n'

export default function PromptDialog() {
  const dlg = useApp((s) => s.uiDialog)
  const resolveDialog = useApp((s) => s.resolveDialog)
  const lang = useApp((s) => s.lang)
  const initVal = (d: typeof dlg) => (d?.kind === 'prompt' || d?.kind === 'pick' ? d.def : '')
  const [draft, setDraft] = useState({ dialog: dlg, value: initVal(dlg) })
  // Reset before committing a new dialog, never after it becomes editable.
  if (draft.dialog !== dlg) setDraft({ dialog: dlg, value: initVal(dlg) })
  const val = draft.dialog === dlg ? draft.value : initVal(dlg)
  const listRef = useRef<HTMLDivElement>(null)
  // JOINT #4：滑鼠經過選項只係【高亮】，唔改選中值 —— 以前 onMouseEnter 直接改 value，用戶由清單郁落「確定」
  // 途經「球」就變咗揀球（預設旋轉被覆蓋）。選中只靠撳選項（即確定）或 ↑↓。
  const [hover, setHover] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 每次打开新框：重置输入为默认值,聚焦并全选（方便直接覆写）。
  useLayoutEffect(() => {
    if (dlg?.kind === 'prompt') {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else if (dlg?.kind === 'pick') {
      listRef.current?.focus()   // RETEST17 #1：清單取焦點 → ↑↓/Enter 可用
    }
  }, [dlg])

  useEscapeLayer(!!dlg, () => resolveDialog(dlg?.kind === 'confirm' ? false : null), 30000)
  if (!dlg) return null
  // Simplified source strings (store.ts) → HK Traditional in zh-HK; en/ja pass through unchanged.
  const tx = (s: string) => (isZhFamily(lang) ? tStatus(s, lang) : s)

  const ok = () => resolveDialog(dlg.kind === 'prompt' || dlg.kind === 'pick' ? val : dlg.kind === 'confirm' ? true : null)
  const opts = dlg.kind === 'pick' ? (dlg.options ?? []) : []
  const cancel = () => resolveDialog(dlg.kind === 'confirm' ? false : null)
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
    if (dlg.kind === 'pick' && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && opts.length) {
      e.preventDefault()
      const i = Math.max(0, opts.findIndex((o) => o.value === val))
      const n = (i + (e.key === 'ArrowDown' ? 1 : opts.length - 1)) % opts.length
      setDraft({ dialog: dlg, value: opts[n].value })
      return
    }
    if (e.key === 'Enter') { e.preventDefault(); ok() }
    else if (e.key === 'Escape') { e.preventDefault(); cancel() }
  }

  return (
    <div
      role="dialog" aria-modal="true" aria-label={tx(dlg.title)}
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
          <span>{dlg.kind === 'alert' ? '💬' : dlg.kind === 'confirm' ? '❓' : dlg.kind === 'pick' ? '☰' : '✎'}</span>
          <span>{tx(dlg.title)}</span>
        </div>
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* 讯息支持多行（\n）；用 pre-line 保留换行 */}
          <div style={{ whiteSpace: 'pre-line', lineHeight: 1.55, color: '#3a4248' }}>{tx(dlg.msg)}</div>
          {/* RETEST17 #1：可點選清單（Fusion 下拉式）— 撳一項即確定；↑↓ 移動、Enter 確定 */}
          {dlg.kind === 'pick' && (
            <div ref={listRef} role="listbox" tabIndex={0} aria-label={tx(dlg.title)} data-testid="dialog-pick-list"
              style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: '50vh', overflowY: 'auto', outline: 'none', border: '1px solid #c8d0d8', borderRadius: 6, padding: 3 }}>
              {opts.map((o) => {
                const on = o.value === val, hov = o.value === hover
                return (
                  <button key={o.value} type="button" role="option" aria-selected={on} data-testid={`dialog-pick-${o.value}`}
                    onMouseEnter={() => setHover(o.value)} onMouseLeave={() => setHover((h) => (h === o.value ? null : h))}
                    onClick={() => resolveDialog(o.value)}
                    style={{ display: 'flex', alignItems: 'baseline', gap: 10, textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, background: on ? '#e3effa' : hov ? '#f2f6fa' : 'transparent', outline: on ? '1px solid #8db7e0' : 'none', color: '#1f2a33' }}>
                    <span style={{ fontWeight: 600, minWidth: 72 }}>{o.label}</span>
                    {o.hint && <span style={{ fontSize: 11.5, color: '#6b7782' }}>{o.hint}</span>}
                  </button>
                )
              })}
            </div>
          )}
          {dlg.kind === 'prompt' && (
            <input
              ref={inputRef}
              value={val}
              aria-label={tx(dlg.title)}
              onChange={(e) => setDraft({ dialog: dlg, value: e.target.value })}
              style={{
                padding: '8px 10px', border: '1px solid #c8d0d8', borderRadius: 6,
                fontSize: 14, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box',
              }}
            />
          )}
        </div>
        {/* GM-G4b：脚部按钮统一用 .cmd-cancel / .cmd-ok（与 CommandDialog 同一 palette token），视觉一致、零逻辑改动 */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {/* T3：第三掣（例：開新檔案 →「儲存」先存後開，Fusion 同款） */}
          {dlg.kind === 'confirm' && dlg.alt && (
            <button className="cmd-cancel" data-testid="dialog-alt" style={{ marginRight: 'auto' }} onClick={() => resolveDialog('alt')}>
              {dlg.alt}
            </button>
          )}
          {dlg.kind !== 'alert' && (
            <button className="cmd-cancel" onClick={cancel}>
              {msg('dlg.cancel', lang)}
            </button>
          )}
          <button className="cmd-ok" onClick={ok} autoFocus={dlg.kind !== 'prompt' && dlg.kind !== 'pick'}>
            {dlg.kind === 'alert' ? msg('dlg.gotIt', lang) : msg('dlg.ok', lang)}
          </button>
        </div>
      </div>
    </div>
  )
}
