import { activeModelCommand } from '../cad/commandAvailability'
import { useState, useRef, useEffect, type ReactNode } from 'react'
import { ToolIcon } from '../icons'
import { useApp, MATERIALS, compWorldMatrix, datumVisKey, type AppState } from '../store'
import { tStatus } from '../i18n'

// GM-W2 2.2 情境化（对标 Fusion）：草图模式中锁破坏性删除 — 正画紧嘅草图可能依赖被删对象
//（参考面/组件面/构造轴），完成草图先至俾删。返回 true = 已拦截（调用处直接 return）。
function skDelGuard(): boolean {
  const s = useApp.getState()
  if (s.mode !== 'sketch') return false
  useApp.setState({ status: tStatus('草图模式中 — 请先「完成草图」再删除（草图可能依赖此对象）', s.lang) })
  return true
}
const SK_LOCK_STYLE = { opacity: 0.35, cursor: 'not-allowed' } as const

// 用 Record<string> 而非 Record<Feature['type']>：令 cast 加入嘅类型（extgroup/featpattern 等用 `as Feature` 绕过 union）
// 都摆得入嚟显示靚 label；配合下面 lookup 嘅兜底，任何未知/新版特征类型都唔会 crash 成个浏览树。
const FEAT: Record<string, { icon: string; label: string }> = {
  offsetsolid: { icon: 'scale', label: '整体偏移' },
  extrude: { icon: 'extrude', label: '拉伸' },
  revolve: { icon: 'revolve', label: '旋转' },
  fillet: { icon: 'fillet', label: '圆角' },
  chamfer: { icon: 'chamfer', label: '倒角' },
  shell: { icon: 'shell', label: '抽壳' },
  pattern: { icon: 'pattern', label: '阵列' },
  prim: { icon: 'box', label: '原语' },
  thread: { icon: 'default', label: '螺纹杆' },
  ithread: { icon: 'hole', label: '内螺纹孔' },
  cylpatch: { icon: 'default', label: '曲面贴花' },
  sheetmetal: { icon: 'default', label: '钣金件' },
  pathpattern: { icon: 'pattern', label: '路径阵列' },
  gear: { icon: 'default', label: '齿轮' },
  rack: { icon: 'default', label: '齿条' },
  pulley: { icon: 'default', label: 'V带轮' },
  mirror: { icon: 'mirror', label: '镜像' },
  loft: { icon: 'loft', label: '放样' },
  surfloft: { icon: 'loft', label: '曲面放样' },
  surfpatch: { icon: 'loft', label: '曲面 Patch' },
  boundarypatch: { icon: 'loft', label: '边界补面' },
  surfsew: { icon: 'shell', label: '缝合 Stitch' },
  surfunstitch: { icon: 'shell', label: '取消缝合' },
  surfextrude: { icon: 'extrude', label: '曲面拉伸' },
  surfsweep: { icon: 'sweep', label: '曲面扫掠' },
  surfrevolve: { icon: 'revolve', label: '曲面旋转' },
  ruled: { icon: 'loft', label: '规则曲面' },
  surftrim: { icon: 'shell', label: '平面裁剪' },
  surfsurftrim: { icon: 'shell', label: '曲面裁剪' },  // S155 曲面-曲面裁剪
  untrim: { icon: 'shell', label: '去裁/还原' },
  mergefaces: { icon: 'shell', label: '合并面' },  // S 合并同域邻面 Unify-Same-Domain
  editpoles: { icon: 'loft', label: '编辑曲面控制点' },  // S133 NURBS 极点编辑
  sweep: { icon: 'sweep', label: '扫掠' },
  coil: { icon: 'default', label: '螺旋' },
  scale: { icon: 'scale', label: '缩放' },
  draft: { icon: 'draft', label: '拔模' },
  cpattern: { icon: 'pattern', label: '环形阵列' },
  copybody: { icon: 'newbody', label: '复制实体' },
  transform: { icon: 'move', label: '移动' },
  pushpull: { icon: 'presspull', label: '按拉' },
  delface: { icon: 'presspull', label: '删面' },
  thickenface: { icon: 'shell', label: '加厚面' },
  offsetsurf: { icon: 'loft', label: '偏移曲面' },
  reversesurf: { icon: 'shell', label: '翻转曲面' },  // S157 翻转曲面定向
  thickenquilt: { icon: 'shell', label: '加厚整张曲面' },  // S182 加厚 quilt → 实体
  extendface: { icon: 'extrude', label: '曲面延伸' },
  splitface: { icon: 'default', label: '分割面' },
  replaceface: { icon: 'default', label: '替换面' },
  moveface: { icon: 'replaceface', label: '移动面' },  // GM-B2
  rib: { icon: 'default', label: '加强筋' },
  text: { icon: 'default', label: '文字' },
  newbody: { icon: 'box', label: '新实体' },
  bodyboolean: { icon: 'combine', label: '实体布尔' },
  split: { icon: 'default', label: '分割' },  // S128：参数化分割（保历史）
  stepbody: { icon: 'insert', label: 'STEP实体' },
  sketch: { icon: 'sketch', label: '草图' },  // T756：独立草图
  circPattern: { icon: 'pattern', label: '环形阵列' },  // T757
  meshbody: { icon: 'insert', label: '网格实体' },  // T767
  worm: { icon: 'default', label: '蜗杆' },          // T770
  crowngear: { icon: 'default', label: '冠齿轮' },   // T770
  othread: { icon: 'default', label: '面外螺纹' },   // T775
  extgroup: { icon: 'extrude', label: '拉伸组' },    // 多轮廓拉伸打包节点（用 as Feature cast，唔喺 union）
  featpattern: { icon: 'pattern', label: '阵列' },   // 可编辑阵列组节点（T#148）
}

function Section({ label, defaultOpen = true, children }: { label: string; defaultOpen?: boolean; children?: ReactNode }) {
  const lang = useApp((s) => s.lang)
  const [open, setOpen] = useState(defaultOpen)
  const has = !!children
  return (
    <div>
      <div className="tree-row" onClick={() => has && setOpen(!open)}>
        <span className="tw-toggle">{has ? (open ? '▾' : '▸') : ''}</span>
        <span className="tw-ico"><ToolIcon name="default" size={13} /></span>
        <span>{tStatus(label, lang)}</span>
      </div>
      {open && has && <div style={{ paddingLeft: 14 }}>{children}</div>}
    </div>
  )
}

function Leaf({ icon, label, depth = 1, onClick, sel = false, err }: { icon: string; label: string; depth?: number; onClick?: () => void; sel?: boolean; err?: string }) {
  const lang = useApp((s) => s.lang)
  return (
    <div className={'tree-row' + (sel ? ' sel' : '') + (err ? ' err' : '')} style={{ paddingLeft: 6 + depth * 12 }} onClick={onClick}>
      <span className="tw-toggle" />
      <span className="tw-ico"><ToolIcon name={icon} size={13} /></span>
      <span>{tStatus(label, lang)}</span>
      {err && <span className="tw-err" title={tStatus('重建失败：', lang) + err}>🔴</span>}
    </div>
  )
}

// Origin-plane row: clicking it starts a new sketch on that datum plane (Fusion behaviour).
function PlaneLeaf({ plane, label }: { plane: 'XY' | 'XZ' | 'YZ'; label: string }) {
  const lang = useApp((s) => s.lang)
  const choose = useApp((s) => s.chooseSketchPlane)
  const active = useApp((s) => (s.mode === 'sketch' ? s.sketchPlane : null))
  return (
    <div className={'tree-row' + (active === plane ? ' sel' : '')} style={{ paddingLeft: 18 }} onClick={() => choose(plane)} title={tStatus(`在 ${label} 上新建草图`, lang)}>
      <span className="tw-toggle" />
      <span className="tw-ico"><ToolIcon name="plane" size={13} /></span>
      <span style={{ flex: 1 }}>{tStatus(label, lang)}</span>
      <span className="tw-act" title={tStatus('新建草图', lang)}>✎</span>
    </div>
  )
}

// GM-W6 F2：草图行 — 单击选中（独立草图，拉伸/旋转直接用）；双击重开（消费中）或改名（Alt+双击 / 孤儿）；孤儿草图（消费特征已删）显示（未使用）+「重开」「🗑」掣。
function SketchRow({ k }: { k: string }) {
  const lang = useApp((s) => s.lang)
  const skLock = useApp((s) => s.mode === 'sketch' || s.formMode)
  const src = useApp((s) => s.sketchSources[k])
  const features = useApp((s) => s.features)
  const selSketch = useApp((s) => s.selSketch)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  if (!src) return null
  const defaultLabel = k.replace('sk', '草图')
  // 孤儿判定：冇任何特征经 sketchId 或 sketchIds（loft 截面）引用佢 = 未使用。消费特征删除后仍可能残留（旧档 liveSketchSources 剪除前保存 / undo）。
  const referenced = features.some((f) => (f as { sketchId?: string }).sketchId === k || ((f as { sketchIds?: string[] }).sketchIds?.includes(k) ?? false))
  const standalone = features.some((f) => f.type === 'sketch' && (f as { sketchId?: string }).sketchId === k)
  const orphan = !referenced
  const commit = () => { useApp.getState().renameSketchSrc(k, name); setEditing(false) }
  return (
    <div className="tree-row" style={{ paddingLeft: 18, ...(selSketch === k ? { background: 'rgba(21,114,196,.14)', borderRadius: 4 } : {}) }}
      title={tStatus(`${src.name || defaultLabel} — ${src.shapes.length} 个轮廓 · ${src.cons.length} 个约束${src.arb ? ' · 斜面' : ` · ${src.plane}`}${standalone ? ' · 独立草图 — 单击选中（拉伸/旋转直接用）' : ''}${orphan ? '（未使用 — 消费特征已删；「重开」还原做独立草图 / 🗑删除）' : referenced ? ' — 双击重开编辑' : ''}（Alt+双击 = 改名）`, lang)}
      onClick={() => standalone && useApp.getState().setSelSketch(selSketch === k ? null : k)}
      onDoubleClick={(e) => { if (referenced && !e.altKey) useApp.getState().editSketchBySrc(k); else { setName(src.name || defaultLabel); setEditing(true) } }}>
      <span className="tw-toggle" />
      <span className="tw-ico"><ToolIcon name="sketch" size={13} /></span>
      {editing ? (
        <input className="tree-rename" aria-label={tStatus('重命名草图', lang)} value={name} autoFocus
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(false); e.stopPropagation() }} />
      ) : (
        <span style={{ flex: 1, opacity: src.visible ? 1 : 0.55 }}>{src.name ? src.name : tStatus(defaultLabel, lang)}{standalone ? tStatus('·独立', lang) : ''}{orphan ? tStatus('（未使用）', lang) : ''}{src.cons.length ? tStatus(` ·${src.cons.length}约束`, lang) : ''}</span>
      )}
      {orphan && <span className="tw-act" title={tStatus('重开编辑此未使用草图（会还原做独立草图，之后可拉伸/旋转/删除）', lang)} onClick={(e) => { e.stopPropagation(); void useApp.getState().reopenOrphanSketch(k) }}>{tStatus('重开', lang)}</span>}
      <span className="tw-act" title={src.visible ? tStatus('隐藏草图', lang) : tStatus('喺模型上显示草图（紫色线）', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleSketchVis(k) }}>{src.visible ? '👁' : '─'}</span>
      {orphan && <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草图模式中锁定 — 完成草图后可删除' : '删除未使用草图', lang)} onClick={async (e) => { e.stopPropagation(); if (skDelGuard()) return; if (await useApp.getState().appConfirm(tStatus(`删除未使用草图「${src.name || defaultLabel}」？`, lang))) useApp.getState().deleteSketchSrc(k) }}>🗑</span>}
    </div>
  )
}

// GM-W6 F2：特征行 — 单击选中；双击改名（存 feature.name；Timeline tooltip 亦显示自订名）。
function FeatRow({ f }: { f: AppState['features'][number] }) {
  const lang = useApp((s) => s.lang)
  const selected = useApp((s) => s.selectedFeature)
  const err = useApp((s) => s.featureErrors[f.id])
  const selectFeature = useApp((s) => s.selectFeature)
  const meta = FEAT[f.type] || { icon: 'default', label: f.type }   // 兜底：未知/新版/cast 类型都唔会 undefined.icon crash
  const custom = (f as { name?: string }).name
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const commit = () => { useApp.getState().renameFeature(f.id, name); setEditing(false) }
  // GM-X4 #10：从时间轴 chip「在浏览器中查找」→ 滚动定位 + 闪烁高亮（browserFocusNonce bump 触发）。
  const focusNonce = useApp((s) => s.browserFocusNonce)
  const focusId = useApp((s) => s.browserFocusId)
  const rowRef = useRef<HTMLDivElement>(null)
  const [flash, setFlash] = useState(false)
  useEffect(() => {
    if (focusNonce > 0 && focusId === f.id) {
      rowRef.current?.scrollIntoView({ block: 'nearest' })
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 1100)
      return () => clearTimeout(t)
    }
  }, [focusNonce, focusId, f.id])
  return (
    <div ref={rowRef} className={'tree-row' + (f.id === selected ? ' sel' : '') + (err ? ' err' : '')} style={{ paddingLeft: 18, ...(flash ? { background: '#fff3c4', transition: 'background .3s', boxShadow: 'inset 0 0 0 1px #e0a83a' } : {}) }}>
      <span className="tw-toggle" />
      <span className="tw-ico"><ToolIcon name={meta.icon} size={13} /></span>
      {editing ? (
        <input className="tree-rename" aria-label={tStatus('重命名特征', lang)} value={name} autoFocus placeholder={tStatus(meta.label, lang)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(false); e.stopPropagation() }} />
      ) : (
        <span style={{ flex: 1, cursor: 'pointer' }} title={tStatus('单击选中 · 双击改名', lang)} onClick={() => selectFeature(f.id === selected ? null : f.id)} onDoubleClick={() => { setName(custom || ''); setEditing(true) }}>{custom || tStatus(meta.label, lang)}</span>
      )}
      {err && <span className="tw-err" title={tStatus('重建失败：', lang) + err}>🔴</span>}
    </div>
  )
}

// T788（S66）：组行 — 📁 名（双击改名）、checkbox 勾全组、👁 整组隐藏、⧉ 复制组（模块复用）、⇣ 移动、解组、删组。
function GroupRow({ g, depth, collapsed, onToggle }: { g: { id: string; name: string }; depth: number; collapsed: boolean; onToggle: () => void }) {
  const lang = useApp((s) => s.lang)
  const skLock = useApp((s) => s.mode === 'sketch' || s.formMode)   // GM-W2 2.2：草图态灰化删除掣
  const comps = useApp((s) => s.components)
  const checkedComps = useApp((s) => s.checkedComps)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(g.name)
  const memberIds = comps.filter((c) => c.groupId === g.id).map((c) => c.id)   // 直属成员（嵌套成员由子组行自己计）
  const app = () => useApp.getState()
  const deepIds = (() => { const sub = new Set([g.id]); let grew = true; const gs = useApp.getState().groups; while (grew) { grew = false; for (const x of gs) if (x.parentId && sub.has(x.parentId) && !sub.has(x.id)) { sub.add(x.id); grew = true } } return comps.filter((c) => c.groupId && sub.has(c.groupId)).map((c) => c.id) })()
  const allChecked = deepIds.length > 0 && deepIds.every((id) => checkedComps.includes(id))
  const allHidden = deepIds.length > 0 && deepIds.every((id) => comps.find((c) => c.id === id)?.hidden)
  return (
    <div className="tree-row" style={{ paddingLeft: 6 + depth * 14, background: '#f3f6fa' }}>
      <span style={{ cursor: 'pointer', width: 12 }} title={collapsed ? tStatus('展开组', lang) : tStatus('折叠组', lang)} onClick={onToggle}>{collapsed ? '▸' : '▾'}</span>
      <input type="checkbox" checked={allChecked} title={tStatus('勾选成组全部成员（批量操作/建嵌套组）', lang)} onClick={(e) => e.stopPropagation()} onChange={() => app().checkGroupMembers(g.id)} style={{ marginRight: 2, cursor: 'pointer' }} />
      <span className="tw-eye" title={tStatus('整组显示/隐藏（连嵌套子组）', lang)} onClick={(e) => { e.stopPropagation(); app().toggleGroupHidden(g.id) }}>{allHidden ? '🚫' : '👁'}</span>
      <span style={{ fontSize: 12 }}>📁</span>
      {editing ? (
        <input className="tree-rename" aria-label={tStatus('重命名组', lang)} value={name} autoFocus onChange={(e) => setName(e.target.value)}
          onBlur={() => { app().renameGroup(g.id, name || g.name); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { app().renameGroup(g.id, name || g.name); setEditing(false) } }} />
      ) : (
        <span style={{ flex: 1, cursor: 'pointer', fontWeight: 600 }} title={tStatus(`子装配组「${g.name}」（${deepIds.length} 件，双击改名）— 组系组织结构，关节仍系零件级`, lang)} onDoubleClick={() => { setName(g.name); setEditing(true) }}>{g.name}<span style={{ fontWeight: 400, color: '#8a97a2' }}>（{deepIds.length}）</span></span>
      )}
      <span className="tw-act" title={tStatus('复制成组（模块复用 T788）：深复制全部成员 + 组内关节（轮组插四次就系咁）', lang)} onClick={(e) => { e.stopPropagation(); app().duplicateGroup(g.id) }}>⧉</span>
      <span className="tw-act" title={tStatus('整组移动：输入 Δx,Δy,Δz（视图坐标 mm，组内关节锚点跟住搬）', lang)} onClick={async (e) => { e.stopPropagation(); const v = await useApp.getState().appPrompt(tStatus('整组移动 Δx,Δy,Δz（mm，三维视图坐标）', lang), '20,0,0'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean).map(Number); if (p.length < 1 || p.some((x) => !Number.isFinite(x))) { await useApp.getState().appAlert(tStatus('请输入数字', lang)); return } app().moveGroupBy(g.id, p[0] || 0, p[1] || 0, p[2] || 0) }}>⇣</span>
      <span className="tw-act" title={tStatus('整组旋转（S123 子装配 frame）：输入 轴,角度（X/Y/Z, 度），整个子装配绕世界质心刚性旋转。自包含刚性组准确；组内有关节会提示。', lang)} onClick={async (e) => { e.stopPropagation(); const v = await useApp.getState().appPrompt(tStatus('整组旋转 轴,角度（轴=X/Y/Z，度，例 Z,90）', lang), 'Z,90'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean); const ax = (p[0] || 'Z').toUpperCase(); const deg = Number(p[1]); if (!['X', 'Y', 'Z'].includes(ax) || !Number.isFinite(deg)) { await useApp.getState().appAlert(tStatus('请输入：轴(X/Y/Z),角度。例 Z,90', lang)); return } app().rotateGroup(g.id, ax as 'X' | 'Y' | 'Z', deg) }}>↻</span>
      <span className="tw-act" title={tStatus('解组：组拆走、成员升到上一层（组件唔删）', lang)} onClick={(e) => { e.stopPropagation(); app().dissolveGroup(g.id) }}>⛓</span>
      <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草图模式中锁定 — 完成草图后可删除' : '删除组 + 全部成员（组件可撤销）', lang)} onClick={async (e) => { e.stopPropagation(); if (skDelGuard()) return; if (await useApp.getState().appConfirm(tStatus(`删除组「${g.name}」同埋入面 ${deepIds.length} 件成员？`, lang))) app().deleteGroupDeep(g.id) }}>🗑</span>
      {memberIds.length === 0 && deepIds.length === 0 && <span style={{ fontSize: 10, color: '#a76' }}>{tStatus('（空组）', lang)}</span>}
    </div>
  )
}

// Component row: eye toggles visibility, double-click the name to rename.
const EMPTY_COMPONENT_BODIES: never[] = []

function CompRow({ c, depth = 0 }: { c: { id: string; name: string; hidden?: boolean; color?: string; material?: string; src?: { features: unknown[] }; formSource?: unknown; mesh: { vertices: number[] } }; depth?: number }) {
  const lang = useApp((s) => s.lang)
  const skLock = useApp((s) => s.mode === 'sketch' || s.formMode)   // GM-W2 2.2：草图态灰化删除掣
  const sel = useApp((s) => s.selectedComponent)
  const selectComponent = useApp((s) => s.selectComponent)
  const toggleVis = useApp((s) => s.toggleComponentVisible)
  const isolate = useApp((s) => s.isolateComponent)
  const rename = useApp((s) => s.renameComponent)
  const setColor = useApp((s) => s.setComponentColor)
  const setMaterial = useApp((s) => s.setComponentMaterial)
  const duplicate = useApp((s) => s.duplicateComponent)
  const independentize = useApp((s) => s.independentizeComponent)   // R2 P2：独立化 / Paste-New
  const mirror = useApp((s) => s.mirrorComponent)
  // R2 P2：共享定义实例计数（同一 defId 有 >1 occurrence → 显示「×N」徽章，令树里可见 def 分组）。
  const shareCount = useApp((s) => { const self = s.components.find((x) => x.id === c.id); if (!self?.defId) return 0; return s.components.filter((x) => x.defId === self.defId).length })
  const requestFit = useApp((s) => s.requestFit)
  const del = useApp((s) => s.deleteComponent)
  const checked = useApp((s) => s.checkedComps.includes(c.id))
  const toggleCheck = useApp((s) => s.toggleCheckComp)
  const commandActive = useApp(activeModelCommand)
  const componentEditing = useApp(s => s.editingComponent)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(c.name)
  const bodies = useApp((s) => {
    const live = s.components.find((x) => x.id === c.id)
    return live?.defId ? (s.componentDefs.find((d) => d.id === live.defId)?.bodies ?? EMPTY_COMPONENT_BODIES) : EMPTY_COMPONENT_BODIES
  })
  const toggleBodyVisible = useApp((s) => s.toggleComponentBodyVisible)
  const selectedBody = useApp((s) => s.selectedComponentBody)
  const selectBody = useApp((s) => s.selectComponentBody)
  return (
    <>
    <div className={'tree-row' + (c.id === sel ? ' sel' : '')} style={{ paddingLeft: 18 + depth * 14 }}>
      <input type="checkbox" checked={checked} title={tStatus('勾选以做批量操作（隐藏/显示/删除）', lang)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCheck(c.id)} style={{ marginRight: 2, cursor: 'pointer' }} />
      <span className="tw-eye" title={tStatus('显示/隐藏', lang)} onClick={(e) => { e.stopPropagation(); toggleVis(c.id) }}>{c.hidden ? '🚫' : '👁'}</span>
      <span className="tw-ico"><ToolIcon name="component" size={13} /></span>
      {editing ? (
        <input className="tree-rename" aria-label={tStatus('重命名组件', lang)} value={name} autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { rename(c.id, name || c.name); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { rename(c.id, name || c.name); setEditing(false) } }} />
      ) : (
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} title={tStatus(`「${c.name}」 ${compDimsStr(c.mesh)}（双击参数化件=进入编辑；Alt+双击=改名；点选=属性）`, lang)} onClick={() => selectComponent(c.id === sel ? null : c.id)} onDoubleClick={(e) => { const cc = useApp.getState().components.find((x) => x.id === c.id); if (cc?.formSource && !e.altKey) { useApp.getState().editFormComponent(c.id) } else if (cc?.src?.features?.length && !e.altKey) { selectComponent(c.id); void useApp.getState().editComponent(c.id) } else { setName(c.name); setEditing(true) } }}>{c.name}</span>
      )}
      {shareCount > 1 && <span title={tStatus(`${shareCount} 个实例共享同一定义 — 编辑任一，全部跟新（「独立复制」可脱离）`, lang)} style={{ fontSize: 10, fontWeight: 600, color: '#1572c4', background: 'rgba(21,114,196,.12)', borderRadius: 3, padding: '0 4px', marginRight: 2, flexShrink: 0 }}>×{shareCount}</span>}
      <button className="component-options" aria-label={`组件选项：${c.name}`} aria-expanded={c.id === sel && !componentEditing && !commandActive && !skLock} onClick={() => selectComponent(c.id === sel ? null : c.id)}>⋯</button>
    </div>
    {c.id === sel && !componentEditing && !commandActive && !skLock && <div className="component-controls" role="group" aria-label={`组件选项：${c.name}`}>
      {!!c.formSource && <button onClick={() => useApp.getState().editFormComponent(c.id)}>✎ 编辑 Form 控制笼</button>}
      {!!c.src?.features.length && <button onClick={() => void useApp.getState().editComponent(c.id)}>✎ 编辑特征／草图</button>}
      <select className="tw-mat" title={tStatus('材质（设密度→影响质量/BOM，并改颜色）', lang)} value={c.material || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => { if (e.target.value) setMaterial(c.id, e.target.value) }} style={{ fontSize: 10, maxWidth: 52, border: '1px solid #d0d6dc', borderRadius: 3 }}>
        <option value="">{tStatus('材质…', lang)}</option>
        {Object.keys(MATERIALS).filter((k) => MATERIALS[k].density).map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <input className="tw-swatch" type="color" title={tStatus('组件颜色', lang)} value={c.color || '#aab2ba'} onClick={(e) => e.stopPropagation()} onChange={(e) => setColor(c.id, e.target.value)} />
      {!c.hidden && <span className="tw-act" title={tStatus('聚焦：镜头框到此组件', lang)} onClick={(e) => { e.stopPropagation(); requestFit(c.id) }}>🎯</span>}
      <span className="tw-act" title={tStatus('物理属性（面积/质量/体积/质心/惯性，精度可调，可复制）', lang)} onClick={(e) => { e.stopPropagation(); void useApp.getState().openPropertiesDialog(c.id) }}>⚖</span>
      <span className="tw-act" title={tStatus('孤立显示（隐藏其余）', lang)} onClick={(e) => { e.stopPropagation(); isolate(c.id) }}>◎</span>
      <span className="tw-act" title={tStatus('复制组件（共享定义 — 编辑任一实例全部跟新）', lang)} onClick={(e) => { e.stopPropagation(); duplicate(c.id) }}>⧉</span>
      <span className="tw-act" title={tStatus('独立复制 / Paste-New（新定义 — 改任一唔影响对方）', lang)} onClick={(e) => { e.stopPropagation(); independentize(c.id) }}>⧉+</span>
      <span className="tw-act" title={tStatus('镜像组件：左右对称（跨 YZ 面）', lang)} onClick={(e) => { e.stopPropagation(); mirror(c.id, 'lr') }}>⇋</span>
      <span className="tw-act" title={tStatus('镜像组件：前后对称（跨 XY 面）', lang)} onClick={(e) => { e.stopPropagation(); mirror(c.id, 'fb') }}>⇅</span>
      <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草图模式中锁定 — 完成草图后可删除' : '删除组件', lang)} onClick={async (e) => { e.stopPropagation(); if (skDelGuard()) return; if (await useApp.getState().appConfirm(tStatus(`删除组件「${c.name}」？`, lang))) del(c.id) }}>🗑</span>
    </div>}
    {bodies.length > 1 && bodies.map((body) => (
      <div key={body.id} className={'tree-row' + (selectedBody?.componentId === c.id && selectedBody.bodyId === body.id ? ' sel' : '')} style={{ paddingLeft: 40 + depth * 14, minHeight: 22, opacity: body.hidden ? 0.5 : 1 }} title={`实体：${body.name}（单击选取此实体；显示状态会同步到其所有实例）`} onClick={() => selectBody(c.id, body.id)}>
        <span className="tw-toggle" />
        <span className="tw-eye" title={body.hidden ? '显示实体' : '隐藏实体'} onClick={(e) => { e.stopPropagation(); toggleBodyVisible(c.id, body.id) }}>{body.hidden ? '○' : '◉'}</span>
        <span className="tw-ico"><ToolIcon name="box" size={12} /></span>
        <span style={{ flex: 1, fontSize: 11 }}>{body.name}{body.id.endsWith('_B1') ? ' · 参数体' : ''}</span>
        {body.color && <span className="tw-swatch" style={{ background: body.color }} title="实体颜色" />}
      </div>
    ))}
    </>
  )
}

// Batch-operation bar: appears under the component list when ≥1 component is checked. Hide / show / delete
// all checked at once (reuses store batch actions). Keeps the single-select model untouched.
// World bbox-centre of a component (CAD bbox centre transformed by the single-source world matrix).
// Compact "W×D×H mm" for a component's own bbox — shown as a hover tooltip on the tree row name,
// so each part's size is identifiable at a glance without selecting it. Cheap (one bbox pass).
function compDimsStr(mesh: { vertices: number[] }): string {
  const v = mesh.vertices; if (!v.length) return '（无实体几何）'
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { const x = v[i + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x }
  return `${(mx[0] - mn[0]).toFixed(1)}×${(mx[1] - mn[1]).toFixed(1)}×${(mx[2] - mn[2]).toFixed(1)} mm`
}
function compWorldCentre(c: any): [number, number, number] | null {
  const v: number[] = c.mesh.vertices; if (!v.length) return null
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { const x = v[i + k]; if (x < mn[k]) mn[k] = x; if (x > mx[k]) mx[k] = x }
  const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2
  const M = compWorldMatrix(c).elements
  return [M[0] * cx + M[4] * cy + M[8] * cz + M[12], M[1] * cx + M[5] * cy + M[9] * cz + M[13], M[2] * cx + M[6] * cy + M[10] * cz + M[14]]
}

// T788（S66）：嵌套树渲染 — 顶层 = 无 parentId 嘅组 + 无 groupId 嘅组件；组内递归（子组 + 直属成员缩进）。
function GroupedCompList({ components }: { components: { id: string; name: string; hidden?: boolean; color?: string; material?: string; groupId?: string; mesh: { vertices: number[] } }[] }) {
  const groups = useApp((s) => s.groups)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const validGroup = (gid?: string) => !!gid && groups.some((g) => g.id === gid)
  const renderGroup = (g: { id: string; name: string; parentId?: string }, depth: number): ReactNode => (
    <div key={g.id}>
      <GroupRow g={g} depth={depth} collapsed={!!collapsed[g.id]} onToggle={() => setCollapsed((m) => ({ ...m, [g.id]: !m[g.id] }))} />
      {!collapsed[g.id] && groups.filter((cg) => cg.parentId === g.id).map((cg) => renderGroup(cg, depth + 1))}
      {!collapsed[g.id] && components.filter((c) => c.groupId === g.id).map((c) => <CompRow key={c.id} c={c} depth={depth + 1} />)}
    </div>
  )
  return (
    <>
      {groups.filter((g) => !g.parentId || !groups.some((x) => x.id === g.parentId)).map((g) => renderGroup(g, 0))}
      {components.filter((c) => !validGroup(c.groupId)).map((c) => <CompRow key={c.id} c={c} depth={0} />)}
    </>
  )
}

function CompBatchBar() {
  const lang = useApp((s) => s.lang)
  const skLock = useApp((s) => s.mode === 'sketch' || s.formMode)   // GM-W2 2.2：草图态灰化批量删除
  const n = useApp((s) => s.checkedComps.length)
  const checkedIds = useApp((s) => s.checkedComps)
  const allComps = useApp((s) => s.components)
  const batchHide = useApp((s) => s.batchSetHiddenChecked)
  const batchDel = useApp((s) => s.batchDeleteChecked)
  const batchMat = useApp((s) => s.batchSetMaterialChecked)
  const batchZip = useApp((s) => s.batchExportCheckedZip)
  const align = useApp((s) => s.alignCheckedComps)
  const distribute = useApp((s) => s.distributeCheckedComps)
  const clear = useApp((s) => s.clearCheckedComps)
  if (n === 0) return null
  return (
    <div className="tree-row tree-showall" style={{ paddingLeft: 18, gap: 6, display: 'flex', flexWrap: 'wrap', fontSize: 11, background: '#eef4fb' }}>
      <b>{tStatus('已选', lang)} {n}</b>
      <span className="tw-act" title={tStatus('批量隐藏勾选的组件', lang)} onClick={() => batchHide(true)}>🚫{tStatus('隐藏', lang)}</span>
      <span className="tw-act" title={tStatus('批量显示勾选的组件', lang)} onClick={() => batchHide(false)}>👁{tStatus('显示', lang)}</span>
      <select title={tStatus('批量设材质（影响颜色 + 质量/BOM 密度）', lang)} defaultValue="" onChange={(e) => { const v = e.target.value; if (v) batchMat(v === '__clear' ? '' : v); e.currentTarget.selectedIndex = 0 }} style={{ fontSize: 11, height: 20 }}>
        <option value="">{tStatus('材质…', lang)}</option>
        {Object.keys(MATERIALS).map((k) => <option key={k} value={k}>{k}</option>)}
        <option value="__clear">{tStatus('（清除材质）', lang)}</option>
      </select>
      <span className="tw-act" title={tStatus('把勾选的组件导出为 STL 打包 zip（只导你拣嘅，方便分批 3D 打印）', lang)} onClick={() => batchZip()}>📦{tStatus('导出zip', lang)}</span>
      <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草图模式中锁定 — 完成草图后可删除' : '批量删除勾选的组件（可撤销）', lang)} onClick={async () => { if (skDelGuard()) return; if (await useApp.getState().appConfirm(tStatus(`删除勾选的 ${n} 个组件？（可 Ctrl+Z 撤销）`, lang))) batchDel() }}>🗑{tStatus('删除', lang)}</span>
      <span className="tw-act" title={tStatus('清除勾选', lang)} onClick={() => clear()}>✕{tStatus('清除勾选', lang)}</span>
      <span className="tw-act" title={tStatus('📁 建组（T788 子装配）：勾选嘅组件组成一个组 — 整组隐藏/移动/复制/BOM 分层；勾选同组成员再建组 = 嵌套子组', lang)} onClick={() => useApp.getState().createGroupFromChecked()}>📁{tStatus('建组', lang)}</span>
      {n >= 2 && <span className="tw-act" title={tStatus('刚性组（T779 Fusion Rigid Group）：勾选嘅组件锁做一组 — 第一件做头，郁佢全组跟（rigid 关节实现，可喺关节面板拆）', lang)} onClick={() => useApp.getState().rigidGroupChecked()}>🔗{tStatus('刚性组', lang)}</span>}
      {n === 2 && <select className="tw-act" defaultValue="" title={tStatus('按现状关节（T779 Fusion As-Built Joint）：两件喺而家位置直接加关节 — 拣类型即加，唔 snap 唔郁位（要改轴用拾孔定轴）', lang)} onChange={(e) => { const t = e.target.value; if (t) useApp.getState().asBuiltJointChecked(t) }}>
        <option value="">⚙{tStatus('按现状关节…', lang)}</option>
        <option value="revolute">{tStatus('转动', lang)}</option>
        <option value="rigid">{tStatus('刚性', lang)}</option>
        <option value="slider">{tStatus('滑动', lang)}</option>
        <option value="cylindrical">{tStatus('圆柱', lang)}</option>
        <option value="ball">{tStatus('球', lang)}</option>
      </select>}
      {n === 2 && (() => {
        const sel = checkedIds.map((id) => allComps.find((c) => c.id === id)).filter(Boolean) as typeof allComps
        if (sel.length !== 2) return null
        const a = compWorldCentre(sel[0]), b = compWorldCentre(sel[1])
        if (!a || !b) return null
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz)
        return <span style={{ color: '#1f8f4e' }} title={tStatus('两个勾选组件的中心距（mm，含 ΔX/Y/Z；按几何中心，不用逐个点选）', lang)}>📏 {tStatus('中心距', lang)} {d.toFixed(1)}mm（Δ {dx.toFixed(1)}, {dy.toFixed(1)}, {dz.toFixed(1)}）</span>
      })()}
      {n === 2 && <span title={tStatus('把第 2 个勾选组件的中心对齐到第 1 个（沿所选轴）', lang)}>{tStatus('对齐', lang)}<span className="tw-act" onClick={() => align(0)}>X</span><span className="tw-act" onClick={() => align(1)}>Y</span><span className="tw-act" onClick={() => align(2)}>Z</span></span>}
      {n >= 3 && <span title={tStatus('沿所选轴把勾选组件等距分布：首尾两件不动，中间各件均分到等间距（排栏杆/隔板/键帽常用）', lang)}>{tStatus('等距', lang)}<span className="tw-act" onClick={() => distribute(0)}>X</span><span className="tw-act" onClick={() => distribute(1)}>Y</span><span className="tw-act" onClick={() => distribute(2)}>Z</span></span>}
    </div>
  )
}

export default function BrowserTree() {
  const lang = useApp((s) => s.lang)
  const skLock = useApp((s) => s.mode === 'sketch' || s.formMode)   // GM-W2 2.2：草图态灰化基准删除（草图可能正建喺个参考面上）
  const features = useApp((s) => s.features)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const sketchSources = useApp((s) => s.sketchSources)   // GM-W6 F2：草图行渲染移入 SketchRow（每行自订名/孤儿重开+删除）
  const components = useApp((s) => s.components)
  const jointOrigins = useApp((s) => s.jointOrigins)   // GM-3DV4 A1：可复用关节原点
  const rigidGroups = useApp((s) => s.rigidGroups)     // GM-3DV4 A8：一级刚性组节点
  const planes = useApp((s) => s.planes)
  const cpoints = useApp((s) => s.cpoints)
  const caxes = useApp((s) => s.caxes)
  const datumHidden = useApp((s) => s.datumHidden)   // S 构造基准隐藏集（眼掣）
  const analyses = useApp((s) => s.analyses)         // GM-X1 #12：持久化分析节点

  const browserCollapsed = useApp((s) => s.browserCollapsed)
  const toggleBrowser = useApp((s) => s.toggleBrowser)
  const projectName = useApp((s) => s.projectName)
  const unit = useApp((s) => s.unit)
  const massUnit = useApp((s) => s.massUnit)   // GM-X2 #13：单位配对预设（长度+质量）
  const setUnitDlgOpen = useApp((s) => s.setUnitDlgOpen)
  const setView = useApp((s) => s.setView)
  const savedViews = useApp(s => s.viewBookmarks)
  const requestFit = useApp((s) => s.requestFit)

  // Entering a phone-sized layout frees the canvas, while the restore handle stays reachable.
  // Returning to a wider layout restores the user's previous tree preference.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)')
    let widePreference = useApp.getState().browserCollapsed
    let narrow = false
    const adapt = () => {
      if (mq.matches && !narrow) {
        widePreference = useApp.getState().browserCollapsed
        useApp.setState({ browserCollapsed: true })
      } else if (!mq.matches && narrow) useApp.setState({ browserCollapsed: widePreference })
      narrow = mq.matches
      useApp.getState().requestFit()
    }
    adapt(); mq.addEventListener('change', adapt)
    return () => mq.removeEventListener('change', adapt)
  }, [])

  // Collapsed: slim strip with ▸▸ to restore (Fusion's BROWSER panel collapse).
  if (browserCollapsed) {
    return (
      <div className="browser" role="button" aria-label="展开浏览器" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleBrowser() }} style={{ width: 26, cursor: 'pointer' }} title={tStatus('展开浏览器', lang)} onClick={() => toggleBrowser()}>
        <div className="browser-head" style={{ justifyContent: 'center', padding: 0 }}>▸▸</div>
      </div>
    )
  }

  return (
    <div className="browser">
      <div className="browser-head">
        <span style={{ cursor: 'pointer' }} title={tStatus('折叠浏览器', lang)} onClick={() => toggleBrowser()}>◂◂</span>
        <span style={{ marginLeft: 6 }}>{tStatus('浏览器', lang)}</span>
        <span style={{ marginLeft: 'auto', cursor: 'pointer', padding: '0 4px' }} title={tStatus('折叠浏览器', lang)} onClick={() => toggleBrowser()}>─</span>
      </div>
      {/* Fusion doc root row: orange cube + document name */}
      <div className="tree-row" style={{ fontWeight: 600 }}>
        <span className="tw-toggle">▾</span>
        <span className="doc-cube" style={{ flexShrink: 0 }} />
        <span style={{ marginLeft: 4 }}>{projectName || tStatus('(未保存)', lang)}</span>
      </div>
      <div style={{ paddingLeft: 8 }}>
        <Section label="文档设置" defaultOpen={false}>
          {/* GM-X2 #13：单位对话框（配对预设 长度+质量 + 自定义）。模型/导出恒 mm。 */}
          <Leaf icon="default" label={`单位: ${unit === 'inch' ? 'in' : unit} / ${massUnit}`} onClick={() => setUnitDlgOpen(true)} />
        </Section>
        <Section label="命名视图" defaultOpen={false}>
          {savedViews.map((v, i) => <Leaf key={i} icon="home" label={v.name} onClick={() => useApp.getState().applyViewBookmark(i)} />)}
          <Leaf icon="home" label="主视图" onClick={() => { setView('iso'); requestFit() }} />
          <Leaf icon="plane" label="前视图" onClick={() => setView('front')} />
          <Leaf icon="plane" label="后视图" onClick={() => setView('back')} />
          <Leaf icon="plane" label="上视图" onClick={() => setView('top')} />
          <Leaf icon="plane" label="下视图" onClick={() => setView('bottom')} />
          <Leaf icon="plane" label="右视图" onClick={() => setView('right')} />
          <Leaf icon="plane" label="左视图" onClick={() => setView('left')} />
          <Leaf icon="plane" label="等轴测" onClick={() => setView('iso')} />
        </Section>
        <Section label="原点" defaultOpen={false}>
          <PlaneLeaf plane="XY" label="XY 平面" />
          <PlaneLeaf plane="XZ" label="XZ 平面" />
          <PlaneLeaf plane="YZ" label="YZ 平面" />
          <Leaf icon="axis" label="X 轴" />
          <Leaf icon="axis" label="Y 轴" />
          <Leaf icon="axis" label="Z 轴" />
        </Section>
        {(planes.length + cpoints.length + caxes.length) > 0 && (
          <Section label={`构造 (${planes.length + cpoints.length + caxes.length})`}>
            {planes.map((pl, i) => (
              <div key={'cpl' + i} className="tree-row" style={{ paddingLeft: 18 }} onClick={() => useApp.getState().sketchOnDatumPlane(pl.base, pl.offset)} title={tStatus(`在参考平面 ${pl.base}@${pl.offset} 上新建草图`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="plane" size={13} /></span>
                <span style={{ flex: 1 }}>{tStatus('参考面', lang)} {pl.base}@{pl.offset}{pl.src && !pl.stale && <span title={tStatus('关联基准：随源面自动更新', lang)} style={{ marginLeft: 3, fontSize: 10 }}>🔗</span>}{pl.stale && <span title={tStatus('源面已改动/消失，无法自动更新此基准 — 改回或删除重建', lang)} style={{ marginLeft: 3, color: '#c98a00' }}>⚠</span>}</span>
                <span className="tw-act" title={tStatus('显示 / 隐藏此参考面', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleDatumVis(datumVisKey('pl', pl)) }}>{datumHidden.includes(datumVisKey('pl', pl)) ? '🙈' : '👁'}</span>
                {/* GM-W1 1.5：编辑 offset（角度面另可改 angle）。诚实：只郁呢块 datum 本身 — 已经喺佢上面拉伸/开咗嘅草图唔会跟住重算（timeline 关联系后续功能）。datum-pick 固定 arb 面（有 arb 无 aaxis）唔畀改 offset（无实义）。*/}
                {(pl.aaxis != null || !pl.arb) && (
                  <span className="tw-act" title={tStatus(`编辑偏移${pl.aaxis != null ? '/角度' : ''} — 改动只影响之后新画嘅草图（唔会重算已拉伸嘅特征）`, lang)} onClick={(e) => { e.stopPropagation(); void (async () => {
                    const ap = useApp.getState()
                    const ov = await ap.appPrompt(tStatus('新偏移 mm（沿基面法向平移此参考面）', lang), String(pl.offset), tStatus('编辑参考面', lang))
                    if (ov == null) return
                    const offset = Number(ov.trim())
                    if (!Number.isFinite(offset)) { useApp.setState({ status: tStatus('偏移要系数字 — 已取消', lang) }); return }
                    let angle: number | undefined
                    if (pl.aaxis != null) {
                      const av = await ap.appPrompt(tStatus('新角度°（绕基面局部轴倾斜）', lang), String(pl.angle ?? 0), tStatus('编辑角度面', lang))
                      if (av == null) return
                      const a = Number(av.trim())
                      if (!Number.isFinite(a)) { useApp.setState({ status: tStatus('角度要系数字 — 已取消', lang) }); return }
                      angle = a
                    }
                    ap.updatePlane(i, { offset, ...(angle != null ? { angle } : {}) })
                  })() }}>✏️</span>
                )}
                <span className="tw-act" title={tStatus('新建草图', lang)}>✎</span>
                <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草图模式中锁定 — 完成草图后可删除' : '删除参考平面', lang)} onClick={(e) => { e.stopPropagation(); if (skDelGuard()) return; useApp.getState().removePlane(i) }}>🗑</span>
              </div>
            ))}
            {caxes.map((ax, i) => (
              <div key={'cax' + i} className="tree-row" style={{ paddingLeft: 18 }} title={tStatus(`构造轴 ${ax.dir} @(${ax.at.join(',')})`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="axis" size={13} /></span>
                <span style={{ flex: 1 }}>{tStatus('构造轴', lang)} {ax.dir}@({ax.at.join(',')})</span>
                <span className="tw-act" title={tStatus('显示 / 隐藏此构造轴', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleDatumVis(datumVisKey('ax', ax)) }}>{datumHidden.includes(datumVisKey('ax', ax)) ? '🙈' : '👁'}</span>
                <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草图模式中锁定 — 完成草图后可删除' : '删除构造轴', lang)} onClick={(e) => { e.stopPropagation(); if (skDelGuard()) return; useApp.getState().removeCAxis(i) }}>🗑</span>
              </div>
            ))}
            {cpoints.map((p, i) => (
              <div key={'cpt' + i} className="tree-row" style={{ paddingLeft: 18 }} title={tStatus(`构造点 (${p.join(',')})`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="default" size={13} /></span>
                <span style={{ flex: 1 }}>{tStatus('构造点', lang)} ({p.join(',')})</span>
                <span className="tw-act" title={tStatus('显示 / 隐藏此构造点', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleDatumVis(datumVisKey('pt', p)) }}>{datumHidden.includes(datumVisKey('pt', p)) ? '🙈' : '👁'}</span>
                <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草图模式中锁定 — 完成草图后可删除' : '删除构造点', lang)} onClick={(e) => { e.stopPropagation(); if (skDelGuard()) return; useApp.getState().removeCPoint(i) }}>🗑</span>
              </div>
            ))}
          </Section>
        )}
        {/* GM-3DV4 A1：Joint Origins 组（Fusion 专属「Joint Origins」文件夹） */}
        {jointOrigins.length > 0 && (
          <Section label={`关节原点 (${jointOrigins.length})`}>
            {jointOrigins.map((jo) => (
              <div key={jo.id} className="tree-row" style={{ paddingLeft: 18 }} title={tStatus(`可复用关节原点「${jo.name}」@(${jo.point.map((x) => x.toFixed(1)).join(', ')}) — 建关节时喺关节面板下拉引用之（取代默认件心）`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="joint" size={13} /></span>
                <span style={{ flex: 1 }}>⚓ {jo.name}</span>
                <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草图模式中锁定 — 完成草图后可删除' : '删除关节原点（引用它的关节保留当前锚点）', lang)} onClick={(e) => { e.stopPropagation(); if (skDelGuard()) return; useApp.getState().removeJointOrigin(jo.id) }}>🗑</span>
              </div>
            ))}
          </Section>
        )}
        {/* GM-3DV4 A8：Rigid Groups 组（Fusion Rigid Group — 一级、可抑制节点） */}
        {rigidGroups.length > 0 && (
          <Section label={`刚性组 (${rigidGroups.length})`}>
            {rigidGroups.map((g) => (
              <div key={g.id} className="tree-row" style={{ paddingLeft: 18, opacity: g.suppressed ? 0.5 : 1 }} title={tStatus(`刚性组「${g.name}」：${g.members.length} 件焊为一体（第一件做头，郁佢全组跟）${g.suppressed ? ' — 已抑制' : ''}`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="joint" size={13} /></span>
                <span style={{ flex: 1 }}>🔗 {g.name}（{g.members.length}）{g.suppressed ? tStatus(' · 已抑制', lang) : ''}</span>
                <span className="tw-act" title={tStatus(g.suppressed ? '恢复刚性组（重新焊为一体）' : '抑制刚性组（成员释放自由郁）', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleRigidGroupSuppressed(g.id) }}>{g.suppressed ? '▷' : '⏸'}</span>
                <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草图模式中锁定 — 完成草图后可删除' : '删除刚性组（成员释放）', lang)} onClick={(e) => { e.stopPropagation(); if (skDelGuard()) return; useApp.getState().removeRigidGroup(g.id) }}>🗑</span>
              </div>
            ))}
          </Section>
        )}
        {components.length > 0 && (
          <Section label={`组件 (${components.length})`}>
            {components.length > 1 && (
              <div className="tree-row tree-showall" style={{ paddingLeft: 18 }} onClick={() => useApp.getState().autoColorComponents()} title={tStatus('为每个组件分配可区分的颜色', lang)}>🎨 {tStatus('自动配色', lang)}</div>
            )}
            {components.some((c) => c.hidden) && (
              <div className="tree-row tree-showall" style={{ paddingLeft: 18 }} onClick={() => useApp.getState().showAllComponents()} title={tStatus('显示所有隐藏的组件', lang)}>👁 {tStatus('显示全部', lang)}</div>
            )}
            {components.length > 1 && (
              <div className="tree-row tree-showall" style={{ paddingLeft: 18 }} onClick={() => useApp.getState().exportAllPartsZip()} title={tStatus('把每个可见零件导出为单独 STL，打包成一个 zip（每件可单独 3D 打印）', lang)}>📦 {tStatus('导出全部零件 STL(zip)', lang)}</div>
            )}
            <GroupedCompList components={components} />
            <CompBatchBar />
          </Section>
        )}
        {/* GM-X1 #12：Analysis 文件夹（Fusion 曲面/剖切分析存为可开关节点，逐个眼睛开关 + 🗑删除） */}
        {analyses.length > 0 && (
          <Section label={`分析 (${analyses.length})`}>
            {analyses.map((a) => (
              <div key={a.id} className="tree-row" style={{ paddingLeft: 18, opacity: a.visible ? 1 : 0.5 }} title={tStatus(`${a.label}${a.visible ? '（显示中）' : '（已隐藏）'} — 眼掣开关 / 🗑删除`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="draft" size={13} /></span>
                <span style={{ flex: 1 }}>{tStatus(a.label, lang)}</span>
                <span className="tw-act" title={tStatus(a.visible ? '隐藏此分析' : '显示此分析（重新套用）', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().setAnalysisNodeVisible(a.id, !a.visible) }}>{a.visible ? '👁' : '🙈'}</span>
                <span className="tw-act" title={tStatus('删除此分析节点', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().removeAnalysisNode(a.id) }}>🗑</span>
              </div>
            ))}
          </Section>
        )}
        <Section label={`实体${bodyMesh?.parked?.length ? ` (${(bodyMesh.triangles.length ? 1 : 0) + bodyMesh.parked.length})` : ''}`}>
          {bodyMesh && bodyMesh.triangles.length > 0 ? <Leaf icon="box" label={`${components.length > 0 ? '当前组件' : '活动实体'} ●`} onClick={() => void useApp.getState().openPropertiesDialog(null)} /> : null}
          {bodyMesh?.parked?.map((b, i) => <Leaf key={'pb' + i} icon="box" label={(b as any).kind === 'body' ? b.name : `${b.name}（泊车 · 灰显）`} />)}
          {!bodyMesh ? <Leaf icon="default" label="（空）" /> : null}
        </Section>
        {/* i18n: 实体 当前组件 活动实体 泊车 · 灰显 （空） 草图 特征 尚无特征 — wrapped via Leaf/Section internal tStatus */}
        {Object.keys(sketchSources).length > 0 && (
          <Section label={`草图 (${Object.keys(sketchSources).length})`}>
            {Object.keys(sketchSources).map((k) => <SketchRow key={k} k={k} />)}
          </Section>
        )}
        <Section label={`特征 (${features.length})`}>
          {features.length === 0 ? (
            <Leaf icon="default" label="（尚无特征）" />
          ) : (
            features.map((f) => <FeatRow key={f.id} f={f} />)
          )}
        </Section>
      </div>
    </div>
  )
}
