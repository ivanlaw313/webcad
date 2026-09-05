// versionStore.ts — IndexedDB 版本历史（零第三方依赖，raw IDB）
//
// 点解要有：localStorage 自动保存单槽只有 ~5MB，大项目（mesh 组件多）超限会静默跳过
// （store.ts 自动保存 subscriber 嘅 catch 注明）——刷新即丢工作。IndexedDB 配额大几个数量级，
// 用佢做「自动快照 + 命名版本」双轨历史。
//
// Schema：
//   DB 'webcad-history' v1 / object store 'snapshots' { keyPath: 'id', autoIncrement: true }
//   index 'ts'      → ts 字段（listSnapshots 新→旧排序用）
//   index 'kind_ts' → ['kind','ts'] 复合（openKeyCursor 轻量扫描做保留裁剪——唔使 materialize 大 json）
// Record：{ id, label, kind: 'auto'|'named', ts: epoch ms, size: json.length, json }
//   json 喺 saveSnapshot 内只 stringify 一次，存字符串本身（唔存对象——避免 structured-clone 二次开销
//   + 任何唔可克隆字段都会先喺 JSON.stringify 阶段暴露）。
//
// 保留策略：最新 10 个 'auto' + 最新 30 个 'named'，喺 saveSnapshot 同一个事务内裁剪。
// 决策逻辑抽成纯函数 pruneList()（node 可测，见 _test_versionstore.mjs 验证记录）。
//
// 所有 API 喺 IDB 不可用（私隐模式 / 配额 / 损坏）时安全降级：catch → -1 / null / [] / false，
// 永不 throw；idbAvailable() 畀 UI 探测可用性。

export type SnapKind = 'auto' | 'named'

export interface SnapshotMeta {
  id: number
  label: string
  kind: SnapKind
  ts: number   // epoch ms
  size: number // json 字符串长度（UTF-16 code units，≈ 字节数）
}

interface SnapshotRecord extends SnapshotMeta { json: string }

const DB_NAME = 'webcad-history'
const STORE = 'snapshots'

/** 保留上限：每种 kind 各自计（auto 自动快照 10 个 · named 命名版本 30 个）。 */
export const KEEP: Readonly<Record<SnapKind, number>> = { auto: 10, named: 30 }

// ———————————————————————— 纯函数：保留裁剪决策（node 直接可测） ————————————————————————

/**
 * 决定应该删除边啲快照。输入任意顺序的轻量行（id/kind/ts），输出要删除嘅 id 列表。
 * 规则：每种 kind 独立按「新→旧」排序（ts 大=新；ts 相同时 id 大=新，autoIncrement 单调），
 * 各保留 keep[kind] 个，超出部分（最旧嘅）删除。两种 kind 互不影响。
 */
export function pruneList(
  rows: ReadonlyArray<{ id: number; kind: SnapKind; ts: number }>,
  keep: Readonly<Record<SnapKind, number>> = KEEP,
): number[] {
  const sorted = [...rows].sort((a, b) => (b.ts - a.ts) || (b.id - a.id)) // 新→旧；ts 撞时 id 新者先
  const kept: Record<SnapKind, number> = { auto: 0, named: 0 }
  const out: number[] = []
  for (const r of sorted) {
    if (kept[r.kind] < keep[r.kind]) kept[r.kind]++
    else out.push(r.id)
  }
  return out
}

// ———————————————————————— DB 连接（缓存 + 失败可重试） ————————————————————————

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  const p: Promise<IDBDatabase | null> = new Promise((resolve) => {
    // 失败时清缓存再 resolve null → 下次调用可重试（transient 失败唔会永久禁用历史功能）
    const fail = () => { dbPromise = null; resolve(null) }
    try {
      // 私隐模式 / 老旧环境 / node：indexedDB 唔存在或 getter 直接 throw
      if (typeof indexedDB === 'undefined' || !indexedDB) { fail(); return }
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true })
          st.createIndex('ts', 'ts')
          st.createIndex('kind_ts', ['kind', 'ts'])
        }
      }
      req.onsuccess = () => {
        const db = req.result
        // 另一个 tab 将来升级 schema 时主动让路；清缓存等下次重开
        db.onversionchange = () => { try { db.close() } catch { /* ignore */ } dbPromise = null }
        resolve(db)
      }
      req.onerror = fail
    } catch { fail() }
  })
  dbPromise = p
  return p
}

/** IDB 可唔可用（私隐模式探测）。UI 可据此显示降级提示。 */
export async function idbAvailable(): Promise<boolean> {
  return (await openDB()) !== null
}

// ———————————————————————— CRUD API（全部安全降级） ————————————————————————

/**
 * 保存一个快照。data 喺呢度 JSON-stringify 一次（存字符串）；同一事务内按 KEEP 裁剪旧快照。
 * @returns 新快照 id；IDB 不可用 / 写入失败时返回 -1（永不 throw）。
 */
export async function saveSnapshot(data: unknown, label: string, kind: SnapKind): Promise<number> {
  try {
    const db = await openDB()
    if (!db) return -1
    const json = JSON.stringify(data) // 只 stringify 一次——下面存呢条字符串
    const rec: Omit<SnapshotRecord, 'id'> = { label, kind, ts: Date.now(), size: json.length, json }
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const st = tx.objectStore(STORE)
      let newId = -1
      const addReq = st.add(rec)
      addReq.onsuccess = () => {
        newId = addReq.result as number
        // 裁剪：复合索引 openKeyCursor 只读 (kind, ts, id) 轻量三元组——唔会克隆大 json 值，
        // 大项目（每条快照几 MB）都唔会卡。决策交畀纯函数 pruneList，同一事务内删除。
        const rows: { id: number; kind: SnapKind; ts: number }[] = []
        const cur = st.index('kind_ts').openKeyCursor()
        cur.onsuccess = () => {
          const c = cur.result
          if (c) {
            const [k, ts] = c.key as [SnapKind, number]
            rows.push({ id: c.primaryKey as number, kind: k, ts })
            c.continue()
          } else {
            for (const id of pruneList(rows)) st.delete(id)
          }
        }
      }
      tx.oncomplete = () => resolve(newId)
      tx.onerror = () => reject(tx.error ?? new Error('idb tx error'))
      tx.onabort = () => reject(tx.error ?? new Error('idb tx abort'))
    })
  } catch { return -1 } // 配额满 / 私隐模式 / stringify 失败（循环引用）→ 静默降级
}

/** 列出全部快照元数据（唔含 json——轻量），按时间新→旧。不可用时返回 []。 */
export async function listSnapshots(): Promise<SnapshotMeta[]> {
  try {
    const db = await openDB()
    if (!db) return []
    return await new Promise<SnapshotMeta[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const out: SnapshotMeta[] = []
      // ts 索引倒序游标 = 新→旧。记录数被 KEEP 封顶（≤40 条），只喺面板打开时跑一次，可接受。
      const cur = tx.objectStore(STORE).index('ts').openCursor(null, 'prev')
      cur.onsuccess = () => {
        const c = cur.result
        if (c) {
          const v = c.value as SnapshotRecord
          out.push({ id: v.id, label: v.label, kind: v.kind, ts: v.ts, size: v.size })
          c.continue()
        }
      }
      tx.oncomplete = () => resolve(out)
      tx.onerror = () => reject(tx.error ?? new Error('idb tx error'))
    })
  } catch { return [] }
}

/** 读取一个快照并 JSON.parse 还原成对象。唔存在 / 不可用 / 损坏时返回 null。 */
export async function loadSnapshot(id: number): Promise<unknown | null> {
  try {
    const db = await openDB()
    if (!db) return null
    const rec = await new Promise<SnapshotRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result as SnapshotRecord | undefined)
      req.onerror = () => reject(req.error ?? new Error('idb get error'))
    })
    if (!rec || typeof rec.json !== 'string') return null
    return JSON.parse(rec.json)
  } catch { return null }
}

/** 删除一个快照。@returns 成功 true；不可用 / 失败 false。 */
export async function deleteSnapshot(id: number): Promise<boolean> {
  try {
    const db = await openDB()
    if (!db) return false
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).delete(id)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => reject(tx.error ?? new Error('idb tx error'))
    })
  } catch { return false }
}

/** 改名一个快照（label 字段，原 json/ts/kind 不变）。@returns 找到并改成 true。 */
export async function renameSnapshot(id: number, label: string): Promise<boolean> {
  try {
    const db = await openDB()
    if (!db) return false
    return await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      const st = tx.objectStore(STORE)
      const req = st.get(id)
      let found = false
      req.onsuccess = () => {
        const rec = req.result as SnapshotRecord | undefined
        if (rec) { found = true; rec.label = label; st.put(rec) }
      }
      tx.oncomplete = () => resolve(found)
      tx.onerror = () => reject(tx.error ?? new Error('idb tx error'))
    })
  } catch { return false }
}
