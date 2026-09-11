/**
 * BUG-UI-006 / UI05 — multi-page/tab document isolation.
 * Each browser tab must keep its own model/name without overwriting siblings
 * through the shared autosave slot that previously lived in localStorage.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LEGACY_AUTOSAVE_KEY,
  canClaimUntaggedIdbAutosave,
  clearTabAutosave,
  getTabSessionId,
  isAutosaveForThisTab,
  isolateAutosaveSlots,
  markUntaggedIdbAutosaveClaimed,
  readTabAutosaveRaw,
  tabSessionIdFromPayload,
  withTabSessionId,
  writeTabAutosaveRaw,
} from '../src/runtime/tabDocumentSession.ts'
import { readFileSync } from 'node:fs'

test('isolateAutosaveSlots: Tab C edits do not overwrite Tab A/B recovery', () => {
  /** @type {Map<string, Map<string, string>>} */
  const bags = new Map()
  const bag = (tab) => {
    if (!bags.has(tab)) bags.set(tab, new Map())
    return bags.get(tab)
  }
  const slots = isolateAutosaveSlots({
    write: (tab, key, value) => { bag(tab).set(key, value) },
    read: (tab, key) => bag(tab).get(key) ?? null,
    remove: (tab, key) => { bag(tab).delete(key) },
  })

  slots.save('A', JSON.stringify({ projectName: 'TabA', features: [{ id: 'a' }] }))
  slots.save('B', JSON.stringify({ projectName: 'TabB', features: [{ id: 'b' }] }))
  slots.save('C', JSON.stringify({ projectName: 'TabC', features: [{ id: 'c' }] }))

  assert.equal(JSON.parse(slots.load('A')).projectName, 'TabA')
  assert.equal(JSON.parse(slots.load('B')).projectName, 'TabB')
  assert.equal(JSON.parse(slots.load('C')).projectName, 'TabC')

  // Edit Tab C again — siblings must stay untouched.
  slots.save('C', JSON.stringify({ projectName: 'TabC-edited', features: [{ id: 'c2' }] }))
  assert.equal(JSON.parse(slots.load('A')).projectName, 'TabA')
  assert.equal(JSON.parse(slots.load('B')).projectName, 'TabB')
  assert.equal(JSON.parse(slots.load('C')).projectName, 'TabC-edited')

  // New on Tab A clears only A.
  slots.reset('A')
  assert.equal(slots.load('A'), null)
  assert.equal(JSON.parse(slots.load('B')).projectName, 'TabB')
  assert.equal(JSON.parse(slots.load('C')).projectName, 'TabC-edited')
})

test('legacy shared localStorage key is claimed once into the first tab session', () => {
  const store = new Map()
  const session = new Map()
  const local = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, String(v)) },
    removeItem: (k) => { store.delete(k) },
  }
  const sess = {
    getItem: (k) => session.get(k) ?? null,
    setItem: (k, v) => { session.set(k, String(v)) },
    removeItem: (k) => { session.delete(k) },
  }

  const priorLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const priorSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: sess })
  try {
    session.clear()
    store.clear()
    store.set(LEGACY_AUTOSAVE_KEY, JSON.stringify({ projectName: 'LegacyDoc', features: [1] }))

    const first = readTabAutosaveRaw()
    assert.ok(first)
    assert.equal(JSON.parse(first).projectName, 'LegacyDoc')
    assert.equal(store.has(LEGACY_AUTOSAVE_KEY), false, 'legacy shared key must be consumed')
    assert.ok(session.get('webcad-tab-autosave'), 'claimed into sessionStorage')

    // Simulate a second tab: fresh sessionStorage, same origin localStorage.
    session.clear()
    const second = readTabAutosaveRaw()
    assert.equal(second, null, 'second tab must not re-load the claimed legacy document')
  } finally {
    if (priorLocal) Object.defineProperty(globalThis, 'localStorage', priorLocal)
    else delete globalThis.localStorage
    if (priorSession) Object.defineProperty(globalThis, 'sessionStorage', priorSession)
    else delete globalThis.sessionStorage
  }
})

test('autosave payloads are tagged with the tab session id', () => {
  const priorSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  const session = new Map()
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k) => session.get(k) ?? null,
      setItem: (k, v) => { session.set(k, String(v)) },
      removeItem: (k) => { session.delete(k) },
    },
  })
  try {
    session.clear()
    const id = getTabSessionId()
    const tagged = withTabSessionId({ projectName: 'X', features: [] })
    assert.equal(tabSessionIdFromPayload(tagged), id)
    assert.equal(isAutosaveForThisTab(tagged), true)
    assert.equal(isAutosaveForThisTab({ projectName: 'other', _tabSessionId: 'someone-else' }), false)
    assert.equal(isAutosaveForThisTab({ projectName: 'legacy' }, { allowUntagged: true }), true)
    assert.equal(isAutosaveForThisTab({ projectName: 'legacy' }, { allowUntagged: false }), false)
  } finally {
    if (priorSession) Object.defineProperty(globalThis, 'sessionStorage', priorSession)
    else delete globalThis.sessionStorage
  }
})

test('write/clear tab autosave never restores the shared legacy key for siblings', () => {
  const store = new Map()
  const session = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, String(v)) },
      removeItem: (k) => { store.delete(k) },
    },
  })
  Object.defineProperty(globalThis, 'sessionStorage', {
    configurable: true,
    value: {
      getItem: (k) => session.get(k) ?? null,
      setItem: (k, v) => { session.set(k, String(v)) },
      removeItem: (k) => { session.delete(k) },
    },
  })
  try {
    store.set(LEGACY_AUTOSAVE_KEY, 'stale-shared')
    writeTabAutosaveRaw(JSON.stringify(withTabSessionId({ projectName: 'Mine', features: [] })))
    assert.equal(store.has(LEGACY_AUTOSAVE_KEY), false)
    assert.ok(session.get('webcad-tab-autosave'))
    clearTabAutosave()
    assert.equal(session.get('webcad-tab-autosave'), undefined)
    assert.equal(readTabAutosaveRaw(), null)
  } finally {
    delete globalThis.localStorage
    delete globalThis.sessionStorage
  }
})

test('untagged IDB autosave claim is one-shot across tabs', () => {
  const store = new Map()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => { store.set(k, String(v)) },
      removeItem: (k) => { store.delete(k) },
    },
  })
  try {
    assert.equal(canClaimUntaggedIdbAutosave(), true)
    markUntaggedIdbAutosaveClaimed()
    assert.equal(canClaimUntaggedIdbAutosave(), false)
  } finally {
    delete globalThis.localStorage
  }
})

test('store autosave paths use tab-scoped helpers (BUG-UI-006)', () => {
  const storeSrc = readFileSync(new URL('../src/store.ts', import.meta.url), 'utf8')
  assert.match(storeSrc, /writeTabAutosaveRaw/)
  assert.match(storeSrc, /readTabAutosaveRaw/)
  assert.match(storeSrc, /clearTabAutosave/)
  assert.match(storeSrc, /withTabSessionId/)
  assert.match(storeSrc, /isAutosaveForThisTab/)
  assert.doesNotMatch(storeSrc, /localStorage\.setItem\('webcad-autosave'/)
  assert.doesNotMatch(storeSrc, /localStorage\.getItem\('webcad-autosave'/)
})
