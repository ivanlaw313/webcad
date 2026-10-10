import { strict as assert } from 'node:assert'
import {
  INSERT_COMPONENT_ACCEPT,
  INSERT_COMPONENT_BAD_FILE,
  INSERT_COMPONENT_EMPTY,
  INSERT_COMPONENT_STEP_FAIL,
  detectInsertComponentKind,
  mapInsertComponentError,
  bufferHeadText,
} from '../src/cad/insertComponentFile.ts'

assert.equal(INSERT_COMPONENT_ACCEPT, '.step,.stp,.json')
assert.match(INSERT_COMPONENT_BAD_FILE, /STEP／STP 或 WebCAD 零件 JSON/)
assert.match(INSERT_COMPONENT_EMPTY, /沒有可插入/)
assert.match(INSERT_COMPONENT_STEP_FAIL, /STEP／STP/)

assert.equal(detectInsertComponentKind('box.step'), 'step')
assert.equal(detectInsertComponentKind('box.STP'), 'step')
assert.equal(detectInsertComponentKind('part.json'), 'json')
assert.equal(detectInsertComponentKind('part.webcad'), 'json')
assert.equal(detectInsertComponentKind('mystery.bin', '{"app":"webcad"}'), 'json')
assert.equal(detectInsertComponentKind('mystery.bin', 'ISO-10303-21;\nHEADER;'), 'step')
assert.equal(detectInsertComponentKind('mystery.bin', 'HEADER;\nFILE_DESCRIPTION'), 'step')
assert.equal(detectInsertComponentKind('mystery.bin', 'not a cad file'), 'unknown')

const eng = mapInsertComponentError(new Error('This shape has not type, it is null'))
assert.equal(eng, INSERT_COMPONENT_BAD_FILE)
assert.doesNotMatch(eng, /This shape|null/i)
assert.equal(mapInsertComponentError(new Error('STEPCAFControl boom')), INSERT_COMPONENT_STEP_FAIL)
assert.equal(mapInsertComponentError(null), INSERT_COMPONENT_BAD_FILE)

const enc = new TextEncoder().encode('{"app":"webcad","features":[]}')
assert.match(bufferHeadText(enc.buffer), /webcad/)

console.log('PASS insert-component-json detect + Formal TC error mapping')
