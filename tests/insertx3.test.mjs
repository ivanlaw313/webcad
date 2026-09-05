// Wave X3（插入/INSERT）纯逻辑测试：多张 Canvas CRUD+字段 / 四角·UV（非等比+旋转+翻转） / Decal 逐项字段 /
// SVG·DXF → 可编辑草图源（sketchId 重开判据） / DXF 逐层 / Mesh 单位换算+flip-up+摆位。
// 跑法：npx -y tsx tests/insertx3.test.mjs
import {
  makeCanvas, patchCanvas, sanitizeCanvases, archivedCanvases, canvasToLegacyImg, nextCanvasId,
  canvasQuad, canvasUV, CANVAS_DEFAULT,
  decalExtras, patchDecalFields, decalBox, flipUVArray, decalLinkAspect,
  impToSketchShape, transformImpProfile, xform2D, buildImportSketchSource, isReopenableSketchFeature, filterByLayers, collectLayers,
  meshUnitScaleMm, flipUpVec, transformMesh, meshBBox, meshPlaceOffset, MESH_UNITS,
} from '../src/cad/insertModel.ts'
import { parseDxfToProfiles, classifyProfiles } from '../src/io/dxfImport.ts'

let pass = 0, fail = 0
const rows = []
const near = (a, b, t = 1e-6) => Math.abs(a - b) < t
const ck = (name, cond, detail) => { rows.push([cond ? 'PASS' : 'FAIL', name, detail || '']); cond ? pass++ : fail++ }

// ── 1. 多张 Canvas CRUD ───────────────────────────────────────────────
{
  const c1 = makeCanvas('cv1', 'data:img1', { plane: 'XY', baseZ: 0 })
  ck('makeCanvas 默认字段', c1.w === CANVAS_DEFAULT.w && c1.cx === 0 && c1.opacity === 0.5 && c1.plane === 'XY')
  // byte-compat：默认态省略 optional 字段
  ck('makeCanvas 默认省略 optional', !('scaleX' in c1) && !('flipH' in c1) && !('displayThrough' in c1) && !('inArchive' in c1))
  const c2 = makeCanvas('cv2', 'data:img2', { plane: 'XZ', baseZ: 5 }, { scaleX: 2, flipH: true, inArchive: true, name: 'logo' })
  ck('makeCanvas overrides 写入', c2.scaleX === 2 && c2.flipH === true && c2.inArchive === true && c2.name === 'logo' && c2.plane === 'XZ' && c2.baseZ === 5)
  let list = [c1, c2]
  // patch：设 scaleX
  list = patchCanvas(list, 'cv1', { scaleX: 1.5 })
  ck('patchCanvas 设字段', list.find((c) => c.id === 'cv1').scaleX === 1.5)
  // patch：清回默认值 → 删键（byte-compat）
  list = patchCanvas(list, 'cv1', { scaleX: 1 })
  ck('patchCanvas 清回默认删键', !('scaleX' in list.find((c) => c.id === 'cv1')))
  // patch：opacity 钳制
  list = patchCanvas(list, 'cv1', { opacity: 5 })
  ck('patchCanvas opacity 钳 ≤1', list.find((c) => c.id === 'cv1').opacity === 1)
  // 活动镜像
  ck('canvasToLegacyImg 活动镜像', (() => { const m = canvasToLegacyImg(list, 'cv2'); return m && m.url === 'data:img2' && m.w === c2.w })())
  ck('canvasToLegacyImg 无活动=null', canvasToLegacyImg(list, null) === null)
  // 入存档过滤
  ck('archivedCanvases 只留 inArchive', (() => { const a = archivedCanvases(list); return a.length === 1 && a[0].id === 'cv2' })())
}

// ── 2. Canvas 四角 / UV（非等比 + 旋转 + 翻转）──────────────────────────
{
  // 等比：aspect=2 → 宽 100 高 50，角序 BL/BR/TR/TL
  const q = canvasQuad({ w: 100, cx: 0, cy: 0 }, 2)
  ck('canvasQuad 宽高（aspect=2）', near(q[1][0] - q[0][0], 100) && near(q[3][1] - q[0][1], 50))
  // 非等比 scaleX=2 → 宽翻倍
  const q2 = canvasQuad({ w: 100, cx: 0, cy: 0, scaleX: 2 }, 1)
  ck('canvasQuad 非等比 scaleX', near(q2[1][0] - q2[0][0], 200) && near(q2[3][1] - q2[0][1], 100))
  // 旋转 90°：BL 角 (-50,-50) → (50,-50)
  const q3 = canvasQuad({ w: 100, cx: 0, cy: 0, zAngle: Math.PI / 2 }, 1)
  ck('canvasQuad 旋转 90°', near(q3[0][0], 50, 1e-4) && near(q3[0][1], -50, 1e-4))
  // 中心偏移
  const q4 = canvasQuad({ w: 100, cx: 30, cy: 20 }, 1)
  ck('canvasQuad 中心偏移', near(q4[2][0], 80) && near(q4[2][1], 70))
  // UV 无翻 / flipH / flipV
  ck('canvasUV 默认', JSON.stringify(canvasUV()) === JSON.stringify([0, 0, 1, 0, 1, 1, 0, 1]))
  ck('canvasUV flipH', JSON.stringify(canvasUV(true, false)) === JSON.stringify([1, 0, 0, 0, 0, 1, 1, 1]))
  ck('canvasUV flipV', JSON.stringify(canvasUV(false, true)) === JSON.stringify([0, 1, 1, 1, 1, 0, 0, 0]))
}

// ── 3. Canvas 载入清洗 + 旧 canvasImg 迁移 ─────────────────────────────
{
  // 数组路径：过滤无 url / 归一字段
  const arr = [{ id: 'cv7', url: 'u', w: 80, cx: 1, cy: 2, opacity: 0.3, plane: 'YZ', baseZ: 4, scaleX: 2, flipV: true, renderable: true, inArchive: true }, { foo: 1 }, { url: '' }]
  const s = sanitizeCanvases(arr)
  ck('sanitizeCanvases 过滤无效', s.length === 1 && s[0].id === 'cv7' && s[0].plane === 'YZ')
  ck('sanitizeCanvases 保留字段', s[0].scaleX === 2 && s[0].flipV === true && s[0].renderable === true && s[0].inArchive === true)
  // 旧单值 canvasImg 迁移入 canvases[0]（byte-compat 迁移路径）
  const mig = sanitizeCanvases(undefined, { url: 'old', w: 120, cx: 0, cy: 0, opacity: 0.5 })
  ck('sanitizeCanvases 迁移旧 canvasImg', mig.length === 1 && mig[0].url === 'old' && mig[0].w === 120 && mig[0].inArchive === true)
  ck('sanitizeCanvases 空 → []', sanitizeCanvases(undefined, null).length === 0 && sanitizeCanvases(null).length === 0)
  // nextCanvasId 单调递增
  const a = nextCanvasId([]), b = nextCanvasId([{ id: a }])
  ck('nextCanvasId 递增', a !== b && a.startsWith('cv') && b.startsWith('cv'))
}

// ── 4. Decal 逐项字段（byte-compat + 投影盒 + UV 翻转）─────────────────
{
  // 默认省略
  ck('decalExtras 默认全省略', Object.keys(decalExtras({ size: 20 })).length === 0)
  const ex = decalExtras({ size: 20, chainFaces: true, opacity: 0.5, keepAspect: false, w: 40, h: 30, u: 5, v: -3, flipH: true })
  ck('decalExtras 非默认写入', ex.chainFaces === true && ex.opacity === 0.5 && ex.keepAspect === false && ex.w === 40 && ex.h === 30 && ex.u === 5 && ex.v === -3 && ex.flipH === true)
  ck('decalExtras opacity=1 省略', !('opacity' in decalExtras({ size: 20, opacity: 1 })))
  ck('decalExtras keepAspect=true 省略', !('keepAspect' in decalExtras({ size: 20, keepAspect: true })))
  // patch 清回默认删键
  let d = { id: 'dc1', url: 'u', p: [0, 0, 0], n: [0, 0, 1], size: 20, rot: 0, flipH: true }
  d = patchDecalFields(d, { flipH: false })
  ck('patchDecalFields 清 flipH 删键', !('flipH' in d))
  d = patchDecalFields(d, { opacity: 0.4 })
  ck('patchDecalFields 设 opacity', d.opacity === 0.4)
  d = patchDecalFields(d, { opacity: 1 })
  ck('patchDecalFields opacity=1 删键', !('opacity' in d))
  // 投影盒：w/h 覆盖 size，depth = 半最大边
  ck('decalBox 用 size', (() => { const b = decalBox({ size: 20 }); return b.w === 20 && b.h === 20 && b.depth === 10 })())
  ck('decalBox w/h 覆盖', (() => { const b = decalBox({ size: 20, w: 40, h: 10 }); return b.w === 40 && b.h === 10 && b.depth === 20 })())
  // keepAspect 联动
  ck('decalLinkAspect', near(decalLinkAspect(40, 2), 20))
  // flipUVArray
  ck('flipUVArray flipH', JSON.stringify(flipUVArray([0, 0, 1, 1], true, false)) === JSON.stringify([1, 0, 0, 1]))
  ck('flipUVArray flipV', JSON.stringify(flipUVArray([0, 0, 1, 1], false, true)) === JSON.stringify([0, 1, 1, 0]))
  ck('flipUVArray 无翻原样', JSON.stringify(flipUVArray([0.2, 0.8], false, false)) === JSON.stringify([0.2, 0.8]))
}

// ── 5. SVG/DXF 轮廓 → 可编辑草图源 ────────────────────────────────────
{
  ck('impToSketchShape circle', (() => { const s = impToSketchShape({ kind: 'circle', c: [1, 2], r: 5 }); return s.type === 'circle' && s.c[0] === 1 && s.r === 5 })())
  ck('impToSketchShape poly', (() => { const s = impToSketchShape({ kind: 'poly', pts: [[0, 0], [10, 0]] }); return s.type === 'poly' && s.pts.length === 2 })())
  // 2D 变换：scale 2 + 旋转 90°
  ck('xform2D scale+rot', (() => { const p = xform2D([10, 0], 2, Math.PI / 2); return near(p[0], 0, 1e-4) && near(p[1], 20, 1e-4) })())
  ck('transformImpProfile circle 半径缩放', (() => { const p = transformImpProfile({ kind: 'circle', c: [10, 0], r: 5 }, 2, 0); return p.kind === 'circle' && near(p.r, 10) && near(p.c[0], 20) })())
  // 构建草图源
  const items = [{ profile: { kind: 'circle', c: [0, 0], r: 5 }, operation: 'new' }, { profile: { kind: 'poly', pts: [[0, 0], [10, 0], [10, 10]] }, operation: 'cut' }]
  const src = buildImportSketchSource(items, { plane: 'XZ', baseZ: 3, op: 'new', height: 8 })
  ck('buildImportSketchSource 形状/参数', src.shapes.length === 2 && src.cons.length === 0 && src.plane === 'XZ' && src.baseZ === 3 && src.height === 8 && src.op === 'new')
  ck('buildImportSketchSource height 兜底', buildImportSketchSource(items, {}).height === 5 && buildImportSketchSource(items, { height: -1 }).height === 5)
  const scaled = buildImportSketchSource(items, { scale: 2 })
  ck('buildImportSketchSource 套 scale', near(scaled.shapes[0].r, 10))
  // 重开判据（对齐 Timeline hasSketch）
  const srcs = { sk9: {} }
  ck('isReopenable extrude+sketchId+源', isReopenableSketchFeature({ type: 'extrude', sketchId: 'sk9' }, srcs) === true)
  ck('isReopenable 无 sketchId → false', isReopenableSketchFeature({ type: 'extrude' }, srcs) === false)
  ck('isReopenable 源缺失 → false', isReopenableSketchFeature({ type: 'extrude', sketchId: 'skX' }, srcs) === false)
  ck('isReopenable 非草图类型 → false', isReopenableSketchFeature({ type: 'fillet', sketchId: 'sk9' }, srcs) === false)
  // 逐层过滤
  const li = [{ profile: { kind: 'circle', c: [0, 0], r: 1 }, operation: 'new', layer: 'A' }, { profile: { kind: 'circle', c: [0, 0], r: 2 }, operation: 'new', layer: 'B' }]
  ck('filterByLayers 选 A', filterByLayers(li, new Set(['A'])).length === 1)
  ck('filterByLayers null=全收', filterByLayers(li, null).length === 2)
  ck('collectLayers 去重排序', JSON.stringify(collectLayers(li)) === JSON.stringify(['A', 'B']))
  ck('collectLayers 缺 layer → 0', collectLayers([{ profile: { kind: 'circle', c: [0, 0], r: 1 }, operation: 'new' }])[0] === '0')
}

// ── 6. DXF 逐层解析（真解析器）────────────────────────────────────────
{
  const dxf = ['0', 'SECTION', '2', 'ENTITIES',
    '0', 'CIRCLE', '8', 'outer', '10', '0', '20', '0', '40', '10',
    '0', 'CIRCLE', '8', 'holes', '10', '0', '20', '0', '40', '3',
    '0', 'ENDSEC', '0', 'EOF'].join('\n')
  const r = parseDxfToProfiles(dxf)
  ck('DXF 解析 2 圆', r.profiles.length === 2)
  ck('DXF 返回 layers 排序', JSON.stringify(r.layers) === JSON.stringify(['holes', 'outer']))
  ck('DXF 逐轮廓带 layer', r.profiles.some((p) => p.layer === 'outer') && r.profiles.some((p) => p.layer === 'holes'))
  // classifyProfiles 保留 layer
  const cls = classifyProfiles(r.profiles)
  ck('classifyProfiles 保留 layer', cls.every((c) => c.profile.layer === 'outer' || c.profile.layer === 'holes'))
  // 小圆在大圆内 → 偶奇分类 cut
  ck('classifyProfiles 嵌套 cut', cls.some((c) => c.operation === 'cut'))
  // ★ 回归（对抗式验证捉到 HIGH）：真 classifyProfiles 产物把 layer 嵌喺 profile.layer，
  //   filterByLayers/collectLayers 必须读 profile.layer 才命中（顶层 it.layer 恒 undefined）。
  //   之前的手搓 li（顶层 layer）令此路径假绿。
  ck('filterByLayers 真产物选 outer', filterByLayers(cls, new Set(['outer'])).length === 1)
  ck('filterByLayers 真产物选 holes', filterByLayers(cls, new Set(['holes'])).length === 1)
  ck('filterByLayers 真产物选两层=2', filterByLayers(cls, new Set(['outer', 'holes'])).length === 2)
  ck('filterByLayers 真产物选不存在层=0', filterByLayers(cls, new Set(['nope'])).length === 0)
  ck('collectLayers 真产物读 profile.layer', JSON.stringify(collectLayers(cls)) === JSON.stringify(['holes', 'outer']))
}

// ── 7. Mesh 单位换算 + flip-up + 摆位 ─────────────────────────────────
{
  ck('meshUnitScaleMm inch', near(meshUnitScaleMm('inch'), 25.4))
  ck('meshUnitScaleMm cm', near(meshUnitScaleMm('cm'), 10))
  ck('meshUnitScaleMm 未知→1', near(meshUnitScaleMm('xx'), 1))
  ck('MESH_UNITS 全表', MESH_UNITS.mm === 1 && MESH_UNITS.m === 1000 && near(MESH_UNITS.ft, 304.8))
  // flip-up：(x,y,z) → (x,z,-y)
  ck('flipUpVec', (() => { const r = flipUpVec(1, 2, 3); return r[0] === 1 && r[1] === 3 && r[2] === -2 })())
  // 单位缩放：inch → mm
  const m = { vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1] }
  const t = transformMesh(m, { scale: 25.4 })
  ck('transformMesh 单位缩放', near(t.vertices[3], 25.4) && near(t.vertices[7], 25.4))
  ck('transformMesh 缩放不动法向', t.normals[2] === 1)
  // flip-up：顶点 (0,1,0) → (0,0,-1)；法向同旋转
  const tf = transformMesh(m, { flipUp: true })
  ck('transformMesh flip 顶点', near(tf.vertices[6], 0) && near(tf.vertices[7], 0) && near(tf.vertices[8], -1))
  ck('transformMesh flip 法向', near(tf.normals[0], 0) && near(tf.normals[1], 1) && near(tf.normals[2], 0))
  ck('transformMesh 默认原样', (() => { const z = transformMesh(m, {}); return z.vertices[3] === 1 })())
  // bbox + 摆位
  const bb = meshBBox([0, 2, 0, 4, 6, 8])
  ck('meshBBox', bb && bb.min[0] === 0 && bb.max[0] === 4 && bb.min[1] === 2 && bb.max[2] === 8)
  ck('meshBBox 空→null', meshBBox([]) === null)
  // ground（axis=1 竖轴）：抬到 min[1]=0
  const g = meshPlaceOffset({ min: [-1, 5, -2], max: [3, 9, 4] }, 'ground', 1)
  ck('meshPlaceOffset ground 抬竖轴', near(g[1], -5) && near(g[0], -1) && near(g[2], -1))
  const c = meshPlaceOffset({ min: [-1, 5, -2], max: [3, 9, 4] }, 'center', 1)
  ck('meshPlaceOffset center 全居中', near(c[0], -1) && near(c[1], -7) && near(c[2], -1))
  ck('meshPlaceOffset none 零', JSON.stringify(meshPlaceOffset({ min: [0, 0, 0], max: [1, 1, 1] }, 'none')) === JSON.stringify([0, 0, 0]))
}

// ── 汇总 ──────────────────────────────────────────────────────────────
for (const [st, name, detail] of rows) console.log(`  ${st === 'PASS' ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
console.log(`\nWave X3 插入：${pass} PASS / ${fail} FAIL（共 ${pass + fail}）`)
if (fail) process.exit(1)
