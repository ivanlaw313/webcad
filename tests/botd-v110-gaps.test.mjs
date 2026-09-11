// BUG-BD-1801/1802/1803 honesty gates for v1.10 BotD gaps (no browser).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const ribbon = readFileSync(join(root, 'src/ribbon.ts'), 'utf8')
const store = readFileSync(join(root, 'src/store.ts'), 'utf8')
const avail = readFileSync(join(root, 'src/cad/commandAvailability.ts'), 'utf8')
const palette = readFileSync(join(root, 'src/components/CommandPalette.tsx'), 'utf8')

assert.match(ribbon, /id: 'meshfit'/)
assert.match(ribbon, /id: 'formsubdiv'/)
assert.match(ribbon, /id: 'formbridge'/)
assert.match(ribbon, /id: 'formweld'/)
assert.match(ribbon, /id: 'formfillhole'/)
assert.match(ribbon, /id: 'formerasefill'/)
assert.match(store, /case 'meshfit':/)
assert.match(store, /case 'formsubdiv':/)
assert.match(store, /bomDialog/)
assert.match(store, /BUG-BD-1804/)
assert.match(store, /目前只有网格组件、没有活动实体/)
assert.match(avail, /formbridge/)
assert.match(avail, /formerasefill/)
assert.match(palette, /meshfit:/)
assert.match(palette, /FORM_PANELS/)
assert.match(readFileSync(join(root, 'src/version.ts'), 'utf8'), /APP_VERSION = '1\.10'/)
console.log('botd-v110-gaps: OK')
