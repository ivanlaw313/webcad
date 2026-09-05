// materialLibrary.ts — S187：用户「外观材质库」（对标 Fusion Appearance 收藏 / 已存材质）。
//
// 把当前活动实体外观（bodyColor + material{metalness,roughness,opacity,tex,texScale}）存做【具名预设】，
// 之后一击套用 / 删除。【应用级全局库】（同 Fusion 收藏一样跨文档），用 localStorage 持久，唔入项目 .json
// （避免改动既有存档往返；项目 sanitizeMaterial / save 路径完全唔掂）。
//
// CRUD 核心系【纯函数】（over 一个普通对象），可 Node 测；localStorage 读写系薄封装、全 try/catch 守护
// （SSR / 隐私模式 / 配额满 都唔会炸，退回空库）。

export type MatPreset = {
  color: string
  metalness: number
  roughness: number
  opacity: number
  tex?: string
  texScale?: number
}

export type MatLibrary = Record<string, MatPreset>

const LS_KEY = 'webcad.materialLibrary.v1'

// ── 纯函数 CRUD（无副作用，返回新对象，方便 Node 测 + zustand 不可变更新）──────────────
export function addPreset(lib: MatLibrary, name: string, p: MatPreset): MatLibrary {
  const key = name.trim()
  if (!key) return lib                       // 空名 = no-op（调用方应先校验）
  return { ...lib, [key]: sanitizePreset(p) }
}

export function removePreset(lib: MatLibrary, name: string): MatLibrary {
  if (!(name in lib)) return lib
  const next = { ...lib }
  delete next[name]
  return next
}

// 钳制 metalness/roughness/opacity ∈ [0,1]、texScale > 0；防坏值入库后污染渲染（同 store.sanitizeMaterial 精神）。
export function sanitizePreset(p: MatPreset): MatPreset {
  const clamp01 = (v: number, d: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d)
  return {
    color: typeof p.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(p.color) ? p.color : '#4a7296',
    metalness: clamp01(p.metalness, 0.18),
    roughness: clamp01(p.roughness, 0.5),
    opacity: clamp01(p.opacity, 1),
    ...(p.tex ? { tex: String(p.tex) } : {}),
    ...(p.texScale && Number.isFinite(p.texScale) && p.texScale > 0 ? { texScale: p.texScale } : {}),
  }
}

// ── localStorage 持久（薄封装，全守护）────────────────────────────────────────────
export function loadLibrary(): MatLibrary {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    if (!raw) return {}
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
    const out: MatLibrary = {}
    for (const k of Object.keys(obj)) {
      const v = obj[k]
      if (v && typeof v === 'object' && typeof v.metalness === 'number') out[k] = sanitizePreset(v)
    }
    return out
  } catch {
    return {}
  }
}

export function saveLibrary(lib: MatLibrary): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LS_KEY, JSON.stringify(lib))
  } catch {
    /* 配额满 / 隐私模式：静默（库仍在内存有效，只系唔持久） */
  }
}
