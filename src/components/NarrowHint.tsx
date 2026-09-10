import { useEffect, useState } from 'react'
import { useApp } from '../store'

const KEY = 'webcad-narrow-hint-dismissed'
const NARROW = 1180

/** In-flow help in the ribbon: never cover the canvas, dialogs or timeline. */
export default function NarrowHint() {
  const en = useApp((s) => s.lang === 'en')
  const [narrow, setNarrow] = useState(false)
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })
  useEffect(() => {
    const check = () => setNarrow(window.innerWidth < NARROW)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  if (!narrow || dismissed) return null
  const close = () => { setDismissed(true); try { localStorage.setItem(KEY, '1') } catch { /* Storage may be disabled. */ } }
  return <div role="note" data-narrow-help style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '2px 8px', borderTop: '1px solid #ccd9e2', background: '#eef5fa', color: '#365369', fontSize: 11, lineHeight: 1.5 }}>
    <details style={{ flex: 1, minWidth: 0, maxHeight: '25vh', overflow: 'auto' }}>
      <summary style={{ cursor: 'pointer' }}>{en ? 'Small-screen controls' : '小屏幕操作提示'}</summary>
      <p style={{ margin: '4px 0', overflowWrap: 'anywhere' }}>{en
        ? 'Scroll the tool row sideways to reach more tools. Drag panel titles to move panels; use their arrow buttons to collapse them. Collapse the browser tree or ribbon to make more drawing space.'
        : '工具列可横向滚动查看更多工具；拖动面板标题可移开，箭头按钮可收起。收起浏览树或功能区，可增加绘图空间。'}</p>
    </details>
    <button onClick={close} aria-label={en ? 'Dismiss small-screen tips' : '关闭小屏幕提示'} style={{ flexShrink: 0, border: 0, borderRadius: 3, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: '0 5px', fontSize: 14 }}>×</button>
  </div>
}
