# e2e 回归烟测（T741）— preview_eval 全链路脚本

> 喺 dev server (localhost:5173) 嘅 console / preview_eval 逐段跑。每段返回 ✓/✗ 列表。
> 覆盖 T713→T740 嘅集成链：草图(真弧/约束/尺寸) → 实体(切线链/多实体/布尔/缓存) → 装配(固化src/拾孔/link) → 出图/导出(装配图/STEP往返/激光真弧)。
> 实测基线 2026-06-11：14/14 ✓（B3/D4 初版断言系测试构造错误，已修正于下）。
> 复测 2026-06-11（T752，T746-751 大改后）：15/15 ✓ 零回归（A5+B4+C4+D2；D2/D3 STEP 跳过 — worker 句柄 DEV 未暴露，且该路径本周零改动，T741 基线 3125 精确仍有效）。
> C3 流程更正：拾孔定轴系畀【已有关节】定锚 — 先 addJoint(revolute) → startJointHolePick(关节id) → applyJointHolePick(compId, {kind:'cyl', p:[孔心], axis, r})（face 字段系 p 唔系 c）。

## A 草图链
```js
(async () => {
  const app = window.useApp
  const { meshVolume } = await import('/src/io/meshBool.ts')
  const T = [], ok = (n, c, i) => T.push((c ? '✓ ' : '✗ ') + n + (i ? ` (${i})` : ''))
  const wait = (ms) => new Promise(r => setTimeout(r, ms))
  app.setState({ mode: 'sketch', sketchTool: 'slot', sketchPlane: 'XY', sketchArb: null, sketchSlotW: 20, features: [], bodyMesh: null, components: [], joints: [], skCons: [], skSel: [], sketchProfiles: [], sketchShape: null, sketchStart: null, polyPts: [], sketchSources: {}, configs: [], params: [] })
  app.getState().onSketchClick([0, 0]); app.getState().onSketchClick([40, 0])
  const slot = app.getState().sketchShape
  ok('A1 slot 真弧', !!slot?.verts && slot.bulges.filter(b => Math.abs(b) > 0).length === 2)
  app.setState({ sketchProfiles: [slot], sketchShape: null, sketchTool: 'dimension' })
  app.getState().skClickAt([50, 0]); await wait(400)
  const rd = app.getState().skCons[0]
  app.getState().editSkDim(rd.id, 12); await wait(500)
  const { bulgeRadius } = await import('/src/sketch/sketchOps.ts')
  const o1 = app.getState().sketchProfiles[0]
  ok('A2 弧段 R 尺寸驱动 10→12', Math.abs(bulgeRadius(o1.verts[0], o1.verts[1], o1.bulges[0]) - 12) < 1e-3)
  app.setState({ extrudeHeight: 10, sketchOp: 'new', extrudeExtent: 'blind', extrudeFlip: false, sketchTwist: 0, extrudeDraft: 0, skCons: [] })
  await app.getState().extrudeSketch(); await wait(1200)
  ok('A3 slot 拉伸', !!app.getState().bodyMesh, meshVolume(app.getState().bodyMesh).toFixed(0))
  ok('A4 sketchSources', Object.keys(app.getState().sketchSources).length === 1)
  return T.join('\n')
})()
```

## B 实体链（接 A 状态）
```js
// B1 切线链圆角: applyFeatures fillet {radius:2, nears:[[32,0,10]], chain:true} → 体积减
// B2 多实体: newbody + prim box 30×30×6 → bodyMesh.parked.length===1, 活动=5400
// B3 实体布尔 fuse: 结果 = vF + 5400 − 重叠（盒同 slot 有重叠 — 断言要 vU < vF+5400 且 > max 两者）
// B4 重建缓存: 改尾特征 vs 改头特征(强制全量) 体积一致
```

## C 装配链（接 B）
```js
// C1 newComponent → comp.src.features.length > 0（edit-in-place 基建）
// C2 第二实体 + 固化 → 2 组件
// C3 startJointHolePick + applyJointHolePick({kind:'cyl',...}) → joint.anchor = 孔心
// C4 addMotionLink(jb→ja, 2) + setJointValue 30 → ja.angle === 60
```

## D 出图/导出链
```js
// D1 generateAsmDrawing → drawingKind='assembly', 3 视图, BOM ≥1 行
// D2 cad.exportSTEP → >1KB
// D3 stepbody 再导入 prim 25×25×5 → 体积 3125
// D4 激光真弧（pts 必须传 — valid 闸用密铺 pts!）:
//    profilesToGcode([{ pts: pathPts(verts,bulges), verts:[[85,0],[115,0]], bulges:[-1,-1] }], {kerf:0.1})
//    → gcodeStats: arcs=2, cutLen=2π×15.1=94.88
```

## 已知断言陷阱
- eval 字符串内 `\r\n` 双重转义 → 用 `String.fromCharCode(13,10)` 或数组 join
- B3：fuse 重叠体积要扣 — 唔好假设无重叠
- D4：Profile2D 的 valid 闸用 pts（密铺）判断 — verts 路径都要带 pts
