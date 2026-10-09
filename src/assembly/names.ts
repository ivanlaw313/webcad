// BUG(E)：裝配樹／關節面板顯示名本地化（只改顯示，唔改存檔數據）。
// 舊預設名以簡體生成（组件1 / 关节1 / 实体1）→ 繁體模式下顯示「組件1 / 關節1 / 實體1」；
// en/ja 顯示 Component 1 / Joint 1 / Body 1。用戶自訂名：zh-HK 只做簡→繁字形轉換，其他語言原樣。
import { simplifiedToTraditionalHK } from '../i18n/sc2tcHK'

const PREFIX: Record<string, { tc: string; sc: string; en: string }> = {
  组件: { tc: '組件', sc: '组件', en: 'Component ' }, 組件: { tc: '組件', sc: '组件', en: 'Component ' },
  关节: { tc: '關節', sc: '关节', en: 'Joint ' }, 關節: { tc: '關節', sc: '关节', en: 'Joint ' },
  实体: { tc: '實體', sc: '实体', en: 'Body ' }, 實體: { tc: '實體', sc: '实体', en: 'Body ' },
}

export function localizeAsmName(name: string, lang: string | null | undefined): string {
  if (!name) return name
  const m = /^(组件|組件|关节|關節|实体|實體)(\d+)( \(\d+\))?$/.exec(name)   // RETEST17 #3：亦認「實體3 (1)」副本預設名
  const L = lang || 'zh-HK'
  if (m) {
    const p = PREFIX[m[1]]
    return (L === 'zh-HK' ? p.tc : L === 'zh-CN' ? p.sc : p.en) + m[2] + (m[3] ?? '')
  }
  return L === 'zh-HK' ? simplifiedToTraditionalHK(name) : name
}

