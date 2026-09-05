// occurrenceR2.test.mjs — R2 装配 occurrence/多体架构（P1+P2）纯逻辑核验证
//
// 覆盖（对标 _fusion_r2_occurrence_plan.md 的镜像不变量铁律）：
//   1. reconcileComponents 镜像同步：def.rev++ → 有 defId 嘅 occurrence 重镜像 mesh/src；匿名件零改；未变保引用
//   2. migrateComponentDefs：旧档（无 componentDefs）→ 合成匿名 def「D_<id>」（幂等）；新档 → 载 defs + reconcile
//   3. makeDefOcc：建 def+occurrence，镜像不变量 occ.mesh===def.mesh
//   4. Copy = 共享 defId（spread）→ 改 def 全实例跟新；Paste-New = cloneDef 独立 defId → 改任一唔影响对方
//   5. finishComponentEdit（writeDefFromEdit + reconcile）→ 该 def 全部实例齐更新
//   6. docSnap round-trip 含 componentDefs（JSON 往返 + migrate）→ 镜像重建一致
//   7. 默认态 payload 语义兼容：单实例件存出仍带 occurrence.mesh（旧 reader 可读）+ componentDefs（新 reader reconcile）
//   8. nextDefId 唔撞匿名 'D_<id>' 命名空间
//
// 跑法（喺 C:\ClaudeCode\webcad 目录）：npx -y tsx tests/occurrenceR2.test.mjs
// 全部通过 → exit 0；任一失败 → exit 1。
import {
  nextDefId, reconcileComponents, migrateComponentDefs, makeDefOcc, cloneDef, writeDefFromEdit,
  referencedDefs, prunedDefsForPayload,
} from '../src/assembly/occurrence.ts'

// ---------------------------------------------------------------- 小框架
let pass = 0, fail = 0
function test(name, fn) {
  try { const d = fn() ?? ''; pass++; console.log(`PASS ${name} ${d}`) }
  catch (e) { fail++; console.log(`FAIL ${name} — ${e instanceof Error ? e.message : e}`) }
}
function assert(c, m) { if (!c) throw new Error(m) }

// 造一件 MeshData（tag 令我可以查引用/内容）
let _mid = 0
const mesh = (tag) => ({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], _tag: tag ?? `m${_mid++}` })
// 造 src 快照（模拟 { features, sketchSources }）
const src = (tag) => ({ features: [{ id: 'f1', type: 'extrude', _tag: tag }], sketchSources: {} })

// ═══════════════════════ 1. reconcileComponents 镜像同步 ═══════════════════════
test('reconcile：def.rev++ → 有 defId 嘅 occurrence 重镜像 mesh/src', () => {
  const m0 = mesh('v0'), s0 = src('s0')
  const def = { id: 'D1', name: 'P', bodies: [{ id: 'C1_B1', name: 'P', mesh: m0 }], mesh: m0, src: s0, rev: 0 }
  const occ = { id: 'C1', name: 'P', mesh: m0, pos: [0, 0, 0], defId: 'D1', _rev: 0, src: s0 }
  // 已同步 → reconcile 返同一引用
  const r0 = reconcileComponents([occ], [def])
  assert(r0[0] === occ, 'rev 相等 + mesh ref 一致 → 应返回同一引用（未变）')
  // 编辑 def：rev++、mesh/src 换新
  const m1 = mesh('v1'), s1 = src('s1')
  const def1 = { ...def, mesh: m1, src: s1, rev: 1 }
  const r1 = reconcileComponents([occ], [def1])
  assert(r1[0].mesh === m1, 'occurrence.mesh 应镜像到 def 新 mesh')
  assert(r1[0].src === s1, 'occurrence.src 应镜像到 def 新 src')
  assert(r1[0]._rev === 1, 'occurrence._rev 应追上 def.rev')
  assert(r1[0].id === 'C1' && r1[0].pos[0] === 0, 'id/pos 等 occurrence 级字段保持')
  return '(rev++ 全实例镜像换新)'
})

test('reconcile：匿名件（无 defId）原样返 — 旧行为零改', () => {
  const m = mesh(), anon = { id: 'C9', name: 'anon', mesh: m, pos: [1, 2, 3] }
  const def = { id: 'D1', name: 'P', bodies: [], mesh: mesh('x'), rev: 5 }
  const r = reconcileComponents([anon], [def])
  assert(r[0] === anon, '匿名 occurrence 必须原样返回（镜像不变量只管有 defId 者）')
  return ''
})

test('reconcile：镜像不变量铁律 — reconcile 后有 defId 者恒 occ.mesh===def.mesh', () => {
  const mA = mesh('A'), mB = mesh('B')
  const dA = { id: 'D1', name: 'A', bodies: [{ id: 'b', name: 'A', mesh: mA }], mesh: mA, rev: 3 }
  const dB = { id: 'D2', name: 'B', bodies: [{ id: 'b', name: 'B', mesh: mB }], mesh: mB, rev: 0 }
  // occurrence 引用旧 mesh/旧 rev（模拟 JSON 往返后 ref 漂移）
  const occs = [
    { id: 'C1', name: 'A', mesh: mesh('stale'), pos: [0, 0, 0], defId: 'D1', _rev: 0 },
    { id: 'C2', name: 'A2', mesh: mesh('stale2'), pos: [5, 0, 0], defId: 'D1', _rev: 0 },
    { id: 'C3', name: 'B', mesh: mesh('stale3'), pos: [0, 0, 0], defId: 'D2', _rev: 0 },
  ]
  const r = reconcileComponents(occs, [dA, dB])
  for (const c of r) {
    const d = [dA, dB].find((x) => x.id === c.defId)
    assert(c.mesh === d.mesh, `镜像不变量：${c.id}.mesh 必须 === def(${c.defId}).mesh`)
  }
  return '(3 实例全部镜像一致)'
})

// ═══════════════════════ 2. migrateComponentDefs 旧档兼容 ═══════════════════════
test('migrate：旧档（无 componentDefs）→ 每件合成匿名 def「D_<id>」，mesh/src 移入', () => {
  const m1 = mesh('a'), m2 = mesh('b'), s1 = src('sa')
  const oldComps = [
    { id: 'C1', name: '件1', mesh: m1, pos: [0, 0, 0], src: s1 },   // 参数化件（有 src）
    { id: 'C2', name: '件2', mesh: m2, pos: [130, 0, 0], color: '#abc' },  // 导入件（无 src）
  ]
  const { components, componentDefs } = migrateComponentDefs(undefined, oldComps)
  assert(componentDefs.length === 2, '应合成 2 个匿名 def')
  // 新方案：def id 用位置索引前缀『D_<i>_<compId>』（唔靠 c.id）→ 严格 1:1，防同 id/缺 id 塌到同一 def
  const d1 = componentDefs.find((d) => d.id === 'D_0_C1'), d2 = componentDefs.find((d) => d.id === 'D_1_C2')
  assert(d1 && d2, 'def id 应为 D_0_C1 / D_1_C2（位置索引前缀）')
  assert(d1.mesh === m1 && d1.src === s1, 'D_0_C1 应承接 C1 的 mesh + src')
  assert(d1.bodies.length === 1 && d1.bodies[0].mesh === m1, 'bodies[0] = 原 mesh')
  assert(d2.src === undefined, '导入件无 src → def 无 src')
  const c1 = components.find((c) => c.id === 'C1'), c2 = components.find((c) => c.id === 'C2')
  assert(c1.defId === 'D_0_C1' && c1._rev === 0, 'occurrence 应指向合成 def')
  assert(c1.mesh === m1, '镜像不变量：迁移后 occ.mesh===def.mesh')
  assert(c2.color === '#abc', 'occurrence 级字段（color）保留')
  return '(旧档 → 匿名 def)'
})

test('migrate：幂等 — 旧档迁移跑两次结果一致（def id 确定、mesh 稳定）', () => {
  const m = mesh('x'), old = [{ id: 'C1', name: 'P', mesh: m, pos: [0, 0, 0] }]
  const r1 = migrateComponentDefs(undefined, old)
  // 第二次：用 r1 的产物当「已迁移状态」的序列化（有 componentDefs）再走一遍
  const r2 = migrateComponentDefs(r1.componentDefs, r1.components)
  assert(r2.componentDefs.length === 1 && r2.componentDefs[0].id === 'D_0_C1', '第二遍 def id 不变')
  assert(r2.components[0].defId === 'D_0_C1', '第二遍 occurrence defId 不变')
  assert(r2.components[0].mesh === r1.componentDefs[0].mesh, '第二遍镜像仍一致')
  // 再把 r1 当【旧档】（假装没带 defs）重迁移 → D_0_C1 相同（位置索引稳定 → 幂等键）
  const r3 = migrateComponentDefs(undefined, r1.components)
  assert(r3.componentDefs[0].id === 'D_0_C1', '当旧档重迁移仍得 D_0_C1（位置索引幂等）')
  return '(幂等)'
})

test('migrate：新档（有 componentDefs）→ 载 defs + reconcile（JSON 往返 ref 漂移自愈）', () => {
  const m = mesh('v'), s = src('s')
  const def = { id: 'D1', name: 'P', bodies: [{ id: 'b', name: 'P', mesh: m }], mesh: m, src: s, rev: 2 }
  const occ = { id: 'C1', name: 'P', mesh: m, pos: [0, 0, 0], defId: 'D1', _rev: 2, src: s }
  // 模拟 JSON 往返：def 与 occ 的 mesh 变成不同对象（结构相同、引用不同）
  const j = JSON.parse(JSON.stringify({ components: [occ], componentDefs: [def] }))
  assert(j.components[0].mesh !== j.componentDefs[0].mesh, '（前提）JSON 往返后两 mesh 引用不同')
  const { components, componentDefs } = migrateComponentDefs(j.componentDefs, j.components)
  assert(components[0].mesh === componentDefs[0].mesh, 'reconcile 应把 occ.mesh 重指向 def.mesh（自愈 ref 一致）')
  return '(新档 reconcile 自愈)'
})

// ═══════════════════════ 3. makeDefOcc 建 def+occurrence ═══════════════════════
test('makeDefOcc：建 def+occurrence，镜像不变量 occ.mesh===def.mesh', () => {
  const m = mesh('v'), s = src('s')
  const { def, occ } = makeDefOcc([], 'C1', '组件1', m, [10, 0, 0], { color: '#f00', src: s })
  assert(def.id === 'D1', '首个 def id = D1')
  assert(occ.defId === 'D1' && occ._rev === 0, 'occ 指向新 def')
  assert(occ.mesh === def.mesh && occ.mesh === m, '镜像不变量：occ.mesh===def.mesh===传入 mesh')
  assert(occ.src === def.src && occ.src === s, 'occ.src===def.src')
  assert(occ.color === '#f00' && occ.pos[0] === 10, 'occurrence 级 color/pos 正确')
  assert(def.bodies.length === 1 && def.bodies[0].mesh === m, 'bodies[0] = mesh')
  // 无 src（导入件）
  const r2 = makeDefOcc([def], 'C2', '导入', mesh('w'), [0, 0, 0], { color: '#0f0' })
  assert(r2.def.id === 'D2', '第二个 def id = D2（避开 D1）')
  assert(r2.occ.src === undefined && r2.def.src === undefined, '无 src 时 def/occ 均无 src')
  // 批量 defIdOffset
  const a = makeDefOcc([def], 'C3', 'a', mesh(), [0, 0, 0], { defIdOffset: 0 })
  const b = makeDefOcc([def], 'C4', 'b', mesh(), [0, 0, 0], { defIdOffset: 1 })
  assert(a.def.id === 'D2' && b.def.id === 'D3', '批量 offset → D2/D3 唔撞')
  return '(def+occ 镜像一致)'
})

// ═══════════════════════ 4. Copy 共享 / Paste-New 独立 ═══════════════════════
test('Copy：spread occurrence → 共享 defId；改 def → 两实例齐跟新', () => {
  const m0 = mesh('v0'), s0 = src('s0')
  const { def, occ } = makeDefOcc([], 'C1', 'P', m0, [0, 0, 0], { src: s0 })
  // duplicateComponent 的 spread（保留 defId/_rev/mesh/src）
  const copy = { ...occ, id: 'C2', name: 'P副本', pos: [60, 0, 0] }
  assert(copy.defId === occ.defId, 'Copy 共享同一 defId')
  let state = { components: [occ, copy], componentDefs: [def] }
  // 编辑 def（finishComponentEdit 核心）
  const m1 = mesh('v1'), s1 = src('s1')
  const newDef = writeDefFromEdit(def, m1, s1, 'C1_B1')
  const defs2 = state.componentDefs.map((d) => (d.id === def.id ? newDef : d))
  const comps2 = reconcileComponents(state.components, defs2)
  const c1 = comps2.find((c) => c.id === 'C1'), c2 = comps2.find((c) => c.id === 'C2')
  assert(c1.mesh === m1 && c2.mesh === m1, '改一个零件 → 全部共享实例 mesh 换新')
  assert(c1.src === s1 && c2.src === s1, '共享实例 src 亦一齐换新')
  assert(newDef.rev === 1, 'def.rev 应 +1')
  return '(edit-one-update-all)'
})

test('Paste-New：cloneDef → 独立新 defId；改任一唔影响对方', () => {
  const m0 = mesh('v0'), s0 = src('s0')
  const { def, occ } = makeDefOcc([], 'C1', 'P', m0, [0, 0, 0], { src: s0 })
  // independentizeComponent 核心：cloneDef 出新 def，新 occ 指向它
  const newDef = cloneDef([def], def)
  assert(newDef.id !== def.id, 'cloneDef 产生新 defId')
  assert(newDef.rev === 0 && newDef.mesh === def.mesh, '克隆初始 rev0，mesh 共享 ref（不可变）')
  const occ2 = { ...occ, id: 'C2', name: 'P副本', defId: newDef.id, _rev: 0, mesh: newDef.mesh }
  let comps = [occ, occ2], defs = [def, newDef]
  // 编辑【原 def】→ 只有 C1 跟；C2（独立 def）不变
  const m1 = mesh('v1')
  const editedOrig = writeDefFromEdit(def, m1, src('s1'), 'C1_B1')
  defs = defs.map((d) => (d.id === def.id ? editedOrig : d))
  comps = reconcileComponents(comps, defs)
  const c1 = comps.find((c) => c.id === 'C1'), c2 = comps.find((c) => c.id === 'C2')
  assert(c1.mesh === m1, '编辑原 def → C1 跟新')
  assert(c2.mesh === m0, '独立 def 的 C2 不受影响（仍旧 mesh）')
  // 反向：编辑【新 def】→ 只有 C2 跟；C1 不变
  const m2 = mesh('v2')
  const editedNew = writeDefFromEdit(newDef, m2, src('s2'), 'C2_B1')
  defs = defs.map((d) => (d.id === newDef.id ? editedNew : d))
  comps = reconcileComponents(comps, defs)
  const c1b = comps.find((c) => c.id === 'C1'), c2b = comps.find((c) => c.id === 'C2')
  assert(c2b.mesh === m2, '编辑新 def → C2 跟新')
  assert(c1b.mesh === m1, 'C1 不受新 def 影响（互相独立）')
  return '(独立化互不影响)'
})

// ═══════════════════════ 5. 镜像件 = 独立 def（几何不同不共享） ═══════════════════════
test('mirror：反射几何建独立 def，不共享源 def', () => {
  const m0 = mesh('v0')
  const { def, occ } = makeDefOcc([], 'C1', 'P', m0, [0, 0, 0])
  // mirrorComponent 核心：新独立 def（反射 mesh），occ 弃 src
  const rmesh = mesh('reflected')
  const mdef = { id: nextDefId([def]), name: 'P 镜像', bodies: [{ id: 'M2_B1', name: 'P 镜像', mesh: rmesh }], mesh: rmesh, rev: 0 }
  const mocc = { ...occ, id: 'M2', name: 'P 镜像', mesh: rmesh, pos: [0, 0, 0], defId: mdef.id, _rev: 0, src: undefined }
  assert(mdef.id !== def.id, '镜像件用独立 defId')
  assert(mocc.mesh === mdef.mesh && mocc.mesh !== def.mesh, '镜像 occ 指向独立 def 的反射 mesh，不共享源')
  // 编辑源 def 不影响镜像件
  const edited = writeDefFromEdit(def, mesh('v1'), src('s1'), 'C1_B1')
  const comps = reconcileComponents([occ, mocc], [edited, mdef])
  assert(comps.find((c) => c.id === 'M2').mesh === rmesh, '编辑源 def → 镜像件不变（独立）')
  return ''
})

// ═══════════════════════ 6. docSnap round-trip 含 componentDefs ═══════════════════════
test('docSnap round-trip：含 componentDefs → JSON 往返后 migrate 重建镜像一致', () => {
  const m = mesh('v'), s = src('s')
  const { def, occ } = makeDefOcc([], 'C1', 'P', m, [0, 0, 0], { src: s })
  // 模拟 docSnap（含 componentDefs）→ 存档 → 载入
  const snap = { components: [occ], componentDefs: [def] }
  const round = JSON.parse(JSON.stringify(snap))
  const { components, componentDefs } = migrateComponentDefs(round.componentDefs, round.components)
  assert(componentDefs.length === 1, 'componentDefs 往返保留')
  assert(components[0].mesh === componentDefs[0].mesh, '镜像不变量：往返 + migrate 后 occ.mesh===def.mesh')
  assert(JSON.stringify(components[0].mesh.vertices) === JSON.stringify(m.vertices), 'mesh 内容一致')
  return '(undo/存档 componentDefs 一并保存)'
})

// ═══════════════════════ 7. payload version 3 + 新 reader migrate 路径 ═══════════════════════
// 注：R2 fix ①a 后，真 buildProjectPayload 会【剥】def-linked occ.mesh（见测试 11 覆盖真路径）——
// webcad 系单一 web app（唯一 reader 永远最新版），已放弃「旧 reader 读 occ.mesh」兼容，改由新 reader reconcile 重建。
test('payload：version 3 + 新 reader migrate/reconcile 成功（唯一 reader 路径）', () => {
  const m = mesh('v'), s = src('s')
  const { def, occ } = makeDefOcc([], 'C1', 'P', m, [0, 0, 0], { src: s })
  const payload = { app: 'webcad', version: 3, components: [occ], componentDefs: [def] }
  const j = JSON.parse(JSON.stringify(payload))
  assert(j.version === 3, 'version → 3')
  // 新 reader：识 componentDefs → migrate reconcile → occ.mesh 镜像 def.mesh
  const { components, componentDefs } = migrateComponentDefs(j.componentDefs, j.components)
  assert(components[0].mesh === componentDefs[0].mesh, '新 reader：migrate 后镜像不变量成立')
  assert(JSON.stringify(components[0].mesh.triangles) === JSON.stringify(m.triangles), '几何内容一致')
  return '(新 reader 路径)'
})

test('payload：序列化省略 def.bodies → 载入时 migrate 重建 bodies[0]（避第三份 mesh）', () => {
  const m = mesh('v'), s = src('s')
  const { def, occ } = makeDefOcc([], 'C1', 'P', m, [0, 0, 0], { src: s })
  // buildProjectPayload 的 componentDefs.map：省略 bodies
  const slimDef = { id: def.id, name: def.name, mesh: def.mesh, rev: def.rev, ...(def.src ? { src: def.src } : {}) }
  assert(slimDef.bodies === undefined, '（前提）序列化 def 无 bodies')
  const j = JSON.parse(JSON.stringify({ components: [occ], componentDefs: [slimDef] }))
  const { components, componentDefs } = migrateComponentDefs(j.componentDefs, j.components)
  assert(Array.isArray(componentDefs[0].bodies) && componentDefs[0].bodies.length === 1, 'migrate 重建 bodies[0]')
  assert(componentDefs[0].bodies[0].mesh === componentDefs[0].mesh, '重建 body.mesh === def.mesh')
  assert(components[0].mesh === componentDefs[0].mesh, '镜像不变量仍成立')
  return '(bodies 重建)'
})

// ═══════════════════════ 8. nextDefId 命名空间 ═══════════════════════
test('nextDefId：跳过匿名「D_<id>」命名空间，只数纯数字 D<n>', () => {
  // 混合：数字 def + 匿名迁移 def
  const defs = [{ id: 'D1' }, { id: 'D_C1' }, { id: 'D3' }, { id: 'D_C99' }]
  assert(nextDefId(defs) === 'D4', 'D_C1/D_C99（parseInt=NaN）被跳过，max 数字=D3 → D4')
  assert(nextDefId([]) === 'D1', '空 → D1')
  assert(nextDefId([{ id: 'D_C1' }, { id: 'D_C2' }]) === 'D1', '全匿名 → D1（唔撞 D_C*）')
  assert(nextDefId([{ id: 'D5' }], 2) === 'D8', 'offset 生效（批量导入）')
  return ''
})

// ═══════════════════════ 9. [R2 fix ②] 迁移严格 1 def:1 occurrence（含重复/缺失 component id） ═══════════════════════
test('migrate 唯一 def id：两个【同 id】旧组件 → 2 个不同 def，各持自身 mesh（防塌缩换 mesh）', () => {
  const mA = mesh('A'), mB = mesh('B')
  // 旧档腐败/手砌：两件都叫 C1（pre-R2 各持独立 mesh）。旧方案 'D_'+c.id 会令两者都 D_C1 → 塌到同一 def、静默换 mesh。
  const bad = [
    { id: 'C1', name: '甲', mesh: mA, pos: [0, 0, 0] },
    { id: 'C1', name: '乙', mesh: mB, pos: [10, 0, 0] },
  ]
  const { components, componentDefs } = migrateComponentDefs(undefined, bad)
  assert(componentDefs.length === 2, '两个同 id 组件 → 必须合成 2 个不同 def（唔可塌缩成 1）')
  assert(componentDefs[0].id !== componentDefs[1].id, 'def id 必须互不相同')
  assert(components[0].defId !== components[1].defId, '两 occurrence 指向不同 def')
  assert(components[0].mesh === mA, '甲 保留自身 mesh A')
  assert(components[1].mesh === mB, '乙 保留自身 mesh B（唔被换成 A）')
  return '(同 id 唔塌缩)'
})

test('migrate 唯一 def id：【缺 id】旧组件 → 补唯一 component id + 各自独立 def', () => {
  const m0 = mesh('0'), m1 = mesh('1'), m2 = mesh('2')
  const noId = [
    { name: '无 id 甲', mesh: m0, pos: [0, 0, 0] },      // 缺 id
    { name: '无 id 乙', mesh: m1, pos: [5, 0, 0] },      // 缺 id
    { id: 'C7', name: '有 id', mesh: m2, pos: [9, 0, 0] },
  ]
  const { components, componentDefs } = migrateComponentDefs(undefined, noId)
  assert(componentDefs.length === 3, '3 件 → 3 个 def')
  const ids = new Set(componentDefs.map((d) => d.id))
  assert(ids.size === 3, 'def id 全唯一（缺 id 唔可撞）')
  const cids = new Set(components.map((c) => c.id))
  assert(cids.size === 3 && [...cids].every((x) => typeof x === 'string' && x), '每个 occurrence 都有唯一非空 id（缺 id 已补）')
  assert(components[0].mesh === m0 && components[1].mesh === m1 && components[2].mesh === m2, '各件保留自身 mesh')
  return '(缺 id 补唯一)'
})

// ═══════════════════════ 10. [R2 fix ①b] referencedDefs 孤儿 def 剪枝 ═══════════════════════
test('referencedDefs：只留被 occurrence 引用嘅 def（detach/delete 后孤儿 def 剔走）', () => {
  const dLive = { id: 'D1', name: 'live', bodies: [], mesh: mesh('live'), rev: 0 }
  const dOrphan = { id: 'D2', name: 'orphan', bodies: [], mesh: mesh('orphan'), rev: 0 }
  const comps = [
    { id: 'C1', name: 'a', mesh: mesh('a'), pos: [0, 0, 0], defId: 'D1' },   // 引用 D1
    { id: 'C2', name: 'b', mesh: mesh('b'), pos: [0, 0, 0] },                // detach 后无 defId
  ]
  const kept = referencedDefs(comps, [dLive, dOrphan])
  assert(kept.length === 1 && kept[0].id === 'D1', '孤儿 D2 剔走，只留被引用嘅 D1')
  // 空引用 → 全部剔走
  assert(referencedDefs([{ id: 'X', mesh: mesh(), pos: [0, 0, 0] }], [dLive, dOrphan]).length === 0, '无 defId 引用 → 全部 def 剔走')
  // 无 def → 原样返
  assert(referencedDefs(comps, []).length === 0, '空 defs 安全')
  return '(孤儿剪枝)'
})

// ═══════════════════════ 11. [R2 fix ①a] payload 剥 occ.mesh → reconcile 重建几何 byte-identical ═══════════════════════
test('payload 剥 mesh：def-linked occurrence 存出剥 mesh → 载入 reconcile 由 def.mesh 重建，几何 byte-identical', () => {
  const m0 = mesh('geo'), s0 = src('s0')
  const { def, occ } = makeDefOcc([], 'C1', 'P', m0, [3, 4, 5], { src: s0 })
  // 加一个共享同 def 嘅第二实例 + 一个孤儿 def（模拟 detach 残留）
  const occ2 = { ...occ, id: 'C2', pos: [9, 0, 0] }
  const orphan = { id: 'Dz', name: '孤儿', bodies: [{ id: 'Dz_B1', name: '孤儿', mesh: mesh('orphan') }], mesh: mesh('orphan'), rev: 0 }
  const comps = [occ, occ2], defs = [def, orphan]
  // ── buildProjectPayload 核心：prunedDefsForPayload 剥 mesh + 剪孤儿 → slim def（省 bodies）
  const { serComponents, keptDefs } = prunedDefsForPayload(comps, defs)
  assert(serComponents[0].mesh === undefined && serComponents[1].mesh === undefined, 'def-linked occurrence 的 mesh 已剥（undefined）')
  assert(keptDefs.length === 1 && keptDefs[0].id === def.id, '孤儿 def 已剪，只序列化被引用嘅 def')
  const slimDefs = keptDefs.map((d) => ({ id: d.id, name: d.name, mesh: d.mesh, rev: d.rev, ...(d.src ? { src: d.src } : {}) }))
  // ── 真存档往返（JSON）：剥 mesh 的 occ 序列化后 mesh 键消失
  const payload = { app: 'webcad', version: 3, components: serComponents, componentDefs: slimDefs }
  const round = JSON.parse(JSON.stringify(payload))
  assert(round.components[0].mesh === undefined, 'JSON 往返后 occ.mesh 键确实缺失（剥成功）')
  // ── loader 核心：migrateComponentDefs → reconcile 由 def.mesh 重建 occ.mesh
  const { components, componentDefs } = migrateComponentDefs(round.componentDefs, round.components)
  assert(components[0].mesh && components[1].mesh, 'reconcile 后两实例 mesh 都已重建（非 undefined）')
  assert(components[0].mesh === componentDefs[0].mesh, '镜像不变量：occ.mesh===def.mesh')
  // ── 几何 byte-identical（内容与原 mesh 完全一致）
  assert(JSON.stringify(components[0].mesh.vertices) === JSON.stringify(m0.vertices), 'vertices byte-identical')
  assert(JSON.stringify(components[0].mesh.triangles) === JSON.stringify(m0.triangles), 'triangles byte-identical')
  assert(JSON.stringify(components[0].mesh.normals) === JSON.stringify(m0.normals), 'normals byte-identical')
  assert(components[0].pos[0] === 3 && components[1].pos[0] === 9, 'occurrence 级 pos 各自保留')
  return '(剥 mesh 零几何丢失)'
})

test('payload 剥 mesh：匿名件（无 defId）+ 已 detach 件 → mesh 原样保留（唔剥，防丢几何）', () => {
  const mAnon = mesh('anon'), mDetach = mesh('detach')
  const comps = [
    { id: 'C1', name: '匿名', mesh: mAnon, pos: [0, 0, 0] },                        // 无 defId
    { id: 'C2', name: '已脱离', mesh: mDetach, pos: [0, 0, 0], defId: undefined },  // detach
  ]
  const { serComponents, keptDefs } = prunedDefsForPayload(comps, [])
  assert(serComponents[0].mesh === mAnon, '匿名件 mesh 保留（无 def 重建来源，绝不可剥）')
  assert(serComponents[1].mesh === mDetach, 'detach 件 mesh 保留')
  assert(keptDefs.length === 0, '无 def')
  return '(匿名/detach 保 mesh)'
})

test('payload 剥 mesh：指向【缺 mesh】def 的 occ → 唔剥（防重建来源缺失致丢几何）', () => {
  const mOcc = mesh('occ')
  const badDef = { id: 'D1', name: 'bad', bodies: [], mesh: undefined }   // def 无 mesh（腐败）
  const comps = [{ id: 'C1', name: 'x', mesh: mOcc, pos: [0, 0, 0], defId: 'D1' }]
  const { serComponents } = prunedDefsForPayload(comps, [badDef])
  assert(serComponents[0].mesh === mOcc, 'def 无 mesh → 唔剥 occ.mesh（否则载入无从重建 → 丢几何）')
  return '(缺 mesh def 唔剥)'
})

// ═══════════════════════ 12. [R2 fix ⑤] makeDefOcc body id 往返幂等 ═══════════════════════
test('body id 往返幂等：makeDefOcc body id = did+_B1 → 与 loader 重建一致（C1_B1→D1_B1 漂移已修）', () => {
  const m = mesh('v')
  const { def } = makeDefOcc([], 'C1', 'P', m, [0, 0, 0])
  assert(def.bodies[0].id === def.id + '_B1', 'makeDefOcc body id 用 did（D1_B1），唔用 occId（C1_B1）')
  // 模拟存档往返：slim def 省 bodies → loader（migrate 新档分支）重建 body id = d.id + '_B1'
  const slim = { id: def.id, name: def.name, mesh: def.mesh, rev: def.rev }
  const occ = { id: 'C1', name: 'P', mesh: m, pos: [0, 0, 0], defId: def.id, _rev: 0 }
  const round = JSON.parse(JSON.stringify({ components: [occ], componentDefs: [slim] }))
  const { componentDefs } = migrateComponentDefs(round.componentDefs, round.components)
  assert(componentDefs[0].bodies[0].id === def.bodies[0].id, '往返幂等：重建 body id 与原 body id 一致（无改名）')
  return '(body id 幂等)'
})

// ═══════════════════════ 13. [R2 fix ③] mirror occurrence id 碰撞安全（max-suffix，非 length-based） ═══════════════════════
// 复刻 store.mirrorComponent 嘅 id 逻辑（纯算术，无 app 依赖）：现存组件最大 M 数字后缀 +1，保 M 命名空间。
function mirrorNextId(components) {
  const mMax = components.reduce((m, c) => { const n = parseInt(String(c.id).replace(/^M/, ''), 10); return Number.isFinite(n) && n > m ? n : m }, 0)
  return 'M' + (mMax + 1)
}
test('mirror id：删件后重铸唔撞（max-suffix vs length-based）', () => {
  // 场景：曾有 [C1,C2] 时镜像 → M3（length 2 → M+(2+1)）。之后删 C1 → 现存 [C2, M3]（length 2）。
  const comps = [{ id: 'C2' }, { id: 'M3' }]
  // 旧 length-based：'M'+(2+1) = 'M3' → 撞已存在 M3！
  const lengthBased = 'M' + (comps.length + 1)
  assert(lengthBased === 'M3', '（前提）length-based 会重铸已存在 id M3')
  // 新 max-suffix：mMax=3 → M4，唔撞
  const nid = mirrorNextId(comps)
  assert(nid === 'M4', 'max-suffix → M4（避开现存 M3）')
  assert(!comps.some((c) => c.id === nid), '新 id 唔与任何现存组件撞')
  // 无镜像件时从 M1 起
  assert(mirrorNextId([{ id: 'C1' }, { id: 'C2' }]) === 'M1', '无 M 件 → M1')
  return '(mirror id 碰撞安全)'
})

// ═══════════════════════ 14. [R2 fix ④] 阵列/组复制 cloneDef 独立（编辑一件唔改全阵列） ═══════════════════════
// 复刻 store.arrayCloneDefFor：src 有 defId → cloneDef 出独立 def；返回覆盖到副本嘅 def 字段。
function arrayCloneDefFor(src, allDefs, newDefs) {
  if (!src.defId) return null
  const srcDef = allDefs.find((d) => d.id === src.defId)
  if (!srcDef) return null
  const nd = cloneDef([...allDefs, ...newDefs], srcDef)
  newDefs.push(nd)
  return { defId: nd.id, _rev: 0, mesh: nd.mesh }
}
test('阵列 cloneDef：每副本独立 def → 编辑源/一件唔影响其余（pre-R2 独立语义）', () => {
  const m0 = mesh('v0'), s0 = src('s0')
  const { def, occ } = makeDefOcc([], 'C1', 'P', m0, [0, 0, 0], { src: s0 })
  // arrayComponent 核心：造 2 个副本，每个 cloneDef 独立 def
  const newDefs = []
  const copyA = { ...occ, id: 'C2', name: 'P#2', ...(arrayCloneDefFor(occ, [def], newDefs) ?? {}) }
  const copyB = { ...occ, id: 'C3', name: 'P#3', ...(arrayCloneDefFor(occ, [def], newDefs) ?? {}) }
  assert(newDefs.length === 2, '2 副本 → 2 个新 def')
  const ids = new Set([def.id, copyA.defId, copyB.defId])
  assert(ids.size === 3, '源 + 两副本 defId 全不同（唔共享）')
  // 编辑源 def → 只有源实例跟新，两副本不变（独立）
  let comps = [occ, copyA, copyB], defs = [def, ...newDefs]
  const m1 = mesh('v1')
  const edited = writeDefFromEdit(def, m1, src('s1'), 'C1_B1')
  defs = defs.map((d) => (d.id === def.id ? edited : d))
  comps = reconcileComponents(comps, defs)
  assert(comps.find((c) => c.id === 'C1').mesh === m1, '编辑源 → 源实例跟新')
  assert(comps.find((c) => c.id === 'C2').mesh === m0, '副本 A 不受影响（独立 def）')
  assert(comps.find((c) => c.id === 'C3').mesh === m0, '副本 B 不受影响（独立 def）')
  // 编辑副本 A 的 def → 只有 A 跟新
  const m2 = mesh('v2')
  const editedA = writeDefFromEdit(newDefs[0], m2, src('s2'), 'C2_B1')
  defs = defs.map((d) => (d.id === newDefs[0].id ? editedA : d))
  comps = reconcileComponents(comps, defs)
  assert(comps.find((c) => c.id === 'C2').mesh === m2, '编辑副本 A → A 跟新')
  assert(comps.find((c) => c.id === 'C1').mesh === m1 && comps.find((c) => c.id === 'C3').mesh === m0, '源/副本 B 不受 A 影响')
  return '(阵列各自独立)'
})
test('阵列 cloneDef：匿名源（无 defId）→ 平铺独立副本（返 null，旧行为零改）', () => {
  const src0 = { id: 'C1', name: 'anon', mesh: mesh('a'), pos: [0, 0, 0] }  // 无 defId
  const newDefs = []
  const r = arrayCloneDefFor(src0, [], newDefs)
  assert(r === null && newDefs.length === 0, '匿名源 → 唔造 def（副本沿用 spread 独立 mesh）')
  return ''
})

// ---------------------------------------------------------------- 汇总
console.log(`\n${'='.repeat(48)}\n结果：${pass} 通过 / ${fail} 失败（共 ${pass + fail}）`)
test('B-rep edge sidecar survives clone and JSON payload round-trip', () => {
  const m = mesh('edge-sidecar')
  const edges = [{ kind: 'line', pts: [[0, 0, 0], [20, 0, 0]] }]
  const { def, occ } = makeDefOcc([], 'C1', 'Bracket', m, [0, 0, 0])
  const withEdges = { ...def, edges }
  const copied = cloneDef([withEdges], withEdges)
  assert(copied.edges === edges, 'clone must retain exact-edge sidecar')
  const { serComponents, keptDefs } = prunedDefsForPayload([occ], [withEdges])
  const wire = JSON.parse(JSON.stringify({ components: serComponents, componentDefs: keptDefs }))
  const restored = migrateComponentDefs(wire.componentDefs, wire.components)
  assert(restored.componentDefs[0].edges?.[0].kind === 'line', 'saved sidecar kind survives round-trip')
  assert(restored.componentDefs[0].edges?.[0].pts[1][0] === 20, 'saved sidecar coordinates survive round-trip')
  assert(restored.components[0].mesh === restored.componentDefs[0].mesh, 'edge payload keeps occurrence mesh reconciliation')
  return '(joint-origin true-edge reference persists)'
})

process.exit(fail ? 1 : 0)
