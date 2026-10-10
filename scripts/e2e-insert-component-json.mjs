#!/usr/bin/env node
// Insert Component accepts .json and inserts as independent components (does not replace doc).
// Usage: flock /tmp/webcad-e2e.lock nice -n 19 node scripts/e2e-insert-component-json.mjs
import { readFileSync } from 'node:fs'
import { runE2E } from './e2e-harness.mjs'

const partPath = '/workspace/FILE-IO-box2.json'
const partText = readFileSync(partPath, 'utf8')

await runE2E(async (page, ok) => {
  await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    g().setLang?.('zh-HK')
    for (let t = 0; t < 200 && !(await g().applyFeatures([{ id: 'host1', type: 'prim', shape: 'box', a: 20, b: 20, c: 10, op: 'new' }], 'host')); t++) {
      await new Promise((r) => setTimeout(r, 250))
    }
  })
  const before = await page.evaluate(() => {
    const s = window.useApp.getState()
    return { feats: s.features.length, comps: s.components.length }
  })
  ok('host doc has an active body', before.feats >= 1, before)

  // Drive store API directly (same path as chooser after sniff) — proves JSON insert.
  const after = await page.evaluate(async (text) => {
    const g = () => window.useApp.getState()
    await g().insertWebcadPartJson(text, 'FILE-IO-box2')
    const s = g()
    return { feats: s.features.length, comps: s.components.length, status: s.status, names: s.components.map((c) => c.name) }
  }, partText)
  ok('JSON insert adds a component', after.comps === before.comps + 1, after)
  ok('JSON insert does not replace host features', after.feats === before.feats, after)
  ok('status is Formal TC success', /已插入 WebCAD 零件/.test(after.status) && !/This shape|STEP 匯入失敗/.test(after.status), { status: after.status })

  // Bad file → Formal TC refuse, host unchanged
  const bad = await page.evaluate(async () => {
    const g = () => window.useApp.getState()
    const comps0 = g().components.length
    await g().insertWebcadPartJson('{"foo":1}', 'bad')
    const s = g()
    return { comps: s.components.length, comps0, status: s.status }
  })
  ok('corrupt JSON refused without adding comps', bad.comps === bad.comps0 && /無法插入/.test(bad.status), bad)
  ok('no English kernel leak on refuse', !/This shape|has not type/i.test(bad.status), bad)

  // Chooser accept list
  const accept = await page.evaluate(() => {
    const inp = document.createElement('input')
    // mirror production constant via opening dialog is async; read from module by invoking open and inspecting last input — instead check ribbon tip + source via status path
    return window.useApp.getState().openStepComponentDialog ? true : false
  })
  ok('openStepComponentDialog exists', accept)

  // File chooser accept via real click
  const tip = await page.evaluate(() => {
    // Read tip from DOM title if button present
    const btn = [...document.querySelectorAll('button,[role="button"]')].find((b) => /插入組件|Insert Component/.test(b.textContent || b.getAttribute('title') || ''))
    return { title: btn?.getAttribute('title') || btn?.title || '', text: btn?.textContent?.trim() }
  })
  ok('ribbon tip mentions WebCAD JSON or STEP', /STEP|JSON|組件/.test(tip.title + tip.text), tip)

  const fc = page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null)
  await page.evaluate(() => window.useApp.getState().openStepComponentDialog())
  const chooser = await fc
  ok('插入組件 opens file chooser', !!chooser)
  if (chooser) {
    const acceptAttr = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[type=file]')]
      const last = inputs.reverse().find((el) => (el.accept || '').includes('step') || (el.accept || '').includes('json')) || inputs[inputs.length - 1]
      return last?.accept || ''
    })
    ok('chooser accept includes json and step', /\.json/.test(acceptAttr) && /\.step/.test(acceptAttr), { acceptAttr })
    await chooser.setFiles(partPath)
    await page.waitForTimeout(3000)
    const live = await page.evaluate(() => {
      const s = window.useApp.getState()
      return { comps: s.components.length, feats: s.features.length, status: s.status }
    })
    ok('chooser JSON insert grew components', live.comps >= after.comps + 1 || /已插入 WebCAD/.test(live.status), live)
    ok('chooser JSON did not wipe host features', live.feats === before.feats, live)
  }
})
