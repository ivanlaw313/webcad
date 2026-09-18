# DEPLOY-RESULT v1.33

**Date:** 2026-09-18 (HKT)  
**PR:** https://github.com/ivanlaw313/webcad/pull/66 (MERGED → `feat/native-car-stage1-20260906` @ `dd816fa`)  
**Site:** https://cad.neuralworkshk.com/

## Ship contents
- **BX01 Shell preview stall fix:** Confirm no longer gated on `shellPreviewBusy` (picks + t>0 only).
- **Silent preview preempt:** `cancelPreviews()` + priority `rebuild` preempt hung/queued `previewRound` without「内核已重启」toast and without incrementing `restartCount`.
- Esc / Confirm / fillet-commit cancel in-flight previews so single-flight slot frees for retry/commit.
- Keep v1.32 exclusive-slot watchdog (`previewRound` ∈ LONG_METHODS, 120s hard hang still restarts).
- **APP_VERSION:** `1.33` (live bundle `index-Bp212SQP-r2.js`).

## Build / release
| Item | Value |
|------|--------|
| Local entry | `index-Bp212SQP-r2.js` |
| Release dir | `/var/www/webcad-releases/v1.33-20260918-143056` |
| Previous (kept) | `/var/www/webcad-releases/v1.32-20260918-181937` |
| nginx root | **sites-available + sites-enabled** → v1.33 release (bak → `/etc/nginx/bak-cad/cad.conf.bak-before-v1.33`) |
| current symlink | → `v1.33-20260918-143056` |

## Critical nginx check
```
$ grep root /etc/nginx/sites-available/cad.conf
root /var/www/webcad-releases/v1.33-20260918-143056;
$ grep root /etc/nginx/sites-enabled/cad.conf
root /var/www/webcad-releases/v1.33-20260918-143056;
```
Both point at the **NEW** v1.33 release (not stuck on v1.32).

## Verification
- Public `index.html` references `index-Bp212SQP-r2.js` ✓
- Live JS contains `` `1.33` `` ✓
- Live entry md5 matches local (`5ffdfaae9f926a760d14d8930b5bb034`) ✓
- Contracts: `grok-qa-v1.33-shell-preview-stall` + `grok-qa-v1.33-bx01-preview-complete` PASS
- Regression: v1.28–v1.32 shell suites PASS (35/35 with v1.33)

## Notes
- Solid bot should retest **BX01** on LIVE 1.33: Confirm available during/after preview; Shell CLEAN commit; restart ideally **0**. **BX02** spot-check CLEAN.
