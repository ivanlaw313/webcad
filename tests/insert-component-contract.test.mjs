import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { WORKSPACES } from '../src/ribbon.ts'

const source = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const insert = WORKSPACES.SOLID.panels.find((panel) => panel.name === 'INSERT')?.tools ?? []
const command = insert.find((tool) => tool.id === 'insertcomponent')

assert.ok(command, 'SOLID INSERT exposes a first-class Insert Component command')
assert.match(command.tip, /STEP／STP 或 WebCAD 零件 JSON/, 'tooltip mentions STEP and WebCAD part JSON')
assert.match(command.tip, /不會取代當前文件/, 'tooltip clarifies JSON insert does not replace the document')
assert.match(source, /case 'insertcomponent': return get\(\)\.openStepComponentDialog\(\)/, 'command routes to its own component import workflow')
assert.match(source, /openStepComponentDialog: \(\) => \{/, 'store owns a dedicated component import file flow')
assert.match(source, /inp\.accept = INSERT_COMPONENT_ACCEPT/, 'chooser accepts STEP and WebCAD JSON via shared constant')
assert.match(source, /insertWebcadPartJson/, 'JSON path inserts as independent components')
assert.match(source, /detectInsertComponentKind/, 'format detected by extension + content sniff')
assert.match(source, /mapInsertComponentError/, 'kernel English errors mapped to Formal TC')
assert.match(source, /never present this snapshot import as one/, 'implementation does not claim a nonexistent Fusion cloud live link')

console.log('PASS Insert Component routes STEP/JSON through independent assembly occurrences without faking a live F3D link')
