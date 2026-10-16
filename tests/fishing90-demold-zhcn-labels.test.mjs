/**
 * FISHING90: zhCNLabels Formal leftover — 可达性分析/可達性分析 → 脱模可达性
 * (same demold feature as F82/F83/F89; ribbon/cmd already 脱模可达性).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING90 zhCNLabels 可达性分析/可達性分析 → 脱模可达性', () => {
  const zh = read('src/i18n/zhCNLabels.ts')
  assert.match(zh, /"可达性分析":\s*"脱模可达性"/)
  assert.match(zh, /"可達性分析":\s*"脱模可达性"/)
  assert.doesNotMatch(zh, /"可达性分析":\s*"可达性分析"/)
  assert.doesNotMatch(zh, /"可達性分析":\s*"可达性分析"/)
})

test('FISHING90 F89 AeroLab + F88 App lazySafe + F86 WindTunnel kept', () => {
  const aero = read('src/components/AeroLab.tsx')
  const app = read('src/App.tsx')
  const vp = read('src/components/Viewport.tsx')
  assert.match(aero, /function aeroLabPreviewLazySafe\(/)
  assert.match(aero, /AeroLabPreviewChunkFallback/)
  assert.match(app, /function lazySafe\(/)
  assert.match(vp, /WindTunnelGpuChunkFallback/)
})

test('FISHING90 MATERIALS / DENSITY_PREF SC kept', () => {
  const st = read('src/store.ts')
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
