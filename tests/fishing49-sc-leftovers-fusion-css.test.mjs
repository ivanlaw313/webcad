/**
 * FISHING49: Formal TC SC leftovers (measure / sketch / joint / CAM / Form) + Fusion CSS rhythm.
 * Diversify after FISHING48: residual UV Formal + marking-menu / feat-editor CSS.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const st = readFileSync(join(root, 'src/store.ts'), 'utf8')
const w = readFileSync(join(root, 'src/worker/cad.worker.ts'), 'utf8')
const vp = readFileSync(join(root, 'src/components/Viewport.tsx'), 'utf8')
const wtg = readFileSync(join(root, 'src/components/WindTunnelGpu.tsx'), 'utf8')
const css = readFileSync(join(root, 'src/index.css'), 'utf8')
const i18n = readFileSync(join(root, 'src/i18n.ts'), 'utf8')

test('FISHING49 sketch typed Formal: 豎直 / 邊長 / 掃角 / 半軸', () => {
  assert.match(st, / · \| 豎直/)
  assert.match(st, /邊長 L/)
  assert.match(st, /寬度 W/)
  assert.match(st, /掃角°/)
  assert.match(st, /長半軸 rx/)
  assert.match(st, /短半軸 ry/)
  assert.match(st, /終止角°/)
  assert.match(st, /ρ 充滿度\(0~1\)/)
  assert.doesNotMatch(st, / · \| 竖直/)
  assert.doesNotMatch(st, /'边长 L'/)
  assert.doesNotMatch(st, /'扫角°'/)
})

test('FISHING49 store: partSolid / joint / measure Formal', () => {
  assert.match(st, /partSolidRequiredPatch\('圓角'/)
  assert.match(st, /partSolidRequiredPatch\('抽殼'/)
  assert.match(st, /partSolidRequiredPatch\('面圓角'/)
  assert.doesNotMatch(st, /partSolidRequiredPatch\('圆角'/)
  assert.doesNotMatch(st, /partSolidRequiredPatch\('抽壳'/)
  assert.doesNotMatch(st, /partSolidRequiredPatch\('面圆角'/)
  assert.match(st, /revolute: '轉動'/)
  assert.match(st, /rigid: '剛性'/)
  assert.match(st, /slider: '滑動'/)
  assert.match(st, /cylindrical: '圓柱'/)
  assert.match(st, /name: 'Z 軸'/)
  assert.match(st, /name: '本體'/)
  assert.match(st, /（無回應）/)
  assert.match(st, /（無實體）/)
  assert.match(st, /closed \? '圓稜' : '弧稜'/)
  assert.match(st, /直稜：長/)
  assert.match(st, /TORUS: '環面'/)
  assert.match(st, /label: r\.closed \? '孔徑Ø' : '弧長'/)
  assert.match(st, /過孔\(間隙\)/)
  assert.doesNotMatch(st, /过孔\(间隙\)/)
})

test('FISHING49 CAM / face-mate Formal samples', () => {
  assert.match(st, /\? '輪廓' : s\.millOpts\.op === 'pocket' \? '挖槽' : s\.millOpts\.op === 'face' \? '面銑' : '鑽孔'/)
  assert.match(st, /-銑削\.gcode/)
  assert.match(st, /\? '同軸' : '貼平'\)/)
  assert.match(st, /·翻轉/)
  assert.match(st, /·間隙/)
  assert.doesNotMatch(st, /\? '轮廓'/)
  assert.doesNotMatch(st, /\? '面铣'/)
})

test('FISHING49 worker / Viewport / WindTunnel Formal', () => {
  assert.match(w, /applyTargetDeltas\(f\.targets, \[mirrorOf\], '鏡像'\)/)
  assert.match(w, /: '該面'/)
  assert.doesNotMatch(w, /, '镜像'\)/)
  assert.doesNotMatch(w, /: '该面'/)
  assert.match(vp, /tStatus\('點', lang\)/)
  assert.match(vp, /tStatus\('縮', lang\)/)
  assert.match(vp, /tStatus\('點）', lang\)/)
  assert.match(wtg, / 個樣本）/)
  assert.doesNotMatch(wtg, / 个样本）/)
})

test('FISHING49 MATERIALS keys stay SC (storage ids)', () => {
  assert.match(st, /DENSITY_PREF = \['钢', '铝', '黄铜'/)
  assert.match(st, /material: '钢'/)
  assert.doesNotMatch(st, /DENSITY_PREF = \['鋼'/)
})

test('FISHING49 Fusion CSS: marking-menu / feat-editor / cs-btn rhythm', () => {
  assert.match(css, /FISHING49: Fusion-like marking-menu \/ feat-editor \/ toast \/ mill-chrome rhythm/)
  assert.match(css, /\.mm-label \{ letter-spacing: 0\.01em; line-height: 1\.15; \}/)
  assert.match(css, /\.feat-editor \.fe-title \{ letter-spacing: 0\.02em; \}/)
  assert.match(css, /\.cs-btn \{ min-height: 26px; border-radius: 5px; letter-spacing: 0\.01em; \}/)
})

test('FISHING49 i18n TC aliases', () => {
  assert.match(i18n, /FISHING49 Formal TC measure \/ sketch \/ joint \/ Form chrome/)
  assert.match(i18n, /'豎直': 'vertical'/)
  assert.match(i18n, /'圓稜': 'Circular edge'/)
  assert.match(i18n, /'點）': 'pts\)'/)
})

test('FISHING48 CSS + harden regressions still on tip', () => {
  assert.match(css, /FISHING48: Fusion-like browser-tree \/ dialog \/ timeline rhythm/)
  assert.match(st, /所有稜邊/)
  assert.doesNotMatch(st, /所有棱边/)
})
