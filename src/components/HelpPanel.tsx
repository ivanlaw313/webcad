import { useState, useRef, useEffect, Fragment } from 'react'
import { useApp } from '../store'
import { msg } from '../i18n'

// GM-W6 E：帮助小标题旁嘅「指给我看」掣 —— 撳咗即喺真工具栏用弹跳箭头指出该命令（复用 teachCommand）。
function ShowMe({ q }: { q: string }) {
  const teach = useApp((s) => s.teachCommand)
  const toggle = useApp((s) => s.toggleHelp)
  const lang = useApp((s) => s.lang)
  return (
    <button onClick={(e) => { e.stopPropagation(); const hit = teach(q); if (hit) toggle() }}
      title={msg('help.showMeTitle', lang)}
      style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#fff', background: '#ff9500', border: 'none', borderRadius: 9, padding: '1px 8px', cursor: 'pointer', verticalAlign: 'middle' }}>
      {msg('help.showMe', lang)}
    </button>
  )
}

type HelpBlock = { h: string; p: string; showMe?: string; extra?: string }

const HELP_BLOCKS: HelpBlock[] = [
  { h: 'help.h0', p: 'help.p0' },
  { h: 'help.h0b', p: 'help.p0b', extra: 'help.p0esc' },
  { h: 'help.h1', p: 'help.p1', showMe: 'sketch' },
  { h: 'help.h1b', p: 'help.p1b' },
  { h: 'help.h1c', p: 'help.p1c' },
  { h: 'help.h1d', p: 'help.p1d' },
  { h: 'help.h2', p: 'help.p2', showMe: 'params' },
  { h: 'help.h3', p: 'help.p3', showMe: 'fillet' },
  { h: 'help.h4', p: 'help.p4' },
  { h: 'help.h5', p: 'help.p5', showMe: 'exportstl' },
  { h: 'help.h6', p: 'help.p6' },
  { h: 'help.h7', p: 'help.p7' },
  { h: 'help.hAbout', p: 'help.pAbout' },
]

const KEY_LINES = ['help.keys1', 'help.keys2', 'help.keys3', 'help.keys4', 'help.keys5', 'help.keys6', 'help.keys7'] as const

// In-app quick help: workflows, shortcuts, and the full feature list — for first-time use.
export default function HelpPanel() {
  const open = useApp((s) => s.helpOpen)
  const toggle = useApp((s) => s.toggleHelp)
  const openIntro = useApp((s) => s.openIntro)
  const lang = useApp((s) => s.lang)
  const [query, setQuery] = useState('')
  const gridRef = useRef<HTMLDivElement>(null)

  // GM-W6 E：按子串过滤 —— 逐个 <h4> 连住其后嘅段落做一组，唔匹配就收埋（DOM 层面做，唔改内容结构）。
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const q = query.trim().toLowerCase()
    grid.querySelectorAll('section').forEach((secEl) => {
      const sec = secEl as HTMLElement
      let anyVisible = false
      let group: HTMLElement[] = []
      const flush = () => {
        if (!group.length) return
        const text = group.map((e) => e.textContent || '').join(' ').toLowerCase()
        const match = !q || text.includes(q)
        group.forEach((e) => { e.style.display = match ? '' : 'none' })
        if (match) anyVisible = true
        group = []
      }
      Array.from(sec.children).forEach((child) => {
        const el = child as HTMLElement
        if (el.tagName === 'H4') { flush(); group = [el] } else group.push(el)
      })
      flush()
      sec.style.display = anyVisible ? '' : 'none'
    })
  }, [query, open, lang])

  if (!open) return null

  const mid = Math.ceil(HELP_BLOCKS.length / 2)
  const left = HELP_BLOCKS.slice(0, mid)
  const right = HELP_BLOCKS.slice(mid)

  const renderBlock = (b: HelpBlock) => (
    <Fragment key={b.h}>
      <h4>{msg(b.h, lang)}{b.showMe ? <ShowMe q={b.showMe} /> : null}</h4>
      <p>{msg(b.p, lang)}</p>
      {b.extra ? <p>{msg(b.extra, lang)}</p> : null}
    </Fragment>
  )

  return (
    <div className="drawing-overlay" onClick={toggle}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dw-head">{msg('help.title', lang)}<span className="dw-x" onClick={toggle}>✕</span></div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={msg('help.searchPlaceholder', lang)}
          style={{ width: '100%', boxSizing: 'border-box', margin: '10px 0 4px', padding: '7px 10px', fontSize: 13, border: '1px solid #cfd8e0', borderRadius: 6 }} />
        <button className="cs-btn" onClick={() => { useApp.getState().setDebugMode(true); toggle() }}>{msg('help.debugBtn', lang)}</button>
        <div className="help-grid" ref={gridRef}>
          <section>{left.map(renderBlock)}</section>
          <section>
            {right.map(renderBlock)}
            <h4>{msg('help.hKeys', lang)}</h4>
            <ul className="help-keys">
              {KEY_LINES.map((k) => <li key={k}>{msg(k, lang)}</li>)}
            </ul>
          </section>
        </div>
        <div className="dw-foot">
          <button className="cs-btn" onClick={openIntro}>{msg('help.replayIntro', lang)}</button>
          <button className="cs-btn" onClick={toggle}>{msg('help.gotIt', lang)}</button>
        </div>
      </div>
    </div>
  )
}
