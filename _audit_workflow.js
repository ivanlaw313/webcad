export const meta = {
  name: 'webcad-full-audit',
  description: '逐子系统代码审计 webcad，揾数值/视觉/交互/逻辑/空壳 bug，再对抗式验证',
  phases: [
    { title: 'Audit', detail: '每个子系统一个 agent 读真代码揾具体 bug' },
    { title: 'Verify', detail: '逐条 finding 对抗式复核（默认怀疑）' },
  ],
}

const REPO = 'C:\\ClaudeCode\\webcad'
const CTX = `你审计紧 webcad —— 一个浏览器 3D CAD（Fusion 360 风格），用 Vite+React+Three/R3F+zustand(store.ts)+replicad/OCCT(worker)+planegcs(约束)。仓库根：${REPO}。
关键文件：src/store.ts（~11000 行单体：特征树/草图状态机/所有 action）、src/worker/cad.worker.ts（OCCT 几何内核 rebuild）、src/sketch/freesolve.ts（自由草图 hitTest/约束求解接口）、src/sketch/csketch.ts、src/components/{Viewport,SketchLayer,Timeline,Ribbon,BrowserTree}.tsx、src/analysis/*（模流）、src/io/*（导出）、src/cad/*（gears/subdiv 等）。
背景：呢个用户系非程序员、用广东话。最近捉到嘅真 bug 类型可作参考：① 重开草图时 setRefGeo(null) 令实体边/角拣唔到；② 撳偏少少 if(!hit) 清走成个选取令多选第二点几乎做唔到；③ 阵列做出嚟唔系一组节点。即係：交互可达性、选取语义、重开/状态还原、数值公式、退化输入、视觉对位 都係高发区。
你嘅任务：喺你负责嘅子系统，读真代码，揾【具体、代码落地】嘅 bug，唔好凭空估。每条 finding 要有 file:line 证据 + 触发场景 + 根因 + 修复方向。优先：
- 数值错（公式/正负号/单位 mm↔其它/NaN/除零/off-by-one/退化几何无守卫/边界值）
- 视觉错（渲染位置同实际唔对位/缺选中反馈/z-fighting/比例或颜色错/标签锚点错）
- 交互错（撳唔到/撳偏清走/拖拽抢点/工具切换残留状态/选取上限/guard 早退）
- 逻辑错（op=cut 被当加料嗰类/状态机漏 case/还原走样）
- 空壳（按钮/功能假装做到但实际无效或静默吞）
如果某条可以喺无头浏览器用 window.useApp 数据层重现，喺 dataLayerTest 写出可执行 recipe（例如：setState/调 action/读回 state 断言），否则留空字符串。诚实：唔确定就标 confidence:'low'，唔好凑数。`

const FINDINGS = {
  type: 'object', additionalProperties: false,
  properties: { findings: { type: 'array', items: {
    type: 'object', additionalProperties: false,
    properties: {
      title: { type: 'string' },
      kind: { type: 'string', enum: ['numeric', 'visual', 'interaction', 'logic', 'honesty'] },
      severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] },
      evidence: { type: 'string', description: 'file:line 引用 + 关键代码片段' },
      scenario: { type: 'string', description: '触发 bug 嘅具体用户操作/输入' },
      rootCause: { type: 'string' },
      fixSketch: { type: 'string', description: '最小修复方向' },
      dataLayerTest: { type: 'string', description: 'window.useApp 无头重现 recipe，或空字符串' },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    },
    required: ['title', 'kind', 'severity', 'evidence', 'scenario', 'rootCause', 'fixSketch', 'dataLayerTest', 'confidence'],
  } } },
  required: ['findings'],
}

const VERDICT = {
  type: 'object', additionalProperties: false,
  properties: {
    isReal: { type: 'boolean' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    severityAdjusted: { type: 'string', enum: ['blocker', 'high', 'medium', 'low', 'not-a-bug'] },
    alreadyGuarded: { type: 'boolean', description: '系咪已有代码处理咗呢个情况' },
    reasoning: { type: 'string' },
    bestRepro: { type: 'string', description: '最可靠嘅复现步骤（数据层优先）' },
  },
  required: ['isReal', 'confidence', 'severityAdjusted', 'alreadyGuarded', 'reasoning', 'bestRepro'],
}

const SUBSYSTEMS = [
  { key: 'sketch-draw', scope: '自由草图绘制工具：矩形/圆/折线/多边形/槽/圆角矩形/三点圆弧/椭圆/样条/构造线/文字；落点捕捉(网格+几何+屏幕半径)、sizing 打数字定尺寸、第二点吸附塌缩。', hints: 'grep onSketchClick / skDraw / snapInSketch / sizing / drawText / sampleBSpline；睇 Viewport SketchDraw + store 绘制 action。' },
  { key: 'sketch-constraints', scope: 'planegcs 约束：addSkCon(coincident/h/v/parallel/perp/equal/tangent/fix)、conApplicable、尺寸(len/dia/rad/angle/hdist/vdist/dist/arclen)、DOF 计算、resolveSk、拖拽实时求解、冲突检测、参数驱动尺寸。', hints: 'grep addSkCon / conApplicable / SK_CON_REQ / resolveSk / solveFree / skMeasureDim / withParamVals；睇 freesolve.ts + store。' },
  { key: 'sketch-modify', scope: '草图修改：Trim/修剪、Fillet 倒圆角、Offset 偏移、Mirror 镜像、矩形/环形阵列、样条编辑；开放路径/闭合判定、退化守卫。', hints: 'grep sketchTrim / sketchFillet / sketchOffset / mirror / sketchArrayRect / sketchArrayCirc / polyArea2。' },
  { key: 'extrude-revolve', scope: '拉伸/旋转：操作(new/cut/intersect)、范围(distance/symmetric/through/toface)、拔模角、扭转、贯通、多轮廓 even-odd 嵌套、面上草图切割方向、斜面拉伸。', hints: 'grep extrudeSketch / addExtrude / shapeToProfile / depthOf / toface / revolve；睇 store + cad.worker union。' },
  { key: 'loft-sweep-coil', scope: '放样/扫掠/螺旋/管道：多截面、沿路径、helix 圈数/螺距/锥度、截面顺序、路径还原。', hints: 'grep loft / sweep / coil / genericSweep / loftSections / sweepPath。' },
  { key: 'modify-solid', scope: '实体修改：圆角/倒角(选边+半径+失败回退)、抽壳(壁厚)、拔模、缩放、移动/复制、加厚 thicken、加强筋 rib、面推拉 pressPull、替换面/删除面、分割实体。', hints: 'grep fillet / chamfer / shell / draft / scaleBody / transform / thicken / rib / pressPull / replaceFace / deleteFace / splitBody / splitBySketch。' },
  { key: 'primitives', scope: '直接原语：box/sphere/cone(含棱锥 sides)/torus(部分角)/wedge/dome(球冠 cap)/halfcyl/pie(扇形角)；半径↔直径换算、布尔 op。', hints: 'grep "type: \'prim\'" / shape: \'box\' / makePrimitive / create_box；睇 cad.worker prim 构造。' },
  { key: 'patterns-boolean', scope: '阵列(矩形/环形/路径) + featpattern 组节点(cols/rows/dx/dy 可编辑) + 布尔(combine/cut/intersect 多实体互切)。', hints: 'grep featpattern / cpattern / pathpattern / expandFeats / translateProfile / bodyBoolean / splitBody；睇 cad.worker featpattern union。' },
  { key: 'assembly-joints', scope: '装配：组件(新建/复制/删除/隐藏/孤立/配色)、6 类关节(刚性/旋转/滑动/圆柱/球/平面) FK 求解 + 限位 + 驱动 + 运动动画、配合 mates、爆炸、干涉检查、按孔配螺丝。', hints: 'grep joints / kinematics / resolveMates / faceMate / interference / explode / fitScrew；睇 src/assembly/* + store。' },
  { key: 'measure-inspect', scope: '测量/检查：两点距离、量边/孔径、量面(面积+类型)、量角(两面夹角)、质量属性(体积/表面积/质心/密度)、剖视裁剪平面、单位 mm/cm/inch 换算显示。', hints: 'grep measure / massProps / sectionView / unit / mm / volume / centroid / angleBetween。' },
  { key: 'params-expr', scope: '参数化：用户参数表、表达式求值(evalExpr 引用其它参数/链式/一元负号/函数)、参数绑定到尺寸/特征、配置 configs。', hints: 'grep evalExpr / params / paramBindings / withParamVals / applyParamSketches / configs；试边界：负号/除零/循环引用/缺参。' },
  { key: 'io-persist', scope: '持久化与 IO：保存/打开(applyProjectData 还原全状态)、STL/STEP/glTF 导入导出、PNG 截图、localStorage 自动保存/恢复、分享链接。', hints: 'grep applyProjectData / openProject / exportSTL / exportSTEP / exportGLB / importSTL / importSTEP / screenshot / localStorage / normalizeSrcs；睇还原时漏字段/默认值/类型。' },
  { key: 'mold-flow', scope: '模流：求解器(Hele-Shaw FVM)、精细度上限、多浇口(类型/位置/流量/平衡)、浇口ΔP、焊缝、机台吨位 machineTonnage 阶梯、夹紧力、GIF/PDF 导出。', hints: 'grep runMoldFlow / solveMoldFill / clampResolution / GATE_TYPES / machineTonnage / encodeGif / buildImagePdf；睇 src/analysis/* + src/io/moldExport.ts。检查物理公式量纲/正负/阶梯边界。' },
  { key: 'surface-gears', scope: '曲面(NURBS 极点编辑/曲面放样/补面/加厚) + 齿轮机构(渐开线正齿轮/齿条/带轮/蜗杆/锥齿) + 4-bar/曲柄滑块机构求解。', hints: 'grep editPoles / surfLoft / surfPatch / boundaryPatch / gearFeature / involute / rack / pulley / worm / fourBar / sliderCrank；检查渐开线/节圆/压力角数学。' },
  { key: 'view-render-timeline', scope: '视图/渲染/时间轴：标准视图(前/上/右/等轴)、正交/透视、ViewCube、材质预设/玻璃/HDRI、地面阴影、时间轴(回放/回退/重排序/抑制/多参数编辑)、自动取景 FitView。', hints: 'grep FitView / standardView / cameraOrtho / material / hdri / Timeline / reorderFeature / suppress / gotoStep / replay。' },
]

const finderPrompt = (s) => `${CTX}

【你负责嘅子系统：${s.key}】
范围：${s.scope}
查代码提示：${s.hints}

请用 Read/Grep 实际读相关代码，揾 5–12 条具体 bug（宁缺勿滥，要 file:line 落地）。重点揾会令非程序员「以为做到其实做唔到」或者「结果错而无提示」嘅问题。每条填齐 schema；可数据层重现嘅写埋 recipe。`

const verifyPrompt = (f, s) => `${CTX}

有人审计「${s.key}」子系统报咗以下一条 bug，请你做【对抗式复核】：去读返佢引用嘅代码（${f.evidence}），独立判断系咪真 bug，定系已有守卫/误报/重复。默认怀疑，唔确定当 not-a-bug。

标题：${f.title}
类别：${f.kind} · 报称严重度：${f.severity}
触发场景：${f.scenario}
根因(报称)：${f.rootCause}
证据：${f.evidence}
建议数据层重现：${f.dataLayerTest || '（无）'}

判定 isReal、调整后严重度、系咪已被现有代码守卫(alreadyGuarded)，并畀出你认为最可靠嘅复现步骤(bestRepro，数据层优先)。`

phase('Audit')
const results = await pipeline(
  SUBSYSTEMS,
  (s) => agent(finderPrompt(s), { label: `audit:${s.key}`, phase: 'Audit', schema: FINDINGS, effort: 'high' }),
  (rev, s) => (rev && rev.findings && rev.findings.length)
    ? parallel(rev.findings.map((f) => () =>
        agent(verifyPrompt(f, s), { label: `verify:${s.key}`, phase: 'Verify', schema: VERDICT, effort: 'high' })
          .then((v) => ({ ...f, subsystem: s.key, verdict: v }))))
    : [],
)

const all = results.flat().filter(Boolean)
const rank = { blocker: 0, high: 1, medium: 2, low: 3, 'not-a-bug': 9 }
const confirmed = all
  .filter((f) => f.verdict && f.verdict.isReal && f.verdict.severityAdjusted !== 'not-a-bug')
  .sort((a, b) => (rank[a.verdict.severityAdjusted] ?? 5) - (rank[b.verdict.severityAdjusted] ?? 5))
const rejected = all.filter((f) => !f.verdict || !f.verdict.isReal || f.verdict.severityAdjusted === 'not-a-bug')

log(`审计完成：${all.length} 条候选，${confirmed.length} 条确认（${rejected.length} 条剔除/误报）`)
return {
  totalCandidates: all.length,
  confirmedCount: confirmed.length,
  confirmed: confirmed.map((f) => ({ subsystem: f.subsystem, title: f.title, kind: f.kind, severity: f.verdict.severityAdjusted, evidence: f.evidence, scenario: f.scenario, rootCause: f.rootCause, fixSketch: f.fixSketch, dataLayerTest: f.dataLayerTest, alreadyGuarded: f.verdict.alreadyGuarded, bestRepro: f.verdict.bestRepro })),
  rejectedTitles: rejected.map((f) => ({ subsystem: f.subsystem, title: f.title, why: f.verdict ? f.verdict.reasoning : 'no verdict' })),
}
