import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const command = readFileSync(new URL('../src/components/CommandDialog.tsx', import.meta.url), 'utf8')
const insert = readFileSync(new URL('../src/components/InsertDialog.tsx', import.meta.url), 'utf8')

test('draggable command dialogs remain visible after drag or viewport resize', () => {
  assert.match(command, /ref=\{dialogRef\}/)
  assert.match(command, /aria-modal="true"/)
  assert.match(command, /maxWidth: 'calc\(100vw - 16px\)'/)
  assert.match(command, /maxHeight: 'calc\(100vh - 16px\)'/)
  assert.match(command, /window\.addEventListener\('resize', repair\)/)
  assert.match(command, /Math\.max\(8, Math\.min\(maxLeft,/)
  assert.match(command, /Math\.max\(8, Math\.min\(maxTop,/)
})

test('vector and mesh insert dialogs have modal labels, focus and keyboard commit/cancel', () => {
  assert.match(insert, /aria-label=\{`插入 \$\{v\.kind\.toUpperCase\(\)\}`\}/)
  assert.match(insert, /aria-label=\{`插入 \$\{m\.kind\.toUpperCase\(\)\}`\}/)
  assert.match(insert, /<select autoFocus value=\{v\.plane\}/)
  assert.match(insert, /<select autoFocus value=\{m\.unit\}/)
  assert.match(insert, /e\.key === 'Escape'[\s\S]*cancelInsertVec/)
  assert.match(insert, /e\.key === 'Enter'[\s\S]*confirmInsertVec/)
  assert.match(insert, /e\.key === 'Escape'[\s\S]*cancelInsertMesh/)
  assert.match(insert, /e\.key === 'Enter'[\s\S]*confirmInsertMesh/)
})
