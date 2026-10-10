import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type React from 'react'
import { Euler, Quaternion, Vector3 } from 'three'
import { useApp } from '../store'
import { useDraggable } from './useDraggable'
import { JOINT_LABEL_TC, resolveJointOrigin, cadAxisToWorld, type JointType } from '../assembly/kinematics'
import { mechanismDOF } from '../assembly/linkage'
import { localizeAsmName } from '../assembly/names'   // BUG(E)：繁體模式顯示名
import { tStatus } from '../i18n'   // T779：DOF 闭环 Grübler 修正
import { NumInput } from './NumInput'   // UX3 #5：唔再用 type=number（滑鼠滾輪／誤撳上下箭頭會靜靜改咗限位）

// BUG(D-axis)：X/Y/Z = CAD 軸（Z 向上）→ three 世界向量（cadAxisToWorld）。
const AXES: { k: 'X' | 'Y' | 'Z'; v: [number, number, number] }[] = (['X', 'Y', 'Z'] as const).map((k) => ({ k, v: cadAxisToWorld(k) }))
const TYPES: JointType[] = ['revolute', 'slider', 'cylindrical', 'pinslot', 'ball', 'planar', 'screw', 'rigid']

// Fusion-like undo: one joint-slider gesture (pointer press → release, or a key-repeat burst) = one undo step.
// setJointValue stays snapshot-free while sliding; endJointDrive pushes the pre-gesture document if a value changed.
const beginDrive = () => useApp.getState().beginJointDrive()
const endDrive = () => { useApp.getState().endJointDrive() }
// Only keys that move a range slider open a gesture — Ctrl+Z / Ctrl+Y on a focused slider must not (it would
// record the undo itself as a new joint edit).
const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'])
export const isSliderDriveKey = (e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }) => SLIDER_KEYS.has(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey
const JOINT_DRIVE_GESTURE = {
  onPointerDown: beginDrive, onPointerUp: endDrive, onPointerCancel: endDrive, onLostPointerCapture: endDrive,
  onKeyDown: (e: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }) => { if (isSliderDriveKey(e)) beginDrive() }, onKeyUp: endDrive, onBlur: endDrive,
} as const

export default function JointsPanel() {
  const lang = useApp((s) => s.lang)
  const selectedJoint = useApp((s) => s.selectedJoint)   // ASM2 #7：瀏覽樹選取嘅關節
  const components = useApp((s) => s.components)
  const groundedId = useApp((s) => s.grounded)   // ASM2 P2：自由度唔計子件已固定嘅關節
  const joints = useApp((s) => s.joints)
  const addJoint = useApp((s) => s.addJoint)
  const addJointAtPose = useApp((s) => s.addJointAtPose)
  const setJointValue = useApp((s) => s.setJointValue)
  const removeJoint = useApp((s) => s.removeJoint)
  const startJointHolePick = useApp((s) => s.startJointHolePick)
  const holePicking = useApp((s) => s.jointHolePick)
  const componentCenter = useApp((s) => s.componentCenter)
  const motionLinks = useApp((s) => s.motionLinks)
  const addMotionLink = useApp((s) => s.addMotionLink)
  const removeMotionLink = useApp((s) => s.removeMotionLink)
  const runMotionStudy = useApp((s) => s.runMotionStudy)
  const motionStudy = useApp((s) => s.motionStudy)
  const clearMotionStudy = useApp((s) => s.clearMotionStudy)
  const jointPoses = useApp((s) => s.jointPoses)   // S172 捕捉位置
  const jointKeyframes = useApp((s) => s.jointKeyframes)   // S177 关键帧动画
  const jointOrigins = useApp((s) => s.jointOrigins)   // GM-3DV4 A1：可复用关节原点
  const contactPairs = useApp((s) => s.contactPairs)   // GM-3DV4 A9：命名逐对接触集
  const rigidGroups = useApp((s) => s.rigidGroups)     // GM-3DV4 A8：一级刚性组节点
  // RETEST21 #3：屬性檢查器預設就開（inspectMode=true）→ 關節面板預設讓位縮成 pill；以前 pill 喺 inspectMode 下撳都唔展開
  // （連 ✕／滑桿都摸唔到）。依家：命令對話框開緊先硬性讓位；檢查器只係「預設縮」，用家撳 pill／Assemble 菜單就展開。
  const inspectMode = useApp((s) => s.inspectMode)

  const [parent, setParent] = useState('')
  const [child, setChild] = useState('')
  // ASM2 P3：關節類型同「關節」工具彈出的類型清單共用（store.jointTypePref）—— 兩邊預設／高亮一致
  const type = useApp((s) => s.jointTypePref)
  const setType = useApp((s) => s.setJointTypePref)
  const [axis, setAxis] = useState<'X' | 'Y' | 'Z'>('Z')
  const [originRef, setOriginRef] = useState('')       // GM-3DV4 A1：新关节引用嘅关节原点（''=默认件心）
  const [childOriginRef, setChildOriginRef] = useState('')
  const [csA, setCsA] = useState('')                   // GM-3DV4 A9：命名接触集配对
  const [csB, setCsB] = useState('')
  const [posFor, setPosFor] = useState('')             // GM-3DV4 A2/A3：展开「位置/Rest」编辑嘅关节 id
  // The right-side command palettes (圆角/抽壳/孔/拉伸/featDlg…) live in the same corner — auto-yield
  // while one is open (collapse to a pill) so panels never cover each other. Manual ▾/▸ too.
  const dlgOpen = useApp((s) => !!(s.featDlg || s.edgeRoundPick || s.shellMode || s.holeMode || s.extrudeDlgOpen || s.sweepDlgOpen || s.loftDlgOpen))
  const [userCollapsed, setUserCollapsed] = useState(false)
  const [userExpanded, setUserExpanded] = useState(false)
  const collapsed = userCollapsed || dlgOpen || (inspectMode && !userExpanded)
  const [mlDrv, setMlDrv] = useState('')
  const [mlDvn, setMlDvn] = useState('')
  const [mlRatio, setMlRatio] = useState(-1)
  const [mlZ1, setMlZ1] = useState(20)   // driver gear teeth (for the teeth-count ratio helper)
  const [mlZ2, setMlZ2] = useState(40)   // driven gear teeth
  const [ml2On, setMl2On] = useState(false)  // 双驱动（T735 行星动画）
  const [mlDrv2, setMlDrv2] = useState('')
  const [mlRatio2, setMlRatio2] = useState(1)
  const rotJoints = joints.filter((j) => j.type === 'revolute' || j.type === 'cylindrical')
  const contactSetsOn = useApp((s) => s.contactSets)   // T787：接触集开关高亮
  const [playing, setPlaying] = useState(false)
  const raf = useRef(0)
  // ⚙ 動力學（趨勢級單自由度）：哪條關節展開了運動研究設定 + 各輸入（本地態，質量以 kg 計）
  const [dynFor, setDynFor] = useState('')
  const [dynMass, setDynMass] = useState(0.5)   // kg
  const [dynK, setDynK] = useState(0)           // 弹簧 k
  const [dynC, setDynC] = useState(0.5)         // 阻尼 c
  const [dynQ0, setDynQ0] = useState(0)         // 弹簧自然位
  const [dynQ0v, setDynQ0v] = useState(30)      // 初始位（revolute 默认 30°，slider 0 — 见展开时同步）
  const [msPlaying, setMsPlaying] = useState(false)  // 運動研究回放中
  const msRaf = useRef(0)
  // S177 关键帧动画：当前时间 t（秒）、播放态、RAF ref
  const [kfTime, setKfTime] = useState(0)
  const [kfPlaying, setKfPlaying] = useState(false)
  const kfRaf = useRef(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelDrag = useDraggable('webcad-joints', { right: 14, bottom: 210 })
  // UX3 #4：面板向上長（右下錨）以前會一路長到蓋住 ribbon、頂部命令欄（揀草圖基準面／移動欄）同 ViewCube。
  // 依家高度封頂喺 ribbon 底 + 190px 之下，超出就面板內捲動。
  const [dockMaxH, setDockMaxH] = useState<number | undefined>(undefined)
  useLayoutEffect(() => {
    const fit = () => {
      const el = panelRef.current
      if (!el) return
      const rb = (document.querySelector('.ribbon') as HTMLElement | null)?.getBoundingClientRect().bottom ?? 110
      const r = el.getBoundingClientRect()
      const mh = panelDrag.isDragged ? Math.round(window.innerHeight - r.top - 12) : Math.round(r.bottom - (rb + 190))
      const v = Math.max(140, mh)
      setDockMaxH((o) => (o === v ? o : v))
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  })
  // UX3 #5：加完關節，新卡插喺上面 → 面板一捲動，原本滑鼠下面嘅掣就換咗做新卡嘅限位欄（用家誤撳）。
  // 加卡前後保持「距底部」嘅捲動位置不變 → 滑鼠下面仍然係同一個掣。
  const prevJointCount = useRef(joints.length)
  const bottomGap = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) { prevJointCount.current = joints.length; return }
    if (joints.length > prevJointCount.current && bottomGap.current != null) el.scrollTop = Math.max(0, el.scrollHeight - bottomGap.current)
    prevJointCount.current = joints.length
    bottomGap.current = el.scrollHeight - el.scrollTop
  })
  const beginPanelDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select, label')) return
    panelDrag.onPointerDown(e)
  }
  const contactRef = useRef<HTMLDivElement>(null)
  const motionLinkRef = useRef<HTMLDivElement>(null)

  // SOLID › ASSEMBLE 菜单入口与右侧关节面板保持同一套真实操作流程：菜单命令只负责
  // 展开并聚焦对应 Fusion 区段，不复制第二套状态或制造空壳对话框。
  useEffect(() => {
    const focus = (ev: Event) => {
      const d = (ev as CustomEvent<{ section?: string; jointId?: string }>).detail || {}
      setUserCollapsed(false); setUserExpanded(true)
      if (d.section === 'motionstudy' && d.jointId) {
        setDynFor(d.jointId)
        const j = useApp.getState().joints.find((x) => x.id === d.jointId)
        setDynQ0v(j?.type === 'slider' ? 0 : 30)
      }
      requestAnimationFrame(() => {
        const target = d.section === 'motionlink' ? motionLinkRef.current
          : d.section === 'newcontactset' ? contactRef.current
            : d.jointId ? panelRef.current?.querySelector<HTMLElement>(`[data-joint-id="${d.jointId}"]`) : panelRef.current
        target?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
    window.addEventListener('webcad:assembly-focus', focus)
    return () => window.removeEventListener('webcad:assembly-focus', focus)
  }, [])

  useEffect(() => {
    if (components.length >= 2) {
      setParent((p) => p || components[0].id)
      setChild((c) => c || components[1].id)
    }
  }, [components])

  useEffect(() => {
    if (!playing) return
    const movable = useApp.getState().joints.find((j) => j.type === 'revolute' || j.type === 'cylindrical' || j.type === 'ball' || j.type === 'planar' || j.type === 'screw' || j.type === 'pinslot')
    if (!movable) { setPlaying(false); return }
    let last = performance.now()
    const tick = (t: number) => {
      const dt = t - last; last = t
      const cur = useApp.getState().joints.find((j) => j.id === movable.id)
      if (cur) useApp.getState().setJointValue(movable.id, { angle: ((cur.angle + dt * 0.06 + 180) % 360) - 180 })
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [playing])

  // 運動研究回放：按真實時間步進 motionStudy.q（幀序 = elapsed/dt），每幀 setJointValue 驅動 FK；
  // 同前面 ▷运动 一样嘅 RAF 骨架，但独立 ref/state，唔会同连续转动相冲。到尾自动停；卸载/切换时清理。
  useEffect(() => {
    if (!msPlaying) return
    const ms = useApp.getState().motionStudy
    if (!ms || !ms.q.length) { setMsPlaying(false); return }
    const applyFrame = (i: number) => {
      const qs = ms.qs
      if (qs) {
        const patch = Object.fromEntries(Object.entries(qs).map(([key, q]) => [key, q[Math.min(i, q.length - 1)]]))
        useApp.getState().setJointValue(ms.jointId, patch)
      } else useApp.getState().setJointValue(ms.jointId, { [ms.key]: ms.q[Math.min(i, ms.q.length - 1)] })
    }
    const start = performance.now()
    const tick = (t: number) => {
      const i = Math.floor((t - start) / 1000 / ms.dt)
      if (i >= ms.q.length) {
        applyFrame(ms.q.length - 1)
        setMsPlaying(false); return
      }
      applyFrame(i)
      msRaf.current = requestAnimationFrame(tick)
    }
    msRaf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(msRaf.current)
  }, [msPlaying])

  // S177 关键帧回放：按真实时间扫 [首帧t, 末帧t]，每帧 applyJointTime(插值) 驱动 FK；到尾自动停。同 msRaf 一样嘅独立 RAF 骨架。
  useEffect(() => {
    if (!kfPlaying) return
    const kf0 = useApp.getState().jointKeyframes
    if (kf0.length < 2) { setKfPlaying(false); return }
    const start = performance.now() - kf0[0].t * 1000   // 锚定首帧 t → 由 kf0.t 即开始，无前导冻结（首帧 t>0 时唔好停喺起点）
    const tick = (now: number) => {
      const kfs = useApp.getState().jointKeyframes   // 每帧重读 → 播放中删帧/加帧自愈
      if (kfs.length < 2) { setKfPlaying(false); return }
      const tEnd = kfs[kfs.length - 1].t
      const t = (now - start) / 1000
      if (t >= tEnd) { useApp.getState().applyJointTime(tEnd); setKfTime(tEnd); setKfPlaying(false); return }
      useApp.getState().applyJointTime(t); setKfTime(t)
      kfRaf.current = requestAnimationFrame(tick)
    }
    kfRaf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(kfRaf.current)
  }, [kfPlaying])

  // FISHING14 B：⌂／↺歸零後把關鍵幀 scrub 拉回 t=0（唔自動套用關鍵幀值 — 驅動已由 homeJoint(s) 寫回 Rest）
  useEffect(() => {
    const onHome = () => { setPlaying(false); setMsPlaying(false); setKfPlaying(false); setKfTime(0) }
    window.addEventListener('webcad:joints-home', onHome)
    return () => window.removeEventListener('webcad:joints-home', onHome)
  }, [])

  if (components.length < 2) return null
  const name = (id: string) => localizeAsmName(components.find((c) => c.id === id)?.name ?? id, lang)   // RETEST17 #3：標題行「組件1 → 實體1」繁體
  const kfEnd = jointKeyframes.length ? jointKeyframes[jointKeyframes.length - 1].t : 5   // S177 时间轴末端 = 末帧 t（无帧默认 5s）

  const add = () => {
    if (!parent || !child || parent === child) return
    // GM-3DV4 A1：引用可复用关节原点 → anchor/axis 取自其解算帧（取代默认件心）；缺省 = 旧行为逐字节。
    const jo = originRef ? jointOrigins.find((o) => o.id === originRef) : null
    const childJo = childOriginRef ? jointOrigins.find((o) => o.id === childOriginRef) : null
    // Store the unflipped axis on Joint; Joint.flip is the sole runtime flip.
    // Pairing still aligns the effective visual frames, so a flipped child
    // origin snaps in the same direction the resulting joint will move.
    const frame = jo ? resolveJointOrigin(jo, false) : null
    const childFrame = childJo ? resolveJointOrigin(childJo, false) : null
    const pairFrame = jo ? resolveJointOrigin(jo) : null
    const childPairFrame = childJo ? resolveJointOrigin(childJo) : null
    // A pair of joint origins establishes the initial position before the
    // constraint is created: first align the child frame axis, then translate
    // the rotated child origin exactly onto the parent origin.
    let pairedPose: { pos: [number, number, number]; rot: [number, number, number] } | null = null
    if (frame && childFrame && pairFrame && childPairFrame) {
      const c = components.find((x) => x.id === child)
      if (c) {
        const from = new Vector3(...childPairFrame.axis).normalize()
        const to = new Vector3(...pairFrame.axis).normalize()
        const align = from.lengthSq() && to.lengthSq() ? new Quaternion().setFromUnitVectors(from, to) : new Quaternion()
        const oldEuler = new Euler(...(c.rot ?? [0, 0, 0]).map((v) => v * Math.PI / 180) as [number, number, number])
        const nextEuler = new Euler().setFromQuaternion(align.multiply(new Quaternion().setFromEuler(oldEuler)))
        const nextRot: [number, number, number] = [nextEuler.x * 180 / Math.PI, nextEuler.y * 180 / Math.PI, nextEuler.z * 180 / Math.PI]
        const centre = componentCenter(child)
        const movedOrigin = new Vector3(...childFrame.anchor).sub(new Vector3(...centre)).applyQuaternion(align).add(new Vector3(...centre))
        pairedPose = { pos: [c.pos[0] + frame.anchor[0] - movedOrigin.x, c.pos[1] + frame.anchor[1] - movedOrigin.y, c.pos[2] + frame.anchor[2] - movedOrigin.z], rot: nextRot }
      }
    }
    const joint = {
      type, parent, child,
      anchor: frame ? frame.anchor : componentCenter(child),
      axis: frame ? frame.axis : AXES.find((a) => a.k === axis)!.v,
      angle: 0, slide: 0,
      ...(jo ? { originRef: jo.id, ...(childJo ? { originRef2: childJo.id } : {}), ...(jo.angle ? { originAngle: jo.angle } : {}), ...(jo.flip ? { flip: true } : {}) } : {}),
      ...(type === 'screw' ? { lead: 1.5 } : {}),
    }
    if (pairedPose) addJointAtPose(joint, child, pairedPose)
    else addJoint(joint)
  }
  const hasMovable = joints.some((j) => j.type === 'revolute' || j.type === 'cylindrical' || j.type === 'ball' || j.type === 'planar' || j.type === 'screw' || j.type === 'pinslot')
  // C2: a driven-value readout that turns red + flags ⚠ when the joint hits its limit (within ε), so you
  // see when a mechanism reaches a hard stop instead of silently clamping at the slider end.
  const limTag = (v: number, min: number, max: number, unit: string, hasLim: boolean) => {
    const atMin = hasLim && v <= min + 0.5, atMax = hasLim && v >= max - 0.5  // only flag when the joint has EXPLICIT limits — a free joint isn't "at limit" at the slider end
    return <span style={atMin || atMax ? { color: '#d6694e', fontWeight: 700 } : undefined}>{v.toFixed(0)}{unit}{atMin ? ' ⚠下限' : atMax ? ' ⚠上限' : ''}</span>
  }
  // DOF breakdown by joint type (e.g. "2旋转 · 1滑动") — a quick read of the mechanism's mobility.
  const byType = joints.reduce((m, j) => { m[j.type] = (m[j.type] || 0) + 1; return m }, {} as Record<string, number>)
  const breakdown = Object.entries(byType).map(([t, n]) => `${n}${tStatus(JOINT_LABEL_TC[t as JointType], lang)}`).join(' · ')
  // 闭环 Grübler 修正：每个平面环减 3 — 切口锚点闭合 2 条约束 + back-edge 关节值变从动 1。
  // 验算：四连杆 4−3=1 ✓；曲柄滑块 4−3=1 ✓；Stephenson 六杆 7−2×3=1 ✓。
  // ASM2 P2：只計實際會驅動嘅關節（同一對組件多條關節唔再當閉環扣 3；子件已固定 = 0），≥3 件真閉環照 Grübler。
  const mechDOF = mechanismDOF(components.map((c) => c.id), joints, (id) => groundedId === id || !!components.find((c) => c.id === id)?.grounded).dof

  if (collapsed) {
    // The Assemble menu dispatches assembly-focus to reopen even an empty panel.
    if (joints.length === 0) return null
    return (
      <button
        ref={panelDrag.ref}
        className={'joints-pill' + (panelDrag.isDragged ? ' vp-hud-dragged' : '')}
        style={panelDrag.style}
        onPointerDown={panelDrag.onPointerDown}
        title={dlgOpen ? '命令進行中 — 關節面板已讓位（命令完成後自動展開）' : '展開關節面板'}
        onClick={() => { if (panelDrag.consumeClick()) return; if (!dlgOpen) { setUserCollapsed(false); setUserExpanded(true) } }}
      >🔧 {tStatus('關節', lang)} {joints.length} · {tStatus('自由度', lang)} {mechDOF}{!dlgOpen ? ' ▸' : ''}</button>
    )
  }

  return (
    <div className={'joints-panel' + (panelDrag.isDragged ? ' vp-hud-dragged' : '')} ref={(el) => { panelRef.current = el; panelDrag.ref(el) }} style={dockMaxH ? { ...panelDrag.style, maxHeight: dockMaxH } : panelDrag.style} onScroll={(e) => { const el = e.currentTarget; bottomGap.current = el.scrollHeight - el.scrollTop }} onPointerDown={beginPanelDrag} title="拖動面板空白處或標題可移動位置">
      <div className="jp-title" title="機構自由度 = 實際可驅動的獨立運動數：各有效關節的自由度之和（同一組件有多條關節時以最後一條為準；子件已固定的關節不計），三件或以上組件的閉環每環減 3（四連桿 = 1）。0 = 全部固定；數值越大，機構越鬆。">裝配關節 {joints.length} · 自由度 {mechDOF}{breakdown ? `（${breakdown}）` : ''}
        <button className="cs-x" style={{ float: 'right', marginLeft: 4, ...(contactSetsOn ? { color: '#ff8a2a', fontWeight: 700 } : {}) }} title={contactSetsOn ? '🧱 接觸集正在開啟：拖關節滑桿撞到第三方組件會自動擋停（再按關閉 — 關了可自由穿過）' : '🧱 接觸集（T787 /）：開了之後拖關節滑桿，子件撞到第三方組件即停在接觸前一刻 — 卡扣/棘輪/限位的真實手感'} onClick={() => useApp.getState().toggleContactSets()}>🧱{contactSetsOn ? '開' : ''}</button>
        <span className="pp-x" style={{ float: 'right' }} title="折疊面板" onClick={() => { setUserCollapsed(true); setUserExpanded(false) }}>▾</span></div>

      {joints.map((j) => (
        <div key={j.id} className={'jp-joint' + (j.id === selectedJoint ? ' sel' : '')} data-joint-id={j.id} style={j.id === selectedJoint ? { outline: '2px solid #1572c4', outlineOffset: -1, borderRadius: 4 } : undefined}>
          <div className="jp-row">
            <b>{localizeAsmName(j.name, lang)}</b>
            {/* ASM2 P3：已建關節可改類型（可撤銷） */}
            <select className="jp-type" data-testid={`jp-type-${j.id}`} title={tStatus('更改關節類型', lang)} value={j.type} onChange={(e) => useApp.getState().setJointType(j.id, e.target.value as JointType)} style={{ font: 'inherit', cursor: 'pointer' }}>{TYPES.map((t) => <option key={t} value={t}>{tStatus(JOINT_LABEL_TC[t], lang)}</option>)}</select>
            <span className="jp-cc">{name(j.parent)} → {name(j.child)}</span>
            <button className="cs-x" style={holePicking === j.id ? { color: '#ff8a2a' } : undefined} title="🎯 拾孔定軸：點此後再點零件上一個【圓柱孔/軸面】→ 關節錨點對到孔心、轉軸沿孔軸（鉸鏈/轉軸裝到指定孔位）" onClick={() => startJointHolePick(j.id)}>🎯</button>
            {j.type !== 'rigid' && <button className="cs-x" style={posFor === j.id ? { color: '#ff8a2a' } : undefined} title="位置／靜止位：兩原點之間的靜止偏移（X/Y/Z + 角度 + 反轉）+ 靜止位。" onClick={() => setPosFor(posFor === j.id ? '' : j.id)}>⚓</button>}
            {j.type !== 'rigid' && <button className="cs-x" title="🔍 跨運動干涉：自動掃掠此關節的全行程（含齒輪聯動），二分找出『首次撞』的驅動值 — 無需逐幀手拖就知機構成程是否會自撞。滑動關節需先設行程限位。" onClick={() => useApp.getState().interferenceAcrossMotion(j.id)}>🔍</button>}
            <button className="cs-x" data-testid={'joint-card-del-' + j.id} title="刪除關節（Ctrl+Z 可還原）" onClick={() => removeJoint(j.id)}>✕</button>
          </div>
          {posFor === j.id && j.type !== 'rigid' && (
            <div className="jp-lim" style={{ flexWrap: 'wrap', gap: 4, background: 'rgba(21,114,196,.06)', borderRadius: 4, padding: '3px 4px' }}>
              <span style={{ color: '#6b7680', fontWeight: 600 }} title="兩關節原點之間的靜止偏移（關節基 U/V/軸）+ 靜止轉角 + 反轉；靜止位（歸零回此）">位置</span>
              {j.originRef && <span style={{ color: '#12b886', fontSize: 11 }} title="此關節引用了可復用關節原點">⚓{jointOrigins.find((o) => o.id === j.originRef)?.name ?? j.originRef}</span>}
              靜 <NumInput value={j.rest ?? 0} onValue={(v) => { setJointValue(j.id, { rest: v }) }} label={`靜止位（${j.type === 'slider' ? 'mm' : '°'}）— ⌂歸零即回此`} w={48} title={`靜止位（${j.type === 'slider' ? 'mm' : '°'}）— ⌂歸零即回此`} />{j.type === 'slider' ? 'mm' : '°'}
              <span title="兩原點之間靜止偏移（關節基：沿U / 沿V / 沿軸 mm）">偏</span>
              <NumInput value={j.offset?.[0] ?? 0} onValue={(v) => { setJointValue(j.id, { offset: [v, j.offset?.[1] ?? 0, j.offset?.[2] ?? 0] }) }} label="沿 U 偏移 mm" w={42} title="沿 U 偏移 mm" />
              <NumInput value={j.offset?.[1] ?? 0} onValue={(v) => { setJointValue(j.id, { offset: [j.offset?.[0] ?? 0, v, j.offset?.[2] ?? 0] }) }} label="沿 V 偏移 mm" w={42} title="沿 V 偏移 mm" />
              <NumInput value={j.offset?.[2] ?? 0} onValue={(v) => { setJointValue(j.id, { offset: [j.offset?.[0] ?? 0, j.offset?.[1] ?? 0, v] }) }} label="沿軸偏移 mm" w={42} title="沿軸偏移 mm" />
              ∠ <NumInput value={j.originAngle ?? 0} onValue={(v) => { setJointValue(j.id, { originAngle: v }) }} label="靜止轉角°（繞關節軸）" w={44} title="靜止轉角°（繞關節軸）" />°
              <label style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }} title="反轉：反轉關節軸向（旋轉／滑動方向相反）"><input type="checkbox" checked={!!j.flip} onChange={(e) => setJointValue(j.id, { flip: e.target.checked })} /> 反轉</label>
            </div>
          )}
          {(j.type === 'revolute' || j.type === 'cylindrical') && (
            <>
              <label className="jp-drive">轉 <input type="range" {...JOINT_DRIVE_GESTURE} min={j.aMin ?? -180} max={j.aMax ?? 180} value={Math.min(j.aMax ?? 180, Math.max(j.aMin ?? -180, j.angle ?? 0))} onChange={(e) => setJointValue(j.id, { angle: Number(e.target.value) })} /> {limTag(j.angle, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}
                <button type="button" className="cs-x" data-testid={`joint-home-${j.id}`} title="↺歸零：此關節驅動角回到靜止位（Rest，預設 0），並還原子件 as-built 位姿" onClick={() => { setPlaying(false); setMsPlaying(false); setKfPlaying(false); useApp.getState().homeJoint(j.id) }}>↺歸零</button>
              </label>
              <div className="jp-lim">限位 <NumInput value={j.aMin ?? -180} onValue={(v) => { setJointValue(j.id, { aMin: v }) }} label="下限" w={48} /> ~ <NumInput value={j.aMax ?? 180} onValue={(v) => { setJointValue(j.id, { aMax: v }) }} label="上限" w={48} /> °
                <button className="cs-x" title="停於接觸（T779）：正轉直到撞到第三方組件前一刻停低（5°掃+二分 ~0.01° — 卡扣/棘輪「轉到卡住」）" onClick={() => void useApp.getState().driveJointToContact(j.id, 1, 'angle')}>🧱+</button>
                <button className="cs-x" title="停於接觸：反轉方向" onClick={() => void useApp.getState().driveJointToContact(j.id, -1, 'angle')}>🧱−</button>
              </div>
            </>
          )}
          {(j.type === 'slider' || j.type === 'cylindrical') && (
            <>
              <label className="jp-drive">移 <input type="range" {...JOINT_DRIVE_GESTURE} min={j.sMin ?? -120} max={j.sMax ?? 120} value={Math.min(j.sMax ?? 120, Math.max(j.sMin ?? -120, j.slide ?? 0))} onChange={(e) => setJointValue(j.id, { slide: Number(e.target.value) })} /> {limTag(j.slide, j.sMin ?? -120, j.sMax ?? 120, '', j.sMin != null || j.sMax != null)}
                {j.type === 'slider' && <button type="button" className="cs-x" data-testid={`joint-home-${j.id}`} title="↺歸零：此關節滑動偏移回到靜止位（Rest，預設 0），並還原子件 as-built 位姿" onClick={() => { setPlaying(false); setMsPlaying(false); setKfPlaying(false); useApp.getState().homeJoint(j.id) }}>↺歸零</button>}
              </label>
              <div className="jp-lim">限位 <NumInput value={j.sMin ?? -120} onValue={(v) => { setJointValue(j.id, { sMin: v }) }} label="下限" w={48} /> ~ <NumInput value={j.sMax ?? 120} onValue={(v) => { setJointValue(j.id, { sMax: v }) }} label="上限" w={48} /> mm
                <button className="cs-x" title="停於接觸（S98）：正向滑到撞到第三方組件前一刻停低（2mm 掃+二分 — 卡扣/抽屜「推到頂」）" onClick={() => void useApp.getState().driveJointToContact(j.id, 1, 'slide')}>🧱+</button>
                <button className="cs-x" title="停於接觸：反向滑" onClick={() => void useApp.getState().driveJointToContact(j.id, -1, 'slide')}>🧱−</button>
              </div>
            </>
          )}
          {j.type === 'ball' && (
            <>
              <label className="jp-drive">繞Z <input type="range" {...JOINT_DRIVE_GESTURE} min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle} onChange={(e) => setJointValue(j.id, { angle: Number(e.target.value) })} /> {limTag(j.angle, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
              <label className="jp-drive">繞Y <input type="range" {...JOINT_DRIVE_GESTURE} min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle2 ?? 0} onChange={(e) => setJointValue(j.id, { angle2: Number(e.target.value) })} /> {limTag(j.angle2 ?? 0, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
              <label className="jp-drive">繞X <input type="range" {...JOINT_DRIVE_GESTURE} min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle3 ?? 0} onChange={(e) => setJointValue(j.id, { angle3: Number(e.target.value) })} /> {limTag(j.angle3 ?? 0, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
            </>
          )}
          {j.type === 'pinslot' && (
            <>
              <label className="jp-drive" title="繞銷軸轉動">轉 <input type="range" {...JOINT_DRIVE_GESTURE} min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle} onChange={(e) => setJointValue(j.id, { angle: Number(e.target.value) })} /> {limTag(j.angle, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
              <label className="jp-drive" title="沿槽向滑動（槽向 ⊥ 銷軸，自動取基向 — 同平面關節 U 向同約定）">滑 <input type="range" {...JOINT_DRIVE_GESTURE} min={j.sMin ?? -120} max={j.sMax ?? 120} value={j.slide} onChange={(e) => setJointValue(j.id, { slide: Number(e.target.value) })} /> {limTag(j.slide, j.sMin ?? -120, j.sMax ?? 120, '', j.sMin != null || j.sMax != null)}</label>
              <div className="jp-lim">滑限 <NumInput value={j.sMin ?? -120} onValue={(v) => { setJointValue(j.id, { sMin: v }) }} label="下限" w={48} /> ~ <NumInput value={j.sMax ?? 120} onValue={(v) => { setJointValue(j.id, { sMax: v }) }} label="上限" w={48} /> mm（長槽調節位標準關節）</div>
            </>
          )}
          {j.type === 'planar' && (
            <>
              <label className="jp-drive">移U <input type="range" {...JOINT_DRIVE_GESTURE} min={j.sMin ?? -120} max={j.sMax ?? 120} value={j.slide} onChange={(e) => setJointValue(j.id, { slide: Number(e.target.value) })} /> {limTag(j.slide, j.sMin ?? -120, j.sMax ?? 120, '', j.sMin != null || j.sMax != null)}</label>
              <label className="jp-drive">移V <input type="range" {...JOINT_DRIVE_GESTURE} min={j.sMin ?? -120} max={j.sMax ?? 120} value={j.slide2 ?? 0} onChange={(e) => setJointValue(j.id, { slide2: Number(e.target.value) })} /> {limTag(j.slide2 ?? 0, j.sMin ?? -120, j.sMax ?? 120, '', j.sMin != null || j.sMax != null)}</label>
              <label className="jp-drive">轉 <input type="range" {...JOINT_DRIVE_GESTURE} min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle} onChange={(e) => setJointValue(j.id, { angle: Number(e.target.value) })} /> {limTag(j.angle, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
            </>
          )}
          {j.type === 'screw' && (
            <>
              <label className="jp-drive" title="轉動驅動；同步沿軸進給 = 轉角/360 × 導程">轉 <input type="range" {...JOINT_DRIVE_GESTURE} min={j.aMin ?? -1080} max={j.aMax ?? 1080} value={j.angle} onChange={(e) => setJointValue(j.id, { angle: Number(e.target.value) })} /> {limTag(j.angle, j.aMin ?? -1080, j.aMax ?? 1080, '°', j.aMin != null || j.aMax != null)}</label>
              <div className="jp-lim" title="導程：每轉一圈軸向進給 mm（公制螺紋的螺距×線數）">導程 <NumInput value={j.lead ?? 1.5} onValue={(v) => { setJointValue(j.id, { lead: v }) }} label="導程" w={56} /> mm/轉 · 進給 {(((j.angle || 0) / 360) * (j.lead ?? 0)).toFixed(2)}mm</div>
            </>
          )}
          {(j.type === 'revolute' || j.type === 'slider' || j.type === 'cylindrical' || j.type === 'ball' || j.type === 'planar' || j.type === 'pinslot') && (
            <div className="jp-lim" style={{ flexWrap: 'wrap', gap: 4 }}>
              <button
                className={'cs-x' + (dynFor === j.id ? ' on' : '')}
                style={dynFor === j.id ? { color: '#ff8a2a', fontWeight: 700 } : undefined}
                title="趨勢級：點質量@質心 + 單自由度 + 半隱式歐拉積分，非商用多體動力學"
                onClick={() => {
                  if (dynFor === j.id) { setDynFor('') } else {
                    setDynFor(j.id)
                    // A planar joint's primary studied coordinate is its U slide.
                    // The single initial-value field intentionally applies only
                    // to the primary coordinate; the solver preserves the other
                    // DOFs' current values at t=0.
                    setDynQ0v(j.type === 'slider' || j.type === 'planar' ? 0 : 30)
                  }
                }}
              >⚙ 動力學</button>
              {dynFor === j.id && (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }} title="趨勢級：點質量@質心、半隱式歐拉積分。多自由度關節會在同一幀同步回放全部坐標；並非帶耦合慣量矩陣/接觸求解的商用多體動力學。">
                  質量 <NumInput value={dynMass} onValue={(v) => { setDynMass(v) }} label="質量" min={0} w={48} />kg
                  k <NumInput value={dynK} onValue={(v) => { setDynK(v) }} label={j.type === 'slider' || j.type === 'planar' ? '主自由度彈簧剛度 N/mm' : '主自由度彈簧剛度（扭轉）'} w={44} title={j.type === 'slider' || j.type === 'planar' ? '主自由度彈簧剛度 N/mm' : '主自由度彈簧剛度（扭轉）'} />
                  c <NumInput value={dynC} onValue={(v) => { setDynC(v) }} label="阻尼系數" min={0} w={44} title="阻尼系數" />
                  q0 <NumInput value={dynQ0} onValue={(v) => { setDynQ0(v) }} label={j.type === 'slider' || j.type === 'planar' ? '主自由度彈簧自然位 mm' : '主自由度彈簧自然位 °'} w={44} title={j.type === 'slider' || j.type === 'planar' ? '主自由度彈簧自然位 mm' : '主自由度彈簧自然位 °'} />
                  初始 <NumInput value={dynQ0v} onValue={(v) => { setDynQ0v(v) }} label={j.type === 'slider' || j.type === 'planar' ? '主自由度初始位 mm；其他自由度保留當前值' : '主自由度初始位 °；其他自由度保留當前值'} w={44} title={j.type === 'slider' || j.type === 'planar' ? '主自由度初始位 mm；其他自由度保留當前值' : '主自由度初始位 °；其他自由度保留當前值'} />{j.type === 'slider' || j.type === 'planar' ? 'mm' : '°'}
                  <button className="cs-btn" title="求解趨勢級動力學並生成軌跡" onClick={() => { setMsPlaying(false); runMotionStudy(j.id, { mass: dynMass, k: dynK, c: dynC, q0: dynQ0, q0v: dynQ0v }) }}>求解</button>
                </span>
              )}
              {motionStudy && motionStudy.jointId === j.id && (
                <>
                  <button className={'cs-btn' + (msPlaying ? ' on' : '')} title={`回放 ${motionStudy.q.length} 幀 / ${motionStudy.tEnd}s（真實時間步進）`} onClick={() => { setPlaying(false); setKfPlaying(false); setMsPlaying((p) => !p) }}>{msPlaying ? '⏸ 停' : '▶ 播放'}</button>
                  <button className="cs-x" title="清除運動研究軌跡" onClick={() => { setMsPlaying(false); clearMotionStudy() }}>✕清</button>
                  <span style={{ color: '#8a939c', fontSize: 11 }}>{motionStudy.q.length}幀/{motionStudy.tEnd}s</span>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="jp-add">
        <select value={parent} onChange={(e) => setParent(e.target.value)}>{components.map((c) => <option key={c.id} value={c.id}>{localizeAsmName(c.name, lang)}</option>)}</select>
        <span>→</span>
        <select value={child} onChange={(e) => setChild(e.target.value)}>{components.map((c) => <option key={c.id} value={c.id}>{localizeAsmName(c.name, lang)}</option>)}</select>
        <select value={type} onChange={(e) => setType(e.target.value as JointType)}>{TYPES.map((t) => <option key={t} value={t}>{tStatus(JOINT_LABEL_TC[t], lang)}</option>)}</select>
        <select value={axis} onChange={(e) => setAxis(e.target.value as 'X' | 'Y' | 'Z')} disabled={!!originRef} title={originRef ? '已引用關節原點 — 軸由原點決定' : '關節軸（X/Y/Z）'}>{AXES.map((a) => <option key={a.k} value={a.k}>{a.k} 軸</option>)}</select>
        {jointOrigins.length > 0 && (
          <select value={originRef} onChange={(e) => setOriginRef(e.target.value)} title="父件關節原點：作為關節錨點與軸。選擇兩個原點可先對準子件位置。">
            <option value="">父件：預設件心</option>
            {jointOrigins.map((o) => <option key={o.id} value={o.id}>⚓ {o.name}</option>)}
          </select>
        )}
        {jointOrigins.length > 0 && originRef && (
          <select value={childOriginRef} onChange={(e) => setChildOriginRef(e.target.value)} title="子件關節原點：與父件原點配對時，子件會先平移到相同位置。">
            <option value="">子件：不配對</option>
            {jointOrigins.map((o) => <option key={o.id} value={o.id}>⚓ {o.name}</option>)}
          </select>
        )}
        <button className="cs-btn" onClick={add}>+ 關節</button>
        {hasMovable && <button className={'cs-btn' + (playing ? ' on' : '')} onClick={() => { setMsPlaying(false); setKfPlaying(false); setPlaying((p) => !p) }}>{playing ? '⏸ 停' : '▷ 運動'}</button>}
        {joints.length > 0 && <button className="cs-btn" data-testid="joints-home-all" title="把所有關節角度/位移歸零，機構回到初始姿態（Rest；還原 as-built 位姿）" onClick={() => { setPlaying(false); setMsPlaying(false); setKfPlaying(false); useApp.getState().homeJoints() }}>⌂ 歸零</button>}
        {joints.length > 0 && <button className="cs-btn" title="捕捉位置：把當前所有關節角度/位移存為命名姿態，一鍵套回" onClick={async () => { const nm = await useApp.getState().appPrompt('姿態名稱', `姿態${jointPoses.length + 1}`); if (nm != null) useApp.getState().saveJointPose(nm) }}>📍 捕捉位置</button>}
      </div>

      {jointOrigins.length > 0 && (
        <div className="jp-mlink">
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }}>關節原點</div>
          {jointOrigins.map((jo) => (
            <div key={jo.id} className="jp-row" style={{ flexWrap: 'wrap', gap: 4, fontSize: 12 }}>
              <span style={{ flex: 1 }} title={`${jo.mode === 'twoFaces' ? '兩面之間' : '簡單'} · ${jo.point.map((v) => v.toFixed(1)).join(', ')}`}>⚓ {jo.name}</span>
              <span title="繞原點 Z 軸旋轉角度">∠</span>
              <NumInput value={jo.angle} onValue={(v) => { useApp.getState().updateJointOrigin(jo.id, { angle: v }) }} label="角度（°）" w={43} title="角度（°）" />°
              <span title="世界 X/Y/Z 偏移（mm）">偏</span>
              {[0, 1, 2].map((i) => <NumInput key={i} value={jo.offset[i]} onValue={(v) => { { const offset: [number, number, number] = [...jo.offset] as [number, number, number]; offset[i as 0 | 1 | 2] = v; useApp.getState().updateJointOrigin(jo.id, { offset }) } }} label={`${['X', 'Y', 'Z'][i]} 偏移（mm）`} w={39} title={`${['X', 'Y', 'Z'][i]} 偏移（mm）`} />)}
              <button className={'cs-btn' + (jo.flip ? ' on' : '')} title="反轉關節原點 Z 軸" onClick={() => useApp.getState().updateJointOrigin(jo.id, { flip: !jo.flip })}>⇅</button>
              <button className="cs-x" title="重新命名關節原點" onClick={async () => { const name = await useApp.getState().appPrompt('關節原點名稱', jo.name); if (name?.trim()) useApp.getState().updateJointOrigin(jo.id, { name: name.trim() }) }}>✎</button>
            </div>
          ))}
        </div>
      )}

      {/* GM-3DV4 A8：一级刚性组节点（可抑制/删除；亦见浏览器「刚性组」组） */}
      {rigidGroups.length > 0 && (
        <div className="jp-mlink">
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }}>剛性組</div>
          {rigidGroups.map((g) => (
            <div key={g.id} className="jp-row" style={{ fontSize: 12 }}>
              <span style={{ flex: 1, opacity: g.suppressed ? 0.5 : 1 }} title={`${g.members.length} 件焊為一體${g.suppressed ? '（已抑制 — 各自自由）' : ''}`}>🔗 {g.name}（{g.members.length}）{g.suppressed ? ' · 已抑制' : ''}</span>
              <button className="cs-x" title={g.suppressed ? '恢復剛性組（重新焊為一體）' : '抑制剛性組（成員釋放自由移動）'} onClick={() => useApp.getState().toggleRigidGroupSuppressed(g.id)}>{g.suppressed ? '▷' : '⏸'}</button>
              <button className="cs-x" title="刪除剛性組（成員釋放）" onClick={() => useApp.getState().removeRigidGroup(g.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* GM-3DV4 A9：命名逐对接触集（全局「接触」关时只检呢啲对 — scoped/快） */}
      {components.length >= 2 && (
        <div className="jp-mlink" ref={contactRef}>
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }} title="命名接觸集：全局🧱開 = All（全部相撞）；全局關但登記了對 → 只檢這些對（scoped，齒輪齧合/卡扣局部接觸用）">{tStatus('命名接觸集', lang)}{contactSetsOn ? tStatus(' · 全局（全部）開', lang) : ''}</div>
          {contactPairs.map((p) => (
            <div key={p.id} className="jp-row" style={{ fontSize: 12 }}>
              <span style={{ flex: 1 }}>🧱 {p.name}</span>
              <button className="cs-x" title="刪除此接觸集" onClick={() => useApp.getState().removeContactPair(p.id)}>✕</button>
            </div>
          ))}
          <div className="jp-add">
            <select value={csA || components[0]?.id} onChange={(e) => setCsA(e.target.value)}>{components.map((c) => <option key={c.id} value={c.id}>{localizeAsmName(c.name, lang)}</option>)}</select>
            <span>↔</span>
            <select value={csB || components[1]?.id} onChange={(e) => setCsB(e.target.value)}>{components.map((c) => <option key={c.id} value={c.id}>{localizeAsmName(c.name, lang)}</option>)}</select>
            <button className="cs-btn" title="登記一對命名接觸集" onClick={() => useApp.getState().addContactPair(csA || components[0]?.id, csB || components[1]?.id)}>+ 接觸對</button>
          </div>
        </div>
      )}

      {jointPoses.length > 0 && (
        <div className="jp-mlink">
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }}>捕捉位置</div>
          {jointPoses.map((p, i) => (
            <div key={i} className="jp-row" style={{ fontSize: 12 }}>
              <button className="cs-btn" style={{ flex: 1, textAlign: 'left' }} title="套用此姿態（機構跳到捕捉時的角度/位移）" onClick={() => { setPlaying(false); setMsPlaying(false); setKfPlaying(false); useApp.getState().applyJointPose(i) }}>▷ {p.name}</button>
              <button className="cs-x" title="刪除此姿態" onClick={() => useApp.getState().deleteJointPose(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {joints.length > 0 && (
        <div className="jp-mlink">
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }}>關鍵幀動畫</div>
          <div className="jp-row" style={{ fontSize: 12, gap: 6, alignItems: 'center' }}>
            <span style={{ minWidth: 14 }}>t</span>
            <input type="range" {...JOINT_DRIVE_GESTURE} min={0} max={Math.max(1, kfEnd)} step={0.05} value={Math.min(kfTime, Math.max(1, kfEnd))} title="拖動時間軸：相鄰關鍵幀之間線性插值驅動機構（scrub）" onChange={(e) => { const v = Number(e.target.value); setKfPlaying(false); setKfTime(v); useApp.getState().applyJointTime(v) }} style={{ flex: 1 }} />
            <span style={{ minWidth: 38, color: '#8a939c' }}>{kfTime.toFixed(2)}s</span>
          </div>
          <div className="jp-row" style={{ gap: 6 }}>
            <button className="cs-btn" style={{ flex: 1 }} title={`在 t=${kfTime.toFixed(2)}s 加一個關鍵幀（快照當前所有關節角度/位移）— 同 t 會覆蓋`} onClick={() => { setKfPlaying(false); useApp.getState().addJointKeyframe(kfTime) }}>◆ 加關鍵幀 @ {kfTime.toFixed(2)}s</button>
            {jointKeyframes.length >= 2 && <button className={'cs-btn' + (kfPlaying ? ' on' : '')} title="從 0 掃到末幀回放（真實時間）" onClick={() => { setPlaying(false); setMsPlaying(false); setKfPlaying((p) => !p) }}>{kfPlaying ? '⏸ 停' : '▶ 播放'}</button>}
          </div>
          {jointKeyframes.map((kf, i) => (
            <div key={i} className="jp-row" style={{ fontSize: 12 }}>
              <button className="cs-btn" style={{ flex: 1, textAlign: 'left' }} title="跳到此關鍵幀時刻" onClick={() => { setKfPlaying(false); setKfTime(kf.t); useApp.getState().applyJointTime(kf.t) }}>◆ {kf.t.toFixed(2)}s</button>
              <button className="cs-x" title="刪除此關鍵幀" onClick={() => { setKfPlaying(false); useApp.getState().deleteJointKeyframe(i) }}>✕</button>
            </div>
          ))}
          {jointKeyframes.length < 2 && <div style={{ fontSize: 11, color: '#8a939c' }}>加 ≥2 個關鍵幀即可播放（拖動機構到位 → 調時間 t → 加關鍵幀）</div>}
        </div>
      )}

      {rotJoints.length >= 2 && (
        <div className="jp-mlink" ref={motionLinkRef}>
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }}>運動連接（齒輪比）</div>
          {motionLinks.map((l) => (
            <div key={l.id} className="jp-row" style={{ fontSize: 12 }}>
              <span>{l.driver}{l.driver2 ? `+${l.driver2}` : ''} 驅動 {l.driven} · {l.kind === 'rack' ? `齒條 角→移 ${l.ratio.toFixed(3)} mm/°` : l.driver2 ? `= ${l.ratio}×${l.driver} + ${l.ratio2}×${l.driver2}` : `比 ${l.ratio}`}</span>
              <button className="cs-x" title="刪除運動連接" onClick={() => removeMotionLink(l.id)}>✕</button>
            </div>
          ))}
          <div className="jp-add">
            <select value={mlDrv || rotJoints[0]?.id} onChange={(e) => setMlDrv(e.target.value)} title="主動關節">{rotJoints.map((j) => <option key={j.id} value={j.id}>{localizeAsmName(j.name, lang)}</option>)}</select>
            <span>→</span>
            <select value={mlDvn || rotJoints[1]?.id} onChange={(e) => setMlDvn(e.target.value)} title="從動關節">{rotJoints.map((j) => <option key={j.id} value={j.id}>{localizeAsmName(j.name, lang)}</option>)}</select>
            <NumInput value={mlRatio} onValue={(v) => { setMlRatio(v) }} label="傳動比：齒輪齧合用 -(主齒數/從齒數)，例 -1（同徑反向）" w={52} title="傳動比：齒輪齧合用 -(主齒數/從齒數)，例 -1（同徑反向）" />
            <button className="cs-btn" onClick={() => addMotionLink(mlDrv || rotJoints[0]?.id, mlDvn || rotJoints[1]?.id, mlRatio, undefined, ml2On && rotJoints.length >= 3 ? (mlDrv2 || rotJoints[2]?.id) : undefined, ml2On ? mlRatio2 : undefined)}>+ 連接</button>
          </div>
          {rotJoints.length >= 3 && (
            <div className="jp-add" style={{ fontSize: 11, alignItems: 'center', gap: 4, marginTop: 2 }} title="雙驅動（行星動畫）：從動 = 比1×驅動1 + 比2×驅動2 — 行星輪自轉 = a×太陽 + b×行星架。勾選後「+ 連接」帶埋第二驅動">
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}><input type="checkbox" checked={ml2On} onChange={(e) => setMl2On(e.target.checked)} /> 雙驅動</label>
              {ml2On && (<>
                <span>＋</span>
                <select value={mlDrv2 || rotJoints[2]?.id} onChange={(e) => setMlDrv2(e.target.value)} title="第二驅動關節">{rotJoints.map((j) => <option key={j.id} value={j.id}>{localizeAsmName(j.name, lang)}</option>)}</select>
                <span>×</span>
                <NumInput value={mlRatio2} onValue={(v) => { setMlRatio2(v) }} label="第二驅動的比" w={52} title="第二驅動的比" />
              </>)}
            </div>
          )}
          <div className="jp-add" style={{ fontSize: 11, alignItems: 'center', gap: 4, marginTop: 2 }} title="由齒數自動算齒輪傳動比 = −(主齒數/從齒數)（齧合反向）。按「算比」填入上方傳動比框">
            <span style={{ color: '#8a939c' }}>齒數</span>
            <NumInput value={mlZ1} onValue={(v) => { setMlZ1(Math.max(1, v)) }} label="主動齒輪齒數 z1" min={1} integer w={44} title="主動齒輪齒數 z1" />
            <span>/</span>
            <NumInput value={mlZ2} onValue={(v) => { setMlZ2(Math.max(1, v)) }} label="從動齒輪齒數 z2" min={1} integer w={44} title="從動齒輪齒數 z2" />
            <button className="cs-btn" title="齒輪比 = −z1/z2（齧合反向）" onClick={() => setMlRatio(-(mlZ1 / mlZ2))}>算比 = −{(mlZ1 / mlZ2).toFixed(3)}</button>
          </div>
        </div>
      )}
    </div>
  )
}
