// A selected SOLID Sweep edge set is one path, not a best-effort subset.  Keep
// the store from silently omitting a disconnected edge after the user has picked it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const store = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')

test('Sweep edge-chain selection rejects a disconnected selected edge instead of dropping it', () => {
  const fn = store.slice(store.indexOf('function chainEdgePolylines'), store.indexOf('\n// T756', store.indexOf('function chainEdgePolylines')))
  assert.match(fn, /if \(bestI < 0 \|\| bestD > tol2\) return null/)
  assert.doesNotMatch(fn, /if \(bestI < 0 \|\| bestD > tol2\) break/)
})

test('Sweep commit surfaces a continuous-chain validation error', () => {
  const commit = store.slice(store.indexOf('commitSweepPath: async'), store.indexOf('if (s.sweepAxis && s.sweepAxis.startsWith', store.indexOf('commitSweepPath: async')))
  assert.match(commit, /const path3 = chainEdgePolylines\(s\.sweepEdgeLines\)/)
  assert.match(commit, /if \(!path3 \|\| path3\.length < 2\)/)
})
