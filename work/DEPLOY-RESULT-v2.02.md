# DEPLOY-RESULT v2.02 (BD-2201)

- **When:** 2026-09-25 10:08 HKT
- **Live:** https://cad.neuralworkshk.com/?v=202
- **APP_VERSION:** 2.02
- **SW CACHE:** webcad-v2.02
- **Stamp:** v2.02-20260925-100625
- **Entry:** index-Cin5-hnM-r2.js
- **MD5:** 10cd673c4ce3bb07a4eb96b57d1b1509 (local == live)
- **PR:** https://github.com/ivanlaw313/webcad/pull/224 (squash merged → 7db8271)
- **Branch:** fix/v2.02-bd2201-measure-material-tc → feat/native-car-stage1-20260906
- **Tests:** `node --test` grok-qa v2.02 + v2.01 + v2.00 → **20 pass / 0 fail**
- **Open bugs:** 0

## Scope (BD-2201)
High-exposure residual SC → 港繁 in measure / physical material / appearance library tips:

- store.ts: sketch point tip, toggleMeasure, toggleMeasureEdge, setPhysicalMaterial, mat-lib save/load/delete status, capture-measure tip
- MaterialSwatchPicker.tsx: 物理材質 button + title
- Viewport.tsx: 外觀材質庫 panel title + toolbar tip (+ preset prompt defaults)
- App.tsx: ESC 已退出測量
- i18n.ts: STATUS_PHRASES_X dual keys (TC + legacy SC)

## Deploy
- Build: plain `npm run build` (no release:build)
- Release dir: /tmp/webcad-v202-release/dist
- Script: work/v202_deploy.py (KEY /home/box/.ssh/vps_deploy)
- nginx root switched from v2.01-20260925-094241 → v2.02-20260925-100625
- Live curl: CACHE webcad-v2.02; entry md5 match; bundle contains 可繼續點擊落點 / 測量：點擊實體 / 外觀材質庫 / 物理材質 / 2.02

## Next suggestion
- Remaining SC residuals in other high-exposure paths (measure-adjacent / FEA / BOM), **or** four-language i18n message-catalog so Trad/Simp/EN/JA switch in one go.
