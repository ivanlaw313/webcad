/**
 * Per-browser-tab document persistence (BUG-UI-006 / UI05).
 *
 * WebCAD keeps one in-memory document per page. Historically autosave used a
 * single shared `localStorage['webcad-autosave']` (+ shared IDB `auto`
 * snapshots). Opening three CAD tabs therefore raced: the last writer won, and
 * a discarded/reloaded sibling tab restored the sibling's model/name/UI.
 *
 * sessionStorage is scoped to the tab browsing session, so each tab keeps its
 * own autosave slot. A one-shot migration claims the legacy shared key into the
 * first tab that needs it; later tabs start clean instead of cross-loading.
 */

export const LEGACY_AUTOSAVE_KEY = 'webcad-autosave'
const TAB_ID_KEY = 'webcad-tab-session-id'
const TAB_AUTOSAVE_KEY = 'webcad-tab-autosave'
const TAB_SESSION_PAYLOAD_KEY = '_tabSessionId'

function randomId(): string {
  try {
    const c = globalThis.crypto
    if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  } catch { /* ignore */ }
  return `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function getTabSessionId(): string {
  try {
    if (typeof sessionStorage !== 'undefined') {
      let id = sessionStorage.getItem(TAB_ID_KEY)
      if (!id) {
        id = randomId()
        sessionStorage.setItem(TAB_ID_KEY, id)
      }
      return id
    }
  } catch { /* ignore */ }
  // Node / non-browser: stable per-process fallback (tests).
  return 'node-tab'
}

function tabScopedLocalKey(tabId: string = getTabSessionId()): string {
  return `${LEGACY_AUTOSAVE_KEY}:${tabId}`
}

/** Raw JSON string for this tab's autosave, or null. */
export function readTabAutosaveRaw(): string | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(TAB_AUTOSAVE_KEY)
      if (raw) return raw
    }
  } catch { /* ignore */ }

  const tabId = getTabSessionId()
  try {
    if (typeof localStorage !== 'undefined') {
      const scoped = localStorage.getItem(tabScopedLocalKey(tabId))
      if (scoped) return scoped
    }
  } catch { /* ignore */ }

  // One-shot claim of the pre-isolation shared slot so a single open tab does
  // not lose work on upgrade; sibling tabs that load later see an empty slot.
  try {
    if (typeof localStorage !== 'undefined') {
      const legacy = localStorage.getItem(LEGACY_AUTOSAVE_KEY)
      if (legacy) {
        try {
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TAB_AUTOSAVE_KEY, legacy)
          else localStorage.setItem(tabScopedLocalKey(tabId), legacy)
        } catch { /* ignore quota while still returning the claimed payload */ }
        try { localStorage.removeItem(LEGACY_AUTOSAVE_KEY) } catch { /* ignore */ }
        return legacy
      }
    }
  } catch { /* ignore */ }

  return null
}

/** Persist this tab's autosave. Never writes the shared legacy key. */
export function writeTabAutosaveRaw(json: string): void {
  let wrote = false
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(TAB_AUTOSAVE_KEY, json)
      wrote = true
    }
  } catch {
    try { sessionStorage.removeItem(TAB_AUTOSAVE_KEY) } catch { /* ignore */ }
  }

  if (!wrote) {
    try {
      if (typeof localStorage === 'undefined') throw new Error('no storage')
      localStorage.setItem(tabScopedLocalKey(), json)
      wrote = true
    } catch {
      try { localStorage.removeItem(tabScopedLocalKey()) } catch { /* ignore */ }
      throw new Error('tab autosave quota')
    }
  }

  // Drop the shared key so background tabs cannot resurrect cross-contamination.
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(LEGACY_AUTOSAVE_KEY)
  } catch { /* ignore */ }
}

/** Clear only this tab's autosave (File → New). Sibling tabs stay intact. */
export function clearTabAutosave(): void {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(TAB_AUTOSAVE_KEY)
  } catch { /* ignore */ }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(tabScopedLocalKey())
      localStorage.removeItem(LEGACY_AUTOSAVE_KEY)
    }
  } catch { /* ignore */ }
}

export function tabSessionIdFromPayload(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const id = (data as Record<string, unknown>)[TAB_SESSION_PAYLOAD_KEY]
  return typeof id === 'string' && id ? id : null
}

export function withTabSessionId<T extends Record<string, unknown>>(payload: T): T & { _tabSessionId: string } {
  return { ...payload, [TAB_SESSION_PAYLOAD_KEY]: getTabSessionId() }
}

/**
 * Whether an IDB/local autosave payload belongs to this browser tab.
 * Untagged legacy snapshots may be claimed once (allowUntagged) by the first tab.
 */
const UNTAGGED_IDB_CLAIM_KEY = 'webcad-idb-auto-untagged-claimed'

/** First tab may claim a pre-isolation IDB auto snapshot; later tabs must not. */
export function canClaimUntaggedIdbAutosave(): boolean {
  try {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(UNTAGGED_IDB_CLAIM_KEY) !== '1'
  } catch {
    return true
  }
}

export function markUntaggedIdbAutosaveClaimed(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(UNTAGGED_IDB_CLAIM_KEY, '1')
  } catch { /* ignore */ }
}

export function isAutosaveForThisTab(data: unknown, opts?: { allowUntagged?: boolean }): boolean {
  const owner = tabSessionIdFromPayload(data)
  if (owner === getTabSessionId()) return true
  if (owner == null && opts?.allowUntagged) return true
  return false
}

/** Pure helper for tests: two tab stores must not clobber each other. */
export function isolateAutosaveSlots(args: {
  write: (tab: string, key: string, value: string) => void
  read: (tab: string, key: string) => string | null
  remove: (tab: string, key: string) => void
}): { save(tab: string, doc: string): void; load(tab: string): string | null; reset(tab: string): void } {
  const SESSION = TAB_AUTOSAVE_KEY
  const LEGACY = LEGACY_AUTOSAVE_KEY
  return {
    save(tab, doc) {
      args.write(tab, SESSION, doc)
      args.remove(tab, LEGACY)
    },
    load(tab) {
      const own = args.read(tab, SESSION)
      if (own != null) return own
      const legacy = args.read(tab, LEGACY)
      if (legacy == null) return null
      args.write(tab, SESSION, legacy)
      args.remove(tab, LEGACY)
      return legacy
    },
    reset(tab) {
      args.remove(tab, SESSION)
      args.remove(tab, LEGACY)
    },
  }
}
