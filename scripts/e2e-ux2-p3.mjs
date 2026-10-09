#!/usr/bin/env node
// UX2 #12 + P3 real-browser proof: 開始建模 card hides once modelling starts; chamfer kernel error reads Traditional
// in the feature editor/tree; Hole opens at Ø5; Ctrl+Z after deleting a renamed body restores the name in the tree.
// Usage: nice -n 19 node scripts/e2e-ux2-p3.mjs [--shots DIR]
import { runE2E } from './e2e-harness.mjs'

await runE2E(async (page, ok) => {
  const st = (fn, a) => page.evaluate(fn, a)
  const overlay = () => st(() => [...document.querySelectorAll('div')].some((d) => d.textContent === '開始建模' && d.offsetParent !== null))
  await st(() => window.useApp.getState().setLang?.('zh-HK'))
  await page.waitForTimeout(600)
  ok('P3 empty document shows the 「開始建模」 card', await overlay())
  const box = { id: 'b1', type: 'extrude', profile: { kind: 'rect', a: [-10, -10], b: [10, 10] }, height: 10, operation: 'new' }
  await st(async (box) => { const g = () => window.useApp.getState(); for (let t = 0; t < 200 && !(await g().applyFeatures([box], 'box')); t++) await new Promise((r) => setTimeout(r, 250)) }, box)
  await page.waitForTimeout(800)
  ok('P3 「開始建模」 card disappears once a body exists', !(await overlay()))
  // ── #12 a chamfer that fails on replay (too big) → error bar + tree tooltip in Traditional
  await st(async (box) => {
    const g = () => window.useApp.getState()
    await g().applyFeatures([box, { id: 'C1', type: 'chamfer', distance: 30, nears: [[10, 0, 10]], cmode: 'equal', chain: false }], 'x', false)
    g().selectFeature('C1')
  }, box)
  await page.waitForTimeout(800)
  const err = await st(() => ({ raw: window.useApp.getState().featureErrors.C1, bar: document.querySelector('.fe-errbar')?.textContent ?? null, tip: [...document.querySelectorAll('.tw-err')].map((e) => e.getAttribute('title')) }))
  ok('#12 chamfer kernel failure is shown in Traditional (no English) in the feature editor', !!err.bar && /倒角做唔到/.test(err.bar) && !/[A-Za-z]{4,}/.test(err.bar), err)
  ok('#12 tree 🔴 tooltip is Traditional too', err.tip.length > 0 && err.tip.every((t) => !/[A-Za-z]{4,}/.test(t)), err.tip)
  await page.shot('chamfer-err')
  // commit-time failure status
  await st(async (box) => { const g = () => window.useApp.getState(); await g().applyFeatures([box], 'box'); await g().applyFeatures([box, { id: 'C2', type: 'chamfer', distance: 30, nears: [[10, 0, 10]], cmode: 'equal', chain: false }], 'x') }, box)
  const stt = await st(() => document.body.innerText.match(/⚠[^\n]*倒角[^\n]*/)?.[0] ?? window.useApp.getState().status)
  ok('#12 failed chamfer commit says why, in Traditional', /倒角做唔到/.test(stt) && !/[A-Za-z]{4,}/.test(stt), stt)
  // ── P3 Hole default Ø5
  await st(() => window.useApp.getState().runCommand('hole')); await page.waitForTimeout(700)
  const hd = await st(() => ({ d: window.useApp.getState().holeD, inputs: [...document.querySelectorAll('input')].filter((i) => /[ØΦ直徑]/.test((i.getAttribute('aria-label') ?? '') + (i.closest('label')?.textContent ?? ''))).map((i) => i.value) }))
  ok('P3 Hole opens at Ø5', hd.d === 5 && hd.inputs.some((v) => parseFloat(v) === 5), hd)
  await page.shot('hole-default')
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
  // ── P3 rename body → delete → Ctrl+Z keeps the name in the browser tree
  await st(async () => {
    const g = () => window.useApp.getState()
    g().renameActiveBody('杯身')
    window.useApp.setState({ appConfirm: async () => true })
    await g().deleteActiveBody()
  })
  await page.waitForTimeout(800)
  const gone = await st(() => ({ n: window.useApp.getState().features.length, name: window.useApp.getState().activeBodyName }))
  await page.mouse.click(700, 450); await page.waitForTimeout(200)
  await page.keyboard.press('Control+z'); await page.waitForTimeout(1500)
  const back = await st(() => ({ n: window.useApp.getState().features.length, name: window.useApp.getState().activeBodyName, tree: document.querySelector('.tree')?.innerText ?? document.body.innerText }))
  ok('P3 Ctrl+Z after deleting 「杯身」 brings it back with its name (tree shows 杯身)', gone.n === 0 && back.n >= 1 && back.name === '杯身' && /杯身/.test(back.tree), { gone, back: { n: back.n, name: back.name, hasName: /杯身/.test(back.tree) } })
  await page.shot('undo-name')
})
