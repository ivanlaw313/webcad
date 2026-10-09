import { activeModelCommand } from '../cad/commandAvailability'
import { useState, useRef, useEffect, createContext, useContext, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react'
import { ToolIcon } from '../icons'
import { useApp, MATERIALS, compWorldMatrix, datumVisKey, type AppState } from '../store'
import { tStatus, msg, tLabel } from '../i18n'
import { treeMenuKeys, ACTIVE_BODY_KEY, parkedBodyKey, type TreeNodeKind, type TreeMenuOpts } from '../ui/contextMenus'
import { useEscapeLayer } from './useEscapeLayer'

// Browser-tree app context menu (Fusion browser right-click) — replaces Chrome's native menu on tree rows.
type TreeMenuItem = { key: string; label: string; fn: () => void; disabled?: boolean }
type TreeMenuAction = Partial<Record<string, (() => void) | undefined>>
const TreeMenuCtx = createContext<(e: ReactMouseEvent, kind: TreeNodeKind, opts: TreeMenuOpts, actions: TreeMenuAction) => void>(() => {})
const L2 = (zh: string, en: string, lang: string) => (lang === 'en' || lang === 'ja' ? en : tStatus(zh, lang as never))
// Item labels (TC source + en). 外觀/物理材質 reuse the ribbon catalogue via tLabel.
function treeItemLabel(key: string, lang: string): string {
  switch (key) {
    case 'hide': return L2('隱藏', 'Hide', lang)
    case 'show': return L2('顯示', 'Show', lang)
    case 'rename': return L2('重新命名', 'Rename', lang)
    case 'delete': return L2('刪除', 'Delete', lang)
    case 'createComp': return L2('建立組件', 'Create Component', lang)
    case 'editSketch': return L2('編輯草圖', 'Edit Sketch', lang)
    case 'edit': return L2('編輯組件', 'Edit Component', lang)
    case 'isolate': return L2('孤立顯示', 'Isolate', lang)
    case 'focus': return L2('聚焦', 'Focus', lang)
    case 'props': return L2('屬性', 'Properties', lang)
    case 'appearance': return tLabel('外觀', lang as never)
    case 'physmat': return tLabel('物理材質', lang as never)
    case 'showAll': return L2('顯示全部', 'Show All', lang)
    case 'fit': return L2('適應視窗', 'Fit to Window', lang)
    default: return key
  }
}
function useTreeMenu() { return useContext(TreeMenuCtx) }

// GM-W2 2.2 情境化（对标 Fusion）：草图模式中锁破坏性删除 — 正画紧嘅草图可能依赖被删对象
//（参考面/組件面/构造轴），完成草图先至俾删。返回 true = 已拦截（调用处直接 return）。
function skDelGuard(): boolean {
  const s = useApp.getState()
  if (s.mode !== 'sketch') return false
  useApp.setState({ status: tStatus('草圖模式中 — 請先「完成草圖」再刪除（草圖可能依賴此對象）', s.lang) })
  return true
}
const SK_LOCK_STYLE = { opacity: 0.35, cursor: 'not-allowed' } as const

// 用 Record<string> 而非 Record<Feature['type']>：令 cast 加入嘅类型（extgroup/featpattern 等用 `as Feature` 绕过 union）
// 都摆得入嚟显示靚 label；配合下面 lookup 嘅兜底，任何未知/新版特徵类型都唔会 crash 成个浏览树。
const FEAT: Record<string, { icon: string; label: string }> = {
  offsetsolid: { icon: 'scale', label: '整體偏移' },
  extrude: { icon: 'extrude', label: '拉伸' },
  revolve: { icon: 'revolve', label: '旋轉' },
  fillet: { icon: 'fillet', label: '圓角' },
  chamfer: { icon: 'chamfer', label: '倒角' },
  shell: { icon: 'shell', label: '抽殼' },
  pattern: { icon: 'pattern', label: '陣列' },
  prim: { icon: 'box', label: '原語' },
  thread: { icon: 'default', label: '螺紋桿' },
  ithread: { icon: 'hole', label: '內螺紋孔' },
  cylpatch: { icon: 'default', label: '曲面貼花' },
  sheetmetal: { icon: 'default', label: '鈑金件' },
  pathpattern: { icon: 'pattern', label: '路徑陣列' },
  gear: { icon: 'default', label: '齒輪' },
  rack: { icon: 'default', label: '齒條' },
  pulley: { icon: 'default', label: 'V帶輪' },
  mirror: { icon: 'mirror', label: '鏡像' },
  loft: { icon: 'loft', label: '放樣' },
  surfloft: { icon: 'loft', label: '曲面放樣' },
  surfpatch: { icon: 'loft', label: '曲面 Patch' },
  boundarypatch: { icon: 'loft', label: '邊界補面' },
  surfsew: { icon: 'shell', label: '縫合 Stitch' },
  surfunstitch: { icon: 'shell', label: '取消縫合' },
  surfextrude: { icon: 'extrude', label: '曲面拉伸' },
  surfsweep: { icon: 'sweep', label: '曲面掃掠' },
  surfrevolve: { icon: 'revolve', label: '曲面旋轉' },
  ruled: { icon: 'loft', label: '規則曲面' },
  surftrim: { icon: 'shell', label: '平面裁剪' },
  surfsurftrim: { icon: 'shell', label: '曲面裁剪' },  // S155 曲面-曲面裁剪
  untrim: { icon: 'shell', label: '去裁/還原' },
  mergefaces: { icon: 'shell', label: '合併面' },  // S 合并同域邻面 Unify-Same-Domain
  editpoles: { icon: 'loft', label: '編輯曲面控制點' },  // S133 NURBS 极点编辑
  sweep: { icon: 'sweep', label: '掃掠' },
  coil: { icon: 'default', label: '螺旋' },
  scale: { icon: 'scale', label: '縮放' },
  draft: { icon: 'draft', label: '拔模' },
  cpattern: { icon: 'pattern', label: '環形陣列' },
  copybody: { icon: 'newbody', label: '複製實體' },
  transform: { icon: 'move', label: '移動' },
  pushpull: { icon: 'presspull', label: '按拉' },
  delface: { icon: 'presspull', label: '刪面' },
  thickenface: { icon: 'shell', label: '加厚面' },
  offsetsurf: { icon: 'loft', label: '偏移曲面' },
  reversesurf: { icon: 'shell', label: '翻轉曲面' },  // S157 翻转曲面定向
  thickenquilt: { icon: 'shell', label: '加厚整張曲面' },  // S182 加厚 quilt → 實體
  extendface: { icon: 'extrude', label: '曲面延伸' },
  splitface: { icon: 'default', label: '分割面' },
  replaceface: { icon: 'default', label: '替換面' },
  moveface: { icon: 'replaceface', label: '移動面' },  // GM-B2
  rib: { icon: 'default', label: '加強筋' },
  text: { icon: 'default', label: '文字' },
  newbody: { icon: 'box', label: '新實體' },
  bodyboolean: { icon: 'combine', label: '實體布爾' },
  split: { icon: 'default', label: '分割' },  // S128：参数化分割（保历史）
  stepbody: { icon: 'insert', label: 'STEP實體' },
  sketch: { icon: 'sketch', label: '草圖' },  // T756：独立草图
  circPattern: { icon: 'pattern', label: '環形陣列' },  // T757
  meshbody: { icon: 'insert', label: '網格實體' },  // T767
  worm: { icon: 'default', label: '蝸桿' },          // T770
  crowngear: { icon: 'default', label: '冠齒輪' },   // T770
  othread: { icon: 'default', label: '面外螺紋' },   // T775
  extgroup: { icon: 'extrude', label: '拉伸組' },    // 多轮廓拉伸打包节点（用 as Feature cast，唔喺 union）
  featpattern: { icon: 'pattern', label: '陣列' },   // 可编辑阵列组节点（T#148）
}

function Section({ label, defaultOpen = true, children }: { label: string; defaultOpen?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const has = !!children
  return (
    <div>
      <div className="tree-row" onClick={() => has && setOpen(!open)}>
        <span className="tw-toggle">{has ? (open ? '▾' : '▸') : ''}</span>
        <span className="tw-ico"><ToolIcon name="default" size={13} /></span>
        <span>{label}</span>
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
      {err && <span className="tw-err" title={tStatus('重建失敗：', lang) + err}>🔴</span>}
    </div>
  )
}

// Origin-plane row: clicking it starts a new sketch on that datum plane (Fusion behaviour).
function PlaneLeaf({ plane, label }: { plane: 'XY' | 'XZ' | 'YZ'; label: string }) {
  const lang = useApp((s) => s.lang)
  const choose = useApp((s) => s.chooseSketchPlane)
  const active = useApp((s) => (s.mode === 'sketch' ? s.sketchPlane : null))
  return (
    <div className={'tree-row' + (active === plane ? ' sel' : '')} style={{ paddingLeft: 18 }} onClick={() => choose(plane)} title={tStatus(`在 ${label} 上新建草圖`, lang)}>
      <span className="tw-toggle" />
      <span className="tw-ico"><ToolIcon name="plane" size={13} /></span>
      <span style={{ flex: 1 }}>{tStatus(label, lang)}</span>
      <span className="tw-act" title={tStatus('新建草圖', lang)}>✎</span>
    </div>
  )
}

// GM-W6 F2：草图行 — 单击选中（独立草图，拉伸/旋转直接用）；双击重开（消费中）或改名（Alt+双击 / 孤儿）；孤儿草图（消费特徵已删）显示（未使用）+「重开」「🗑」掣。
function SketchRow({ k }: { k: string }) {
  const lang = useApp((s) => s.lang)
  const skLock = useApp((s) => s.mode === 'sketch' || s.formMode)
  const src = useApp((s) => s.sketchSources[k])
  const features = useApp((s) => s.features)
  const selSketch = useApp((s) => s.selSketch)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  if (!src) return null
  const defaultLabel = k.replace('sk', '草圖')
  // 孤儿判定：冇任何特徵经 sketchId 或 sketchIds（loft 截面）引用佢 = 未使用。消费特徵删除后仍可能残留（旧档 liveSketchSources 剪除前保存 / undo）。
  const referenced = features.some((f) => (f as { sketchId?: string }).sketchId === k || ((f as { sketchIds?: string[] }).sketchIds?.includes(k) ?? false))
  const standalone = features.some((f) => f.type === 'sketch' && (f as { sketchId?: string }).sketchId === k)
  const orphan = !referenced
  const commit = () => { useApp.getState().renameSketchSrc(k, name); setEditing(false) }
  const openMenu = useTreeMenu()
  return (
    <div className="tree-row" style={{ paddingLeft: 18, ...(selSketch === k ? { background: 'rgba(21,114,196,.14)', borderRadius: 4 } : {}) }}
      onContextMenu={(e) => openMenu(e, 'sketch', { hidden: !src.visible, canRename: true, canDelete: orphan && !skLock }, {
        editSketch: () => { if (referenced) useApp.getState().editSketchBySrc(k); else void useApp.getState().reopenOrphanSketch(k) },
        hide: () => useApp.getState().toggleSketchVis(k), show: () => useApp.getState().toggleSketchVis(k),
        rename: () => { setName(src.name || defaultLabel); setEditing(true) },
        delete: async () => { if (skDelGuard()) return; if (await useApp.getState().appConfirm(tStatus(`刪除未使用草圖「${src.name || defaultLabel}」？`, lang))) useApp.getState().deleteSketchSrc(k) },
      })}
      title={tStatus(`${src.name || defaultLabel} — ${src.shapes.length} 個輪廓 · ${src.cons.length} 個約束${src.arb ? ' · 斜面' : ` · ${src.plane}`}${standalone ? ' · 獨立草圖 — 單擊選中（拉伸/旋轉直接用）' : ''}${orphan ? '（未使用 — 消費特徵已刪；「重開」還原做獨立草圖 / 🗑刪除）' : referenced ? ' — 雙擊重開編輯' : ''}（Alt+雙擊 = 改名）`, lang)}
      onClick={() => standalone && useApp.getState().setSelSketch(selSketch === k ? null : k)}
      onDoubleClick={(e) => { if (referenced && !e.altKey) useApp.getState().editSketchBySrc(k); else { setName(src.name || defaultLabel); setEditing(true) } }}>
      <span className="tw-toggle" />
      <span className="tw-ico"><ToolIcon name="sketch" size={13} /></span>
      {editing ? (
        <input className="tree-rename" aria-label={tStatus('重命名草圖', lang)} value={name} autoFocus
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(false); e.stopPropagation() }} />
      ) : (
        <span style={{ flex: 1, opacity: src.visible ? 1 : 0.55 }}>{src.name ? src.name : tStatus(defaultLabel, lang)}{standalone ? tStatus('·獨立', lang) : ''}{orphan ? tStatus('（未使用）', lang) : ''}{src.cons.length ? tStatus(` ·${src.cons.length}約束`, lang) : ''}</span>
      )}
      {orphan && <span className="tw-act" title={tStatus('重開編輯此未使用草圖（會還原做獨立草圖，之後可拉伸/旋轉/刪除）', lang)} onClick={(e) => { e.stopPropagation(); void useApp.getState().reopenOrphanSketch(k) }}>{tStatus('重開', lang)}</span>}
      <span className="tw-act" title={src.visible ? tStatus('隱藏草圖', lang) : tStatus('喺模型上顯示草圖（紫色線）', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleSketchVis(k) }}>{src.visible ? '👁' : '─'}</span>
      {orphan && <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草圖模式中鎖定 — 完成草圖後可刪除' : '刪除未使用草圖', lang)} onClick={async (e) => { e.stopPropagation(); if (skDelGuard()) return; if (await useApp.getState().appConfirm(tStatus(`刪除未使用草圖「${src.name || defaultLabel}」？`, lang))) useApp.getState().deleteSketchSrc(k) }}>🗑</span>}
    </div>
  )
}

// GM-W6 F2 / BOT-A01-DIM-LINK：特徵行 — 单击选中；双击开编辑（对齐时间轴）；Alt+双击改名。
const FEAT_EDIT_DLG = new Set<string>(['extrude', 'revolve', 'sweep', 'loft', 'fillet', 'chamfer', 'shell', 'mirror', 'pattern', 'geoPattern', 'circPattern', 'pathpattern', 'coil', 'rib', 'scale', 'transform', 'draft', 'othread', 'ithread', 'hole'])
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
  const openFeatureEdit = () => {
    selectFeature(f.id)
    if (FEAT_EDIT_DLG.has(f.type)) { useApp.getState().openFeatDlgForEdit(f.id); return }
    const hasSketch = ((f.type === 'extrude' || f.type === 'revolve' || f.type === 'sweep' || f.type === 'sketch' || f.type === 'extgroup') && !!(f as { sketchId?: string }).sketchId) || (f.type === 'loft' && !!(f as { sketchIds?: string[] }).sketchIds?.length)
    if (hasSketch) { void useApp.getState().editSketchOf(f.id); return }
  }
  // GM-X4 #10：从时间轴 chip「在瀏覽器中查找」→ 滚动定位 + 闪烁高亮（browserFocusNonce bump 触发）。
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
        <input className="tree-rename" aria-label={tStatus('重命名特徵', lang)} value={name} autoFocus placeholder={tStatus(meta.label, lang)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') setEditing(false); e.stopPropagation() }} />
      ) : (
        <span style={{ flex: 1, cursor: 'pointer' }} title={tStatus('單擊選中 · 雙擊編輯特徵／草圖 · Alt+雙擊改名', lang)} onClick={() => selectFeature(f.id === selected ? null : f.id)} onDoubleClick={(e) => { if (e.altKey) { setName(custom || ''); setEditing(true) } else openFeatureEdit() }}>{custom || tStatus(meta.label, lang)}</span>
      )}
      {err && <span className="tw-err" title={tStatus('重建失敗：', lang) + err}>🔴</span>}
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
      <span style={{ cursor: 'pointer', width: 12 }} title={collapsed ? tStatus('展開組', lang) : tStatus('摺疊組', lang)} onClick={onToggle}>{collapsed ? '▸' : '▾'}</span>
      <input type="checkbox" checked={allChecked} title={tStatus('勾選成組全部成員（批量操作/建嵌套組）', lang)} onClick={(e) => e.stopPropagation()} onChange={() => app().checkGroupMembers(g.id)} style={{ marginRight: 2, cursor: 'pointer' }} />
      <span className="tw-eye" title={tStatus('整組顯示/隱藏（連嵌套子組）', lang)} onClick={(e) => { e.stopPropagation(); app().toggleGroupHidden(g.id) }}>{allHidden ? '🚫' : '👁'}</span>
      <span style={{ fontSize: 12 }}>📁</span>
      {editing ? (
        <input className="tree-rename" aria-label={tStatus('重命名組', lang)} value={name} autoFocus onChange={(e) => setName(e.target.value)}
          onBlur={() => { app().renameGroup(g.id, name || g.name); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { app().renameGroup(g.id, name || g.name); setEditing(false) } }} />
      ) : (
        <span style={{ flex: 1, cursor: 'pointer', fontWeight: 600 }} title={tStatus(`子裝配組「${g.name}」（${deepIds.length} 件，雙擊改名）— 組係組織結構，關節仍係零件級`, lang)} onDoubleClick={() => { setName(g.name); setEditing(true) }}>{g.name}<span style={{ fontWeight: 400, color: '#8a97a2' }}>（{deepIds.length}）</span></span>
      )}
      <span className="tw-act" title={tStatus('複製成組（模組複用 T788）：深複製全部成員 + 組內關節（輪組插四次就係咁）', lang)} onClick={(e) => { e.stopPropagation(); app().duplicateGroup(g.id) }}>⧉</span>
      <span className="tw-act" title={tStatus('整組移動：輸入 Δx,Δy,Δz（視圖座標 mm，組內關節錨點跟住搬）', lang)} onClick={async (e) => { e.stopPropagation(); const v = await useApp.getState().appPrompt(tStatus('整組移動 Δx,Δy,Δz（mm，三維視圖座標）', lang), '20,0,0'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean).map(Number); if (p.length < 1 || p.some((x) => !Number.isFinite(x))) { await useApp.getState().appAlert(tStatus('請輸入數字', lang)); return } app().moveGroupBy(g.id, p[0] || 0, p[1] || 0, p[2] || 0) }}>⇣</span>
      <span className="tw-act" title={tStatus('整組旋轉（S123 子裝配 frame）：輸入 軸,角度（X/Y/Z, 度），整個子裝配繞世界質心剛性旋轉。自包含剛性組準確；組內有關節會提示。', lang)} onClick={async (e) => { e.stopPropagation(); const v = await useApp.getState().appPrompt(tStatus('整組旋轉 軸,角度（軸=X/Y/Z，度，例 Z,90）', lang), 'Z,90'); if (v == null) return; const p = v.split(/[,，\s]+/).filter(Boolean); const ax = (p[0] || 'Z').toUpperCase(); const deg = Number(p[1]); if (!['X', 'Y', 'Z'].includes(ax) || !Number.isFinite(deg)) { await useApp.getState().appAlert(tStatus('請輸入：軸(X/Y/Z),角度。例 Z,90', lang)); return } app().rotateGroup(g.id, ax as 'X' | 'Y' | 'Z', deg) }}>↻</span>
      <span className="tw-act" title={tStatus('解組：組拆走、成員升到上一層（組件唔刪）', lang)} onClick={(e) => { e.stopPropagation(); app().dissolveGroup(g.id) }}>⛓</span>
      <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草圖模式中鎖定 — 完成草圖後可刪除' : '刪除組 + 全部成員（組件可撤銷）', lang)} onClick={async (e) => { e.stopPropagation(); if (skDelGuard()) return; if (await useApp.getState().appConfirm(tStatus(`刪除組「${g.name}」同埋入面 ${deepIds.length} 件成員？`, lang))) app().deleteGroupDeep(g.id) }}>🗑</span>
      {memberIds.length === 0 && deepIds.length === 0 && <span style={{ fontSize: 10, color: '#a76' }}>{tStatus('（空組）', lang)}</span>}
    </div>
  )
}

// Component row: eye toggles visibility, double-click the name to rename.
const EMPTY_COMPONENT_BODIES: never[] = []

function CompRow({ c, depth = 0 }: { c: { id: string; name: string; hidden?: boolean; color?: string; material?: string; src?: { features: unknown[] }; formSource?: unknown; mesh: { vertices: number[] } }; depth?: number }) {
  const lang = useApp((s) => s.lang)
  const skLock = useApp((s) => s.mode === 'sketch' || s.formMode)   // GM-W2 2.2：草图态灰化删除掣
  const sel = useApp((s) => s.selectedComponent)
  const compBoolPending = useApp((s) => s.compBoolPending)
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
  const openMenu = useTreeMenu()
  const onCompMenu = (e: ReactMouseEvent) => openMenu(e, 'component', { hidden: !!c.hidden, canRename: true, canEdit: !!(c.src?.features?.length || c.formSource) }, {
    hide: () => toggleVis(c.id), show: () => toggleVis(c.id),
    isolate: () => isolate(c.id),
    edit: () => { if (c.formSource) useApp.getState().editFormComponent(c.id); else { selectComponent(c.id); void useApp.getState().editComponent(c.id) } },
    rename: () => { setName(c.name); setEditing(true) },
    focus: () => requestFit(c.id),
    props: () => void useApp.getState().openPropertiesDialog(c.id),
    delete: async () => { if (skDelGuard()) return; if (await useApp.getState().appConfirm(tStatus(`刪除組件「${c.name}」？`, lang))) del(c.id) },
  })
  return (
    <>
    <div onContextMenu={onCompMenu} className={'tree-row' + (c.id === sel ? ' sel' : '') + (compBoolPending && c.id !== compBoolPending.from ? ' comp-bool-pickable' : '')} style={{ paddingLeft: 18 + depth * 14, ...(compBoolPending && c.id !== compBoolPending.from ? { outline: '1px dashed #2563eb', background: 'rgba(37,99,235,.06)' } : {}) }} title={compBoolPending && c.id !== compBoolPending.from ? tStatus('組件布爾：點此零件（或勾選）作為工具件完成運算', lang) : undefined}>
      <input type="checkbox" checked={checked} title={tStatus(compBoolPending && c.id !== compBoolPending.from ? '勾選此零件＝選為組件布爾工具件並立即完成' : '勾選以做批量操作（隱藏/顯示/刪除）', lang)} onClick={(e) => e.stopPropagation()} onChange={() => toggleCheck(c.id)} style={{ marginRight: 2, cursor: 'pointer' }} />
      <span className="tw-eye" title={tStatus('顯示/隱藏', lang)} onClick={(e) => { e.stopPropagation(); toggleVis(c.id) }}>{c.hidden ? '🚫' : '👁'}</span>
      <span className="tw-ico"><ToolIcon name="component" size={13} /></span>
      {editing ? (
        <input className="tree-rename" aria-label={tStatus('重命名組件', lang)} value={name} autoFocus
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { rename(c.id, name || c.name); setEditing(false) }}
          onKeyDown={(e) => { if (e.key === 'Enter') { rename(c.id, name || c.name); setEditing(false) } }} />
      ) : (
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} title={tStatus(`「${c.name}」 ${compDimsStr(c.mesh)}（雙擊參數化件=進入編輯；Alt+雙擊=改名；點選=屬性）`, lang)} onClick={() => { if (compBoolPending) selectComponent(c.id); else selectComponent(c.id === sel ? null : c.id) }} onDoubleClick={(e) => { const cc = useApp.getState().components.find((x) => x.id === c.id); if (cc?.formSource && !e.altKey) { useApp.getState().editFormComponent(c.id) } else if (cc?.src?.features?.length && !e.altKey) { selectComponent(c.id); void useApp.getState().editComponent(c.id) } else { setName(c.name); setEditing(true) } }}>{c.name}</span>
      )}
      {shareCount > 1 && <span title={tStatus(`${shareCount} 個實例共享同一定義 — 編輯任一，全部更新（「獨立複製」可脫離）`, lang)} style={{ fontSize: 10, fontWeight: 600, color: '#1572c4', background: 'rgba(21,114,196,.12)', borderRadius: 3, padding: '0 4px', marginRight: 2, flexShrink: 0 }}>×{shareCount}</span>}
      <button className="component-options" aria-label={`組件選項：${c.name}`} aria-expanded={c.id === sel && !componentEditing && !commandActive && !skLock} onClick={() => { if (compBoolPending) selectComponent(c.id); else selectComponent(c.id === sel ? null : c.id) }}>⋯</button>
    </div>
    {c.id === sel && !componentEditing && !commandActive && !skLock && <div className="component-controls" role="group" aria-label={`組件選項：${c.name}`}>
      {!!c.formSource && <button onClick={() => useApp.getState().editFormComponent(c.id)}>✎ 編輯 Form 控制籠</button>}
      {!!c.src?.features.length && <button onClick={() => void useApp.getState().editComponent(c.id)}>✎ 編輯特徵／草圖</button>}
      <button type="button" data-testid="browser-compboolean" title={tStatus('組件布爾：以此件為目標，再點另一個零件作工具件（合併/切除/相交）', lang)} onClick={(e) => { e.stopPropagation(); void useApp.getState().startComponentBoolean(c.id) }}>🧩 組件布爾</button>
      <select className="tw-mat" title={tStatus('材質（設密度→影響質量/BOM，並改顏色）', lang)} value={c.material || ''} onClick={(e) => e.stopPropagation()} onChange={(e) => { if (e.target.value) setMaterial(c.id, e.target.value) }} style={{ fontSize: 10, maxWidth: 52, border: '1px solid #d0d6dc', borderRadius: 3 }}>
        <option value="">{tStatus('材質…', lang)}</option>
        {Object.keys(MATERIALS).filter((k) => MATERIALS[k].density).map((k) => <option key={k} value={k}>{k}</option>)}
      </select>
      <input className="tw-swatch" type="color" title={tStatus('組件顏色', lang)} value={c.color || '#aab2ba'} onClick={(e) => e.stopPropagation()} onChange={(e) => setColor(c.id, e.target.value)} />
      {!c.hidden && <span className="tw-act" title={tStatus('聚焦：鏡頭框到此組件', lang)} onClick={(e) => { e.stopPropagation(); requestFit(c.id) }}>🎯</span>}
      <span className="tw-act" title={tStatus('物理屬性（面積/質量/體積/質心/慣性，精度可調，可複製）', lang)} onClick={(e) => { e.stopPropagation(); void useApp.getState().openPropertiesDialog(c.id) }}>⚖</span>
      <span className="tw-act" title={tStatus('孤立顯示（隱藏其余）', lang)} onClick={(e) => { e.stopPropagation(); isolate(c.id) }}>◎</span>
      <span className="tw-act" title={tStatus('複製組件（共享定義 — 編輯任一實例全部更新）', lang)} onClick={(e) => { e.stopPropagation(); duplicate(c.id) }}>⧉</span>
      <span className="tw-act" title={tStatus('獨立複製 / Paste-New（新定義 — 改任一唔影響對方）', lang)} onClick={(e) => { e.stopPropagation(); independentize(c.id) }}>⧉+</span>
      <span className="tw-act" title={tStatus('鏡像組件：左右對稱（跨 YZ 面）', lang)} onClick={(e) => { e.stopPropagation(); mirror(c.id, 'lr') }}>⇋</span>
      <span className="tw-act" title={tStatus('鏡像組件：前後對稱（跨 XY 面）', lang)} onClick={(e) => { e.stopPropagation(); mirror(c.id, 'fb') }}>⇅</span>
      <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草圖模式中鎖定 — 完成草圖後可刪除' : '刪除組件', lang)} onClick={async (e) => { e.stopPropagation(); if (skDelGuard()) return; if (await useApp.getState().appConfirm(tStatus(`刪除組件「${c.name}」？`, lang))) del(c.id) }}>🗑</span>
    </div>}
    {bodies.length > 1 && bodies.map((body) => (
      <div key={body.id} className={'tree-row' + (selectedBody?.componentId === c.id && selectedBody.bodyId === body.id ? ' sel' : '')} style={{ paddingLeft: 40 + depth * 14, minHeight: 22, opacity: body.hidden ? 0.5 : 1 }} title={`實體：${body.name}（單擊選取此實體；顯示狀態會同步到其所有實例）`} onClick={() => selectBody(c.id, body.id)} onContextMenu={(e) => openMenu(e, 'componentBody', { hidden: !!body.hidden }, { hide: () => toggleBodyVisible(c.id, body.id), show: () => toggleBodyVisible(c.id, body.id) })}>
        <span className="tw-toggle" />
        <span className="tw-eye" title={body.hidden ? '顯示實體' : '隱藏實體'} onClick={(e) => { e.stopPropagation(); toggleBodyVisible(c.id, body.id) }}>{body.hidden ? '○' : '◉'}</span>
        <span className="tw-ico"><ToolIcon name="box" size={12} /></span>
        <span style={{ flex: 1, fontSize: 11 }}>{body.name}{body.id.endsWith('_B1') ? ' · 參數體' : ''}</span>
        {body.color && <span className="tw-swatch" style={{ background: body.color }} title="實體顏色" />}
      </div>
    ))}
    </>
  )
}

// Root-body row (活動實體 / 泊車實體): eye toggle + app context menu (隱藏/顯示 · 建立組件 · 外觀 · 物理材質 · 屬性).
function BodyRow({ label, visKey, sel, parkedIndex, onClick }: { label: string; visKey: string; sel: boolean; parkedIndex?: number; onClick: () => void }) {
  const lang = useApp((s) => s.lang)
  const hidden = useApp((s) => s.bodyHidden.includes(visKey))
  const allOff = useApp((s) => !s.objectVis.bodies)
  const openMenu = useTreeMenu()
  const toggle = () => useApp.getState().toggleBodyHidden(visKey)
  const active = parkedIndex == null
  return (
    <div className={'tree-row' + (sel ? ' sel' : '')} style={{ paddingLeft: 18, opacity: hidden || allOff ? 0.55 : 1 }} onClick={onClick}
      onContextMenu={(e) => openMenu(e, active ? 'activeBody' : 'parkedBody', { hidden }, {
        hide: toggle, show: toggle,
        createComp: () => useApp.getState().newComponent(),
        appearance: () => void useApp.getState().runCommand('appearance', '外觀'),
        physmat: () => void useApp.getState().runCommand('physicalmaterial', '物理材質'),
        props: () => void useApp.getState().openPropertiesDialog(active ? null : `parked:${parkedIndex}`),
        fit: () => useApp.getState().requestFit(),
      })}>
      <span className="tw-eye" title={L2(hidden ? '顯示實體' : '隱藏實體', hidden ? 'Show body' : 'Hide body', lang)} onClick={(e) => { e.stopPropagation(); toggle() }}>{hidden ? '🚫' : '👁'}</span>
      <span className="tw-ico"><ToolIcon name="box" size={13} /></span>
      <span style={{ flex: 1 }}>{tStatus(label, lang)}</span>
    </div>
  )
}

// Batch-operation bar: appears under the component list when ≥1 component is checked. Hide / show / delete
// all checked at once (reuses store batch actions). Keeps the single-select model untouched.
// World bbox-centre of a component (CAD bbox centre transformed by the single-source world matrix).
// Compact "W×D×H mm" for a component's own bbox — shown as a hover tooltip on the tree row name,
// so each part's size is identifiable at a glance without selecting it. Cheap (one bbox pass).
function compDimsStr(mesh: { vertices: number[] }): string {
  const v = mesh.vertices; if (!v.length) return '（無實體幾何）'
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

// T788（S66）：嵌套树渲染 — 顶层 = 无 parentId 嘅组 + 无 groupId 嘅組件；组内递归（子组 + 直属成员缩进）。
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
      <b>{tStatus('已選', lang)} {n}</b>
      <span className="tw-act" title={tStatus('批量隱藏勾選的組件', lang)} onClick={() => batchHide(true)}>🚫{tStatus('隱藏', lang)}</span>
      <span className="tw-act" title={tStatus('批量顯示勾選的組件', lang)} onClick={() => batchHide(false)}>👁{tStatus('顯示', lang)}</span>
      <select title={tStatus('批量設材質（影響顏色 + 質量/BOM 密度）', lang)} defaultValue="" onChange={(e) => { const v = e.target.value; if (v) batchMat(v === '__clear' ? '' : v); e.currentTarget.selectedIndex = 0 }} style={{ fontSize: 11, height: 20 }}>
        <option value="">{tStatus('材質…', lang)}</option>
        {Object.keys(MATERIALS).map((k) => <option key={k} value={k}>{k}</option>)}
        <option value="__clear">{tStatus('（清除材質）', lang)}</option>
      </select>
      <span className="tw-act" title={tStatus('把勾選的組件匯出為 STL 打包 zip（只匯出你揀嘅，方便分批 3D 列印）', lang)} onClick={() => batchZip()}>📦{tStatus('匯出zip', lang)}</span>
      <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草圖模式中鎖定 — 完成草圖後可刪除' : '批量刪除勾選的組件（可撤銷）', lang)} onClick={async () => { if (skDelGuard()) return; if (await useApp.getState().appConfirm(tStatus(`刪除勾選的 ${n} 個組件？（可 Ctrl+Z 撤銷）`, lang))) batchDel() }}>🗑{tStatus('刪除', lang)}</span>
      <span className="tw-act" title={tStatus('清除勾選', lang)} onClick={() => clear()}>✕{tStatus('清除勾選', lang)}</span>
      <span className="tw-act" title={tStatus('📁 建組（T788 子裝配）：勾選嘅組件組成一個組 — 整組隱藏/移動/複製/BOM 分層；勾選同組成員再建組 = 嵌套子組', lang)} onClick={() => useApp.getState().createGroupFromChecked()}>📁{tStatus('建組', lang)}</span>
      {n >= 2 && <span className="tw-act" title={tStatus('剛性組（T779 Fusion Rigid Group）：勾選嘅組件鎖做一組 — 第一件做頭，郁佢全組跟（rigid 關節實現，可喺關節面板拆）', lang)} onClick={() => useApp.getState().rigidGroupChecked()}>🔗{tStatus('剛性組', lang)}</span>}
      {n === 2 && <select className="tw-act" defaultValue="" title={tStatus('按現狀關節（T779 Fusion As-Built Joint）：兩件喺而家位置直接加關節 — 揀類型即加，唔 snap 唔郁位（要改軸用拾孔定軸）', lang)} onChange={(e) => { const t = e.target.value; if (t) useApp.getState().asBuiltJointChecked(t) }}>
        <option value="">⚙{tStatus('按現狀關節…', lang)}</option>
        <option value="revolute">{tStatus('轉動', lang)}</option>
        <option value="rigid">{tStatus('剛性', lang)}</option>
        <option value="slider">{tStatus('滑動', lang)}</option>
        <option value="cylindrical">{tStatus('圓柱', lang)}</option>
        <option value="ball">{tStatus('球', lang)}</option>
      </select>}
      {n === 2 && (() => {
        const sel = checkedIds.map((id) => allComps.find((c) => c.id === id)).filter(Boolean) as typeof allComps
        if (sel.length !== 2) return null
        const a = compWorldCentre(sel[0]), b = compWorldCentre(sel[1])
        if (!a || !b) return null
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], d = Math.hypot(dx, dy, dz)
        return <span style={{ color: '#1f8f4e' }} title={tStatus('兩個勾選組件的中心距（mm，含 ΔX/Y/Z；按幾何中心，不用逐個點選）', lang)}>📏 {tStatus('中心距', lang)} {d.toFixed(1)}mm（Δ {dx.toFixed(1)}, {dy.toFixed(1)}, {dz.toFixed(1)}）</span>
      })()}
      {n === 2 && <span title={tStatus('把第 2 個勾選組件的中心對齊到第 1 個（沿所選軸）', lang)}>{tStatus('對齊', lang)}<span className="tw-act" onClick={() => align(0)}>X</span><span className="tw-act" onClick={() => align(1)}>Y</span><span className="tw-act" onClick={() => align(2)}>Z</span></span>}
      {n >= 3 && <span title={tStatus('沿所選軸把勾選組件等距分佈：首尾兩件不動，中間各件均分到等間距（排欄桿/隔板/鍵帽常用）', lang)}>{tStatus('等距', lang)}<span className="tw-act" onClick={() => distribute(0)}>X</span><span className="tw-act" onClick={() => distribute(1)}>Y</span><span className="tw-act" onClick={() => distribute(2)}>Z</span></span>}
    </div>
  )
}

export default function BrowserTree() {
  const lang = useApp((s) => s.lang)
  const skLock = useApp((s) => s.mode === 'sketch' || s.formMode)   // GM-W2 2.2：草图态灰化基准删除（草图可能正建喺个参考面上）
  const features = useApp((s) => s.features)
  const bodyMesh = useApp((s) => s.bodyMesh)
  const selectedParkedIndex = useApp((s) => s.selectedParkedIndex)  // SO10：泊车半体树选中高亮
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
  const anyBodyHidden = useApp((s) => s.bodyHidden.length > 0 || !s.objectVis.bodies)
  const [treeMenu, setTreeMenu] = useState<{ x: number; y: number; items: (TreeMenuItem | 'sep')[] } | null>(null)
  useEscapeLayer(!!treeMenu, () => setTreeMenu(null), 260)
  const openTreeMenu = (e: ReactMouseEvent, kind: TreeNodeKind, opts: TreeMenuOpts, actions: TreeMenuAction) => {
    e.preventDefault(); e.stopPropagation()
    const items: (TreeMenuItem | 'sep')[] = []
    for (const k of treeMenuKeys(kind, opts)) {
      if (k === 'sep') { if (items.length && items[items.length - 1] !== 'sep') items.push('sep'); continue }
      const fn = actions[k]
      if (fn) items.push({ key: k, label: treeItemLabel(k, lang), fn })
    }
    while (items.length && items[items.length - 1] === 'sep') items.pop()
    if (items.length) setTreeMenu({ x: e.clientX, y: e.clientY, items })
  }
  const rootActions: TreeMenuAction = { showAll: () => useApp.getState().showAllBodies(), fit: () => requestFit() }
  const onBrowserContextMenu = (e: ReactMouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest?.('input,textarea,select')) return   // keep native copy/paste in rename fields
    openTreeMenu(e, 'root', {}, rootActions)
  }

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
      <div className="browser" role="button" aria-label={msg('ui.browserExpand', lang)} tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') toggleBrowser() }} style={{ width: 26, cursor: 'pointer' }} title={msg('ui.browserExpand', lang)} onClick={() => toggleBrowser()}>
        <div className="browser-head" style={{ justifyContent: 'center', padding: 0 }}>▸▸</div>
      </div>
    )
  }

  return (
    <TreeMenuCtx.Provider value={openTreeMenu}>
    <div className="browser" onContextMenu={onBrowserContextMenu}>
      <div className="browser-head">
        <span style={{ cursor: 'pointer' }} title={msg('ui.browserCollapse', lang)} onClick={() => toggleBrowser()}>◂◂</span>
        <span style={{ marginLeft: 6 }}>{msg('ui.browser', lang)}</span>
        <span style={{ marginLeft: 'auto', cursor: 'pointer', padding: '0 4px' }} title={msg('ui.browserCollapse', lang)} onClick={() => toggleBrowser()}>─</span>
      </div>
      {/* Fusion doc root row: orange cube + document name */}
      <div className="tree-row" style={{ fontWeight: 600 }}>
        <span className="tw-toggle">▾</span>
        <span className="doc-cube" style={{ flexShrink: 0 }} />
        <span style={{ marginLeft: 4 }}>{projectName || tStatus('(未儲存)', lang)}</span>
      </div>
      <div style={{ paddingLeft: 8 }}>
        <Section label={msg('tree.docSettings', lang)} defaultOpen={false}>
          {/* GM-X2 #13：单位对话框（配对预设 长度+质量 + 自定义）。模型/导出恒 mm。 */}
          <Leaf icon="default" label={`文檔單位: ${unit === 'inch' ? 'in' : unit} / ${massUnit}`} onClick={() => setUnitDlgOpen(true)} />
        </Section>
        <Section label={msg('tree.namedViews', lang)} defaultOpen={false}>
          {savedViews.map((v, i) => <Leaf key={i} icon="home" label={v.name} onClick={() => useApp.getState().applyViewBookmark(i)} />)}
          <Leaf icon="home" label="主視圖" onClick={() => { setView('iso'); requestFit() }} />
          <Leaf icon="plane" label="前視圖" onClick={() => setView('front')} />
          <Leaf icon="plane" label="後視圖" onClick={() => setView('back')} />
          <Leaf icon="plane" label="上視圖" onClick={() => setView('top')} />
          <Leaf icon="plane" label="下視圖" onClick={() => setView('bottom')} />
          <Leaf icon="plane" label="右視圖" onClick={() => setView('right')} />
          <Leaf icon="plane" label="左視圖" onClick={() => setView('left')} />
          <Leaf icon="plane" label="等軸測" onClick={() => setView('iso')} />
        </Section>
        <Section label={msg('tree.origin', lang)} defaultOpen={false}>
          <PlaneLeaf plane="XY" label="XY 平面" />
          <PlaneLeaf plane="XZ" label="XZ 平面" />
          <PlaneLeaf plane="YZ" label="YZ 平面" />
          <Leaf icon="axis" label="X 軸" />
          <Leaf icon="axis" label="Y 軸" />
          <Leaf icon="axis" label="Z 軸" />
        </Section>
        {(planes.length + cpoints.length + caxes.length) > 0 && (
          <Section label={`${msg('tree.construction', lang)} (${planes.length + cpoints.length + caxes.length})`}>
            {planes.map((pl, i) => (
              <div key={'cpl' + i} className="tree-row" style={{ paddingLeft: 18 }} onClick={() => useApp.getState().sketchOnDatumPlane(pl.base, pl.offset)} title={tStatus(`在參考平面 ${pl.base}@${pl.offset} 上新建草圖`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="plane" size={13} /></span>
                <span style={{ flex: 1 }}>{tStatus('參考面', lang)} {pl.base}@{pl.offset}{pl.src && !pl.stale && <span title={tStatus('關聯基準：隨源面自動更新', lang)} style={{ marginLeft: 3, fontSize: 10 }}>🔗</span>}{pl.stale && <span title={tStatus('源面已改動/消失，無法自動更新此基準 — 改回或刪除重建', lang)} style={{ marginLeft: 3, color: '#c98a00' }}>⚠</span>}</span>
                <span className="tw-act" title={tStatus('顯示 / 隱藏此參考面', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleDatumVis(datumVisKey('pl', pl)) }}>{datumHidden.includes(datumVisKey('pl', pl)) ? '🙈' : '👁'}</span>
                {/* GM-W1 1.5：编辑 offset（角度面另可改 angle）。诚实：只郁呢块 datum 本身 — 已经喺佢上面拉伸/开咗嘅草图唔会跟住重算（timeline 关联系后续功能）。datum-pick 固定 arb 面（有 arb 无 aaxis）唔畀改 offset（无实义）。*/}
                {(pl.aaxis != null || !pl.arb) && (
                  <span className="tw-act" title={tStatus(`編輯偏移${pl.aaxis != null ? '/角度' : ''} — 改動只影響之後新畫嘅草圖（唔會重算已拉伸嘅特徵）`, lang)} onClick={(e) => { e.stopPropagation(); void (async () => {
                    const ap = useApp.getState()
                    const ov = await ap.appPrompt(tStatus('新偏移 mm（沿基面法向平移此參考面）', lang), String(pl.offset), tStatus('編輯參考面', lang))
                    if (ov == null) return
                    const offset = Number(ov.trim())
                    if (!Number.isFinite(offset)) { useApp.setState({ status: tStatus('偏移要系數字 — 已取消', lang) }); return }
                    let angle: number | undefined
                    if (pl.aaxis != null) {
                      const av = await ap.appPrompt(tStatus('新角度°（繞基面局部軸傾斜）', lang), String(pl.angle ?? 0), tStatus('編輯角度面', lang))
                      if (av == null) return
                      const a = Number(av.trim())
                      if (!Number.isFinite(a)) { useApp.setState({ status: tStatus('角度要系數字 — 已取消', lang) }); return }
                      angle = a
                    }
                    ap.updatePlane(i, { offset, ...(angle != null ? { angle } : {}) })
                  })() }}>✏️</span>
                )}
                <span className="tw-act" title={tStatus('新建草圖', lang)}>✎</span>
                <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草圖模式中鎖定 — 完成草圖後可刪除' : '刪除參考平面', lang)} onClick={(e) => { e.stopPropagation(); if (skDelGuard()) return; useApp.getState().removePlane(i) }}>🗑</span>
              </div>
            ))}
            {caxes.map((ax, i) => (
              <div key={'cax' + i} className="tree-row" style={{ paddingLeft: 18 }} title={tStatus(`構造軸 ${ax.dir} @(${ax.at.join(',')})`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="axis" size={13} /></span>
                <span style={{ flex: 1 }}>{tStatus('構造軸', lang)} {ax.dir}@({ax.at.join(',')})</span>
                <span className="tw-act" title={tStatus('顯示 / 隱藏此構造軸', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleDatumVis(datumVisKey('ax', ax)) }}>{datumHidden.includes(datumVisKey('ax', ax)) ? '🙈' : '👁'}</span>
                <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草圖模式中鎖定 — 完成草圖後可刪除' : '刪除構造軸', lang)} onClick={(e) => { e.stopPropagation(); if (skDelGuard()) return; useApp.getState().removeCAxis(i) }}>🗑</span>
              </div>
            ))}
            {cpoints.map((p, i) => (
              <div key={'cpt' + i} className="tree-row" style={{ paddingLeft: 18 }} title={tStatus(`構造點 (${p.join(',')})`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="default" size={13} /></span>
                <span style={{ flex: 1 }}>{tStatus('構造點', lang)} ({p.join(',')})</span>
                <span className="tw-act" title={tStatus('顯示 / 隱藏此構造點', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleDatumVis(datumVisKey('pt', p)) }}>{datumHidden.includes(datumVisKey('pt', p)) ? '🙈' : '👁'}</span>
                <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草圖模式中鎖定 — 完成草圖後可刪除' : '刪除構造點', lang)} onClick={(e) => { e.stopPropagation(); if (skDelGuard()) return; useApp.getState().removeCPoint(i) }}>🗑</span>
              </div>
            ))}
          </Section>
        )}
        {/* GM-3DV4 A1：Joint Origins 组（Fusion 专属「Joint Origins」文件夹） */}
        {jointOrigins.length > 0 && (
          <Section label={`${msg('tree.jointOrigins', lang)} (${jointOrigins.length})`}>
            {jointOrigins.map((jo) => (
              <div key={jo.id} className="tree-row" style={{ paddingLeft: 18 }} title={tStatus(`可復用關節原點「${jo.name}」@(${jo.point.map((x) => x.toFixed(1)).join(', ')}) — 建關節時喺關節面板下拉引用之（取代預設件心）`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="joint" size={13} /></span>
                <span style={{ flex: 1 }}>⚓ {jo.name}</span>
                <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草圖模式中鎖定 — 完成草圖後可刪除' : '刪除關節原點（引用它的關節保留當前錨點）', lang)} onClick={(e) => { e.stopPropagation(); if (skDelGuard()) return; useApp.getState().removeJointOrigin(jo.id) }}>🗑</span>
              </div>
            ))}
          </Section>
        )}
        {/* GM-3DV4 A8：Rigid Groups 组（Fusion Rigid Group — 一级、可抑制节点） */}
        {rigidGroups.length > 0 && (
          <Section label={`${msg('tree.rigidGroups', lang)} (${rigidGroups.length})`}>
            {rigidGroups.map((g) => (
              <div key={g.id} className="tree-row" style={{ paddingLeft: 18, opacity: g.suppressed ? 0.5 : 1 }} title={tStatus(`剛性組「${g.name}」：${g.members.length} 件焊為一體（第一件做頭，郁佢全組跟）${g.suppressed ? ' — 已抑制' : ''}`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="joint" size={13} /></span>
                <span style={{ flex: 1 }}>🔗 {g.name}（{g.members.length}）{g.suppressed ? tStatus(' · 已抑制', lang) : ''}</span>
                <span className="tw-act" title={tStatus(g.suppressed ? '恢復剛性組（重新焊為一體）' : '抑制剛性組（成員釋放自由郁）', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().toggleRigidGroupSuppressed(g.id) }}>{g.suppressed ? '▷' : '⏸'}</span>
                <span className="tw-act" style={skLock ? SK_LOCK_STYLE : undefined} title={tStatus(skLock ? '草圖模式中鎖定 — 完成草圖後可刪除' : '刪除剛性組（成員釋放）', lang)} onClick={(e) => { e.stopPropagation(); if (skDelGuard()) return; useApp.getState().removeRigidGroup(g.id) }}>🗑</span>
              </div>
            ))}
          </Section>
        )}
        {components.length > 0 && (
          <Section label={`${msg('tree.components', lang)} (${components.length})`}>
            {components.length > 1 && (
              <div className="tree-row tree-showall" style={{ paddingLeft: 18 }} onClick={() => useApp.getState().autoColorComponents()} title={tStatus('為每個組件分配可區分的顏色', lang)}>🎨 {tStatus('自動配色', lang)}</div>
            )}
            {components.some((c) => c.hidden) && (
              <div className="tree-row tree-showall" style={{ paddingLeft: 18 }} onClick={() => useApp.getState().showAllComponents()} title={tStatus('顯示所有隱藏的組件', lang)}>👁 {tStatus('顯示全部', lang)}</div>
            )}
            {components.length > 1 && (
              <div className="tree-row tree-showall" style={{ paddingLeft: 18 }} onClick={() => useApp.getState().exportAllPartsZip()} title={tStatus('把每個可見零件匯出為單獨 STL，打包成一個 zip（每件可單獨 3D 列印）', lang)}>📦 {tStatus('匯出全部零件 STL(zip)', lang)}</div>
            )}
            <GroupedCompList components={components} />
            <CompBatchBar />
          </Section>
        )}
        {/* GM-X1 #12：Analysis 文件夹（Fusion 曲面/剖切分析存为可开关节点，逐个眼睛开关 + 🗑删除） */}
        {analyses.length > 0 && (
          <Section label={`${msg('tree.analysis', lang)} (${analyses.length})`}>
            {analyses.map((a) => (
              <div key={a.id} className="tree-row" style={{ paddingLeft: 18, opacity: a.visible ? 1 : 0.5 }} title={tStatus(`${a.label}${a.visible ? '（顯示中）' : '（已隱藏）'} — 眼掣開關 / 🗑刪除`, lang)}>
                <span className="tw-toggle" />
                <span className="tw-ico"><ToolIcon name="draft" size={13} /></span>
                <span style={{ flex: 1 }}>{tStatus(a.label, lang)}</span>
                <span className="tw-act" title={tStatus(a.visible ? '隱藏此分析' : '顯示此分析（重新套用）', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().setAnalysisNodeVisible(a.id, !a.visible) }}>{a.visible ? '👁' : '🙈'}</span>
                <span className="tw-act" title={tStatus('刪除此分析節點', lang)} onClick={(e) => { e.stopPropagation(); useApp.getState().removeAnalysisNode(a.id) }}>🗑</span>
              </div>
            ))}
          </Section>
        )}
        <Section label={`${msg('tree.bodies', lang)}${bodyMesh?.parked?.length ? ` (${(bodyMesh.triangles.length ? 1 : 0) + bodyMesh.parked.length})` : ''}`}>
          {anyBodyHidden && bodyMesh ? <div className="tree-row tree-showall" style={{ paddingLeft: 18 }} onClick={() => useApp.getState().showAllBodies()} title={L2('顯示所有隱藏的實體/組件', 'Show all hidden bodies/components', lang)}>👁 {L2('顯示全部', 'Show All', lang)}</div> : null}
          {bodyMesh && bodyMesh.triangles.length > 0 ? <BodyRow visKey={ACTIVE_BODY_KEY} label={`${components.length > 0 ? '當前組件' : '活動實體'} ●`} sel={selectedParkedIndex == null} onClick={() => { useApp.getState().selectParkedBody(null); void useApp.getState().openPropertiesDialog(null) }} /> : null}
          {bodyMesh?.parked?.map((b, i) => <BodyRow key={'pb' + i} parkedIndex={i} visKey={parkedBodyKey(b.name, i)} label={(b as any).kind === 'body' ? b.name : `${b.name}（泊車 · 灰顯）`} sel={selectedParkedIndex === i} onClick={() => {
            const st = useApp.getState()
            st.selectParkedBody(i)
            // SO10 / BUG-SO15-002：统一测量 + 体过滤时树点选即量泊车半体体积；否则开属性。
            if (st.measureUniMode && st.measureSelFilter.body) void st.measureParkedBody(i)
            else void st.openPropertiesDialog(`parked:${i}`)
          }} />)}
          {!bodyMesh ? <Leaf icon="default" label="（空）" /> : null}
        </Section>
        {/* i18n: 實體 当前組件 活动實體 泊车 · 灰显 （空） 草图 特徵 尚无特徵 — wrapped via Leaf/Section internal tStatus */}
        {Object.keys(sketchSources).length > 0 && (
          <Section label={`${msg('tree.sketches', lang)} (${Object.keys(sketchSources).length})`}>
            {Object.keys(sketchSources).map((k) => <SketchRow key={k} k={k} />)}
          </Section>
        )}
        <Section label={`${msg('tree.features', lang)} (${features.length})`}>
          {features.length === 0 ? (
            <Leaf icon="default" label="（尚無特徵）" />
          ) : (
            features.map((f) => <FeatRow key={f.id} f={f} />)
          )}
        </Section>
      </div>
      {treeMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={() => setTreeMenu(null)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setTreeMenu(null) }} />
          <div role="menu" className="tree-ctx-menu" style={{ position: 'fixed', left: Math.min(treeMenu.x, window.innerWidth - 190), top: Math.min(treeMenu.y, window.innerHeight - treeMenu.items.length * 28 - 16), zIndex: 301, minWidth: 160, background: '#fff', border: '1px solid #c4ccd4', borderRadius: 6, boxShadow: '0 6px 24px rgba(0,0,0,.18)', padding: 4, fontSize: 13, color: '#2a2f35', userSelect: 'none' }}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation() }}>
            {treeMenu.items.map((it, i) => it === 'sep'
              ? <div key={'s' + i} style={{ height: 1, background: '#e6e9ee', margin: '4px 6px' }} />
              : <div key={it.key} role="menuitem" data-key={it.key} onClick={(e) => { e.stopPropagation(); setTreeMenu(null); if (!it.disabled) it.fn() }} style={{ padding: '6px 12px', borderRadius: 4, cursor: it.disabled ? 'default' : 'pointer', opacity: it.disabled ? 0.5 : 1, whiteSpace: 'nowrap' }} onMouseEnter={(e) => { if (!it.disabled) e.currentTarget.style.background = '#eaf2fb' }} onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>{it.label}</div>)}
          </div>
        </>
      )}
    </div>
    </TreeMenuCtx.Provider>
  )
}
