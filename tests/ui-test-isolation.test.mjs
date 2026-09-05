import test from 'node:test'
import assert from 'node:assert/strict'
import { documentPersistenceEnabled, isUiTestIsolation } from '../src/runtime/uiTestIsolation.ts'

test('ui-test URL keeps the document in memory only', () => {
  assert.equal(isUiTestIsolation('?ui-test=1'), true)
  assert.equal(documentPersistenceEnabled('?ui-test=1'), false)
  assert.equal(isUiTestIsolation('?ui-test=0'), false)
  assert.equal(documentPersistenceEnabled('?x=1'), true)
})
