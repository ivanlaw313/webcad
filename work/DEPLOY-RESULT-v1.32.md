# DEPLOY-RESULT v1.32

**Date:** 2026-09-18 (HKT)  
**PR:** https://github.com/ivanlaw313/webcad/pull/64 (MERGED → `feat/native-car-stage1-20260906` @ `b64a659`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **Spurious kernel-restart toast fix:** `cadService` single-flight gate so watchdog timeout covers exclusive worker execution only (not queue wait). Stacked `previewRound` (fillet/shell debounce) no longer false-timeouts into「内核已重启 — 模型已恢复到上一个成功状态」.
- `previewRound` added to `LONG_METHODS` (120s, same class as `rebuild`).
- Tightened `looksLikeKernelCrash` (Emscripten-style only).
- **APP_VERSION:** `1.32` (live bundle `index-D3eAEdOc-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-D3eAEdOc-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.32-20260918-181937` |
| Previous (kept) | `/var/www/webcad-releases/v1.31-20260918-174015` |
| nginx root | **sites-available + sites-enabled** → v1.32 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.32`) |
| current symlink | → `v1.32-20260918-181937` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.32-20260918-181937;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.32-20260918-181937;
```
Both point at the **NEW** v1.32 release (not stuck on v1.31).

## Verification
- Public `index.html` references `index-D3eAEdOc-r2.js` ✓
- Live JS contains `\`1.32\`` ✓
- Live entry md5 matches local (`2cafd91a33544be7ffef0da9aa70b648`) ✓
- Contract: `tests/grok-qa-v1.32-kernel-restart-toast.test.mjs` HARD stacked-preview no-restart PASS
- Regression: v1.28 + v1.29 + v1.30 + v1.31 shell suites PASS (26/26 with v1.32)
- `vite build` / `npm run build` clean

## Notes
- Solid bot should retest **BX01** + **BX02** on LIVE 1.32: same CLEAN shell toasts as v1.31; ideally **zero** `内核已重启` during preview/commit. Rare hard wasm abort restart remains acceptable.
