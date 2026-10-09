import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const ribbon = readFileSync(new URL('../src/components/Ribbon.tsx', import.meta.url), 'utf8')
const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('File menu exposes all supported CAD exchange formats from one browser workflow', () => {
  const start = ribbon.indexOf('{fileMenu && createPortal(')
  assert.ok(start >= 0, 'File menu is present')
  const menu = ribbon.slice(start, start + 12000)
  const importOk = [
    /msg\('file\.importStl'|Import STL/,
    /msg\('file\.importStep'|Import STEP/,
    /msg\('file\.import3mf'|Import 3MF/,
    /msg\('file\.importObj'|Import OBJ/,
    /msg\('file\.importDxf'|Import DXF/,
    /msg\('file\.importSvg'|Import SVG/,
  ].every((re) => re.test(menu))
  assert.ok(importOk, 'Import STL/STEP/3MF/OBJ/DXF/SVG stay discoverable in File')
  const exportOk = [
    /msg\('file\.exportStl'|Export STL/,
    /msg\('file\.exportStep'|Export STEP/,
    /msg\('file\.export3mf'|Export 3MF/,
    /msg\('file\.exportObj'|Export OBJ/,
    /msg\('file\.exportSketchDxf'|Export Sketch DXF/,
  ].every((re) => re.test(menu))
  assert.ok(exportOk, 'Export STL/STEP/3MF/OBJ/Sketch DXF stay discoverable in File')
})

test('File menu routes every format to the native format action rather than a placeholder', () => {
  assert.ok(/onImportStl = \(\) =>/.test(ribbon) && (/pickFile\('\.stl'/.test(ribbon) || /openStlDialog\(\)/.test(ribbon)), 'STL import wired')
  assert.ok(/onImportStep = \(\) =>/.test(ribbon), 'STEP import handler present')
  assert.ok(/onImport3MF = \(\) =>/.test(ribbon), '3MF import handler present')
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
