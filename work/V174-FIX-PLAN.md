# V174 FIX PLAN — 4-locale i18n catalog foundation (+ Timeline field-param TC)

**Ship:** APP_VERSION **1.74** · Grok direct · gh PR · SSH deploy  
**Date:** 2026-09-19 (HKT)  
**Base:** LIVE v1.73 (stamp v1.73-20260919-134016) — Timeline/BrowserTree FEAT TC + SW `webcad-v1.73`

## Choice — Highest-value: proper 4-locale message catalogs (not more SC→TC patches)

Locales: **zh-HK** (Traditional HK) · **zh-CN** (Simplified) · **en** · **ja**

### Architecture
- Stable message keys under `src/i18n/locales/{zh-HK,zh-CN,en,ja}.ts`
- `src/i18n/types.ts` — `Lang` / `normalizeLang` (legacy `'zh'` → `'zh-HK'`)
- `src/i18n/catalog.ts` — `msg(key, lang)` with zh-HK fallback
- `LABEL_TO_KEY` / `TAB_TO_KEY` / `GROUP_TO_KEY` wire ribbon source strings → keys
- `tLabel` / `tGroup` / `tTab` / `tStatus` route through catalogs + OpenCC-style zh-CN fallback
- Ribbon language switcher: **繁 / 簡 / EN / 日本語** (`data-testid="lang-switcher"`), persist `localStorage['webcad-lang']`

### Also folded
- Timeline META field-param chrome SC→TC (距离／数量／齿数／桥接面…) — deferred leftover from v1.73
- `public/sw.js` CACHE → **`webcad-v1.74`**
- Soft-update v1.73 SW assert → 1.73+

### Seed / coverage
- ~361 keys per locale (tools + tabs + groups + chrome)
- zh-HK from current TC ribbon labels; zh-CN via TC→SC map; en from EN_LABEL; ja CAD draft (~107 tools with JA terms, rest EN fallback)

### Do not
- Regress 插入STL网格, LAB under 實驗室, prior TC pins
- CloudAgent — Grok direct only
- Mass-rewrite HelpPanel / tip novels
