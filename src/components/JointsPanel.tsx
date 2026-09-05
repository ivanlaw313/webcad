import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import { Euler, Quaternion, Vector3 } from 'three'
import { useApp } from '../store'
import { useDraggable } from './useDraggable'
import { JOINT_LABEL, totalDOF, resolveJointOrigin, type JointType } from '../assembly/kinematics'
import { findLoops } from '../assembly/linkage'   // T779：DOF 闭环 Grübler 修正

const AXES: { k: 'X' | 'Y' | 'Z'; v: [number, number, number] }[] = [
  { k: 'X', v: [1, 0, 0] }, { k: 'Y', v: [0, 1, 0] }, { k: 'Z', v: [0, 0, 1] },
]
const TYPES: JointType[] = ['revolute', 'slider', 'cylindrical', 'pinslot', 'ball', 'planar', 'screw', 'rigid']

export default function JointsPanel() {
  const components = useApp((s) => s.components)
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
  const jointPoses = useApp((s) => s.jointPoses)   // S172 捕捉位置（Capture Position）
  const jointKeyframes = useApp((s) => s.jointKeyframes)   // S177 关键帧动画
  const jointOrigins = useApp((s) => s.jointOrigins)   // GM-3DV4 A1：可复用关节原点
  const contactPairs = useApp((s) => s.contactPairs)   // GM-3DV4 A9：命名逐对接触集
  const rigidGroups = useApp((s) => s.rigidGroups)     // GM-3DV4 A8：一级刚性组节点
  const inspectMode = useApp((s) => s.inspectMode)

  const [parent, setParent] = useState('')
  const [child, setChild] = useState('')
  const [type, setType] = useState<JointType>('revolute')
  const [axis, setAxis] = useState<'X' | 'Y' | 'Z'>('Z')
  const [originRef, setOriginRef] = useState('')       // GM-3DV4 A1：新关节引用嘅关节原点（''=默认件心）
  const [childOriginRef, setChildOriginRef] = useState('')
  const [csA, setCsA] = useState('')                   // GM-3DV4 A9：命名接触集配对
  const [csB, setCsB] = useState('')
  const [posFor, setPosFor] = useState('')             // GM-3DV4 A2/A3：展开「位置/Rest」编辑嘅关节 id
  // The right-side command palettes (圆角/抽壳/孔/拉伸/featDlg…) live in the same corner — auto-yield
  // while one is open (collapse to a pill) so panels never cover each other. Manual ▾/▸ too.
  const dlgOpen = useApp((s) => !!(s.featDlg || s.edgeRoundPick || s.shellMode || s.holeMode || s.extrudeDlgOpen || s.sweepDlgOpen || s.loftDlgOpen)) || inspectMode
  const [userCollapsed, setUserCollapsed] = useState(false)
  const collapsed = userCollapsed || dlgOpen
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
  // ⚙ 动力学（趋势级单自由度）：哪条关节展开了 Motion Study 设定 + 各输入（本地态，质量以 kg 计）
  const [dynFor, setDynFor] = useState('')
  const [dynMass, setDynMass] = useState(0.5)   // kg
  const [dynK, setDynK] = useState(0)           // 弹簧 k
  const [dynC, setDynC] = useState(0.5)         // 阻尼 c
  const [dynQ0, setDynQ0] = useState(0)         // 弹簧自然位
  const [dynQ0v, setDynQ0v] = useState(30)      // 初始位（revolute 默认 30°，slider 0 — 见展开时同步）
  const [msPlaying, setMsPlaying] = useState(false)  // Motion Study 回放中
  const msRaf = useRef(0)
  // S177 关键帧动画：当前时间 t（秒）、播放态、RAF ref
  const [kfTime, setKfTime] = useState(0)
  const [kfPlaying, setKfPlaying] = useState(false)
  const kfRaf = useRef(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelDrag = useDraggable('webcad-joints', { right: 14, bottom: 210 })
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
      setUserCollapsed(false)
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

  // Motion Study 回放：按真实时间步进 motionStudy.q（帧序 = elapsed/dt），每帧 setJointValue 驱动 FK；
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

  if (components.length < 2) return null
  const name = (id: string) => components.find((c) => c.id === id)?.name ?? id
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
    // A pair of Joint Origins establishes the initial position before the
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
  const breakdown = Object.entries(byType).map(([t, n]) => `${n}${JOINT_LABEL[t as JointType]}`).join(' · ')
  // 闭环 Grübler 修正：每个平面环减 3 — 切口锚点闭合 2 条约束 + back-edge 关节值变从动 1。
  // 验算：四连杆 4−3=1 ✓；曲柄滑块 4−3=1 ✓；Stephenson 六杆 7−2×3=1 ✓。
  const mechDOF = Math.max(0, totalDOF(joints) - 3 * findLoops(useApp.getState().components.map((c) => c.id), joints).length)

  if (collapsed) {
    return (
      <button
        ref={panelDrag.ref}
        className={'joints-pill' + (panelDrag.isDragged ? ' vp-hud-dragged' : '')}
        style={panelDrag.style}
        onPointerDown={panelDrag.onPointerDown}
        title={dlgOpen ? '命令进行中 — 关节面板已让位（命令完成后自动展开）' : '展开关节面板'}
        onClick={() => { if (panelDrag.consumeClick()) return; if (!dlgOpen) setUserCollapsed(false) }}
      >🔧 关节 {joints.length} · DOF {mechDOF}{userCollapsed && !dlgOpen ? ' ▸' : ''}</button>
    )
  }

  return (
    <div className={'joints-panel' + (panelDrag.isDragged ? ' vp-hud-dragged' : '')} ref={(el) => { panelRef.current = el; panelDrag.ref(el) }} style={panelDrag.style} onPointerDown={beginPanelDrag} title="拖動面板空白處或標題可移動位置">
      <div className="jp-title" title="机构自由度 DOF = 独立运动数（各关节自由度之和 − 闭环约束 ×3/环：锚点闭合 2 + back-edge 从动 1，平面 Grübler 修正 T779。四连杆 = 1 ✓）。0 = 全固定；越大越「松」。">装配关节 {joints.length} · 自由度 DOF {mechDOF}{breakdown ? `（${breakdown}）` : ''}
        <button className="cs-x" style={{ float: 'right', marginLeft: 4, ...(contactSetsOn ? { color: '#ff8a2a', fontWeight: 700 } : {}) }} title={contactSetsOn ? '🧱 接触集开紧：拖关节滑杆撞到第三方组件会自动挡停（再撳关闭 — 关咗可自由穿过）' : '🧱 接触集（T787 / Fusion Enable Contact）：开咗之后拖关节滑杆，子件撞到第三方组件即停喺接触前一刻 — 卡扣/棘轮/限位嘅真实手感'} onClick={() => useApp.getState().toggleContactSets()}>🧱{contactSetsOn ? '开' : ''}</button>
        <span className="pp-x" style={{ float: 'right' }} title="折叠面板" onClick={() => setUserCollapsed(true)}>▾</span></div>

      {joints.map((j) => (
        <div key={j.id} className="jp-joint" data-joint-id={j.id}>
          <div className="jp-row">
            <b>{j.name}</b>
            <span className="jp-type">{JOINT_LABEL[j.type]}</span>
            <span className="jp-cc">{name(j.parent)} → {name(j.child)}</span>
            <button className="cs-x" style={holePicking === j.id ? { color: '#ff8a2a' } : undefined} title="🎯 拾孔定轴：点此后再点零件上一个【圆柱孔/轴面】→ 关节锚点对到孔心、转轴沿孔轴（铰链/转轴装到指定孔位）" onClick={() => startJointHolePick(j.id)}>🎯</button>
            {j.type !== 'rigid' && <button className="cs-x" style={posFor === j.id ? { color: '#ff8a2a' } : undefined} title="GM-3DV4 A2/A3：位置 / Rest — 两原点之间嘅静止偏移(X/Y/Z + 角度 + Flip) + 静止(Rest)位。" onClick={() => setPosFor(posFor === j.id ? '' : j.id)}>⚓</button>}
            {j.type !== 'rigid' && <button className="cs-x" title="🔍 跨运动干涉：自动扫掠呢个关节嘅全行程（含齿轮联动），二分搵出『首次撞』嘅驱动值 — 唔使逐帧手拖就知机构成程会唔会自撞（Fusion Motion+Interference）。滑动关节需先设行程限位。" onClick={() => useApp.getState().interferenceAcrossMotion(j.id)}>🔍</button>}
            <button className="cs-x" title="删除关节" onClick={() => removeJoint(j.id)}>✕</button>
          </div>
          {posFor === j.id && j.type !== 'rigid' && (
            <div className="jp-lim" style={{ flexWrap: 'wrap', gap: 4, background: 'rgba(21,114,196,.06)', borderRadius: 4, padding: '3px 4px' }}>
              <span style={{ color: '#6b7680', fontWeight: 600 }} title="GM-3DV4 A2：两 joint-origin 之间嘅静止偏移（关节基 U/V/轴）+ 静止转角 + Flip；GM-3DV4 A3：Rest 静止位（归零回此）">位置</span>
              {j.originRef && <span style={{ color: '#12b886', fontSize: 11 }} title="此关节引用咗可复用关节原点">⚓{jointOrigins.find((o) => o.id === j.originRef)?.name ?? j.originRef}</span>}
              静 <input type="number" step={0.5} value={j.rest ?? 0} title={`Rest 静止位（${j.type === 'slider' ? 'mm' : '°'}）— ⌂归零即回此`} onChange={(e) => setJointValue(j.id, { rest: Number(e.target.value) })} style={{ width: 48 }} />{j.type === 'slider' ? 'mm' : '°'}
              <span title="两原点之间静止偏移（关节基：沿U / 沿V / 沿轴 mm）">偏</span>
              <input type="number" step={0.5} value={j.offset?.[0] ?? 0} title="沿 U 偏移 mm" onChange={(e) => setJointValue(j.id, { offset: [Number(e.target.value), j.offset?.[1] ?? 0, j.offset?.[2] ?? 0] })} style={{ width: 42 }} />
              <input type="number" step={0.5} value={j.offset?.[1] ?? 0} title="沿 V 偏移 mm" onChange={(e) => setJointValue(j.id, { offset: [j.offset?.[0] ?? 0, Number(e.target.value), j.offset?.[2] ?? 0] })} style={{ width: 42 }} />
              <input type="number" step={0.5} value={j.offset?.[2] ?? 0} title="沿轴偏移 mm" onChange={(e) => setJointValue(j.id, { offset: [j.offset?.[0] ?? 0, j.offset?.[1] ?? 0, Number(e.target.value)] })} style={{ width: 42 }} />
              ∠ <input type="number" step={1} value={j.originAngle ?? 0} title="静止转角°（绕关节轴）" onChange={(e) => setJointValue(j.id, { originAngle: Number(e.target.value) })} style={{ width: 44 }} />°
              <label style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'pointer' }} title="Flip：反转关节轴向（旋转/滑动方向反）"><input type="checkbox" checked={!!j.flip} onChange={(e) => setJointValue(j.id, { flip: e.target.checked })} /> Flip</label>
            </div>
          )}
          {(j.type === 'revolute' || j.type === 'cylindrical') && (
            <>
              <label className="jp-drive">转 <input type="range" min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle} onChange={(e) => setJointValue(j.id, { angle: Number(e.target.value) })} /> {limTag(j.angle, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
              <div className="jp-lim">限位 <input type="number" value={j.aMin ?? -180} onChange={(e) => setJointValue(j.id, { aMin: Number(e.target.value) })} /> ~ <input type="number" value={j.aMax ?? 180} onChange={(e) => setJointValue(j.id, { aMax: Number(e.target.value) })} /> °
                <button className="cs-x" title="停于接触（T779）：正转直到撞到第三方组件前一刻停低（5°扫+二分 ~0.01° — 卡扣/棘轮「转到卡住」）" onClick={() => void useApp.getState().driveJointToContact(j.id, 1, 'angle')}>🧱+</button>
                <button className="cs-x" title="停于接触：反转方向" onClick={() => void useApp.getState().driveJointToContact(j.id, -1, 'angle')}>🧱−</button>
              </div>
            </>
          )}
          {(j.type === 'slider' || j.type === 'cylindrical') && (
            <>
              <label className="jp-drive">移 <input type="range" min={j.sMin ?? -120} max={j.sMax ?? 120} value={j.slide} onChange={(e) => setJointValue(j.id, { slide: Number(e.target.value) })} /> {limTag(j.slide, j.sMin ?? -120, j.sMax ?? 120, '', j.sMin != null || j.sMax != null)}</label>
              <div className="jp-lim">限位 <input type="number" value={j.sMin ?? -120} onChange={(e) => setJointValue(j.id, { sMin: Number(e.target.value) })} /> ~ <input type="number" value={j.sMax ?? 120} onChange={(e) => setJointValue(j.id, { sMax: Number(e.target.value) })} /> mm
                <button className="cs-x" title="停于接触（S98）：正向滑到撞到第三方组件前一刻停低（2mm 扫+二分 — 卡扣/抽屉「推到顶」）" onClick={() => void useApp.getState().driveJointToContact(j.id, 1, 'slide')}>🧱+</button>
                <button className="cs-x" title="停于接触：反向滑" onClick={() => void useApp.getState().driveJointToContact(j.id, -1, 'slide')}>🧱−</button>
              </div>
            </>
          )}
          {j.type === 'ball' && (
            <>
              <label className="jp-drive">绕Z <input type="range" min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle} onChange={(e) => setJointValue(j.id, { angle: Number(e.target.value) })} /> {limTag(j.angle, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
              <label className="jp-drive">绕Y <input type="range" min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle2 ?? 0} onChange={(e) => setJointValue(j.id, { angle2: Number(e.target.value) })} /> {limTag(j.angle2 ?? 0, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
              <label className="jp-drive">绕X <input type="range" min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle3 ?? 0} onChange={(e) => setJointValue(j.id, { angle3: Number(e.target.value) })} /> {limTag(j.angle3 ?? 0, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
            </>
          )}
          {j.type === 'pinslot' && (
            <>
              <label className="jp-drive" title="绕销轴转动">转 <input type="range" min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle} onChange={(e) => setJointValue(j.id, { angle: Number(e.target.value) })} /> {limTag(j.angle, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
              <label className="jp-drive" title="沿槽向滑动（槽向 ⊥ 销轴，自动取基向 — 同平面关节 U 向同约定）">滑 <input type="range" min={j.sMin ?? -120} max={j.sMax ?? 120} value={j.slide} onChange={(e) => setJointValue(j.id, { slide: Number(e.target.value) })} /> {limTag(j.slide, j.sMin ?? -120, j.sMax ?? 120, '', j.sMin != null || j.sMax != null)}</label>
              <div className="jp-lim">滑限 <input type="number" value={j.sMin ?? -120} onChange={(e) => setJointValue(j.id, { sMin: Number(e.target.value) })} /> ~ <input type="number" value={j.sMax ?? 120} onChange={(e) => setJointValue(j.id, { sMax: Number(e.target.value) })} /> mm（长槽调节位标准关节）</div>
            </>
          )}
          {j.type === 'planar' && (
            <>
              <label className="jp-drive">移U <input type="range" min={j.sMin ?? -120} max={j.sMax ?? 120} value={j.slide} onChange={(e) => setJointValue(j.id, { slide: Number(e.target.value) })} /> {limTag(j.slide, j.sMin ?? -120, j.sMax ?? 120, '', j.sMin != null || j.sMax != null)}</label>
              <label className="jp-drive">移V <input type="range" min={j.sMin ?? -120} max={j.sMax ?? 120} value={j.slide2 ?? 0} onChange={(e) => setJointValue(j.id, { slide2: Number(e.target.value) })} /> {limTag(j.slide2 ?? 0, j.sMin ?? -120, j.sMax ?? 120, '', j.sMin != null || j.sMax != null)}</label>
              <label className="jp-drive">转 <input type="range" min={j.aMin ?? -180} max={j.aMax ?? 180} value={j.angle} onChange={(e) => setJointValue(j.id, { angle: Number(e.target.value) })} /> {limTag(j.angle, j.aMin ?? -180, j.aMax ?? 180, '°', j.aMin != null || j.aMax != null)}</label>
            </>
          )}
          {j.type === 'screw' && (
            <>
              <label className="jp-drive" title="转动驱动；同步沿轴进给 = 转角/360 × 导程">转 <input type="range" min={j.aMin ?? -1080} max={j.aMax ?? 1080} value={j.angle} onChange={(e) => setJointValue(j.id, { angle: Number(e.target.value) })} /> {limTag(j.angle, j.aMin ?? -1080, j.aMax ?? 1080, '°', j.aMin != null || j.aMax != null)}</label>
              <div className="jp-lim" title="导程：每转一圈轴向进给 mm（公制螺纹的螺距×线数）">导程 <input type="number" step={0.1} value={j.lead ?? 1.5} onChange={(e) => setJointValue(j.id, { lead: Number(e.target.value) })} style={{ width: 56 }} /> mm/转 · 进给 {(((j.angle || 0) / 360) * (j.lead ?? 0)).toFixed(2)}mm</div>
            </>
          )}
          {(j.type === 'revolute' || j.type === 'slider' || j.type === 'cylindrical' || j.type === 'ball' || j.type === 'planar' || j.type === 'pinslot') && (
            <div className="jp-lim" style={{ flexWrap: 'wrap', gap: 4 }}>
              <button
                className={'cs-x' + (dynFor === j.id ? ' on' : '')}
                style={dynFor === j.id ? { color: '#ff8a2a', fontWeight: 700 } : undefined}
                title="趋势级：点质量@质心 + 单自由度 + 半隐式欧拉积分，非商用多体动力学"
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
              >⚙ 动力学</button>
              {dynFor === j.id && (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }} title="趋势级：点质量@质心、半隐式欧拉积分。多自由度关节会在同一帧同步回放全部坐标；并非带耦合惯量矩阵/接触求解的商用多体动力学。">
                  质量 <input type="number" step={0.1} min={0} value={dynMass} onChange={(e) => setDynMass(Number(e.target.value))} style={{ width: 48 }} />kg
                  k <input type="number" step={0.1} value={dynK} onChange={(e) => setDynK(Number(e.target.value))} style={{ width: 44 }} title={j.type === 'slider' || j.type === 'planar' ? '主自由度弹簧刚度 N/mm' : '主自由度弹簧刚度（扭转）'} />
                  c <input type="number" step={0.1} min={0} value={dynC} onChange={(e) => setDynC(Number(e.target.value))} style={{ width: 44 }} title="阻尼系数" />
                  q0 <input type="number" step={0.1} value={dynQ0} onChange={(e) => setDynQ0(Number(e.target.value))} style={{ width: 44 }} title={j.type === 'slider' || j.type === 'planar' ? '主自由度弹簧自然位 mm' : '主自由度弹簧自然位 °'} />
                  初始 <input type="number" step={0.1} value={dynQ0v} onChange={(e) => setDynQ0v(Number(e.target.value))} style={{ width: 44 }} title={j.type === 'slider' || j.type === 'planar' ? '主自由度初始位 mm；其他自由度保留当前值' : '主自由度初始位 °；其他自由度保留当前值'} />{j.type === 'slider' || j.type === 'planar' ? 'mm' : '°'}
                  <button className="cs-btn" title="求解趋势级动力学并生成轨迹" onClick={() => { setMsPlaying(false); runMotionStudy(j.id, { mass: dynMass, k: dynK, c: dynC, q0: dynQ0, q0v: dynQ0v }) }}>求解</button>
                </span>
              )}
              {motionStudy && motionStudy.jointId === j.id && (
                <>
                  <button className={'cs-btn' + (msPlaying ? ' on' : '')} title={`回放 ${motionStudy.q.length} 帧 / ${motionStudy.tEnd}s（真实时间步进）`} onClick={() => { setPlaying(false); setKfPlaying(false); setMsPlaying((p) => !p) }}>{msPlaying ? '⏸ 停' : '▶ 播放'}</button>
                  <button className="cs-x" title="清除 Motion Study 轨迹" onClick={() => { setMsPlaying(false); clearMotionStudy() }}>✕清</button>
                  <span style={{ color: '#8a939c', fontSize: 11 }}>{motionStudy.q.length}帧/{motionStudy.tEnd}s</span>
                </>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="jp-add">
        <select value={parent} onChange={(e) => setParent(e.target.value)}>{components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <span>→</span>
        <select value={child} onChange={(e) => setChild(e.target.value)}>{components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select value={type} onChange={(e) => setType(e.target.value as JointType)}>{TYPES.map((t) => <option key={t} value={t}>{JOINT_LABEL[t]}</option>)}</select>
        <select value={axis} onChange={(e) => setAxis(e.target.value as 'X' | 'Y' | 'Z')} disabled={!!originRef} title={originRef ? '已引用关节原点 — 轴由原点决定' : '关节轴（X/Y/Z）'}>{AXES.map((a) => <option key={a.k} value={a.k}>{a.k} 轴</option>)}</select>
        {jointOrigins.length > 0 && (
          <select value={originRef} onChange={(e) => setOriginRef(e.target.value)} title="父件关节原点：作为关节锚点与轴。选择两个原点可先对准子件位置。">
            <option value="">父件：默认件心</option>
            {jointOrigins.map((o) => <option key={o.id} value={o.id}>⚓ {o.name}</option>)}
          </select>
        )}
        {jointOrigins.length > 0 && originRef && (
          <select value={childOriginRef} onChange={(e) => setChildOriginRef(e.target.value)} title="子件关节原点：与父件原点配对时，子件會先平移到相同位置。">
            <option value="">子件：不配对</option>
            {jointOrigins.map((o) => <option key={o.id} value={o.id}>⚓ {o.name}</option>)}
          </select>
        )}
        <button className="cs-btn" onClick={add}>+ 关节</button>
        {hasMovable && <button className={'cs-btn' + (playing ? ' on' : '')} onClick={() => { setMsPlaying(false); setKfPlaying(false); setPlaying((p) => !p) }}>{playing ? '⏸ 停' : '▷ 运动'}</button>}
        {joints.length > 0 && <button className="cs-btn" title="把所有关节角度/位移归零，机构回到初始姿态" onClick={() => { setPlaying(false); setMsPlaying(false); setKfPlaying(false); useApp.getState().homeJoints() }}>⌂ 归零</button>}
        {joints.length > 0 && <button className="cs-btn" title="捕捉位置：把当前所有关节角度/位移存为命名姿态，一键套回（Fusion Capture Position）" onClick={async () => { const nm = await useApp.getState().appPrompt('姿态名称', `姿态${jointPoses.length + 1}`); if (nm != null) useApp.getState().saveJointPose(nm) }}>📍 捕捉位置</button>}
      </div>

      {jointOrigins.length > 0 && (
        <div className="jp-mlink">
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }}>關節原點（Joint Origins）</div>
          {jointOrigins.map((jo) => (
            <div key={jo.id} className="jp-row" style={{ flexWrap: 'wrap', gap: 4, fontSize: 12 }}>
              <span style={{ flex: 1 }} title={`${jo.mode === 'twoFaces' ? '兩面之間' : '簡單'} · ${jo.point.map((v) => v.toFixed(1)).join(', ')}`}>⚓ {jo.name}</span>
              <span title="繞原點 Z 軸旋轉角度">∠</span>
              <input type="number" step={1} value={jo.angle} title="角度（°）" onChange={(e) => useApp.getState().updateJointOrigin(jo.id, { angle: Number(e.target.value) })} style={{ width: 43 }} />°
              <span title="世界 X/Y/Z 偏移（mm）">偏</span>
              {[0, 1, 2].map((i) => <input key={i} type="number" step={0.5} value={jo.offset[i]} title={`${['X', 'Y', 'Z'][i]} 偏移（mm）`} onChange={(e) => { const offset: [number, number, number] = [...jo.offset] as [number, number, number]; offset[i as 0 | 1 | 2] = Number(e.target.value); useApp.getState().updateJointOrigin(jo.id, { offset }) }} style={{ width: 39 }} />)}
              <button className={'cs-btn' + (jo.flip ? ' on' : '')} title="反轉關節原點 Z 軸" onClick={() => useApp.getState().updateJointOrigin(jo.id, { flip: !jo.flip })}>⇅</button>
              <button className="cs-x" title="重新命名關節原點" onClick={async () => { const name = await useApp.getState().appPrompt('關節原點名稱', jo.name); if (name?.trim()) useApp.getState().updateJointOrigin(jo.id, { name: name.trim() }) }}>✎</button>
            </div>
          ))}
        </div>
      )}

      {/* GM-3DV4 A8：一级刚性组节点（可抑制/删除；亦见浏览器「刚性组」组） */}
      {rigidGroups.length > 0 && (
        <div className="jp-mlink">
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }}>刚性组（Rigid Group）</div>
          {rigidGroups.map((g) => (
            <div key={g.id} className="jp-row" style={{ fontSize: 12 }}>
              <span style={{ flex: 1, opacity: g.suppressed ? 0.5 : 1 }} title={`${g.members.length} 件焊为一体${g.suppressed ? '（已抑制 — 各自自由）' : ''}`}>🔗 {g.name}（{g.members.length}）{g.suppressed ? ' · 已抑制' : ''}</span>
              <button className="cs-x" title={g.suppressed ? '恢复刚性组（重新焊为一体）' : '抑制刚性组（成员释放自由郁）'} onClick={() => useApp.getState().toggleRigidGroupSuppressed(g.id)}>{g.suppressed ? '▷' : '⏸'}</button>
              <button className="cs-x" title="删除刚性组（成员释放）" onClick={() => useApp.getState().removeRigidGroup(g.id)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* GM-3DV4 A9：命名逐对接触集（全局「接触」关时只检呢啲对 — scoped/快） */}
      {components.length >= 2 && (
        <div className="jp-mlink" ref={contactRef}>
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }} title="命名接触集：全局🧱开 = All（全部相撞）；全局关但登记咗对 → 只检呢啲对（scoped，齿轮啮合/卡扣局部接触用）">命名接触集（Contact Sets）{contactSetsOn ? ' · 全局All 开' : ''}</div>
          {contactPairs.map((p) => (
            <div key={p.id} className="jp-row" style={{ fontSize: 12 }}>
              <span style={{ flex: 1 }}>🧱 {p.name}</span>
              <button className="cs-x" title="删除此接触集" onClick={() => useApp.getState().removeContactPair(p.id)}>✕</button>
            </div>
          ))}
          <div className="jp-add">
            <select value={csA || components[0]?.id} onChange={(e) => setCsA(e.target.value)}>{components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <span>↔</span>
            <select value={csB || components[1]?.id} onChange={(e) => setCsB(e.target.value)}>{components.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <button className="cs-btn" title="登记一对命名接触集" onClick={() => useApp.getState().addContactPair(csA || components[0]?.id, csB || components[1]?.id)}>+ 接触对</button>
          </div>
        </div>
      )}

      {jointPoses.length > 0 && (
        <div className="jp-mlink">
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }}>捕捉位置（Capture Position）</div>
          {jointPoses.map((p, i) => (
            <div key={i} className="jp-row" style={{ fontSize: 12 }}>
              <button className="cs-btn" style={{ flex: 1, textAlign: 'left' }} title="套用此姿态（机构跳到捕捉时嘅角度/位移）" onClick={() => { setPlaying(false); setMsPlaying(false); setKfPlaying(false); useApp.getState().applyJointPose(i) }}>▷ {p.name}</button>
              <button className="cs-x" title="删除此姿态" onClick={() => useApp.getState().deleteJointPose(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {joints.length > 0 && (
        <div className="jp-mlink">
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }}>关键帧动画（Keyframe Animation）</div>
          <div className="jp-row" style={{ fontSize: 12, gap: 6, alignItems: 'center' }}>
            <span style={{ minWidth: 14 }}>t</span>
            <input type="range" min={0} max={Math.max(1, kfEnd)} step={0.05} value={Math.min(kfTime, Math.max(1, kfEnd))} title="拖动时间轴：相邻关键帧之间线性插值驱动机构（scrub）" onChange={(e) => { const v = Number(e.target.value); setKfPlaying(false); setKfTime(v); useApp.getState().applyJointTime(v) }} style={{ flex: 1 }} />
            <span style={{ minWidth: 38, color: '#8a939c' }}>{kfTime.toFixed(2)}s</span>
          </div>
          <div className="jp-row" style={{ gap: 6 }}>
            <button className="cs-btn" style={{ flex: 1 }} title={`喺 t=${kfTime.toFixed(2)}s 加一个关键帧（快照当前所有关节角度/位移）— 同 t 会覆盖`} onClick={() => { setKfPlaying(false); useApp.getState().addJointKeyframe(kfTime) }}>◆ 加关键帧 @ {kfTime.toFixed(2)}s</button>
            {jointKeyframes.length >= 2 && <button className={'cs-btn' + (kfPlaying ? ' on' : '')} title="从 0 扫到末帧回放（真实时间）" onClick={() => { setPlaying(false); setMsPlaying(false); setKfPlaying((p) => !p) }}>{kfPlaying ? '⏸ 停' : '▶ 播放'}</button>}
          </div>
          {jointKeyframes.map((kf, i) => (
            <div key={i} className="jp-row" style={{ fontSize: 12 }}>
              <button className="cs-btn" style={{ flex: 1, textAlign: 'left' }} title="跳到此关键帧时刻" onClick={() => { setKfPlaying(false); setKfTime(kf.t); useApp.getState().applyJointTime(kf.t) }}>◆ {kf.t.toFixed(2)}s</button>
              <button className="cs-x" title="删除此关键帧" onClick={() => { setKfPlaying(false); useApp.getState().deleteJointKeyframe(i) }}>✕</button>
            </div>
          ))}
          {jointKeyframes.length < 2 && <div style={{ fontSize: 11, color: '#8a939c' }}>加 ≥2 个关键帧即可播放（拖动机构到位 → 调时间 t → 加关键帧）</div>}
        </div>
      )}

      {rotJoints.length >= 2 && (
        <div className="jp-mlink" ref={motionLinkRef}>
          <div className="jp-title" style={{ fontSize: 12, marginTop: 8 }}>运动连接（齿轮比）</div>
          {motionLinks.map((l) => (
            <div key={l.id} className="jp-row" style={{ fontSize: 12 }}>
              <span>{l.driver}{l.driver2 ? `+${l.driver2}` : ''} 驱动 {l.driven} · {l.kind === 'rack' ? `齿条 角→移 ${l.ratio.toFixed(3)} mm/°` : l.driver2 ? `= ${l.ratio}×${l.driver} + ${l.ratio2}×${l.driver2}` : `比 ${l.ratio}`}</span>
              <button className="cs-x" title="删除运动连接" onClick={() => removeMotionLink(l.id)}>✕</button>
            </div>
          ))}
          <div className="jp-add">
            <select value={mlDrv || rotJoints[0]?.id} onChange={(e) => setMlDrv(e.target.value)} title="主动关节">{rotJoints.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select>
            <span>→</span>
            <select value={mlDvn || rotJoints[1]?.id} onChange={(e) => setMlDvn(e.target.value)} title="从动关节">{rotJoints.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select>
            <input type="number" step={0.1} value={mlRatio} title="传动比：齿轮啮合用 -(主齿数/从齿数)，例 -1（同径反向）" onChange={(e) => setMlRatio(Number(e.target.value))} style={{ width: 52 }} />
            <button className="cs-btn" onClick={() => addMotionLink(mlDrv || rotJoints[0]?.id, mlDvn || rotJoints[1]?.id, mlRatio, undefined, ml2On && rotJoints.length >= 3 ? (mlDrv2 || rotJoints[2]?.id) : undefined, ml2On ? mlRatio2 : undefined)}>+ 连接</button>
          </div>
          {rotJoints.length >= 3 && (
            <div className="jp-add" style={{ fontSize: 11, alignItems: 'center', gap: 4, marginTop: 2 }} title="双驱动（行星动画）：从动 = 比1×驱动1 + 比2×驱动2 — 行星轮自转 = a×太阳 + b×行星架。勾选后「+ 连接」带埋第二驱动">
              <label style={{ display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}><input type="checkbox" checked={ml2On} onChange={(e) => setMl2On(e.target.checked)} /> 双驱动</label>
              {ml2On && (<>
                <span>＋</span>
                <select value={mlDrv2 || rotJoints[2]?.id} onChange={(e) => setMlDrv2(e.target.value)} title="第二驱动关节">{rotJoints.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}</select>
                <span>×</span>
                <input type="number" step={0.1} value={mlRatio2} title="第二驱动嘅比" onChange={(e) => setMlRatio2(Number(e.target.value))} style={{ width: 52 }} />
              </>)}
            </div>
          )}
          <div className="jp-add" style={{ fontSize: 11, alignItems: 'center', gap: 4, marginTop: 2 }} title="由齿数自动算齿轮传动比 = −(主齿数/从齿数)（啮合反向）。撳「算比」填入上方传动比框">
            <span style={{ color: '#8a939c' }}>齿数</span>
            <input type="number" min={1} value={mlZ1} onChange={(e) => setMlZ1(Math.max(1, Number(e.target.value)))} style={{ width: 44 }} title="主动齿轮齿数 z1" />
            <span>/</span>
            <input type="number" min={1} value={mlZ2} onChange={(e) => setMlZ2(Math.max(1, Number(e.target.value)))} style={{ width: 44 }} title="从动齿轮齿数 z2" />
            <button className="cs-btn" title="齿轮比 = −z1/z2（啮合反向）" onClick={() => setMlRatio(-(mlZ1 / mlZ2))}>算比 = −{(mlZ1 / mlZ2).toFixed(3)}</button>
          </div>
        </div>
      )}
    </div>
  )
}
