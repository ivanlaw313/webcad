import { useState, useEffect, useRef } from 'react'
import { useApp } from '../store'
import { tStatus } from '../i18n'
import { paramsPanelText, type Tz } from './paramsPanelText'
import { useDraggable } from './useDraggable'
import { parameterUsage } from '../cad/parameterUsage'

// Parse a design-table value list: "3,4,5,6" (comma/space) OR "3:1:6" range (start:step:stop). Dedupes.
function parseVals(s: string): number[] {
  const t = s.trim()
  if (/^-?[\d.]+\s*:\s*-?[\d.]+\s*:\s*-?[\d.]+$/.test(t)) {
    const [a, step0, b] = t.split(':').map(Number), out: number[] = []
    let step = step0
    if (step && Number.isFinite(a) && Number.isFinite(b)) {
      // GM-W8 β1-#82：方向/步长符号不符（如 6:1:3 起>止但步长为正）→ 自动取反步长（否则循环一次都唔行,静静返空）。
      if ((b < a && step > 0) || (b > a && step < 0)) step = -step
      if (step > 0) for (let v = a; v <= b + 1e-9; v += step) out.push(+v.toFixed(4))
      else for (let v = a; v >= b - 1e-9; v += step) out.push(+v.toFixed(4))
    }
    return [...new Set(out)]
  }
  return [...new Set(t.split(/[,，\s]+/).map(Number).filter((n) => Number.isFinite(n)))]
}

// Commit complete numeric drafts, so normal typing does not rebuild at each digit.
// RETEST19 #2：打字期間（focused）外部值變化唔覆蓋草稿；busy 用 readOnly（disabled 會令 Chrome 失焦，後續按鍵漏去全域快捷鍵）。
function ParameterValue({name,value,disabled,busy,tz,onCommit}:{name:string;value:number;disabled:boolean;busy:boolean;tz:Tz;onCommit:(n:number)=>void}) {
 const fmt=(v:number)=>String(Number(v.toFixed(6)))
 const [draft,setDraft]=useState(fmt(value))
 const editing=useRef(false)
 useEffect(()=>{if(!editing.current)setDraft(fmt(value))},[value])
 const commit=()=>{editing.current=false;if(busy){setDraft(fmt(value));return}const n=Number(draft);if(draft.trim()&&Number.isFinite(n)&&n!==value)onCommit(n);else setDraft(fmt(value))}
 return <input className="pp-val" type="number" aria-label={tz(`參數 ${name} 數值`)} data-param-field="value" disabled={disabled} readOnly={busy} value={draft} onFocus={()=>{editing.current=true}} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.blur()}if(e.key==='Escape'){e.stopPropagation();setDraft(fmt(value))}}}/>
}

// RETEST19 #2：名稱欄用本地草稿 —— 打字只改草稿，Enter／失焦先 renameParam（一次），Esc 還原。
// 行 key 用穩定 id（唔係名），改名唔會令輸入框 remount 失焦。
function ParameterName({ name, busy, tz, onCommit }: { name: string; busy: boolean; tz: Tz; onCommit: (next: string) => void }) {
  const [draft, setDraft] = useState(name)
  const editing = useRef(false)
  const cancelled = useRef(false)
  useEffect(() => { if (!editing.current) setDraft(name) }, [name])
  const commit = () => {
    editing.current = false
    if (cancelled.current) { cancelled.current = false; setDraft(name); return }
    const next = draft.trim()
    if (next && next !== name && !busy) onCommit(next)
    // 失敗（重名／非法）→ store 出狀態；草稿跟返真名
    setDraft(useApp.getState().params.some((p) => p.name === next) ? next : name)
  }
  return <input className="pp-name" aria-label={tz(`參數 ${name} 名稱`)} data-param-name={name} data-param-field="name" readOnly={busy} value={draft}
    onFocus={() => { editing.current = true }}
    onChange={(e) => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={(e) => {
      if (e.nativeEvent.isComposing) return
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
      if (e.key === 'Escape') { e.stopPropagation(); cancelled.current = true; setDraft(name); e.currentTarget.blur() }
    }}
    title={tz('改名保留參數身份；公式引用跟 ID')} style={{ width: 72 }} />
}

// A rejected edit must show the formula that still drives the model.
function ParameterExpression({ name, expression, disabled, tz, onCommit }: {
  name: string
  expression: string
  disabled: boolean
  tz: Tz
  onCommit: (expression: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(expression)
  const [pending, setPending] = useState(false)
  const editing = useRef(false)
  useEffect(() => { if (!editing.current) setDraft(expression) }, [expression])
  const commit = async () => {
    editing.current = false
    if (disabled) { setDraft(expression); return }
    if (pending || draft === expression) return
    setPending(true)
    try {
      await onCommit(draft)
    } finally {
      setDraft(useApp.getState().params.find(p => p.name === name)?.expr ?? '')
      setPending(false)
    }
  }
  return <input className="pp-expr" readOnly={disabled || pending} data-param-field="expr"
    aria-label={tz(`參數 ${name} 表達式`)} placeholder={tz('=表達式')} value={draft}
    title={tz('如 d1*2、寬度+10、sqrt(d1*d1+d2*d2)、sin(30)、pi*r*r、max(壁厚,2)（三角函數用角度；常量 pi·e·tau；單參數 sqrt·sin·cos·tan·asin·acos·atan·round·floor·ceil·abs·sign·ln·log·log2·exp；雙參數 min·max·pow·hypot·mod·atan2）')}
    onFocus={() => { editing.current = true }}
    onChange={e => setDraft(e.target.value)} onBlur={() => void commit()}
    onKeyDown={e => {
      if (e.nativeEvent.isComposing) return
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
      if (e.key === 'Escape') { e.stopPropagation(); setDraft(expression); editing.current = false }
    }} />
}

// User-parameter table: named variables that feature dimensions can bind to.
// Edit a value here → every bound feature dimension updates and the model rebuilds.
export default function ParamsPanel() {
  const lang = useApp((s) => s.lang)
  const tz = paramsPanelText(lang)
  const busy = useApp(s => s.busy)
  const open = useApp((s) => s.paramsOpen)
  const params = useApp((s) => s.params)
  const bindings = useApp((s) => s.paramBindings)
  const sources = useApp(s => s.sketchSources)
  const features = useApp(s => s.features)
  const live = useApp(s => s.skCons)
  const mode = useApp(s => s.mode)
  const addParam = useApp((s) => s.addParam)
  const setParam = useApp((s) => s.setParam)
  const setParamExpr = useApp((s) => s.setParamExpr)
  const removeParam = useApp((s) => s.removeParam)
  const renameParam = useApp((s) => s.renameParam)
  const exportCsv = useApp((s) => s.exportParamsCsv)
  const batchExportDesignTable = useApp((s) => s.batchExportDesignTable)
  const toggle = useApp((s) => s.toggleParamsPanel)
  const configs = useApp((s) => s.configs)
  const activeConfig = useApp((s) => s.activeConfig)
  const saveConfig = useApp((s) => s.saveConfig)
  const applyConfig = useApp((s) => s.applyConfig)
  const deleteConfig = useApp((s) => s.deleteConfig)
  const [cfgName, setCfgName] = useState('')
  const [name, setName] = useState('')
  const [val, setVal] = useState(50)
  const [dtParam, setDtParam] = useState('')
  const [dtVals, setDtVals] = useState('')
  const [collapsed, setCollapsed] = useState(false)
  const panelDrag = useDraggable('webcad-parameters', { left: 14, top: 128 })
  // 「+添加」留空名 → 自动 d# ；建立后即聚焦+全选新行名称栏，直接打字改名（免再搵个格；名稱欄係本地草稿，Enter／失焦先改名）。
  const [focusName, setFocusName] = useState<string | null>(null)
  useEffect(() => {
    if (!focusName || !params.some((p) => p.name === focusName)) return
    const el = document.querySelector<HTMLInputElement>(`.params-panel input.pp-name[data-param-name="${CSS.escape(focusName)}"]`)
    if (el) { el.focus(); el.select() }
    setFocusName(null)
  }, [focusName, params])
  const add = () => { const auto = !name.trim(); const nm = auto ? `d${params.length + 1}` : ''; addParam(name, val); if (!auto && !useApp.getState().params.some((p) => p.name === name.trim())) return; setName(''); if (auto) setFocusName(nm) }
  if (!open) return null
  if (collapsed) return <button ref={panelDrag.ref} className={'params-pill' + (panelDrag.isDragged ? ' vp-hud-dragged' : '')} type="button" style={panelDrag.style} onPointerDown={panelDrag.onPointerDown} title={tz('展開用戶參數面板')} onClick={() => { if (panelDrag.consumeClick()) return; setCollapsed(false) }}>ƒx {tz('參數')} ▸</button>
  const usedBy = parameterUsage(params, sources, bindings, features, mode === 'sketch' ? live : [])
  return (
    <div ref={panelDrag.ref} className={'params-panel' + (panelDrag.isDragged ? ' vp-hud-dragged' : '')} style={panelDrag.style}>
      <div className="pp-title" onPointerDown={panelDrag.onPointerDown} style={{ cursor: 'grab', userSelect: 'none' }}><span className="vp-hud-handle" title={tz('拖動參數面板')}>⋮⋮</span>{tStatus('用戶參數', lang)} <span className="pp-x" title={tz('收合面板')} onClick={() => setCollapsed(true)}>▾</span><span className="pp-x" onClick={() => toggle()}>✕</span></div>
      <div className="pp-hint">{tz('名稱 · 數值 · 表達式（長度單位 mm）')}</div>
      {params.length === 0 && <div className="pp-empty">{tz('還沒有參數。下面添加一個（如 d1 = 50）。')}</div>}
      {params.length > 0 && <div className="pp-head"><span>{tz('名稱')}</span><span>{tz('數值')}</span><span>{tz('表達式')}</span><span>{tz('引用')}</span></div>}
      {params.map((p) => (
        <div key={p.id ?? p.name} className="pp-row">
          <ParameterName name={p.name} busy={busy} tz={tz} onCommit={(next) => renameParam(p.name, next)} />
          <ParameterValue name={p.name} value={p.value} disabled={!!p.expr} busy={busy} tz={tz} onCommit={n => void setParam(p.name,n)} />
          <ParameterExpression name={p.name} expression={p.expr ?? ''} disabled={busy} tz={tz} onCommit={expr => setParamExpr(p.name, expr)} />
          <span className="pp-used" title={tz('直接／間接引用：') + (usedBy(p).join('；') || tz('無'))}>×{usedBy(p).length}</span>
          <span className="pp-del" title={tz('刪除參數')} onClick={() => void removeParam(p.name)}>🗑</span>
        </div>
      ))}
      <div className="pp-add">
        <input className="pp-name-in" aria-label={tz('參數名稱')} placeholder={tz('名稱 d1')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); add() } }} />
        <input className="pp-val" aria-label={tz('參數數值')} type="number" value={val} onChange={(e) => setVal(Number(e.target.value))} />
        <button className="cs-btn" onClick={add}>{tz('+ 添加')}</button>
      </div>
      <details><summary>{tz('進階：配置、設計表及導出')}</summary>
      {params.length > 0 && <div className="pp-add" style={{ justifyContent: 'flex-end' }}><button className="cs-btn" title={tz('把參數表導出為 CSV（名稱/值/表達式，方便文檔/分享/Excel）')} onClick={() => exportCsv()}>{tz('📋 導出參數 CSV')}</button></div>}
      {params.length > 0 && (
        <div className="pp-add" style={{ flexWrap: 'wrap', gap: 4, borderTop: '1px solid #2a2e33', paddingTop: 6, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#888', width: '100%' }}>{tz('🗂 設計表：改一個參數掃多個值 → 一次導出 N 個 STL（zip）')}</span>
          <select value={dtParam || params[0].name} onChange={(e) => setDtParam(e.target.value)} title={tz('要掃描的參數')} style={{ maxWidth: 110 }}>
            {params.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <input className="pp-name-in" placeholder={tz('如 3,4,5,6 或 3:1:6')} value={dtVals} onChange={(e) => setDtVals(e.target.value)} style={{ flex: 1, minWidth: 90 }} title={tz('逗號分隔多個值，或 起:步:止 範圍（最多 24 個）')} />
          <button className="cs-btn" title={tz('對每個值重建並導出 STL，打包成 zip（最多 24 個；完成後還原原值）')} onClick={() => { const vs = parseVals(dtVals); if (!vs.length) return; void batchExportDesignTable(dtParam || params[0].name, vs) }}>{tz('🗂 導出變體')}</button>
        </div>
      )}
      {params.length > 0 && (
        <div className="pp-add" style={{ flexWrap: 'wrap', gap: 4, borderTop: '1px solid #2a2e33', paddingTop: 6, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#888', width: '100%' }}>{tz('⚙ 配置：保存當前驅動參數為命名規格，一鍵切換（如 M3/M5/M8 版）')}</span>
          {configs.map((c) => (
            <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: '1px solid ' + (activeConfig === c.name ? '#1572c4' : '#2a2e33'), borderRadius: 4, padding: '1px 4px' }}>
              <button className="cs-btn" title={tz('應用配置「') + c.name + '」：' + Object.entries(c.values).map(([k, v]) => k + '=' + v).join(', ')} style={activeConfig === c.name ? { background: '#1572c4', color: '#fff' } : undefined} onClick={() => void applyConfig(c.name)}>{c.name}</button>
              <span className="pp-del" title={tz('刪除此配置')} onClick={() => deleteConfig(c.name)}>🗑</span>
            </span>
          ))}
          <input className="pp-name-in" placeholder={tz('配置名 如 M5版')} value={cfgName} onChange={(e) => setCfgName(e.target.value)} style={{ flex: 1, minWidth: 80 }} />
          <button className="cs-btn" title={tz('把當前所有驅動參數（非表達式）存為一個命名配置')} onClick={() => { saveConfig(cfgName); setCfgName('') }}>{tz('💾 存配置')}</button>
          {configs.length > 0 && <button className="cs-btn" title={tz('把每個配置各導出一個 STL，打包成 zip（一次過製造所有變體；完成後還原當前配置）')} onClick={() => void useApp.getState().exportAllConfigs()}>{tz('📦 導出全部配置')}</button>}
          <button className="cs-btn" title={tz('設計表 CSV 導出：配置 × 驅動參數矩陣（無配置時出一行當前值模板）— Excel 排變體')} onClick={() => useApp.getState().exportConfigsCsv()}>{tz('📤 設計表CSV')}</button>
          <button className="cs-btn" title={tz('設計表 CSV 導入：每行一個配置（列名 = ƒx 參數名）→ 批量新增/更新配置，再一鍵切換或「導出全部配置」出晒所有變體 STL')} onClick={() => useApp.getState().openConfigsCsvDialog()}>{tz('📥 導入設計表')}</button>
        </div>
      )}
      {/* GM-3DV3 M15：Change Parameters 设计表格视图（行=配置 × 列=参数）— 对标 Fusion/SolidWorks 设计表。点行 = 应用该配置。 */}
      {params.length > 0 && configs.length > 0 && (
        <div style={{ borderTop: '1px solid #2a2e33', paddingTop: 6, marginTop: 4 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{tz('📐 設計表（配置 × 參數）— 點配置名一鍵切換；空格 = 該配置未含此參數')}</div>
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table className="dt-grid" style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: 'max-content' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '2px 6px', borderBottom: '1px solid #2a2e33', color: '#8a97a2', position: 'sticky', left: 0 }}>{tz('配置＼參數')}</th>
                  {params.map((p) => <th key={p.name} style={{ textAlign: 'right', padding: '2px 6px', borderBottom: '1px solid #2a2e33', color: '#8a97a2', whiteSpace: 'nowrap' }}>{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.name} style={activeConfig === c.name ? { background: '#12324e' } : undefined}>
                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                      <button className="cs-btn" title={tz('應用配置「') + c.name + '」'} style={{ padding: '0 6px', ...(activeConfig === c.name ? { background: '#1572c4', color: '#fff' } : {}) }} onClick={() => void applyConfig(c.name)}>{c.name}</button>
                    </td>
                    {params.map((p) => (
                      <td key={p.name} style={{ textAlign: 'right', padding: '2px 6px', color: c.values[p.name] != null ? '#cfd6dc' : '#4a545c', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {c.values[p.name] != null ? Number(c.values[p.name].toFixed(3)) : '·'}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* 当前活动值行（对照）：读现值，方便同各配置比对 */}
                <tr style={{ borderTop: '1px dashed #2a2e33' }}>
                  <td style={{ padding: '2px 6px', color: '#8a97a2', whiteSpace: 'nowrap' }}>{tz('（當前值）')}</td>
                  {params.map((p) => <td key={p.name} style={{ textAlign: 'right', padding: '2px 6px', color: '#8a97a2', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{Number(p.value.toFixed(3))}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
      </details>
    </div>
  )
}
