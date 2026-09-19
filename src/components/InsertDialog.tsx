// GM-X3 #7/#8/#11：插入对话框 —— 矢量（SVG/DXF）+ 网格（STL/OBJ）。
// 矢量：平面 / Z角 / 缩放 / (DXF)单位 / 逐层包含 / 入可编辑草图源。
// 网格：单位下拉 + flip-up（Y↔Z）+ 落地摆位（不动/居中/落地）。
import { useApp } from '../store'
import { msg } from '../i18n'

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 30000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,24,28,0.42)' }
const panel: React.CSSProperties = { width: 'min(460px, 94vw)', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,0.32)', fontSize: 13, color: '#222', display: 'flex', flexDirection: 'column' }
const head: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid var(--border-soft)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }
const body: React.CSSProperties = { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }
const foot: React.CSSProperties = { padding: '10px 16px', borderTop: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'flex-end', gap: 8 }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }
const num: React.CSSProperties = { width: 72, padding: '4px 6px', border: '1px solid #c8d0d8', borderRadius: 5 }

const PLANES: ('XY' | 'XZ' | 'YZ')[] = ['XY', 'XZ', 'YZ']
const UNITS: ('mm' | 'cm' | 'm' | 'inch' | 'ft')[] = ['mm', 'cm', 'm', 'inch', 'ft']

function fmt(template: string, ...args: Array<string | number>): string {
  return template.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? ''))
}

function InsertVecDialog() {
  const v = useApp((s) => s.insertVec)
  const lang = useApp((s) => s.lang)
  if (!v) return null
  const set = useApp.getState().setInsertVec
  const title = fmt(msg('insert.title', lang), v.kind.toUpperCase())
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) useApp.getState().cancelInsertVec() }}>
      <div style={panel} onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); useApp.getState().cancelInsertVec() }
        if (e.key === 'Enter') { e.preventDefault(); void useApp.getState().confirmInsertVec() }
      }}>
        <div style={head}><span>{v.kind === 'dxf' ? '📐' : '🖼'}</span><span>{title}</span></div>
        <div style={body}>
          <div style={row}><span>{msg('insert.plane', lang)}</span>
            <select autoFocus value={v.plane} onChange={(e) => set({ plane: e.target.value as 'XY' })} style={num as React.CSSProperties}>
              {PLANES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={row}><span>{msg('insert.zAngle', lang)}</span><input type="number" step={5} style={num} value={Math.round(v.zAngle * 180 / Math.PI)} onChange={(e) => set({ zAngle: (Number(e.target.value) || 0) * Math.PI / 180 })} /></div>
          <div style={row}><span>{msg('insert.scale', lang)}</span><input type="number" step={0.1} style={num} value={v.scale} onChange={(e) => set({ scale: Number(e.target.value) || 1 })} /></div>
          {v.kind === 'dxf' && (
            <div style={row}><span>{msg('insert.unit', lang)}</span>
              <select value={v.unit} onChange={(e) => set({ unit: e.target.value as 'mm' })} style={num as React.CSSProperties}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
          <div style={row}><span>{msg('insert.height', lang)}</span><input type="number" step={1} min={0.1} style={num} value={v.height} disabled={v.sketchOnly} title={v.sketchOnly ? msg('insert.noExtrudeTip', lang) : undefined} onChange={(e) => set({ height: Number(e.target.value) || 5 })} /></div>
          <label style={{ ...row, justifyContent: 'flex-start', gap: 8 }} title={msg('insert.asSketch', lang)}>
            <input type="checkbox" checked={v.asSketch} disabled={v.sketchOnly} onChange={(e) => set({ asSketch: e.target.checked })} /><span>{msg('insert.asSketchLabel', lang)}</span>
          </label>
          {(v.profileCount != null || v.textCount != null) && (
            <div style={{ fontSize: 12, color: '#556', background: '#f4f7fa', borderRadius: 6, padding: '6px 8px' }} data-testid="dxf-import-stats">
              {fmt(msg('insert.profiles', lang), v.profileCount ?? 0, v.textCount ?? 0)}{v.bytes ? ` · ${(v.bytes / 1024).toFixed(0)} KB` : ''}
              {v.forceSketchOnly ? msg('insert.forcedSketch', lang) : ''}
            </div>
          )}
          <label style={{ ...row, justifyContent: 'flex-start', gap: 8 }} data-testid="dxf-sketch-only" title={msg('insert.sketchOnly', lang)}>
            <input type="checkbox" checked={v.sketchOnly} disabled={!!v.forceSketchOnly} onChange={(e) => set({ sketchOnly: e.target.checked, asSketch: e.target.checked ? true : v.asSketch })} /><span>{msg('insert.sketchOnlyLabel', lang)}{v.forceSketchOnly ? msg('insert.forcedOom', lang) : ((v.profileCount && v.profileCount > 32) || (v.textCount && v.textCount > 12) ? msg('insert.largeDefault', lang) : '')}</span>
          </label>
          {v.layers.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 600 }}>{fmt(msg('insert.layers', lang), v.include.length, v.layers.length)}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto' }}>
                {v.layers.map((l) => (
                  <label key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: '1px solid #d5dde3', borderRadius: 5, padding: '2px 6px' }}>
                    <input type="checkbox" checked={v.include.includes(l)} onChange={() => useApp.getState().toggleInsertVecLayer(l)} />{l || '(0)'}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={foot}>
          <button className="cmd-cancel" onClick={() => useApp.getState().cancelInsertVec()}>{msg('insert.cancel', lang)}</button>
          <button className="cmd-ok" onClick={() => void useApp.getState().confirmInsertVec()}>{msg('insert.confirm', lang)}</button>
        </div>
      </div>
    </div>
  )
}

function InsertMeshDialog() {
  const m = useApp((s) => s.insertMesh)
  const lang = useApp((s) => s.lang)
  if (!m) return null
  const set = useApp.getState().setInsertMesh
  const title = fmt(msg('insert.meshTitle', lang), m.kind.toUpperCase(), m.name)
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) useApp.getState().cancelInsertMesh() }}>
      <div style={panel} onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); useApp.getState().cancelInsertMesh() }
        if (e.key === 'Enter') { e.preventDefault(); void useApp.getState().confirmInsertMesh() }
      }}>
        <div style={head}><span>🧩</span><span>{title}</span></div>
        <div style={body}>
          <div style={row}><span>{msg('insert.unit', lang)}</span>
            <select autoFocus value={m.unit} onChange={(e) => set({ unit: e.target.value as 'mm' })} style={num as React.CSSProperties}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <label style={{ ...row, justifyContent: 'flex-start', gap: 8 }} title={msg('insert.flipOrient', lang)}>
            <input type="checkbox" checked={m.flipUp} onChange={(e) => set({ flipUp: e.target.checked })} /><span>{msg('insert.flipLabel', lang)}</span>
          </label>
          <div style={row}><span>{msg('insert.place', lang)}</span>
            <select value={m.place} onChange={(e) => set({ place: e.target.value as 'none' })} style={{ ...num, width: 110 }}>
              <option value="none">{msg('insert.placeNone', lang)}</option>
              <option value="center">{msg('insert.placeCenter', lang)}</option>
              <option value="ground">{msg('insert.placeGround', lang)}</option>
            </select>
          </div>
        </div>
        <div style={foot}>
          <button className="cmd-cancel" onClick={() => useApp.getState().cancelInsertMesh()}>{msg('insert.cancel', lang)}</button>
          <button className="cmd-ok" onClick={() => void useApp.getState().confirmInsertMesh()}>{msg('insert.confirm', lang)}</button>
        </div>
      </div>
    </div>
  )
}

export default function InsertDialog() {
  return <><InsertVecDialog /><InsertMeshDialog /></>
}
