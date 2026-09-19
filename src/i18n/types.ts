/** Canonical UI locales (v1.74+). Legacy `'zh'` normalizes to `'zh-HK'. */
export type Lang = 'zh-HK' | 'zh-CN' | 'en' | 'ja'

/** Accepted persisted / API values including legacy `'zh'`. */
export type LangInput = Lang | 'zh'

export const LOCALES: readonly Lang[] = ['zh-HK', 'zh-CN', 'en', 'ja'] as const

export const LOCALE_STORAGE_KEY = 'webcad-lang'

export function normalizeLang(input: string | null | undefined): Lang {
  if (!input) return 'zh-HK'
  const v = input.trim()
  if (v === 'zh' || v === 'zh-HK' || v === 'zh_HK' || v === 'zh-TW' || v === 'zh-Hant') return 'zh-HK'
  if (v === 'zh-CN' || v === 'zh_CN' || v === 'zh-Hans') return 'zh-CN'
  if (v === 'en' || v.startsWith('en-') || v.startsWith('en_')) return 'en'
  if (v === 'ja' || v.startsWith('ja-') || v.startsWith('ja_')) return 'ja'
  return 'zh-HK'
}

export function isZhFamily(lang: LangInput): boolean {
  const L = normalizeLang(lang)
  return L === 'zh-HK' || L === 'zh-CN'
}
