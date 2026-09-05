// Fusion SOLID 主菜單順序守衛：避免後續把 WebCAD 擴展工具重新混入 Fusion 原生菜單。
import { WORKSPACES } from '../src/ribbon.ts'
import { readFileSync } from 'node:fs'

const panels = WORKSPACES.SOLID.panels
const ids = (name) => panels.find((p) => p.name === name)?.tools.map((t) => t.id) ?? []
const labels = (name) => panels.find((p) => p.name === name)?.tools.map((t) => t.label) ?? []

const eq = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : `\n  actual:   ${actual.join(', ')}\n  expected: ${expected.join(', ')}`}`)
  if (!ok) process.exitCode = 1
}

eq('MODIFY 依本機 Fusion 360 SolidModifyPanel 完整次序', ids('MODIFY'), [
  'presspull', 'editface', 'fillet', 'chamfer', 'shell', 'draft', 'scale', 'combine',
  'offsetface', 'replaceface', 'splitface', 'splitbody', 'silhouettesplit', 'move', 'align',
  'delete', 'remove', 'arrange', 'simplify', 'vollattice', 'voltexture', 'volmodify',
  'physicalmaterial', 'appearance', 'managematerials', 'params', 'computeall',
  'computeunresolved', 'convert', 'bom',
])

const modify = panels.find((p) => p.name === 'MODIFY')?.tools ?? []
eq('MODIFY 分隔線位置跟 Fusion', modify.filter((x) => x.sep).map((x) => x.id), [
  'fillet', 'shell', 'move', 'arrange', 'vollattice', 'physicalmaterial', 'params', 'convert', 'bom',
])
eq('MODIFY 固定快捷工具跟 Fusion Controls', modify.filter((x) => x.quick).map((x) => x.id), [
  'presspull', 'fillet', 'shell', 'combine', 'splitbody', 'move', 'bom',
])
eq('Fillet 快捷圖示下拉跟 Fusion 提供 Fillet / Chamfer', modify.find((x) => x.id === 'fillet')?.quickChildren?.map((x) => x.id) ?? [], [
  'fillet', 'chamfer',
])

const simplify = modify.find((x) => x.id === 'simplify')
eq('MODIFY 简化子菜单跟 Fusion', simplify?.children?.map((x) => x.id) ?? [], [
  'removefeatures', 'removefaces', 'replaceprimitives',
])

eq('INSPECT 已支援命令依 Fusion live-capture 次序', ids('INSPECT'), [
  'measureuni', 'interference', 'curvcomb', 'zebra', 'draftanalysis', 'curvmap',
  'accessanalysis', 'minradius', 'section', 'centerofmass', 'properties', 'meshfacegroups',
])

eq('CONSTRUCT 命令依 Fusion live-capture 次序', ids('CONSTRUCT'), [
  'ucs', 'datumgeom',
  'offsetplane', 'planeangedge', 'planetan', 'planemid', 'planeperp', 'plane2edge', 'plane3pt', 'planepath',
  'axiscyl', 'axisperpface', 'axis2planes', 'axis2pt', 'axisedge',
  'pointvertex', 'point2edges', 'point3planes', 'pointcenter', 'pointedgeplane', 'pointpath',
])

const storeSource = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
if (!storeSource.includes("case 'offsetplane': return get().openDatumCmd({ type: 'plane', method: 'offset' })")) {
  console.log('FAIL Offset Plane must open the XY/XZ/YZ datum-base workflow, not force a planar-face pick')
  process.exitCode = 1
} else console.log('PASS Offset Plane opens origin XY/XZ/YZ datum-base workflow')
const viewportSource = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
if (!viewportSource.includes('data-testid="datum-axis-point"')) {
  console.log('FAIL Construction Axis must accept an existing Construction Point as its through-point')
  process.exitCode = 1
} else console.log('PASS Construction Axis accepts a selected Construction Point')
const datumPointPickContract = [
  "'plane:threePoints': ['p', 'p', 'p']",
  "'axis:twoPoints': ['p', 'p']",
  "'point:midpoint': ['p', 'p']",
  "kind: 'point'",
  "source === 'constructPoint'",
  "source === 'modelVertex'",
  'Math.min(da, db) > 1.5',
  "datumPointPick",
  '画布选取',
]
const missingDatumPointPickContract = datumPointPickContract.filter((needle) => !storeSource.includes(needle) && !viewportSource.includes(needle))
if (missingDatumPointPickContract.length || viewportSource.includes("用最后 3 个构造点建面")) {
  console.log(`FAIL Construct point-pick contract missing: ${missingDatumPointPickContract.join(', ') || 'legacy last-N-point UI remains'}`)
  process.exitCode = 1
} else console.log('PASS Construct three-point/two-point methods use explicit canvas point selection')
const componentPatternContract = [
  "p.objectType === 'components'",
  '共享组件定义',
  '<option value="components">',
  "p.objectType !== 'features' && p.objectType !== 'components'",
]
const missingComponentPatternContract = componentPatternContract.filter((needle) => !storeSource.includes(needle) && !viewportSource.includes(needle))
if (missingComponentPatternContract.length) {
  console.log(`FAIL Component Pattern contract missing: ${missingComponentPatternContract.join(', ')}`)
  process.exitCode = 1
} else console.log('PASS Rectangular/Circular Pattern expose assembly Components alongside the Face Pattern workflow')
const componentDirectionContract = [
  'const cu1 = dir1 ? normDir(dir1)',
  'const cu2 = dir2 ? normDir(dir2)',
  'ii * sdx * cu1[0] + jj * sdy * cu2[0]',
]
const missingComponentDirectionContract = componentDirectionContract.filter((needle) => !storeSource.includes(needle))
if (missingComponentDirectionContract.length) {
  console.log(`FAIL Component Pattern Direction-1/2 contract missing: ${missingComponentDirectionContract.join(', ')}`)
  process.exitCode = 1
} else console.log('PASS Component Pattern uses Direction-1/2 instead of fixed world XY')
const slopedFeaturePatternContract = [
  'arbPlane: g.arbPlane ?? src.arb',
  'arbPlane: sub.arbPlane',
  "斜面局部 XY",
]
const missingSlopedFeaturePatternContract = slopedFeaturePatternContract.filter((needle) => !storeSource.includes(needle))
if (storeSource.includes('斜面草图暂不支持阵列') || missingSlopedFeaturePatternContract.length) {
  console.log(`FAIL Sloped feature-pattern contract missing: ${missingSlopedFeaturePatternContract.join(', ') || 'legacy rejection remains'}`)
  process.exitCode = 1
} else console.log('PASS Feature Pattern preserves arbitrary sketch-plane local XY basis')
const originPlaneLoftContract = [
  'arbPlane?: { o:',
  "shapeToProfile(sh, src.plane)",
  'function loftSectionSketch',
  'profileOnPlane(s.profile, new RPlane',
  "_samePlane ? _rawSecs[a].z - _rawSecs[b].z : a - b",
  "plane: ss.plane || 'XY'",
  "{sketchShape && <button className=\"sb-tool\"",
  'const frames = new Set<string>()',
  'const key = src.arb ?',
]
const workerSource = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const missingOriginPlaneLoftContract = originPlaneLoftContract.filter((needle) => !storeSource.includes(needle) && !workerSource.includes(needle) && !viewportSource.includes(needle))
const loftCommandStart = storeSource.indexOf("case 'loft':")
const loftCommandEnd = storeSource.indexOf("case 'sweep':", loftCommandStart)
const loftCommandSource = storeSource.slice(loftCommandStart, loftCommandEnd)
if (loftCommandSource.includes("src.plane !== 'XY'") || storeSource.includes("放样截面暂时只支持 XY 水平面草图") || storeSource.includes("放样截面暂未支持任意斜参考平面") || viewportSource.includes("sketchPlane === 'XY' && sketchShape && <button className=\"sb-tool\"") || missingOriginPlaneLoftContract.length) {
  console.log(`FAIL Loft Origin-plane contract missing: ${missingOriginPlaneLoftContract.join(', ') || 'legacy XY-only rejection remains'}`)
  process.exitCode = 1
} else console.log('PASS Loft preserves Origin and arbitrary datum-plane section placement and selection order')
const modifyLeafIds = modify.flatMap((x) => x.children?.length ? x.children.map((c) => c.id) : [x.id])
const missingModifyRoutes = modifyLeafIds.filter((id) => !storeSource.includes(`case '${id}'`))
if (missingModifyRoutes.length) {
  console.log(`FAIL MODIFY 缺命令路由：${missingModifyRoutes.join(', ')}`)
  process.exitCode = 1
} else console.log(`PASS MODIFY ${modifyLeafIds.length} 個可點命令全部有明確路由`)

const datumMethods = [
  ['plane', 'offsetFace'], ['plane', 'atAngleEdge'], ['plane', 'tangent'], ['plane', 'midplane'], ['plane', 'perp'], ['plane', 'twoEdges'], ['plane', 'threePoints'], ['plane', 'alongPath'],
  ['axis', 'cyl'], ['axis', 'perpFace'], ['axis', 'twoPlanes'], ['axis', 'twoPoints'], ['axis', 'edge'],
  ['point', 'vertex'], ['point', 'twoEdges'], ['point', 'threePlanes'], ['point', 'centerEdge'], ['point', 'edgePlane'], ['point', 'alongPath'],
]
const missingDatumMethods = datumMethods
  .filter(([type, method]) => !storeSource.includes(`type: '${type}', method: '${method}'`))
  .map(([type, method]) => `${type}:${method}`)
if (missingDatumMethods.length) {
  console.log(`FAIL Construction Geometry 缺方法映射：${missingDatumMethods.join(', ')}`)
  process.exitCode = 1
} else console.log('PASS Construction Geometry 20 個 Fusion 方法全部有映射')

// Menu presence is not enough: each Fusion Construct method must reach either a
// typed field workflow, an explicit multi-selection workflow, or a canvas pick.
const datumRouting = {
  'plane:offset': 'commitDatumCmdField',
  'plane:offsetFace': "startDatumPick('offsetface')",
  'plane:atAngleEdge': "startEdgePointPick('angleplane')",
  'plane:tangent': "startDatumPick('tanplane')",
  'plane:midplane': "startDatumPick('midplane')",
  'plane:perp': "'plane:perp': ['f', 'e']",
  'plane:twoEdges': "'plane:twoEdges': ['e', 'e']",
  'plane:threePoints': "'plane:threePoints': ['p', 'p', 'p']",
  'plane:alongPath': "startEdgePointPick('pathplane')",
  'axis:cyl': "'axis:cyl': ['c']",
  'axis:perpFace': "startDatumPick('normalaxis')",
  'axis:twoPlanes': "startDatumPick('planeaxis')",
  'axis:twoPoints': "'axis:twoPoints': ['p', 'p']",
  'axis:edge': "startEdgePointPick('edgeaxis')",
  'point:vertex': "startEdgePointPick('vertex')",
  'point:twoEdges': "'point:twoEdges': ['e', 'e']",
  'point:threePlanes': "'point:threePlanes': ['f', 'f', 'f']",
  'point:centerEdge': "'point:centerEdge': ['e']",
  'point:edgePlane': "'point:edgePlane': ['e', 'f']",
  'point:alongPath': "startEdgePointPick('ratio')",
}
const missingDatumRouting = Object.entries(datumRouting).filter(([, needle]) => !storeSource.includes(needle)).map(([key]) => key)
if (missingDatumRouting.length || !storeSource.includes('已准备，按「确定」建立')) {
  console.log(`FAIL Construct routing contract missing: ${missingDatumRouting.join(', ') || 'Fusion confirm-before-create state'}`)
  process.exitCode = 1
} else console.log('PASS Every Fusion Construct method routes to an explicit field/pick workflow and confirms multi-picks')

const create = ids('CREATE')
const requiredCreateOrder = [
  'sketch', 'createform', 'derive', 'automatedmodel',
  'extrude', 'revolve', 'sweep', 'loft', 'rib', 'web', 'emboss', 'hole', 'thread',
  'box', 'cylinder', 'sphere', 'torus', 'coil', 'pipe', 'pattern', 'mirror', 'thicken',
  'boundaryfill', 'basefeature', 'createpcb', 'jointorigin',
]
const projected = create
eq('CREATE Fusion 核心命令相對次序', projected, requiredCreateOrder)

const extensionIds = ['facesketch', 'sweepedge', 'text', 'othread', 'ithread', 'newbody']
eq('CREATE extensions stay outside Fusion main menu', create.filter((id) => extensionIds.includes(id)), [])

const inspectLabels = labels('INSPECT')
const assemblyIds = ids('ASSEMBLE')
if (assemblyIds.filter((id) => id === 'joint').length !== 1 || assemblyIds.includes('jointpick')) {
  console.log('FAIL Assembly exposes one primary Fusion Joint command')
  process.exitCode = 1
} else console.log('PASS Assembly exposes one primary Fusion Joint command')
const jointCommandStart = storeSource.indexOf("case 'joint':")
const jointCommandEnd = storeSource.indexOf("case 'jointpick':", jointCommandStart)
const jointCommand = storeSource.slice(jointCommandStart, jointCommandEnd)
if (!jointCommand.includes('get().startJointPick()') || jointCommand.includes('get().addJoint(')) {
  console.log('FAIL Assembly Joint must begin explicit geometry picking, not silently join the first two components')
  process.exitCode = 1
} else console.log('PASS Assembly Joint follows Fusion geometry-first selection workflow')
if (inspectLabels.some((x) => ['两点距离', '高斯曲率', '斜度分析'].includes(x))) {
  console.log('FAIL WebCAD 擴展檢查工具不應混入 Fusion INSPECT 主菜單')
  process.exitCode = 1
} else console.log('PASS WebCAD 擴展檢查工具留在實驗室')
