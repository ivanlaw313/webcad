import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/Viewport.tsx', import.meta.url), 'utf8')

test('KernelBody releases replaced GPU geometry for large mesh feature recomputes', () => {
  const start = source.indexOf('function KernelBody(')
  assert.ok(start >= 0, 'KernelBody must remain the active-body renderer')
  const scope = source.slice(start, source.indexOf('// 3D-print overhang highlight:', start))
  assert.match(scope, /const geom = useMemo\([\s\S]*?g\.setIndex\(mesh\.triangles\)[\s\S]*?return g[\s\S]*?\}, \[mesh, fgColors\]\)/)
  assert.match(scope, /useEffect\(\(\) => \(\) => geom\.dispose\(\), \[geom\]\)/)
})

test('high-frequency large-mesh overlays also release their GPU geometry', () => {
  for (const component of ['OverhangView', 'WallThinView', 'FaceHoverView', 'PatternPreview']) {
    const start = source.indexOf(`function ${component}(`)
    assert.ok(start >= 0, `${component} must remain a viewport renderer`)
    const scope = source.slice(start, source.indexOf('\nfunction ', start + 1))
    assert.match(scope, /useEffect\(\(\) => \(\) => geom\?\.dispose\(\), \[geom\]\)/, `${component} must dispose replaced BufferGeometry`)
  }
})
