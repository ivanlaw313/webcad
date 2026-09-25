import { create } from 'zustand'
import { solveSketch, diagnoseSketchDof, type SketchDof } from './solver'
import { useApp } from '../store'
import { detectAllCylinders } from '../geom/faceDetect'
import type { Constraint, SketchPrimitive } from '@salusoft89/planegcs'

// ---- model ----
export type CPoint = { id: string; x: number; y: number; fixed: boolean }
export type CLine = { id: string; p1: string; p2: string; construction?: boolean }
export type CCircle = { id: string; c: string; r: number }
export type CTool = 'select' | 'line' | 'rect' | 'circle' | 'polygon' | 'trim' | 'extend' | 'break'
export type Sel = { kind: 'point' | 'line' | 'circle'; id: string }
export type ConstraintKind =
  | 'coincident' | 'horizontal' | 'vertical' | 'parallel' | 'perpendicular'
  | 'equal' | 'point_on_line' | 'distance' | 'radius' | 'angle' | 'fix'
  | 'tangent' | 'concentric' | 'symmetric' | 'midpoint' | 'pldist' | 'coordx' | 'coordy' | 'cdist' | 'collinear'

let _n = 0
const nid = (p: string) => p + ++_n

// Deep-ish snapshot of the editable geometry — shared by undo & redo (CPoint/CLine/CCircle/Constraint are flat objects).
type CsGeom = { points: CPoint[]; lines: CLine[]; circles: CCircle[]; constraints: Constraint[]; dimRefs: Record<string, string> }
const csSnap = (s: CsGeom): CsGeom => ({ points: s.points.map((p) => ({ ...p })), lines: s.lines.map((l) => ({ ...l })), circles: s.circles.map((c) => ({ ...c })), constraints: s.constraints.map((c) => ({ ...c })), dimRefs: { ...s.dimRefs } })

type CS = {
  points: CPoint[]
  lines: CLine[]
  circles: CCircle[]
  constraints: Constraint[]

  tool: CTool
  setTool: (t: CTool) => void
  polySides: number                 // regular-polygon side count for the 'polygon' tool
  setPolySides: (n: number) => void
  selection: Sel[]
  draft: string[]          // in-progress polyline point ids
  preview: [number, number] | null
  dragging: string | null
  status: string
  conflicts: string[]
  dof: number   // degrees of freedom from the last solve: 0 = fully defined (black), >0 = under-defined (blue)
  // GM-F4 · 逐点/逐实体 DOF 诊断（v2 上色）。null = 未算好 / 探针失败 / 点太多 → CSketch 回退到 sketch 级 dof 上色。
  // 由 solve() 之后异步(debounce)算,拓扑无变会用返 cache,拖曳中唔算 → 零 solve 交互影响。
  dofDiag: SketchDof | null
  past: { points: CPoint[]; lines: CLine[]; circles: CCircle[]; constraints: Constraint[]; dimRefs: Record<string, string> }[]  // undo stack
  future: { points: CPoint[]; lines: CLine[]; circles: CCircle[]; constraints: Constraint[]; dimRefs: Record<string, string> }[]  // redo stack
  pushUndo: () => void   // snapshot current geometry before a mutating action (clears redo)
  undo: () => void       // restore the last snapshot (Ctrl+Z inside the constraint sketch)
  redo: () => void       // re-apply an undone snapshot (Ctrl+Y / Ctrl+Shift+Z)
  clearAll: () => void   // wipe all geometry (undoable, keeps the undo stack — unlike reset)

  reset: () => void
  onClick: (x: number, y: number, hit: Sel | null) => void
  onMove: (x: number, y: number) => void
  toggleSelect: (sel: Sel) => void
  clearSelection: () => void
  apply: (k: ConstraintKind) => void
  toggleConstruction: () => void
  mirrorSel: () => void
  chamferCorner: (d: number) => void
  patternRect: (nx: number, dx: number, ny: number, dy: number) => void
  patternCirc: (count: number, angleTotal: number) => void
  rotateSel: (angleDeg: number) => void
  projectBody: () => void
  editDimension: (id: string, value: number) => Promise<void>
  dimRefs: Record<string, string>     // dimension constraint id → user-parameter name (parametric dims)
  setDimRef: (cid: string, name: string) => Promise<void>
  removeConstraint: (id: string) => Promise<void>
  deleteSelected: () => Promise<void>
  dragStart: (id: string) => void
  dragMove: (x: number, y: number) => Promise<void>
  dragEnd: () => Promise<void>
  solve: (extra?: Constraint[]) => Promise<void>
  finishProfile: () => { type: 'poly'; pts: [number, number][] } | { type: 'circle'; c: [number, number]; r: number } | null
  finishProfiles: () => ({ type: 'poly'; pts: [number, number][] } | { type: 'circle'; c: [number, number]; r: number })[]
}

const pt = (s: CS, id: string) => s.points.find((p) => p.id === id)!
const lineLen = (s: CS, l: CLine) => Math.hypot(pt(s, l.p2).x - pt(s, l.p1).x, pt(s, l.p2).y - pt(s, l.p1).y)
const lineAng = (s: CS, l: CLine) => Math.atan2(pt(s, l.p2).y - pt(s, l.p1).y, pt(s, l.p2).x - pt(s, l.p1).x)

export const useCSketch = create<CS>((set, get) => ({
  points: [], lines: [], circles: [], constraints: [], dimRefs: {},
  tool: 'line', setTool: (t) => set({ tool: t, draft: [], selection: [], status: t === 'trim' ? '修剪：點線段 → 刪到最近交點（無交點刪整條）' : t === 'extend' ? '延伸：點線段靠近想延長嘅一端 → 延長到最近嘅線 / 圓' : t === 'break' ? '打斷：點線段中間想分割嘅位置 → 一條變兩段（兩段都保留）' : t === 'select' ? '選擇：點實體選取，拖動點可移動（受約束）' : `繪製 ${t === 'line' ? '直線' : t === 'rect' ? '矩形' : '圓'}：點擊落點` }),
  selection: [], draft: [], preview: null, dragging: null,
  polySides: 6, setPolySides: (n) => set({ polySides: Math.min(120, Math.max(3, Math.round(n) || 3)) }),  // cap 120 — guard against huge input freezing the sketch
  status: '約束草圖：選 直線/矩形/圓 繪製；選擇實體後加約束/標註', conflicts: [], dof: -1, dofDiag: null,
  past: [], future: [],
  // Snapshot geometry (deep-ish copy) before a mutating action, so Ctrl+Z can step back. Cap 60. New action clears redo.
  pushUndo: () => set((s) => ({ past: [...s.past, csSnap(s)].slice(-60), future: [] })),
  undo: () => {
    const s = get()
    if (!s.past.length) { set({ status: '冇得再撤銷（約束草圖）' }); return }
    const prev = s.past[s.past.length - 1]
    set({ ...csSnap(prev), past: s.past.slice(0, -1), future: [...s.future, csSnap(s)], selection: [], draft: [], preview: null, status: '已撤銷（Ctrl+Y 重做）' })
    void get().solve()
  },
  redo: () => {
    const s = get()
    if (!s.future.length) { set({ status: '冇得重做' }); return }
    const nxt = s.future[s.future.length - 1]
    set({ ...csSnap(nxt), future: s.future.slice(0, -1), past: [...s.past, csSnap(s)], selection: [], draft: [], preview: null, status: '已重做' })
    void get().solve()
  },

  // Seed a fixed ORIGIN datum point at (0,0) so geometry can be dimensioned / constrained RELATIVE TO ORIGIN
  // (e.g. circle centre 20mm from origin). It's pinned (fixed) and protected from deletion. Pure reference —
  // a lone point forms no profile, so it never affects extrude.
  reset: () => set({ points: [{ id: 'ORIGIN', x: 0, y: 0, fixed: true }], lines: [], circles: [], constraints: [], dimRefs: {}, selection: [], draft: [], preview: null, dragging: null, conflicts: [], dofDiag: null, past: [], future: [], status: '已清空草圖（保留原點 ⊕，可對原點打尺寸定位）' }),
  // Like reset but UNDOABLE (snapshots first, keeps the undo stack) — a「重新嚟过」button.
  clearAll: () => { const s = get(); if (s.points.length <= 1 && !s.lines.length && !s.circles.length) { set({ status: '草圖已經係空白' }); return } get().pushUndo(); set({ points: [{ id: 'ORIGIN', x: 0, y: 0, fixed: true }], lines: [], circles: [], constraints: [], dimRefs: {}, selection: [], draft: [], preview: null, conflicts: [], dof: -1, dofDiag: null, status: '已清空（保留原點 ⊕，可撤銷 Ctrl+Z）' }) },

  onClick: (x, y, hit) => {
    const s = get()
    if (s.tool === 'select') { if (hit) get().toggleSelect(hit); else set({ selection: [] }); return }
    get().pushUndo()   // drawing / modify tool about to mutate → snapshot for Ctrl+Z

    if (s.tool === 'trim') {
      // Fusion Trim: click a line → delete it up to its nearest intersections with other lines/circles.
      let target = hit && hit.kind === 'line' ? s.lines.find((l) => l.id === hit.id) || null : null
      if (!target) { let bestD = Infinity; for (const l of s.lines) { const a = pt(s, l.p1), b = pt(s, l.p2); const t = Math.max(0, Math.min(1, segT(a, b, x, y))); const d = Math.hypot(a.x + t * (b.x - a.x) - x, a.y + t * (b.y - a.y) - y); if (d < bestD) { bestD = d; target = l } } if (bestD > 12) target = null }
      if (!target) { set({ status: '修剪：點選要刪除嘅線段（會刪到最近交點；無交點則刪整條）' }); return }
      const tg = target, a = pt(s, tg.p1), b = pt(s, tg.p2)
      const ts: number[] = []
      for (const l of s.lines) { if (l.id === tg.id) continue; const t = lineLineT(a, b, pt(s, l.p1), pt(s, l.p2)); if (t != null) ts.push(t) }
      for (const cc of s.circles) { const cp = pt(s, cc.c); for (const t of lineCircleT(a, b, cp.x, cp.y, cc.r)) ts.push(t) }
      const uniq = [...new Set(ts.map((t) => +t.toFixed(4)))].filter((t) => t > 1e-3 && t < 1 - 1e-3).sort((p, q) => p - q)
      const tc = Math.max(0, Math.min(1, segT(a, b, x, y)))
      const bounds = [0, ...uniq, 1]
      let lo = 0, hi = 1
      for (let i = 0; i < bounds.length - 1; i++) { if (tc >= bounds[i] - 1e-6 && tc <= bounds[i + 1] + 1e-6) { lo = bounds[i]; hi = bounds[i + 1]; break } }
      const P = (t: number) => ({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) })
      set((st) => {
        let lines = [...st.lines]; let points = [...st.points]; const circles = st.circles
        const mk = (q: { x: number; y: number }) => { const id = nid('p'); points.push({ id, x: q.x, y: q.y, fixed: false }); return id }
        if (lo <= 1e-6 && hi >= 1 - 1e-6) { lines = lines.filter((l) => l.id !== tg.id) }
        else if (lo <= 1e-6) { const np = mk(P(hi)); lines = lines.map((l) => (l.id === tg.id ? { ...l, p1: np } : l)) }
        else if (hi >= 1 - 1e-6) { const np = mk(P(lo)); lines = lines.map((l) => (l.id === tg.id ? { ...l, p2: np } : l)) }
        else { const npLo = mk(P(lo)), npHi = mk(P(hi)); const op2 = tg.p2; lines = lines.map((l) => (l.id === tg.id ? { ...l, p2: npLo } : l)); lines.push({ id: nid('l'), p1: npHi, p2: op2, construction: tg.construction }) }
        const usedPts = new Set<string>(); lines.forEach((l) => { usedPts.add(l.p1); usedPts.add(l.p2) }); circles.forEach((c) => usedPts.add(c.c))
        points = points.filter((p) => usedPts.has(p.id))
        const alive = new Set([...points.map((p) => p.id), ...lines.map((l) => l.id), ...circles.map((c) => c.id)])
        const constraints = st.constraints.filter((c) => referenced(c).every((r) => alive.has(r)))
        return { lines, points, circles, constraints, selection: [], status: '已修剪' }
      })
      void get().solve()
      return
    }

    if (s.tool === 'extend') {
      // Fusion Extend: click near one end of a line → lengthen that end along the line's direction
      // until it meets the nearest other line/circle ahead. The far end stays put.
      let target = hit && hit.kind === 'line' ? s.lines.find((l) => l.id === hit.id) || null : null
      if (!target) { let bestD = Infinity; for (const l of s.lines) { const a = pt(s, l.p1), b = pt(s, l.p2); const t = Math.max(0, Math.min(1, segT(a, b, x, y))); const d = Math.hypot(a.x + t * (b.x - a.x) - x, a.y + t * (b.y - a.y) - y); if (d < bestD) { bestD = d; target = l } } if (bestD > 14) target = null }
      if (!target) { set({ status: '延伸：點選要延長嘅線段（靠近想延長嘅一端）' }); return }
      const tg = target, a = pt(s, tg.p1), b = pt(s, tg.p2)
      const extendP2 = Math.hypot(x - b.x, y - b.y) <= Math.hypot(x - a.x, y - a.y) // extend the end nearer the cursor
      const ts: number[] = []
      for (const l of s.lines) { if (l.id === tg.id) continue; const t = lineLineTInf(a, b, pt(s, l.p1), pt(s, l.p2)); if (t != null) ts.push(t) }
      for (const cc of s.circles) { const cp = pt(s, cc.c); for (const t of lineCircleTInf(a, b, cp.x, cp.y, cc.r)) ts.push(t) }
      const cand = (extendP2 ? ts.filter((t) => t > 1 + 1e-4).sort((p, q) => p - q) : ts.filter((t) => t < -1e-4).sort((p, q) => q - p))
      if (!cand.length) { set({ status: '延伸：該端前方無可延伸到嘅線 / 圓' }); return }
      const nt = cand[0]
      const nx = a.x + nt * (b.x - a.x), ny = a.y + nt * (b.y - a.y)
      const epId = extendP2 ? tg.p2 : tg.p1
      set((st) => ({ points: st.points.map((p) => (p.id === epId ? { ...p, x: nx, y: ny } : p)), selection: [], status: '已延伸到最近交點' }))
      void get().solve()
      return
    }

    if (s.tool === 'break') {
      // Fusion Break: click a line at an interior point → split it there into two segments (both kept).
      let target = hit && hit.kind === 'line' ? s.lines.find((l) => l.id === hit.id) || null : null
      if (!target) { let bestD = Infinity; for (const l of s.lines) { const a = pt(s, l.p1), b = pt(s, l.p2); const t = Math.max(0, Math.min(1, segT(a, b, x, y))); const d = Math.hypot(a.x + t * (b.x - a.x) - x, a.y + t * (b.y - a.y) - y); if (d < bestD) { bestD = d; target = l } } if (bestD > 12) target = null }
      if (!target) { set({ status: '打斷：點線段上想分割嘅位置' }); return }
      const tg = target, a = pt(s, tg.p1), b = pt(s, tg.p2)
      const t = segT(a, b, x, y)
      if (t <= 1e-3 || t >= 1 - 1e-3) { set({ status: '打斷：分割點要喺線段中間（唔可以喺端點）' }); return }
      const bx = a.x + t * (b.x - a.x), by = a.y + t * (b.y - a.y)
      set((st) => {
        const np = nid('p')
        const points = [...st.points, { id: np, x: bx, y: by, fixed: false }]
        const op2 = tg.p2
        const lines = st.lines.map((l) => (l.id === tg.id ? { ...l, p2: np } : l))
        lines.push({ id: nid('l'), p1: np, p2: op2, construction: tg.construction })
        return { points, lines, selection: [], status: '已打斷（一條 → 兩段）' }
      })
      void get().solve()
      return
    }

    if (s.tool === 'line') {
      // reuse an existing point if we clicked on one (implicit coincidence by shared point)
      const startId = hit?.kind === 'point' ? hit.id : nid('p')
      if (hit?.kind !== 'point') set((st) => ({ points: [...st.points, { id: startId, x, y, fixed: false }] }))
      if (s.draft.length === 0) { set({ draft: [startId] }); return }
      const prev = s.draft[s.draft.length - 1]
      const l: CLine = { id: nid('l'), p1: prev, p2: startId }
      // auto-infer horizontal/vertical when the segment is drawn close to an axis
      const pp = get().points.find((p) => p.id === prev)!
      const np = get().points.find((p) => p.id === startId)!
      const deg = Math.abs((Math.atan2(np.y - pp.y, np.x - pp.x) * 180) / Math.PI)
      const extra: Constraint[] = []
      if (deg < 4 || deg > 176) extra.push({ id: nid('k'), type: 'horizontal_l', l_id: l.id } as Constraint)
      else if (Math.abs(deg - 90) < 4) extra.push({ id: nid('k'), type: 'vertical_l', l_id: l.id } as Constraint)
      set((st) => ({ lines: [...st.lines, l], constraints: [...st.constraints, ...extra], draft: [...st.draft, startId] }))
      void get().solve()
      return
    }

    if (s.tool === 'rect') {
      if (s.draft.length === 0) {
        const a = nid('p'); set((st) => ({ points: [...st.points, { id: a, x, y, fixed: false }], draft: [a] })); return
      }
      const a = pt(s, s.draft[0])
      const ax = a.x, ay = a.y
      const p1 = s.draft[0]
      const p2 = nid('p'), p3 = nid('p'), p4 = nid('p')
      const l1 = nid('l'), l2 = nid('l'), l3 = nid('l'), l4 = nid('l')
      set((st) => ({
        points: [...st.points, { id: p2, x, y: ay, fixed: false }, { id: p3, x, y, fixed: false }, { id: p4, x: ax, y, fixed: false }],
        lines: [...st.lines, { id: l1, p1, p2 }, { id: l2, p1: p2, p2: p3 }, { id: l3, p1: p3, p2: p4 }, { id: l4, p1: p4, p2: p1 }],
        constraints: [...st.constraints,
          { id: nid('k'), type: 'horizontal_l', l_id: l1 } as Constraint,
          { id: nid('k'), type: 'vertical_l', l_id: l2 } as Constraint,
          { id: nid('k'), type: 'horizontal_l', l_id: l3 } as Constraint,
          { id: nid('k'), type: 'vertical_l', l_id: l4 } as Constraint,
        ],
        draft: [],
      }))
      void get().solve()
      return
    }

    if (s.tool === 'circle') {
      if (s.draft.length === 0) {
        const c = nid('p'); set((st) => ({ points: [...st.points, { id: c, x, y, fixed: false }], draft: [c] })); return
      }
      const c = pt(s, s.draft[0])
      const r = Math.hypot(x - c.x, y - c.y) || 10
      set((st) => ({ circles: [...st.circles, { id: nid('c'), c: st.draft[0], r }], draft: [] }))
      void get().solve()
      return
    }

    if (s.tool === 'polygon') {
      // Fusion Polygon: 1st click = centre, 2nd click = a vertex (sets radius + orientation). Regular N-gon.
      if (s.draft.length === 0) { const c = nid('p'); set((st) => ({ points: [...st.points, { id: c, x, y, fixed: false }], draft: [c] })); return }
      const cId = s.draft[0], c = pt(s, cId)
      const n = Math.min(120, Math.max(3, Math.round(s.polySides || 6)))   // cap 120 (huge N would freeze)
      const r = Math.hypot(x - c.x, y - c.y) || 10
      const a0 = Math.atan2(y - c.y, x - c.x)
      set((st) => {
        const points = st.points.filter((p) => p.id !== cId)   // centre is just a placement ref, not part of the profile
        const vids: string[] = []
        for (let i = 0; i < n; i++) { const a = a0 + (i * 2 * Math.PI) / n; const id = nid('p'); points.push({ id, x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a), fixed: false }); vids.push(id) }
        const lines = [...st.lines]
        for (let i = 0; i < n; i++) lines.push({ id: nid('l'), p1: vids[i], p2: vids[(i + 1) % n] })
        return { points, lines, draft: [], status: `已畫 ${n} 邊形（${n} 條邊）` }
      })
      void get().solve()
      return
    }
  },

  onMove: (x, y) => { if (get().draft.length || get().dragging) set({ preview: [x, y] }) },

  toggleSelect: (sel) => set((s) => {
    const i = s.selection.findIndex((x) => x.kind === sel.kind && x.id === sel.id)
    if (i >= 0) { const sl = [...s.selection]; sl.splice(i, 1); return { selection: sl } }
    return { selection: [...s.selection, sel] }
  }),
  clearSelection: () => set({ selection: [] }),

  apply: (k) => {
    const s = get()
    const sel = s.selection
    const pts = sel.filter((x) => x.kind === 'point').map((x) => x.id)
    const lns = sel.filter((x) => x.kind === 'line').map((x) => x.id)
    const cir = sel.filter((x) => x.kind === 'circle').map((x) => x.id)
    const add = (c: Constraint) => { get().pushUndo(); set((st) => ({ constraints: [...st.constraints, c], selection: [] })); void get().solve() }
    const id = () => nid('k')

    if (k === 'fix' && pts.length) { get().pushUndo(); set((st) => ({ points: st.points.map((p) => (pts.includes(p.id) ? { ...p, fixed: !p.fixed } : p)), selection: [] })); void get().solve(); return }
    if (k === 'coincident' && pts.length === 2) return add({ id: id(), type: 'p2p_coincident', p1_id: pts[0], p2_id: pts[1] } as Constraint)
    if (k === 'horizontal' && lns.length === 1) return add({ id: id(), type: 'horizontal_l', l_id: lns[0] } as Constraint)
    if (k === 'horizontal' && pts.length === 2) return add({ id: id(), type: 'horizontal_pp', p1_id: pts[0], p2_id: pts[1] } as Constraint)
    if (k === 'vertical' && lns.length === 1) return add({ id: id(), type: 'vertical_l', l_id: lns[0] } as Constraint)
    if (k === 'vertical' && pts.length === 2) return add({ id: id(), type: 'vertical_pp', p1_id: pts[0], p2_id: pts[1] } as Constraint)
    if (k === 'parallel' && lns.length === 2) return add({ id: id(), type: 'parallel', l1_id: lns[0], l2_id: lns[1] } as Constraint)
    // Collinear: two lines on the same infinite line = parallel + one endpoint of l2 lies on l1. (planegcs has
    // no direct collinear; this pair is equivalent.) Add both, then solve once.
    if (k === 'collinear' && lns.length === 2) { const l2 = s.lines.find((x) => x.id === lns[1])!; get().pushUndo(); set((st) => ({ constraints: [...st.constraints, { id: id(), type: 'parallel', l1_id: lns[0], l2_id: lns[1] } as Constraint, { id: id(), type: 'point_on_line_pl', p_id: l2.p1, l_id: lns[0] } as Constraint], selection: [] })); void get().solve(); return }
    if (k === 'perpendicular' && lns.length === 2) return add({ id: id(), type: 'perpendicular_ll', l1_id: lns[0], l2_id: lns[1] } as Constraint)
    if (k === 'equal' && lns.length === 2) return add({ id: id(), type: 'equal_length', l1_id: lns[0], l2_id: lns[1] } as Constraint)
    if (k === 'equal' && cir.length === 2) return add({ id: id(), type: 'equal_radius_cc', c1_id: cir[0], c2_id: cir[1] } as Constraint)
    if (k === 'point_on_line' && pts.length === 1 && lns.length === 1) return add({ id: id(), type: 'point_on_line_pl', p_id: pts[0], l_id: lns[0] } as Constraint)
    if (k === 'tangent' && lns.length === 1 && cir.length === 1) return add({ id: id(), type: 'tangent_lc', l_id: lns[0], c_id: cir[0] } as Constraint)
    if (k === 'tangent' && cir.length === 2) return add({ id: id(), type: 'tangent_cc', c1_id: cir[0], c2_id: cir[1] } as Constraint)
    if (k === 'concentric' && cir.length === 2) { const a = s.circles.find((x) => x.id === cir[0])!, b = s.circles.find((x) => x.id === cir[1])!; return add({ id: id(), type: 'p2p_coincident', p1_id: a.c, p2_id: b.c } as Constraint) }
    if (k === 'symmetric' && pts.length === 2 && lns.length === 1) return add({ id: id(), type: 'p2p_symmetric_ppl', p1_id: pts[0], p2_id: pts[1], l_id: lns[0] } as Constraint)
    // Midpoint: point P sits at the centre of line L ⇔ L's endpoints are symmetric about P (p2p_symmetric_ppp).
    if (k === 'midpoint' && pts.length === 1 && lns.length === 1) { const l = s.lines.find((x) => x.id === lns[0])!; return add({ id: id(), type: 'p2p_symmetric_ppp', p1_id: l.p1, p2_id: l.p2, p_id: pts[0] } as Constraint) }
    if (k === 'distance' && pts.length === 2) return add({ id: id(), type: 'p2p_distance', p1_id: pts[0], p2_id: pts[1], distance: Math.round(Math.hypot(pt(s, pts[1]).x - pt(s, pts[0]).x, pt(s, pts[1]).y - pt(s, pts[0]).y)) || 10 } as Constraint)
    if (k === 'distance' && lns.length === 1) { const l = s.lines.find((x) => x.id === lns[0])!; return add({ id: id(), type: 'p2p_distance', p1_id: l.p1, p2_id: l.p2, distance: Math.round(lineLen(s, l)) || 10 } as Constraint) }
    // Point-to-line perpendicular distance dimension (e.g. hole centre offset from an edge). |(B−A)×(P−A)| / |B−A|.
    if (k === 'pldist' && pts.length === 1 && lns.length === 1) { const l = s.lines.find((x) => x.id === lns[0])!; const A = pt(s, l.p1), B = pt(s, l.p2), P = pt(s, pts[0]); const len = Math.hypot(B.x - A.x, B.y - A.y); if (len < 1e-9) { set({ status: '點到線距離：該線退化為點,無法定義距離' }); return }; const d = Math.abs((B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x)) / len; return add({ id: id(), type: 'p2l_distance', p_id: pts[0], l_id: lns[0], distance: Math.round(d) || 10 } as Constraint) }
    // Lock a point's X or Y coordinate to a value (Fusion 水平/竖直 定位尺寸；可双击改 / 绑参数).
    if (k === 'coordx' && pts.length === 1) return add({ id: id(), type: 'coordinate_x', p_id: pts[0], x: Math.round(pt(s, pts[0]).x) } as Constraint)
    if (k === 'coordy' && pts.length === 1) return add({ id: id(), type: 'coordinate_y', p_id: pts[0], y: Math.round(pt(s, pts[0]).y) } as Constraint)
    // Centre-to-centre distance between two circles (hole spacing). Use p2p_distance on the circles' CENTRE
    // points — robust & exact (planegcs c2cdistance is edge-gap with free radii, unreliable as a centre dim).
    if (k === 'cdist' && cir.length === 2) { const a = s.circles.find((x) => x.id === cir[0])!, b = s.circles.find((x) => x.id === cir[1])!; const ca = pt(s, a.c), cb = pt(s, b.c); return add({ id: id(), type: 'p2p_distance', p1_id: a.c, p2_id: b.c, distance: Math.round(Math.hypot(cb.x - ca.x, cb.y - ca.y)) || 20 } as Constraint) }
    if (k === 'radius' && cir.length === 1) { const c = s.circles.find((x) => x.id === cir[0])!; return add({ id: id(), type: 'circle_radius', c_id: c.id, radius: Math.round(c.r) || 10 } as Constraint) }
    if (k === 'angle' && lns.length === 2) { const a = Math.round(((lineAng(s, s.lines.find((x) => x.id === lns[1])!) - lineAng(s, s.lines.find((x) => x.id === lns[0])!)) * 180 / Math.PI + 360) % 360); return add({ id: id(), type: 'l2l_angle_ll', l1_id: lns[0], l2_id: lns[1], angle: (a || 90) * Math.PI / 180 } as Constraint) }
    // Specific guidance per constraint so a non-coder knows exactly what to select (not just "wrong combo").
    const REQ: Partial<Record<ConstraintKind, string>> = {
      coincident: '選 2 個點', horizontal: '選 1 條線 或 2 個點', vertical: '選 1 條線 或 2 個點',
      parallel: '選 2 條線', perpendicular: '選 2 條線', equal: '選 2 條線 或 2 個圓',
      point_on_line: '選 1 個點 + 1 條線', tangent: '選 1 線 + 1 圓 或 2 個圓', concentric: '選 2 個圓',
      symmetric: '選 2 個點 + 1 條線（軸）', fix: '選 ≥1 個點', distance: '選 2 個點 或 1 條線',
      radius: '選 1 個圓', angle: '選 2 條線', midpoint: '選 1 個點 + 1 條線（點鎖到線中點）',
      pldist: '選 1 個點 + 1 條線（點到線垂直距離尺寸）',
      coordx: '選 1 個點（鎖定其 X 坐標，可雙擊改/綁參）', coordy: '選 1 個點（鎖定其 Y 坐標，可雙擊改/綁參）',
      cdist: '選 2 個圓（圓心到圓心距離尺寸，即孔距）', collinear: '選 2 條線（共線：在同一直線上）',
    }
    set({ status: `約束「${k}」：${REQ[k] || '選擇組合唔啱'}（而家 選咗 ${pts.length} 點 / ${lns.length} 線 / ${cir.length} 圓）` })
  },

  toggleConstruction: () => {
    const s = get()
    const lns = s.selection.filter((x) => x.kind === 'line').map((x) => x.id)
    if (!lns.length) { set({ status: '先選中線，再切換為構造線（參考用，虛線顯示，不計入輪廓）' }); return }
    get().pushUndo()
    set({ lines: s.lines.map((l) => (lns.includes(l.id) ? { ...l, construction: !l.construction } : l)), selection: [], status: '已切換構造線（虛線 = 參考幾何，不參與拉伸輪廓）' })
  },

  // Fusion Mirror: select the geometry to mirror, then select ONE line last as the mirror axis.
  mirrorSel: () => {
    const s = get()
    const selLines = s.selection.filter((x) => x.kind === 'line')
    if (selLines.length < 1) { set({ status: '鏡像：先選要鏡像嘅實體（線 / 圓），最後再選一條線做鏡像軸' }); return }
    const axis = s.lines.find((l) => l.id === selLines[selLines.length - 1].id)
    if (!axis) { set({ status: '鏡像：揾唔到鏡像軸線' }); return }
    const A = pt(s, axis.p1), B = pt(s, axis.p2)
    const reflect = (p: { x: number; y: number }) => {
      const dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy || 1
      const t = ((p.x - A.x) * dx + (p.y - A.y) * dy) / L2
      const fx = A.x + t * dx, fy = A.y + t * dy
      return { x: 2 * fx - p.x, y: 2 * fy - p.y }
    }
    const mLines = new Set(selLines.slice(0, -1).map((x) => x.id))            // every selected line except the axis
    const mCircles = new Set(s.selection.filter((x) => x.kind === 'circle').map((x) => x.id))
    if (!mLines.size && !mCircles.size) { set({ status: '鏡像：除咗軸線之外，仲要揀至少一條線 / 一個圓嚟鏡像' }); return }
    get().pushUndo()
    set((st) => {
      const points = [...st.points], lines = [...st.lines], circles = [...st.circles]
      const mk = (q: { x: number; y: number }) => { const id = nid('p'); points.push({ id, x: q.x, y: q.y, fixed: false }); return id }
      for (const l of st.lines) { if (!mLines.has(l.id)) continue; lines.push({ id: nid('l'), p1: mk(reflect(pt(st, l.p1))), p2: mk(reflect(pt(st, l.p2))), construction: l.construction }) }
      for (const c of st.circles) { if (!mCircles.has(c.id)) continue; circles.push({ id: nid('c'), c: mk(reflect(pt(st, c.c))), r: c.r }) }
      return { points, lines, circles, selection: [], status: `已鏡像 ${mLines.size + mCircles.size} 個實體（跨所選軸線）` }
    })
    void get().solve()
  },

  // Fusion sketch Chamfer: pick a corner point shared by two lines → bevel it with a straight segment
  // (pure-line geometry; no arc needed, unlike fillet). Shortens both lines by d and joins them.
  chamferCorner: (d) => {
    const s = get()
    const selP = s.selection.filter((x) => x.kind === 'point')
    if (selP.length !== 1) { set({ status: '倒角：先選一個角點（兩條線嘅交點）' }); return }
    const cId = selP[0].id
    if (s.circles.some((c) => c.c === cId)) { set({ status: '倒角：該點係圓心，唔倒角' }); return }
    const usingLines = s.lines.filter((l) => l.p1 === cId || l.p2 === cId)
    if (usingLines.length !== 2) { set({ status: '倒角：該點要正好連住兩條線（一個角）' }); return }
    const lA = usingLines[0], lB = usingLines[1], C = pt(s, cId)
    const A = pt(s, lA.p1 === cId ? lA.p2 : lA.p1), B = pt(s, lB.p1 === cId ? lB.p2 : lB.p1)
    const lenA = Math.hypot(A.x - C.x, A.y - C.y), lenB = Math.hypot(B.x - C.x, B.y - C.y)
    const dd = Math.min(d, lenA * 0.99, lenB * 0.99)
    if (!(dd > 0) || lenA < 1e-6 || lenB < 1e-6) { set({ status: '倒角：距離要 > 0 且短過兩條邊' }); return }
    const uAx = (A.x - C.x) / lenA, uAy = (A.y - C.y) / lenA, uBx = (B.x - C.x) / lenB, uBy = (B.y - C.y) / lenB
    get().pushUndo()
    set((st) => {
      const naId = nid('p'), nbId = nid('p')
      const points = [...st.points, { id: naId, x: C.x + uAx * dd, y: C.y + uAy * dd, fixed: false }, { id: nbId, x: C.x + uBx * dd, y: C.y + uBy * dd, fixed: false }].filter((p) => p.id !== cId)
      const lines = st.lines.map((l) =>
        l.id === lA.id ? { ...l, p1: l.p1 === cId ? naId : l.p1, p2: l.p2 === cId ? naId : l.p2 }
          : l.id === lB.id ? { ...l, p1: l.p1 === cId ? nbId : l.p1, p2: l.p2 === cId ? nbId : l.p2 } : l)
      lines.push({ id: nid('l'), p1: naId, p2: nbId })
      const alive = new Set([...points.map((p) => p.id), ...lines.map((l) => l.id), ...st.circles.map((c) => c.id)])
      const constraints = st.constraints.filter((c) => referenced(c).every((r) => alive.has(r)))
      return { points, lines, constraints, selection: [], status: `已倒角 C${dd.toFixed(1)}` }
    })
    void get().solve()
  },

  // Fusion Rectangular Pattern (in the sketch CREATE group): copy selected geometry into an nx×ny grid.
  patternRect: (nx, dx, ny, dy) => {
    const s = get()
    const selL = s.selection.filter((x) => x.kind === 'line').map((x) => x.id)
    const selC = s.selection.filter((x) => x.kind === 'circle').map((x) => x.id)
    if (!selL.length && !selC.length) { set({ status: '矩形陣列：先選要陣列嘅實體（線 / 圓），再設數量' }); return }
    const cx = Math.max(1, Math.round(nx)), cy = Math.max(1, Math.round(ny))
    if (cx * cy < 2) { set({ status: '矩形陣列：總數至少 2（列×行 ≥ 2）' }); return }
    if (cx * cy > 400) { set({ status: `陣列總數 ${cx}×${cy} 太多（上限 400）` }); return }
    get().pushUndo()
    set((st) => {
      const points = [...st.points], lines = [...st.lines], circles = [...st.circles]
      const mk = (qx: number, qy: number) => { const id = nid('p'); points.push({ id, x: qx, y: qy, fixed: false }); return id }
      for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) {
        if (i === 0 && j === 0) continue // (0,0) is the original
        const ox = i * dx, oy = j * dy
        for (const id of selL) { const l = st.lines.find((x) => x.id === id); if (!l) continue; const a = pt(st, l.p1), b = pt(st, l.p2); lines.push({ id: nid('l'), p1: mk(a.x + ox, a.y + oy), p2: mk(b.x + ox, b.y + oy), construction: l.construction }) }
        for (const id of selC) { const cc = st.circles.find((x) => x.id === id); if (!cc) continue; const cp = pt(st, cc.c); circles.push({ id: nid('c'), c: mk(cp.x + ox, cp.y + oy), r: cc.r }) }
      }
      return { points, lines, circles, selection: [], status: `已矩形陣列 ${cx}×${cy}（共 ${cx * cy} 份）` }
    })
    void get().solve()
  },

  // Fusion Circular Pattern: copy selected geometry around a centre (a selected point, else the origin).
  patternCirc: (count, angleTotal) => {
    const s = get()
    const selL = s.selection.filter((x) => x.kind === 'line').map((x) => x.id)
    const selC = s.selection.filter((x) => x.kind === 'circle').map((x) => x.id)
    if (!selL.length && !selC.length) { set({ status: '環形陣列：先選要陣列嘅實體（線 / 圓），可加選一個點做中心（否則繞原點），再設數量' }); return }
    const n = Math.max(2, Math.min(400, Math.round(count)))
    const selPt = s.selection.find((x) => x.kind === 'point')
    const C = selPt ? pt(s, selPt.id) : { x: 0, y: 0 }
    const full = Math.abs(angleTotal) >= 359.9
    const stepDeg = full ? 360 / n : angleTotal / (n - 1)
    get().pushUndo()
    set((st) => {
      const points = [...st.points], lines = [...st.lines], circles = [...st.circles]
      const mk = (qx: number, qy: number) => { const id = nid('p'); points.push({ id, x: qx, y: qy, fixed: false }); return id }
      const rot = (px: number, py: number, th: number): [number, number] => { const dx = px - C.x, dy = py - C.y, c = Math.cos(th), sn = Math.sin(th); return [C.x + dx * c - dy * sn, C.y + dx * sn + dy * c] }
      for (let k = 1; k < n; k++) {
        const th = (stepDeg * k * Math.PI) / 180
        for (const id of selL) { const l = st.lines.find((x) => x.id === id); if (!l) continue; const a = pt(st, l.p1), b = pt(st, l.p2); const [ax, ay] = rot(a.x, a.y, th), [bx, by] = rot(b.x, b.y, th); lines.push({ id: nid('l'), p1: mk(ax, ay), p2: mk(bx, by), construction: l.construction }) }
        for (const id of selC) { const cc = st.circles.find((x) => x.id === id); if (!cc) continue; const cp = pt(st, cc.c); const [cxr, cyr] = rot(cp.x, cp.y, th); circles.push({ id: nid('c'), c: mk(cxr, cyr), r: cc.r }) }
      }
      return { points, lines, circles, selection: [], status: `已環形陣列 ${n} 個（${full ? '整圈' : angleTotal + '°'}${selPt ? '，繞所選點' : '，繞原點'}）` }
    })
    void get().solve()
  },

  // Rotate selected geometry (lines / circles) IN PLACE by angleDeg around a centre (a selected point, else
  // the origin). Moves the points of the selected entities; the centre point itself stays put. Under-defined
  // geometry rotates freely; constrained geometry will be re-snapped by the solver (constraints win).
  rotateSel: (angleDeg) => {
    const s = get()
    const selL = s.selection.filter((x) => x.kind === 'line').map((x) => x.id)
    const selC = s.selection.filter((x) => x.kind === 'circle').map((x) => x.id)
    if (!selL.length && !selC.length) { set({ status: '旋轉：先選要轉嘅實體（線 / 圓），可加選一個點做旋轉中心（否則繞原點）' }); return }
    const selPt = s.selection.find((x) => x.kind === 'point')
    const C = selPt ? pt(s, selPt.id) : { x: 0, y: 0 }
    const th = (angleDeg * Math.PI) / 180, cs = Math.cos(th), sn = Math.sin(th)
    const moveIds = new Set<string>()
    for (const id of selL) { const l = s.lines.find((x) => x.id === id); if (l) { moveIds.add(l.p1); moveIds.add(l.p2) } }
    for (const id of selC) { const c = s.circles.find((x) => x.id === id); if (c) moveIds.add(c.c) }
    if (selPt) moveIds.delete(selPt.id)   // the pivot point stays
    moveIds.delete('ORIGIN')              // never move the origin datum
    get().pushUndo()
    set((st) => ({
      points: st.points.map((p) => { if (!moveIds.has(p.id)) return p; const dx = p.x - C.x, dy = p.y - C.y; return { ...p, x: C.x + dx * cs - dy * sn, y: C.y + dx * sn + dy * cs } }),
      selection: [], status: `已旋轉 ${angleDeg}°（${selPt ? '繞所選點' : '繞原點'}）`,
    }))
    void get().solve()
  },
  // Project the existing 3D body onto this (XY) sketch as REFERENCE geometry: the body's outline rectangle as
  // construction lines + every Z-axis through-hole's centre as a fixed reference point. You can then dimension /
  // constrain NEW sketch geometry to them — i.e. align new features to existing 3D edges & holes ("relate to 3D
  // object"). Honest narrow version: bbox outline + Z-hole centres (not a full silhouette of arbitrary edges).
  projectBody: () => {
    const body = useApp.getState().bodyMesh
    if (!body || !body.vertices.length) { set({ status: '冇實體可投影（先返 3D 起一個實體）' }); return }
    const v = body.vertices
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9
    for (let i = 0; i < v.length; i += 3) { const x = v[i], y = v[i + 1]; if (x < mnx) mnx = x; if (x > mxx) mxx = x; if (y < mny) mny = y; if (y > mxy) mxy = y }
    if (!(mxx - mnx > 1e-3 && mxy - mny > 1e-3)) { set({ status: '實體投影到 XY 平面太細（可能垂直於此平面）' }); return }
    const cyls = detectAllCylinders(body).filter((c) => c.concave && Math.abs(c.axis[2]) > 0.9 && c.r >= 0.5)
    get().pushUndo()
    set((st) => {
      const points = [...st.points], lines = [...st.lines]
      const mk = (x: number, y: number) => { const id = nid('p'); points.push({ id, x, y, fixed: true }); return id }
      const c0 = mk(mnx, mny), c1 = mk(mxx, mny), c2 = mk(mxx, mxy), c3 = mk(mnx, mxy)
      lines.push({ id: nid('l'), p1: c0, p2: c1, construction: true }, { id: nid('l'), p1: c1, p2: c2, construction: true }, { id: nid('l'), p1: c2, p2: c3, construction: true }, { id: nid('l'), p1: c3, p2: c0, construction: true })
      for (const cy of cyls) mk(cy.p[0], cy.p[1])   // hole centres → fixed reference points
      return { points, lines, selection: [], status: `已投影實體：外形矩形（參考線）+ ${cyls.length} 個孔中心（參考點）— 可對佢哋打尺寸/約束新幾何（相對 3D 定位）` }
    })
    void get().solve()
  },
  editDimension: async (cid, value) => {
    set((s) => ({
      constraints: s.constraints.map((c) => {
        if (c.id !== cid) return c
        if (c.type === 'p2p_distance' || c.type === 'p2l_distance') return { ...c, distance: value }
        if (c.type === 'circle_radius') return { ...c, radius: value }
        if (c.type === 'l2l_angle_ll') return { ...c, angle: (value * Math.PI) / 180 }
        if (c.type === 'coordinate_x') return { ...c, x: value }
        if (c.type === 'coordinate_y') return { ...c, y: value }
        return c
      }),
    }))
    await get().solve()
  },

  removeConstraint: async (cid) => { get().pushUndo(); set((s) => { const d = { ...s.dimRefs }; delete d[cid]; return { constraints: s.constraints.filter((c) => c.id !== cid), dimRefs: d } }); await get().solve() },
  setDimRef: async (cid, name) => {
    get().pushUndo()   // 绑定/解绑参数係离散动作（<select> onChange）— 快照一次即可 Ctrl+Z 还原
    set((s) => { const d = { ...s.dimRefs }; if (name) d[cid] = name; else delete d[cid]; return { dimRefs: d } })
    await get().solve()
  },

  deleteSelected: async () => {
    const sel = get().selection
    if (!sel.length) return
    get().pushUndo()
    const pids = new Set(sel.filter((x) => x.kind === 'point').map((x) => x.id))
    pids.delete('ORIGIN')   // the origin datum is protected — never deletable
    const lids = new Set(sel.filter((x) => x.kind === 'line').map((x) => x.id))
    const cids = new Set(sel.filter((x) => x.kind === 'circle').map((x) => x.id))
    set((s) => {
      const lines = s.lines.filter((l) => !lids.has(l.id) && !pids.has(l.p1) && !pids.has(l.p2))
      const circles = s.circles.filter((c) => !cids.has(c.id) && !pids.has(c.c))
      const usedPts = new Set<string>()
      lines.forEach((l) => { usedPts.add(l.p1); usedPts.add(l.p2) })
      circles.forEach((c) => usedPts.add(c.c))
      // keep used points + the ORIGIN datum (a lone reference point that no line/circle uses).
      const points = s.points.filter((p) => (p.id === 'ORIGIN' || usedPts.has(p.id)) && !pids.has(p.id))
      const alive = new Set([...points.map((p) => p.id), ...lines.map((l) => l.id), ...circles.map((c) => c.id)])
      const constraints = s.constraints.filter((c) => referenced(c).every((r) => alive.has(r)))
      return { lines, circles, points, constraints, selection: [] }
    })
    await get().solve()
  },

  dragStart: (id) => set({ dragging: id }),
  dragMove: async (x, y) => {
    const id = get().dragging
    if (!id) return
    await get().solve([
      { id: 'drag_x', type: 'coordinate_x', p_id: id, x, temporary: true } as Constraint,
      { id: 'drag_y', type: 'coordinate_y', p_id: id, y, temporary: true } as Constraint,
    ])
  },
  dragEnd: async () => { set({ dragging: null, preview: null }); await get().solve() },

  solve: async (extra = []) => {
    const s = get()
    if (!s.points.length) return
    // Parametric dimensions: override a dim constraint's value with its linked user-parameter.
    const params = useApp.getState().params
    const prims: (SketchPrimitive)[] = [...buildSketchPrims(s, params), ...extra]
    try {
      const res = await solveSketch(prims)
      const pmap = new Map(res.geometry.filter((g) => g.type === 'point').map((g) => [g.id, g as { x: number; y: number }]))
      const cmap = new Map(res.geometry.filter((g) => g.type === 'circle').map((g) => [g.id, g as { radius: number }]))
      // 过约束/退化几何时求解器可能返回 NaN/Infinity → 直接写入会污染整张草图。校验有限性,非有限即抛(下面 catch 出诚实「求解失败」而非静默崩坏)。
      for (const [, pt] of pmap) if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) throw new Error('求解器返回非有限坐標')
      for (const [, cc] of cmap) if (!Number.isFinite(cc.radius)) throw new Error('求解器返回非有限半徑')
      set((st) => ({
        points: st.points.map((p) => (pmap.has(p.id) ? { ...p, x: pmap.get(p.id)!.x, y: pmap.get(p.id)!.y } : p)),
        circles: st.circles.map((c) => (cmap.has(c.id) ? { ...c, r: cmap.get(c.id)!.radius } : c)),
        conflicts: res.conflicts,
        dof: res.dof,
        status: res.conflicts.length ? `⚠ 約束衝突 (${res.conflicts.length}) — 過約束 / 矛盾；撤銷剛加嘅(Ctrl+Z) 或喺下面尺寸列表 ✕ 刪一個` : res.dof === 0 ? '✓ 完全定義（黑）' : res.dof > 0 ? `欠定義 ${res.dof} 自由度（藍）— 加尺寸/約束` : '✓ 已求解',
      }))
      // GM-F4 · solve 落定之后先跑逐点 DOF 诊断（debounce + 拓扑 cache + 拖曳中跳过）。
      // 唔喺 solve 主链等佢 → 对拖曳/求解交互零延迟；探针 async 算好先套用上色。
      scheduleDofDiag()
    } catch (e) {
      console.error('[csketch] solve failed', e)
      set({ status: '求解失敗：' + String(e) })
    }
  },

  finishProfile: () => {
    const s = get()
    if (s.circles.length === 1 && s.lines.length === 0) {
      const c = s.circles[0]
      return { type: 'circle', c: [pt(s, c.c).x, pt(s, c.c).y], r: c.r }
    }
    // order the line endpoints into a loop — construction lines are reference-only, excluded.
    const lines = s.lines.filter((l) => !l.construction)
    if (lines.length >= 3) {
      const order: [number, number][] = []
      const seen = new Set<string>()
      let cur = lines[0].p1
      for (let i = 0; i < lines.length; i++) {
        const p = pt(s, cur)
        order.push([p.x, p.y])
        seen.add(cur)
        const nextLine = lines.find((l) => (l.p1 === cur && !seen.has(l.p2)) || (l.p2 === cur && !seen.has(l.p1)))
        if (!nextLine) break
        cur = nextLine.p1 === cur ? nextLine.p2 : nextLine.p1
      }
      if (order.length >= 3) return { type: 'poly', pts: order }
    }
    return null
  },

  // Like finishProfile but returns EVERY disconnected loop + every circle, so mirror / pattern
  // (which create multiple separate contours) all get extruded — not just the first loop.
  finishProfiles: () => {
    const s = get()
    const out: ({ type: 'poly'; pts: [number, number][] } | { type: 'circle'; c: [number, number]; r: number })[] = []
    for (const c of s.circles) out.push({ type: 'circle', c: [pt(s, c.c).x, pt(s, c.c).y], r: c.r })
    const lines = s.lines.filter((l) => !l.construction)
    const used = new Set<string>()
    for (const seed of lines) {
      if (used.has(seed.id)) continue
      const order: [number, number][] = []
      const start = seed.p1
      let cur = start, guard = 0, closed = false
      while (guard++ < lines.length + 2) {
        const p = pt(s, cur); order.push([p.x, p.y])
        const next = lines.find((l) => !used.has(l.id) && (l.p1 === cur || l.p2 === cur))
        if (!next) break
        used.add(next.id)
        cur = next.p1 === cur ? next.p2 : next.p1
        if (cur === start) { closed = true; break } // returned to start → genuinely closed loop
      }
      // Only a CLOSED loop is a valid profile — an open chain (dead-ends without returning to start)
      // would otherwise extrude as a bogus polygon. Open chains are silently skipped.
      if (closed && order.length >= 3) out.push({ type: 'poly', pts: order })
    }
    return out
  },
}))

if (typeof import.meta.env !== 'undefined' && import.meta.env.DEV) (window as unknown as { useCSketch: typeof useCSketch }).useCSketch = useCSketch

// ── GM-F4 · 逐点 DOF 诊断调度 ──────────────────────────────────────────────
// buildSketchPrims：把 store 几何 + 约束（连参数化尺寸覆盖）砌成 planegcs primitives。
// solve() 同 diagnoseSketchDof 共用同一份（后者唔带拖曳临时约束）。
type SketchGeomState = Pick<CS, 'points' | 'lines' | 'circles' | 'constraints' | 'dimRefs'>
function buildSketchPrims(s: SketchGeomState, params: { name: string; value: number }[]): SketchPrimitive[] {
  const cons = s.constraints.map((c) => {
    const ref = s.dimRefs[c.id]; if (!ref) return c
    const p = params.find((x) => x.name === ref); if (!p) return c
    if (c.type === 'p2p_distance' || c.type === 'p2l_distance') return { ...c, distance: p.value }
    if (c.type === 'circle_radius') return { ...c, radius: p.value }
    if (c.type === 'l2l_angle_ll') return { ...c, angle: (p.value * Math.PI) / 180 }
    if (c.type === 'coordinate_x') return { ...c, x: p.value }
    if (c.type === 'coordinate_y') return { ...c, y: p.value }
    return c
  })
  return [
    ...s.points.map((p) => ({ id: p.id, type: 'point', x: p.x, y: p.y, fixed: p.fixed } as SketchPrimitive)),
    ...s.lines.map((l) => ({ id: l.id, type: 'line', p1_id: l.p1, p2_id: l.p2 } as SketchPrimitive)),
    ...s.circles.map((c) => ({ id: c.id, type: 'circle', c_id: c.c, radius: c.r } as SketchPrimitive)),
    ...cons,
  ]
}

// 拓扑签名：只反映会改变「边个自由度」嘅嘢（点 id+固定、线端点、圆心、约束 id+类型+引用）。
// 唔含数值 → 双击改尺寸(40→20)唔会触发重探；含 fixed → 固定/解固定会重探。
let _diagTimer: ReturnType<typeof setTimeout> | null = null
let _diagToken = 0
let _diagSig = ''
function topoSig(s: SketchGeomState): string {
  const P = s.points.map((p) => p.id + (p.fixed ? '!' : '')).join(',')
  const L = s.lines.map((l) => l.id + ':' + l.p1 + '>' + l.p2).join(',')
  const C = s.circles.map((c) => c.id + ':' + c.c).join(',')
  const K = s.constraints.map((c) => c.id + ':' + c.type + ':' + referenced(c).join('+')).join(',')
  return P + '|' + L + '|' + C + '|' + K
}
// solve() 之后调度一次逐点诊断：拖曳中跳过、拓扑无变用 cache、debounce 90ms 合并连续操作、
// token/sig 双重防陈旧。零 solve 交互影响：诊断喺主链之外 async 跑,算好先 setState 套上色。
function scheduleDofDiag(): void {
  const s = useCSketch.getState()
  if (s.dragging) return
  const sig = topoSig(s)
  if (s.dofDiag && s.dofDiag.ok && _diagSig === sig) return  // 拓扑无变 → 沿用 cache
  const token = ++_diagToken
  if (_diagTimer) clearTimeout(_diagTimer)
  _diagTimer = setTimeout(() => {
    const cur = useCSketch.getState()
    if (cur.dragging) return
    const curSig = topoSig(cur)
    if (curSig !== sig) return                               // 延迟期间拓扑又变 → 由嗰次负责
    const params = useApp.getState().params
    void diagnoseSketchDof(buildSketchPrims(cur, params)).then((diag) => {
      if (token !== _diagToken) return                       // 已被更新嘅探针取代 → 丢弃
      if (diag.ok) { _diagSig = curSig; useCSketch.setState({ dofDiag: diag }) }
      else useCSketch.setState({ dofDiag: null })
    })
  }, 90)
}

type XY = { x: number; y: number }
// param t (along A→B) of the projection of (px,py); used to locate the click on a line.
function segT(a: XY, b: XY, px: number, py: number): number { const dx = b.x - a.x, dy = b.y - a.y; const L2 = dx * dx + dy * dy; return L2 < 1e-9 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / L2 }
// t along segment A1→A2 where it crosses segment B1→B2 (within both), else null.
function lineLineT(a1: XY, a2: XY, b1: XY, b2: XY): number | null {
  const rx = a2.x - a1.x, ry = a2.y - a1.y, sx = b2.x - b1.x, sy = b2.y - b1.y
  const denom = rx * sy - ry * sx; if (Math.abs(denom) < 1e-9) return null
  const qpx = b1.x - a1.x, qpy = b1.y - a1.y
  const t = (qpx * sy - qpy * sx) / denom, u = (qpx * ry - qpy * rx) / denom
  return (t > 1e-6 && t < 1 - 1e-6 && u > -1e-6 && u < 1 + 1e-6) ? t : null
}
// t values along segment A1→A2 where it crosses circle (cx,cy,r), within the segment.
function lineCircleT(a1: XY, a2: XY, cx: number, cy: number, r: number): number[] {
  const dx = a2.x - a1.x, dy = a2.y - a1.y, fx = a1.x - cx, fy = a1.y - cy
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r
  const disc = B * B - 4 * A * C; if (disc < 0 || A < 1e-9) return []
  const sd = Math.sqrt(disc)
  return [(-B - sd) / (2 * A), (-B + sd) / (2 * A)].filter((t) => t > 1e-6 && t < 1 - 1e-6)
}

// like lineLineT but the A line is treated as INFINITE (t unbounded); B stays a finite segment.
// Used by Extend: how far along A's direction until it meets segment B.
function lineLineTInf(a1: XY, a2: XY, b1: XY, b2: XY): number | null {
  const rx = a2.x - a1.x, ry = a2.y - a1.y, sx = b2.x - b1.x, sy = b2.y - b1.y
  const denom = rx * sy - ry * sx; if (Math.abs(denom) < 1e-9) return null
  const qpx = b1.x - a1.x, qpy = b1.y - a1.y
  const t = (qpx * sy - qpy * sx) / denom, u = (qpx * ry - qpy * rx) / denom
  return (u > -1e-6 && u < 1 + 1e-6) ? t : null
}
// like lineCircleT but A is INFINITE (t unbounded), returning both intersection params.
function lineCircleTInf(a1: XY, a2: XY, cx: number, cy: number, r: number): number[] {
  const dx = a2.x - a1.x, dy = a2.y - a1.y, fx = a1.x - cx, fy = a1.y - cy
  const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r
  const disc = B * B - 4 * A * C; if (disc < 0 || A < 1e-9) return []
  const sd = Math.sqrt(disc)
  return [(-B - sd) / (2 * A), (-B + sd) / (2 * A)]
}

function referenced(c: Constraint): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(c)) {
    if ((k.endsWith('_id') || k === 'p_id' || k === 'l_id' || k === 'c_id') && typeof v === 'string') out.push(v)
  }
  return out
}
