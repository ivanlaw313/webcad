// 测试报告观察 D：窄视窗（< ~1200px）功能区/视口会水平溢出需横向卷动。桌面导向 app，但畀平板/窄屏
// 用户一个一次性、可关闭嘅提示（记 localStorage，关咗就唔再烦）。唔强制 min-width，唔阻碍现有横向卷动。
import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { tStatus } from '../i18n'

const KEY = 'webcad-narrow-hint-dismissed'
const NARROW = 1180

export default function NarrowHint() {
  const lang = useApp((s) => s.lang)
  const [narrow, setNarrow] = useState(false)
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })

  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < NARROW)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  if (!narrow || dismissed) return null
  const close = () => { setDismissed(true); try { localStorage.setItem(KEY, '1') } catch { /* ignore */ } }
  return (
    <div role="status" style={{
      position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 25000,
      background: '#fff8ec', border: '1px solid #d9a64e', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.18)',
      padding: '7px 12px', display: 'flex', gap: 10, alignItems: 'center', fontSize: 12.5, color: '#7a5a1e', maxWidth: '92vw',
    }}>
      <span>📐 {tStatus('此 CAD 为桌面宽屏设计 — 当前窗口偏窄', lang)}（&lt;{NARROW}px）{tStatus('，部分工具栏需横向滚动。建议放大窗口或用 ≥1280px 屏。', lang)}</span>
      <button onClick={close} style={{ border: '1px solid #d9a64e', background: '#fff', borderRadius: 6, padding: '2px 10px', cursor: 'pointer', color: '#7a5a1e', flexShrink: 0 }}>{tStatus('知道了', lang)}</button>
    </div>
  )
}
