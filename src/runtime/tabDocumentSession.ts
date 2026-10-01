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

/**
 * Persist this tab's autosave. Never writes the shared legacy key.
 *
 * ★ BUG-406（P0 資料遺失）★ —— 外部 QA 實測：閂晒所有分頁再開，未儲存嘅工作
 * 永久消失，冇還原、冇提示、F5 救唔返、版本歷史都救唔返。
 *
 * 根因：正常情況下呢個函數【只寫 sessionStorage】，而 sessionStorage 嘅壽命
 * 等於「分頁瀏覽 session」—— 閂晒分頁就連埋 TAB_ID_KEY 一齊消失。下次開新分頁
 * 抽一個新 tabId，readTabAutosaveRaw() 三條路（sessionStorage / tab-scoped
 * localStorage / legacy 共用鍵）全部 miss，舊存檔變成一個永遠搵唔到嘅孤兒。
 *
 * 修法：寫 sessionStorage 之後【額外鏡像一份去 localStorage】做恢復副本，
 * 連埋一個帶內容標示嘅索引（QA 亦報過「version history entry 冇內容標示」）。
 * ⚠ 鏡像【唔會】自動載入 —— 自動載入返去就會打爛 BUG-276（新分頁唔應該
 * 靜靜還原另一個分頁嘅文件）。恢復一定要用戶明確揀，見 listRecoverableAutosaves()。
 */
export function writeTabAutosaveRaw(json: string, meta?: AutosaveMeta): void {
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

  // BUG-406：鏡像恢復副本。失敗【唔好】掟 —— sessionStorage 嗰份已經寫好，
  // F5 照還原得到；配額爆咗最多係失去「閂晒分頁之後」嗰層保險，唔好連正常存檔都搞死。
  try { mirrorForRecovery(json, meta) } catch { /* 恢復副本係額外保險，唔可以阻住正常存檔 */ }
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

/* ════════════════════════════════ BUG-406：閂晒分頁都救得返 ══════════════ */

const RECOVERY_INDEX_KEY = 'webcad-autosave-recovery'
/** 最多留幾份孤兒恢復副本。太多會食爆 localStorage 配額（存檔可以幾 MB）。 */
const MAX_RECOVERABLE = 3

export interface AutosaveMeta {
  /** 文件名（畀用戶認得出係邊份） */
  name?: string
  /** 特徵數 —— QA 報過版本歷史 entry 冇內容標示，分唔清邊個 entry 係邊個模型 */
  features?: number
  bodies?: number
}

export interface RecoverableAutosave {
  tabId: string
  ts: number
  /** 單調序號 —— 同一毫秒內嘅多次寫入靠呢個分新舊 */
  seq: number
  bytes: number
  /** 已經砌好嘅人話標籤，例如「未命名零件 · 3 特徵 · 12.4 KB」 */
  label: string
  meta: AutosaveMeta
}

/**
 * ⚠ 一定要有 `seq` —— 唔可以只靠 `ts` 排序。
 * 同一毫秒內寫幾次（快速連寫、或者時鐘精度粗）會令 ts 完全相同，
 * 嗰陣按 ts 排序就變成任意次序，剪枝會剪錯人（實測：連寫 6 次之後
 * 保留落嚟嘅係最舊嗰份 T1 而唔係最新嗰份 T5）。
 * seq 係單調遞增而且持久化，所以排序永遠確定。
 */
type IndexEntry = { ts: number; seq: number; bytes: number; meta: AutosaveMeta }

/** 比較兩個 entry 嘅新舊：先 ts，ts 相同就用 seq。 */
function newerFirst(a: IndexEntry, b: IndexEntry): number {
  return (b.ts - a.ts) || ((b.seq ?? 0) - (a.seq ?? 0))
}

function nextSeq(ix: Record<string, IndexEntry>): number {
  let m = 0
  for (const k of Object.keys(ix)) m = Math.max(m, ix[k].seq ?? 0)
  return m + 1
}

function readIndex(): Record<string, IndexEntry> {
  try {
    if (typeof localStorage === 'undefined') return {}
    const raw = localStorage.getItem(RECOVERY_INDEX_KEY)
    if (!raw) return {}
    const v = JSON.parse(raw)
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, IndexEntry>) : {}
  } catch { return {} }
}

function writeIndex(ix: Record<string, IndexEntry>): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(RECOVERY_INDEX_KEY, JSON.stringify(ix))
  } catch { /* ignore */ }
}

export function formatRecoveryLabel(meta: AutosaveMeta, bytes: number): string {
  const name = meta.name && meta.name.trim() ? meta.name.trim() : '未命名零件'
  const bits = [name]
  if (typeof meta.features === 'number') bits.push(`${meta.features} 特徵`)
  if (typeof meta.bodies === 'number' && meta.bodies > 0) bits.push(`${meta.bodies} 實體`)
  bits.push(bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`)
  return bits.join(' · ')
}

/** 寫一份恢復副本（tab-scoped localStorage）+ 入索引，並剪掉最舊嘅。 */
function mirrorForRecovery(json: string, meta?: AutosaveMeta): void {
  if (typeof localStorage === 'undefined') return
  const tabId = getTabSessionId()
  const ix = readIndex()
  ix[tabId] = { ts: Date.now(), seq: nextSeq(ix), bytes: json.length, meta: meta ?? {} }

  // 先剪舊，再寫新 —— 次序反過嚟就會喺配額已滿嗰陣連新嗰份都寫唔入。
  // ★ 永遠唔會剪走【自己】嗰份 ★，否則「寫完即刻被自己剪走」。
  const others = Object.keys(ix).filter((k) => k !== tabId).sort((a, b) => newerFirst(ix[a], ix[b]))
  for (const stale of others.slice(MAX_RECOVERABLE - 1)) {
    delete ix[stale]
    try { localStorage.removeItem(`${LEGACY_AUTOSAVE_KEY}:${stale}`) } catch { /* ignore */ }
  }

  try {
    localStorage.setItem(tabScopedLocalKey(tabId), json)
  } catch {
    // 配額爆 → 掉走最舊嗰份再試一次；仲唔得就放棄鏡像（sessionStorage 嗰份仍然有效）
    const victims = Object.keys(ix).filter((k) => k !== tabId).sort((a, b) => newerFirst(ix[b], ix[a]))
    if (victims.length) {
      delete ix[victims[0]]
      try { localStorage.removeItem(`${LEGACY_AUTOSAVE_KEY}:${victims[0]}`) } catch { /* ignore */ }
      try { localStorage.setItem(tabScopedLocalKey(tabId), json) } catch { writeIndex(ix); return }
    } else { return }
  }
  writeIndex(ix)
}

/**
 * 可以恢復嘅自動存檔（唔包括本分頁自己嗰份），最新排前。
 *
 * ★ 呢個係「閂晒分頁」之後唯一救得返嘅路 ★。
 * ⚠ 刻意【唔】自動載入：自動載入就會變成 BUG-276（新分頁靜靜還原咗另一個
 *   分頁嘅文件）。所以呢度只負責【列出】，載入要用戶明確揀。
 */
export function listRecoverableAutosaves(): RecoverableAutosave[] {
  if (typeof localStorage === 'undefined') return []
  const self = getTabSessionId()
  const ix = readIndex()
  const out: RecoverableAutosave[] = []
  for (const tabId of Object.keys(ix)) {
    if (tabId === self) continue
    let bytes = ix[tabId].bytes
    try {
      const raw = localStorage.getItem(`${LEGACY_AUTOSAVE_KEY}:${tabId}`)
      if (!raw) continue                     // 索引同實體唔同步 → 當冇
      bytes = raw.length
    } catch { continue }
    const meta = ix[tabId].meta ?? {}
    out.push({ tabId, ts: ix[tabId].ts, seq: ix[tabId].seq ?? 0, bytes, meta, label: formatRecoveryLabel(meta, bytes) })
  }
  return out.sort((a, b) => (b.ts - a.ts) || (b.seq - a.seq))
}

/** 攞某一份恢復副本嘅原始 JSON。 */
export function readRecoverableAutosave(tabId: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(`${LEGACY_AUTOSAVE_KEY}:${tabId}`)
  } catch { return null }
}

/** 用戶明確話唔要 → 連索引一齊清。 */
export function dropRecoverableAutosave(tabId: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(`${LEGACY_AUTOSAVE_KEY}:${tabId}`)
  } catch { /* ignore */ }
  const ix = readIndex()
  if (ix[tabId]) { delete ix[tabId]; writeIndex(ix) }
}
