import { useEffect, useState } from 'react'
import { useApp } from '../store'
import { msg } from '../i18n'

const KEY = 'webcad-narrow-hint-dismissed'
const NARROW = 1180

/** In-flow help in the ribbon: never cover the canvas, dialogs or timeline. */
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
  const close = () => { setDismissed(true); try { localStorage.setItem(KEY, '1') } catch { /* Storage may be disabled. */ } }
  return <div role="note" data-narrow-help style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '2px 8px', borderTop: '1px solid #ccd9e2', background: '#eef5fa', color: '#365369', fontSize: 11, lineHeight: 1.5 }}>
    <details style={{ flex: 1, minWidth: 0, maxHeight: '25vh', overflow: 'auto' }}>
      <summary style={{ cursor: 'pointer' }}>{msg('hint.title', lang)}</summary>
      <p style={{ margin: '4px 0', overflowWrap: 'anywhere' }}>{msg('hint.body', lang)}</p>
    </details>
    <button onClick={close} aria-label={msg('hint.dismiss', lang)} style={{ flexShrink: 0, border: 0, borderRadius: 3, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: '0 5px', fontSize: 14 }}>×</button>
  </div>
}
