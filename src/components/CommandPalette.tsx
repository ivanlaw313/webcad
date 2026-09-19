import { commandContextKey, commandDisabledReason } from '../cad/commandAvailability'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp, SAMPLE_LABELS, type SampleKind } from '../store'
import { WORKSPACES, SKETCH_PANELS, FORM_PANELS, type Tool } from '../ribbon'
import { msg, tLabel, CATALOGS, normalizeLang, type Lang } from '../i18n'

// A searchable command. Ribbon tools dispatch through runCommand(id); templates and
// global file/edit/view actions carry their own `run` closure instead.
type Cmd = Partial<Tool> & { id: string; label: string; from: string; labelKey?: string; fromKey?: string; run?: () => void }

// Synonym / alias keywords live in i18n catalogs as alias.<id> (v1.80).

/** Catalog tip for a command id when present; else ribbon/source tip. */
function resolveTip(id: string, lang: Lang, fallback?: string): string | undefined {
  const key = `tip.${id}`
  const L = normalizeLang(lang)
  return CATALOGS[L][key] ?? CATALOGS['zh-HK'][key] ?? fallback
}

/** Catalog alias keywords for a command id (alias.<id>); zh-HK fallback. */
function resolveAlias(id: string, lang: Lang): string | undefined {
  const key = `alias.${id}`
  const L = normalizeLang(lang)
  return CATALOGS[L][key] ?? CATALOGS['zh-HK'][key]
}

// Flattened, de-duplicated command list built once from every workspace ribbon.
// Keeps the richest entry (the one that carries a `tip`, usually from the SOLID tab)
// and records the first "WORKSPACE · PANEL" it appears in as a subtle source tag.
function buildCommands(): Cmd[] {
  const byId = new Map<string, Cmd>()
  const addTool = (t: Tool, from: string) => {
    const existing = byId.get(t.id)
    if (!existing) byId.set(t.id, { ...t, from })
    else if (!existing.tip && t.tip) byId.set(t.id, { ...existing, ...t, from: existing.from })
    // Submenu entries are executable commands. Index them recursively so
    // Simplify → Replace with Primitive is reachable from command search.
    for (const child of t.children || []) addTool(child, from)
  }
  for (const wsName of Object.keys(WORKSPACES)) {
    const ws = WORKSPACES[wsName]
    for (const panel of ws.panels) {
      for (const t of panel.tools) {
        const existing = byId.get(t.id)
        if (!existing) {
          byId.set(t.id, { ...t, from: `${wsName} · ${panel.name}` })
        } else if (!existing.tip && t.tip) {
          // upgrade to the richer (tipped) variant but keep the original source tag
          byId.set(t.id, { ...existing, ...t, from: existing.from })
        }
        addTool(t, `${wsName} · ${panel.name}`)
      }
    }
  }
  // GM-FP4 #50：情境「草图」tab 嘅工具（sk_*）本喺 WORKSPACES 之外（隐形）→ 命令面板搵唔到。
  // 一并收入，令 S 面板喺草图内可搜/执行草图命令（Fusion「Sketch Shortcuts」面板）。sk_* 带 SKETCH · 面板 标签。
  for (const panel of SKETCH_PANELS) {
    for (const t of panel.tools) {
      if (byId.has(t.id)) continue   // 唔覆盖已存在（例如 sectionprops 同名）
      byId.set(t.id, { ...t, from: `SKETCH · ${panel.name}` })
    }
  }
  // FORM contextual tools (Subdivide/Crease/...) — searchable like meshfit discovery.
  for (const panel of FORM_PANELS) {
    for (const t of panel.tools) {
      if (byId.has(t.id)) continue
      byId.set(t.id, { ...t, from: `FORM · ${panel.name}` })
    }
  }
  // 'select' is not a real command worth surfacing in search
  const ribbon = [...byId.values()].filter((c) => c.id !== 'select')

  // Start templates — typing e.g. 「齿轮组」/「螺栓」 finds and loads them.
  const g0 = useApp.getState()
  const templates: Cmd[] = (Object.keys(SAMPLE_LABELS) as SampleKind[]).map((k) => ({
    id: `sample:${k}`,
    label: `${msg('cmd.templatePrefix', g0.lang)}${msg('sample.' + k, g0.lang)}`,
    labelKey: undefined,
    from: msg('cmd.fromTemplate', g0.lang),
    fromKey: 'cmd.fromTemplate',
    tip: msg('cmd.templateTip', g0.lang),
    run: () => void useApp.getState().loadSample(k),
  }))

  // Global file / edit / view commands that live on the toolbar (not in the ribbon).
  const g = () => useApp.getState()
  const extras: Cmd[] = [
    { id: 'act:save', label: msg('cmd.actSave', g().lang), labelKey: 'cmd.actSave', from: msg('cmd.fromFile', g().lang), fromKey: 'cmd.fromFile', run: () => g().saveProject() },
    { id: 'act:open', label: msg('cmd.actOpen', g().lang), labelKey: 'cmd.actOpen', from: msg('cmd.fromFile', g().lang), fromKey: 'cmd.fromFile', run: () => g().openProject() },
    { id: 'act:new', label: msg('file.new', g().lang), labelKey: 'file.new', from: msg('file.menu', g().lang), fromKey: 'file.menu', tip: msg('file.newConfirm', g().lang), run: async () => { if (await g().appConfirm(msg('file.newConfirm', g().lang))) void g().reset() } },
    { id: 'act:undo', label: msg('cmd.actUndo', g().lang), labelKey: 'cmd.actUndo', from: msg('cmd.fromEdit', g().lang), fromKey: 'cmd.fromEdit', shortcut: 'Ctrl+Z', run: () => void g().undo() },
    { id: 'act:redo', label: msg('cmd.actRedo', g().lang), labelKey: 'cmd.actRedo', from: msg('cmd.fromEdit', g().lang), fromKey: 'cmd.fromEdit', shortcut: 'Ctrl+Y', run: () => void g().redo() },
    { id: 'act:fit', label: msg('cmd.actFit', g().lang), labelKey: 'cmd.actFit', from: msg('cmd.fromView', g().lang), fromKey: 'cmd.fromView', run: () => g().requestFit() },
    { id: 'act:params', label: msg('cmd.actParams', g().lang), labelKey: 'cmd.actParams', from: msg('cmd.fromManage', g().lang), fromKey: 'cmd.fromManage', run: () => g().toggleParamsPanel() },
    { id: 'act:help', label: msg('cmd.actHelp', g().lang), labelKey: 'cmd.actHelp', from: msg('cmd.fromHelp', g().lang), fromKey: 'cmd.fromHelp', shortcut: 'F1', run: () => g().toggleHelp() },
  ]
  return [...ribbon, ...templates, ...extras]
}

export default function CommandPalette() {
  const open = useApp((s) => s.cmdPaletteOpen)
  const setOpen = useApp((s) => s.setCmdPalette)
  const run = useApp((s) => s.runCommand)
  const inSketch = useApp((s) => s.mode === 'sketch')   // GM-FP4 #50：草图内 → 草图命令排前 + placeholder 提示
  const lang = useApp((s) => s.lang)
  const contextKey = useApp(commandContextKey)
  const [showUnavailable, setShowUnavailable] = useState(false)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const all = useMemo(buildCommands, [lang])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    const available = showUnavailable ? all : all.filter(c => !commandDisabledReason(useApp.getState(), c.id))
    const base = !s ? available : available.filter((c) => {
      const label = (c.labelKey ? msg(c.labelKey, lang) : tLabel(c.label, lang)).toLowerCase()
      const tip = (resolveTip(c.id, lang, c.tip) || '').toLowerCase()
      const alias = (resolveAlias(c.id, lang) || '').toLowerCase()
      const from = (c.fromKey ? msg(c.fromKey, lang) : c.from).toLowerCase()
      return label.includes(s) ||
        c.label.toLowerCase().includes(s) ||
        c.id.toLowerCase().includes(s) ||
        tip.includes(s) ||
        alias.includes(s) ||
        from.includes(s)
    })
    // GM-FP4 #50：草图模式 → 草图工具（sk_*）稳定排到最前（Fusion「Sketch Shortcuts」优先草图命令）。
    if (!inSketch) return base
    const isSk = (id: string) => id.startsWith('sk_')
    return [...base].sort((a, b) => (isSk(a.id) === isSk(b.id) ? 0 : isSk(a.id) ? -1 : 1))
  }, [q, all, inSketch, contextKey, showUnavailable, lang])

  // Reset query + selection each time the palette opens; focus the input.
  useEffect(() => {
    if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 0) }
  }, [open])

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-i="${sel}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  if (!open) return null

  const choose = (c: Cmd) => { if (commandDisabledReason(useApp.getState(), c.id)) return; setOpen(false); if (c.run) c.run(); else run(c.id, c.label) }
  const onKey = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) choose(results[sel]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div
      onClick={() => setOpen(false)}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(20,24,28,.32)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', paddingTop: '12vh' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, 92vw)', background: '#fff', border: '1px solid #b6c0c9', borderRadius: 10, boxShadow: '0 18px 60px rgba(0,0,0,.34)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #e3e8ec' }}>
          <span style={{ fontSize: 16, opacity: .55 }}>🔍</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0) }}
            onKeyDown={onKey}
            aria-label={msg('cmd.ariaSearch', lang)}
            placeholder={inSketch ? msg('cmd.searchPlaceholderSketch', lang) : msg('cmd.searchPlaceholder', lang)}
            style={{ flex: 1, border: 'none', outline: 'none', fontSize: 15, background: 'transparent' }}
          />
          <span style={{ fontSize: 11, color: '#9aa6b0' }}>{msg('cmd.hint', lang)}</span>
        </div>
        <label style={{ padding: '6px 14px', fontSize: 12, color: '#556575' }}><input type="checkbox" checked={showUnavailable} onChange={e => { setShowUnavailable(e.target.checked); setSel(0) }} /> {msg('cmd.showUnavailable', lang)}</label>
        <div ref={listRef} style={{ overflowY: 'auto' }}>
          {results.length === 0 && (
            <div style={{ padding: '18px 16px', color: '#8a96a0', fontSize: 13 }}>{(showUnavailable ? msg('cmd.emptyAll', lang) : msg('cmd.empty', lang)).replace('{0}', q)}</div>
          )}
          {results.map((c, i) => {
            const tip = resolveTip(c.id, lang, c.tip)
            const label = c.labelKey ? msg(c.labelKey, lang) : tLabel(c.label, lang)
            const from = c.fromKey ? msg(c.fromKey, lang) : c.from
            return (
            <div
              key={c.id}
              data-i={i}
              role="option" aria-disabled={!!commandDisabledReason(useApp.getState(), c.id)}
              title={commandDisabledReason(useApp.getState(), c.id) ?? tip}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(c)}
              style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '8px 14px', opacity: commandDisabledReason(useApp.getState(), c.id) ? .48 : 1, cursor: commandDisabledReason(useApp.getState(), c.id) ? 'not-allowed' : 'pointer', background: i === sel ? '#eaf3fb' : 'transparent', borderLeft: i === sel ? '3px solid #2a7aa8' : '3px solid transparent' }}
            >
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1d2329', whiteSpace: 'nowrap' }}>{label}</span>
              {c.shortcut && <kbd style={{ fontSize: 10, color: '#6b7884', border: '1px solid #cfd8df', borderRadius: 4, padding: '0 4px' }}>{c.shortcut}</kbd>}
              {tip && <span style={{ fontSize: 12, color: '#7a8893', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tip}</span>}
              <span style={{ marginLeft: 'auto', fontSize: 10, color: '#aab4bd', whiteSpace: 'nowrap' }}>{from}</span>
            </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
