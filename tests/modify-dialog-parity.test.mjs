import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const viewport = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const worker = readFileSync(new URL('../src/worker/cad.worker.ts', import.meta.url), 'utf8')
const fullRound = readFileSync(new URL('../src/cad/fullRound.ts', import.meta.url), 'utf8')
// Exercise the same pure feature builder used by preview and commit, rather
// than duplicating the shell validation/serialization implementation here.
const shellBuilderStart = store.indexOf('function buildShellFeature(')
const shellBuilderEnd = store.indexOf('\nlet _shellPvTimer', shellBuilderStart)
assert.ok(shellBuilderStart >= 0 && shellBuilderEnd > shellBuilderStart)
const shellBuilderJs = ts.transpileModule(store.slice(shellBuilderStart, shellBuilderEnd), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const buildShellFeature = new Function(`${shellBuilderJs}; return buildShellFeature`)()
const shellInput = { shellPicks: [[2, 3, 4]], shellThickness: 2, shellType: 'open', shellDir: 'inside', shellTangentChain: true }

const asymmetric = readFileSync(new URL('../src/cad/asymmetricFillet.ts', import.meta.url), 'utf8')

test('Press Pull starts at zero and never silently turns zero into 10 mm', () => {
  assert.match(store, /pushPullDist:\s*0,/)
  assert.match(store, /setPushPullDist:\s*\(n\)\s*=>\s*set\(\{ pushPullDist: Number\.isFinite\(n\) \? n : 0 \}\)/)
  assert.doesNotMatch(store, /const dist = get\(\)\.pushPullDist \|\| 10/)
  assert.match(store, /if \(Math\.abs\(dist\) < 1e-9\)/)
})

test('Press Pull uses a Fusion-style docked command dialog with guarded OK', () => {
  assert.equal((viewport.match(/\{pushPullMode && \(/g) || []).length, 1)
  assert.match(viewport, /title=\{pushPullPicks\.length \? tStatus\('偏移面'/)
  assert.match(viewport, /okDisabled=\{!pushPullPicks\.length \|\| Math\.abs\(pushPullDist\) < 1e-9\}/)
  assert.match(viewport, /<option value="modify">\{tStatus\('修改现有特征'/)
  assert.match(viewport, /<option value="new">\{tStatus\('新偏移'/)
  assert.match(viewport, /<option value="auto">\{tStatus\('自动'/)
  assert.doesNotMatch(viewport, /⇲ 按拉：点实体一个平面/)
})

test('Press Pull Enter commits and Escape cancels before generic keyboard handling', () => {
  const branch = app.indexOf('if (s.pushPullMode)')
  const nextBranch = app.indexOf('if (s.faceFilletMode)', branch + 1)
  assert.ok(branch >= 0)
  assert.ok(nextBranch > branch)
  assert.match(app.slice(branch, nextBranch), /commitPushPull\(\)/)
  assert.match(app.slice(branch, nextBranch), /togglePushPull\(\)/)
})

test('Shell requires an explicit face and a positive thickness', () => {
  assert.match(store, /shellThickness:\s*0,/)
  assert.match(store, /if \(!pts\.length\) \{ set\(\{ status: shellType === 'closed' \? '请先选择要抽壳的实体' : '请先选择要移除的面'/)
  assert.match(store, /if \(!\(th > 0\)\) \{ set\(\{ status: '请输入大于 0 的壁厚'/)
  assert.match(viewport, /okDisabled=\{!shellPicks\.length \|\| !\(shellThickness > 0\) \|\| shellPreviewBusy\}/)
  assert.match(store, /shellThickness: s\.shellMode \? 0 : 2/)
  for (const shellType of ['open', 'closed']) {
    assert.equal(buildShellFeature({ ...shellInput, shellType, shellPicks: [] }, 'shell'), null)
    for (const shellThickness of [0, -1, NaN, Infinity]) assert.equal(buildShellFeature({ ...shellInput, shellType, shellThickness }, 'shell'), null)
  }
  assert.match(store, /const s = get\(\), f = buildShellFeature\(s, '~pv-shell'\)/)
  assert.match(store, /const f = buildShellFeature\(get\(\), fid\(\)\)!/)

  assert.doesNotMatch(viewport, /不选=默认顶面/)
  assert.doesNotMatch(store, /不选则默认开顶面/)
})

test('Shell Tangent Chain and Closed Body are real enabled feature paths', () => {
  assert.match(store, /shellType:\s*'open',/)
  assert.match(store, /shellTangentChain:\s*true,/)
  assert.match(store, /closed: true/)
  for (const tangentChain of [true, false]) {
    for (const direction of ['inside', 'outside', 'both']) {
      const input = { ...shellInput, shellTangentChain: tangentChain, shellDir: direction }
      const directionFields = direction === 'inside' ? {} : { direction }
      assert.deepEqual(buildShellFeature(input, 'shell'), { id: 'shell', type: 'shell', thickness: 2, nears: [[2, -4, 3]], tangentChain, ...directionFields })
      assert.deepEqual(buildShellFeature({ ...input, shellType: 'closed' }, 'shell'), { id: 'shell', type: 'shell', thickness: 2, closed: true, ...directionFields })
    }
  }
  assert.match(viewport, /checked=\{shellTangentChain\} onChange=\{\(\) => toggleShellTangentChain\(\)\}/)
  assert.match(viewport, /<option value="closed">封闭实体<\/option>/)
  assert.doesNotMatch(viewport, /封闭实体（内核待实作）/)
  assert.match(worker, /if \(f\.closed\)/)
  assert.match(worker, /_shellTangentClosure\(base, seeds\)/)
  assert.match(worker, /shape\.cut\(_shellExactFaces\(shape, t, \[\]\)\)/)
  assert.match(worker, /_shellExactFaces\(shape, -t, \[\]\)\.cut\(shape\)/)
})

test('Fillet and Chamfer expose the native type fields and reject zero size', () => {
  assert.match(store, /edgeRoundSize:\s*0,/)
  assert.match(store, /if \(!\(kind === 'fillet' && get\(\)\.filletType === 'full' \? true : kind === 'fillet' && get\(\)\.filletMode === 'chord'/)
  assert.match(viewport, /aria-label="圆角类型"/)
  assert.match(viewport, /aria-label="圆角半径类型"/)
  assert.match(viewport, /<option value="constant">常数<\/option>/)
  assert.match(viewport, /<option value="variable">变量<\/option>/)
  assert.match(viewport, /aria-label="Chamfer Type"/)
  assert.match(viewport, /<option value="equal">Equal Distance<\/option><option value="two">Two Distance<\/option><option value="angle">Distance and Angle<\/option>/)
  assert.match(viewport, /aria-label="Chamfer Corner Type"/)
  assert.match(viewport, /<option value="chamfer">Chamfer<\/option><option disabled>Miter<\/option><option disabled>Blend<\/option>/)
  assert.match(viewport, />转角类型<\/span>/)
})

test('Chamfer type transitions follow the measured Fusion selection and validation state machine', () => {
  assert.match(store, /chamferSize2:\s*0,/)
  assert.match(store, /setChamferMode:\s*\(m\)\s*=>\s*set\(\{[\s\S]*?edgeRoundPicks:\s*\[\],[\s\S]*?edgeRoundPickLines:\s*\[\],[\s\S]*?roundPreviewMesh:\s*null/)
  assert.match(store, /setChamferSize2:\s*\(n\)\s*=>\s*\{[\s\S]*?scheduleRoundPreview\(\)/)
  assert.match(store, /setChamferAngle:\s*\(n\)\s*=>\s*\{[\s\S]*?scheduleRoundPreview\(\)/)
  assert.match(store, /chamferRefFace:\s*null,/)
  assert.match(store, /setChamferReferenceFace:\s*\(p, faceId\)/)
  assert.match(store, /refFaceNear = cm === 'angle' && s\.chamferRefFace/)
  assert.match(store, /chamferMode === 'angle' && !get\(\)\.chamferRefFace/)
  assert.match(store, /chamferMode:\s*'equal', chamferSize2:\s*0, chamferAngle:\s*45, chamferFlip:\s*false/)
  assert.match(viewport, /chamferMode === 'two' && !\(chamferSize2 > 0\)/)
  assert.match(viewport, /chamferMode === 'angle' && \(!chamferRefFace \|\| !\(chamferAngle > 0 && chamferAngle < 90\)\)/)
  assert.match(viewport, /setChamferReferenceFace\(rp, faceIdAt\(mesh, e\.faceIndex\)/)
  assert.match(viewport, /selectedText=\{chamferMode === 'angle'/)
  assert.match(worker, /refFaceNear\?: \[number, number, number\]/)
  assert.match(worker, /adj\.sort\(refFaceNear \? \(a, b\) => a\.refD - b\.refD/)
  assert.match(worker, /!!f\.flip, f\.refFaceNear, f\.edgeFp/)
  const parameter = viewport.indexOf('aria-label="Chamfer distance mm"')
  const type = viewport.indexOf('aria-label="Chamfer Type"')
  const selection = viewport.indexOf('label="Edges/Faces/Features"')
  const tangent = viewport.indexOf('Tangent Chain', selection)
  const corner = viewport.indexOf('aria-label="Chamfer Corner Type"')
  assert.ok(parameter >= 0 && parameter < type && type < selection && selection < tangent && tangent < corner)
  assert.match(viewport, /The fillet\/chamfer could not be created at the requested size\./)
})

test('Fillet G2 continuity is wired from dialog state to the OCCT builder', () => {
  assert.match(store, /filletContinuity:\s*'G1',/)
  assert.match(store, /setFilletContinuity:\s*\(c\)/)
  assert.match(store, /continuity:\s*'G2' as const/)
  assert.match(viewport, /aria-label=\{`半径组 \$\{gi \+ 1\} 连续性`\}/)
  assert.match(viewport, /<option value="G1">相切 G1<\/option>/)
  assert.match(viewport, /<option value="G2">曲率 G2<\/option>/)
  assert.match(worker, /function _rawContinuityFillet/)
  assert.match(worker, /mk\.SetContinuity\(cont, 1e-3\)/)
  assert.match(worker, /f\.setbackRatio, f\.continuity/)
  assert.match(worker, /continuity === 'G2'/)
})

test('Fillet radius groups own their edge sets, radii, continuity and +/x controls', () => {
  assert.match(store, /edgeRoundGroupIds:\s*\[\],/)
  assert.match(store, /filletRadiusGroups:\s*\[\{ radius: 0, continuity: 'G1' \}\]/)
  assert.match(store, /addFilletRadiusGroup:\s*\(\)/)
  assert.match(store, /removeFilletRadiusGroup:\s*\(\)/)
  assert.match(store, /edgeRoundGroupIds:\s*\[\.\.\.s\.edgeRoundGroupIds, s\.edgeRoundPick === 'fillet' \? s\.filletActiveGroup : 0\]/)
  assert.match(store, /continuities = kind === 'fillet'/)
  assert.match(worker, /mixed G1\/G2 groups are solved sequentially/)
  assert.match(worker, /f\.continuities/)
  assert.match(viewport, /aria-label="新增半径组"/)
  assert.match(viewport, /aria-label="删除半径组"/)
  assert.match(viewport, /选中第 \{filletActiveGroup \+ 1\} 组/)
})

test('Rule Fillet exposes Autodesk All Edges and Between Faces/Features rules with real face picking', () => {
  assert.match(store, /filletType:\s*'fillet',/)
  assert.match(store, /filletRuleMode:\s*'all',/)
  assert.match(store, /filletRuleFaceAt:\s*\(p, faceId\)/)
  assert.match(store, /rule = kind === 'fillet' && s\.filletType === 'rule'/)
  assert.match(viewport, /<option value="rule">规则圆角<\/option>/)
  assert.match(viewport, /aria-label="规则圆角规则类型"/)
  assert.match(viewport, /<option value="all">全部边<\/option>/)
  assert.match(viewport, /<option value="between">面\/特征之间<\/option>/)
  assert.match(viewport, /filletRuleFaceAt\(\[e\.point\.x, e\.point\.y, e\.point\.z\]/)
  assert.match(worker, /function _ruleFilletMids/)
  assert.match(worker, /Rule Fillet：两组面之间冇共同边/)
})

test('Full Round Fillet has three real face sets and a radius-free B-rep construction path', () => {
  assert.match(store, /filletFullFaceSets:\s*\[\],/)
  assert.match(store, /filletFullSlot:\s*1,/)
  assert.match(store, /filletFullFaceAt:\s*\(p, faceId\)/)
  assert.match(store, /fullRound = kind === 'fillet' && s\.filletType === 'full'/)
  assert.match(store, /\[1, 2, 3\].*every\(\(slot\) => get\(\)\.filletFullFaceSets\.includes\(slot\)\)/)
  assert.match(viewport, /<option value="full">全圆角<\/option>/)
  assert.match(viewport, /useApp\.getState\(\)\.filletFullFaceAt/)
  assert.match(viewport, /侧面组 1/)
  assert.match(viewport, /中心面/)
  assert.match(viewport, /侧面组 2/)
  assert.doesNotMatch(viewport, /<option value="full" disabled>/)
  assert.match(worker, /function _fullRoundFillet/)
  assert.match(worker, /const cc = _shellTangentClosure\(shape, _shellFaceIndicesNear\(shape, full\.center\)\)/)
  assert.match(worker, /fullRoundFilletFromFaces\(shape, \{ side1: s1, center: cc, side2: s2 \}, makeCylinder\)/)
  assert.match(fullRound, /makeCylinder\(width \/ 2, t1 - t0, base, axis\)/)
  assert.match(fullRound, /d1 < d2 \? shape\.fuse\(tool\) : shape\.cut\(tool\)/)
  assert.match(worker, /if \(f\.fullRound\)/)
})

test('Asymmetric Fillet is enabled, keeps Fusion G1/Setback rules and reaches a real elliptical B-rep path', () => {
  assert.match(store, /filletMode: 'radius' \| 'chord' \| 'asymmetric'/)
  assert.match(store, /filletAsymFlip:\s*false,/)
  assert.match(store, /asymmetric: \{ offset2: r2/)
  assert.match(viewport, /<option value="asymmetric">不对称<\/option>/)
  assert.doesNotMatch(viewport, /<option value="asymmetric" disabled>/)
  assert.match(viewport, /aria-label="不对称圆角偏移 2 mm"/)
  assert.match(viewport, /翻转偏移方向/)
  assert.match(viewport, /filletMode === 'asymmetric' \? 'G1'/)
  assert.match(viewport, /filletMode === 'asymmetric' \? 'setback'/)
  assert.match(worker, /asymmetricFilletNearPoints\(shape, f\.nears, f\.radii \?\? f\.radius, f\.asymmetric\.offset2/)
  assert.match(asymmetric, /drawSingleEllipse\(d1, d2\)/)
  assert.match(asymmetric, /\(corner as any\)\.cut\(ellipse\)/)
})
