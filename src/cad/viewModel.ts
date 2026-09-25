// GM-X2：视图显示设定（VIEW）纯逻辑内核 —— 零依赖纯函数，Node 可测。
// 对标 Fusion Display Settings：6 视觉样式枚举 / 图形预设批设 / 网格自适应 / 应用偏好持久化 shape。
// 所有渲染 side-effect 留喺 Viewport/store；呢度只管【状态映射】，方便 headless 单元测。

// ── #1 6 视觉样式枚举（对标 Fusion Ctrl+4..9）───────────────────────────
// 着色 / 着色+隐藏边 / 着色+仅可见边 / 线框 / 线框+隐藏边 / 线框+仅可见边。
// 映射到现有渲染驱动：wireframe（bool）+ EdgeMode（<Edges> 显示 + 隐藏边暗显）。
export type VisualStyle =
  | 'shaded'          // 着色（无边）
  | 'shadedHidden'    // 着色 + 隐藏边（背面边暗显）
  | 'shadedVisible'   // 着色 + 仅可见边
  | 'wire'            // 线框
  | 'wireHidden'      // 线框 + 隐藏边
  | 'wireVisible'     // 线框 + 仅可见边

export type EdgeMode = 'off' | 'visible' | 'hidden'

export const VISUAL_STYLES: VisualStyle[] = ['shaded', 'shadedHidden', 'shadedVisible', 'wire', 'wireHidden', 'wireVisible']

export const VISUAL_STYLE_LABELS: Record<VisualStyle, string> = {
  shaded: '著色', shadedHidden: '著色 + 隱藏邊', shadedVisible: '著色 + 可見邊',
  wire: '線框', wireHidden: '線框 + 隱藏邊', wireVisible: '線框 + 可見邊',
}

// 键盘 Ctrl+4..9 → 样式（对标 Fusion 肌肉记忆）。key = 事件 e.key（'4'..'9'）。
export const VISUAL_STYLE_KEYMAP: Record<string, VisualStyle> = {
  '4': 'shaded', '5': 'shadedHidden', '6': 'shadedVisible',
  '7': 'wire', '8': 'wireHidden', '9': 'wireVisible',
}

export interface VisualRender { wireframe: boolean; edges: EdgeMode }

export function visualStyleToRender(vs: VisualStyle): VisualRender {
  switch (vs) {
    case 'shaded': return { wireframe: false, edges: 'off' }
    case 'shadedHidden': return { wireframe: false, edges: 'hidden' }
    case 'shadedVisible': return { wireframe: false, edges: 'visible' }
    case 'wire': return { wireframe: true, edges: 'off' }
    case 'wireHidden': return { wireframe: true, edges: 'hidden' }
    case 'wireVisible': return { wireframe: true, edges: 'visible' }
  }
}

export function renderToVisualStyle(wireframe: boolean, edges: EdgeMode): VisualStyle {
  if (wireframe) return edges === 'off' ? 'wire' : edges === 'hidden' ? 'wireHidden' : 'wireVisible'
  return edges === 'off' ? 'shaded' : edges === 'hidden' ? 'shadedHidden' : 'shadedVisible'
}

// 旧渲染态（edgeDisplay 'on'|'off' + hiddenEdges bool）↔ EdgeMode —— 保旧掣一致。
export function edgeStateToMode(edgeDisplay: 'on' | 'off', hiddenEdges: boolean): EdgeMode {
  if (edgeDisplay === 'off') return 'off'
  return hiddenEdges ? 'hidden' : 'visible'
}
export function edgeModeToState(m: EdgeMode): { edgeDisplay: 'on' | 'off'; hiddenEdges: boolean } {
  if (m === 'off') return { edgeDisplay: 'off', hiddenEdges: false }
  if (m === 'hidden') return { edgeDisplay: 'on', hiddenEdges: true }
  return { edgeDisplay: 'on', hiddenEdges: false }
}

// ── #6 图形预设 + Effects 表（对标 Fusion Performance/Quality/Custom）──────
export type GraphicsPreset = 'performance' | 'quality' | 'custom'
export interface GraphicsEffects { ssao: boolean; groundShadow: boolean; groundReflection: boolean; renderMode: boolean }

// 一键批设：Performance = 全关（建模最快）；Quality = AO+接地阴影+渲染模式（发布质感）。
// Custom → 保留传入现状（cur）。
export function graphicsPresetEffects(p: GraphicsPreset, cur?: GraphicsEffects): GraphicsEffects {
  if (p === 'performance') return { ssao: false, groundShadow: false, groundReflection: false, renderMode: false }
  if (p === 'quality') return { ssao: true, groundShadow: true, groundReflection: false, renderMode: true }
  return cur ?? { ssao: false, groundShadow: false, groundReflection: false, renderMode: false }
}

// 现开关组合 → 命中预设 or custom（对齐 Fusion：手动改任一效果即落 Custom）。
export function effectsToPreset(e: GraphicsEffects): GraphicsPreset {
  const eq = (a: GraphicsEffects, b: GraphicsEffects) =>
    a.ssao === b.ssao && a.groundShadow === b.groundShadow && a.groundReflection === b.groundReflection && a.renderMode === b.renderMode
  if (eq(e, graphicsPresetEffects('performance'))) return 'performance'
  if (eq(e, graphicsPresetEffects('quality'))) return 'quality'
  return 'custom'
}

// ── #4 可配置网格（Adaptive / Fixed + 主间距 + 次分格）─────────────────
export interface GridConfig { cellSize: number; sectionSize: number }

// 自适应：随相机距离取「靓」cell（10 的幂级），令屏上格子密度稳定 —— 唔太密唔太疏。
export function gridAdaptiveCellSize(camDist: number): number {
  const d = Math.max(1, Math.abs(camDist))
  // cell ≈ 10^round(log10(d/50))，钳 [0.1, 100000]（1cm..100m 级）。
  const raw = Math.pow(10, Math.round(Math.log10(d / 50)))
  return Math.min(100000, Math.max(0.1, raw))
}

// Fixed：sectionSize = 主间距（Major），cellSize = 主间距 / 次分格（Minor）—— 对标 Fusion。
// 默认 spacing=100 subdiv=10 → cell 10 / section 100（同旧硬编码字节一致，零回归）。
export function computeGridConfig(opts: { adaptive: boolean; spacing: number; subdiv: number; camDist: number }): GridConfig {
  const subdiv = Math.max(1, Math.round(opts.subdiv || 1))
  if (opts.adaptive) {
    const cell = gridAdaptiveCellSize(opts.camDist)
    return { cellSize: cell, sectionSize: cell * subdiv }
  }
  const spacing = Math.max(0.01, opts.spacing || 100)
  return { cellSize: spacing / subdiv, sectionSize: spacing }
}

// ── #12 应用偏好（Preferences）持久化 shape ─────────────────────────────
export type ThemePref = 'auto' | 'light' | 'dark'
export interface Prefs {
  theme: ThemePref
  defaultUnit: 'mm' | 'cm' | 'inch'   // 新文档默认长度单位（app-wide；对标 Fusion Default Units）
  zUp: boolean                        // 默认建模朝向 Z-up（webcad 恒 Z-up；此偏好为一致性/信息性）
  autoOrthoSketch: boolean            // 入草图自动正投影（现有订阅）
  animateTransitions: boolean         // 视图过渡动画（现有 340ms 缓动）
  zoomDir: 1 | -1                     // 滚轮缩放方向（1=默认 deltaY>0 拉远；-1=反转）
}
export const DEFAULT_PREFS: Prefs = {
  theme: 'auto', defaultUnit: 'mm', zUp: true, autoOrthoSketch: true, animateTransitions: true, zoomDir: 1,
}
export const PREFS_KEY = 'webcad-prefs'

// 从 localStorage 原始值合并出合法 Prefs（缺字段回落默认 → 旧用户无 prefs 时零影响）。
export function mergePrefs(raw: unknown): Prefs {
  const p = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const oneOf = <T>(v: unknown, allowed: T[], d: T): T => (allowed as unknown[]).includes(v) ? v as T : d
  const b = (v: unknown, d: boolean): boolean => typeof v === 'boolean' ? v : d
  return {
    theme: oneOf(p.theme, ['auto', 'light', 'dark'] as ThemePref[], 'auto'),
    defaultUnit: oneOf(p.defaultUnit, ['mm', 'cm', 'inch'] as ('mm' | 'cm' | 'inch')[], 'mm'),
    zUp: b(p.zUp, true),
    autoOrthoSketch: b(p.autoOrthoSketch, true),
    animateTransitions: b(p.animateTransitions, true),
    zoomDir: p.zoomDir === -1 ? -1 : 1,
  }
}

// ── #2 相机三态（对标 Fusion Ortho / Persp / Persp-with-Ortho-Faces）────
export type CameraProj = 'ortho' | 'persp' | 'perspOrtho'

// 三态 → 有效正交布尔（渲染管线只识 cameraOrtho）。
//   ortho      → 恒正交
//   persp      → 恒透视
//   perspOrtho → 平时透视；standardView=true（撳标准视图）时临时正交（吸正交面）。
export function cameraProjToOrtho(proj: CameraProj, standardView: boolean): boolean {
  if (proj === 'ortho') return true
  if (proj === 'persp') return false
  return standardView   // perspOrtho：标准视图吸正交，其余透视
}
