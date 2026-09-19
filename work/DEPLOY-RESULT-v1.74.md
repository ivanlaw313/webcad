# DEPLOY-RESULT v1.74

**Date:** 2026-09-19 14:01 HKT  
**PRs:**  
- https://github.com/ivanlaw313/webcad/pull/156 — 4-locale i18n + Ribbon switcher (MERGED) → `feat/native-car-stage1-20260906`  
**Site:** https://cad.neuralworkshk.com/  
**Choice:** Proper **4-locale message catalog** foundation (zh-HK / zh-CN / en / ja) + Ribbon language switcher; Timeline field-param TC folded in.  
**Note:** Prefer catalogs over one-by-one SC→TC patches going forward.

## Ship contents
- Locales: **zh-HK** · **zh-CN** · **en** · **ja** under `src/i18n/locales/`
- Stable keys (`tool.*` / `tab.*` / `group.*` / `ui.*` / `status.lang.*`) — **361 keys / locale**
- `normalizeLang`: legacy `'zh'` → `'zh-HK'`; persist `localStorage['webcad-lang']`
- Ribbon switcher **繁｜簡｜EN｜日本語** (`data-testid="lang-switcher"`)
- `tLabel` / `tGroup` / `tTab` / `tStatus` / `msg()` wired through catalogs
- JA / zh-CN label maps for uncatalogued ribbon strings; zh-CN status via TC→SC fallback
- Timeline META field-param chrome TC (距離／半徑／數量／模數／齒數／橋接面…)
- `public/sw.js` **CACHE=`webcad-v1.74`**
- APP_VERSION **1.74** + contract `grok-qa-v1.74-i18n-four-locale-catalog`
- Soft-update: v1.73 SW assert → 1.73+

## How to switch languages
1. Hard refresh / Unregister SW once
2. Ribbon top-right: **繁** (zh-HK) · **簡** (zh-CN) · **EN** · **日本語**
3. Choice persists across reloads via `localStorage['webcad-lang']`

## Key count / fallback
| Locale | Keys | Notes |
|--------|------|-------|
| zh-HK | 361 | Seed from current TC ribbon / chrome |
| zh-CN | 361 | OpenCC-style TC→SC + ZH_CN_LABEL map |
| en | 361 | From EN_LABEL / English data keys |
| ja | 361 | CAD terminology draft; **~199 tool.* still EN fallback** (honest) |

Still fallback (not catalogued yet): HelpPanel novels, most status toasts (EN phrase table / zh-CN char map), dialog tip text, CommandPalette aliases.

## Before → After
| Surface | v1.73 | v1.74 |
|---------|-------|-------|
| Lang type | `zh` \| `en` | **zh-HK \| zh-CN \| en \| ja** |
| Switcher | 中 / EN | **繁 / 簡 / EN / 日本語** |
| Message catalogs | none (EN_LABEL only) | **4 locale files, 361 keys each** |
| Timeline params | 距离／半径／数量／模数… | **距離／半徑／數量／模數…** |
| SW CACHE | `webcad-v1.73` | **`webcad-v1.74`** |
| APP | 1.73 | **1.74** |

## Build / release
| Item | Value |
|------|--------|
| Merge SHA | `8da5bd1` (PR #156) |
| Commits | `8e1585d` + `897ac49` |
| Local entry | `index-BXjqnIJt-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.74-20260919-140043` |
| Previous (kept) | `/var/www/webcad-releases/v1.73-20260919-134016` |
| nginx root | **sites-available + sites-enabled** → v1.74 release |
| current symlink | → `v1.74-20260919-140043` |
| entry md5 | `395a79d098ae69bb5f92511d65c0a49e` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.74-20260919-140043;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.74-20260919-140043;
```

## Verification
- Public entry `index-BXjqnIJt-r2.js` ✓ md5 match ✓
- Live SW `CACHE = 'webcad-v1.74'` ✓
- Live contains `1.74`／zh-HK／lang-switcher／押し出し／插入STL网格／實驗室 ✓
- Retained: 插入STL网格／導出STL／裝配工程圖／尺寸已拒絕／選擇／LAB under 實驗室 ✓
- Contract tests: 41 pass (v1.70–v1.74)

## BOT verify steps (hard refresh / Unregister SW once)
1. DevTools → Application → Service Workers → **Unregister** once, then hard refresh
2. Version badge **1.74**
3. Ribbon switcher: click **繁 / 簡 / EN / 日本語** — tool labels + tabs/groups update together
4. Reload — language persists
5. Timeline editor params (zh-HK): **距離／半徑／數量／模數／齒數／橋接面**
6. Regress: 插入STL网格, LAB under 實驗室, CREATE 擴充／製造 CAM／堆疊／受力雲圖
