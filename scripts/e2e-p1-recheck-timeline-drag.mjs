// P1-RECHECK A real-mouse: timeline chip HTML5 drag refuse → Ctrl+Z keeps fillets;
// legal swap of independent fillets → Ctrl+Z restores both.
// Usage: flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-p1-recheck-timeline-drag.mjs [--shots DIR]
import { launch } from './e2e-lib.mjs'

const { page, ok, finish, shot } = await launch({ port: 4328 })

/** Native mouse drag between timeline chips (HTML5 DnD on draggable=true). */
async function mouseChipDrag(fromFi, toFi) {
  const src = page.locator(`.tl-chip[data-fi="${fromFi}"]`).first()
  const dst = page.locator(`.tl-chip[data-fi="${toFi}"]`).first()
  await src.waitFor({ state: 'visible', timeout: 5000 })
  await dst.waitFor({ state: 'visible', timeout: 5000 })
  const a = await src.boundingBox()
  const b = await dst.boundingBox()
  if (!a || !b) throw new Error(`chip bbox missing ${fromFi}->${toFi}`)
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await page.mouse.up()
  // settle reorderFeature / refuse
  for (let i = 0; i < 80; i++) {
    const busy = await page.evaluate(() => window.useApp.getState().busy)
    if (!busy) break
    await page.waitForTimeout(25)
  }
  await page.waitForTimeout(250)
}

try {
  const g = (fn) => page.evaluate(fn)
  await g(() => { window.useApp.getState().reset(); window.useApp.setState({ introOpen: false, tour: null }) })
  await page.waitForTimeout(200)

  const built = await g(async () => {
    const st = window.useApp.getState
    await st().applyFeatures([{ id: 'prim1', type: 'prim', shape: 'box', a: 80, b: 60, c: 40, op: 'new', cornerOrigin: true }], 'box')
    await st().applyFeatures([...st().features, { id: 'fil1', type: 'fillet', radius: 3, nears: [[40, 0, 40]] }], 'f1')
    await st().applyFeatures([...st().features, { id: 'fil2', type: 'fillet', radius: 5, nears: [[40, 60, 40]] }], 'f2')
    return { ids: st().features.map((f) => f.id), n: st().features.length, undo: st().undoStack.length }
  })
  ok('setup n=3 (prim+2 fillets)', built.n === 3 && built.ids.join() === 'prim1,fil1,fil2', built)
  await page.waitForTimeout(300)
  const chipCount = await page.locator('.tl-chip').count()
  ok('timeline chips visible', chipCount >= 3, { chipCount })

  // Illegal mouse drag: fillet fi=2 onto prim fi=0
  const beforeRefuse = await g(() => ({ n: window.useApp.getState().features.length, undo: window.useApp.getState().undoStack.length }))
  await mouseChipDrag(2, 0)
  const afterRefuse = await g(() => ({
    n: window.useApp.getState().features.length,
    ids: window.useApp.getState().features.map((f) => f.id),
    undo: window.useApp.getState().undoStack.length,
    status: window.useApp.getState().status,
  }))
  ok('mouse illegal drag refused; undo stack unchanged', /不能移動/.test(afterRefuse.status) && afterRefuse.undo === beforeRefuse.undo && afterRefuse.n === 3, { beforeRefuse, afterRefuse })
  await shot('recheck-a-refuse')

  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control')
  await page.waitForTimeout(500)
  const afterZ = await g(() => ({
    n: window.useApp.getState().features.length,
    ids: window.useApp.getState().features.map((f) => f.id),
    status: window.useApp.getState().status,
  }))
  ok('Ctrl+Z after refuse: both fillets stay (count unchanged)', afterZ.n === 3 && afterZ.ids.includes('fil1') && afterZ.ids.includes('fil2'), afterZ)
  await shot('recheck-a-z-after-refuse')

  // Legal swap: fi=2 onto fi=1
  await mouseChipDrag(2, 1)
  const afterSwap = await g(() => ({
    ids: window.useApp.getState().features.map((f) => f.id),
    status: window.useApp.getState().status,
    n: window.useApp.getState().features.length,
  }))
  ok('mouse legal swap of two independent fillets', afterSwap.n === 3 && (afterSwap.ids.join() === 'prim1,fil2,fil1' || /已上移|已下移/.test(afterSwap.status)), afterSwap)
  await shot('recheck-a-legal-swap')

  await page.keyboard.down('Control'); await page.keyboard.press('KeyZ'); await page.keyboard.up('Control')
  await page.waitForTimeout(500)
  const afterSwapZ = await g(() => ({
    ids: window.useApp.getState().features.map((f) => f.id),
    n: window.useApp.getState().features.length,
  }))
  ok('Ctrl+Z after legal swap: both fillets restored', afterSwapZ.n === 3 && afterSwapZ.ids.includes('fil1') && afterSwapZ.ids.includes('fil2'), afterSwapZ)
  await shot('recheck-a-z-after-swap')

  await finish()
} catch (e) { await finish(e) }
