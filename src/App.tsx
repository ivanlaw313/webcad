import { protectEscape } from './cad/escapeKey'
import { useEffect, lazy, Suspense, useState, useRef } from 'react'
import Ribbon from './components/Ribbon'
import BrowserTree from './components/BrowserTree'
import Viewport from './components/Viewport'
import Timeline from './components/Timeline'
import JointsPanel from './components/JointsPanel'
import ParamsPanel from './components/ParamsPanel'
import InspectorPanel from './components/InspectorPanel'   // S103[4]：选择属性检查器
// 报告 P2：代码分包 — 只在打开时先加载嘅重面板（约束草图 / 切层 / 版本历史）改 lazy，
// 移出初始 bundle，加快首屏 TTI。佢哋本身就系条件渲染，lazy 自然贴合。
import JointOriginPalette from './components/JointOriginPalette'

const CSketch = lazy(() => import('./components/CSketch'))
const HelpPanelLazy = lazy(() => import('./components/HelpPanel'))
const CommandPaletteLazy = lazy(() => import('./components/CommandPalette'))
const AiCopilotLazy = lazy(() => import('./components/AiCopilot'))
const SlicePanel = lazy(() => import('./components/SlicePanel'))
const HistoryPanel = lazy(() => import('./components/HistoryPanel'))
const DrawingPanel = lazy(() => import('./components/DrawingPanel'))
const PhysicsLab = lazy(() => import('./components/PhysicsLab'))
import IntroCard from './components/IntroCard'
import ErrorBoundary from './components/ErrorBoundary'
import PromptDialog from './components/PromptDialog'
import InsertDialog from './components/InsertDialog'   // GM-X3 #7/#8/#11：矢量（SVG/DXF）+ 网格（STL/OBJ）插入对话框
import TeachPointer from './components/TeachPointer'   // P6 v1.1：AI 教学高亮命令时的弹跳箭头图像指引
import Tour from './components/Tour'   // GM-W6 E：手把手教学（step-by-step tutorial）步骤卡
import DebugHud from './components/DebugHud'
import LoadingBar from './components/LoadingBar'   // 全局加载进度条（import/export/重建大档案时显示）
import { ScrubNumberDrag } from './components/CommandDialog'   // 命令对话框数字栏左右拖改值（Fusion 式）
import { useApp } from './store'
import { ensureMeshDropHost } from './io/meshDropHost'
import { VISUAL_STYLE_KEYMAP } from './cad/viewModel'   // GM-X2 #1：Ctrl+4..9 视觉样式
import { isUiTestIsolation } from './runtime/uiTestIsolation'
import { useCSketch } from './sketch/csketch'
import './sketch/solver'

export default function App() {
  const [startupReady, setStartupReady] = useState(false)
  const appDropRef = useRef<HTMLDivElement>(null)

  // v1.43 BUG-BD-4101: document-level mesh drop host (capture) — canvas cannot swallow drops
  useEffect(() => {
    return ensureMeshDropHost({
      accept: (file) => { void useApp.getState().acceptMeshDropFile(file) },
      setStatus: (status) => { useApp.setState({ status }) },
    })
  }, [])
  const csketchOpen = useApp((s) => s.csketchOpen)
  const browserCollapsed = useApp((s) => s.browserCollapsed)
  const sliceOpen = useApp((s) => s.sliceOpen)
  const sliceMesh = useApp((s) => s.bodyMesh)
  const historyOpen = useApp((s) => s.historyOpen)
  const drawingOpen = useApp((s) => s.drawingOpen)
  const helpOpen = useApp((s) => s.helpOpen)
  const cmdPaletteOpen = useApp((s) => s.cmdPaletteOpen)
  const aiOpen = useApp((s) => s.aiOpen)
  const physicsLabOpen = useApp((s) => s.physicsLabOpen)
  // Restore: 分享链接(#p=) 优先于自动存档（T797）；冇分享链接先还原 autosave。
  useEffect(() => {
    void (async () => {
      try {
        if (!isUiTestIsolation()) {
          const shared = await useApp.getState().loadShareHash()
          if (!shared) await useApp.getState().restoreAutosave()
        }
      } finally {
        setStartupReady(true)
      }
    })()
  }, [])
  // First-ever visit (no `webcad_seen_intro` flag) → show the quick-start card once.
  useEffect(() => { try { if (!isUiTestIsolation() && !localStorage.getItem('webcad_seen_intro')) useApp.getState().openIntro() } catch { /* ignore */ } }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!startupReady) return
      if (e.key === 'Escape' && e.repeat) return
      const t = e.target as HTMLElement | null
      if (e.isComposing || e.keyCode === 229) return
      // Keep normal text entry local to the focused field, but never swallow the
      // two command-dialog keys Fusion users rely on: Enter commits and Esc
      // cancels even while a numeric field has focus.  Modifier shortcuts (undo,
      // redo, save…) must stay available too.
      const editingText = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (editingText && (e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) return
      if (editingText && !e.ctrlKey && !e.metaKey && e.key !== 'Enter' && e.key !== 'Escape') return
      // UI02: Escape in a free text/number field (dimension edit, document name, …)
      // cancels only that field. SOLID/command dialogs keep global Esc via
      // role=dialog / .cmd-palette (and their own Escape layers).
      if (editingText && e.key === 'Escape') {
        // BUG-UI-002: timeline feature-dimension editor (.feat-editor) is a dialog-class overlay —
        // Esc must close it (selectFeature null), not get swallowed as a free-text local cancel.
        const inDialog = !!(t.closest?.('[role="dialog"], .cmd-palette, .feat-editor'))
        if (!inDialog) return
      }
      if (e.ctrlKey || e.metaKey) {
        const ck = e.key.toLowerCase()
        if (ck === 'z' && !e.shiftKey) { e.preventDefault(); if (useApp.getState().csketchOpen) useCSketch.getState().undo(); else void useApp.getState().undo() }
        else if (ck === 'y' || (ck === 'z' && e.shiftKey)) { e.preventDefault(); if (useApp.getState().csketchOpen) useCSketch.getState().redo(); else void useApp.getState().redo() }
        else if (ck === 's') { e.preventDefault(); useApp.getState().saveProject() } // Ctrl+S = 保存项目（拦截浏览器存页）
        else if (ck === 'o') { e.preventDefault(); useApp.getState().openProject() } // Ctrl+O = 打开项目（拦截浏览器开档）
        else if (ck === 'd') { const sc = useApp.getState().selectedComponent; if (sc) { e.preventDefault(); useApp.getState().duplicateComponent(sc) } } // Ctrl+D = 复制选中组件（拦书签）
        // GM-X2 #1：Ctrl+4..9 = 6 视觉样式枚举（着色±边 / 线框±边，对标 Fusion）。
        else if (VISUAL_STYLE_KEYMAP[e.key]) { e.preventDefault(); useApp.getState().setVisualStyle(VISUAL_STYLE_KEYMAP[e.key]) }
        // GM-X2 #16：Ctrl+Shift+F = 全屏切换（对标 Fusion Enter Full Screen）。
        else if (ck === 'f' && e.shiftKey) { e.preventDefault(); try { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen() } catch { /* 不支持 */ } }
        return
      }
      // BUG-BD-1804：Alt+O = 插入 STL（绕过可能挂起的原生菜单路径）
      if (e.altKey && e.key.toLowerCase() === 'o') { e.preventDefault(); useApp.getState().openStlDialog(); return }
      if (e.altKey) return
      const s = useApp.getState()
      if (s.uiDialog) return
      if (e.key === 'Escape' && s.cmdPaletteOpen) { s.setCmdPalette(false); return }
      if (e.key === 'Escape' && s.helpOpen) { s.toggleHelp(); return }
      // Constraint-sketch overlay: ESC cancels in-progress draw → clears selection → closes (Fusion-style step-back).
      if (s.csketchOpen && e.key === 'Escape') {
        e.preventDefault()
        const cs = useCSketch.getState()
        if (cs.draft.length > 0) useCSketch.setState({ draft: [], preview: null, status: '已取消當前繪製（再按 Esc 清選擇 / 退出）' })
        else if (cs.selection.length > 0) cs.clearSelection()
        else useCSketch.getState().setTool('select')
        return
      }
      // Constraint-sketch tool shortcuts (match the freehand sketch + Fusion): L line / R rect / C circle /
      // P polygon / T trim / E extend / B break / Q select. (INPUT guard above keeps these out of dim fields.)
      if (s.csketchOpen) {
        const cmap: Record<string, 'line' | 'rect' | 'circle' | 'polygon' | 'trim' | 'extend' | 'break' | 'select'> =
          { l: 'line', r: 'rect', c: 'circle', p: 'polygon', t: 'trim', e: 'extend', b: 'break', q: 'select' }
        const ck = cmap[e.key.toLowerCase()]
        if (ck) { e.preventDefault(); useCSketch.getState().setTool(ck); return }
      }
      if (e.key === 'F1') { e.preventDefault(); s.toggleHelp(); return }
      // Command search palette (Fusion-style "S" search; we use "/" since S = sketch).
      if (e.key === '/') { e.preventDefault(); s.setCmdPalette(true); return }
      // GM-FP3 #39 Move gizmo：Enter = 确定（应用移动/复制）。Esc 由下面 escSketch 取消。
      if (s.mode === 'sketch' && s.skMove && e.key === 'Enter') { e.preventDefault(); s.commitSkMove(); return }
      // T796b：拖柄调尺寸中（offset/cfillet/cchamfer 已锁定目标）— 键盘数字直接设 距离/半径，Enter 确定、Esc 取消。
      // 必须喺下面「起点坐标」分支之前拦截，否则数字会误入幽灵起点、第一下 ESC 又取消唔到调尺寸。
      if (s.mode === 'sketch' && s.sizing &&
          (/^[0-9.]$/.test(e.key) || (s.sizing.tool === 'offset' && e.key === '-') || e.key === 'Enter' || e.key === 'Backspace' || e.key === 'Escape')) {
        e.preventDefault(); s.sizeTypeKey(e.key); return
      }
      // Exact-dimension typing while sketching: digits/'.'/Tab/Enter/Backspace go to the dim entry.
      if (s.mode === 'sketch' && (s.sketchStart != null || s.polyPts.length > 0) &&
          (/^[0-9.]$/.test(e.key) || e.key === 'Enter' || e.key === 'Tab' || e.key === 'Backspace')) {
        // GM-W6 B2：折线/样条画紧时【空 buffer 嘅裸 Enter = 收笔】（对齐 Fusion）——旧版会静默经
        // sketchTypeKey 落一个幽灵点（空 buffer parseFloat=NaN → 回落上一长度照加点）。有数字先走精确尺寸。
        if (e.key === 'Enter' && !s.dimBuf[0] && !s.dimBuf[1] && !s.sketchStart && s.polyPts.length >= 2 &&
            (s.sketchTool === 'polyline' || s.sketchTool === 'spline' || s.sketchTool === 'bspline')) {
          e.preventDefault(); s.finishOpenPolyline(); return
        }
        e.preventDefault(); s.sketchTypeKey(e.key); return
      }
      // Before the first point: typing a digit/'.'/'-' starts ABSOLUTE start-coordinate entry (X Tab Y Enter)
      // for the active draw tool. Tab/Enter/Backspace only when a buffer's started (avoid placing 0,0 by accident).
      if (s.mode === 'sketch' && s.sketchStart == null && s.polyPts.length === 0) {
        const hasBuf = !!(s.dimBuf[0] || s.dimBuf[1])
        if (/^[0-9.\-]$/.test(e.key) || ((e.key === 'Enter' || e.key === 'Tab' || e.key === 'Backspace') && hasBuf)) {
          e.preventDefault(); s.sketchTypeKey(e.key); return
        }
      }
      // Fillet/chamfer command (Fusion-style): Enter = 确定（应用到所选棱）, Esc = 取消
      if (s.edgeRoundPick) {
        if (e.key === 'Enter') { e.preventDefault(); void s.commitEdgeRound(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.cancelEdgeRound(); return }
      }
      if (s.shellMode) {
        if (e.key === 'Enter') { e.preventDefault(); void s.commitShell(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.cancelShell(); return }
      }
      if (s.pushPullMode) {
        if (e.key === 'Enter') { e.preventDefault(); void s.commitPushPull(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.togglePushPull(); return }
      }
      if (s.faceFilletMode) {   // R1 面圆角：Enter=确定 / Esc=取消
        if (e.key === 'Enter') { e.preventDefault(); void s.commitFaceFillet(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.cancelFaceFillet(); return }
      }
      if (s.holeMode) {
        if (e.key === 'Enter') { e.preventDefault(); void s.commitHole(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.cancelHole(); return }
      }
      if (s.featDlg) {
        if (e.key === 'Enter') { e.preventDefault(); void s.commitFeatDlg(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.cancelFeatDlg(); return }
      }
      // Extrude dialog (Fusion-style): Enter = 确定（生成）, Esc = 取消
      if (s.extrudeDlgOpen) {
        if (e.key === 'Enter') { e.preventDefault(); void s.extrudeSketch(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.cancelExtrudeDlg(); return }
      }
      // Sweep dialog: Enter = 确定（扫掠）, Esc = 取消
      if (s.sweepDlgOpen) {
        if (e.key === 'Enter') { e.preventDefault(); void s.commitSweepPath(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.cancelSweepDlg(); return }
      }
      // Loft dialog: Enter = 确定（放样）, Esc = 取消
      if (s.loftDlgOpen) {
        if (e.key === 'Enter') { e.preventDefault(); void s.commitLoft(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.cancelLoftDlg(); return }
      }
      // Move Face uses the viewport command bar rather than CommandDialog.
      // Its keyboard route must still match its visible Confirm/Cancel controls.
      if (s.moveFaceMode) {
        if (e.key === 'Enter') { e.preventDefault(); void s.commitMoveFace(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.toggleMoveFace(); return }
      }
      if (s.draftPickMode) {
        if (e.key === 'Enter') { e.preventDefault(); void s.finishDraftPick(); return }
        if (e.key === 'Escape') { e.preventDefault(); s.toggleDraftPick(); return }
      }
      // Direct face/UCS pick modes have no modal component to consume Escape.
      if (s.rotateFaceMode && e.key === 'Escape') { e.preventDefault(); s.toggleRotateFace(); return }
      if (s.ucsPick && e.key === 'Escape') { e.preventDefault(); s.toggleUCSPick(); return }
      // Keep every direct SOLID edit in the same explicit Escape path.  This
      // also avoids relying on the older catch-all block below, where inline
      // comments can make a later branch unreachable.
      if (s.delFaceMode && e.key === 'Escape') { e.preventDefault(); s.toggleDelFace(); return }
      if (s.splitPlanePick && e.key === 'Escape') { e.preventDefault(); s.toggleSplitPlanePick(); return }
      if (s.thickenMode && e.key === 'Escape') { e.preventDefault(); s.toggleThicken(); return }
      if (s.offsetSurfMode && e.key === 'Escape') { e.preventDefault(); s.toggleOffsetSurf(); return }
      if (s.extendSurfMode && e.key === 'Escape') { e.preventDefault(); s.toggleExtendSurf(); return }
      if (s.splitFaceMode && e.key === 'Escape') { e.preventDefault(); s.toggleSplitFace(); return }
      if (s.replaceFaceMode && e.key === 'Escape') { e.preventDefault(); s.toggleReplaceFace(); return }
      if (s.surfTrimMode && e.key === 'Escape') { e.preventDefault(); void s.toggleSurfSurfTrim(); return }
      if (s.patchMode && e.key === 'Escape') { e.preventDefault(); s.togglePatch(); return }
      // Pick-only commands outside the main SOLID direct-edit family still need
      // the same deterministic Escape contract.  Without these branches an
      // Assembly or Surface pick could remain armed and steal the user's next
      // normal viewport click.
      if (s.boundaryPatchPick && e.key === 'Escape') { e.preventDefault(); s.cancelBoundaryPatch(); return }
      if (s.surfBridgePick && e.key === 'Escape') { e.preventDefault(); s.cancelSurfBridge(); return }
      if (s.quiltPickMode && e.key === 'Escape') { e.preventDefault(); useApp.setState({ quiltPickMode: false, status: '已取消加厚整张曲面' }); return }
      if (s.editPolesMode && e.key === 'Escape') { e.preventDefault(); s.toggleEditPoles(); return }
      if (s.faceMateMode && e.key === 'Escape') { e.preventDefault(); s.cancelFaceMate(); return }
      if (s.jointPickMode && e.key === 'Escape') { e.preventDefault(); s.cancelJointPick(); return }
      if (s.jointOriginPickMode && e.key === 'Escape') { e.preventDefault(); s.cancelJointOriginPick(); return }
      if (s.screwFitMode && e.key === 'Escape') { e.preventDefault(); useApp.setState({ screwFitMode: false, status: '已取消按孔配螺絲' }); return }
      if (s.jointHolePick && e.key === 'Escape') { e.preventDefault(); useApp.setState({ jointHolePick: null, status: '已取消拾孔定轴' }); return }
      if (s.compBoolPending && e.key === 'Escape') { e.preventDefault(); s.cancelComponentBoolean(); return }
      // 测试报告观察 A：统一 Esc 关闭其余浮动面板 / 取消拾取模式（之前 FEA / 工程计算 等唔响应 Esc）。
      // 按优先级逐个兜底；无开启嘅面板时跌落去下面 switch 的 escape（清选择 / 退草图）。
      if (e.key === 'Escape') {
        if (s.propsDialog) { e.preventDefault(); s.closePropertiesDialog(); return }                    // UI02：物理属性浮层是独立 Esc 层
        if (s.bomDialog) { e.preventDefault(); s.closeBomDialog(); return }
        if (s.skTextDlg) { e.preventDefault(); s.cancelSkTextDlg(); return }                             // GM-FP4 #52：草图文字对话框
        if (s.vpDlg) { e.preventDefault(); s.setVpDlg(null); return }                                   // 工程计算 / 爆炸视图
        if (s.feaMode > 0 || s.feaBusy || s.feaResult) { e.preventDefault(); s.clearFea(); return }      // FEA 受力云图面板
        if (s.moldMode > 0 || s.moldResult) { e.preventDefault(); s.clearMold(); return }                // 模流分析面板
        if (s.delFaceMode) { e.preventDefault(); s.toggleDelFace(); return }                             // 删面（T795）
        if (s.splitPlanePick) { e.preventDefault(); s.toggleSplitPlanePick(); return }                    // S184 任意平面切拾取
        if (s.thickenMode) { e.preventDefault(); s.toggleThicken(); return }                             // 加厚（T811）
        if (s.offsetSurfMode) { e.preventDefault(); s.toggleOffsetSurf(); return }                       // 偏移曲面（T812）
        if (s.extendSurfMode) { e.preventDefault(); s.toggleExtendSurf(); return }                       // 曲面延伸（S103）
        if (s.splitFaceMode) { e.preventDefault(); s.toggleSplitFace(); return }                          // 分割面（S99）
        if (s.replaceFaceMode) { e.preventDefault(); s.toggleReplaceFace(); return }                      // 替换面（S99）
        if (s.moveFaceMode) { e.preventDefault(); s.toggleMoveFace(); return }                            // 移动面（GM-B2）
        if (s.surfTrimMode) { e.preventDefault(); void s.toggleSurfSurfTrim(); return }                    // 曲面裁剪（S156）
        if (s.patchMode) { e.preventDefault(); s.togglePatch(); return }                                 // 曲面 Patch（T805）
        if (s.pushPullMode) { e.preventDefault(); s.togglePushPull(); return }                           // 按拉
        if (s.faceSketchPick) { e.preventDefault(); s.toggleFaceSketchPick(); return }                   // 选面建草图
        if (s.embossPick) { e.preventDefault(); s.toggleEmboss(); return }                                // S162 Emboss 拾面
        if (s.datumCmd) { e.preventDefault(); s.closeDatumCmd(); return }   // GM-3DV2 R1：ESC 退出统一构造几何命令（连带清其 arm 嘅拾取）
        if (s.datumPick) { e.preventDefault(); useApp.setState({ datumPick: null, status: '已取消基准面拾取' }); return }   // S158：ESC 取消相切面/两面中面/偏移面 拾取（旧 datum pick 无 ESC 退出路径）
        if (s.decalPick) { e.preventDefault(); s.cancelDecalPick(); return }                             // P2 Render review：ESC 取消贴花放置（同其他 pick 模式一致）
        if (s.edgePtPick) { e.preventDefault(); useApp.setState({ edgePtPick: null, status: s.edgePtPick.mode === 'pathplane' ? '已取消路径平面拾取' : s.edgePtPick.mode === 'angleplane' ? '已取消角度平面拾取' : s.edgePtPick.mode === 'edgeaxis' ? '已取消沿边轴拾取' : '已取消边上构造点拾取' }); return }   // S164/S166/S169/S178：ESC 取消边上构造点/路径平面/角度平面/沿边轴拾取
        if (s.measureMode || s.measureEdgeMode || s.measureFaceMode || s.measureAngleMode || s.measureUniMode) {             // 测量（含统一测量）
          e.preventDefault(); useApp.setState({ measureMode: false, measureEdgeMode: false, measureFaceMode: false, measureAngleMode: false, measureUniMode: false, status: '已退出測量' }); return
        }
      }
      // Arrow-key nudge of the selected component (ground plane: ←→ = X, ↑↓ = Z; Shift = ×10 step).
      if (s.selectedComponent && s.mode === 'model' && !s.csketchOpen && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const c = s.components.find((x) => x.id === s.selectedComponent)
        if (c) {
          e.preventDefault()
          const step = e.shiftKey ? 10 : 1
          const p: [number, number, number] = [c.pos[0], c.pos[1], c.pos[2]]
          if (e.key === 'ArrowLeft') p[0] -= step
          else if (e.key === 'ArrowRight') p[0] += step
          else if (e.key === 'ArrowUp') p[2] -= step
          else if (e.key === 'ArrowDown') p[2] += step
          s.setComponentPos(s.selectedComponent, p)
          return
        }
      }
      switch (e.key.toLowerCase()) {
        // Fusion: S = shortcuts/command search box; Shift+S = 创建草图 (sketch keeps its ribbon button too).
        case 's': if (e.shiftKey) s.startSketch(); else s.setCmdPalette(true); e.preventDefault(); break
        case 'e': s.runCommand('extrude', '拉伸'); break
        case 'f': s.runCommand('fillet', '圓角'); break
        case 'c': if (s.mode === 'sketch') s.setSketchTool('circle'); else if (s.mode === 'model') s.runCommand('chamfer', '倒角'); break // Fusion: C=Circle(草图)/Chamfer(实体)
        case 'm': if (s.mode === 'sketch') s.runCommand('sk_move', '移動/複製'); else if (s.mode === 'model') s.runCommand('move', '移動'); break // GM-FP4 #51：M=Move（草图=移动gizmo / 模型=移动）
        case 'o': if (s.mode === 'sketch') s.runCommand('sk_offset', '偏移'); break // GM-FP4 #51：O=Offset（草图）
        case 'v': if (s.mode === 'sketch') s.toggleSkSeeThru(); else if (s.mode === 'model' && s.selectedComponent) s.toggleComponentVisible(s.selectedComponent); break // GM-FP4 #51：V=Show/Hide（草图=透视模型 / 模型=隐藏选中组件）
        case 'h': if (s.mode === 'model') s.runCommand('hole', '孔'); break
        case 'i': if (s.mode === 'model') s.toggleInspect(); break  // S103[4]：选择属性检查器开关
        case 'd': if (s.mode === 'sketch') s.setSketchTool('dimension'); else if (s.mode === 'model') void s.generateDrawing(); break // Fusion: D = sketch dimension（草图）/ 工程图（模型）
        case 'p': if (s.mode === 'sketch') s.runCommand('sk_project', '投影几何'); else s.toggleParamsPanel(); break // GM-FP4 #51：P=Project（草图）/ 参数面板（模型）
        case 'l': if (s.mode === 'sketch') s.setSketchTool('polyline'); break  // Fusion: L=Line
        case 'r': if (s.mode === 'sketch') s.setSketchTool('rectangle'); break // Fusion: R=Rectangle
        case 'a': if (s.mode === 'sketch') { if (s.sketchTool === 'polyline' && s.polyPts.length >= 2) s.togglePolyArc(); else s.setSketchTool('arc') } break  // Fusion: A=Arc；折线中=相切弧 submode（T777）
        case 'x': if (s.mode === 'sketch') s.toggleConstruction(); break       // Fusion: X=Construction（构造几何切换）
        case 't': if (s.mode === 'sketch') s.runCommand('sk_trim', '修剪'); break   // Fusion: T=Trim（T760）
        case 'n': if (s.mode === 'sketch') { s.skLookAt(); e.preventDefault() } break   // GM-FP1 #9：N = 正对草图平面（Look At，键盘路径）
        case 'home': s.requestFit(s.selectedComponent || null); e.preventDefault(); break  // S112：适应窗口 / 框到选中组件（Fusion Home）
        case 'enter': if (s.formBoxDraft?.stage === 'ready') { e.preventDefault(); void s.commitFormBoxDraft() } break
        case 'escape': if (s.formMode) { e.preventDefault(); if (s.formEditStart) s.cancelFormEdit(); else if (s.formCreateKind) s.cancelFormCreate(); else { s.selFormVert(null); s.selFormFace(null) } } else if (s.formBoxDraft) { e.preventDefault(); s.cancelFormCreate() } else if (s.mode === 'sketch' && (s.dimBuf[0] || s.dimBuf[1])) s.sketchTypeKey('Escape'); else if (s.mode === 'sketch') { if (!s.escSketch()) useApp.setState({ status: '已取消选择 — 草图保留，完成请按「完成草图」' }) } else if (s.mode === 'pickplane') s.exitSketchMode(); else { s.selectFeature(null); s.selectComponent(null); s.clearInspect(); useApp.setState({ hoverFace: null, status: '已取消选择 — 模型及视角保留' }) } break  // T792：ESC 退草图前 confirm/save（防意外丢失）；escSketch 先消化子动作（取消绘制/拾取/退返选择工具）
        case 'delete':
          // GM-FP3 #35：选中约束（点徽章）→ Delete 移除该约束；否则删几何。T796b：调尺寸中 Delete 唔删几何。
          if (s.mode === 'sketch') { if (s.skSelCon) { s.removeSkCon(s.skSelCon); s.selectSkCon(null) } else if (!s.sizing) s.skDeleteSel() }
          else if (s.selectedFeature) { s.removeFeature(s.selectedFeature); s.selectFeature(null) }
          else if (s.selectedComponent) { s.deleteComponent(s.selectedComponent) }
          break
      }
    }
    window.addEventListener('keydown', protectEscape, true)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', protectEscape, true); window.removeEventListener('keydown', onKey) }
  }, [startupReady])

  return (
    <div
      ref={appDropRef}
      className="app"
      data-ui-test={isUiTestIsolation() ? 'true' : 'false'}
      data-mesh-drop="app"
      data-mesh-drop-capture="1"
      data-mesh-drop-doc="1"
    >
      {!startupReady && <div className="startup-restore-gate" role="status" aria-live="polite">正在安全回復上次設計…</div>}
      <ErrorBoundary name="工具栏 Ribbon" compact><Ribbon /></ErrorBoundary>
      <div className="main" style={browserCollapsed ? { gridTemplateColumns: '26px 1fr' } : undefined}>
        <ErrorBoundary name="浏览树" compact><BrowserTree /></ErrorBoundary>
        <ErrorBoundary name="3D 视口 Viewport"><Viewport /></ErrorBoundary>
      </div>
      <ErrorBoundary name="时间轴" compact><Timeline /></ErrorBoundary>
      <ErrorBoundary name="裝配關節" compact><JointsPanel /></ErrorBoundary>
      <ErrorBoundary name="關節原點" compact><JointOriginPalette /></ErrorBoundary>
      <ErrorBoundary name="参数面板" compact><ParamsPanel /></ErrorBoundary>
      {drawingOpen && <ErrorBoundary name="工程图" compact><Suspense fallback={null}><DrawingPanel /></Suspense></ErrorBoundary>}
      {physicsLabOpen && <ErrorBoundary name="环境模拟实验室" compact><Suspense fallback={null}><PhysicsLab /></Suspense></ErrorBoundary>}
      {sliceOpen && sliceMesh && <ErrorBoundary name="切層預覽" compact><Suspense fallback={null}><SlicePanel mesh={sliceMesh} onClose={() => useApp.getState().setSliceOpen(false)} /></Suspense></ErrorBoundary>}
      {historyOpen && <Suspense fallback={null}><HistoryPanel onClose={() => useApp.getState().setHistoryOpen(false)} onSaveNamed={(label) => useApp.getState().saveVersion(label)} onRestore={(data) => void useApp.getState().applySnapshot(data)} /></Suspense>}
      {helpOpen && <Suspense fallback={null}><HelpPanelLazy /></Suspense>}
      <ErrorBoundary name="属性检查器" compact><InspectorPanel /></ErrorBoundary>
      <IntroCard />
      {cmdPaletteOpen && <Suspense fallback={null}><CommandPaletteLazy /></Suspense>}
      {csketchOpen && <ErrorBoundary name="約束草圖" compact><Suspense fallback={null}><CSketch /></Suspense></ErrorBoundary>}
      <PromptDialog />
      <InsertDialog />
      {aiOpen && <Suspense fallback={null}><AiCopilotLazy /></Suspense>}
      <TeachPointer />
      <Tour />
      <DebugHud />
      <LoadingBar />
      <ScrubNumberDrag />
    </div>
  )
}
