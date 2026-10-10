// P1 A e2e: two fillets swap → Ctrl+Z → both fillets back, feature count unchanged; refuse leaves undo.
// Usage: flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-p1-timeline-reorder-undo.mjs [--shots DIR]
import { launch } from './e2e-lib.mjs'

const { page, ok, finish, shot } = await launch({ port: 4327 })
try {
  const g = (fn) => page.evaluate(fn)
  await g(() => { window.useApp.getState().reset(); window.useApp.setState({ introOpen: false, tour: null }) })
  await page.waitForTimeout(200)

  // Build via store API (same kernel path as UI): box + two independent fillets
  const built = await g(async () => {
    const st = window.useApp.getState
    const box = { id: 'prim1', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new', cornerOrigin: true }
    await st().applyFeatures([box], 'box')
    await st().applyFeatures([...st().features, { id: 'fil1', type: 'fillet', radius: 3, nears: [[40, 0, 40]] }], 'f1')
    await st().applyFeatures([...st().features, { id: 'fil2', type: 'fillet', radius: 5, nears: [[40, 60, 40]] }], 'f2')
    return { ids: st().features.map((f) => f.id), n: st().features.length, undo: st().undoStack.length }
  })
  ok('setup: box + 2 fillets', built.n === 3 && built.ids.join() === 'prim1,fil1,fil2', built)

  const refuse = await g(async () => {
    const st = window.useApp.getState
    const u0 = st().undoStack.length
    const r = await st().reorderFeature('fil1', 0)
    return { r, undoΔ: st().undoStack.length - u0, ids: st().features.map((f) => f.id), status: st().status }
  })
  ok('refuse fillet→before prim: unchanged undo + order', refuse.r === false && refuse.undoΔ === 0 && refuse.ids.join() === 'prim1,fil1,fil2' && /不能移動/.test(refuse.status), refuse)

  const swap = await g(async () => {
    const st = window.useApp.getState
    const u0 = st().undoStack.length
    const r = await st().reorderFeature('fil2', 1)
    return { r, undoΔ: st().undoStack.length - u0, ids: st().features.map((f) => f.id), status: st().status, n: st().features.length }
  })
  ok('legal swap fil2↔fil1 = one undo step', swap.r === true && swap.undoΔ === 1 && swap.ids.join() === 'prim1,fil2,fil1' && /已上移/.test(swap.status), swap)

  // Ctrl+Z
  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control')
  await page.waitForTimeout(400)
  const afterZ = await g(() => {
    const st = window.useApp.getState()
    return { ids: st.features.map((f) => f.id), n: st.features.length, status: st.status, failed: st.failedFeatureIds.length }
  })
  ok('Ctrl+Z after swap: both fillets back, count unchanged', afterZ.n === 3 && afterZ.ids.join() === 'prim1,fil1,fil2' && afterZ.failed === 0, afterZ)
  await shot('p1a-after-undo')

  // Ctrl+Y restores swap
  await page.keyboard.down('Control'); await page.keyboard.press('KeyY'); await page.keyboard.up('Control')
  await page.waitForTimeout(400)
  const afterY = await g(() => window.useApp.getState().features.map((f) => f.id).join())
  ok('Ctrl+Y restores swapped order', afterY === 'prim1,fil2,fil1', { afterY })

  await finish()
} catch (e) { await finish(e) }
