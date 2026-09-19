import { useState, useEffect } from 'react'
import { useApp } from '../store'
import { tStatus } from '../i18n'
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
function ParameterValue({name,value,disabled,onCommit}:{name:string;value:number;disabled:boolean;onCommit:(n:number)=>void}) {
 const [draft,setDraft]=useState(String(Number(value.toFixed(6))))
 useEffect(()=>setDraft(String(Number(value.toFixed(6)))),[value])
 const commit=()=>{const n=Number(draft);if(draft.trim()&&Number.isFinite(n)&&n!==value)onCommit(n);else setDraft(String(Number(value.toFixed(6))))}
 return <input className="pp-val" type="number" aria-label={`参数 ${name} 数值`} disabled={disabled} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.blur()}if(e.key==='Escape'){e.stopPropagation();setDraft(String(value))}}}/>
}

// A rejected edit must show the formula that still drives the model.
function ParameterExpression({ name, expression, disabled, onCommit }: {
  name: string
  expression: string
  disabled: boolean
  onCommit: (expression: string) => Promise<void>
}) {
  const [draft, setDraft] = useState(expression)
  const [pending, setPending] = useState(false)
  useEffect(() => setDraft(expression), [expression])
  const commit = async () => {
    if (pending || draft === expression) return
    setPending(true)
    try {
      await onCommit(draft)
    } finally {
      setDraft(useApp.getState().params.find(p => p.name === name)?.expr ?? '')
      setPending(false)
    }
  }
  return <input className="pp-expr" disabled={disabled || pending}
    aria-label={`参数 ${name} 表达式`} placeholder="=表达式" value={draft}
    title="如 d1*2、宽度+10、sqrt(d1*d1+d2*d2)、sin(30)、pi*r*r、max(壁厚,2)（三角函数用角度；常量 pi·e·tau；单参数 sqrt·sin·cos·tan·asin·acos·atan·round·floor·ceil·abs·sign·ln·log·log2·exp；双参数 min·max·pow·hypot·mod·atan2）"
    onChange={e => setDraft(e.target.value)} onBlur={() => void commit()}
    onKeyDown={e => {
      if (e.nativeEvent.isComposing) return
      if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
      if (e.key === 'Escape') { e.stopPropagation(); setDraft(expression) }
    }} />
}

// User-parameter table: named variables that feature dimensions can bind to.
// Edit a value here → every bound feature dimension updates and the model rebuilds.
export default function ParamsPanel() {
  const lang = useApp((s) => s.lang)
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
  if (!open) return null
  if (collapsed) return <button ref={panelDrag.ref} className={'params-pill' + (panelDrag.isDragged ? ' vp-hud-dragged' : '')} type="button" style={panelDrag.style} onPointerDown={panelDrag.onPointerDown} title="展開用戶參數面板" onClick={() => { if (panelDrag.consumeClick()) return; setCollapsed(false) }}>ƒx 參數 ▸</button>
  const usedBy = parameterUsage(params, sources, bindings, features, mode === 'sketch' ? live : [])
  return (
    <div ref={panelDrag.ref} className={'params-panel' + (panelDrag.isDragged ? ' vp-hud-dragged' : '')} style={panelDrag.style}>
      <div className="pp-title" onPointerDown={panelDrag.onPointerDown} style={{ cursor: 'grab', userSelect: 'none' }}><span className="vp-hud-handle" title="拖動參數面板">⋮⋮</span>{tStatus('用戶參數', lang)} <span className="pp-x" title="收合面板" onClick={() => setCollapsed(true)}>▾</span><span className="pp-x" onClick={() => toggle()}>✕</span></div>
      <div className="pp-hint">名称 · 数值 · 表达式（长度单位 mm）</div>
      {params.length === 0 && <div className="pp-empty">还没有参数。下面添加一个（如 d1 = 50）。</div>}
      {params.length > 0 && <div className="pp-head"><span>名称</span><span>数值</span><span>表达式</span><span>引用</span></div>}
      {params.map((p) => (
        <div key={p.name} className="pp-row">
          <input className="pp-name" aria-label={`参数 ${p.name} 名称`} defaultValue={p.name} disabled={busy}
            onBlur={e => { const next = e.target.value.trim(); if (next && next !== p.name) renameParam(p.name, next); else e.target.value = p.name }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); (e.target as HTMLInputElement).blur() } if (e.key === 'Escape') { e.stopPropagation(); (e.target as HTMLInputElement).value = p.name; (e.target as HTMLInputElement).blur() } }}
            title="改名保留参数身份；公式引用跟 ID" style={{ width: 72 }} />
          <ParameterValue name={p.name} value={p.value} disabled={busy || !!p.expr} onCommit={n => void setParam(p.name,n)} />
          <ParameterExpression name={p.name} expression={p.expr ?? ''} disabled={busy} onCommit={expr => setParamExpr(p.name, expr)} />
          <span className="pp-used" title={`直接／间接引用：${usedBy(p).join("；") || "无"}`}>×{usedBy(p).length}</span>
          <span className="pp-del" title="删除参数" onClick={() => void removeParam(p.name)}>🗑</span>
        </div>
      ))}
      <div className="pp-add">
        <input className="pp-name-in" aria-label="参数名称" placeholder="名称 d1" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="pp-val" aria-label="参数数值" type="number" value={val} onChange={(e) => setVal(Number(e.target.value))} />
        <button className="cs-btn" onClick={() => { addParam(name, val); setName('') }}>+ 添加</button>
      </div>
      <details><summary>进阶：配置、设计表及导出</summary>
      {params.length > 0 && <div className="pp-add" style={{ justifyContent: 'flex-end' }}><button className="cs-btn" title="把参数表导出为 CSV（名称/值/表达式，方便文档/分享/Excel）" onClick={() => exportCsv()}>📋 导出参数 CSV</button></div>}
      {params.length > 0 && (
        <div className="pp-add" style={{ flexWrap: 'wrap', gap: 4, borderTop: '1px solid #2a2e33', paddingTop: 6, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#888', width: '100%' }}>🗂 设计表：改一个参数扫多个值 → 一次导出 N 个 STL（zip）</span>
          <select value={dtParam || params[0].name} onChange={(e) => setDtParam(e.target.value)} title="要扫描的参数" style={{ maxWidth: 110 }}>
            {params.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <input className="pp-name-in" placeholder="如 3,4,5,6 或 3:1:6" value={dtVals} onChange={(e) => setDtVals(e.target.value)} style={{ flex: 1, minWidth: 90 }} title="逗号分隔多个值，或 起:步:止 范围（最多 24 个）" />
          <button className="cs-btn" title="对每个值重建并导出 STL，打包成 zip（最多 24 个；完成后还原原值）" onClick={() => { const vs = parseVals(dtVals); if (!vs.length) return; void batchExportDesignTable(dtParam || params[0].name, vs) }}>🗂 导出变体</button>
        </div>
      )}
      {params.length > 0 && (
        <div className="pp-add" style={{ flexWrap: 'wrap', gap: 4, borderTop: '1px solid #2a2e33', paddingTop: 6, marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#888', width: '100%' }}>⚙ 配置：保存当前驱动参数为命名规格，一键切换（如 M3/M5/M8 版）</span>
          {configs.map((c) => (
            <span key={c.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, border: '1px solid ' + (activeConfig === c.name ? '#1572c4' : '#2a2e33'), borderRadius: 4, padding: '1px 4px' }}>
              <button className="cs-btn" title={`应用配置「${c.name}」：${Object.entries(c.values).map(([k, v]) => k + '=' + v).join(', ')}`} style={activeConfig === c.name ? { background: '#1572c4', color: '#fff' } : undefined} onClick={() => void applyConfig(c.name)}>{c.name}</button>
              <span className="pp-del" title="删除此配置" onClick={() => deleteConfig(c.name)}>🗑</span>
            </span>
          ))}
          <input className="pp-name-in" placeholder="配置名 如 M5版" value={cfgName} onChange={(e) => setCfgName(e.target.value)} style={{ flex: 1, minWidth: 80 }} />
          <button className="cs-btn" title="把当前所有驱动参数（非表达式）存为一个命名配置" onClick={() => { saveConfig(cfgName); setCfgName('') }}>💾 存配置</button>
          {configs.length > 0 && <button className="cs-btn" title="把每個配置各導出一個 STL，打包成 zip（一次过制造所有变体；完成后还原当前配置）" onClick={() => void useApp.getState().exportAllConfigs()}>📦 導出全部配置</button>}
          <button className="cs-btn" title="设计表 CSV 导出：配置 × 驱动参数矩阵（无配置时出一行当前值模板）— Excel 排变体" onClick={() => useApp.getState().exportConfigsCsv()}>📤 设计表CSV</button>
          <button className="cs-btn" title="设计表 CSV 导入：每行一个配置（列名 = ƒx 参数名）→ 批量新增/更新配置，再一键切换或「導出全部配置」出晒所有变体 STL" onClick={() => useApp.getState().openConfigsCsvDialog()}>📥 導入設計表</button>
        </div>
      )}
      {/* GM-3DV3 M15：Change Parameters 设计表格视图（行=配置 × 列=参数）— 对标 Fusion/SolidWorks 设计表。点行 = 应用该配置。 */}
      {params.length > 0 && configs.length > 0 && (
        <div style={{ borderTop: '1px solid #2a2e33', paddingTop: 6, marginTop: 4 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>📐 设计表（配置 × 参数）— 点配置名一键切换；空格 = 该配置未含此参数</div>
          <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
            <table className="dt-grid" style={{ borderCollapse: 'collapse', fontSize: 11, minWidth: 'max-content' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '2px 6px', borderBottom: '1px solid #2a2e33', color: '#8a97a2', position: 'sticky', left: 0 }}>配置＼参数</th>
                  {params.map((p) => <th key={p.name} style={{ textAlign: 'right', padding: '2px 6px', borderBottom: '1px solid #2a2e33', color: '#8a97a2', whiteSpace: 'nowrap' }}>{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {configs.map((c) => (
                  <tr key={c.name} style={activeConfig === c.name ? { background: '#12324e' } : undefined}>
                    <td style={{ padding: '2px 6px', whiteSpace: 'nowrap' }}>
                      <button className="cs-btn" title={`应用配置「${c.name}」`} style={{ padding: '0 6px', ...(activeConfig === c.name ? { background: '#1572c4', color: '#fff' } : {}) }} onClick={() => void applyConfig(c.name)}>{c.name}</button>
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
                  <td style={{ padding: '2px 6px', color: '#8a97a2', whiteSpace: 'nowrap' }}>（当前值）</td>
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
