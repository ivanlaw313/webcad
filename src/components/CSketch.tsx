import { useEffect, useRef, useState } from 'react'
import { useCSketch, type Sel, type ConstraintKind } from '../sketch/csketch'
import { useApp } from '../store'

const SCALE = 2.6 // px per mm

const TOOLS: { t: 'select' | 'line' | 'rect' | 'circle' | 'polygon' | 'trim' | 'extend' | 'break'; label: string; title?: string }[] = [
  { t: 'select', label: '↖ 选择' },
  { t: 'line', label: '／ 直线' },
  { t: 'rect', label: '▭ 矩形' },
  { t: 'circle', label: '◯ 圆' },
  { t: 'polygon', label: '⬡ 多边形', title: '正多边形：点中心 → 点一个顶点（定半径+朝向）。边数喺右边设' },
  { t: 'trim', label: '✂ 修剪', title: '修剪：点线段 → 删到最近交点' },
  { t: 'extend', label: '⊢ 延伸', title: '延伸：点线段靠近想延长嘅一端 → 延长到最近嘅线 / 圆' },
  { t: 'break', label: '⊟ 打断', title: '打断：点线段中间 → 一分为二（两段都保留，用嚟局部约束 / 修剪）' },
]

const CBTN: { k: ConstraintKind; label: string; title: string }[] = [
  { k: 'coincident', label: '重合', title: '两点重合' },
  { k: 'horizontal', label: '水平', title: '一条线 或 两点 → 水平' },
  { k: 'vertical', label: '竖直', title: '一条线 或 两点 → 竖直' },
  { k: 'parallel', label: '平行', title: '两条线平行' },
  { k: 'perpendicular', label: '垂直', title: '两条线垂直' },
  { k: 'equal', label: '相等', title: '两线等长 / 两圆等半径' },
  { k: 'point_on_line', label: '点在线上', title: '点 + 线' },
  { k: 'tangent', label: '相切', title: '线+圆 或 两圆 → 相切' },
  { k: 'concentric', label: '同心', title: '两圆同心（圆心重合）' },
  { k: 'symmetric', label: '对称', title: '两点关于一条线对称（选 2 点 + 1 线）' },
  { k: 'midpoint', label: '中点', title: '点锁到线的中点（选 1 点 + 1 线）' },
  { k: 'pldist', label: '⊥距', title: '点到线垂直距离尺寸（选 1 点 + 1 线，可绑参数/双击改）' },
  { k: 'coordx', label: 'X坐标', title: '锁定点的 X 坐标（选 1 点，可双击改/绑参）' },
  { k: 'coordy', label: 'Y坐标', title: '锁定点的 Y 坐标（选 1 点，可双击改/绑参）' },
  { k: 'cdist', label: '孔距', title: '两圆中心距尺寸（选 2 圆，可双击改/绑参）' },
  { k: 'collinear', label: '共线', title: '两条线共线（在同一直线上，选 2 线）' },
  { k: 'fix', label: '固定', title: '固定/取消固定 点' },
  { k: 'distance', label: '⟺尺寸', title: '距离尺寸（两点或一条线）' },
  { k: 'radius', label: '⌀半径', title: '圆半径尺寸' },
  { k: 'angle', label: '∠角度', title: '两线夹角尺寸' },
]

export default function CSketch() {
  const s = useCSketch()
  const dimEditRef = useRef<string | null>(null)   // 尺寸编辑会话：聚焦后首次真正改值才压一次撤销快照（input onChange 每键触发，否则会灌爆撤销栈）
  const commitCProfiles = useApp((a) => a.commitCProfiles)
  const closeCSketch = useApp((a) => a.closeCSketch)
  const params = useApp((a) => a.params)
  const svgRef = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState<[number, number]>([800, 600])
  const [height, setHeight] = useState(40)
  const [op, setOp] = useState<'new' | 'cut' | 'intersect'>('new')  // Fusion: extrude operation (join/cut/intersect)

  // Start every constraint-sketch session blank — otherwise geometry from a previous (finished or
  // cancelled) session leaks in when the overlay re-opens (it's a transient draw→extrude editor, not a
  // persistent feature). The overlay is conditionally mounted, so this runs on each open.
  useEffect(() => { useCSketch.getState().reset(); useCSketch.setState({ status: '约束草图：选工具绘制 → 加约束/尺寸 → 完全定义(黑) → 完成' }) }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setSize([r.width, r.height]) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [w, h] = size
  const toScreen = (x: number, y: number): [number, number] => [w / 2 + x * SCALE, h / 2 - y * SCALE]
  const toWorld = (sx: number, sy: number): [number, number] => [(sx - w / 2) / SCALE, (h / 2 - sy) / SCALE]
  const evWorld = (e: React.PointerEvent): [number, number] => {
    const r = svgRef.current!.getBoundingClientRect()
    return toWorld(e.clientX - r.left, e.clientY - r.top)
  }

  // hit-test in world coords -> a selectable entity (point > line > circle)
  const hitTest = (wx: number, wy: number): Sel | null => {
    const tP = 9 / SCALE, tL = 6 / SCALE
    let best: { sel: Sel; d: number } | null = null
    for (const p of s.points) { const d = Math.hypot(p.x - wx, p.y - wy); if (d < tP && (!best || d < best.d)) best = { sel: { kind: 'point', id: p.id }, d } }
    if (best) return best.sel
    for (const l of s.lines) {
      const a = s.points.find((p) => p.id === l.p1)!, b = s.points.find((p) => p.id === l.p2)!
      const d = distToSeg(wx, wy, a.x, a.y, b.x, b.y)
      if (d < tL && (!best || d < best.d)) best = { sel: { kind: 'line', id: l.id }, d }
    }
    for (const c of s.circles) { const cp = s.points.find((p) => p.id === c.c)!; const d = Math.abs(Math.hypot(cp.x - wx, cp.y - wy) - c.r); if (d < tL && (!best || d < best.d)) best = { sel: { kind: 'circle', id: c.id }, d } }
    return best?.sel ?? null
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation()
    const [wx, wy] = evWorld(e)
    const hit = hitTest(wx, wy)
    if (s.tool === 'select') {
      if (hit) { s.toggleSelect(hit); if (hit.kind === 'point' && hit.id !== 'ORIGIN') { s.dragStart(hit.id); svgRef.current!.setPointerCapture(e.pointerId) } }
      else s.clearSelection()
    } else {
      s.onClick(wx, wy, hit)
    }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const [wx, wy] = evWorld(e)
    if (s.dragging) void s.dragMove(wx, wy)
    else s.onMove(wx, wy)
  }
  const onPointerUp = (e: React.PointerEvent) => { if (s.dragging) { void s.dragEnd(); try { svgRef.current!.releasePointerCapture(e.pointerId) } catch { /* ignore */ } } }

  const selected = (kind: Sel['kind'], id: string) => s.selection.some((x) => x.kind === kind && x.id === id)
  const ptOf = (id: string) => s.points.find((p) => p.id === id)!

  const dims = s.constraints.filter((c) => ['p2p_distance', 'circle_radius', 'l2l_angle_ll', 'p2l_distance'].includes(c.type))
  // Fusion convention: fully-defined = black; under-defined = blue.
  const BLACK = '#15181c', BLUE = '#1572c4'
  const defColor = s.dof === 0 ? BLACK : BLUE   // sketch-level fallback (unchanged behavior when per-point diag absent)
  // GM-F4 v2 · 逐点/逐实体上色：dofDiag 有齐 → 每个实体按「佢自己」嘅 DOF 上色（黑=完全约束,蓝=仲有自由度）。
  // 缺 entry（几何啱啱加,异步探针未落 / 探针失败 / 点太多）→ 回退 sketch 级 defColor,完全唔改今日行为。
  const diag = s.dofDiag
  const ptColor = (id: string): string => { if (!diag) return defColor; const v = diag.ptFull[id]; return v === undefined ? defColor : (v ? BLACK : BLUE) }
  const lineColor = (l: { p1: string; p2: string }): string => { if (!diag) return defColor; const a = diag.ptFull[l.p1], b = diag.ptFull[l.p2]; return (a === undefined || b === undefined) ? defColor : (a && b ? BLACK : BLUE) }
  const circColor = (c: { id: string; c: string }): string => { if (!diag) return defColor; const ctr = diag.ptFull[c.c], r = diag.circRadFull[c.id]; return (ctr === undefined || r === undefined) ? defColor : (ctr && r ? BLACK : BLUE) }

  const finish = async () => {
    const profs = s.finishProfiles()  // ALL loops + circles (so mirror / pattern copies extrude too)
    if (!profs.length) {
      // Targeted guidance (non-coders' #1 frustration: drew lines but can't extrude → why?).
      const hint = s.lines.length > 0
        ? `已画 ${s.lines.length} 条线但未形成闭合轮廓 —— 终点要接返起点（拉到起点附近会自动吸附闭合）；或用「修剪/打断」整理后再闭合`
        : '空草图 —— 先画 直线 / 矩形 / 圆 / 多边形 组成闭合轮廓再「完成」'
      useCSketch.setState({ status: hint }); return
    }
    await commitCProfiles(profs, height, op)
  }

  // grid lines every 10mm within view
  const gx = Math.ceil(w / 2 / SCALE / 10) * 10
  const gy = Math.ceil(h / 2 / SCALE / 10) * 10
  const grid: React.ReactNode[] = []
  for (let x = -gx; x <= gx; x += 10) { const [sx] = toScreen(x, 0); grid.push(<line key={'gx' + x} x1={sx} y1={0} x2={sx} y2={h} stroke={x === 0 ? '#c8d0d8' : '#eef1f4'} strokeWidth={x === 0 ? 1.2 : 1} />) }
  for (let y = -gy; y <= gy; y += 10) { const [, sy] = toScreen(0, y); grid.push(<line key={'gy' + y} x1={0} y1={sy} x2={w} y2={sy} stroke={y === 0 ? '#c8d0d8' : '#eef1f4'} strokeWidth={y === 0 ? 1.2 : 1} />) }

  return (
    <div className="csketch">
      <div className="cs-toolbar">
        <span className="cs-title">约束草图</span>
        {TOOLS.map((t) => (
          <button key={t.t} title={t.title} className={'cs-btn' + (s.tool === t.t ? ' on' : '')} onClick={() => s.setTool(t.t)}>{t.label}</button>
        ))}
        {s.tool === 'polygon' && (
          <label className="cs-h" title="正多边形边数（3–120）">边数 <input type="number" min={3} max={120} value={s.polySides} onChange={(e) => s.setPolySides(Number(e.target.value))} style={{ width: 44 }} /></label>
        )}
        <span className="cs-div" />
        {CBTN.map((b) => (
          <button key={b.k} className="cs-btn cs-cstr" title={b.title} onClick={() => s.apply(b.k)}>{b.label}</button>
        ))}
        <span className="cs-div" />
        <button className="cs-btn cs-cstr" title="把所选线设为/取消构造线（参考/中心线，虚线显示，不计入拉伸轮廓）" onClick={() => s.toggleConstruction()}>┄ 构造线</button>
        <button className="cs-btn cs-cstr" title="镜像：先选要镜像嘅实体（线/圆），最后再选一条线做镜像轴 → 按此" onClick={() => s.mirrorSel()}>⇋ 镜像</button>
        <button className="cs-btn cs-cstr" title="倒角：先选一个角点（两条线嘅交点）→ 按此 → 输入斜角距离" onClick={async () => { const v = await useApp.getState().appPrompt('倒角距离 mm（沿两边各缩短此距离，加斜角线）', '5'); if (v != null) { const d = Number(v); if (d > 0) s.chamferCorner(d) } }}>⌐ 倒角</button>
        <button className="cs-btn cs-cstr" title="矩形阵列：先选实体（线/圆）→ 按此 → 输入 列数,列距,行数,行距" onClick={async () => { const v = await useApp.getState().appPrompt('矩形阵列  列数,列距,行数,行距（例 3,20,2,15）', '3,20,1,0'); if (v) { const p = v.split(',').map(Number); s.patternRect(p[0] || 1, p[1] || 20, p[2] || 1, p[3] || 0) } }}>▦ 矩形阵列</button>
        <button className="cs-btn cs-cstr" title="环形阵列：先选实体（线/圆），可加选一个点做中心（否则绕原点）→ 按此 → 输入 数量,总角度°" onClick={async () => { const v = await useApp.getState().appPrompt('环形阵列  数量,总角度°（例 6,360）', '6,360'); if (v) { const p = v.split(',').map(Number); s.patternCirc(p[0] || 6, p[1] ?? 360) } }}>✸ 环形阵列</button>
        <button className="cs-btn cs-cstr" title="旋转：先选要转嘅实体（线/圆），可加选一个点做旋转中心（否则绕原点）→ 按此 → 输入角度°" onClick={async () => { const v = await useApp.getState().appPrompt('旋转角度°（正=逆时针；绕所选点，否则原点）', '90'); if (v != null) { const a = Number(v); if (Number.isFinite(a)) s.rotateSel(a) } }}>⟳ 旋转</button>
        <button className="cs-btn cs-cstr" title="投影实体：把现有 3D 实体嘅外形矩形（参考线）+ 各竖直孔中心（参考点）投影入草图 → 可对佢哋打尺寸/约束新几何（相对 3D 物体定位）" onClick={() => s.projectBody()}>⧉ 投影实体</button>
        <button className="cs-btn" title="删除所选" onClick={() => void s.deleteSelected()}>🗑</button>
        <button className="cs-btn" title="撤销 (Ctrl+Z)" disabled={!s.past.length} onClick={() => s.undo()}>↶</button>
        <button className="cs-btn" title="重做 (Ctrl+Y)" disabled={!s.future.length} onClick={() => s.redo()}>↷</button>
        <button className="cs-btn" title="清空草图，重新嚟过（可 Ctrl+Z 撤销）" onClick={() => s.clearAll()}>🧹 全清</button>
        <span className="cs-spacer" />
        <button className={'cs-btn' + (op === 'new' ? ' on' : '')} title="新建 / 加料实体" onClick={() => setOp('new')}>＋新建</button>
        <button className={'cs-btn' + (op === 'cut' ? ' on' : '')} title="从现有实体切除（要先有实体）" onClick={() => setOp('cut')}>－切割</button>
        <button className={'cs-btn' + (op === 'intersect' ? ' on' : '')} title="只保留与现有实体的公共部分" onClick={() => setOp('intersect')}>∩相交</button>
        <label className="cs-h">高度 <input type="number" min={1} value={height} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setHeight(Number(e.target.value) || 1)} /> mm</label>
        <button className="cs-btn cs-finish" onClick={() => void finish()}>{op === 'cut' ? '完成并切割' : op === 'intersect' ? '完成并相交' : '完成并拉伸'}</button>
        <button className="cs-btn" onClick={() => closeCSketch()}>取消</button>
      </div>

      <svg
        ref={svgRef}
        className="cs-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {grid}

        {/* lines */}
        {s.lines.map((l) => {
          const a = ptOf(l.p1), b = ptOf(l.p2)
          const [x1, y1] = toScreen(a.x, a.y), [x2, y2] = toScreen(b.x, b.y)
          return <line key={l.id} x1={x1} y1={y1} x2={x2} y2={y2} stroke={selected('line', l.id) ? '#e08a2b' : l.construction ? '#c08a2a' : lineColor(l)} strokeWidth={selected('line', l.id) ? 3 : l.construction ? 1.4 : 2} strokeDasharray={l.construction ? '7 4' : undefined} />
        })}

        {/* draft preview line */}
        {s.draft.length > 0 && s.preview && s.tool === 'line' && (() => {
          const a = ptOf(s.draft[s.draft.length - 1]); const [x1, y1] = toScreen(a.x, a.y); const [x2, y2] = toScreen(s.preview[0], s.preview[1])
          return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#9bbfe0" strokeWidth={1.5} strokeDasharray="5 4" />
        })()}
        {/* live preview for 2-click shapes (rect / circle / polygon) — geometry matches what the 2nd click creates */}
        {s.draft.length > 0 && s.preview && s.tool === 'rect' && (() => {
          const a = ptOf(s.draft[0]); const [x1, y1] = toScreen(a.x, a.y); const [x2, y2] = toScreen(s.preview[0], s.preview[1])
          return <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} fill="none" stroke="#9bbfe0" strokeWidth={1.5} strokeDasharray="5 4" />
        })()}
        {s.draft.length > 0 && s.preview && s.tool === 'circle' && (() => {
          const a = ptOf(s.draft[0]); const [cx, cy] = toScreen(a.x, a.y); const r = Math.hypot(s.preview[0] - a.x, s.preview[1] - a.y) * SCALE
          return <circle cx={cx} cy={cy} r={r} fill="none" stroke="#9bbfe0" strokeWidth={1.5} strokeDasharray="5 4" />
        })()}
        {s.draft.length > 0 && s.preview && s.tool === 'polygon' && (() => {
          const a = ptOf(s.draft[0]); const r = Math.hypot(s.preview[0] - a.x, s.preview[1] - a.y) || 1; const a0 = Math.atan2(s.preview[1] - a.y, s.preview[0] - a.x); const n = Math.max(3, Math.round(s.polySides || 6))
          const pts = Array.from({ length: n }, (_, i) => { const ang = a0 + (i * 2 * Math.PI) / n; const [px, py] = toScreen(a.x + r * Math.cos(ang), a.y + r * Math.sin(ang)); return `${px},${py}` }).join(' ')
          return <polygon points={pts} fill="none" stroke="#9bbfe0" strokeWidth={1.5} strokeDasharray="5 4" />
        })()}
        {/* live dimension readout near cursor while drawing (Fusion-style) — matches the preview geometry */}
        {s.draft.length > 0 && s.preview && (() => {
          const a = ptOf(s.draft[s.tool === 'line' ? s.draft.length - 1 : 0])
          const dx = s.preview[0] - a.x, dy = s.preview[1] - a.y, dist = Math.hypot(dx, dy)
          const txt = s.tool === 'line' ? dist.toFixed(1)
            : s.tool === 'rect' ? `${Math.abs(dx).toFixed(0)}×${Math.abs(dy).toFixed(0)}`
              : s.tool === 'circle' ? 'R' + dist.toFixed(1)
                : s.tool === 'polygon' ? `R${dist.toFixed(1)} ×${Math.max(3, Math.round(s.polySides || 6))}` : ''
          if (!txt) return null
          const [px, py] = toScreen(s.preview[0], s.preview[1])
          return <text x={px + 12} y={py - 8} fill="#1572c4" fontSize={13} fontWeight={600} style={{ userSelect: 'none', pointerEvents: 'none' }}>{txt}</text>
        })()}

        {/* circles */}
        {s.circles.map((c) => {
          const cp = ptOf(c.c); const [cx, cy] = toScreen(cp.x, cp.y)
          return <circle key={c.id} cx={cx} cy={cy} r={c.r * SCALE} fill="none" stroke={selected('circle', c.id) ? '#e08a2b' : circColor(c)} strokeWidth={selected('circle', c.id) ? 3 : 2} />
        })}

        {/* dimension value labels */}
        {dims.map((c) => {
          if (c.type === 'p2p_distance') {
            const a = ptOf(c.p1_id), b = ptOf(c.p2_id); const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const [sx, sy] = toScreen(mx, my)
            return <text key={c.id} x={sx} y={sy - 4} fill="#107a3d" fontSize={12} textAnchor="middle">{Number(c.distance).toFixed(0)}</text>
          }
          if (c.type === 'circle_radius') {
            const cc = s.circles.find((x) => x.id === c.c_id); if (!cc) return null; const cp = ptOf(cc.c); const [sx, sy] = toScreen(cp.x, cp.y)
            return <text key={c.id} x={sx} y={sy - 4} fill="#107a3d" fontSize={12} textAnchor="middle">R{Number(c.radius).toFixed(0)}</text>
          }
          return null
        })}

        {/* points */}
        {s.points.map((p) => {
          const [cx, cy] = toScreen(p.x, p.y)
          if (p.id === 'ORIGIN') {
            // Origin datum ⊕ — a distinct crosshair so it's obvious you can dimension/constrain to it.
            const on = selected('point', p.id), col = on ? '#e08a2b' : '#c0392b'
            return <g key={p.id} style={{ cursor: 'pointer' }}>
              <line x1={cx - 8} y1={cy} x2={cx + 8} y2={cy} stroke={col} strokeWidth={1.5} />
              <line x1={cx} y1={cy - 8} x2={cx} y2={cy + 8} stroke={col} strokeWidth={1.5} />
              <circle cx={cx} cy={cy} r={on ? 5 : 3.5} fill="none" stroke={col} strokeWidth={1.5} />
            </g>
          }
          return <circle key={p.id} cx={cx} cy={cy} r={selected('point', p.id) ? 5 : 3.5}
            fill={selected('point', p.id) ? '#e08a2b' : p.fixed ? '#107a3d' : ptColor(p.id)} stroke="#fff" strokeWidth={1} />
        })}
      </svg>

      {dims.length > 0 && (
        <div className="cs-dims">
          <div className="cs-dims-title">尺寸（改数值即重建）</div>
          {dims.map((c) => (
            <div key={c.id} className="cs-dim">
              <span>{c.type === 'circle_radius' ? '半径' : c.type === 'l2l_angle_ll' ? '角度' : '距离'}</span>
              <input type="number" disabled={!!s.dimRefs[c.id]} title={s.dimRefs[c.id] ? `由参数 ${s.dimRefs[c.id]} 驱动` : '直接数值'}
                value={c.type === 'circle_radius' ? Number(c.radius).toFixed(1) : c.type === 'l2l_angle_ll' ? (Number(c.angle) * 180 / Math.PI).toFixed(1) : Number((c as { distance: number }).distance).toFixed(1)}
                onFocus={(e) => { e.currentTarget.select(); dimEditRef.current = null }}
                onChange={(e) => { if (dimEditRef.current !== c.id) { s.pushUndo(); dimEditRef.current = c.id } void s.editDimension(c.id, Number(e.target.value) || 0) }}
                onBlur={() => { dimEditRef.current = null }} />
              {params.length > 0 && (
                <select className="cs-dimparam" title="链接到用户参数（参数变→此尺寸自动跟着变）" value={s.dimRefs[c.id] || ''} onChange={(e) => void s.setDimRef(c.id, e.target.value)}>
                  <option value="">ƒx…</option>
                  {params.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
              )}
              <button className="cs-x" title="删除约束" onClick={() => void s.removeConstraint(c.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      <div className={'cs-status' + (s.conflicts.length ? ' bad' : '')}>{s.status}　·　点 {s.points.length} / 线 {s.lines.length} / 圆 {s.circles.length} / 约束 {s.constraints.length}　·　<b style={{ color: s.finishProfiles().length ? '#107a3d' : '#a06a2a' }}>可拉伸轮廓 {s.finishProfiles().length}</b></div>
    </div>
  )
}

function distToSeg(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1
  const len2 = dx * dx + dy * dy || 1
  let t = ((px - x1) * dx + (py - y1) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))
}
