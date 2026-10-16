# FISHING82-FIX

## Summary
Genuine UX product fix: INSPECT **可達性分析 → 脫模可達性** so ribbon/cmd/tool labels match 檢查擴展、analysesModel chip、and success status.
Also: tip.fea leftover punct **屬趨勢著色。非商用**; SC FEA i18n bare **设力 → 设定力** (TC already 設定力 since F79).

## Live after cut
- Tip: `1650cee7137022469ff92f4671b9b70a56e9de7c` (fix/fishing82-behavior-ux → FF fix/sketch-face-copy)
- Stamp: `v2.20-20261016-230832`
- Bundle: `index-2SJnc8l1-r2.js` (md5 `f5468d6660d68a52b45510bb8bcdf423`)
- Bak: `index-DOZZPmOV-r2.js` / `v2.20-20261016-225846` (kept)
- Site: https://cad.neuralworkshk.com/
- APP_VERSION 2.20
- more42 cherry: **no** (absent → F83)

## Product changes
| File | Change |
|------|--------|
| `src/ribbon.ts` | INSPECT accessanalysis label 脫模可達性; tip.fea punct |
| `src/store.ts` | gate/status 脫模可達性 |
| `src/i18n/locales/zh-HK.ts` / zh-CN / en | cmd/tool/alias |
| `src/i18n/labelToKey.ts` | 脫模可達性 map |
| `src/i18n.ts` | SC FEA 设定力 |
| `tests/fishing82-access-demold-ux.test.mjs` | hard asserts |
| `tests/grok-qa-v1.55-inspect-traditional.test.mjs` | expect 脫模可達性 |

## Kept
- MATERIALS / DENSITY_PREF SC keys untouched
- No tip Formal invent catalog thrash; tip.fea punct is F81 leftover on same tip
- more42 absent → defer F83

## Tests
- fishing82-access-demold-ux 3/3 PASS
- fishing81 / fishing55 / grok-qa-v1.55-inspect PASS
- tsc --noEmit PASS

## Deploy
- Bak prior live DOZZPmOV / 225846
- Soft-prep: more42 absent → no cherry before nginx
