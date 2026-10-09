// ASM2 #3/#4/#6/#7/#8：組件建立命名、固定入口（功能區＋右鍵）、關節滑桿焦點下 Ctrl+Z、瀏覽樹「關節」資料夾、固定提示正式繁體。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
const { useApp, isDefaultBodyName } = await import('../src/store.ts')
const { treeMenuKeys, modelMenuLayout } = await import('../src/ui/contextMenus.ts')
const { ownsTextUndo, fieldKeyOwner } = await import('../src/ui/fieldInput.ts')
const g = () => useApp.getState()
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const box = () => ({ vertices: [0, 0, 0, 1, 0, 0, 0, 1, 0], triangles: [0, 1, 2], normals: [] })
const comp = (id, name) => ({ id, name, mesh: box(), pos: [0, 0, 0], rot: [0, 0, 0], color: '#888' })

test('#3 default body names (實體N / 複製實體N / Body N) are not reused as component names; custom names are', () => {
  for (const n of ['實體1', '实体2', '複製實體3', 'Body 4', 'body5', '實體']) assert.equal(isDefaultBodyName(n), true, n)
  for (const n of ['軸', 'Shaft', '底板 A', '組件1']) assert.equal(isDefaultBodyName(n), false, n)
  assert.match(read('src/store.ts'), /const nm = !lb\.active && lb\.name && !isDefaultBodyName\(lb\.name\) \? lb\.name : '組件' \+ \(nameNo0 \+ nameK\+\+\)/)
})

test('#3 body right-click 「建立組件」: tree (active + parked) and viewport (face / body) menus', () => {
  assert.ok(treeMenuKeys('activeBody').includes('createComp'))
  assert.ok(treeMenuKeys('parkedBody').includes('createComp'))
  assert.ok(treeMenuKeys('parkedBody').includes('activate'))   // ASM2 P1
  assert.ok(modelMenuLayout('body').sectors.includes('createcomp'))
  assert.ok(modelMenuLayout('face').overflow.includes('createcomp'))
  assert.equal(typeof g().createComponentFromBody, 'function')
})

test('#3 createComponentFromBody: a non-active (parked) body while an active body exists is not frozen together with it', async () => {
  useApp.setState({ bodyMesh: { ...box(), parked: [{ name: '實體1', ...box() }] }, components: [], status: '' })
  await g().createComponentFromBody(0)
  assert.equal(g().components.length, 0)
  assert.match(g().status, /不是活動實體/)
})

test('#4 固定: on the ASSEMBLE ribbon (visible quick tool) and in component right-click menus', () => {
  assert.match(read('src/ribbon.ts'), /id: 'groundcomp', label: '固定組件', icon: 'joint', quick: true/)
  assert.ok(treeMenuKeys('component', { grounded: false }).includes('ground'))
  assert.ok(treeMenuKeys('component', { grounded: true }).includes('unground'))
  assert.ok(modelMenuLayout('component').overflow.includes('ground'))
  useApp.setState({ components: [comp('C1', '組件1'), comp('C2', '組件2')], selectedComponent: 'C1', grounded: null, undoStack: [] })
  g().runCommand('groundcomp', '固定組件')
  assert.equal(g().components[0].grounded, true)
})

test('#8 ground status is formal Traditional: 「（已固定）— 不可拖動」, no Cantonese', () => {
  useApp.setState({ components: [comp('C1', '組件1')], grounded: null })
  g().toggleComponentGround('C1')
  assert.match(g().status, /（已固定）— 不可拖動/)
  assert.doesNotMatch(g().status, /Ground|唔|嘅|佢|咗|喺|冇|啲/)
  const tree = read('src/components/BrowserTree.tsx')
  assert.doesNotMatch(tree, /（Ground）/)
  // P3: move attempt on a grounded component
  g().setComponentPos('C1', [5, 0, 0])
  assert.equal(g().status, '「組件1」（已固定）— 請先取消固定才可移動')
  assert.deepEqual(g().components[0].pos, [0, 0, 0])
})

test('#6 Ctrl+Z / Ctrl+Y with a focused slider is model undo (range has no text undo); text fields keep native undo', () => {
  const range = { tagName: 'INPUT', type: 'range' }, text = { tagName: 'INPUT', type: 'text' }, num = { tagName: 'INPUT', type: 'number' }
  assert.equal(ownsTextUndo(range), false); assert.equal(ownsTextUndo({ tagName: 'INPUT', type: 'checkbox' }), false)
  assert.equal(ownsTextUndo(text), true); assert.equal(ownsTextUndo(num), true); assert.equal(ownsTextUndo({ tagName: 'TEXTAREA' }), true)
  assert.equal(fieldKeyOwner({ key: 'z', ctrlKey: true }, range, range), 'global')
  assert.equal(fieldKeyOwner({ key: 'z', ctrlKey: true }, text, text), 'field')
  assert.equal(fieldKeyOwner({ key: 'c', ctrlKey: true }, range, range), 'field')
  assert.match(read('src/App.tsx'), /if \(\(ownsTextUndo\(t\) \|\| ownsTextUndo\(ae\)\) && \(e\.ctrlKey \|\| e\.metaKey\) && \['z', 'y'\]/)
})

test('#6 one slider gesture = one undo step; undo restores the angle', async () => {
  useApp.setState({ components: [comp('C1', '組件1'), comp('C2', '組件2')], grounded: null, joints: [{ id: 'J1', name: '關節1', type: 'revolute', parent: 'C1', child: 'C2', anchor: [0, 0, 0], axis: [0, 1, 0], angle: 0, slide: 0 }], undoStack: [], redoStack: [] })
  g().beginJointDrive(); for (const a of [5, 20, 45]) g().setJointValue('J1', { angle: a }); g().endJointDrive()
  assert.equal(g().undoStack.length, 1); assert.equal(g().joints[0].angle, 45)
  await g().undo()
  assert.equal(g().joints[0].angle, 0)
})

test('#7 joints folder: select, rename (undoable), edit focuses the panel, delete clears selection', async () => {
  useApp.setState({ components: [comp('C1', '底板'), comp('C2', '軸')], joints: [{ id: 'J1', name: '關節1', type: 'revolute', parent: 'C1', child: 'C2', anchor: [0, 0, 0], axis: [0, 1, 0], angle: 0, slide: 0 }], undoStack: [], redoStack: [], selectedJoint: null })
  g().selectJoint('J1'); assert.equal(g().selectedJoint, 'J1'); assert.match(g().status, /已選取關節「關節1」：底板 → 軸/)
  g().renameJoint('J1', '  轉軸  '); assert.equal(g().joints[0].name, '轉軸'); assert.equal(g().undoStack.length, 1)
  g().renameJoint('J1', ''); assert.equal(g().joints[0].name, '轉軸', 'blank ignored')
  await g().undo(); assert.equal(g().joints[0].name, '關節1')
  let ev = null; globalThis.window ??= globalThis; const prev = globalThis.dispatchEvent; globalThis.CustomEvent ??= class { constructor(t, o) { this.type = t; this.detail = o?.detail } }
  globalThis.dispatchEvent = (e) => { ev = e; return true }
  try { g().editJoint('J1') } finally { globalThis.dispatchEvent = prev }
  assert.equal(ev?.type, 'webcad:assembly-focus'); assert.equal(ev.detail.jointId, 'J1')
  g().removeJoint('J1'); assert.equal(g().joints.length, 0); assert.equal(g().selectedJoint, null)
  assert.deepEqual(treeMenuKeys('joint'), ['editJoint', 'rename', 'sep', 'delete'])
  const tree = read('src/components/BrowserTree.tsx')
  assert.match(tree, /msg\('tree\.joints', lang\)/); assert.match(read('src/i18n/locales/zh-HK.ts'), /"tree\.joints": "關節"/)
})

test('P3 component numbering follows existing 組件N names (no skip to 組件2 after delete/undo id gaps)', async () => {
  const { nextComponentNameNo } = await import('../src/store.ts')
  assert.equal(nextComponentNameNo([]), 1)
  assert.equal(nextComponentNameNo([{ name: '組件1' }]), 2)
  assert.equal(nextComponentNameNo([{ name: '底板' }, { name: '組件3' }]), 4)
})

test('P3 existing joint type can be changed from the panel (undoable); panel + joint tool share the chosen type', async () => {
  useApp.setState({ components: [comp('A', '組件1'), comp('B', '組件2')], joints: [{ id: 'J1', name: '關節1', type: 'revolute', parent: 'A', child: 'B', anchor: [0, 0, 0], axis: [0, 1, 0], angle: 30, slide: 0 }], undoStack: [], redoStack: [] })
  g().setJointType('J1', 'slider')
  assert.equal(g().joints[0].type, 'slider'); assert.equal(g().joints[0].angle, 0)
  assert.match(g().status, /類型由「旋轉」改為「滑動」/)
  await g().undo()
  assert.equal(g().joints[0].type, 'revolute'); assert.equal(g().joints[0].angle, 30)
  const panel = read('src/components/JointsPanel.tsx')
  assert.match(panel, /data-testid=\{`jp-type-\$\{j\.id\}`\}/)
  assert.match(panel, /useApp\(\(s\) => s\.jointTypePref\)/)
  assert.equal(g().jointTypePref, 'revolute')
})
