// GM-X3 #7/#8/#11：插入对话框 —— 矢量（SVG/DXF）+ 网格（STL/OBJ）。
// 矢量：平面 / Z角 / 缩放 / (DXF)单位 / 逐层包含 / 入可编辑草图源。
// 网格：单位下拉 + flip-up（Y↔Z）+ 落地摆位（不动/居中/落地）。
import { useApp } from '../store'

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 30000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(20,24,28,0.42)' }
const panel: React.CSSProperties = { width: 'min(460px, 94vw)', maxHeight: '86vh', overflowY: 'auto', background: '#fff', borderRadius: 10, boxShadow: '0 12px 48px rgba(0,0,0,0.32)', fontSize: 13, color: '#222', display: 'flex', flexDirection: 'column' }
const head: React.CSSProperties = { padding: '10px 16px', borderBottom: '1px solid var(--border-soft)', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }
const body: React.CSSProperties = { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }
const foot: React.CSSProperties = { padding: '10px 16px', borderTop: '1px solid var(--border-soft)', display: 'flex', justifyContent: 'flex-end', gap: 8 }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }
const num: React.CSSProperties = { width: 72, padding: '4px 6px', border: '1px solid #c8d0d8', borderRadius: 5 }

const PLANES: ('XY' | 'XZ' | 'YZ')[] = ['XY', 'XZ', 'YZ']
const UNITS: ('mm' | 'cm' | 'm' | 'inch' | 'ft')[] = ['mm', 'cm', 'm', 'inch', 'ft']

function InsertVecDialog() {
  const v = useApp((s) => s.insertVec)
  if (!v) return null
  const set = useApp.getState().setInsertVec
  return (
    <div role="dialog" aria-modal="true" aria-label={`插入 ${v.kind.toUpperCase()}`} style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) useApp.getState().cancelInsertVec() }}>
      <div style={panel} onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); useApp.getState().cancelInsertVec() }
        if (e.key === 'Enter') { e.preventDefault(); void useApp.getState().confirmInsertVec() }
      }}>
        <div style={head}><span>{v.kind === 'dxf' ? '📐' : '🖼'}</span><span>插入 {v.kind.toUpperCase()}</span></div>
        <div style={body}>
          <div style={row}><span>平面</span>
            <select autoFocus value={v.plane} onChange={(e) => set({ plane: e.target.value as 'XY' })} style={num as React.CSSProperties}>
              {PLANES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={row}><span>Z 角（°）</span><input type="number" step={5} style={num} value={Math.round(v.zAngle * 180 / Math.PI)} onChange={(e) => set({ zAngle: (Number(e.target.value) || 0) * Math.PI / 180 })} /></div>
          <div style={row}><span>缩放 ×</span><input type="number" step={0.1} style={num} value={v.scale} onChange={(e) => set({ scale: Number(e.target.value) || 1 })} /></div>
          {v.kind === 'dxf' && (
            <div style={row}><span>单位（→mm）</span>
              <select value={v.unit} onChange={(e) => set({ unit: e.target.value as 'mm' })} style={num as React.CSSProperties}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          )}
          <div style={row}><span>拉伸高度（mm）</span><input type="number" step={1} min={0.1} style={num} value={v.height} disabled={v.sketchOnly} title={v.sketchOnly ? '仅草图模式不拉伸' : undefined} onChange={(e) => set({ height: Number(e.target.value) || 5 })} /></div>
          <label style={{ ...row, justifyContent: 'flex-start', gap: 8 }} title="入草图源 → 双击时间轴节点可重开改曲线 / 加尺寸约束（Fusion 可编辑草图）">
            <input type="checkbox" checked={v.asSketch} disabled={v.sketchOnly} onChange={(e) => set({ asSketch: e.target.checked })} /><span>入可编辑草图曲线（可重开改）</span>
          </label>
          {(v.profileCount != null || v.textCount != null) && (
            <div style={{ fontSize: 12, color: '#556', background: '#f4f7fa', borderRadius: 6, padding: '6px 8px' }} data-testid="dxf-import-stats">
              识别 {v.profileCount ?? 0} 轮廓 · {v.textCount ?? 0} 文字{v.bytes ? ` · ${(v.bytes / 1024).toFixed(0)} KB` : ''}
              {v.forceSketchOnly ? ' — 大图已强制仅草图' : ''}
            </div>
          )}
          <label style={{ ...row, justifyContent: 'flex-start', gap: 8 }} data-testid="dxf-sketch-only" title="大图 / 原理图推荐：轮廓入草图 + 文字入标注，不批量拉伸（避免内存溢出）。之后可重开草图再按需拉伸。">
            <input type="checkbox" checked={v.sketchOnly} disabled={!!v.forceSketchOnly} onChange={(e) => set({ sketchOnly: e.target.checked, asSketch: e.target.checked ? true : v.asSketch })} /><span>仅导入为草图（不拉伸）{v.forceSketchOnly ? ' · 已强制（防 OOM）' : ((v.profileCount && v.profileCount > 32) || (v.textCount && v.textCount > 12) ? ' · 大图已默认勾选' : '')}</span>
          </label>
          {v.layers.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontWeight: 600 }}>逐层包含（{v.include.length}/{v.layers.length}）</div>
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
          <button className="cmd-cancel" onClick={() => useApp.getState().cancelInsertVec()}>取消</button>
          <button className="cmd-ok" onClick={() => void useApp.getState().confirmInsertVec()}>插入</button>
        </div>
      </div>
    </div>
  )
}

function InsertMeshDialog() {
  const m = useApp((s) => s.insertMesh)
  if (!m) return null
  const set = useApp.getState().setInsertMesh
  return (
    <div role="dialog" aria-modal="true" aria-label={`插入 ${m.kind.toUpperCase()}`} style={overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) useApp.getState().cancelInsertMesh() }}>
      <div style={panel} onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); useApp.getState().cancelInsertMesh() }
        if (e.key === 'Enter') { e.preventDefault(); void useApp.getState().confirmInsertMesh() }
      }}>
        <div style={head}><span>🧩</span><span>插入网格 {m.kind.toUpperCase()}「{m.name}」</span></div>
        <div style={body}>
          <div style={row}><span>单位（→mm）</span>
            <select autoFocus value={m.unit} onChange={(e) => set({ unit: e.target.value as 'mm' })} style={num as React.CSSProperties}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <label style={{ ...row, justifyContent: 'flex-start', gap: 8 }} title="翻正朝向：Y-up ↔ Z-up（绕 X 轴 -90°）— 部分工具导出的网格躺倒时用">
            <input type="checkbox" checked={m.flipUp} onChange={(e) => set({ flipUp: e.target.checked })} /><span>翻正 Y ↔ Z（flip up）</span>
          </label>
          <div style={row}><span>落地摆位</span>
            <select value={m.place} onChange={(e) => set({ place: e.target.value as 'none' })} style={{ ...num, width: 110 }}>
              <option value="none">不动</option>
              <option value="center">居中 XZ</option>
              <option value="ground">落地 Z=0</option>
            </select>
          </div>
        </div>
        <div style={foot}>
          <button className="cmd-cancel" onClick={() => useApp.getState().cancelInsertMesh()}>取消</button>
          <button className="cmd-ok" onClick={() => void useApp.getState().confirmInsertMesh()}>插入</button>
        </div>
      </div>
    </div>
  )
}

export default function InsertDialog() {
  return <><InsertVecDialog /><InsertMeshDialog /></>
}
