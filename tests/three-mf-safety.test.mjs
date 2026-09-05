import assert from 'node:assert/strict'
import test from 'node:test'
import { zipSync, strToU8 } from 'fflate'
import { parse3MF, THREE_MF_MAX_ENTRIES, THREE_MF_MAX_TRIANGLES, THREE_MF_MAX_UNCOMPRESSED_BYTES } from '../src/io/threeMfImport.ts'

const bufferOf = (entries) => {
  const zip = zipSync(entries)
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength)
}

test('3MF parser rejects ZIPs with excessive entry counts before XML parsing', () => {
  const entries = { '3D/3dmodel.model': strToU8('<model/>') }
  for (let i = 0; i < THREE_MF_MAX_ENTRIES; i++) entries[`Metadata/${i}.txt`] = strToU8('x')
  assert.throws(() => parse3MF(bufferOf(entries)), /too many entries/)
})

test('3MF parser rejects a highly-compressible ZIP bomb before DOM parsing', () => {
  const huge = new Uint8Array(THREE_MF_MAX_UNCOMPRESSED_BYTES + 1)
  const input = bufferOf({ '3D/3dmodel.model': strToU8('<model/>'), 'Metadata/pad.bin': huge })
  assert.throws(() => parse3MF(input), /expands beyond/)
})

test('3MF parser rejects excessive triangle declarations before allocating geometry', () => {
  const previous = globalThis.DOMParser
  const mesh = { getElementsByTagName: (tag) => tag === 'vertex' ? { length: 0 } : tag === 'triangle' ? { length: THREE_MF_MAX_TRIANGLES + 1 } : [] }
  const object = { getAttribute: (name) => name === 'id' ? '1' : name === 'type' ? 'model' : null, getElementsByTagName: (tag) => tag === 'mesh' ? [mesh] : tag === 'vertex' || tag === 'triangle' ? mesh.getElementsByTagName(tag) : [] }
  const model = { getAttribute: () => null, getElementsByTagName: (tag) => tag === 'object' ? [object] : [] }
  globalThis.DOMParser = class { parseFromString() { return { getElementsByTagName: (tag) => tag === 'model' ? [model] : [] } } }
  try {
    assert.throws(() => parse3MF(bufferOf({ '3D/3dmodel.model': strToU8('<model/>') })), /more than/)
  } finally { globalThis.DOMParser = previous }
})
