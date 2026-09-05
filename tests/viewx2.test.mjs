// Wave X2（视图显示设定/VIEW）纯逻辑测试：6 视觉样式枚举映射 / 图形预设批设 / 网格自适应+配置 /
// 相机三态 / 应用偏好持久化 shape / 单位配对预设转换。跑法：npx -y tsx tests/viewx2.test.mjs
import {
  VISUAL_STYLES, VISUAL_STYLE_KEYMAP, visualStyleToRender, renderToVisualStyle,
  edgeStateToMode, edgeModeToState,
  graphicsPresetEffects, effectsToPreset,
  gridAdaptiveCellSize, computeGridConfig,
  DEFAULT_PREFS, mergePrefs,
  cameraProjToOrtho,
} from '../src/cad/viewModel.ts'
import {
  UNIT_PRESETS, presetById, detectPreset, convLenFromMm, convMassFromG,
  fmtLenU, fmtMassU, areaVolBaseUnit,
} from '../src/cad/unitPresets.ts'

let pass = 0, fail = 0
const rows = []
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t
const ck = (name, cond, detail) => { rows.push([cond ? 'PASS' : 'FAIL', name, detail || '']); cond ? pass++ : fail++ }

// ── 1. 6 视觉样式枚举 ─────────────────────────────────────────────────
ck('6 个视觉样式', VISUAL_STYLES.length === 6)
ck('shaded → 着色无边', (() => { const r = visualStyleToRender('shaded'); return r.wireframe === false && r.edges === 'off' })())
ck('shadedHidden → 着色隐藏边', (() => { const r = visualStyleToRender('shadedHidden'); return !r.wireframe && r.edges === 'hidden' })())
ck('shadedVisible → 着色可见边', (() => { const r = visualStyleToRender('shadedVisible'); return !r.wireframe && r.edges === 'visible' })())
ck('wire → 线框无边', (() => { const r = visualStyleToRender('wire'); return r.wireframe && r.edges === 'off' })())
ck('wireHidden → 线框隐藏边', (() => { const r = visualStyleToRender('wireHidden'); return r.wireframe && r.edges === 'hidden' })())
ck('wireVisible → 线框可见边', (() => { const r = visualStyleToRender('wireVisible'); return r.wireframe && r.edges === 'visible' })())
// 往返稳定：每个 style → render → style 一致
ck('render↔style 往返一致', VISUAL_STYLES.every((s) => { const r = visualStyleToRender(s); return renderToVisualStyle(r.wireframe, r.edges) === s }))
// Ctrl+4..9 键映射
ck('Ctrl+4 = shaded', VISUAL_STYLE_KEYMAP['4'] === 'shaded')
ck('Ctrl+9 = wireVisible', VISUAL_STYLE_KEYMAP['9'] === 'wireVisible')
ck('键映射覆盖 4..9 共 6 个', ['4', '5', '6', '7', '8', '9'].every((k) => VISUAL_STYLES.includes(VISUAL_STYLE_KEYMAP[k])))
// 旧渲染态（edgeDisplay + hiddenEdges）↔ EdgeMode（保旧掣一致）
ck('edgeState off', edgeStateToMode('off', false) === 'off')
ck('edgeState on+visible', edgeStateToMode('on', false) === 'visible')
ck('edgeState on+hidden', edgeStateToMode('on', true) === 'hidden')
ck('edgeMode→state visible', (() => { const s = edgeModeToState('visible'); return s.edgeDisplay === 'on' && s.hiddenEdges === false })())
ck('edgeMode→state hidden', (() => { const s = edgeModeToState('hidden'); return s.edgeDisplay === 'on' && s.hiddenEdges === true })())
ck('edgeMode→state off', (() => { const s = edgeModeToState('off'); return s.edgeDisplay === 'off' && s.hiddenEdges === false })())
// 旧默认（wireframe=false, edgeDisplay=on）→ shadedVisible（零回归对齐现况）
ck('旧默认态 → 着色可见边', renderToVisualStyle(false, edgeStateToMode('on', false)) === 'shadedVisible')

// ── 2. 图形预设批设 ───────────────────────────────────────────────────
ck('performance = 全关', (() => { const e = graphicsPresetEffects('performance'); return !e.ssao && !e.groundShadow && !e.groundReflection && !e.renderMode })())
ck('quality = AO+阴影+渲染', (() => { const e = graphicsPresetEffects('quality'); return e.ssao && e.groundShadow && e.renderMode })())
ck('custom 保留现状', (() => { const cur = { ssao: true, groundShadow: false, groundReflection: true, renderMode: false }; return JSON.stringify(graphicsPresetEffects('custom', cur)) === JSON.stringify(cur) })())
ck('effectsToPreset 命中 performance', effectsToPreset(graphicsPresetEffects('performance')) === 'performance')
ck('effectsToPreset 命中 quality', effectsToPreset(graphicsPresetEffects('quality')) === 'quality')
ck('effectsToPreset 手改任一 → custom', effectsToPreset({ ssao: true, groundShadow: false, groundReflection: false, renderMode: false }) === 'custom')

// ── 3. 网格自适应 + 配置 ───────────────────────────────────────────────
// Fixed 默认 spacing=100 subdiv=10 → cell 10 / section 100（同旧硬编码字节一致）
ck('Fixed 默认 = 旧硬编码 10/100', (() => { const g = computeGridConfig({ adaptive: false, spacing: 100, subdiv: 10, camDist: 500 }); return near(g.cellSize, 10) && near(g.sectionSize, 100) })(), '')
ck('Fixed spacing=250 subdiv=5 → cell 50', (() => { const g = computeGridConfig({ adaptive: false, spacing: 250, subdiv: 5, camDist: 1 }); return near(g.cellSize, 50) && near(g.sectionSize, 250) })())
ck('Adaptive 近距离 cell 细', gridAdaptiveCellSize(50) <= gridAdaptiveCellSize(5000))
ck('Adaptive 单调不减（距离越大 cell 越大或等）', (() => { let ok = true; let prev = 0; for (const d of [10, 100, 1000, 10000, 100000]) { const c = gridAdaptiveCellSize(d); if (c < prev) ok = false; prev = c } return ok })())
ck('Adaptive 有下限 0.1', gridAdaptiveCellSize(0.001) >= 0.1)
ck('Adaptive section = cell×subdiv', (() => { const g = computeGridConfig({ adaptive: true, spacing: 100, subdiv: 10, camDist: 5000 }); return near(g.sectionSize, g.cellSize * 10) })())
ck('subdiv 钳到 ≥1', (() => { const g = computeGridConfig({ adaptive: false, spacing: 100, subdiv: 0, camDist: 1 }); return g.cellSize === 100 && g.sectionSize === 100 })())

// ── 4. 相机三态 ───────────────────────────────────────────────────────
ck('ortho 恒正交', cameraProjToOrtho('ortho', false) === true && cameraProjToOrtho('ortho', true) === true)
ck('persp 恒透视', cameraProjToOrtho('persp', false) === false && cameraProjToOrtho('persp', true) === false)
ck('perspOrtho 平时透视', cameraProjToOrtho('perspOrtho', false) === false)
ck('perspOrtho 标准视图吸正交', cameraProjToOrtho('perspOrtho', true) === true)

// ── 5. 应用偏好持久化 shape ─────────────────────────────────────────────
ck('默认 prefs 完整', (() => { const p = DEFAULT_PREFS; return p.theme === 'auto' && p.defaultUnit === 'mm' && p.zUp === true && p.autoOrthoSketch === true && p.animateTransitions === true && p.zoomDir === 1 })())
ck('mergePrefs 空 → 默认', JSON.stringify(mergePrefs(null)) === JSON.stringify(DEFAULT_PREFS))
ck('mergePrefs 部分覆盖', (() => { const p = mergePrefs({ theme: 'dark', zoomDir: -1 }); return p.theme === 'dark' && p.zoomDir === -1 && p.defaultUnit === 'mm' && p.autoOrthoSketch === true })())
ck('mergePrefs 拒非法值', (() => { const p = mergePrefs({ theme: 'neon', defaultUnit: 'furlong', zoomDir: 5 }); return p.theme === 'auto' && p.defaultUnit === 'mm' && p.zoomDir === 1 })())
ck('mergePrefs 布尔守卫', (() => { const p = mergePrefs({ autoOrthoSketch: false, animateTransitions: false }); return p.autoOrthoSketch === false && p.animateTransitions === false })())

// ── 6. 单位配对预设转换 ─────────────────────────────────────────────────
ck('5 个预设', UNIT_PRESETS.length === 5)
ck('presetById mm_g', (() => { const d = presetById('mm_g'); return d.len === 'mm' && d.mass === 'g' })())
ck('detectPreset 配对命中', detectPreset('m', 'kg') === 'm_kg' && detectPreset('inch', 'oz') === 'in_oz')
ck('detectPreset 非配对 → custom', detectPreset('mm', 'lb') === 'custom')
ck('convLen mm→cm', near(convLenFromMm(100, 'cm'), 10))
ck('convLen mm→m', near(convLenFromMm(1000, 'm'), 1))
ck('convLen mm→inch', near(convLenFromMm(25.4, 'inch'), 1))
ck('convLen mm→ft', near(convLenFromMm(304.8, 'ft'), 1))
ck('convMass g→kg', near(convMassFromG(1000, 'kg'), 1))
ck('convMass g→oz', near(convMassFromG(28.349523125, 'oz'), 1))
ck('convMass g→lb', near(convMassFromG(453.59237, 'lb'), 1))
ck('fmtLenU mm 默认 1 位', fmtLenU(12.34, 'mm') === '12.3 mm')
ck('fmtLenU m 默认 4 位', fmtLenU(1000, 'm') === '1.0000 m')
ck('fmtLenU ft', fmtLenU(304.8, 'ft') === '1.0000 ft')
ck('fmtMassU g 默认 2 位', fmtMassU(565.2, 'g') === '565.20 g')
ck('fmtMassU kg', fmtMassU(1500, 'kg') === '1.500 kg')
ck('fmtMassU lb', fmtMassU(453.59237, 'lb') === '1.000 lb')
ck('areaVolBaseUnit 公制→cm', areaVolBaseUnit('mm') === 'cm' && areaVolBaseUnit('m') === 'cm')
ck('areaVolBaseUnit 英制→inch', areaVolBaseUnit('inch') === 'inch' && areaVolBaseUnit('ft') === 'inch')

console.log('\n========== PASS/FAIL 总表 ==========')
for (const [st, n, d] of rows) console.log(`  ${st}  ${n}${d !== '' && d != null ? '  (' + d + ')' : ''}`)
console.log('====================================')
console.log(fail === 0 ? `全部 ${pass} 项通过` : `${fail} 项失败 / 共 ${pass + fail}`)
process.exit(fail === 0 ? 0 : 1)
