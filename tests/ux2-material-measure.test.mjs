// UX2 #9 材質（鋼）會改外觀顏色＋活動實體行有材質下拉；#10 量圓柱面主讀數係直徑Ø（附 R、面積）。
import { register, createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url)); register('./native-car-loader.mjs', import.meta.url)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
await import('../src/worker/cad.worker.ts'); await globalThis.__wheelWorker.ready()
const { useApp, MATERIALS } = await import('../src/store.ts')
const { combineMeasure } = await import('../src/cad/measureCombine.ts')
const { treeMenuKeys } = await import('../src/ui/contextMenus.ts')
const g = () => useApp.getState()

test('#9 choosing physical material 钢 sets appearance colour; document default density unchanged (P1 B)', () => {
  useApp.setState({ ...useApp.getInitialState() }, true)
  const c0 = g().bodyColor
  const d0 = g().bodyDensity
  g().setPhysicalMaterial('钢')
  assert.equal(g().physMatName, '钢')
  assert.equal(g().bodyDensity, d0, 'document default density unchanged')
  assert.equal(g().bodyColor, MATERIALS['钢'].color)
  assert.notEqual(g().bodyColor, c0)
  assert.equal(g().material.metalness, MATERIALS['钢'].metalness)
  assert.equal(g().appearanceName, '钢')
  // appearance afterwards still overrides colour only
  g().setMaterialPreset('木'); assert.equal(g().bodyColor, MATERIALS['木'].color); assert.equal(g().bodyDensity, d0)
})
test('#9 body row has a 材質 dropdown and the right-click menu has 材質', () => {
  const tree = readFileSync(new URL('../src/components/BrowserTree.tsx', import.meta.url), 'utf8')
  assert.match(tree, /data-testid="body-material"/)
  assert.match(tree, /\{active && !editing && <BodyMaterialSelect \/>\}/)
  assert.match(tree, /case 'physmat': return tStatus\('材質（物理材質）…', lang as never\)/)
  assert.ok(treeMenuKeys('activeBody').includes('physmat'))
})
test('#10 one cylindrical face → diameter Ø (R + area kept)', () => {
  const r = combineMeasure([{ kind: 'face', area: 1000, radius: 15, surfType: 'CYLINDRE' }])
  assert.equal(r.type, 'length'); assert.equal(r.value, 30); assert.equal(r.radius, 15); assert.equal(r.area, 1000)
  assert.match(r.label, /直徑Ø/)
  const p = combineMeasure([{ kind: 'face', area: 2400, perimeter: 200 }])
  assert.equal(p.type, 'area')   // planar face unchanged
})
test('#10 kernel: measuring the cup outer wall gives R30 → Ø60', async () => {
  const w = globalThis.__wheelWorker
  const prof = { kind: 'poly', pts: [[0, 0], [30, 0], [30, 35], [40, 35], [40, 40], [0, 40]] }
  await w.rebuild([{ id: 'r', type: 'revolve', profile: prof, angle: 360, axis: 'Y', op: 'new' }])
  const r = await w.measureFaceAt([30 * Math.cos(1), 20, -30 * Math.sin(1)])
  assert.ok(r && /CYL/i.test(r.kind) && Math.abs(r.radius - 30) < 1e-3, JSON.stringify(r))
  const m = combineMeasure([{ kind: 'face', area: r.area, radius: r.radius, surfType: r.kind }])
  assert.ok(Math.abs(m.value - 60) < 1e-3)
})
