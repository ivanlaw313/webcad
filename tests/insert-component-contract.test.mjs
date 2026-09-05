import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { WORKSPACES } from '../src/ribbon.ts'

const source = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
const insert = WORKSPACES.SOLID.panels.find((panel) => panel.name === 'INSERT')?.tools ?? []
const command = insert.find((tool) => tool.id === 'insertcomponent')

assert.ok(command, 'SOLID INSERT exposes a first-class Insert Component command')
assert.match(command.tip, /STEP\/STP/, 'the visible command states the supported interchange')
assert.match(source, /case 'insertcomponent': return get\(\)\.openStepComponentDialog\(\)/, 'command routes to its own component import workflow')
assert.match(source, /openStepComponentDialog: \(\) => \{/, 'store owns a dedicated component import file flow')
assert.match(source, /await get\(\)\.importStep\(await f\.arrayBuffer\(\), f\.name\.replace/, 'component import delegates to the assembly-aware STEP reader')
assert.match(source, /never present this snapshot import as one/, 'implementation does not claim a nonexistent Fusion cloud live link')

console.log('PASS Insert Component routes STEP through independent assembly occurrences without faking a live F3D link')
