/**
 * FISHING89: AeroLabPreview lazy must guard missing .default (F86/F88 pattern).
 * Optional: i18n 可达性分析/可達性分析 EN → Demold Accessibility.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')

test('FISHING89 AeroLabPreview uses guarded lazy (no bare import)', () => {
  const aero = read('src/components/AeroLab.tsx')
  assert.match(aero, /function aeroLabPreviewLazySafe\(/)
  assert.match(aero, /typeof C === 'function'/)
  assert.match(aero, /AeroLabPreviewChunkFallback/)
  assert.match(aero, /const AeroLabPreview = aeroLabPreviewLazySafe\(\(\) => import\('\.\/AeroLabPreview'\)\)/)
  assert.doesNotMatch(aero, /const AeroLabPreview = lazy\(\(\) => import\('\.\/AeroLabPreview'\)\)/)
})

test('FISHING89 i18n 可达性分析/可達性分析 EN = Demold Accessibility', () => {
  const i18n = read('src/i18n.ts')
  assert.match(i18n, /'可达性分析': 'Demold Accessibility'/)
  assert.match(i18n, /'可達性分析': 'Demold Accessibility'/)
  assert.doesNotMatch(i18n, /'可达性分析': 'Accessibility Analysis'/)
  assert.doesNotMatch(i18n, /'可達性分析': 'Accessibility Analysis'/)
})

test('FISHING89 App lazySafe + WindTunnel F86 + MATERIALS SC kept', () => {
  const app = read('src/App.tsx')
  const vp = read('src/components/Viewport.tsx')
  const st = read('src/store.ts')
  assert.match(app, /function lazySafe\(/)
  assert.match(vp, /WindTunnelGpuChunkFallback/)
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
})
