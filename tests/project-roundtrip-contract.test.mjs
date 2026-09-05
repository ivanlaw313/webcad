// Project persistence is a release gate: every document writer must preserve the
// CAD history and every reader (file/share, named history, autosave) must hydrate it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

function action(name, next) {
  const start = store.indexOf(`  ${name}: async`)
  assert.ok(start >= 0, `${name} exists`)
  const end = store.indexOf(`  ${next}:`, start + 1)
  assert.ok(end > start, `${name} has a bounded action body`)
  return store.slice(start, end)
}

test('project payload carries the parametric workflow and visual/assembly state', () => {
  const payload = store.slice(store.indexOf('export function buildProjectPayload'), store.indexOf('// Auto-save', store.indexOf('export function buildProjectPayload')))
  for (const key of ['features', 'components', 'componentDefs', 'joints', 'motionLinks', 'mates', 'suppressedIds', 'params', 'paramBindings', 'sketchSources', 'jointOrigins', 'rigidGroups', 'contactPairs', 'planes', 'cpoints', 'caxes', 'ccurves', 'viewBookmarks', 'drawingAnno', 'groups', 'faceColors', 'decals', 'canvases']) {
    assert.match(payload, new RegExp(`\\b${key}:`), `payload includes ${key}`)
  }
})

test('all document readers hydrate the persisted project state before rebuilding features', () => {
  const readers = [
    action('applySnapshot', 'exportFlatDxf'),
    action('applyProjectData', 'shareLink'),
    action('restoreAutosave', 'newComponent'),
  ]
  for (const body of readers) {
    for (const key of ['components', 'componentDefs', 'joints', 'motionLinks', 'mates', 'suppressedIds', 'params', 'paramBindings', 'sketchSources', 'jointOrigins', 'rigidGroups', 'contactPairs', 'planes', 'cpoints', 'caxes', 'ccurves', 'viewBookmarks', 'drawingAnno', 'groups', 'faceColors', 'decals']) {
      assert.match(body, new RegExp(`\\b${key}:`), `reader hydrates ${key}`)
    }
    assert.match(body, /await get\(\)\.applyFeatures\(/, 'reader rebuilds the restored history')
  }
})

test('every project-recovery route frames the restored model so it is not mistaken for an empty document', () => {
  const readers = [
    action('applySnapshot', 'exportFlatDxf'),
    action('applyProjectData', 'shareLink'),
    action('restoreAutosave', 'newComponent'),
  ]
  for (const body of readers) assert.match(body, /get\(\)\.requestFit\(\)/, 'reader fits the recovered model into view')
})

test('a corrupt small autosave falls through to IndexedDB recovery instead of abandoning the document', () => {
  const autosave = action('restoreAutosave', 'newComponent')
  assert.match(autosave, /try \{\s+const parsed: unknown = JSON\.parse\(raw\)/)
  assert.match(autosave, /localStorage\.removeItem\('webcad-autosave'\)/)
  assert.match(autosave, /const snapshot = await loadSnapshot\(auto\.id\)/)
  assert.match(autosave, /snapshot && typeof snapshot === 'object'/)
})
