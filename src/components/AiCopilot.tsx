// T809：AI Copilot 面板 — 聊天 + 工具调用控制 app。多供应商（OpenAI/Grok/Gemini/本地）。
// 一个浮动启动钮（右下 ✦）+ 一个聊天面板（设置/对话/输入）。纯 client，API key 存自己浏览器。
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../store'
import { tStatus } from '../i18n'
import { PROVIDER_DEFAULTS, type AiProvider } from '../ai/providers'
import { useDraggable } from './useDraggable'

const PROVIDERS: AiProvider[] = ['openai', 'grok', 'gemini', 'local']

export default function AiCopilot() {
  const open = useApp((s) => s.aiOpen)
  const busy = useApp((s) => s.aiBusy)
  const cfg = useApp((s) => s.aiConfig)
  const msgs = useApp((s) => s.aiMessages)
  const toggle = useApp((s) => s.toggleAiPanel)
  const setCfg = useApp((s) => s.setAiConfig)
  const clear = useApp((s) => s.aiClear)
  const send = useApp((s) => s.aiSend)
  const lang = useApp((s) => s.lang)
  const [draft, setDraft] = useState('')
  const [showCfg, setShowCfg] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const drag = useDraggable('webcad-ai-fab', { right: 18, bottom: 18 })   // 启动钮可拖移（同 🩺诊断 钮唔再叠 + 唔挡底栏）

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [msgs, open])
  // 首开未设 key → 自动展开设置
  useEffect(() => { if (open && PROVIDER_DEFAULTS[cfg.provider].needsKey && !cfg.apiKey) setShowCfg(true) }, [open, cfg.provider, cfg.apiKey])

  if (!open) {
    return (
      <button onPointerDown={drag.onPointerDown} onClick={() => { if (drag.consumeClick()) return; toggle() }} title={tStatus('AI Copilot — 用自然语言控制 / 协助使用 app（OpenAI / Grok / Gemini / 本地 LLM）', lang) + ' · 揿住可拖移'}
        style={{ position: 'fixed', zIndex: 24000, width: 48, height: 48, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#6d4ef0,#2b6cf0)', color: '#fff', fontSize: 22, boxShadow: '0 4px 16px rgba(0,0,0,.3)', touchAction: 'none', ...drag.style }}>✦</button>
    )
  }

  const submit = () => { const t = draft.trim(); if (!t || busy) return; setDraft(''); void send(t) }

  return (
    <div ref={drag.ref} style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 24000, width: 'min(380px, 94vw)', height: 'min(560px, 82vh)', background: '#fff', borderRadius: 12, boxShadow: '0 12px 48px rgba(0,0,0,.32)', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontSize: 13, color: '#222', ...drag.style }}>
      {/* 头 */}
      <div onPointerDown={drag.onPointerDown} title="拖移 AI 面板" style={{ padding: '8px 12px', background: 'linear-gradient(135deg,#6d4ef0,#2b6cf0)', color: '#fff', display: 'flex', alignItems: 'center', gap: 8, cursor: 'grab', touchAction: 'none' }}>
        <b style={{ flex: 1 }}>✦ AI Copilot</b>
        <span style={{ fontSize: 11, opacity: 0.85 }}>{PROVIDER_DEFAULTS[cfg.provider].label}</span>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => setShowCfg((v) => !v)} title={tStatus('设置（供应商 / API Key / 模型）', lang)} style={hdrBtn}>⚙</button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={clear} title={tStatus('清空对话', lang)} style={hdrBtn}>🗑</button>
        <button onPointerDown={(e) => e.stopPropagation()} onClick={toggle} title={tStatus('关闭', lang)} style={hdrBtn}>✕</button>
      </div>

      {/* 设置 */}
      {showCfg && (
        <div style={{ padding: 10, background: '#f6f8fa', borderBottom: '1px solid #e6eaee', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <label style={cfgRow}><span style={cfgLbl}>{tStatus('供应商', lang)}</span>
            <select value={cfg.provider} onChange={(e) => setCfg({ provider: e.target.value as AiProvider })} style={cfgIn}>
              {PROVIDERS.map((p) => <option key={p} value={p}>{PROVIDER_DEFAULTS[p].label}</option>)}
            </select>
          </label>
          {PROVIDER_DEFAULTS[cfg.provider].needsKey && (
            <label style={cfgRow}><span style={cfgLbl}>{tStatus('API Key', lang)}</span>
              <input type="password" value={cfg.apiKey} placeholder={tStatus('sk-… / 你的 key（存本地浏览器）', lang)} onChange={(e) => setCfg({ apiKey: e.target.value })} style={cfgIn} />
            </label>
          )}
          <label style={cfgRow}><span style={cfgLbl}>{tStatus('模型', lang)}</span>
            <input value={cfg.model} onChange={(e) => setCfg({ model: e.target.value })} style={cfgIn} />
          </label>
          <label style={cfgRow}><span style={cfgLbl}>{tStatus('Base URL', lang)}</span>
            <input value={cfg.baseUrl} onChange={(e) => setCfg({ baseUrl: e.target.value })} style={cfgIn} />
          </label>
          <span style={{ fontSize: 11, color: '#8a97a2', lineHeight: 1.4 }}>
            {tStatus('🔒 Key 只存喺你浏览器、直连供应商（零服务器）。本地 LLM（Ollama/LM Studio）喺线上 https 站可能被「混合内容」拦 —— 用 localhost 开发版或 https 端点。', lang)}
          </span>
        </div>
      )}

      {/* 对话 */}
      <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, background: '#fbfcfd' }}>
        {msgs.length === 0 && (
          <div style={{ color: '#8a97a2', fontSize: 12, lineHeight: 1.6 }}>
            {tStatus('👋 我可以帮你', lang)}<b>{tStatus('操作 app', lang)}</b>{tStatus('或', lang)}<b>{tStatus('解答用法', lang)}</b>{tStatus('。试下：', lang)}<br />
            {tStatus('• 「做个 60×40×20 嘅盒，中间挖个 Ø20 通孔」', lang)}<br />
            {tStatus('• 「载入齿轮范本，然后话我知体积」', lang)}<br />
            {tStatus('• 「点样喺一条边倒 R5 圆角？」', lang)}<br />
            {tStatus('• 「加个参数 厚度=3，再设成 5」', lang)}
          </div>
        )}
        {msgs.map((m, i) => {
          if (m.role === 'tool') return <div key={i} style={{ fontSize: 11, color: '#6b7680', background: '#eef1f4', borderRadius: 6, padding: '4px 8px', alignSelf: 'flex-start', maxWidth: '92%', wordBreak: 'break-word' }}>🔧 {m.name}: {m.content}</div>
          const mine = m.role === 'user'
          const toolNote = m.toolCalls?.length ? (m.content ? m.content + ' ' : '') + '⏳ ' + m.toolCalls.map((t) => t.name).join(', ') : m.content
          return (
            <div key={i} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '88%', background: mine ? '#2b6cf0' : '#eef1f4', color: mine ? '#fff' : '#222', borderRadius: 10, padding: '7px 11px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>
              {mine ? toolNote : tStatus(String(toolNote ?? ''), lang)}
            </div>
          )
        })}
        {busy && <div style={{ alignSelf: 'flex-start', color: '#8a97a2', fontSize: 12 }}>{tStatus('✦ 思考中…', lang)}</div>}
      </div>

      {/* 输入 */}
      <div style={{ padding: 8, borderTop: '1px solid #e6eaee', display: 'flex', gap: 6, alignItems: 'flex-end' }}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} placeholder={tStatus('问我，或叫我做… (Enter 发送 · Shift+Enter 换行)', lang)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
          style={{ flex: 1, resize: 'none', border: '1px solid #ccd3da', borderRadius: 8, padding: '6px 9px', fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        <button onClick={submit} disabled={busy || !draft.trim()} style={{ background: busy || !draft.trim() ? '#9bb6e8' : '#2b6cf0', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', cursor: busy ? 'default' : 'pointer', fontWeight: 600 }}>↑</button>
      </div>
    </div>
  )
}

const hdrBtn: React.CSSProperties = { background: 'rgba(255,255,255,.18)', color: '#fff', border: 'none', borderRadius: 6, width: 24, height: 24, cursor: 'pointer', fontSize: 13 }
const cfgRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
const cfgLbl: React.CSSProperties = { width: 64, color: '#6b7680', fontSize: 12, flexShrink: 0 }
const cfgIn: React.CSSProperties = { flex: 1, border: '1px solid #ccd3da', borderRadius: 6, padding: '4px 8px', fontSize: 12, fontFamily: 'inherit', outline: 'none', minWidth: 0 }
