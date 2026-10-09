// 材质球 swatch 选择器（Flux.1-schnell 生成嘅 studio render 材质球）。
// Ribbon 顶栏「材质…」下拉旁边一粒掣 → 开一个网格弹窗，点材质球即套用（setMaterialPreset）。
// 比纯文字下拉直观好多（Fusion Appearance 式视觉拣料）。下拉保留做后备。
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { clampPopover, type PopoverPlacement } from '../ui/popoverClamp'
import { useApp, MATERIALS } from '../store'
import { tMaterialName } from '../i18n'

// MATERIALS 中文 key → 生成图档英文名（public/mat/<eng>.png）。冇图嘅 key 回退纯色块。
const KEY2IMG: Record<string, string> = {
  钢: 'steel', 铝: 'alu', 黄铜: 'brass', 铜: 'copper', 塑料: 'plastic', 喷漆: 'paint',
  金: 'gold', 银: 'silver', 钛: 'titanium', 黑塑: 'blackplastic', 不锈钢: 'stainless',
  青铜: 'bronze', 木: 'wood', 橡胶: 'rubber', 玻璃: 'glass', PLA: 'pla', PETG: 'petg',
  ABS: 'abs', TPU: 'tpu', 尼龙PA: 'nylon', 树脂: 'resin',
}

const PICKER_W = 296
const SEL_BORDER = '#1a5fd6'                       // selected swatch: 2px solid + outer ring (visible, not hover-only)
const SEL_RING = '0 0 0 2px rgba(26,95,214,.35)'

export default function MaterialSwatchPicker() {
  const [open, setOpen] = useState(false)
  // GM-3DV3 M14：Physical Material 与 Appearance 分家（对标 Fusion 两个独立命令）。
  //   外观 tab = 换颜色/PBR/纹理（视觉，setMaterialPreset）；物理材质 tab = 只设密度（→ 质量/FEA/BOM，setPhysicalMaterial，唔郁外观）。
  const [tab, setTab] = useState<'appearance' | 'physical'>('appearance')
  const setMaterialPreset = useApp((s) => s.setMaterialPreset)
  const setPhysicalMaterial = useApp((s) => s.setPhysicalMaterial)
  const physMatName = useApp((s) => s.physMatName)
  const appearanceName = useApp((s) => s.appearanceName)   // 当前外观预设 → swatch 高亮
  const lang = useApp((s) => s.lang)
  const nm = (k: string) => tMaterialName(k, lang)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  // Fixed + viewport-clamped (was absolute/right:0 inside the scrolling ribbon → off-screen at 1280px).
  const [place, setPlace] = useState<PopoverPlacement>({ left: 8, top: 40, maxHeight: 480 })
  useLayoutEffect(() => {
    if (!open) return
    const fit = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const next = clampPopover(r, { width: PICKER_W }, { width: window.innerWidth, height: window.innerHeight }, { align: 'end' })
      setPlace((o) => (o.left === next.left && o.top === next.top && o.maxHeight === next.maxHeight ? o : next))
    }
    fit()
    window.addEventListener('resize', fit); window.addEventListener('scroll', fit, true)
    return () => { window.removeEventListener('resize', fit); window.removeEventListener('scroll', fit, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { const t = e.target as Node; if (ref.current && !ref.current.contains(t) && !popRef.current?.contains(t)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])
  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<{ tab?: 'appearance' | 'physical' }>).detail
      setTab(detail?.tab === 'physical' ? 'physical' : 'appearance')
      setOpen(true)
    }
    window.addEventListener('webcad:material-picker', onOpen)
    return () => window.removeEventListener('webcad:material-picker', onOpen)
  }, [])
  const keys = Object.keys(MATERIALS)
  const physKeys = keys.filter((k) => MATERIALS[k]?.density)   // 物理材质只列有密度嘅
  const tabBtn = (id: 'appearance' | 'physical'): CSSProperties => ({
    flex: 1, padding: '3px 6px', fontSize: 12, cursor: 'pointer', border: 'none', borderBottom: tab === id ? '2px solid #2b6cf0' : '2px solid transparent',
    background: 'none', color: tab === id ? '#1c2530' : '#7a8590', fontWeight: tab === id ? 600 : 400,
  })
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button ref={btnRef} className="tb-btn" aria-expanded={open} title="材質 / 外觀 — 物理材質(密度→質量) 與 外觀(顏色/PBR) 分兩 tab" onClick={() => setOpen((v) => !v)}
        style={{ padding: '2px 6px', fontSize: 13 }}>🎨</button>
      {open && createPortal(
        <div ref={popRef} role="menu" data-testid="material-swatch-popover" style={{ position: 'fixed', left: place.left, top: place.top, zIndex: 30000, background: '#fff', border: '1px solid #cfd6dd', borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,.22)', padding: 8, width: PICKER_W, maxWidth: 'calc(100vw - 16px)', boxSizing: 'border-box', maxHeight: Math.min(place.maxHeight, Math.round(window.innerHeight * 0.72)), overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 0, marginBottom: 8, borderBottom: '1px solid #e3e8ee' }}>
            <button style={tabBtn('appearance')} onClick={() => setTab('appearance')}>🎨 外觀</button>
            <button style={tabBtn('physical')} onClick={() => setTab('physical')}>⚖ 物理材質</button>
          </div>
          {tab === 'appearance' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {keys.map((k) => {
                const eng = KEY2IMG[k]
                const sel = appearanceName === k
                return (
                  <button key={k} className={'mat-swatch' + (sel ? ' mat-swatch-selected' : '')} title={`外觀：${nm(k)}（只改外觀，不改密度／質量）`} aria-pressed={sel} data-selected={sel ? 'true' : undefined} onClick={() => { setMaterialPreset(k); setOpen(false) }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, border: '2px solid ' + (sel ? SEL_BORDER : 'transparent'), boxShadow: sel ? SEL_RING : 'none', borderRadius: 6, padding: 1, background: sel ? '#e3edff' : 'none', cursor: 'pointer' }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = sel ? SEL_BORDER : '#9db8e8'; e.currentTarget.style.background = sel ? '#e3edff' : '#f2f6fc' }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = sel ? SEL_BORDER : 'transparent'; e.currentTarget.style.background = sel ? '#e3edff' : 'none' }}>
                    {eng
                      ? <img src={`/mat/${eng}.png`} alt={nm(k)} width={44} height={44} style={{ borderRadius: '50%', display: 'block', objectFit: 'cover' }} loading="lazy" />
                      : <span style={{ width: 44, height: 44, borderRadius: '50%', background: MATERIALS[k]?.color || '#bbb', display: 'block', boxShadow: 'inset 0 -6px 10px rgba(0,0,0,.25), inset 0 6px 8px rgba(255,255,255,.5)' }} />}
                    <span style={{ fontSize: 10, color: '#5a6570', lineHeight: 1.1, textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 50, fontWeight: sel ? 600 : 400 }}>{nm(k)}</span>
                  </button>
                )
              })}
            </div>
          )}
          {tab === 'physical' && (
            <div>
              <div style={{ fontSize: 10, color: '#8a95a0', marginBottom: 6 }}>設材質 → 密度（質量 / FEA / BOM）＋外觀顏色跟材質（之後可喺「外觀」分頁單獨改色）。當前：{physMatName ? nm(physMatName) : '（未指定，用預設密度）'}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {physKeys.map((k) => (
                  <button key={k} title={`物理材質：${nm(k)}（密度 ${MATERIALS[k].density} g/cm³）`} onClick={() => { setPhysicalMaterial(k); setOpen(false) }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, border: '1px solid ' + (physMatName === k ? '#2b6cf0' : 'transparent'), borderRadius: 6, padding: '3px 8px', background: physMatName === k ? '#eef3fc' : 'none', cursor: 'pointer', fontSize: 12 }}
                    onMouseEnter={(e) => { if (physMatName !== k) e.currentTarget.style.background = '#f2f5f9' }}
                    onMouseLeave={(e) => { if (physMatName !== k) e.currentTarget.style.background = 'none' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 14, borderRadius: 3, background: MATERIALS[k]?.color || '#bbb', display: 'inline-block' }} />{nm(k)}</span>
                    <span style={{ color: '#6a7580', fontVariantNumeric: 'tabular-nums' }}>{MATERIALS[k].density} g/cm³</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      , document.body)}
    </div>
  )
}
