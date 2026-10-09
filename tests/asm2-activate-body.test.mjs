// ASM2 P1：獨立實體可「設為活動」；操作「新實體」時新建體成為活動體（之後孔／切除作用於其上）。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp } = await import('../src/store.ts')
const { treeMenuKeys, modelMenuLayout } = await import('../src/ui/contextMenus.ts')
const w = globalThis.__wheelWorker
const g = () => useApp.getState()
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
const plate = { id: 'plate', type: 'extrude', profile: { kind: 'rect', a: [-40, -30], b: [40, 30] }, height: 10, operation: 'new' }
const cylNB = { id: 'cyl', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 8 }, height: 30, baseZ: 10, operation: 'newbody' }

test('parked body menus expose 設為活動 (tree + viewport body sectors + ⋯ / double-click)', () => {
  assert.ok(treeMenuKeys('parkedBody').includes('activate'))
  assert.ok(!treeMenuKeys('activeBody').includes('activate'))
  assert.ok(modelMenuLayout('body').sectors.includes('activate'))
  const tree = read('src/components/BrowserTree.tsx')
  assert.match(tree, /設為活動/)
  assert.match(tree, /activateParkedBody\(parkedIndex/)
  assert.match(tree, /data-testid=\{`tree-body-activate-\$\{parkedIndex\}`\}/)
  assert.match(tree, /data-testid=\{`tree-body-more-\$\{parkedIndex\}`\}/)
  assert.match(tree, /fontWeight: active \? 700/)
  assert.match(read('src/store.ts'), /activateParkedBody: async/)
  assert.match(read('src/worker/cad.worker.ts'), /type: 'activatebody'/)
  assert.match(read('src/components/Timeline.tsx'), /activatebody:.*設為活動/)
})

test('operation 新實體：新建體成為活動體；舊體改獨立實體', async () => {
  const m = await w.rebuild([plate, cylNB])
  assert.deepEqual(m.failed ?? [], [], JSON.stringify(m.failed))
  assert.equal(m.parked?.length, 1)
  // 活動體 = 圓柱（bbox 約 16×16×30）；獨立實體 = 板（80×60×10）
  const vol = (mesh) => { const v = mesh.vertices; let xn=1e9,xp=-1e9,yn=1e9,yp=-1e9,zn=1e9,zp=-1e9; for (let i=0;i<v.length;i+=3){ xn=Math.min(xn,v[i]); xp=Math.max(xp,v[i]); yn=Math.min(yn,v[i+1]); yp=Math.max(yp,v[i+1]); zn=Math.min(zn,v[i+2]); zp=Math.max(zp,v[i+2]) }; return (xp-xn)*(yp-yn)*(zp-zn) }
  assert.ok(vol(m) < 20000, `active bbox ${vol(m)}`)
  assert.ok(vol(m.parked[0]) > 40000, `parked bbox ${vol(m.parked[0])}`)
})

test('activatebody swaps parked ↔ active; store activateParkedBody is undoable', async () => {
  const m0 = await w.rebuild([plate, cylNB])
  const m1 = await w.rebuild([plate, cylNB, { id: 'a1', type: 'activatebody', target: 0 }])
  assert.deepEqual(m1.failed ?? [], [])
  const vol = (mesh) => { const v = mesh.vertices; let xn=1e9,xp=-1e9,yn=1e9,yp=-1e9,zn=1e9,zp=-1e9; for (let i=0;i<v.length;i+=3){ xn=Math.min(xn,v[i]); xp=Math.max(xp,v[i]); yn=Math.min(yn,v[i+1]); yp=Math.max(yp,v[i+1]); zn=Math.min(zn,v[i+2]); zp=Math.max(zp,v[i+2]) }; return (xp-xn)*(yp-yn)*(zp-zn) }
  assert.ok(vol(m0) < 20000 && vol(m1) > 40000)
  assert.equal(m1.parked?.length, 1)
  // store path (worker already warm)
  useApp.setState({ features: [], components: [], joints: [], undoStack: [], redoStack: [], bodyMesh: null, activeBodyName: '', selectedParkedIndex: null })
  assert.equal(await g().applyFeatures([plate, cylNB], 'nb'), true)
  assert.equal(g().bodyMesh.parked.length, 1)
  const u0 = g().undoStack.length
  await g().activateParkedBody(0)
  assert.ok(vol(g().bodyMesh) > 40000)
  assert.ok(g().undoStack.length > u0)
  assert.match(g().status, /設為活動實體/)
  assert.doesNotMatch(g().status, /[喺撳嘅唔咗冇啲]/)
  await g().undo()
  assert.ok(vol(g().bodyMesh) < 20000)
})

test('cut on the active cylinder after 新實體 removes material (parked plate untouched)', async () => {
  const cut = { id: 'cut1', type: 'extrude', profile: { kind: 'circle', c: [0, 0], r: 4 }, height: 50, baseZ: 0, operation: 'cut' }
  const m = await w.rebuild([plate, cylNB, cut])
  assert.deepEqual(m.failed ?? [], [], JSON.stringify(m.failed))
  assert.equal(m.parked?.length, 1)
  const body = await w.measureBodyAt([0, 0, 20])
  assert.ok(body && body.volume > 3000 && body.volume < 5800, `cut cylinder volume ${body?.volume}`)
  const plateV = await w.measureBodyAt([30, 0, 5])
  assert.ok(plateV && plateV.volume > 40000, `parked plate still solid ${plateV?.volume}`)
})
