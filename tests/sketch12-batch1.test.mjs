// SKETCH12 batch 1（瀏覽器測試員）回歸：矩形▾/圓▾/圓弧▾ 分拆按鈕、圓重做保留約束、中心矩形 DOF、
// 相切弧自動相切 + 相切不違反驅動尺寸、圓提示為直徑、DOF 永遠顯示、原點吸附勝格點、畫折線時 Ctrl+Y。
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire, register } from 'node:module'
import { fileURLToPath } from 'node:url'
globalThis.require = createRequire(import.meta.url); globalThis.__dirname = fileURLToPath(new URL('.', import.meta.url))
register('./native-car-loader.mjs', import.meta.url)
const { SKETCH_PANELS } = await import('../src/ribbon.ts')
const { ribbonCmdLabel } = await import('../src/i18n.ts')

const create = SKETCH_PANELS.find((p) => p.name === 'CREATE').tools
const modify = SKETCH_PANELS.find((p) => p.name === 'MODIFY').tools

test('#1 sketch CREATE: Rectangle ▾ / Circle ▾ / Arc ▾ split buttons list every creation method (quick icons)', () => {
  const fam = { sk_rect: ['sk_rect', 'sk_rect3', 'sk_crect'], sk_circle: ['sk_circle', 'sk_circle2p', 'sk_circle3', 'sk_circle2t', 'sk_circle3t'], sk_arc: ['sk_arc', 'sk_arcc', 'sk_tanarc'] }
  for (const [id, kids] of Object.entries(fam)) {
    const t = create.find((x) => x.id === id)
    assert.ok(t?.quick, `${id} is a quick ribbon icon`)
    assert.deepEqual(t.quickChildren.map((c) => c.id), kids, `${id} ▾ lists ${kids}`)
    for (const k of kids) assert.ok(create.some((x) => x.id === k), `${k} also in the CREATE ▾ group menu`)
  }
  // dropdown rows are distinguishable in every language (default child is not just「圓」/「矩形」/「圓弧」)
  for (const lang of ['zh-HK', 'zh-CN', 'en', 'ja']) {
    for (const id of ['sk_rect', 'sk_circle', 'sk_arc']) {
      const labels = create.find((x) => x.id === id).quickChildren.map((c) => ribbonCmdLabel(c.id, lang, c.label))
      assert.equal(new Set(labels).size, labels.length, `${lang} ${id}: ${labels}`)
    }
  }
  assert.equal(ribbonCmdLabel('sk_circle', 'zh-HK', '圓心直徑圓'), '圓心直徑圓')
  assert.equal(ribbonCmdLabel('sk_rect', 'en', '兩點矩形'), '2-Point Rectangle')
})

test('#1 new tool tips: formal written Traditional, no Fusion mention; circle hint says diameter', () => {
  const ids = ['sk_rect', 'sk_rect3', 'sk_crect', 'sk_circle', 'sk_circle2p', 'sk_circle3', 'sk_circle2t', 'sk_circle3t', 'sk_arc', 'sk_arcc', 'sk_tanarc']
  for (const id of ids) for (const t of [create.find((x) => x.id === id), ...create.flatMap((x) => x.quickChildren ?? []).filter((x) => x.id === id)]) {
    assert.doesNotMatch(t.tip, /[撚仲係嘅唔]|Fusion/, `${id}: ${t.tip}`)
  }
  const circle = create.find((x) => x.id === 'sk_circle')
  assert.match(circle.tip, /直徑/); assert.doesNotMatch(circle.tip, /半徑/)
})

test('batch 2: Extend is a quick icon next to Trim', () => {
  const i = modify.findIndex((x) => x.id === 'sk_trim'), j = modify.findIndex((x) => x.id === 'sk_extend')
  assert.ok(modify[j].quick); assert.equal(j, i + 1)
})
