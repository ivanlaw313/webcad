# DEPLOY-RESULT v2.03 (BD-2301)

- **When:** 2026-09-25 10:38 HKT
- **Live:** https://cad.neuralworkshk.com/?v=203
- **APP_VERSION:** 2.03
- **SW CACHE:** webcad-v2.03
- **Stamp:** v2.03-20260925-103420
- **Entry:** index-CGbdYNtZ-r2.js
- **MD5:** 0a2199a68db03ca234ecd7d16d6e4524 (local == live)
- **PR:** https://github.com/ivanlaw313/webcad/pull/226 (squash merged → 69f3f6b)
- **Branch:** fix/v2.03-bd2301-sketch-tips-tc → feat/native-car-stage1-20260906
- **Tests:** `node --test` grok-qa v2.03 + v2.02 + v2.01 + v2.00 → **30 pass / 0 fail**
- **Open bugs:** 0

## Scope (BD-2301)
High-exposure sketch-adjacent residual SC → 港繁:

- App.tsx: Esc 已取消當前繪製（再按 Esc 清選擇 / 退出）
- CSketch.tsx: 修剪／延伸／打斷／鏡像／矩形陣列／環形陣列／旋轉／投影實體／刪除所選／新建加料實體 + toolbar titles/prompts + finish hint
- SketchLayer.tsx: 尺寸／約束 click tips（衝突約束／從動／驅動／點擊修改／刪除）
- dimensionEditInput.ts: 尺寸無法計算／參數尺寸／循環引用／公式無法計算
- constrainedDrag.ts / constrainedEdgeDrag.ts: 拖動／約束 error reasons
- extendTransaction.ts: 延伸失敗 reasons
- Ribbon.tsx: B-rep 時間軸／真布爾合併單殼 titles
- BrowserTree.tsx: 圓柱；無法自動更新此基準 tip
- i18n.ts: STATUS_PHRASES_X dual keys (TC + legacy SC)

## Deploy
- Build: plain `npm run build` (no release:build)
- Release dir: /tmp/webcad-v203-release/dist
- Script: work/v203_deploy.py (KEY /home/box/.ssh/vps_deploy)
- nginx root switched from v2.02-20260925-100625 → v2.03-20260925-103420
- Live curl: CACHE webcad-v2.03; entry md5 match; bundle contains 已取消當前繪製 / 修剪：點線段 / 真布爾合併單殼 / 無法自動更新此基準 / 2.03

## Visible smoke
- Box Chrome: https://cad.neuralworkshk.com/?v=203
- Badge: **WebCAD · version 2.03**; 繁 active; SOLID tab visible
- Start Modeling overlay shows Sketch / Box / Gear pair sample (icon path; no command search used)
- computerUse tool not available to this executor; refresh via box-chrome + screenshot confirm

## Next suggestion
- Remaining SC residuals in FEA / BOM / DrawingPanel / store status mixed strings, **or** four-language i18n message-catalog so Trad/Simp/EN/JA switch in one go.
