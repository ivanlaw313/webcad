import {patternPreviewPlan} from './patternPreviewPlan'
import { ellipseTangentCandidates } from './ellipseTangentVisual'
import { ellipseArcContainsAngle } from '../sketch/ellipseArcGeometry'
import { ellipseLineTangentPair, initialEllipseContact, refPts } from '../sketch/freesolve'
import { useState, useRef, useEffect, useLayoutEffect, useCallback, type ReactNode, type PointerEvent as RPointerEvent } from 'react'
import { useApp } from '../store'
import { tStatus, msg } from '../i18n'
import ProjectionLinkStatus from './ProjectionLinkStatus'

// T791：草圖「工具選項」浮動面板 —— 只顯示【當前工具】需要嘅設定，其它（CNC/激光/DXF/拉伸…）唔會喺度阻你。
// 可拖（標題欄）、可縮放（右下角 CSS resize）、可收起；位置/尺寸/收起態存 localStorage。
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
  select: '選擇工具', dimension: '尺寸工具', rectangle: '矩形', crect: '中心矩形', rect3: '三點矩形',
  circle: '圓', circle2p: '兩點圓', circle3: '三點圓', circle2t: '兩切點圓', circle3t: '三切點圓',
  polyline: '折線', mline: '中點線', polygon: '多邊形', slot: '槽', arcslot: '弧槽', rrect: '圓角矩形',
  arc: '三點圓弧', arcc: '中心圓弧', earc: '橢圓弧', conic: '圓錐曲線', ellipse: '橢圓', spline: '樣條', bspline: 'B 樣條',
  point: '草圖點', trim: '修剪', extend: '延伸', break: '打斷', offset: '偏移', cfillet: '倒圓角', cchamfer: '倒斜角', mirror: '鏡像', array: '陣列', cline: '構造參考線', move: '移動 / 複製', scale: '縮放',
}
const TOOL_HINT: Record<string, string> = {
  select: '點 點 / 邊 / 圓（可多選）· 空白左拖=框選 · 雙擊=鏈選 → 約束/尺寸/刪除/移動',
  dimension: '點 邊=長度 · 圓=Ø · 弧=R · 點→點=距離',
  rectangle: '點兩個對角點', crect: '點中心 → 點一角', rect3: '點 3 點（可畫斜矩形）',
  circle: '點圓心 → 點半徑', circle2p: '點直徑兩端兩點（打數字=Ø）', circle3: '點圓周 3 點', circle2t: '點兩條相切邊 → 定半徑', circle3t: '點三條相切邊',
  polyline: '連續點擊；回到起點或按「閉合」', mline: '點中點 → 點一端（由中點向兩端對稱）', polygon: '點中心 → 點一角', arc: '點 起點 / 終點 / 中點', arcc: '點圓心 → 起 → 終',
  earc: '點中心 → 長軸端 → 短軸 → 起角 → 終角', conic: '點 起點 → 終點 → 頂點；ρ 調充滿度', ellipse: '點中心 → 點包圍框角點確定兩個半軸（可輸入寬/高）', spline: '連續點擊控制點；雙擊/閉合收尾',
  bspline: '連續點擊控制點（曲線逼近）', point: '點位置落一個草圖點', rrect: '點兩個對角點（角自動倒圓）',
  slot: '點兩個圓心 → 定槽寬', arcslot: '點弧 3 點 → 定槽寬',
  trim: '✂ 點要剪走嗰段（剪到相交點；冇相交成條刪）', extend: '⟶ 點開放路徑嘅端段，延到最近相交', break: '⊟ 點曲線上一點 → 一分為二（兩段都保留）',
}

// GM-FP2 #34：tool-first 武裝態顯示用嘅約束中文名
const SK_CON_LABEL_ZH: Record<string, string> = { h: '水平', v: '豎直', coincident: '重合', parallel: '平行', perp: '垂直', equal: '相等', tangent: '相切', fix: '固定', midpoint: '中點', concentric: '同心', collinear: '共線', symmetric: '對稱' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3a4750' }}><span style={{ minWidth: 56 }}>{label}</span>{children}</label>
}
function ScaleValueInput({value,label,onValue,width=90}:{value:number;label:string;onValue:(n:number)=>void;width?:number}){
  const [text,setText]=useState(String(value))
  useEffect(()=>{if(Number.isFinite(value))setText(String(value))},[value])
  return <input aria-label={label} inputMode="decimal" value={text} onChange={e=>{const raw=e.target.value;setText(raw);onValue(raw.trim()?Number(raw):NaN)}} style={{width}} />
}
function Hint({ children }: { children: ReactNode }) {
  return <details style={{ fontSize: 11.5, color: '#6b7680', lineHeight: 1.5, marginTop: 2 }}><summary>操作說明</summary>{children}</details>
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
  const armedCon = useApp((s) => s.skArmedCon)            // GM-FP2 #34 tool-first 武裝態
  const dragging = useApp((s) => !!s.skDrag)
  const finishingDrag = useApp((s) => !!s.skDrag?.finishing)
  const dof = useApp((s) => s.skDof)
  const conflict = useApp((s) => s.skConflict)
  const skScale = useApp((s) => s.skScale)
  const skMove = useApp((s) => s.skMove)                  // GM-FP3 #39 Move gizmo 狀態
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
    || (TOOL_TITLE[tool] ? T(TOOL_TITLE[tool]) : null)
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
        <Row label={T('偏移距離')}><input className="tp-num" type="number" step={1} value={offsetD} onFocus={(e) => e.currentTarget.select()} onChange={(e) => g().setSketchOffsetD(Number(e.target.value))} style={{ width: 64 }} /><span style={{ fontSize: 11, color: '#8a97a2' }}>mm</span></Row>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sb-tool" style={{ flex: 1 }} title={T('把偏移方向（外↔內）調轉')} onClick={() => g().setSketchOffsetD(-offsetD)}>{T('⇄ 反向')}</button>
          <button className={'sb-tool' + (offsetBoth ? ' active' : '')} style={{ flex: 1 }} title={T('兩側各加一條偏移線')} onClick={() => g().toggleSketchOffsetBoth()}>{T('⇆ 雙向')}</button>
        </div>
        <Hint>{T('點一個輪廓鎖定 → 拖滑鼠調距離（外+/內−，1mm 步進）→ 點確定。或喺度打數字精確。')}</Hint>
      </>)
      break
    case 'cfillet':
    case 'cchamfer': {
      const isCh = tool === 'cchamfer'
      body = (<>
        <Row label={isCh ? T('回縮 C') : T('半徑 R')}><input className="tp-num" type="number" min={0} value={cornerR} onFocus={(e) => e.currentTarget.select()} onChange={(e) => g().setSketchCornerR(Number(e.target.value))} style={{ width: 64 }} /><span style={{ fontSize: 11, color: '#8a97a2' }}>mm</span></Row>
        <button className="sb-tool" title={T('一次過對當前輪廓所有直角倒')} onClick={() => isCh ? g().chamferSketchCorners(cornerR || 8) : g().filletSketchCorners(cornerR || 8)}>{T('全部角一次過')}</button>
        <Hint>{isCh ? T('點近一個直角頂點鎖定 → 拖滑鼠調回縮 → 點確定（或打數字 / 全部角）') : T('點近一個直角頂點鎖定 → 拖滑鼠調半徑 → 點確定（或打數字 / 全部角）')}</Hint>
      </>)
      break
    }
    case 'mirror': {
      const inLine = !!(mirrorPick && mirrorPick.stage === 'line')
      body = (<>
        <div style={{ fontSize: 12, fontWeight: 600, color: inLine ? '#1aa06b' : '#3a4750' }}>
          {inLine ? `② ${T('點一條直線邊做鏡像軸')}` : `① ${T('已選')} ${mirrorPick ? mirrorPick.shapes.length : 0} ${T('個輪廓')}`}
        </div>
        {!inLine && <button className="sb-tool" title={T('揀好要鏡像嘅輪廓 → 撳此 → 點一條現有直線邊/構造線做鏡像軸')} onClick={() => g().mirrorBeginLine()}>{T('✓ 揀軸線 →')}</button>}
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sb-tool" style={{ flex: 1 }} title={T('一鍵左右對稱（Y 軸）')} onClick={() => g().mirrorSketch('y')}>{T('⇋ 左右軸')}</button>
          <button className="sb-tool" style={{ flex: 1 }} title={T('一鍵上下對稱（X 軸）')} onClick={() => g().mirrorSketch('x')}>{T('⇅ 上下軸')}</button>
        </div>
        <Hint>{T('① 點輪廓揀（綠，點一個=揀晒成條相連邊）→「✓揀軸線」→ ② 點一條現有直線邊做鏡像軸（Fusion 式）。或用一鍵軸對稱。')}</Hint>
      </>)
      break
    }
    case 'conic': {
      const kind = conicRho < 0.5 ? T('橢圓弧') : conicRho > 0.5 ? T('雙曲線') : T('拋物線')
      body = (<>
        <Row label={T('充滿度 ρ')}><input className="tp-num" type="range" min={0.05} max={0.95} step={0.01} value={conicRho} onChange={(e) => g().setSketchConicRho(Number(e.target.value))} style={{ width: 96 }} /><span style={{ fontSize: 11, color: '#8a97a2', minWidth: 30 }}>{conicRho.toFixed(2)}</span></Row>
        <div style={{ fontSize: 11.5, color: conicRho === 0.5 ? '#1aa06b' : '#3a4750' }}>{kind}{conicRho === 0.5 ? '' : `（${conicRho < 0.5 ? '<' : '>'}0.5）`}</div>
        <Hint>{T('點 起點 → 終點 → 頂點（兩端切線交點）。ρ<0.5 橢圓弧 · 0.5 拋物線 · >0.5 雙曲線。真平滑 B-rep 邊。')}</Hint>
      </>)
      break
    }
    case 'polygon':
      body = (<>
        <Row label={T('邊數')}><input className="tp-num" type="number" min={3} value={sides} onFocus={(e) => e.currentTarget.select()} onChange={(e) => g().setSketchSides(Number(e.target.value))} style={{ width: 56 }} /></Row>
        <button className={'sb-tool' + (inscribed ? ' active' : '')} title={T('切換 外接圓(過角點) / 內切圓(對邊距=扳手尺寸)')} onClick={() => g().togglePolyInscribed()}>{inscribed ? T('內切（對邊距）') : T('外接（過角點）')}</button>
        {/* GM-FP4 #17：多邊形【邊】變體 —— 點一條邊兩端定邊長+朝向 */}
        <button className={'sb-tool' + (polyEdgeMode ? ' active' : '')} title={T('邊模式（Fusion Edge Polygon）：點一條邊嘅兩端定邊長+朝向，多邊形沿該邊生長（vs 中心+半徑）')} onClick={() => g().setPolyEdgeMode(!polyEdgeMode)}>{polyEdgeMode ? T('⬡ 邊模式（點兩端）') : T('◉ 中心模式')}</button>
        <Hint>{polyEdgeMode ? T('點一條邊嘅兩端（定邊長+朝向）') : T('點中心 → 點一角')}</Hint>
      </>)
      break
    case 'slot':
    case 'arcslot':
      body = (<>
        <Row label={T('槽寬')}><input className="tp-num" type="number" min={1} value={slotW} onFocus={(e) => e.currentTarget.select()} onChange={(e) => g().setSketchSlotW(Number(e.target.value))} style={{ width: 56 }} /><span style={{ fontSize: 11, color: '#8a97a2' }}>mm</span></Row>
        {/* GM-FP4 #18：直槽 3 變體（心心 / 總長 / 中心點）；弧槽維持三點圓弧 */}
        {tool === 'slot' && (
          <div style={{ display: 'flex', gap: 4 }}>
            {(['cc', 'overall', 'centerpt'] as const).map((m) => (
              <button key={m} className={'sb-tool' + (slotMode === m ? ' active' : '')} style={{ flex: 1, fontSize: 11, padding: '2px 4px' }}
                title={m === 'cc' ? T('心心：點兩個弧心（距離=槽長）') : m === 'overall' ? T('總長：點兩端最外緣（tip-to-tip=總長）') : T('中心點：先點槽中心 → 再點一個弧心（對稱）')}
                onClick={() => g().setSlotMode(m)}>{m === 'cc' ? T('心心') : m === 'overall' ? T('總長') : T('中心點')}</button>
            ))}
          </div>
        )}
        <Hint>{T(TOOL_HINT[tool] || '')}</Hint>
      </>)
      break
    case 'rrect':
      body = (<>
        <Row label={T('圓角 R')}><input className="tp-num" type="number" min={0} value={cornerR} onFocus={(e) => e.currentTarget.select()} onChange={(e) => g().setSketchCornerR(Number(e.target.value))} style={{ width: 56 }} /><span style={{ fontSize: 11, color: '#8a97a2' }}>mm</span></Row>
        <Hint>{T(TOOL_HINT.rrect)}</Hint>
      </>)
      break
    case 'circle2t':
    case 'circle3t':
      body = (<>
        <Row label={T('切圓 R')}><input className="tp-num" type="number" min={0.2} step={1} value={tanR} onChange={(e) => g().setSketchTanR(Number(e.target.value))} style={{ width: 56 }} /><span style={{ fontSize: 11, color: '#8a97a2' }}>mm</span></Row>
        <Hint>{T(TOOL_HINT[tool] || '')}</Hint>
      </>)
      break
    case 'dimension':
      body = (<>
        <button className={'sb-tool' + (dimArcLen ? ' active' : '')} title={T('開住時點圓弧 = 落 ⌒弧長（驅動）；關 = R 半徑')} onClick={() => g().toggleDimArcLen()}>{T('⌒ 弧長尺寸')}</button>
        <Hint>{T('點 邊 → 放置：垂直偏置=真長(Aligned) · 左右放=豎直投影 · 上下放=水平投影 · 點另一條邊=平行間距/夾角 · 圓=Ø · 右鍵尺寸=R↔Ø/從動')}</Hint>
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
          <button className={'sb-tool' + (a.kind === 'circ' ? ' active' : '')} style={{ flex: 1 }} disabled={patternSession?.mode==='reconfigure'&&existingPattern?.config.kind!=='circular'} onClick={() => set({ kind: 'circ' })}>{T('✳ 環形')}</button>
        </div>
        {patternSession?.mode==='reconfigure'&&<div style={{fontSize:11.5}}>{m('sk.array.changeType')}</div>}
        {a.kind === 'rect' ? (<>
          {/* GM-FP4 #53：Distance Type（Fusion Rectangular Pattern）—— 間距 Spacing（每格）/ 總跨 Extent（首末總距） */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'sb-tool' + (a.distType === 'spacing' ? ' active' : '')} style={{ flex: 1, fontSize: 11 }} title={T('間距：X/Y 值 = 相鄰兩格之間嘅距離')} onClick={() => set({ distType: 'spacing' })}>{T('間距 Spacing')}</button>
            <button className={'sb-tool' + (a.distType === 'extent' ? ' active' : '')} style={{ flex: 1, fontSize: 11 }} title={T('總跨：X/Y 值 = 首末兩件之間嘅總距（內部自動 ÷(n−1)）')} onClick={() => set({ distType: 'extent' })}>{T('總跨 Extent')}</button>
          </div>
          <Row label={T('列數 ×')}><ScaleValueInput label="Array columns" value={a.nx} onValue={n=>set({nx:n})} width={80} /></Row>
          <Row label={a.distType === 'extent' ? T('X 總跨') : T('X 間距')}><ScaleValueInput label="Array X distance" value={a.dx} onValue={n=>set({dx:n})} width={80} /></Row>
          <Row label={T('行數 ×')}><ScaleValueInput label="Array rows" value={a.ny} onValue={n=>set({ny:n})} width={80} /></Row>
          <Row label={a.distType === 'extent' ? T('Y 總跨') : T('Y 間距')}><ScaleValueInput label="Array Y distance" value={a.dy} onValue={n=>set({dy:n})} width={80} /></Row>
        </>) : (<>
          <Row label={T('數量')}><ScaleValueInput label="Array count" value={a.count} onValue={n=>set({count:n})} width={80} /></Row>
          {/* GM-FP4 #53：Angle Type（Fusion Circular Pattern）—— 整圈 Full（均分 360°）/ 指定角 Angle */}
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'sb-tool' + (a.angleType === 'full' ? ' active' : '')} style={{ flex: 1, fontSize: 11 }} title={T('整圈：count 份均分 360°')} onClick={() => set({ angleType: 'full' })}>{T('整圈 Full')}</button>
            <button className={'sb-tool' + (a.angleType === 'angle' ? ' active' : '')} style={{ flex: 1, fontSize: 11 }} title={T('指定角：用下面「總角度」鋪開')} onClick={() => set({ angleType: 'angle' })}>{T('指定角')}</button>
          </div>
          {a.angleType === 'angle' && <Row label={T('總角度')}><ScaleValueInput label="Array angle" value={a.angle} onValue={n=>set({angle:n})} width={80} /> °</Row>}
          <Row label={T('中心 X')}><ScaleValueInput label="Array center X" value={a.cx} onValue={n=>set({cx:n})} width={80} /></Row>
          <Row label={T('中心 Y')}><ScaleValueInput label="Array center Y" value={a.cy} onValue={n=>set({cy:n})} width={80} /></Row>
        </>)}
        <button className="sb-tool sb-finish" title={T('按上面參數陣列當前輪廓')} data-array-apply disabled={pending||!ready||(!associative&&!validation.ok)} onClick={()=>void g().applyArray()}>{associative?(patternSession?.mode==='create'?m('sk.array.applyLinked'):m('sk.array.applyChanges')):T('應用陣列')}</button>
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
          <button className={'sb-tool' + (clineOrient === 'v' ? ' active' : '')} style={{ flex: 1 }} title={T('豎直構造線（過點的上下方向）')} onClick={() => g().setClineOrient('v')}>{T('┊ 豎直')}</button>
          <button className={'sb-tool' + (clineOrient === 'h' ? ' active' : '')} style={{ flex: 1 }} title={T('水平構造線（過點的左右方向）')} onClick={() => g().setClineOrient('h')}>{T('┄ 水平')}</button>
        </div>
        {/* GM-FP4 #23：中心線語義標記（旋轉軸 / 對稱參照） */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3a4750', cursor: 'pointer' }} title={T('中心線（Fusion Centerline）：做旋轉軸 / 對稱參照嘅語義標記')}>
          <input type="checkbox" checked={clineCenterline} onChange={(e) => g().setClineCenterline(e.target.checked)} />
          <span>{T('┋ 中心線（旋轉軸/對稱參照）')}</span>
        </label>
        <Hint>{T('點位置即落一條長虛線構造參考線。做對中參考，或做鏡像嘅中心軸（鏡像第②步點佢）。唔參與拉伸。')}</Hint>
      </>)
      break
    case 'polyline':
    case 'spline':
    case 'bspline':
      body = (<>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sb-tool sb-finish" style={{ flex: 1, opacity: polyN >= 2 ? 1 : 0.5 }} title={T('完成做開放直線/折線（唔回起點，可做參考/掃掠路徑/鏡像軸）')} onClick={() => g().finishOpenPolyline()}>{T('✓ 完成線')}</button>
          <button className="sb-tool sb-finish" style={{ flex: 1, opacity: polyN >= 3 ? 1 : 0.5 }} title={T('回起點閉合成面（可拉伸）')} onClick={() => g().closePolyline()}>{T('✓ 閉合')}</button>
        </div>
        <Hint>{`${polyN} ${T('點')} · ${T(TOOL_HINT[tool] || '連續點擊落點')}　—　${T('畫一條直線：點 2 點 →「✓ 完成線」')}`}</Hint>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3a4750', cursor: 'pointer' }} title={T('剔=複製（原件保留）；唔剔=移動')}>
          <input type="checkbox" checked={!!skMove.copy} onChange={(e) => g().setSkMoveCopy(e.target.checked)} />
          <span>{T('Create Copy 複製')}</span>
        </label>
        {!skMove.copy && <div data-move-constraint-help style={{ fontSize: 11.5, color: '#1c6fb8', lineHeight: 1.5 }}>{m('sk.move.help')}</div>}
        {!!skMove.copy && <div data-copy-constraint-help style={{ fontSize: 11.5, color: '#1c6fb8', lineHeight: 1.5 }}>{m('sk.copy.help')}</div>}
        {!skMove.copy&&movePreview.pending&&<div role="status">{m('sk.move.checking')}</div>}
        {movePreview.error&&<div role="alert" style={{color:'#b42318'}}>{movePreview.error}</div>}
        <div style={{display:'flex',flexDirection:'column',gap:6}}>{(['dx','dy','ang'] as const).map(field=><Row key={field} label={field==='ang'?m('sk.move.angle'):`${field} mm`}><input aria-label={field==='ang'?'Move angle':'Move '+field} inputMode="decimal" value={skMove.inputDraft?.[field]??String(skMove[field])} onChange={e=>g().setSkMoveValue(field,e.target.value)} style={{width:90}} /></Row>)}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sb-tool sb-finish" style={{ flex: 1 }} title={T('應用（Enter）')} disabled={!!skMove.inputError||!skMove.copy&&(movePreview.pending||!!movePreview.error||!movePreview.shapes)} onClick={() => g().commitSkMove()}>{T('✓ 應用')}</button>
          <button className="sb-tool" style={{ flex: 1 }} title={T('取消（Esc）')} onClick={() => g().cancelSkMove()}>{T('取消')}</button>
        </div>
        <button className="sb-tool" style={{ width: '100%' }} title={T('打字精確 dx,dy[,角度][,副本數]')} onClick={() => void g().skMovePrompt()}>{T('⌨ 打字精確…')}</button>
        <Hint>{T('拖 →X（紅）/ ↑Y（綠）箭頭平移 · 拖藍弧轉（繞形心）· Enter 確定 · Esc 取消')}</Hint>
      </>) : <Hint>{T('先用選擇工具揀一個或多個輪廓，再撳 Move')}</Hint>
      break
    case 'select':
      body = (<>
        <div role="status" data-sketch-drag-help style={{ fontSize: 12, lineHeight: 1.5, overflowWrap: 'anywhere', color: conflict ? '#a32d27' : '#3a4750' }}>
          {finishingDrag ? m('sk.drag.confirming') : dragging ? m('sk.drag.release') : conflict ? m('sk.drag.conflict') : dof === 0 ? m('sk.drag.fully') : m('sk.drag.idle')}
        </div>
        {(armedCon === 'tangent' || ellipseLineSelected) && <div style={{ fontSize: 11.5, color: '#1c6fb8', lineHeight: 1.5 }}>{ellipseTangentNeedsRotation ? m('sk.tan.needsRot') : noEllipseTangentCandidate ? m('sk.tan.noCand') : m('sk.tan.whole')}</div>}
        {dragging && <button className="sb-tool" onClick={() => g().skDragCancel()}>{m('sk.drag.cancel')}</button>}
        {armedCon
          ? <div style={{ fontSize: 12, fontWeight: 700, color: '#1c6fb8', lineHeight: 1.5 }}>{`${T('施約束武裝中')}：${T(SK_CON_LABEL_ZH[armedCon] ?? armedCon)}`}<div style={{ fontWeight: 400, color: '#5a6b78', fontSize: 11.5, marginTop: 2 }}>{T('揀要約束嘅對象（揀夠即施加，保持武裝）· ESC 退出')}</div></div>
          : <Hint>{T('點 點/邊/圓 揀選（可多選）· 空白左拖=框選（左→右全包/右→左相觸）· 雙擊邊=鏈選 → 撳約束/尺寸掣。或先撳約束掣（無選擇）= tool-first。')}</Hint>}
        {/* GM-FP4 #47：撳真空白 = 清選擇（Fusion 默認）/ 唔清（防誤清，webcad 舊手感） */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3a4750', cursor: 'pointer' }} title={T('開=撳真空白即清選擇（Fusion 默認）；關=撳空唔清（防誤清，ESC 先清）')}>
          <input type="checkbox" checked={selEmptyClear} onChange={(e) => g().setSelEmptyClear(e.target.checked)} />
          <span>{T('撳空白 = 清選擇')}</span>
        </label>
      </>)
      break
    default:
      body = <Hint>{T(TOOL_HINT[tool] || '喺上方 ribbon「草圖」揀一個工具')}</Hint>
  }

  return (
    <div
      ref={ref}
      data-sketch-tool-panel role="region" aria-label={T('草圖工具選項')}
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
        <span style={{ fontSize: 12.5, fontWeight: 700, color: '#1c5a96', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={T('工具選項 · 拖動標題移動，拖右下角縮放')}>⚙ {title}</span>
        <button className="sb-tool" style={{ padding: '0 4px', minWidth: 0 }} title={T('恢復工具面板位置和大小')} onClick={() => setGeom({ ...DEFAULT_GEOM, collapsed: geom.collapsed })}>↺</button>
        <button className="sb-tool" aria-expanded={!geom.collapsed} style={{ padding: '0 6px', minWidth: 0, lineHeight: '18px' }} title={T('收起 / 展開')} onClick={() => setGeom((gg) => ({ ...gg, collapsed: !gg.collapsed }))}>{geom.collapsed ? '▸' : '▾'}</button>
      </div>
      {!geom.collapsed && (
        <div style={{ padding: '9px 10px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'auto', overflowWrap: 'anywhere' }}>
          <ProjectionLinkStatus />
          {body}
          {/* GM-FP2 #33：AutoConstrain — 繪製時自動推斷開關（默認開，Fusion palette 同款）+ 一鍵對選中/全部推斷 */}
          <div style={{ borderTop: '1px solid #e3ebf3', marginTop: 2, paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3a4750', cursor: 'pointer' }} title={T('畫圖時自動加 水平/豎直/重合/平行/相切… 約束（Fusion AutoConstrain）')}>
              <input type="checkbox" checked={autoConstrain} onChange={(e) => g().setAutoConstrain(e.target.checked)} />
              <span>{T('自動約束推斷')}</span>
            </label>
            <button className="sb-tool" style={{ width: '100%' }} title={T('對選中集（無選擇=全部幾何）一次推斷多約束')} onClick={() => g().autoConstrainSel()}>{T('✨ 一鍵自動約束')}</button>
            {/* GM-FP4 #22：Linetype 預開關 —— 開住時之後畫嘅幾何即時成構造（琥珀虛線，Fusion Linetype 預切換） */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: drawConstruction ? '#b9822a' : '#3a4750', cursor: 'pointer' }} title={T('構造線型預切換（Fusion Linetype）：開住時之後畫嘅形即時成構造幾何（琥珀虛線，唔參與拉伸）')}>
              <input type="checkbox" checked={drawConstruction} onChange={() => g().toggleDrawConstruction()} />
              <span>{T('⚟ 畫成構造幾何（下一筆）')}</span>
            </label>
          </div>
        </div>
      )}
    </div>
  )
}
