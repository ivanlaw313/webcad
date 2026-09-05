import assert from 'node:assert/strict'
import test from 'node:test'
import { zipSync, strToU8 } from 'fflate'
import { parse3MF } from '../src/io/threeMfImport.ts'
import { parseSvgPointList } from '../src/io/svgImport.ts'

class El {
  constructor(tag, attrs = {}, children = []) { this.tag = tag; this.attrs = attrs; this.children = children }
  getAttribute(name) { return this.attrs[name] ?? null }
  getElementsByTagName(tag) {
    const out = []
    const visit = (node) => { for (const child of node.children) { if (child.tag === tag) out.push(child); visit(child) } }
    visit(this)
    return out
  }
}

test('3MF component and build material overrides survive a real ZIP parser pass', () => {
  const v = (x, y, z) => new El('vertex', { x: String(x), y: String(y), z: String(z) })
  const tri = new El('triangle', { v1: '0', v2: '1', v3: '2' })
  const mesh = new El('mesh', {}, [new El('vertices', {}, [v(0, 0, 0), v(10, 0, 0), v(0, 10, 0)]), new El('triangles', {}, [tri])])
  const leaf = new El('object', { id: '1', type: 'model', name: 'leaf' }, [mesh])
  const group = new El('object', { id: '2', type: 'model' }, [new El('components', {}, [new El('component', { objectid: '1', pid: '20', pindex: '1', transform: '1 0 0 0 1 0 0 0 1 5 0 0' })])])
  const colors = new El('m:colorgroup', { id: '20' }, [new El('m:color', { color: '#ff0000ff' }), new El('m:color', { color: '#00ff00ff' })])
  const model = new El('model', { unit: 'centimeter' }, [new El('resources', {}, [colors, leaf, group]), new El('build', {}, [new El('item', { objectid: '2' }), new El('item', { objectid: '1', pid: '20', pindex: '0' })])])
  const doc = { getElementsByTagName: (tag) => tag === 'model' ? [model] : [], querySelector: () => null }
  const previous = globalThis.DOMParser
  globalThis.DOMParser = class { parseFromString() { return doc } }
  try {
    const zipped = zipSync({ '3D/3dmodel.model': strToU8('<model/>') })
    const buf = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength)
    const result = parse3MF(buf)
    assert.equal(result.unit, 'centimeter')
    assert.equal(result.meshes.length, 2)
    assert.equal(result.meshes[0].color, '#00ff00')
    assert.equal(result.meshes[1].color, '#ff0000')
    assert.deepEqual(result.meshes[0].vertices.slice(0, 3), [50, 0, 0])
  } finally { globalThis.DOMParser = previous }
})

test('3MF Production-style external object resources resolve through root component references without duplicates', () => {
  const v = (x, y, z) => new El('vertex', { x: String(x), y: String(y), z: String(z) })
  const leafMesh = new El('mesh', {}, [new El('vertices', {}, [v(0, 0, 0), v(10, 0, 0), v(0, 10, 0)]), new El('triangles', {}, [new El('triangle', { v1: '0', v2: '1', v3: '2' })])])
  const leaf = new El('object', { id: '1', type: 'model', name: 'Bambu leaf' }, [leafMesh])
  const assembly = new El('object', { id: '2', type: 'model', name: 'Bambu root' }, [new El('components', {}, [new El('component', { objectid: '1', 'p:path': '/3D/Objects/object_1.model', transform: '1 0 0 0 1 0 0 0 1 10 0 0' })])])
  const rootModel = new El('model', { unit: 'millimeter' }, [new El('resources', {}, [assembly])])
  const leafModel = new El('model', { unit: 'millimeter' }, [new El('resources', {}, [leaf])])
  const previous = globalThis.DOMParser
  globalThis.DOMParser = class { parseFromString(xml) { return { getElementsByTagName: (tag) => tag === 'model' ? [xml.includes('external') ? leafModel : rootModel] : [], querySelector: () => null } } }
  try {
    const zipped = zipSync({ '3D/3dmodel.model': strToU8('<root/>'), '3D/Objects/object_1.model': strToU8('<external/>') })
    const result = parse3MF(zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength))
    assert.equal(result.meshes.length, 1)
    assert.equal(result.meshes[0].name, 'Bambu leaf')
    assert.equal(result.meshes[0].triangles.length, 3)
    assert.deepEqual(result.meshes[0].vertices.slice(0, 3), [10, 0, 0])
  } finally { globalThis.DOMParser = previous }
})

test('SVG point lists accept whitespace and comma separators without dropping vertices', () => {
  assert.deepEqual(parseSvgPointList('0 0 25 0 25,10 0,10'), [[0, 0], [25, 0], [25, 10], [0, 10]])
  assert.deepEqual(parseSvgPointList('1e1,-2.5 3.25 4'), [[10, -2.5], [3.25, 4]])
})
