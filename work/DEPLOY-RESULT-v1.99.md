# DEPLOY-RESULT v1.99

**Stamp:** `v1.99-20260919-190924`
**Entry:** `index-DM_Oy89E-r2.js`
**MD5:** `937c44b12d0b33a6c18b8195095cbf00`
**Commit:** `de41d94` / PR [#218](https://github.com/ivanlaw313/webcad/pull/218) (merge of `4bc6352`)
**Live:** https://cad.neuralworkshk.com/ · SW `webcad-v1.99` · nginx root `/var/www/webcad-releases/v1.99-20260919-190924`
**Prev:** `v1.98-20260919-185802`

## Summary
**v1.99 = BD-9901 focused high-exposure SC→港繁（project-link + viewport/browser/tour）**

| ID | Fix |
|----|-----|
| BD-9901 | `ProjectionLinkStatus` 全部 `T(…)` SC→TC（投影關聯狀態／選擇輪廓／重新連結／斷開連結／核對約束…） |
| projectLinks | `projectLinkIssueText` 五個 reason 文案 TC |
| store | 僅 project-relink／投影連結 error+status（重新選擇來源／無法重新連結／斷開連結…）；唔動無關 status wave |
| Viewport | 顯示方式／B-rep 顯示方式／文檔單位／僅影響屏上讀數／應用偏好 title |
| FloatingViewMenu | aria-label `顯示方式` |
| BrowserTree | `重建失敗：` + GroupRow tip（模組複用／組內關節／質心／子裝配…） |
| Tour | titles/bodies SC→TC（建立草圖／圓角／確定／檔案／匯出／教學完成），保留撳／嘅／喺 |
| i18n | STATUS_PHRASES_X TC→EN + legacy SC keys |
| version | APP `1.99` · SW `webcad-v1.99` |

## Sample before → after
| Before (SC) | After (TC) |
|-------------|------------|
| `投影关联状态` / `选择轮廓` / `重新连结` | `投影關聯狀態` / `選擇輪廓` / `重新連結` |
| `断开连结` / `正在核对约束…` | `斷開連結` / `正在核對約束…` |
| `文档单位` / `显示方式` / `仅影响屏上读数…` | `文檔單位` / `顯示方式` / `僅影響屏上讀數…` |
| `重建失败：` / `模块复用` / `组内关节` | `重建失敗：` / `模組複用` / `組內關節` |
| `创建草图` / `圆角` / `文件 ▾ → 导出 STL` | `建立草圖` / `圓角` / `檔案 ▾ → 匯出 STL` |

## Verify
- Live `sw.js` → `const CACHE = 'webcad-v1.99'`
- Badge / bundle `1.99` · entry `index-DM_Oy89E-r2.js` · md5 `937c44b12d0b33a6c18b8195095cbf00`
- Tests: v1.99 + v1.98 + v1.97 residual = **17/17**
- Browser: hard refresh `?v=199`

## Files
- `src/components/ProjectionLinkStatus.tsx` `FloatingViewMenu.tsx` `Viewport.tsx` `BrowserTree.tsx` `Tour.tsx`
- `src/sketch/projectLinks.ts` `src/store.ts` `src/i18n.ts`
- `src/version.ts` `public/sw.js`
- `tests/grok-qa-v1.99-bd9901-project-link-tc.test.mjs` (+ version pin bumps on v1.97/v1.98)

## Next suggestion
- More Viewport residual SC（量測／材質／水密／陣列 prompt 等 high-exposure）
- CSketch empty-sketch tips SC→TC
- Four-lang i18n message-catalog（Trad/Simp/EN/JA 一次切）
