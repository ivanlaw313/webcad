# P2/P3 Audit grep-prove 報告（Explore agent，2026-07-07）

掃 `_p2p3_open_gaps.json` 57 條 → **19 STALE（已做，可關）/ 23 REAL / 15 UNCERTAIN**。
⚠ **報告有 false-REAL**（agent 睇到過時行號）：fillet 成條高亮(v7 已 ship)、Edit Feature 白名單擴展(v10 10-12 kind)、cosmetic 螺紋(已 ship)、Split/Scale/Mirror-pick 等其實已做。→ **實現任何條前照樣 grep-prove**（iron rule）。

## STALE（19，已做 — agent 確認 + 我核對）
Two Sides / Start:Offset / Loft Closed / New Body op / Revolve pick-axis / Hole At-Center / ithread dialog / Combine default / single-click no-rollback / fillet-chamfer live preview / press-pull pick-confirm / mirror face-pick / scale about-point / split-body dialog / cbore-csink editable / extrude region-pick / to-object associative / feature multi-select（+ agent 漏報但已做：fillet 成條高亮、Edit Feature 全類擴展、cosmetic 螺紋）。

## REAL（真缺口，我已核 + 排序）
**已做/正在做**：#6 孔法向鑽（REAL，大重構）、#7 陣列 Bodies（✅ ship）、#9 New Component（REAL）。
**新浮現 small wins（唔喺原 17 點，順手做咗）**：
- Mirror **Bodies New Body op** — ✅ **DONE**（worker op='newbody' parkedBodies.push mirrorOf 副本，唔 cast）
- Thread **左旋 left-hand** — ✅ **DONE**（makeHelix 第6參 lefthand，probe 確認；othread/ithread 對話框 checkbox；真驗手性相反）
- Pattern **per-axis symmetric** — ✅ **DONE**（ei=i−(count−1)/2 居中，skip 改中心重合 atOrigin；**只奇數計數，偶數退單向+警告**；byte-safe）
- **剩餘（需 probe/rework，非單 flag）**：Sweep parallel（replicad sweepSketch frame 重構）、Revolve-To（ray-sweep 求角）、Shell 方向（負厚度守衛擋）、Scale uniform toggle（純 UI）、Chamfer two-distance edit
- Hole **extent "To"**（到面）— M
- Chamfer **two-distance/angle edit** 完整對話框 — M
- Pattern **per-axis symmetric** — S
- Pattern-on-path **完整對話框** — M
**中低值**：sweep distance slider、hole type+thread 正交、sweep guide surface、loft per-profile end condition、revolve/extrude 欄位次序微調。

## UNCERTAIN（15，likely real，需 code 核）
timeline chip 右鍵菜單、feature rename、insert-at-marker、offset-face 真語義、shell 方向/揀體、sweep taper 角度、loft profiles 有序列表、draft tangent-chain、variable-radius fillet 中間控制點、chamfer 多選集、combine target 揀體、fillet Type dropdown(Full-Round)、scale uniform toggle。

**下批建議**：Solid Create 已好齊。攞新 small wins 一批（Thread 左旋 + Sweep parallel + Revolve-To + Shell 方向 + Mirror op）做「Modify/Create 補完」批，全部 S/M 低風險高手感。跟住 #9 New Component、#11 datum v2、#6 孔法向鑽（大）。XL（#12-14）獨立 session。
