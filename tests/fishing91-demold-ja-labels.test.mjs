/**
 * FISHING91: jaLabels Formal leftover — 可达性分析/可達性分析 → 離型到達性
 * (JA demold accessibility; trail F82–F90 SC/EN/zhCN).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING91 jaLabels 可达性分析/可達性分析 → 離型到達性', () => {
  const ja = read('src/i18n/jaLabels.ts')
  assert.match(ja, /"可达性分析":\s*"離型到達性"/)
  assert.match(ja, /"可達性分析":\s*"離型到達性"/)
  assert.doesNotMatch(ja, /"可达性分析":\s*"アクセス解析"/)
  assert.doesNotMatch(ja, /"可達性分析":\s*"アクセス解析"/)
})

test('FISHING91 F90 zhCN 脱模可达性 + F89 AeroLab + MATERIALS kept', () => {
  const zh = read('src/i18n/zhCNLabels.ts')
  const aero = read('src/components/AeroLab.tsx')
  const st = read('src/store.ts')
  assert.match(zh, /"可达性分析":\s*"脱模可达性"/)
  assert.match(aero, /function aeroLabPreviewLazySafe\(/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})

test('FISHING91 F88 App lazySafe + F86 WindTunnel kept', () => {
  const app = read('src/App.tsx')
  const vp = read('src/components/Viewport.tsx')
  assert.match(app, /function lazySafe\(/)
  assert.match(vp, /WindTunnelGpuChunkFallback/)
})
