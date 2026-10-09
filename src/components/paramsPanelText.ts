import { tStatus, normalizeLang } from '../i18n'

// RETEST19 #3：參數面板字串以繁體寫；zh-HK 顯示繁體、zh-CN 轉簡體（tStatus 渲染層轉換）；其他語言照舊（原文）。
export type Tz = (s: string) => string
export const paramsPanelText = (lang: unknown): Tz => {
  const L = normalizeLang(lang as Parameters<typeof normalizeLang>[0])
  return (s: string) => (L === 'zh-HK' || L === 'zh-CN' ? tStatus(s, L) : s)
}
