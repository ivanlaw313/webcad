import { useEffect, useRef, useState } from 'react'
import { ToolIcon } from '../icons'

export type MMItem = { key: string; label: string; icon?: string; glyph?: string; fn: () => void; disabled?: boolean }

// 8 sector unit-offsets, clockwise from N: N NE E SE S SW W NW (45° steps).
const DIRS: [number, number][] = [
  [0, -1], [0.707, -0.707], [1, 0], [0.707, 0.707],
  [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707],
]

// Fusion-style radial marking menu: 8 circular buttons around the right-click point at 45° steps,
// remaining commands as a vertical overflow list below (= 「更多」linear fallback for long lists).
// Backdrop / center click / Esc (caller's capture-phase listener) closes it — center = close, Fusion 式.
// Center is clamped so the ring always fits on screen.
// GM-G4b：两种执行手势 —— ①指向扇区【点击】(不变，与旧版逐位一致)；②Fusion 肌肉记忆【快速甩】
// (press-move-release 朝某方向甩出环外即执行该扇区)。cursor 指向边个扇区就实时高亮 (.hot)，令甩有视觉预示。
export default function MarkingMenu({ x, y, sectors, overflow, onClose }: {
  x: number
  y: number
  sectors: (MMItem | null)[]   // exactly 8 entries (N NE E SE S SW W NW); null = empty sector
  overflow: (MMItem | 'sep')[]
  onClose: () => void
}) {
  const R = 80, BTN = 58
  const cx = Math.min(Math.max(x, R + BTN / 2 + 8), window.innerWidth - R - BTN / 2 - 8)
  const cy = Math.min(Math.max(y, R + BTN / 2 + 40), window.innerHeight - R - BTN / 2 - 46)
  const run = (it: MMItem) => { if (it.disabled) return; it.fn(); onClose() }

  // GM-G4b：指向高亮嘅扇区（-1 = 中心死区 / 无对齐扇区 → 无高亮）。
  const [active, setActive] = useState(-1)
  // window 监听器要攞到最新 sectors/center/onClose，避免过时闭包（sectors 每次 render 换 identity）。
  const st = useRef({ sectors, cx, cy, onClose })
  st.current = { sectors, cx, cy, onClose }
  // GM-G4b flick 手势 + 方向高亮：只对精细指针（滑鼠/触控板 hover:hover pointer:fine）启用。
  // 触屏诚实说明：冇 hover 轨迹 → 唔跑 flick/高亮，靠直接【点扇区】或下方线性列表（radial 依赖指针）。
  useEffect(() => {
    if (typeof window.matchMedia !== 'function' || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    const DEAD = 26                 // 中心死区半径：cursor 喺呢个圈内 = 无高亮（免中心附近乱跳）
    const FLICK_R = R + BTN / 2 + 12 // 越过呢个半径（环外）+ 够快 = 甩中该方向扇区
    let prevD = 0, prevT = performance.now(), fired = false
    const onMove = (e: PointerEvent) => {
      const { cx: mx, cy: my, sectors: secs, onClose: close } = st.current
      const dx = e.clientX - mx, dy = e.clientY - my
      const dist = Math.hypot(dx, dy)
      const now = performance.now()
      // 方向高亮：cursor 相对中心嘅方向，取 8 个单位方向中点积最大者（= 最近嘅 45° 扇区）。
      let sec = -1
      if (dist >= DEAD) { let bd = -Infinity; for (let i = 0; i < 8; i++) { const d = dx * DIRS[i][0] + dy * DIRS[i][1]; if (d > bd) { bd = d; sec = i } } }
      if (sec >= 0 && (!secs[sec] || secs[sec]!.disabled)) sec = -1   // 空/灰扇区唔高亮
      setActive(sec)
      // flick：径向速度 px/ms（正 = 向外），越环 + 够快 + 命中有效扇区 → 执行一次。
      const speed = (dist - prevD) / Math.max(1, now - prevT)
      if (!fired && dist > FLICK_R && prevD <= FLICK_R && speed > 0.55 && sec >= 0) {
        const it = secs[sec]
        if (it && !it.disabled) { fired = true; it.fn(); close(); prevD = dist; prevT = now; return }
      }
      prevD = dist; prevT = now
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [x, y])
  // GM-G4b：触屏/粗指针 = 无 hover 轨迹 → radial（指向高亮 + 甩）失去肌肉记忆优势、58px 圆掣拇指亦难㩒准 —
  // 诚实回退【线性菜单】：扇区命令 + 溢出命令合并做一条可滚动列表（同旧右键菜单一样逐项点，接线不变）。
  const fine = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  const linear: (MMItem | 'sep')[] = fine ? overflow : [...sectors.filter((s): s is MMItem => !!s), 'sep', ...overflow]
  const ovItems = linear.filter((it) => it !== 'sep').length
  const seps = linear.length - ovItems
  // real list height (rows + seps + padding, capped by maxHeight) — placing below the ring must
  // never pull the list up OVER the S/SE/SW buttons; if there's no room below, park it beside.
  const realH = Math.min(ovItems * 30 + seps * 9 + 8, 320)
  let listTop = cy + R + BTN / 2 + 10
  let listLeft = Math.min(cx - 78, window.innerWidth - 180)
  if (listTop + realH > window.innerHeight - 8) {
    listTop = Math.max(8, Math.min(cy - realH / 2, window.innerHeight - realH - 8))
    listLeft = cx + R + BTN / 2 + 12
    if (listLeft + 170 > window.innerWidth - 8) listLeft = cx - R - BTN / 2 - 180
  }
  if (!fine) { listLeft = Math.max(8, Math.min(x, window.innerWidth - 190)); listTop = Math.max(8, Math.min(y, window.innerHeight - realH - 8)) }
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      {/* 中心点 = 关闭：pointer-events none → 点中心即穿透落背幕 onClose（Fusion center-dismiss 语义） */}
      {fine && <div className="mm-center" style={{ left: cx, top: cy }} />}
      {fine && sectors.map((it, i) => it && (
        <button
          key={it.key}
          className={'mm-btn' + (it.disabled ? ' off' : '') + (i === active ? ' hot' : '')}
          title={it.disabled ? `${it.label}（当前不可用）` : it.label}
          style={{ left: cx + DIRS[i][0] * R, top: cy + DIRS[i][1] * R }}
          onClick={() => run(it)}
        >
          {it.icon ? <ToolIcon name={it.icon} size={18} /> : <span className="mm-glyph">{it.glyph ?? '·'}</span>}
          <span className="mm-label">{it.label}</span>
        </button>
      ))}
      {ovItems > 0 && (
        <div style={{ position: 'fixed', left: listLeft, top: listTop, zIndex: 61, minWidth: 156, maxHeight: 320, overflowY: 'auto', background: '#fff', border: '1px solid #c4ccd4', borderRadius: 6, boxShadow: '0 6px 24px rgba(0,0,0,.18)', padding: 4, fontSize: 13, color: '#2a2f35', userSelect: 'none' }}>
          {linear.map((it, i) => it === 'sep'
            ? <div key={'s' + i} style={{ height: 1, background: '#e6e9ee', margin: '4px 6px' }} />
            : <div key={it.key} onClick={() => run(it)} style={{ padding: '6px 12px', borderRadius: 4, cursor: it.disabled ? 'default' : 'pointer', whiteSpace: 'nowrap', opacity: it.disabled ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }} onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = '#eaf2fb' }} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>{!fine && (it.icon ? <ToolIcon name={it.icon} size={14} /> : it.glyph ? <span style={{ width: 16, textAlign: 'center' }}>{it.glyph}</span> : null)}{it.label}</div>)}
        </div>
      )}
    </>
  )
}
