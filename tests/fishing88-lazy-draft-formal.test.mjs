/**
 * FISHING88: App panel lazySafe (F86 pattern) + draft i18n Formal 无法开模 (not 开启模).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING88 App.tsx lazySafe wraps panel chunks', () => {
  const app = read('src/App.tsx')
  assert.match(app, /function lazySafe\(/)
  assert.match(app, /typeof C === 'function'/)
  assert.match(app, /LazyChunkFallback/)
  assert.match(app, /const HelpPanelLazy = lazySafe\(/)
  assert.match(app, /const PhysicsLab = lazySafe\(/)
  assert.doesNotMatch(app, /const HelpPanelLazy = lazy\(\(\) => import/)
})

test('FISHING88 i18n draft Formal 无法开模 / 無法開模; no 开启模', () => {
  const i18n = read('src/i18n.ts')
  assert.match(i18n, /'倒扣（无法开模）'/)
  assert.match(i18n, /'倒扣（無法開模）'/)
  assert.doesNotMatch(i18n, /无法开启模/)
  assert.doesNotMatch(i18n, /倒扣 undercut/)
})

test('FISHING88 Viewport WindTunnel F86 guard + MATERIALS SC kept', () => {
  const vp = read('src/components/Viewport.tsx')
  const st = read('src/store.ts')
  assert.match(vp, /WindTunnelGpuChunkFallback/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
