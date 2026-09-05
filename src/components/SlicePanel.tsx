import { useMemo, useState } from 'react'
import { analyzeSlices, sliceMesh, classifyLoops, layerIslands, netArea, pointInLoop, type MeshLike, type Pt2 } from '../geom/slicePreview'

// 切层预览面板 —— 打印前逐层检查：悬空孤岛（红）/ 首层接触面积 / 最薄层 / 未闭合轮廓。
// 完全受控组件：mesh 由外部传入（整合方传 bodyMesh），唔 import store；
// 复用 DrawingPanel 嘅 modal 样式（.drawing-overlay / .drawing-modal / .dw-head / .dw-foot / .cs-btn），冇新 CSS。
const fmtA = (n: number) => (n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2))

export default function SlicePanel({ mesh, onClose }: { mesh: MeshLike; onClose: () => void }) {
  const [layerH, setLayerH] = useState(0.2)
  const [layerIdx, setLayerIdx] = useState(0)

  // 全模型逐层分析（孤岛层 / 首层面积 / 最薄层 / 未闭合层数）
  const ana = useMemo(() => analyzeSlices(mesh, layerH), [mesh, layerH])
  const li = Math.max(0, Math.min(layerIdx, ana.layers - 1))
  const z = ana.zMin + ana.step / 2 + li * ana.step

  // 当前层 + 上一层切片（单层切好快，拖 slider 实时重切）
  const cur = useMemo(() => sliceMesh(mesh, z), [mesh, z])
  const prevLoops = useMemo(() => (li > 0 ? sliceMesh(mesh, z - ana.step).loops : []), [mesh, z, ana.step, li])
  const cls = useMemo(() => classifyLoops(cur.loops), [cur])
  const islIdx = useMemo(() => (li > 0 ? layerIslands(cur.loops, prevLoops, cls) : []), [cur, prevLoops, cls, li])
  const layerArea = useMemo(() => netArea(cls), [cls])

  // 俯视 XY 包围盒（CAD 坐标，所有层共用 → 拖 slider 视图唔会跳）
  const bb = useMemo(() => {
    const vv = mesh.vertices
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let i = 0; i + 2 < vv.length; i += 3) {
      if (vv[i] < x0) x0 = vv[i]
      if (vv[i] > x1) x1 = vv[i]
      if (vv[i + 1] < y0) y0 = vv[i + 1]
      if (vv[i + 1] > y1) y1 = vv[i + 1]
    }
    return { x0, x1, y0, y1 }
  }, [mesh])

  if (ana.layers === 0) {
    return (
      <div className="drawing-overlay" onClick={onClose}>
        <div className="drawing-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(92vw, 420px)' }}>
          <div className="dw-head">🔪 切层预览<span className="dw-x" onClick={onClose}>✕</span></div>
          <div style={{ fontSize: 13, color: '#5a6b78', padding: '8px 0 4px' }}>无可切几何 —— 实体网格为空或冇高度。</div>
          <div className="dw-foot"><button className="cs-btn" onClick={onClose}>关闭</button></div>
        </div>
      </div>
    )
  }

  // SVG 俯视：CAD y 向上 → SVG y 向下，画时取 −y
  const m = Math.max(2, 0.05 * Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0))
  const vb = `${(bb.x0 - m).toFixed(2)} ${(-bb.y1 - m).toFixed(2)} ${(bb.x1 - bb.x0 + 2 * m).toFixed(2)} ${(bb.y1 - bb.y0 + 2 * m).toFixed(2)}`
  const pathOf = (lp: Pt2[]) => 'M' + lp.map((p) => `${p[0].toFixed(3)} ${(-p[1]).toFixed(3)}`).join('L') + 'Z'
  // 实体填浅蓝、孔留白：全部闭合 loop 入一条 path，fill-rule=evenodd 自动抠孔
  const solidPath = cur.loops.map(pathOf).join('')
  // 孤岛区填红：孤岛外轮廓 + 落喺佢入面嘅孔（同样 evenodd 抠孔）
  const islandPaths = islIdx.map((i) => {
    const inner = cur.loops.filter((lp, j) => j !== i && cls.depth[j] % 2 === 1 && pointInLoop(lp[0][0], lp[0][1], cur.loops[i]))
    return pathOf(cur.loops[i]) + inner.map(pathOf).join('')
  })
  // 未闭合链：红色虚线（唔水密证据）
  const openPath = cur.open.map((lp) => 'M' + lp.map((p) => `${p[0].toFixed(3)} ${(-p[1]).toFixed(3)}`).join('L')).join('')

  return (
    <div className="drawing-overlay" onClick={onClose}>
      <div className="drawing-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(92vw, 760px)' }}>
        <div className="dw-head">🔪 切层预览 — 打印前逐层检查<span className="dw-x" onClick={onClose}>✕</span></div>

        {/* 警告汇总 */}
        <div style={{ fontSize: 13, marginBottom: 8, lineHeight: 1.7 }}>
          {ana.islands.length > 0
            ? <span style={{ color: '#c62828', fontWeight: 600 }}>⚠ {ana.islands.length} 层有悬空孤岛（首个喺 Z={ana.islands[0].z.toFixed(2)}mm — 落料时浮空，要加支撑）</span>
            : <span style={{ color: '#2e7d32', fontWeight: 600 }}>✓ 无悬空孤岛</span>}
          <span style={{ color: '#5a6b78' }}>　·　首层接触面积 <b style={ana.firstLayerArea < 50 ? { color: '#c62828' } : undefined}>{fmtA(ana.firstLayerArea)} mm²</b>{ana.firstLayerArea < 50 && '（偏细，易甩板）'}　·　最薄层 <b>{fmtA(ana.minArea.area)} mm²</b>（Z={ana.minArea.z.toFixed(2)}mm）</span>
          {ana.openLayers > 0 && <div style={{ color: '#e65100', fontSize: 12 }}>⚠ {ana.openLayers} 层切出未闭合轮廓（虚线红）—— 网格可能唔水密，切片软件会乱估内部</div>}
          {ana.note && <div style={{ color: '#5a6b78', fontSize: 12 }}>ℹ {ana.note}</div>}
        </div>

        {/* 当前层俯视图 */}
        <div style={{ background: '#fff', border: '1px solid #d4dbe0', borderRadius: 6, padding: 4 }}>
          <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: 380, display: 'block' }}>
            {/* 包围盒淡框做参照 */}
            <rect x={bb.x0} y={-bb.y1} width={bb.x1 - bb.x0} height={bb.y1 - bb.y0} fill="none" stroke="#e3e8ec" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            {solidPath && <path d={solidPath} fillRule="evenodd" fill="#cfe8f7" stroke="#2a7aa8" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />}
            {islandPaths.map((d, i) => <path key={'i' + i} d={d} fillRule="evenodd" fill="#ef9a9a" stroke="#c62828" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />)}
            {openPath && <path d={openPath} fill="none" stroke="#d32f2f" strokeWidth={1.4} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" />}
          </svg>
        </div>

        {/* 层滑杆 + 当前层读数 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 12, color: '#333' }}>
          <input type="range" min={0} max={Math.max(0, ana.layers - 1)} step={1} value={li} onChange={(e) => setLayerIdx(+e.target.value)} style={{ flex: 1 }} title="拖动逐层查看（↑顶层 ↓首层）" />
          <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>第 {li + 1}/{ana.layers} 层 · Z={z.toFixed(2)} mm</span>
        </div>
        <div style={{ fontSize: 12, color: '#5a6b78', marginTop: 4 }}>
          本层：实体区 {cls.solidIdx.length} 个 · 净面积 {fmtA(layerArea)} mm²
          {islIdx.length > 0 && <span style={{ color: '#c62828', fontWeight: 600 }}> · ⚠ {islIdx.length} 个悬空孤岛（红色区 —— 下一层冇承托）</span>}
          {cur.open.length > 0 && <span style={{ color: '#e65100' }}> · 未闭合链 {cur.open.length} 条</span>}
        </div>

        <div className="dw-foot">
          <span style={{ fontSize: 11, color: '#888', marginRight: 'auto' }}>■ 浅蓝=实体　□ 白=孔　■ 红=悬空孤岛（需支撑）　┄ 红虚线=未闭合轮廓</span>
          <label style={{ fontSize: 12 }} title="模拟打印层高（改变后全模型重新分析）">层高{' '}
            <select value={String(layerH)} onChange={(e) => { setLayerH(+e.target.value); setLayerIdx(0) }} style={{ fontSize: 12 }}>
              <option value="0.12">0.12 mm</option>
              <option value="0.2">0.2 mm</option>
              <option value="0.28">0.28 mm</option>
            </select>
          </label>
          <button className="cs-btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
