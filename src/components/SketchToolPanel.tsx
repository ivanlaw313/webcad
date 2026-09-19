import {patternPreviewPlan} from './patternPreviewPlan'
import { ellipseTangentCandidates } from './ellipseTangentVisual'
import { ellipseArcContainsAngle } from '../sketch/ellipseArcGeometry'
import { ellipseLineTangentPair, initialEllipseContact, refPts } from '../sketch/freesolve'
import { useState, useRef, useEffect, useLayoutEffect, useCallback, type ReactNode, type PointerEvent as RPointerEvent } from 'react'
import { useApp } from '../store'
import { tStatus, msg } from '../i18n'
import ProjectionLinkStatus from './ProjectionLinkStatus'

// T791：草图「工具选项」浮动面板 —— 只显示【当前工具】需要嘅设定，其它（CNC/激光/DXF/拉伸…）唔会喺度阻你。
// 可拖（标题栏）、可缩放（右下角 CSS resize）、可收起；位置/尺寸/收起态存 localStorage。
const LS = 'webcad_toolpanel_v1'
type PanelGeom = { x: number; y: number; w: number; h: number; collapsed: boolean }
const DEFAULT_GEOM: PanelGeom = { x: 14, y: 110, w: 236, h: 0, collapsed: false }
function loadGeom(): PanelGeom {
  try {
    const j = JSON.parse(localStorage.getItem(LS) || '')
    return {
      x: Number.isFinite(j.x) ? j.x : DEFAULT_GEOM.x,
      y: Number.isFinite(j.y) ? j.y : DEFAULT_GEOM.y,
      w: Number.isFinite(j.w) ? Math.max(168, Math.min(460, j.w)) : DEFAULT_GEOM.w,
      h: Number.isFinite(j.h) ? Math.max(0, j.h) : 0,
      collapsed: j.collapsed === true,
    }
  } catch { return { ...DEFAULT_GEOM } }
}

const TOOL_TITLE: Record<string, string> = {
  select: '選擇工具', dimension: '尺寸工具', rectangle: '矩形', crect: '中心矩形', rect3: '三点矩形',
  circle: '圆', circle2p: '两点圆', circle3: '三点圆', circle2t: '两切点圆', circle3t: '三切点圆',
  polyline: '折线', mline: '中点线', polygon: '多边形', slot: '槽', arcslot: '弧槽', rrect: '圆角矩形',
  arc: '三点圆弧', arcc: '中心圆弧', earc: '椭圆弧', conic: '圆锥曲线', ellipse: '椭圆', spline: '样条', bspline: 'B 样条',
  point: '草图点', trim: '修剪', extend: '延伸', break: '打断', offset: '偏移', cfillet: '倒圆角', cchamfer: '倒斜角', mirror: '镜像', array: '阵列', cline: '构造参考线', move: '移动 / 复制', scale: '缩放',
}
const TOOL_HINT: Record<string, string> = {
  select: '点 点 / 边 / 圆（可多选）· 空白左拖=框选 · 双击=链选 → 约束/尺寸/删除/移动',
  dimension: '点 边=长度 · 圆=Ø · 弧=R · 点→点=距离',
  rectangle: '点两个对角点', crect: '点中心 → 点一角', rect3: '点 3 点（可画斜矩形）',
  circle: '点圆心 → 点半径', circle2p: '点直径两端两点（打数字=Ø）', circle3: '点圆周 3 点', circle2t: '点两条相切边 → 定半径', circle3t: '点三条相切边',
  polyline: '连续点击；回到起点或按「闭合」', mline: '点中点 → 点一端（由中点向两端对称）', polygon: '点中心 → 点一角', arc: '点 起点 / 终点 / 中点', arcc: '点圆心 → 起 → 终',
  earc: '点中心 → 长轴端 → 短轴 → 起角 → 终角', conic: '点 起点 → 终点 → 顶点；ρ 调充满度', ellipse: '点中心 → 点包围框角点确定两个半轴（可输入宽/高）', spline: '连续点击控制点；双击/闭合收尾',
  bspline: '连续点击控制点（曲线逼近）', point: '点位置落一个草图点', rrect: '点两个对角点（角自动倒圆）',
  slot: '点两个圆心 → 定槽宽', arcslot: '点弧 3 点 → 定槽宽',
  trim: '✂ 点要剪走嗰段（剪到相交点；冇相交成条删）', extend: '⟶ 点开放路径嘅端段，延到最近相交', break: '⊟ 点曲线上一点 → 一分为二（两段都保留）',
}

// GM-FP2 #34：tool-first 武装态显示用嘅约束中文名
const SK_CON_LABEL_ZH: Record<string, string> = { h: '水平', v: '竖直', coincident: '重合', parallel: '平行', perp: '垂直', equal: '相等', tangent: '相切', fix: '固定', midpoint: '中点', concentric: '同心', collinear: '共线', symmetric: '对称' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3a4750' }}><span style={{ minWidth: 56 }}>{label}</span>{children}</label>
}
function ScaleValueInput({value,label,onValue,width=90}:{value:number;label:string;onValue:(n:number)=>void;width?:number}){
  const [text,setText]=useState(String(value))
  useEffect(()=>{if(Number.isFinite(value))setText(String(value))},[value])
  return <input aria-label={label} inputMode="decimal" value={text} onChange={e=>{const raw=e.target.value;setText(raw);onValue(raw.trim()?Number(raw):NaN)}} style={{width}} />
}
function Hint({ children }: { children: ReactNode }) {
  return <details style={{ fontSize: 11.5, color: '#6b7680', lineHeight: 1.5, marginTop: 2 }}><summary>操作说明</summary>{children}</details>
}

export function SketchToolPanel() {
  const mode = useApp((s) => s.mode)
  const lang = useApp((s) => s.lang)
  const tool = useApp((s) => s.sketchTool)
  const ellipseCreation = useApp((s) => s.ellipseCreation)
  const ellipseArcDirection = useApp((s) => s.ellipseArcDirection)
  const offsetD = useApp((s) => s.sketchOffsetD)
  const offsetBoth = useApp((s) => s.sketchOffsetBoth)
  const cornerR = useApp((s) => s.sketchCornerR)
  const conicRho = useApp((s) => s.sketchConicRho)
  const sides = useApp((s) => s.sketchSides)
  const inscribed = useApp((s) => s.polyInscribed)
  const slotW = useApp((s) => s.sketchSlotW)
  const tanR = useApp((s) => s.sketchTanR)
  const dimArcLen = useApp((s) => s.dimArcLen)
  const mirrorPick = useApp((s) => s.mirrorPick)
  const movePreview=useApp(s=>s.skMovePreview)
  const arrayPending = useApp(s=>s.arrayPending)
  const arrayPreview = useApp(s=>s.arrayPreview)
  const patternSession=useApp(s=>s.skPatternSession),patternPreview=useApp(s=>s.skPatternPreview),patternData=useApp(s=>s.skPatternData)
  const arrayProfiles=useApp(s=>s.sketchProfiles),arrayShape=useApp(s=>s.sketchShape),arraySelection=useApp(s=>s.skSel)
  const arrayCfg = useApp((s) => s.arrayCfg)
  const clineOrient = useApp((s) => s.clineOrient)
  const clineCenterline = useApp((s) => s.clineCenterline)   // GM-FP4 #23
  const polyEdgeMode = useApp((s) => s.polyEdgeMode)         // GM-FP4 #17
  const slotMode = useApp((s) => s.slotMode)                 // GM-FP4 #18
  const drawConstruction = useApp((s) => s.drawConstruction) // GM-FP4 #22
  const polyN = useApp((s) => s.polyPts.length)
  const autoConstrain = useApp((s) => s.autoConstrain)   // GM-FP2 #33
  const ellipseLineSelected = useApp((s) => s.skSel.length === 2 && s.skSel.some(r => r.kind === 'ellipse' || r.kind === 'ellipse-arc') && s.skSel.some(r => r.kind === 'edge'))
  const noEllipseTangentCandidate = useApp((s) => {if(s.skSel.length!==2)return false;const shapes=[...s.sketchProfiles,...(s.sketchShape?[s.sketchShape]:[])],pair=ellipseLineTangentPair(shapes,s.skSel[0],s.skSel[1]);return !!pair&&!initialEllipseContact(shapes,pair)})
  const ellipseTangentNeedsRotation = useApp((s) => {if(s.skSel.length!==2)return false;const shapes=[...s.sketchProfiles,...(s.sketchShape?[s.sketchShape]:[])],pair=ellipseLineTangentPair(shapes,s.skSel[0],s.skSel[1]);if(!pair||!initialEllipseContact(shapes,pair))return false;const sh=shapes[pair.ellipse.shape];if(sh.type!=='poly'||!sh.earc)return false;const [a,b]=refPts(shapes,pair.line);return !ellipseTangentCandidates(sh.earc,a,b).some(c=>ellipseArcContainsAngle(sh.earc!,c.angleDeg))})
  const armedCon = useApp((s) => s.skArmedCon)            // GM-FP2 #34 tool-first 武装态
  const dragging = useApp((s) => !!s.skDrag)
  const finishingDrag = useApp((s) => !!s.skDrag?.finishing)
  const dof = useApp((s) => s.skDof)
  const conflict = useApp((s) => s.skConflict)
  const skScale = useApp((s) => s.skScale)
  const skMove = useApp((s) => s.skMove)                  // GM-FP3 #39 Move gizmo 状态
  const selEmptyClear = useApp((s) => s.selEmptyClear)   // GM-FP4 #47

  const [geom, setGeom] = useState<PanelGeom>(loadGeom)
  const ref = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ ox: number; oy: number; px: number; py: number } | null>(null)

  const fit = useCallback((g: PanelGeom): PanelGeom => {
    const el = ref.current
    const parent = el?.offsetParent as HTMLElement | null
    if (!el || !parent) return g
    const w = Math.min(g.w, Math.max(1, parent.clientWidth - 8))
    const x = Math.max(4, Math.min(g.x, parent.clientWidth - Math.min(el.offsetWidth, w) - 4))
    const y = Math.max(4, Math.min(g.y, parent.clientHeight - el.offsetHeight - 88))
    return w === g.w && x === g.x && y === g.y ? g : { ...g, w, x, y }
  }, [])

  useLayoutEffect(() => { setGeom(fit) }, [mode, geom.x, geom.y, geom.w, geom.collapsed, fit])

  useEffect(() => { try { localStorage.setItem(LS, JSON.stringify(geom)) } catch { /* ignore quota */ } }, [geom])

  // Observe both the panel and its canvas: opening the browser tree changes
  // the available area without necessarily firing a window resize.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth, h = el.offsetHeight
      setGeom((gg) => fit(gg.collapsed ? gg : { ...gg, w, h }))
    })
    ro.observe(el)
    if (el.offsetParent) ro.observe(el.offsetParent)
    return () => ro.disconnect()
  }, [mode, geom.collapsed, fit])

  const onHeaderDown = useCallback((e: RPointerEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    setGeom((gg) => { dragRef.current = { ox: gg.x, oy: gg.y, px: e.clientX, py: e.clientY }; return gg })
    const move = (ev: globalThis.PointerEvent) => { const d = dragRef.current; if (!d) return; setGeom((gg) => fit({ ...gg, x: d.ox + ev.clientX - d.px, y: d.oy + ev.clientY - d.py })) }
    const up = () => { dragRef.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('blur', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up); window.addEventListener('blur', up)
  }, [fit])

  if (mode !== 'sketch') return null
  const g = () => useApp.getState()
  const T = (s: string) => tStatus(s, lang)
  const m = (key: string, ...args: Array<string | number>) => {
    let s = msg(key, lang)
    args.forEach((a, i) => { s = s.replace(`{${i}}`, String(a)) })
    return s
  }
  const titleKey = tool === 'dimension' ? 'sk.toolTitle.dimension' : `sk.toolTitle.${tool}`
  // v1.80: never fall back to EN "Dimension" — catalog first, then TOOL_TITLE zh source, then default
  const title = (msg(titleKey, lang) !== titleKey ? msg(titleKey, lang) : null)
    || (tool === 'dimension' ? msg('sk.dimension', lang) : null)
    || TOOL_TITLE[tool]
    || msg('sk.toolTitle.default', lang)

  let body: ReactNode
  switch (tool) {
    case 'earc':
      body = <>
        <Row label={m('sk.earc.dir')}><select aria-label={m('sk.earc.dirAria')} value={ellipseArcDirection} onChange={(e) => g().setEllipseArcDirection(e.target.value as 'ccw'|'cw')}>
          <option value="ccw">{m('sk.earc.ccw')}</option><option value="cw">{m('sk.earc.cw')}</option>
        </select></Row>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>{m('sk.earc.hint')}</div>
      </>
      break
    case 'ellipse':
      body = (<>
        <Row label={m('sk.ellipse.method')}><select aria-label={m('sk.ellipse.methodAria')} value={ellipseCreation} onChange={(e) => g().setEllipseCreation(e.target.value as 'axis-aligned' | 'three-point')} style={{ minWidth: 0, maxWidth: '100%', flex: 1 }}>
          <option value="axis-aligned">{m('sk.ellipse.axisAligned')}</option>
          <option value="three-point">{m('sk.ellipse.threePoint')}</option>
        </select></Row>
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>{ellipseCreation === 'three-point' ? m('sk.ellipse.hint3') : m('sk.ellipse.hint2')}</div>
      </>)
      break
    case 'offset':
      body = (<>
        <Row label={T('偏移距离')}><input className="tp-num" type="number" step={1} value={offsetD} onFocus={(e) => e.currentTarget.select()} onChange={(e) => g().setSketchOffsetD(Number(e.target.value))} style={{ width: 64 }} /><span style={{ fontSize: 11, color: '#8a97a2' }}>mm</span></Row>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sb-tool" style={{ flex: 1 }} title={T('把偏移方向（外↔内）调转')} onClick={() => g().setSketchOffsetD(-offsetD)}>{T('⇄ 反向')}</button>
          <button className={'sb-tool' + (offsetBoth ? ' active' : '')} style={{ flex: 1 }} title={T('两侧各加一条偏移线')} onClick={() => g().toggleSketchOffsetBoth()}>{T('⇆ 双向')}</button>
        </div>
        <Hint>{T('点一个轮廓锁定 → 拖鼠标调距离（外+/内−，1mm 步进）→ 点确定。或喺度打数字精确。')}</Hint>
      </>)
      break
    case 'cfillet':
    case 'cchamfer': {
      const isCh = tool === 'cchamfer'
      body = (<>
        <Row label={isCh ? T('回缩 C') : T('半径 R')}><input className="tp-num" type="number" min={0} value={cornerR} onFocus={(e) => e.currentTarget.select()} onChange={(e) => g().setSketchCornerR(Number(e.target.value))} style={{ width: 64 }} /><span style={{ fontSize: 11, color: '#8a97a2' }}>mm</span></Row>
        <button className="sb-tool" title={T('一次过对当前轮廓所有直角倒')} onClick={() => isCh ? g().chamferSketchCorners(cornerR || 8) : g().filletSketchCorners(cornerR || 8)}>{T('全部角一次过')}</button>
        <Hint>{isCh ? T('点近一个直角顶点锁定 → 拖鼠标调回缩 → 点确定（或打数字 / 全部角）') : T('点近一个直角顶点锁定 → 拖鼠标调半径 → 点确定（或打数字 / 全部角）')}</Hint>
      </>)
      break
    }
    case 'mirror': {
      const inLine = !!(mirrorPick && mirrorPick.stage === 'line')
      body = (<>
        <div style={{ fontSize: 12, fontWeight: 600, color: inLine ? '#1aa06b' : '#3a4750' }}>
          {inLine ? `② ${T('点一条直线边做镜像轴')}` : `① ${T('已选')} ${mirrorPick ? mirrorPick.shapes.length : 0} ${T('个轮廓')}`}
        </div>
        {!inLine && <button className="sb-tool" title={T('拣好要镜像嘅轮廓 → 撳此 → 点一条现有直线边/构造线做镜像轴')} onClick={() => g().mirrorBeginLine()}>{T('✓ 拣轴线 →')}</button>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sb-tool" style={{ flex: 1 }} title={T('一键左右对称（Y 轴）')} onClick={() => g().mirrorSketch('y')}>{T('⇋ 左右轴')}</button>
          <button className="sb-tool" style={{ flex: 1 }} title={T('一键上下对称（X 轴）')} onClick={() => g().mirrorSketch('x')}>{T('⇅ 上下轴')}</button>
        </div>
        <Hint>{T('① 点轮廓拣（绿，点一个=拣晒成条相连边）→「✓拣轴线」→ ② 点一条现有直线边做镜像轴（Fusion 式）。或用一键轴对称。')}</Hint>
      </>)
      break
    }
    case 'conic': {
      const kind = conicRho < 0.5 ? T('椭圆弧') : conicRho > 0.5 ? T('双曲线') : T('抛物线')
      body = (<>
        <Row label={T('充满度 ρ')}><input className="tp-num" type="range" min={0.05} max={0.95} step={0.01} value={conicRho} onChange={(e) => g().setSketchConicRho(Number(e.target.value))} style={{ width: 96 }} /><span style={{ fontSize: 11, color: '#8a97a2', minWidth: 30 }}>{conicRho.toFixed(2)}</span></Row>
        <div style={{ fontSize: 11.5, color: conicRho === 0.5 ? '#1aa06b' : '#3a4750' }}>{kind}{conicRho === 0.5 ? '' : `（${conicRho < 0.5 ? '<' : '>'}0.5）`}</div>
        <Hint>{T('点 起点 → 终点 → 顶点（两端切线交点）。ρ<0.5 椭圆弧 · 0.5 抛物线 · >0.5 双曲线。真平滑 B-rep 边。')}</Hint>
      </>)
      break
    }
    case 'polygon':
      body = (<>
        <Row label={T('边数')}><input className="tp-num" type="number" min={3} value={sides} onFocus={(e) => e.currentTarget.select()} onChange={(e) => g().setSketchSides(Number(e.target.value))} style={{ width: 56 }} /></Row>
        <button className={'sb-tool' + (inscribed ? ' active' : '')} title={T('切换 外接圆(过角点) / 内切圆(对边距=扳手尺寸)')} onClick={() => g().togglePolyInscribed()}>{inscribed ? T('内切（对边距）') : T('外接（过角点）')}</button>
        {/* GM-FP4 #17：多边形【边】变体 —— 点一条边两端定边长+朝向 */}
        <button className={'sb-tool' + (polyEdgeMode ? ' active' : '')} title={T('边模式（Fusion Edge Polygon）：点一条边嘅两端定边长+朝向，多边形沿该边生长（vs 中心+半径）')} onClick={() => g().setPolyEdgeMode(!polyEdgeMode)}>{polyEdgeMode ? T('⬡ 边模式（点两端）') : T('◉ 中心模式')}</button>
        <Hint>{polyEdgeMode ? T('点一条边嘅两端（定边长+朝向）') : T('点中心 → 点一角')}</Hint>
      </>)
      break
    case 'slot':
    case 'arcslot':
      body = (<>
        <Row label={T('槽宽')}><input className="tp-num" type="number" min={1} value={slotW} onFocus={(e) => e.currentTarget.select()} onChange={(e) => g().setSketchSlotW(Number(e.target.value))} style={{ width: 56 }} /><span style={{ fontSize: 11, color: '#8a97a2' }}>mm</span></Row>
        {/* GM-FP4 #18：直槽 3 变体（心心 / 总长 / 中心点）；弧槽维持三点圆弧 */}
        {tool === 'slot' && (
          <div style={{ display: 'flex', gap: 4 }}>
            {(['cc', 'overall', 'centerpt'] as const).map((m) => (
              <button key={m} className={'sb-tool' + (slotMode === m ? ' active' : '')} style={{ flex: 1, fontSize: 11, padding: '2px 4px' }}
                title={m === 'cc' ? T('心心：点两个弧心（距离=槽长）') : m === 'overall' ? T('总长：点两端最外缘（tip-to-tip=总长）') : T('中心点：先点槽中心 → 再点一个弧心（对称）')}
                onClick={() => g().setSlotMode(m)}>{m === 'cc' ? T('心心') : m === 'overall' ? T('总长') : T('中心点')}</button>
            ))}
          </div>
        )}
        <Hint>{TOOL_HINT[tool]}</Hint>
      </>)
      break
    case 'rrect':
      body = (<>
        <Row label={T('圆角 R')}><input className="tp-num" type="number" min={0} value={cornerR} onFocus={(e) => e.currentTarget.select()} onChange={(e) => g().setSketchCornerR(Number(e.target.value))} style={{ width: 56 }} /><span style={{ fontSize: 11, color: '#8a97a2' }}>mm</span></Row>
        <Hint>{TOOL_HINT.rrect}</Hint>
      </>)
      break
    case 'circle2t':
    case 'circle3t':
      body = (<>
        <Row label={T('切圆 R')}><input className="tp-num" type="number" min={0.2} step={1} value={tanR} onChange={(e) => g().setSketchTanR(Number(e.target.value))} style={{ width: 56 }} /><span style={{ fontSize: 11, color: '#8a97a2' }}>mm</span></Row>
        <Hint>{TOOL_HINT[tool]}</Hint>
      </>)
      break
    case 'dimension':
      body = (<>
        <button className={'sb-tool' + (dimArcLen ? ' active' : '')} title={T('开住时点圆弧 = 落 ⌒弧长（驱动）；关 = R 半径')} onClick={() => g().toggleDimArcLen()}>{T('⌒ 弧长尺寸')}</button>
        <Hint>{T('点 边 → 放置：垂直偏置=真长(Aligned) · 左右放=竖直投影 · 上下放=水平投影 · 点另一条边=平行间距/夹角 · 圆=Ø · 右键尺寸=R↔Ø/从动')}</Hint>
      </>)
      break
    case 'array': {
      const a = arrayCfg
      const associative=!!patternSession,existingPattern=patternData?.patterns[0]
      const sourceCount=patternSession?.mode==='reconfigure'?existingPattern?.sourceEntityIds.length??0:undefined
      const pending=arrayPending||(associative?patternPreview.pending:arrayPreview.pending)
      const previewError=associative?patternPreview.error:arrayPreview.error
      const ready=associative?!!patternPreview.document&&!patternPreview.error:!!arrayPreview.shapes&&!arrayPreview.error
      const shapeCount=arrayProfiles.length+(arrayShape?1:0),selectedCount=new Set(arraySelection.flatMap(r=>'shape'in r&&Number.isInteger(r.shape)&&r.shape>=0&&r.shape<shapeCount?[r.shape]:[])).size
      const validation=patternPreviewPlan(a,selectedCount||shapeCount,shapeCount)
      const set = (patch: Partial<typeof a>) => g().setArrayCfg(patch)
      body = (<>
        <div style={{display:'flex',flexDirection:'column',gap:5}}>
          <button className={'sb-tool'+(!associative?' active':'')} data-array-independent onClick={()=>{if(patternSession){g().cancelSketchPattern();g().setSketchTool('array')}}}>{m('sk.array.independent')}</button>
          {!existingPattern&&<button className={'sb-tool'+(patternSession?.mode==='create'?' active':'')} data-pattern-create disabled={!selectedCount||pending} onClick={()=>g().beginSketchPattern('create')}>{m('sk.array.createAssoc')}</button>}
          {existingPattern&&<div style={{display:'flex',gap:5}}><button className={'sb-tool'+(patternSession?.mode==='reconfigure'?' active':'')} data-pattern-edit style={{flex:1}} disabled={pending} onClick={()=>g().beginSketchPattern('reconfigure')}>{m('sk.array.editLinked')}</button><button className="sb-tool" data-pattern-detach style={{flex:1}} disabled={pending} title={m('sk.array.detachTitle')} onClick={()=>g().detachSketchPattern()}>{m('sk.array.detach')}</button></div>}
        </div>
        <div data-pattern-source-info style={{fontSize:11.5,lineHeight:1.5,color:'#1c6fb8'}}>{associative?m('sk.array.srcLinked', sourceCount??selectedCount):m('sk.array.srcIndep', selectedCount||shapeCount)}{associative&&patternPreview.document&&m('sk.array.previewTotal', patternPreview.document.shapes.length)}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={'sb-tool' + (a.kind === 'rect' ? ' active' : '')} style={{ flex: 1 }} disabled={patternSession?.mode==='reconfigure'&&existingPattern?.config.kind!=='rectangular'} onClick={() => set({ kind: 'rect' })}>{T('▦ 矩形')}</button>
          <button className={'sb-tool' + (a.kind === 'circ' ? ' active' : '')} style={{ flex: 1 }} disabled={patternSession?.mode==='reconfigure'&&existingPattern?.config.kind!=='circular'} onClick={() => set({ kind: 'circ' })}>{T('✳ 环形')}</button>
        </div>
        {patternSession?.mode==='reconfigure'&&<div style={{fontSize:11.5}}>{m('sk.array.changeType')}</div>}
        {a.kind === 'rect' ? (<>
          {/* GM-FP4 #53：Distance Type（Fusion Rectangular Pattern）—— 间距 Spacing（每格）/ 总跨 Extent（首末总距） */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'sb-tool' + (a.distType === 'spacing' ? ' active' : '')} style={{ flex: 1, fontSize: 11 }} title={T('间距：X/Y 值 = 相邻两格之间嘅距离')} onClick={() => set({ distType: 'spacing' })}>{T('间距 Spacing')}</button>
            <button className={'sb-tool' + (a.distType === 'extent' ? ' active' : '')} style={{ flex: 1, fontSize: 11 }} title={T('总跨：X/Y 值 = 首末两件之间嘅总距（内部自动 ÷(n−1)）')} onClick={() => set({ distType: 'extent' })}>{T('总跨 Extent')}</button>
          </div>
          <Row label={T('列数 ×')}><ScaleValueInput label="Array columns" value={a.nx} onValue={n=>set({nx:n})} width={80} /></Row>
          <Row label={a.distType === 'extent' ? T('X 总跨') : T('X 间距')}><ScaleValueInput label="Array X distance" value={a.dx} onValue={n=>set({dx:n})} width={80} /></Row>
          <Row label={T('行数 ×')}><ScaleValueInput label="Array rows" value={a.ny} onValue={n=>set({ny:n})} width={80} /></Row>
          <Row label={a.distType === 'extent' ? T('Y 总跨') : T('Y 间距')}><ScaleValueInput label="Array Y distance" value={a.dy} onValue={n=>set({dy:n})} width={80} /></Row>
        </>) : (<>
          <Row label={T('数量')}><ScaleValueInput label="Array count" value={a.count} onValue={n=>set({count:n})} width={80} /></Row>
          {/* GM-FP4 #53：Angle Type（Fusion Circular Pattern）—— 整圈 Full（均分 360°）/ 指定角 Angle */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'sb-tool' + (a.angleType === 'full' ? ' active' : '')} style={{ flex: 1, fontSize: 11 }} title={T('整圈：count 份均分 360°')} onClick={() => set({ angleType: 'full' })}>{T('整圈 Full')}</button>
            <button className={'sb-tool' + (a.angleType === 'angle' ? ' active' : '')} style={{ flex: 1, fontSize: 11 }} title={T('指定角：用下面「总角度」铺开')} onClick={() => set({ angleType: 'angle' })}>{T('指定角')}</button>
          </div>
          {a.angleType === 'angle' && <Row label={T('总角度')}><ScaleValueInput label="Array angle" value={a.angle} onValue={n=>set({angle:n})} width={80} /> °</Row>}
          <Row label={T('中心 X')}><ScaleValueInput label="Array center X" value={a.cx} onValue={n=>set({cx:n})} width={80} /></Row>
          <Row label={T('中心 Y')}><ScaleValueInput label="Array center Y" value={a.cy} onValue={n=>set({cy:n})} width={80} /></Row>
        </>)}
        <button className="sb-tool sb-finish" title={T('按上面参数阵列当前轮廓')} data-array-apply disabled={pending||!ready||(!associative&&!validation.ok)} onClick={()=>void g().applyArray()}>{associative?(patternSession?.mode==='create'?m('sk.array.applyLinked'):m('sk.array.applyChanges')):T('应用阵列')}</button>
        {!associative&&!validation.ok&&<div role="alert" data-array-error style={{color:'#b42318',fontSize:11.5}}>{validation.reason}</div>}
        {previewError&&<div role="alert" data-array-error style={{color:'#b42318',fontSize:11.5}}>{previewError}</div>}
        {pending&&<div role="status">{m('sk.array.validating')}</div>}
        {associative&&patternPreview.omitted.length>0&&<div role="status" data-pattern-omitted style={{fontSize:11.5,color:'#8b5b0b'}}>{m('sk.array.omitted', patternPreview.omitted.length)}</div>}
        {associative&&<button className="sb-tool" data-pattern-cancel onClick={()=>g().cancelSketchPattern()}>{m('sk.array.cancelChanges')}</button>}
        {!associative&&<div data-array-copy-help style={{fontSize:11.5,lineHeight:1.5,color:'#1c6fb8'}}>{m('sk.array.indepHelp')}</div>}
      </>)
      break
    }
    case 'cline':
      body = (<>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={'sb-tool' + (clineOrient === 'v' ? ' active' : '')} style={{ flex: 1 }} title={T('竖直构造线（过点的上下方向）')} onClick={() => g().setClineOrient('v')}>{T('┊ 竖直')}</button>
          <button className={'sb-tool' + (clineOrient === 'h' ? ' active' : '')} style={{ flex: 1 }} title={T('水平构造线（过点的左右方向）')} onClick={() => g().setClineOrient('h')}>{T('┄ 水平')}</button>
        </div>
        {/* GM-FP4 #23：中心线语义标记（旋转轴 / 对称参照） */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3a4750', cursor: 'pointer' }} title={T('中心线（Fusion Centerline）：做旋转轴 / 对称参照嘅语义标记')}>
          <input type="checkbox" checked={clineCenterline} onChange={(e) => g().setClineCenterline(e.target.checked)} />
          <span>{T('┋ 中心线（旋转轴/对称参照）')}</span>
        </label>
        <Hint>{T('点位置即落一条长虚线构造参考线。做对中参考，或做镜像嘅中心轴（镜像第②步点佢）。唔参与拉伸。')}</Hint>
      </>)
      break
    case 'polyline':
    case 'spline':
    case 'bspline':
      body = (<>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sb-tool sb-finish" style={{ flex: 1, opacity: polyN >= 2 ? 1 : 0.5 }} title={T('完成做开放直线/折线（唔回起点，可做参考/扫掠路径/镜像轴）')} onClick={() => g().finishOpenPolyline()}>{T('✓ 完成线')}</button>
          <button className="sb-tool sb-finish" style={{ flex: 1, opacity: polyN >= 3 ? 1 : 0.5 }} title={T('回起点闭合成面（可拉伸）')} onClick={() => g().closePolyline()}>{T('✓ 闭合')}</button>
        </div>
        <Hint>{`${polyN} ${T('点')} · ${TOOL_HINT[tool] || T('连续点击落点')}　—　${T('画一条直线：点 2 点 →「✓ 完成线」')}`}</Hint>
      </>)
      break
    case 'scale':
      body = skScale ? (<>
        <div data-scale-help style={{fontSize:11.5,lineHeight:1.5,color:'#1c6fb8'}}>{m('sk.scale.help')}</div>
        <label style={{display:'flex',gap:6,alignItems:'center'}}>{m('sk.scale.factor')}<ScaleValueInput label="Scale factor" value={skScale.factor} onValue={n=>void g().setSkScaleFactor(n)} /></label>
        <div style={{display:'flex',gap:6}}>{(['X','Y'] as const).map((axis,i)=><label key={axis}>{axis}<ScaleValueInput label={`Scale base ${axis}`} value={i?skScale.cy:skScale.cx} onValue={n=>g().setSkScaleBase(i?[skScale.cx,n]:[n,skScale.cy])} width={80} /></label>)}</div>
        <button className="sb-tool" data-scale-pick-base onClick={()=>g().pickSkScaleBase()}>{skScale.stage==='base'?m('sk.scale.clickBase'):m('sk.scale.pickBase')}</button>
        {skScale.pending&&<div role="status">{m('sk.scale.checking')}</div>}
        {skScale.error&&<div role="alert" style={{color:'#b42318',fontSize:11.5}}>{skScale.error}</div>}
        <div style={{display:'flex',gap:6}}><button className="sb-tool sb-finish" data-scale-apply disabled={skScale.pending||!!skScale.error||skScale.stage==='base'||skScale.stage==='dragging'} onClick={()=>void g().confirmSkScale()}>{m('sk.scale.apply')}</button><button className="sb-tool" data-scale-cancel onClick={()=>g().cancelSkScale()}>{m('sk.scale.cancel')}</button></div>
        <button className="sb-tool" data-scale-input onClick={()=>g().skScalePrompt()}>{m('sk.scale.legacy')}</button>
      </>) : (<button className="sb-tool" onClick={()=>g().startSkScale()}>{m('sk.scale.start')}</button>)
      break
    case 'move':
      body = skMove ? (<>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3a4750', cursor: 'pointer' }} title={T('剔=复制（原件保留）；唔剔=移动')}>
          <input type="checkbox" checked={!!skMove.copy} onChange={(e) => g().setSkMoveCopy(e.target.checked)} />
          <span>{T('Create Copy 复制')}</span>
        </label>
        {!skMove.copy && <div data-move-constraint-help style={{ fontSize: 11.5, color: '#1c6fb8', lineHeight: 1.5 }}>{m('sk.move.help')}</div>}
        {!!skMove.copy && <div data-copy-constraint-help style={{ fontSize: 11.5, color: '#1c6fb8', lineHeight: 1.5 }}>{m('sk.copy.help')}</div>}
        {!skMove.copy&&movePreview.pending&&<div role="status">{m('sk.move.checking')}</div>}
        {movePreview.error&&<div role="alert" style={{color:'#b42318'}}>{movePreview.error}</div>}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>{(['dx','dy','ang'] as const).map(field=><Row key={field} label={field==='ang'?m('sk.move.angle'):`${field} mm`}><input aria-label={field==='ang'?'Move angle':'Move '+field} inputMode="decimal" value={skMove.inputDraft?.[field]??String(skMove[field])} onChange={e=>g().setSkMoveValue(field,e.target.value)} style={{width:90}} /></Row>)}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sb-tool sb-finish" style={{ flex: 1 }} title={T('应用（Enter）')} disabled={!!skMove.inputError||!skMove.copy&&(movePreview.pending||!!movePreview.error||!movePreview.shapes)} onClick={() => g().commitSkMove()}>{T('✓ 应用')}</button>
          <button className="sb-tool" style={{ flex: 1 }} title={T('取消（Esc）')} onClick={() => g().cancelSkMove()}>{T('取消')}</button>
        </div>
        <button className="sb-tool" style={{ width: '100%' }} title={T('打字精确 dx,dy[,角度][,副本数]')} onClick={() => void g().skMovePrompt()}>{T('⌨ 打字精确…')}</button>
        <Hint>{T('拖 →X（红）/ ↑Y（绿）箭头平移 · 拖蓝弧转（绕形心）· Enter 确定 · Esc 取消')}</Hint>
      </>) : <Hint>{T('先用选择工具拣一个或多个轮廓，再撳 Move')}</Hint>
      break
    case 'select':
      body = (<>
        <div role="status" data-sketch-drag-help style={{ fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere', color: conflict ? '#a32d27' : '#3a4750' }}>
          {finishingDrag ? m('sk.drag.confirming') : dragging ? m('sk.drag.release') : conflict ? m('sk.drag.conflict') : dof === 0 ? m('sk.drag.fully') : m('sk.drag.idle')}
        </div>
        {(armedCon === 'tangent' || ellipseLineSelected) && <div style={{ fontSize: 11.5, color: '#1c6fb8', lineHeight: 1.5 }}>{ellipseTangentNeedsRotation ? m('sk.tan.needsRot') : noEllipseTangentCandidate ? m('sk.tan.noCand') : m('sk.tan.whole')}</div>}
        {dragging && <button className="sb-tool" onClick={() => g().skDragCancel()}>{m('sk.drag.cancel')}</button>}
        {armedCon
          ? <div style={{ fontSize: 12, fontWeight: 700, color: '#1c6fb8', lineHeight: 1.5 }}>{`${T('施约束武装中')}：${SK_CON_LABEL_ZH[armedCon] ?? armedCon}`}<div style={{ fontWeight: 400, color: '#5a6b78', fontSize: 11.5, marginTop: 2 }}>{T('拣要约束嘅对象（拣够即施加，保持武装）· ESC 退出')}</div></div>
          : <Hint>{T('点 点/边/圆 拣选（可多选）· 空白左拖=框选（左→右全包/右→左相触）· 双击边=链选 → 撳约束/尺寸掣。或先撳约束掣（无选择）= tool-first。')}</Hint>}
        {/* GM-FP4 #47：撳真空白 = 清选择（Fusion 默认）/ 唔清（防误清，webcad 旧手感） */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3a4750', cursor: 'pointer' }} title={T('开=撳真空白即清选择（Fusion 默认）；关=撳空唔清（防误清，ESC 先清）')}>
          <input type="checkbox" checked={selEmptyClear} onChange={(e) => g().setSelEmptyClear(e.target.checked)} />
          <span>{T('撳空白 = 清选择')}</span>
        </label>
      </>)
      break
    default:
      body = <Hint>{TOOL_HINT[tool] || T('喺上方 ribbon「草图」拣一个工具')}</Hint>
  }

  return (
    <div
      ref={ref}
      data-sketch-tool-panel role="region" aria-label={T('草图工具选项')}
      style={{
        position: 'absolute', left: geom.x, top: geom.y, width: geom.collapsed ? 'auto' : geom.w,
        height: geom.collapsed ? 'auto' : geom.h || undefined,
        minWidth: geom.collapsed ? 0 : 'min(168px, calc(100% - 8px))', maxWidth: 'calc(100% - 8px)', maxHeight: 'max(40px, calc(100% - 88px))',
        display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
        resize: geom.collapsed ? 'none' : 'both', overflow: 'hidden',
        background: 'rgba(255,255,255,0.97)', border: '1px solid #b9cfe2', borderRadius: 9,
        boxShadow: '0 4px 18px rgba(20,60,110,0.16)', zIndex: 70, userSelect: 'none', backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onPointerDown={onHeaderDown}
        style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 6, padding: '5px 8px', cursor: 'move', touchAction: 'none', background: 'linear-gradient(#eef5fc,#e3eefa)', borderBottom: geom.collapsed ? 'none' : '1px solid #d3e1ef', borderRadius: '9px 9px 0 0' }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1c5a96', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={T('工具选项 · 拖动标题移动，拖右下角缩放')}>⚙ {title}</span>
        <button className="sb-tool" style={{ padding: '0 4px', minWidth: 0 }} title={T('恢复工具面板位置和大小')} onClick={() => setGeom({ ...DEFAULT_GEOM, collapsed: geom.collapsed })}>↺</button>
        <button className="sb-tool" aria-expanded={!geom.collapsed} style={{ padding: '0 6px', minWidth: 0, lineHeight: '18px' }} title={T('收起 / 展开')} onClick={() => setGeom((gg) => ({ ...gg, collapsed: !gg.collapsed }))}>{geom.collapsed ? '▸' : '▾'}</button>
      </div>
      {!geom.collapsed && (
        <div style={{ padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'auto', overflowWrap: 'anywhere' }}>
          <ProjectionLinkStatus />
          {body}
          {/* GM-FP2 #33：AutoConstrain — 绘制时自动推断开关（默认开，Fusion palette 同款）+ 一键对选中/全部推断 */}
          <div style={{ borderTop: '1px solid #e3ebf3', marginTop: 2, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3a4750', cursor: 'pointer' }} title={T('画图时自动加 水平/竖直/重合/平行/相切… 约束（Fusion AutoConstrain）')}>
              <input type="checkbox" checked={autoConstrain} onChange={(e) => g().setAutoConstrain(e.target.checked)} />
              <span>{T('自动约束推断')}</span>
            </label>
            <button className="sb-tool" style={{ width: '100%' }} title={T('对选中集（无选择=全部几何）一次推断多约束')} onClick={() => g().autoConstrainSel()}>{T('✨ 一键自动约束')}</button>
            {/* GM-FP4 #22：Linetype 预开关 —— 开住时之后画嘅几何即时成构造（琥珀虚线，Fusion Linetype 预切换） */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: drawConstruction ? '#b9822a' : '#3a4750', cursor: 'pointer' }} title={T('构造线型预切换（Fusion Linetype）：开住时之后画嘅形即时成构造几何（琥珀虚线，唔参与拉伸）')}>
              <input type="checkbox" checked={drawConstruction} onChange={() => g().toggleDrawConstruction()} />
              <span>{T('⚟ 画成构造几何（下一笔）')}</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
