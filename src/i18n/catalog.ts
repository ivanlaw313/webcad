import type { Lang, LangInput } from './types'
import { normalizeLang } from './types'
import zhHK from './locales/zh-HK'
import zhCN from './locales/zh-CN'
import en from './locales/en'
import ja from './locales/ja'

export const CATALOGS: Record<Lang, Record<string, string>> = {
  'zh-HK': zhHK,
  'zh-CN': zhCN,
  en,
  ja,
}

/** Lookup a stable message key. Fallback: zh-HK → key itself. */
export function msg(key: string, lang: LangInput): string {
  const L = normalizeLang(lang)
  return CATALOGS[L][key] ?? CATALOGS['zh-HK'][key] ?? key
}

export function catalogKeyCount(lang: LangInput): number {
  return Object.keys(CATALOGS[normalizeLang(lang)]).length
}

export function allCatalogKeys(): string[] {
  const keys = new Set<string>()
  for (const cat of Object.values(CATALOGS)) {
    for (const k of Object.keys(cat)) keys.add(k)
  }
  return [...keys].sort()
}
