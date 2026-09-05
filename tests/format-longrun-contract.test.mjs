import assert from 'node:assert/strict'
import test from 'node:test'
import { zipSync, strToU8 } from 'fflate'
import { meshToAsciiSTL, parseSTL } from '../src/io/stl.ts'
import { parseOBJ } from '../src/io/obj.ts'
import { parse3MF } from '../src/io/threeMfImport.ts'
import { shapesToDxfEntities } from '../src/io/dxfExport.ts'
import { parseDxfToProfiles } from '../src/io/dxfImport.ts'
import { parseSvgPointList } from '../src/io/svgImport.ts'

const enc = (text) => new TextEncoder().encode(text).buffer

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

function with3mfDom(model, run) {
  const previous = globalThis.DOMParser
  globalThis.DOMParser = class { parseFromString() { return { getElementsByTagName: (tag) => tag === 'model' ? [model] : [] } } }
  try {
    const zip = zipSync({ '3D/3dmodel.model': strToU8('<model/>') })
    return run(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength))
  } finally { globalThis.DOMParser = previous }
}

test('mesh and sketch exchange remains finite over repeated STL/OBJ/DXF/SVG cycles', () => {
  let mesh = { vertices: [0, 0, 0, 20, 0, 0, 0, 10, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1], triangles: [0, 1, 2] }
  for (let cycle = 0; cycle < 40; cycle++) {
    mesh = parseSTL(enc(meshToAsciiSTL(mesh, 'long-run')))
    const obj = mesh.vertices.reduce((out, value, i) => i % 3 === 0 ? `${out}v ${value}` : i % 3 === 2 ? `${out} ${value}\n` : `${out} ${value}`, '') + 'f 1 2 3\n'
    mesh = parseOBJ(obj)
    assert.equal(mesh.triangles.length, 3)
    assert.ok(mesh.vertices.every(Number.isFinite))
  }
  const dxf = shapesToDxfEntities([{ type: 'rect', a: [0, 0], b: [20, 10] }])
  for (let cycle = 0; cycle < 40; cycle++) assert.equal(parseDxfToProfiles(dxf).profiles.length, 1)
  for (let cycle = 0; cycle < 40; cycle++) assert.deepEqual(parseSvgPointList('0 0, 20 0 20,10 0 10'), [[0, 0], [20, 0], [20, 10], [0, 10]])
})

test('3MF rejects missing coordinates or triangle indices instead of silently coercing them to zero', () => {
  const vertex = (attrs) => new El('vertex', attrs)
  const mesh = (vertices, triangle) => new El('mesh', {}, [new El('vertices', {}, vertices), new El('triangles', {}, [new El('triangle', triangle)])])
  const badVertex = new El('model', {}, [new El('resources', {}, [new El('object', { id: '1', type: 'model' }, [mesh([vertex({ x: '0', y: '0', z: '0' }), vertex({ x: '1', y: '0' }), vertex({ x: '0', y: '1', z: '0' })], { v1: '0', v2: '1', v3: '2' })])]), new El('build', {}, [new El('item', { objectid: '1' })])])
  assert.throws(() => with3mfDom(badVertex, parse3MF))
  const badIndex = new El('model', {}, [new El('resources', {}, [new El('object', { id: '1', type: 'model' }, [mesh([vertex({ x: '0', y: '0', z: '0' }), vertex({ x: '1', y: '0', z: '0' }), vertex({ x: '0', y: '1', z: '0' })], { v2: '1', v3: '2' })])]), new El('build', {}, [new El('item', { objectid: '1' })])])
  assert.throws(() => with3mfDom(badIndex, parse3MF))
})
