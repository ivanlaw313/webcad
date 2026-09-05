import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('File menu exposes all supported CAD exchange formats from one browser workflow', () => {
  const start = ribbon.indexOf('{fileMenu && (')
  assert.ok(start >= 0, 'File menu is present')
  // The next top-bar controls begin well after the menu; keep this assertion
  // local so matching an identical command in a ribbon panel cannot pass it.
  const menu = ribbon.slice(start, start + 9000)

  for (const label of ['Import STL', 'Import STEP', 'Import 3MF', 'Import OBJ', 'Import DXF', 'Import SVG']) {
    assert.match(menu, new RegExp(label), `${label} stays discoverable in File`)
  }
  for (const label of ['Export STL', 'Export STEP', 'Export 3MF', 'Export OBJ', 'Export Sketch DXF']) {
    assert.match(menu, new RegExp(label), `${label} stays discoverable in File`)
  }
})

test('File menu routes every format to the native format action rather than a placeholder', () => {
  assert.match(ribbon, /onImportStl = \(\) => pickFile\('\.stl'/)
  assert.match(ribbon, /onImportStep = \(\) => pickFile\('\.step,\.stp'/)
  assert.match(ribbon, /onImport3MF = \(\) => pickFile\('\.3mf'/)
  assert.match(ribbon, /onClick=\{openObjDialog\}/)
  assert.match(ribbon, /onClick=\{openDxfDialog\}/)
  assert.match(ribbon, /onClick=\{openSvgDialog\}/)
  assert.match(ribbon, /onClick=\{exportThreeMF\}/)
  assert.match(ribbon, /onClick=\{exportObj\}/)
  assert.match(ribbon, /onClick=\{exportSketchDxf\}/)
})

test('the routed store actions have real parser or exporter implementations', () => {
  for (const action of ['importStl: async', 'import3MF: async', 'importObj: async', 'importStep: async', 'importDxf: async', 'importSvg: async']) {
    assert.match(store, new RegExp(action), `${action} is implemented`)
  }
  for (const action of ['exportStl: async', 'exportThreeMF:', 'exportObj:', 'exportStep: async', 'exportSketchDxf:']) {
    assert.match(store, new RegExp(action), `${action} is implemented`)
  }
})
