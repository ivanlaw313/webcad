import { APP_VERSION } from '../version'
import { useEscapeLayer } from './useEscapeLayer'
import NarrowHint from './NarrowHint'
import { createPortal } from 'react-dom'
import { activeModelCommand, commandContextKey, commandDisabledReason } from '../cad/commandAvailability'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { useApp, MATERIALS, SAMPLE_LABELS, type SampleKind } from '../store'
import { ToolIcon } from '../icons'
import { WORKSPACE_TABS, WORKSPACES, SKETCH_PANELS, FORM_PANELS, type Tool } from '../ribbon'
import { tLabel, tGroup, tTab, msg, normalizeLang, type Lang } from '../i18n'   // T800 + v1.74 4-locale
import { FASTENER_KIND_LABEL, FASTENER_SIZES, type FastenerKind, type FastenerSize } from '../cad/fasteners'
import { TEXTURE_KEYS } from '../render/procTextures'
import MaterialSwatchPicker from './MaterialSwatchPicker'   // 材质球视觉拣料

// Standard metric fastener library picker: choose kind / size (/length for screws) → insert a real ISO-dim
// solid as a new assembly component. Honest: simplified (plain shank, no helical thread) — see fasteners.ts.
function FastenerPicker() {
  const insertFastener = useApp((s) => s.insertFastener)
  const lang = useApp((s) => s.lang)   // GM-W8 C3：EN 模式翻译按钮/标签
  const [kind, setKind] = useState<FastenerKind>('capscrew')
  const [size, setSize] = useState<FastenerSize>('M5')
  const [len, setLen] = useState(16)
  return (
    <>
      <select className="tb-mat" title="标准件类型（ISO 标准尺寸）" value={kind} onChange={(e) => setKind(e.target.value as FastenerKind)}>
        {(Object.keys(FASTENER_KIND_LABEL) as FastenerKind[]).map((k) => <option key={k} value={k}>{FASTENER_KIND_LABEL[k]}</option>)}
      </select>
      <select className="tb-mat" title="公制规格" value={size} onChange={(e) => setSize(e.target.value as FastenerSize)}>
        {FASTENER_SIZES.map((sz) => <option key={sz} value={sz}>{sz}</option>)}
      </select>
      {kind !== 'hexnut' && kind !== 'washer' && (
        <label title={kind === 'dowel' ? '销长 mm' : '杆长 mm（头下）'} style={{ fontSize: 12 }}>{lang === 'en' ? 'Len' : '长'}<input type="number" step={2} min={3} value={len} onChange={(e) => setLen(Math.max(3, Number(e.target.value) || 16))} style={{ width: 46 }} /></label>
      )}
      <button className="tb-btn tb-text" title="插入标准件到装配（ISO 尺寸真实体；简化＝光杆无螺牙，外形标准。可用「配合」对齐）" onClick={() => void insertFastener(kind, size, len)}>
        <ToolIcon name="component" size={15} /> {msg('ui.insertFastener', lang)}
      </button>
    </>
  )
}

// Fusion's Insert Fastener uses a single configuration surface rather than a chain of prompts.
function FastenerDialog({ onClose }: { onClose: () => void }) {
  const insertFastener = useApp((s) => s.insertFastener)
  const lang = useApp((s) => s.lang)
  const [kind, setKind] = useState<FastenerKind>('capscrew')
  const [size, setSize] = useState<FastenerSize>('M5')
  const [len, setLen] = useState(16)
  const needsLength = kind !== 'hexnut' && kind !== 'washer'
  const label = (zh: string, en: string) => lang === 'en' ? en : zh
  useEscapeLayer(true, onClose, 400)
  const submit = async () => { await insertFastener(kind, size, needsLength ? Math.max(3, len || 16) : 16); onClose() }
  return <div role="dialog" aria-modal="true" aria-label={label('插入緊固件', 'Insert Fastener')} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(20,28,38,.28)', display: 'grid', placeItems: 'center' }} onMouseDown={onClose}>
    <section style={{ width: 392, maxWidth: 'calc(100vw - 32px)', background: '#fff', borderRadius: 10, boxShadow: '0 16px 48px rgba(0,0,0,.28)', padding: 18, color: '#263746' }} onMouseDown={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}><ToolIcon name="component" size={22} /><strong style={{ fontSize: 17 }}>{label('插入緊固件', 'Insert Fastener')}</strong><button type="button" aria-label={label('关闭', 'Close')} onClick={onClose} style={{ marginLeft: 'auto', border: 0, background: 'transparent', fontSize: 22, cursor: 'pointer', color: '#637484' }}>×</button></div>
      <div style={{ display: 'grid', gap: 11, fontSize: 13 }}>
        <label>{label('类型', 'Type')}<select aria-label={label('紧固件类型', 'Fastener type')} value={kind} onChange={(e) => setKind(e.target.value as FastenerKind)} style={{ display: 'block', width: '100%', marginTop: 4 }}>{(Object.keys(FASTENER_KIND_LABEL) as FastenerKind[]).map((k) => <option key={k} value={k}>{FASTENER_KIND_LABEL[k]}</option>)}</select></label>
        <label>{label('规格', 'Size')}<select aria-label={label('紧固件规格', 'Fastener size')} value={size} onChange={(e) => setSize(e.target.value as FastenerSize)} style={{ display: 'block', width: '100%', marginTop: 4 }}>{FASTENER_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
        {needsLength && <label>{label('长度（mm）', 'Length (mm)')}<input aria-label={label('紧固件长度', 'Fastener length')} type="number" min={3} step={1} value={len} onChange={(e) => setLen(Math.max(3, Number(e.target.value) || 16))} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 4 }} /></label>}
        <p style={{ margin: '1px 0 0', color: '#637484', lineHeight: 1.45 }}>{label('ISO 尺寸实体会作为独立组件插入；螺纹以简化光杆表示，并非 Autodesk 云端供应商库。', 'An ISO-dimension solid is inserted as an independent component. Threads are simplified shanks; this is not an Autodesk cloud supplier library.')}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 17 }}><button type="button" onClick={onClose}>{label('取消', 'Cancel')}</button><button type="button" onClick={() => void submit()} style={{ background: '#078acb', border: 0, borderRadius: 5, padding: '7px 15px', color: '#fff', fontWeight: 700 }}>{label('插入', 'Insert')}</button></div>
    </section>
  </div>
}

// Shared SKETCH_OK_CMDS and modal policy live with command dispatch.
function useCmdGate() {
  useApp(commandContextKey)
  return (id: string) => commandDisabledReason(useApp.getState(), id) !== null
}

// Portal menus escape the horizontally scrolling ribbon; inline submenus stay
// inside their scrollable parent so they cannot be clipped by overflow-y:auto.
function useFloatingMenu(open: boolean, anchor: { current: HTMLElement | null }, menu: { current: HTMLElement | null }) {
  const [placement, setPlacement] = useState({ left: 8, top: 100, maxHeight: 320 })
  useLayoutEffect(() => {
    if (!open) return
    const fit = () => {
      const a = anchor.current?.getBoundingClientRect(), el = menu.current
      if (!a || !el) return
      const top = Math.max(8, Math.min(a.bottom + 4, window.innerHeight - 160))
      const next = { left: Math.max(8, Math.min(a.left, window.innerWidth - el.offsetWidth - 8)), top, maxHeight: Math.max(80, window.innerHeight - top - 8) }
      setPlacement(old => old.left === next.left && old.top === next.top && old.maxHeight === next.maxHeight ? old : next)
    }
    fit()
    menu.current?.querySelector<HTMLElement>('[role=menuitem]:not([aria-disabled=true])')?.focus()
    const observer = new ResizeObserver(fit)
    if (menu.current) observer.observe(menu.current)
    window.addEventListener('resize', fit)
    window.addEventListener('scroll', fit, true)
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); window.removeEventListener('scroll', fit, true) }
  }, [open, anchor, menu])
  return placement
}

// Which sk_* tool id is currently the active freehand sketch tool (for Fusion-style pressed highlight).
const SK_TOOL_OF_ID: Record<string, string> = {
  sk_polyline: 'polyline', sk_rect: 'rectangle', sk_crect: 'crect', sk_circle: 'circle', sk_circle2p: 'circle2p', sk_circle3: 'circle3', sk_circle2t: 'circle2t', sk_circle3t: 'circle3t',
  sk_arc: 'arc', sk_arcc: 'arcc', sk_select: 'select', sk_dim: 'dimension', sk_move: 'move', sk_trim: 'trim', sk_extend: 'extend', sk_break: 'break', sk_offset: 'offset', sk_point: 'point', sk_cline: 'cline', sk_rect3: 'rect3', sk_polygon: 'polygon', sk_spline: 'spline', sk_bspline: 'bspline', sk_slot: 'slot', sk_arcslot: 'arcslot', sk_rrect: 'rrect', sk_ellipse: 'ellipse', sk_earc: 'earc', sk_conic: 'conic',
}

const SK_CON_OF_ID: Record<string, string> = { sk_c_h: 'h', sk_c_v: 'v', sk_c_coin: 'coincident', sk_c_par: 'parallel', sk_c_perp: 'perp', sk_c_eq: 'equal', sk_c_tan: 'tangent', sk_c_fix: 'fix', sk_c_mid: 'midpoint', sk_c_conc: 'concentric', sk_c_coll: 'collinear', sk_c_sym: 'symmetric' }

// Quick icon in the ribbon strip — Fusion style: icon only (~26px), label lives in the tooltip,
// the group's full command list lives in the "GROUP ▾" dropdown below.
function ToolButton({ t, onRun }: { t: Tool; onRun?: () => void }) {
  const run = useApp((s) => s.runCommand)
  const gate = useCmdGate()
  const skTool = useApp((s) => s.sketchTool)
  const armedCon = useApp((s) => s.skArmedCon)
  const inSketch = useApp((s) => s.mode === 'sketch')
  const lang = useApp((s) => s.lang)
  const off = gate(t.id)
  const active = inSketch && (armedCon ? SK_CON_OF_ID[t.id] === armedCon : SK_TOOL_OF_ID[t.id] === skTool)
  const [quickOpen, setQuickOpen] = useState(false)
  const quickAnchor = useRef<HTMLDivElement>(null), quickMenu = useRef<HTMLDivElement>(null)
  useEscapeLayer(quickOpen, () => { setQuickOpen(false); quickAnchor.current?.querySelector('button')?.focus() }, 241)
  const quickPlacement = useFloatingMenu(quickOpen, quickAnchor, quickMenu)
  const title = off ? `${t.label} — ${commandDisabledReason(useApp.getState(), t.id)}` : `${t.label}${t.shortcut ? ` (${t.shortcut})` : ''}${t.tip ? `\n${t.tip}` : ''}`
  // A quick parent with children (阵列 ▸) runs its first child on direct click (Fusion: icon = default cmd).
  const cmd = t.children?.length ? t.children[0] : t
  // Sketch tools render a 2D text glyph (◯ ▭ ⊿ …) + their Chinese label below, so a non-coder can
  // recognise 圆/矩形/折线 at a glance (the SVG icon set has no 2D-sketch shapes).
  if (t.glyph) {
    return (
      <button
        data-cmd={t.id}
        className={'tool-btn sk' + (active ? ' active' : '')}
        title={title}
        aria-label={tLabel(t.label, lang)}
        aria-pressed={active || undefined}
        disabled={off}
        style={off ? { opacity: 0.32, cursor: 'not-allowed' } : undefined}
        onClick={() => { if (off) return; if (onRun) onRun(); else run(cmd.id, cmd.label) }}
      >
        <span className="sk-glyph">{t.glyph}</span>
        <span className="sk-label">{tLabel(t.label, lang)}</span>
      </button>
    )
  }
  const mainButton = <button
    data-cmd={t.id}
    className={'tool-btn' + (active ? ' active' : '')}
    title={title}
    aria-label={tLabel(t.label, lang)}
    aria-pressed={active || undefined}
    disabled={off}
    style={off ? { opacity: 0.32, cursor: 'not-allowed' } : undefined}
    onClick={() => { if (off) return; if (onRun) onRun(); else run(cmd.id, cmd.label) }}
  ><ToolIcon name={t.icon} size={26} /><span className="tool-caption">{tLabel(t.label, lang)}</span></button>
  if (!t.quickChildren?.length) return mainButton
  return <div ref={quickAnchor} className="quick-split-tool" style={{ position: 'relative', display: 'inline-flex', alignItems: 'stretch' }}>
    {mainButton}
    <button
      type="button"
      className="tool-btn-caret"
      data-testid={`quick-tool-caret-${t.id}`}
      aria-label={`${tLabel(t.label, lang)} ${msg('ui.menu', lang)}`}
      disabled={off}
      onClick={(e) => { e.stopPropagation(); if (!off) setQuickOpen((value) => !value) }}
      style={{ width: 13, padding: 0, border: 0, background: 'transparent', cursor: off ? 'not-allowed' : 'pointer', color: 'inherit' }}
    >▾</button>
    {quickOpen && createPortal(<>
      <div style={{ position: 'fixed', inset: 0, zIndex: 240 }} onClick={() => setQuickOpen(false)} />
      <div ref={quickMenu} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { setQuickOpen(false); quickAnchor.current?.querySelector('button')?.focus() } }} className="panel-menu" role="menu" data-testid={`quick-tool-menu-${t.id}`} style={{ position: 'fixed', ...quickPlacement, zIndex: 241, minWidth: 170 }}>
        {t.quickChildren.map((child) => <div
          key={child.id}
          data-cmd={child.id}
          className="panel-menu-item"
          title={child.tip || child.label}
          role="menuitem" tabIndex={gate(child.id) ? -1 : 0} aria-disabled={gate(child.id)} onKeyDown={e => { if (!gate(child.id) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setQuickOpen(false); run(child.id, child.label) } }}
          onClick={() => { if (gate(child.id)) return; setQuickOpen(false); run(child.id, child.label) }}
        ><ToolIcon name={child.icon} size={16} />{tLabel(child.label, lang)}{child.shortcut && <span className="panel-menu-kbd" style={{ marginLeft: 'auto' }}>{child.shortcut}</span>}</div>)}
      </div>
    </>, document.body)}
  </div>
}

// One row inside a group dropdown menu (icon + label + right-aligned shortcut; optional ▸ submenu).
function MenuRow({ t, off, onPick }: { t: Tool; off: boolean; onPick: (t: Tool) => void }) {
  const [subOpen, setSubOpen] = useState(false)
  const lang = useApp((s) => s.lang)
  const hasSub = !!t.children?.length
  return (
    <div
      data-cmd={t.id}
      className={'panel-menu-item' + (off ? ' off' : '')}
      title={off ? '请先完成或取消（ESC）当前操作 / 完成草圖' : (t.tip || t.label)}
      style={{ flexWrap: hasSub ? 'wrap' : undefined }}
      role="menuitem" aria-disabled={off} tabIndex={off ? -1 : 0} aria-expanded={hasSub ? subOpen : undefined}
      onKeyDown={e => { if (e.target !== e.currentTarget || off) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (hasSub) setSubOpen(!subOpen); else onPick(t) } if (e.key === 'Escape') setSubOpen(false) }}
      onClick={() => { if (off) return; if (hasSub) { setSubOpen(!subOpen); return }; onPick(t) }}
    >
      {t.glyph ? <span style={{ width: 16, textAlign: 'center', fontSize: 13 }}>{t.glyph}</span> : <ToolIcon name={t.icon} size={16} />}{tLabel(t.label, lang)}
      <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {t.shortcut && <span className="panel-menu-kbd">{t.shortcut}</span>}
        {hasSub && <span style={{ fontSize: 10, color: '#888' }}>{subOpen ? '▾' : '▸'}</span>}
      </span>
      {hasSub && subOpen && (
        <div className="ribbon-submenu" role="menu" data-testid="ribbon-submenu" style={{ flexBasis: '100%', minWidth: 0, paddingLeft: 8, borderLeft: '2px solid #9bbcd5' }} onClick={e => e.stopPropagation()}>
          {t.children!.map((c) => (
            <div key={c.id} role="menuitem" tabIndex={off ? -1 : 0} aria-disabled={off} onKeyDown={e => { if (!off && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); onPick(c) } }} data-cmd={c.id} className={'panel-menu-item' + (off ? ' off' : '')} title={c.tip || c.label}
              onClick={(e) => { e.stopPropagation(); if (off) return; onPick(c) }}>
              <ToolIcon name={c.icon} size={16} />{tLabel(c.label, lang)}
              {c.shortcut && <span className="panel-menu-kbd" style={{ marginLeft: 'auto' }}>{c.shortcut}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Fusion-style group dropdown: click "CREATE ▾" → menu drops DOWN over the canvas listing ALL the
// group's commands with section dividers, shortcuts, and ▸ submenus (Pattern ▸).
function PanelFlyout({ name, tools, onCommand }: { name: string; tools: Tool[]; onCommand?: (t: Tool) => boolean }) {
  const run = useApp((s) => s.runCommand)
  const gate = useCmdGate()
  const lang = useApp((s) => s.lang)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null), menuRef = useRef<HTMLDivElement>(null)
  useEscapeLayer(open, () => { setOpen(false); anchorRef.current?.focus() }, 241)
  const placement = useFloatingMenu(open, anchorRef, menuRef)
  const dispName = tGroup(name, lang)   // GM-W6D：zh 显示中文组名，en 保持英文
  return (
    <div ref={anchorRef} role="button" tabIndex={0} aria-expanded={open} onKeyDown={e => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v) } if (e.key === 'Escape') setOpen(false) }} className="panel-label" data-ribbon-group={name} style={{ position: 'relative', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)} title={lang === 'en' ? `Show all ${dispName} commands` : `展开 ${dispName} 全部命令`}>
      {dispName} ▾
      {open && createPortal(
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 240 }} onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div ref={menuRef} className="panel-menu" data-testid="ribbon-group-menu" role="menu" onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { setOpen(false); anchorRef.current?.focus() } }} style={{ position: 'fixed', ...placement, zIndex: 241 }} onClick={(e) => e.stopPropagation()}>
            {tools.map((t, i) => (
              <div key={t.id + i}>
                {t.sep && <div className="panel-menu-divider" />}
                <MenuRow t={t} off={gate(t.id)} onPick={(c) => { if (!onCommand?.(c)) run(c.id, c.label); setOpen(false) }} />
              </div>
            ))}
          </div>
        </>, document.body
      )}
    </div>
  )
}

// Big left workspace selector block (Fusion's "DESIGN ▾" spanning the ribbon height).
function WorkspaceSelector() {
  const [open, setOpen] = useState(false)
  const lang = useApp((s) => s.lang)   // GM-W6D：EN 模式显示 Design
  return (
    <div className="ws-big" onClick={() => setOpen((o) => !o)} title={msg('ui.workspace', lang)}>
      <span className="ws-big-label">{msg('ui.design', lang)}</span>
      <span className="ws-big-caret">▾</span>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 70 }} onClick={(e) => { e.stopPropagation(); setOpen(false) }} />
          <div className="panel-menu" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 71, marginTop: 2 }}>
            <div className="panel-menu-item" onClick={() => setOpen(false)}>✓ {msg('ui.design', lang)}</div>
          </div>
        </>
      )}
    </div>
  )
}

export default function Ribbon() {
  const activeTab = useApp((s) => s.activeTab)
  const setActiveTab = useApp((s) => s.setActiveTab)
  const inSketch = useApp((s) => s.mode === 'sketch')
  const inForm = useApp((s) => s.formMode)
  const sketchDragging = useApp((s) => !!s.skDrag)
  const commandActive = useApp(activeModelCommand)
  const [compactTools, setCompactTools] = useState(() => localStorage.getItem('webcad-compact-tools') === 'true')
  useEffect(() => { localStorage.setItem('webcad-compact-tools', String(compactTools)) }, [compactTools])
  // P6 AI 教学：AI 调 explain_command 后 store.teachHi 变 → 切到该命令 tab（store 已做）+ 脉冲高亮个掣「指出畀用户睇」。
  const teachHi = useApp((s) => s.teachHi)
  useEffect(() => {
    if (!teachHi) return
    const t = setTimeout(() => {   // 等切 tab 后 DOM 重排完先揾掣；揾唔到（dropdown-only 命令/草图模式）→ 静默，AI 文字仍指路
      const btn = document.querySelector(`[data-cmd="${teachHi.cmdId}"]`)
      if (!btn) return
      btn.classList.add('teach-pulse')
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
      setTimeout(() => btn.classList.remove('teach-pulse'), 2400)
    }, 90)
    return () => clearTimeout(t)
  }, [teachHi])
  const [ribbonCollapsed, setRibbonCollapsed] = useState(false)   // Fusion：双击标签收起工具行（净留标签），腾画面空间
  const [showLib, setShowLib] = useState(false)                   // 顶栏「模板/材料/螺丝」收埋入 📦 弹出，令顶栏干净似 Fusion
  const [showFastenerDialog, setShowFastenerDialog] = useState(false)
  const lang = useApp((s) => s.lang)   // T800：i18n 语言切换
  const en = lang === 'en'   // GM-W8 C3：EN 模式短标签翻译
  const finishSketch = useApp((s) => s.finishSketch)
  const finishForm = useApp((s) => s.finishForm)
  const exportStl = useApp((s) => s.exportStl)
  const exportStep = useApp((s) => s.exportStep)
  const exportAssemblyStl = useApp((s) => s.exportAssemblyStl)
  const exportGLB = useApp((s) => s.exportGLB)
  const saveProject = useApp((s) => s.saveProject)
  const openProject = useApp((s) => s.openProject)
  const requestFit = useApp((s) => s.requestFit)
  const reset = useApp((s) => s.reset)
  const loadSample = useApp((s) => s.loadSample)
  const [sampleKind, setSampleKind] = useState<SampleKind>('plate')
  const [fileMenu, setFileMenu] = useState(false)
  const fileButton = useRef<HTMLButtonElement>(null)
  const fileMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (fileMenu) fileMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus() }, [fileMenu])
  const [filePosition, setFilePosition] = useState({ left: 8, top: 36 })
  useEscapeLayer(fileMenu, () => { setFileMenu(false); fileButton.current?.focus() }, 150)
  useLayoutEffect(() => {
    if (!fileMenu) return
    const place = () => {
      const r = fileButton.current?.getBoundingClientRect()
      if (r) setFilePosition({ left: Math.max(8, Math.min(r.left, window.innerWidth - 328)), top: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 100)) })
    }
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [fileMenu])
  const bodyColor = useApp((s) => s.bodyColor)
  const setBodyColor = useApp((s) => s.setBodyColor)
  const setMaterialPreset = useApp((s) => s.setMaterialPreset)
  const material = useApp((s) => s.material)
  const setBodyTexture = useApp((s) => s.setBodyTexture)
  const generateDrawing = useApp((s) => s.generateDrawing)
  const toggleHelp = useApp((s) => s.toggleHelp)
  const setCmdPalette = useApp((s) => s.setCmdPalette)
  const projectName = useApp((s) => s.projectName)
  const setProjectName = useApp((s) => s.setProjectName)
  const importStep = useApp((s) => s.importStep)
  const openObjDialog = useApp((s) => s.openObjDialog)
  const openDxfDialog = useApp((s) => s.openDxfDialog)
  const openSvgDialog = useApp((s) => s.openSvgDialog)
  const openStlDialog = useApp((s) => s.openStlDialog)
  const pickFile = (accept: string, cb: (buf: ArrayBuffer, base: string) => void) => {
    const inp = document.createElement('input')
    inp.type = 'file'; inp.accept = accept
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return
      cb(await f.arrayBuffer(), f.name.replace(/\.[^.]+$/, ''))
    }
    inp.click()
  }
  // BUG-BD-2001: File menu STL must use openStlDialog (File System Access + <input> fallback),
  // not bare pickFile — matches insertmesh ribbon path (BUG-BD-1804).
  const onImportStl = () => { setFileMenu(false); openStlDialog() }
  const onImportStep = () => pickFile('.step,.stp', (buf, base) => void importStep(buf, base))
  const import3MF = useApp((s) => s.import3MF)
  const onImport3MF = () => pickFile('.3mf', (buf, base) => void import3MF(buf, base))
  const exportObj = useApp((s) => s.exportObj)
  const exportThreeMF = useApp((s) => s.exportThreeMF)
  const exportSketchDxf = useApp((s) => s.exportSketchDxf)
  const undo = useApp((s) => s.undo)
  const redo = useApp((s) => s.redo)
  const ws = WORKSPACES[activeTab] ?? WORKSPACES.SOLID

  return (
    <div className="ribbon-shell">
      <div className="app-version" data-testid="app-version">WebCAD · version {APP_VERSION}</div>
      {/* top app bar — Fusion: file ▾ / save / undo / redo left, doc name centered, search/help right.
          Everything that used to crowd this bar lives in the 文件▾ menu or the ribbon groups. */}
      <div className="topbar">
        <button className="tb-btn" title="适应窗口 / 主视图" onClick={() => requestFit()}><ToolIcon name="home" size={18} /></button>
        <div className="tb-sep" />
        <div style={{ position: 'relative' }}>
          <button ref={fileButton} aria-haspopup="menu" aria-expanded={fileMenu} className="tb-btn tb-text" title={msg('file.title', lang)} onClick={() => setFileMenu((o) => !o)}>
            <ToolIcon name="menu" size={16} /> {msg('ui.file', lang)} ▾
          </button>
          {fileMenu && createPortal(
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 149 }} onClick={() => setFileMenu(false)} />
              <div ref={fileMenuRef} role="menu" aria-label="文件 File" onKeyDown={(e) => {
                if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
                e.preventDefault(); e.stopPropagation()
                const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
                const index = items.indexOf(document.activeElement as HTMLButtonElement)
                const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (index + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
                items[next]?.focus()
              }} className="panel-menu file-menu" style={{ position: 'fixed', top: filePosition.top, left: filePosition.left, zIndex: 150, width: 'min(320px, calc(100vw - 16px))', maxHeight: `calc(100dvh - ${filePosition.top + 8}px)`, overflowY: 'auto' }} onClick={() => setFileMenu(false)}>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={async () => { if (await useApp.getState().appConfirm('新建空白文档？当前模型会清空（未保存的话先「保存」）。')) void reset() }}><ToolIcon name="newdoc" size={16} />{msg('file.new', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={() => openProject()}><ToolIcon name="insert" size={16} />{msg('file.open', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={() => saveProject()}><ToolIcon name="save" size={16} />{msg('file.save', lang)}<span className="panel-menu-kbd" style={{ marginLeft: 'auto' }}>Ctrl+S</span></button>
                <button type="button" role="menuitem" className="panel-menu-item" title="分享链接（T797）：整个项目压缩入一条 URL（gzip+base64,零服务器零隐私）→ 复制到剪贴板。发畀人/收藏即可重开。大模型超 1.9MB 改用「保存」传档" onClick={() => { setFileMenu(false); void useApp.getState().shareLink() }}><ToolIcon name="insert" size={16} />{msg('file.share', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={() => useApp.getState().setHistoryOpen(true)}><ToolIcon name="undo" size={16} />{msg('file.history', lang)}</button>
                <div className="panel-menu-divider" />
                <button type="button" role="menuitem" className="panel-menu-item" onClick={onImportStl}><ToolIcon name="insert" size={16} />{msg('file.importStl', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={onImportStep}><ToolIcon name="insert" size={16} />{msg('file.importStep', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" title="保留 B-rep 入时间轴：导入后可继续 切割/圆角/抽壳/再导出 STEP（≤8MB；大文件用上面网格路线）" onClick={() => useApp.getState().openStepBrepDialog()}><ToolIcon name="insert" size={16} />{msg('file.importStepBrep', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={onImport3MF}><ToolIcon name="insert" size={16} />{msg('file.import3mf', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={openObjDialog}><ToolIcon name="insert" size={16} />{msg('file.importObj', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={openDxfDialog}><ToolIcon name="importdxf" size={16} />{msg('file.importDxf', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={openSvgDialog}><ToolIcon name="importsvg" size={16} />{msg('file.importSvg', lang)}</button>
                <div className="panel-menu-divider" />
                <button type="button" role="menuitem" className="panel-menu-item" onClick={() => void exportStl()}><ToolIcon name="save" size={16} />{msg('file.exportStl', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={() => void exportStep()}><ToolIcon name="save" size={16} />{msg('file.exportStep', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={exportThreeMF}><ToolIcon name="save" size={16} />{msg('file.export3mf', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={exportObj}><ToolIcon name="save" size={16} />{msg('file.exportObj', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" title={msg('file.exportSketchDxf', lang)} onClick={exportSketchDxf}><ToolIcon name="importdxf" size={16} />{msg('file.exportSketchDxf', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={() => exportAssemblyStl()}><ToolIcon name="save" size={16} />{msg('file.exportAsmStl', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" title="真布尔合并单壳（manifold union）：把装配各件熔成一个水密壳再导出——慢，但打印更稳（冇内壁/重叠壳）。要各件水密；失败会诚实回退三角汤" onClick={() => exportAssemblyStl(true)}><ToolIcon name="save" size={16} />{msg('file.exportAsmStlUnion', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={() => void exportGLB()}><ToolIcon name="save" size={16} />{msg('file.exportGlb', lang)}</button>
                <div className="panel-menu-divider" />
                <button type="button" role="menuitem" className="panel-menu-item" title="导出当前 3D 视图为 PNG 截图（贴文档/邮件）" onClick={() => useApp.getState().runCommand('viewpng', '视图截图')}><ToolIcon name="save" size={16} />{msg('file.exportViewPng', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={() => void generateDrawing()}><ToolIcon name="drawing" size={16} />{msg('file.drawing', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" title="裝配三視圖 + 氣泡編號 + BOM 表（組件網格投影：輪廓+特徵邊）" onClick={() => void useApp.getState().generateAsmDrawing()}><ToolIcon name="drawing" size={16} />{msg('file.asmDrawing', lang)}</button>
                <button type="button" role="menuitem" className="panel-menu-item" onClick={async () => { if (await useApp.getState().appConfirm('清空全部？当前模型（特征 + 组件）会清除——未保存的话请先「保存」。')) void reset() }}><ToolIcon name="trash" size={16} />{msg('file.clear', lang)}</button>
              </div>
            </>, document.body
          )}
        </div>
        <button className="tb-btn" title="保存项目 (JSON)" onClick={() => saveProject()}><ToolIcon name="save" size={18} /></button>
        <button className="tb-btn" title="撤销 (Ctrl+Z)" onClick={() => void undo()}><ToolIcon name="undo" size={18} /></button>
        <button className="tb-btn" title="重做 (Ctrl+Y)" onClick={() => void redo()}><ToolIcon name="redo" size={18} /></button>
        <div className="tb-spacer" />
        <div className="doc-tab" title="文档名（用于保存档名 / 工程图标题栏）— 点击改名">
          <span className="doc-cube" />
          <input className="doc-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder={msg('file.untitled', lang)} />
        </div>
        <div className="tb-spacer" />
        {/* GM-W2 2.1 对标 Fusion：草图模式下收起非情境嘅「模板/材料/螺丝/材质/纹理/颜色」库，只保留文件·保存·撤销·文档名·搜索·帮助·语言 */}
        {!inSketch && !inForm && (<>
        <button className="tb-btn tb-text" title="模板 / 材料 / 螺丝 库（收埋令顶栏干净似 Fusion；撳开拣）" onClick={() => setShowLib((v) => !v)}>📦 {showLib ? '▴' : '▾'}</button>
        {showLib && (<>
        <select className="tb-mat" title="选择起始模板" value={sampleKind} onChange={(e) => setSampleKind(e.target.value as SampleKind)}>
          {(() => {
            // Grouped template menu (was a flat 30+ list). Any kind not listed falls into 「其他」 so nothing is lost.
            const cats: [string, SampleKind[]][] = [
              ['基础件', ['plate', 'enclosure', 'flange', 'bracket', 'smbracket', 'washer', 'indexplate', 'angleiron', 'vent']],
              ['机械传动', ['gear', 'gearpair', 'gearring', 'rackpinion', 'planetary', 'coupling', 'keyshaft', 'parkey', 'spring', 'bearing', 'shaft']],
              ['紧固/标准件', ['hexnut', 'bolt', 'boltflange', 'standoff', 'bushing']],
              ['maker/电子', ['nema17', 'knob', 'heatsink', 'tslot']],
              ['曲面/管件', ['vase', 'elbow', 'bowl']],
            ]
            const seen = new Set<string>(cats.flatMap((c) => c[1]))
            const other = (Object.keys(SAMPLE_LABELS) as SampleKind[]).filter((k) => !seen.has(k))
            const groups = other.length ? [...cats, ['其他', other] as [string, SampleKind[]]] : cats
            const OPTG_EN: Record<string, string> = { '基础件': 'Basic Parts', '机械传动': 'Transmission', '紧固/标准件': 'Fasteners / Standard', 'maker/电子': 'Maker / Electronics', '曲面/管件': 'Surface / Tubing', '其他': 'Other' }
            return groups.map(([label, kinds]) => (
              <optgroup key={label} label={en ? (OPTG_EN[label] ?? label) : label}>
                {kinds.filter((k) => SAMPLE_LABELS[k]).map((k) => <option key={k} value={k}>{SAMPLE_LABELS[k]}</option>)}
              </optgroup>
            ))
          })()}
        </select>
        <button className="tb-btn tb-text" title="载入选中的起始模板（载入后改 ƒx 参数即整模型联动）—— 新手可先玩这个" onClick={async () => {
          // GM-W2 2.1 防数据丢失：有现存工作（特征/组件）先弹确认，避免 载入 静静清空未保存嘅项目
          if (useApp.getState().features.length > 0 || useApp.getState().components.length > 0) {
            const ok = await useApp.getState().appConfirm('载入模板会清空当前项目（包括未保存嘅工作）— 确定载入？')
            if (!ok) return
          }
          void loadSample(sampleKind)
        }}>
          <ToolIcon name="component" size={15} /> {en ? 'Load' : '载入'}
        </button>
        <FastenerPicker />
        <select className="tb-mat" title="材质预设" defaultValue="" onChange={(e) => { if (e.target.value) setMaterialPreset(e.target.value) }}>
          <option value="">{en ? 'Material…' : '材质…'}</option>
          {Object.keys(MATERIALS).map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        </>)}
        <MaterialSwatchPicker />{/* 材质球视觉拣料（Flux 生成 studio render 球）*/}
        <select className="tb-mat" title="纹理" value={material.tex || ''} onChange={(e) => setBodyTexture(e.target.value)}>
          {Object.entries(TEXTURE_KEYS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {/* Keep a visible label beside the native colour well.  A bare 28px input
            looked like a non-interactive decoration and was especially easy to
            miss on the light CAD chrome.  onInput gives immediate feedback while
            dragging in browsers that delay change until the picker closes. */}
        <label className="tb-color-control" title="外观颜色：点击色块选择颜色，立即套用到当前实体">
          <span>{en ? 'Color' : '颜色'}</span>
          <input className="tb-color" type="color" aria-label={en ? 'Body colour' : '实体颜色'} value={bodyColor}
            onInput={(e) => setBodyColor(e.currentTarget.value)}
            onChange={(e) => setBodyColor(e.target.value)} />
        </label>
        </>)}{/* GM-W2 2.1 草图库隐藏结束 */}
        <button className="tb-btn" title="搜索命令（按 / 键）—— 打字搵任何工具，例如 齿轮 / 倒角 / 导出" onClick={() => setCmdPalette(true)}>🔍</button>
        <button className="tb-btn" title="帮助 / 快捷键 (F1)" onClick={() => toggleHelp()} style={{ fontWeight: 700, color: '#2a7aa8' }}>?</button>
        <div className="tb-user">U</div>
      </div>

      {/* ribbon — Fusion layout: big workspace selector on the left, tabs row + quick-icon groups on the right.
          Entering a sketch APPENDS an active contextual 草图 tab (Fusion SKETCH/FORM pattern) whose panels are
          the sketch tools, with a green ✓完成草图 pinned at the far right. */}
      <div className={"ribbon" + (compactTools ? " compact-tools" : " labelled-tools")} style={{ display: 'flex', alignItems: 'stretch' }}>
        <WorkspaceSelector />
        <div className="ribbon-main">
          <div className="ribbon-tabs">
            {!inSketch && !inForm && WORKSPACE_TABS.map((tab) => (
              <div
                key={tab}
                className={'ribbon-tab' + (!inSketch && !inForm && tab === activeTab ? ' active' : '')}
                aria-disabled={!!commandActive || sketchDragging}
                style={commandActive ? { opacity: 0.45, pointerEvents: 'none' } : undefined}
                title="单击切换 · 双击收起/展开工具行（腾画面空间，对标 Fusion）"
                onClick={() => { setActiveTab(tab); if (ribbonCollapsed) setRibbonCollapsed(false) }}
                onDoubleClick={() => setRibbonCollapsed((c) => !c)}
              >
                {tTab(tab, lang)}
              </div>
            ))}
            {inSketch && <div className="ribbon-tab ctx active">{msg('tab.SKETCH', lang)}</div>}
            {inForm && <div className="ribbon-tab ctx active" data-testid="form-workspace-tab">{msg('tab.FORM', lang)}</div>}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingRight: 6 }} title={msg('ui.lang', lang)}>
              {<button className="ribbon-tab" title={ribbonCollapsed ? '展开工具行' : '收起工具行（净留标签，腾画面）'} onClick={() => setRibbonCollapsed((c) => !c)} style={{ fontSize: 12, opacity: 0.7 }}>{ribbonCollapsed ? '▾' : '▴'}</button>}
              <button className="ribbon-tab" aria-pressed={!compactTools} title={msg('ui.showToolNames', lang)} onClick={() => setCompactTools(v => !v)}>{compactTools ? 'Aa' : '▦'}</button>
              {inSketch && <button className="ribbon-tab context-finish" disabled={!!commandActive || sketchDragging} onMouseDown={e => e.preventDefault()} onClick={() => finishSketch()}>{'✓ ' + msg('ui.finishSketch', lang)}</button>}
              <span role="group" aria-label={msg('ui.lang', lang)} data-testid="lang-switcher" style={{ display: 'inline-flex', gap: 2 }}>
                {([
                  ['zh-HK', 'ui.lang.zhHK', '繁'],
                  ['zh-CN', 'ui.lang.zhCN', '簡'],
                  ['en', 'ui.lang.en', 'EN'],
                  ['ja', 'ui.lang.ja', '日本語'],
                ] as const).map(([code, tipKey, short]) => {
                  const active = normalizeLang(lang) === code
                  return (
                    <button
                      key={code}
                      type="button"
                      className="ribbon-tab"
                      data-testid={`lang-${code}`}
                      aria-pressed={active}
                      title={msg(tipKey, lang)}
                      style={{ fontWeight: active ? 700 : 400, opacity: active ? 1 : 0.5, minWidth: 22, padding: '0 4px' }}
                      onClick={() => useApp.getState().setLang(code as Lang)}
                    >{short}</button>
                  )
                })}
              </span>
            </div>
          </div>

          {!ribbonCollapsed && (
            <div className="ribbon-panels-row" style={{ display: 'flex', alignItems: 'stretch', minWidth: 0 }}>
              <div className="ribbon-panels" style={{ flex: '1 1 auto', minWidth: 0 }}>
                {(inSketch ? SKETCH_PANELS : inForm ? FORM_PANELS : ws.panels).map((p) => {
                  // Fusion strip: only the marked quick tools render inline; everything stays in the ▾ dropdown.
                  const quicks = p.tools.some((t) => t.quick) ? p.tools.filter((t) => t.quick) : p.tools.slice(0, 5)
                  return (
                    <div className="panel" key={p.name}>
                      <div style={{ display: 'flex', flex: 1 }}>
                        <div className="panel-tools">
                          {quicks.map((t) => <ToolButton key={t.id} t={t} onRun={t.id === 'insertfastener' ? () => setShowFastenerDialog(true) : undefined} />)}
                        </div>
                        <div className="panel-divider" />
                      </div>
                      <PanelFlyout name={p.name} tools={p.tools} onCommand={(t) => { if (t.id !== 'insertfastener') return false; setShowFastenerDialog(true); return true }} />
                    </div>
                  )
                })}
              </div>
              {inSketch && (
                <button data-cmd="finishsketch" data-testid="finish-sketch-pin" disabled={!!commandActive || sketchDragging} className="finish-sketch finish-pinned" title={lang === 'en' ? 'Finish the sketch and return to the modeling environment (Fusion: FINISH SKETCH)' : '完成草圖，返回實體環境（Fusion: FINISH SKETCH）'} onMouseDown={e => e.preventDefault()} onClick={() => finishSketch()}>{/* GM-W6 E：教学指针锚点 */}
                  <span className="finish-check">✓</span>
                  <span>{msg('ui.finishSketch', lang)}</span>
                </button>
              )}
              {inForm && (
                <button data-cmd="finishform" data-testid="finish-form-pin" className="finish-sketch finish-pinned" title={lang === 'en' ? 'Finish Form and return to SOLID' : '完成造型，返回實體環境'} onClick={() => void finishForm()}>
                  <span className="finish-check">✓</span>
                  <span>{msg('ui.finishForm', lang)}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <NarrowHint />
      {showFastenerDialog && <FastenerDialog onClose={() => setShowFastenerDialog(false)} />}
    </div>
  )
}
