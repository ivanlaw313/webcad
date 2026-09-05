# Fusion 360 SOLID 即時實測發現（2026-07-15）

## 全 SOLID 指令安全介面批次（2026-07-17）

為免反覆打斷使用者，今次在一個未儲存、空白的 Fusion 文件以單一自動化批次完成。每個指令只做：`搜尋 → 開啟原生對話框或限制提示 → 截圖及 UI Automation JSON → Esc 取消`；全程沒有按 OK、沒有建立或修改任何模型、沒有寫入 Timeline、沒有儲存文件。

- 批次一（約 138 秒）記錄：Create Sketch、Extrude、Revolve、Sweep、Loft、Hole、Thread、Rib、Web、Pipe、Pattern、Mirror、Fillet、Chamfer、Shell、Draft、Combine、Split Body、Move/Copy、Press Pull、Offset Plane、Midplane、Plane at Angle、Axis Through Cylinder、Point at Vertex、Measure、Section Analysis、Interference、Insert Mesh、Insert DXF、New Component、Joint、As-Built Joint、Joint Origin。
- 批次二（約 254 秒）記錄其餘目前可搜尋的 SOLID 指令：Create Form 至 Create PCB、Scale 至 Bill of Materials、UCS 及其餘 plane/axis/point 方法、全部 Inspect analyses、Decal/Canvas/SVG/Component/Derive/供應商插入，以及 Rigid Group 至 Drive Joints。
- 有些 Assembly、供應商及外部檔案功能只返回原生 context / availability 限制；該限制本身亦已記錄，沒有讓 Fusion 開始外部連線或檔案選擇。

證據集中於：`_fusion_captures/20260717-190834-*` 至 `_fusion_captures/20260717-191905-*`。這批證據是 **E2（原生 UI／context）**，不取代要有實體 fixture 才可驗證的 E3 幾何、滑鼠操控、Timeline、Undo/Redo 與跨功能重算測試。

### FrameLens OCR 交叉確認（2026-07-17）

以 FrameLens（RapidOCR；無 VLM）離線分析 `dialog-offset-plane`、`dialog-fillet`、`dialog-joint` 三張安全批次截圖。可清楚讀到：

- Offset Plane：`CONSTRUCTION GEOMETRY`、`Type`、`Method`、`Plane`、`Extent`、`OK/Cancel`。
- Fillet：`FILLET`、`Type`、`Radius type`、`Edges/Faces/Features`、`Corner Type`、`Rolling Ball`、`OK/Cancel`。
- Joint：`JOINT ORIGIN`、`Origin Mode`、`Snap`、`OK/Cancel`。

FrameLens 對 Fusion 左側 Browser 小型樹狀字與摺疊圖示報出多個 overlap；檢查座標後屬 OCR 把圖示誤讀為文字，不能當成原生 UI 重疊缺陷。此工具在本輪用於補足欄位與視覺定位證據，命令本身仍按 E2 分類。

## Chamfer 畫布操控柄量度與 WebCAD 對齊（2026-07-15 晚）

- Fusion Equal Distance：由 0 開始拖動會先進入 5.00 mm 粗吸附；數字欄仍可準確輸入 3 mm，證明畫布粗調與數字精調係兩條輸入通道。
- Fusion Distance and Angle：45° 弧柄向右拖約 10 個實體像素會變 35°；較大右拖可到 0°。3 px 嘗試未改變數值，只可證明存在拖曳門檻，未足以斷言門檻精確值。
- Fusion 允許畫布暫時顯示 0°，但該端點係退化狀態，唔應容許提交。
- WebCAD 已分拆三種真操控方式：Equal Distance 單藍箭嘴；Two Distance 藍色向上 Distance 1 + 橙色向下 Distance 2；Distance and Angle 距離箭嘴 + 角度弧柄。
- WebCAD GUI 實拖：Equal 0→5 mm；Two Distance 藍柄向上 0→5、橙柄沿箭嘴向下 0→5，兩距離齊備先啟用 OK；Angle 45→35（右拖 10 px），再到 0 時 OK 禁用。
- 數字欄保持精確輸入；5 mm／整度吸附只套用畫布拖柄，避免破壞參數化尺寸精度。

## 已由目前安裝版本直接確認

### 工作區及工具列

- 目前工作區為 Design `[FusionSolidEnvironment]`，active tab 為 SOLID `[SolidTab]`。
- SOLID 工具列存在 10 個 panels；完整的 Assemble panel 有 21 個 controls，但在目前 Part Design context 大部分隱藏，畫面只顯示 `Add To Assembly`。
- CREATE、MODIFY、CONSTRUCT、INSPECT、INSERT 的原生 control 次序、分組、可見／隱藏狀態已由 UI catalog 保存，不再只依賴記憶或網上圖片。

### 原生輸入方法

- Extrude：profile 預選後自動填入 selection slot；面板提供 direction、extent、distance、operation；畫布同時出現箭嘴及 inline `0.00 mm`。
- Loft：兩個 profiles 依選取次序成為 Profile 1／Profile 2；每個 profile 有 Connected condition；畫布顯示兩組 profile handles。
- Fillet：edge 預選後建立 edge row；面板有 radius、連續性選項；畫布有 radius arrow 及 inline 值。
- Shell：face 預選後顯示一個 selection；Tangent Chain 預設開啟；有 Shell Type、Inside Thickness、Direction；畫布有厚度箭嘴及 inline 值。
- Combine：先選 body 成為 Target，後選 body 成為 Tool；operation 使用圖示；Keep Tools 預設關閉。
- Move/Copy：body 預選後保留；Move Type 使用圖示；有 Set Pivot、X Distance 等欄位；畫布顯示完整 triad。
- Interference：兩 bodies 預選後顯示 2 個選取；`Include Coincident Faces` 預設關閉；未按 Compute 前 OK 不可用。
- Section Analysis：plane 預選後顯示 Distance、Angle 1、Angle 2、Flip；畫布有 manipulator 及 inline distance。
- Joint Origin：vertex snap 預選後顯示三個 origin modes、Position、Angle、X Offset；畫布有 triad 及 inline angle。

### Context gating

- New Component 在目前 context 仍可打開，對話框包含 Parent、Design Type、Part Type、Design Name、Location、Activate。
- Joint、As-Built Joint、Rigid Group、Tangent Relationship 在沒有兩個 components 時顯示原生限制訊息，要求先建立兩個或以上 components。
- Motion Study 在沒有 components／joints 時顯示原生限制訊息，要求至少兩個 components 並以 non-rigid joints 組裝。
- 嘗試在 Part Design 文件直接加入第二個 component 會被 Fusion 拒絕；因此 WebCAD 若要忠實，不能把 body 與 component 當成同一層級物件。

## 暫時只可下的結論

- 工具名稱、基本次序、空白對話框、有效預選、部分 selection-slot 對應及部分畫布操控器已取得實測證據。
- 尚未全面證明各數值模式、滑鼠拖拉、錯誤預覽、結果幾何、Timeline 依賴、Undo/Redo、重算及跨功能互操作。
- 現階段 WebCAD 只可聲稱「部分功能與 Fusion 對齊」，不可聲稱整個 SOLID 已經一模一樣。

## E3 互動等價性：Extrude 10 mm

> 這一組在同一個舊 session baseline 上做 A/B，比對結果有效；但該 baseline 後來證實已有 Undo 分支殘留，因此不可當作 canonical fixture 的絕對 body volume 基準。

標準 fixture 上同一個 60 × 40 mm profile 已完成兩條真實提交路徑：

1. 畫布 inline 欄輸入 `10 mm`，按 Enter。
2. 滑鼠拖拉 Extrude 箭嘴至 `10.00 mm`，按 OK。

直接觀察到的 Fusion 行為：

- inline 欄按 Enter 會立即執行命令、關閉對話框並寫入 Timeline，不只更新 preview。
- 箭嘴由 0 拖到 30 mm 時，因穿過現有實體，Operation 自動由 New Body 轉成 Cut。
- 箭嘴回到 10 mm 時，因與現有實體連接，Operation 自動轉成 Join。
- Join 會把 Main Box、Overlap Cylinder 及 Touching Box 合成同一 body；結果由基線 5 bodies 變成 3 bodies。
- 兩種提交路徑的結果完全相同：3 bodies、7 features、17 timeline items。
- 三個結果 bodies 的 volume 與 area 逐項完全相同，volume delta 全部為 0。
- Undo 後回復 5 bodies、6 features、16 timeline items；文件全程 `isSaved=false`。

證據：

- inline 提交畫面：`_fusion_captures/interaction-extrude-inline/20260715-084235-165-fusion-ui.png`
- 滑鼠拖到 30 mm／Cut：`_fusion_captures/interaction-extrude-drag/20260715-084430-888-fusion-ui.png`
- 滑鼠微調至 10 mm／Join：`_fusion_captures/interaction-extrude-drag-adjusted/20260715-084512-957-fusion-ui.png`
- 滑鼠提交狀態：`_fusion_captures/interaction-extrude-drag-commit/20260715-084708-703-fusion-state.json`
- Undo 基線狀態：`_fusion_captures/interaction-extrude-drag-undo/20260715-084756-403-fusion-state.json`
- 數值提交狀態：`_fusion_captures/interaction-extrude-inline-commit/20260715-084909-322-fusion-state.json`

## E3 互動等價性：Fillet 5 mm

> 這一組在同一個舊 session baseline 上做 A/B，比對結果有效；但該 baseline 後來證實已有 Undo 分支殘留，因此不可當作 canonical fixture 的絕對 body volume 基準。

同一個 Separate Box edge 已完成兩條提交路徑：

1. Fillet 畫布 handle 拖至 `5.00 mm`，按 OK。
2. 右側 radius 欄輸入 `5 mm`，按 Enter。

已確認：

- 兩條路徑均產生 5 bodies、7 features、17 timeline items。
- 所有結果 bodies 的 volume 與 area 逐項完全相同，delta 全部為 0。
- 右側 radius 欄按 Enter 會直接提交 Fillet、關閉對話框並寫入 Timeline。
- handle 可連續拖拉；本次 120px 初次拖拉到 `72.50 mm`，Fusion 保留數值但進入超限／無效 preview，OK 不可正常提交。
- 反向拖拉可回到有效範圍；`5.00 mm` 時有效預覽與 OK 恢復。
- 另外保存過 `3 mm` 數值提交：Separate Box volume 為 `7.961371669411541 cm³`，feature 為健康的 `Fillet1`。

證據：

- 超限 72.50 mm：`_fusion_captures/interaction-fillet-drag/20260715-093422-625-fusion-ui.png`
- handle 5.00 mm：`_fusion_captures/interaction-fillet-drag-adjusted/20260715-093537-491-fusion-ui.png`
- handle 5 mm 提交狀態：`_fusion_captures/interaction-fillet-drag-commit/20260715-093701-046-fusion-state.json`
- 數值 5 mm 提交狀態：`_fusion_captures/interaction-fillet-numeric5-commit/20260715-093852-946-fusion-state.json`
- 數值 3 mm 提交狀態：`_fusion_captures/interaction-fillet-numeric-commit/20260715-093206-209-fusion-state.json`

## E3 canonical 互動等價性：Shell Outside 10 mm

為排除舊 Undo 分支，已用 API 新建全新未儲存 Fusion Design，重新建立 fixture。乾淨基線為：

- 5 root bodies、5 root features、18 timeline items。
- Main Box volume `72.0 cm³`；Overlap Cylinder volume `22.619467105845548 cm³`。
- 1 occurrence：`Fixture Component:1`。
- 文件 `isSaved=false`。

在同一乾淨 baseline 上完成：

1. Direction = Outside，handle 拖至 `10.00 mm`，以已啟用的 OK 提交。
2. Direction = Outside，欄位輸入 `10 mm`，按 Enter 提交。

兩條路徑結果完全相同：

- 5 bodies、1 occurrence、6 features、19 timeline items。
- API thickness 均為 `1.0 cm`。
- Separate Box 結果 volume `40.0 cm³`、area `96.0 cm²`。
- 所有 body volume 與 area delta 均為 0。
- 拖拉產生的 expression 保留為 `10.00 mm`；手打 expression 保留為 `10 mm`。數值相同，但來源格式不同。

另外已確認：

- Shell Direction 選單次序為 Inside、Outside、Both。
- Direction 會跨命令、跨新文件保留上次選擇；新文件不一定回復 Inside。
- Inside 20 mm／10 mm 等超限情況會顯示紅色 error、停用 OK，並顯示：`The shell can not be created at this thickness. Try adjusting the Thickness, the selection set, or change the Shell Type.`
- 畫布 handle 的 snap 粒度會跟目前縮放尺度變化；遠景時小幅位移可由 0 直接跳到 10 mm。

證據：

- 乾淨基線：`_fusion_captures/fresh-fixture/20260715-102325-047-fusion-state.json`
- Direction 選單：`_fusion_captures/interaction-shell-direction-menu/20260715-100146-629-fusion-ui.png`
- 超限及錯誤：`_fusion_captures/interaction-shell-drag2/20260715-094517-844-fusion-ui.png`
- canonical handle 10 mm preview：`_fusion_captures/fresh-shell-outside-drag10-preview/20260715-104229-762-fusion-ui.png`
- canonical handle 提交狀態：`_fusion_captures/fresh-shell-outside-drag10-commit/20260715-104745-540-fusion-state.json`
- canonical 數值提交狀態：`_fusion_captures/fresh-shell-outside-numeric10-commit/20260715-105418-750-fusion-state.json`

## E3 canonical 數值／滑鼠等價：Offset Plane 20 mm

共同基線先把第二元件 X=`17.0 cm` 位置獨立 Capture，得到 `Position1`；基線為 2 construction planes、1 snapshot、22 Timeline items。之後測試同一頂面建立 Offset Plane：

1. Distance 欄位手打 `20 mm`，按 Enter 直接提交。
2. 畫布箭嘴由 `0.00 mm` 拖到 `25.00 mm`，再反向微調到 `20.00 mm`，按 OK 提交。

兩條路徑的結果相同：

- 3 construction planes、1 snapshot、23 Timeline items，最後一項均為 `Plane3`。
- `Plane3` 模型參數 value 均為 `2.0 cm`、unit=`mm`、role=`AlongDistance`。
- 所有 body volume 及 area delta 均為 0。
- 數字路徑保留 expression=`20 mm`；滑鼠路徑保留 expression=`20.00 mm`。數值與幾何相同，但輸入來源格式不同。
- 在目前視角／縮放，箭嘴約 100 physical pixels 對應 25 mm；向回微調約 20 pixels 由 25 mm 回到 20 mm。此比例依縮放而變，不能作固定全域常數。
- 如果在另一個命令彈出的 `Capture or revert component positions` modal 內按 Capture Position，該 `Position1` 會與正在執行的命令合併為同一 Undo transaction；Undo 該命令會連 Position1 一次移除。

證據：

- 獨立共同基線：`_fusion_captures/captured-position-baseline2/20260715-130304-216-fusion-state.json`
- 滑鼠 25 mm preview：`_fusion_captures/offset-plane-drag-attempt1/20260715-124325-429-fusion-ui.png`
- 滑鼠 20 mm preview：`_fusion_captures/offset-plane-drag20-preview/20260715-124726-498-fusion-ui.png`
- 滑鼠提交狀態：`_fusion_captures/offset-plane-drag20-state/20260715-124902-564-fusion-state.json`
- 同基線數字提交狀態：`_fusion_captures/offset-plane-numeric20-common-state/20260715-130554-746-fusion-state.json`

## INSPECT：Section Analysis 互動、顯示與歷史

以 `Loft Plane Lower 40mm` 作 Cut Plane 的初始預設：

- Distance=`0.00 mm`、Angle1=`0.0 deg`、Angle2=`0.0 deg`。
- 畫布同時顯示距離箭嘴、inline Distance、兩個旋轉弧形 handle。
- Section Color 預設 `From Component`；選單只有 `From Component`、`Custom`。
- 選 Custom 後新增 `Custom Color` swatch，預設黃色；picker 有 hue bar、二維 saturation/value 區、RGB 數字欄，預設 `(255,255,0)`，按鈕為 OK、Cancel、Apply。
- `Show Hatch` 預設勾選；關閉後斜線即時消失，但截面填色保留。

數值及幾何驗證：

- Distance=`10 mm`、Angle1=`30 deg`、Angle2=`15 deg` 均可用欄位輸入，Tab 後即時更新畫布切面及 handles。
- Flip 不保存為獨立布林值；按下後 Angle2 由 `15.0 deg` 直接改為 `195.0 deg`（+180°），切換至相反半空間。
- 在本測試幾何，Flip 後的 195° 組合無效，右下顯示紅色 X、OK 停用；Flip 回 15° 後 OK 恢復。故 Flip 之後仍必須重新跑切面有效性判斷。

提交、Browser 及 Edit：

- 提交後 Browser 新增 `Analysis > Section1`；Analysis 不增加 Timeline，Timeline 仍為 22，最後一項仍是 `Position1`。
- API 狀態為 `objectType=adsk::fusion::SectionAnalysis`、`isVisible=true`、sectionColor RGBA=`255,255,0,255`。
- Section1 右鍵選單精確次序：Create Selection Set、Edit、Delete（Del）、Rename、Show/Hide（V）。
- Edit 重開時 Distance／Angle1／Angle2 全部顯示 0，而不是原提交的 10/30/15；Fusion 把已提交切面姿態當作新基準，Edit 數值是相對增量。Custom 黃色及 Show Hatch off 會保留。
- 必須先選中 Section1，再按 V，`isVisible` 才由 true 變 false。

Undo／Redo：

- visibility toggle 是獨立可 Undo 操作，但不出現在 Timeline。
- Section1 hidden 後第一次 Ctrl+Z：Section1 仍存在，`isVisible` 回復 true。
- 第二次 Ctrl+Z：`analysisCount` 由 1 變 0，Section1 被移除；Timeline 仍是 22。
- 第一次 Ctrl+Y：Section1 及自訂黃色回復，visible=true；第二次 Ctrl+Y：visible=false 再次回復。

證據：

- 初始對話框：`_fusion_captures/section-analysis-open/20260715-130855-413-open-case-section_offset_plane.png`
- Color 選項：`_fusion_captures/section-analysis-color-options/20260715-131144-059-fusion-ui.png`
- RGB picker：`_fusion_captures/section-analysis-color-picker/20260715-131556-302-fusion-ui.png`
- Hatch off：`_fusion_captures/section-analysis-hatch-off/20260715-131758-166-fusion-ui.png`
- 10/30/15 preview：`_fusion_captures/section-analysis-numeric-10-30-15b/20260715-132356-519-fusion-ui.png`
- 無效 Flip：`_fusion_captures/section-analysis-enter-commit/20260715-134043-925-fusion-ui.png`
- 有效提交：`_fusion_captures/section-analysis-valid-commit/20260715-134758-621-fusion-ui.png`
- Browser／context menu：`_fusion_captures/section-analysis-context-menu/20260715-135323-886-fusion-ui.png`
- Edit 相對增量：`_fusion_captures/section-analysis-edit-reopen/20260715-135644-016-fusion-ui.png`
- API 狀態：`_fusion_captures/section-analysis-state/20260715-140415-410-fusion-state.json`
- Undo2／Redo2：`_fusion_captures/section-analysis-undo2-state/20260715-141900-174-fusion-state.json`、`_fusion_captures/section-analysis-redo2-state/20260715-142624-960-fusion-state.json`

## MODIFY：Move/Copy 數字、triad 與 Create Copy

初始 Bodies 模式：

- Move Object 選單精確次序：Components、Bodies…、Faces、Sketch Objects。
- Move Type 預設為第一個 Free Move 圖示；另有 Set Pivot。
- Free Move 欄位次序：X Distance、Y Distance、Z Distance、X Angle、Y Angle、Z Angle；全部預設 0。
- `Create Copy` 預設未勾選；零變換時 OK 停用。

同一基線測 Separate Box 沿 +X 移動 10 mm：

1. X Distance 欄位手打 `10 mm`，按 Enter 直接提交。
2. 拖畫布 triad 向右下的 +X 箭嘴；在目前視角約 33×20 physical pixels 正好 snap 到 `10.00 mm`，再按 OK。

兩條路徑結果完全相同：

- 新增 1 個 `adsk::fusion::MoveFeature`，名稱 `Move1`；root features=6、Timeline=23，最後一項 `Move1`。
- MoveFeature transform translation 均為 `(1.0,0.0,0.0) cm`，bodyCount=1。
- Separate Box bbox X 由 `[9.0,11.0] cm` 變 `[10.0,12.0] cm`；Y/Z 不變。
- volume=`8.0 cm³`、area=`24.0 cm²`，兩條路徑所有 bbox／volume／area delta 均為 0。
- 數字路徑輸入顯示 `10 mm`，triad 路徑顯示 `10.00 mm`；幾何及 transform 相同。

Create Copy + X=10 mm：

- 原 body `Separate Box 20mm` 保留 bbox X=`[9.0,11.0] cm`。
- 新 body 自動命名 `Separate Box 20mm (1)`，bbox X=`[10.0,12.0] cm`，volume／area 與原 body 相同。
- 同一 Move/Copy 命令會新增兩個 feature：`CopyPasteBodies1`（`adsk::fusion::CopyPasteBody`）及 `Move1`；Timeline 由 22 變 24。
- Ctrl+Z 一次會原子移除新 body、CopyPasteBodies1、Move1，直接回復 5 bodies、5 features、22 Timeline items。

證據：

- 初始 Move/Copy：`_fusion_captures/move-body-open/20260715-143132-810-open-case-move_body.png`
- Move Object 選單：`_fusion_captures/move-body-object-options/20260715-143551-582-fusion-ui.png`
- Triad X=10 preview：`_fusion_captures/move-body-drag-attempt1/20260715-150243-112-fusion-ui.png`
- 數字狀態：`_fusion_captures/move-body-numeric-x10-state2/20260715-144754-474-fusion-state.json`
- Triad 狀態：`_fusion_captures/move-body-drag-x10-state/20260715-150552-070-fusion-state.json`
- Create Copy 狀態：`_fusion_captures/move-body-copy-x10-state/20260715-151443-378-fusion-state.json`
- Create Copy Undo：`_fusion_captures/move-body-copy-x10-undo-state/20260715-151819-267-fusion-state.json`

## Assembly-capable 文件實測發現

- 原本的 Part Design 文件新增第二個 component 會被拒絕。
- 但以 Fusion API 新建 `FusionDesignDocumentType` 的未儲存文件顯示為 `Hybrid Design`，fixture 的 `Fixture Component:1` 成功建立，root occurrence count = 1。
- 在同一 Hybrid Design 成功建立第二個 occurrence `Fixture Component B:1`，初始 transform 為 X = `17.0 cm`；兩個元件均未 grounded。
- 因此真正多元件 Assembly 的本機未儲存實測不再被雲端儲存完全阻塞，並已完成 Joint、As-Built Joint、Rigid Group 的真實提交測試。

### Rigid Group

- 兩個 occurrence 前選後開啟 Rigid Group，Components 顯示 `2 selected`，狀態列顯示 `2 Component Instances`。
- `Include Child Components` 預設勾選，OK 可用。
- 如果之前的 Joint preview 留有尚未處理的元件位置，會先出現 `Capture or revert component positions` modal；按鈕次序為 `Revert Position`、`Capture Position`。
- `Capture Position` 會新增 snapshot／Timeline `Position1`；`Revert Position` 會放棄 preview 造成的暫存位置。
- 提交 Rigid Group 後：`rigidGroupCount=1`、Timeline 最後一項為 `Rigid Group 1`。

證據：

- 兩元件 fixture：`_fusion_captures/assembly-fixture/20260715-110153-288-fusion-fixture.png`
- Rigid Group 對話框：`_fusion_captures/assembly-rigid-maximized/20260715-113635-891-fusion-ui.png`
- 提交狀態：`_fusion_captures/assembly-rigid-group-commit/20260715-114119-427-fusion-state.json`

### Joint

- Position 分頁依次包含 Component 1、Component 2；每個元件有 Origin Mode 三個圖示及 Snap selection。
- Alignment 預設：Angle `0.0 deg`，X/Y/Z Offset 全部 `0.00 mm`，另有 Flip。
- Motion 分頁預設 Type = `Rigid`，下面有 `Preview Motion` 播放控制。
- Type 清單精確次序：Rigid、Revolute、Slider、Cylindrical、Pin-Slot、Planar、Ball。
- 以兩個頂點提交預設 Rigid Joint 後：`jointCount=1`，Timeline 新增 `Rigid 1`；第二元件由 X=`17.0 cm` 移到 X=`0.0 cm`，即 Joint 會把元件移去令所選 joint origins 對齊。
- Undo 一次會移除 Joint、Timeline 回復，並把第二元件完整還原到 X=`17.0 cm`。

證據：

- Position 分頁：`_fusion_captures/20260715-114644-513-open-case-joint_two_component_vertices.png`
- Motion 分頁：`_fusion_captures/assembly-joint-motion-physical/20260715-120207-744-fusion-ui.png`
- Type 清單：`_fusion_captures/assembly-joint-motion-types/20260715-120252-302-fusion-ui.png`
- 提交狀態：`_fusion_captures/assembly-joint-rigid-commit-state/20260715-120727-177-fusion-state.json`
- Undo 狀態：`_fusion_captures/assembly-joint-rigid-undo-state/20260715-120929-729-fusion-state.json`

### As-Built Joint

- 兩個 occurrence 前選後，Components 顯示 `2 selected`，兩個 Browser 節點及模型均高亮，狀態列顯示 `2 Component Instances`。
- 對話框沒有 Joint 的 Position／Motion 分頁切換；直接顯示 Motion section。
- 預設 Type = `Rigid`，有 `Preview Motion`；Type 清單與 Joint 完全相同，次序同為 Rigid、Revolute、Slider、Cylindrical、Pin-Slot、Planar、Ball。
- 提交預設 Rigid 後：`asBuiltJointCount=1`，第二元件保持 X=`17.0 cm`，即 As-Built Joint 約束現有相對位置，不會像普通 Joint 一樣重新對齊兩個 origins。
- 本次提交同時產生 `Position1` 與 `Rigid 1`；狀態為 `snapshotCount=1`、Timeline 23 項。
- Undo 一次會原子地移除 As-Built Joint 及伴隨的 Position snapshot，Timeline 由 23 直接回復 21，第二元件仍保持 X=`17.0 cm`。

證據：

- 初始對話框：`_fusion_captures/assembly-asbuilt-open/20260715-121018-861-open-case-as_built_two_components.png`
- Type 清單：`_fusion_captures/assembly-asbuilt-types/20260715-121155-850-fusion-ui.png`
- 提交狀態：`_fusion_captures/assembly-asbuilt-rigid-commit-state/20260715-121430-445-fusion-state.json`
- Undo 狀態：`_fusion_captures/assembly-asbuilt-undo1-state/20260715-121552-790-fusion-state.json`

## MODIFY：Chamfer 操作、輸入通道與失敗規則

固定前置條件：對 `Separate Box 20mm` 的最長邊執行 Chamfer。初始 selection row 顯示 `1 Edge`；Type 預設為 `Equal Distance`；Tangent Chain 預設勾選；Corner Type 預設為 `Chamfer`；距離為 0 時 OK 停用。

### 選項次序與動態欄位

- Type 清單次序：`Equal Distance`、`Two Distance`、`Distance and Angle`。
- Corner Type 清單次序：`Chamfer`、`Miter`、`Blend`。
- Equal Distance 時第一距離欄可輸入，第二距離欄停用；畫布沿所選邊顯示單一箭嘴 manipulator 及 inline 距離欄。
- Selection section 包含加／減 edge rows、`Edges/Faces/Features > Select`，以及 `Tangent Chain`。

### 數字輸入 3 mm

- 在距離欄輸入 `3 mm` 後可正常預覽及提交。
- 提交後 root feature count 由 5 變 6，Timeline 由 22 變 23，最後 feature 為健康的 `Chamfer1`（`adsk::fusion::ChamferFeature`）。
- 參數 `d15`：expression=`3 mm`、value=`0.30000000000000004 cm`、unit=`mm`、role=`Distance`、createdBy=`Chamfer1`。
- `Separate Box 20mm` 的 bbox 不變，volume 由 `8.0` 變 `7.91 cm³`，area 由 `24.0` 變 `23.558528137423856 cm²`。

### 滑鼠操控柄

- 在原視角由 0 拖拉約 6 physical pixels，數值直接吸附到 `5.00 mm`；較大拖拉會到 `15.00 mm`，反向拖拉可回到 `0.00 mm`。
- 以方塊為焦點大幅放大後，約 16×10 physical pixels 的拖拉仍由 0 直接吸附到 `5.00 mm`；因此目前證據顯示 Chamfer manipulator 是粗調／吸附輸入，不應假設可連續拖到任意 1 mm 數值。精確 3 mm 必須使用 inline 或 panel 數字欄。
- 這與 Offset Plane 的當前測試不同：Offset Plane 的拖拉可在相同命令內調到 20.00 mm。WebCAD 應按命令保存各自的 drag mapping／snap policy，而不是共用一條全域線性比例。

### 超限失敗：25 mm

- 對 20 mm 方塊輸入 `25` 後，inline 顯示 `25 mm`、所選邊轉紅、右下角顯示紅色 X，OK 停用；模型不提交任何 feature。
- 將游標停在紅色 X 上的完整提示為：`1 error(s)`；`The fillet/chamfer could not be created at the requested size.`；`Try adjusting the size, deselecting some of the edges (try disabling Tangent Chain), or using multiple separate operations.`
- Cancel／Esc 只取消預覽，模型、Timeline 及 body geometry 均回到基線。

### Two Distance：3 mm / 5 mm

- 由 Equal Distance 切換至 Two Distance 會清空原有 edge selection；需要在新 Type 下重新選邊。這是 command state transition，WebCAD 不可只換欄位而保留舊 selection。
- 未選邊時頂列距離 rows 不顯示；重新選邊後頂列顯示 `1 Edge` 及兩個可輸入距離欄，畫布顯示兩個不同方向的箭嘴，並新增 `Flip`。
- 輸入 Distance 1=`3 mm`、Distance 2=`5 mm` 後 OK 啟用；inline 顯示目前主要距離 `3 mm`，兩個箭嘴分別控制兩側距離。
- 按 Flip 前後，頂列數值仍保持 `3`、`5`，但兩個箭嘴的顏色／方向及兩個距離套用到實體的側別交換；Flip 不是交換欄位值。
- 提交後只建立一個健康的 `Chamfer1`：feature count=6、Timeline=23；參數 `d15` role=`Distance 1` expression=`3 mm`，`d16` role=`Distance 2` expression=`5 mm`。
- `Separate Box 20mm` bbox 保持不變，volume=`7.85 cm³`、area=`23.416190378969063 cm²`。一次 Undo 移除整個雙距離 feature。

### Distance and Angle：4 mm / 30 deg

- 由 Equal Distance 切換後同樣清空 selection。重新選取固定測試邊時，Fusion 建立 `1 Face, 1 Edge` selection pair；頂列第一欄預設 `0.00 mm`、第二欄預設 `45.0 deg`。
- 畫布顯示線性距離箭嘴、弧形角度操控柄及藍色參考 face；狀態列為 `2 selections`。
- 輸入 Distance=`4 mm`、Angle=`30 deg` 後 OK 啟用；inline 顯示 `4 mm`。按 Flip 不改頂列 4／30，只反轉藍色參考側、弧形柄及切削方向。
- 提交後只建立一個健康的 `Chamfer1`：參數 `d15` role=`Distance` expression=`4 mm`、value=`0.4 cm`；`d16` role=`Rotate Angle` expression=`30 deg`、value=`0.5235987755982988 rad`。
- `Separate Box 20mm` bbox 保持不變，volume=`7.578881034835456 cm³`、area=`22.06794233642836 cm²`。一次 Undo 移除整個 distance-angle feature。

證據：

- Type 清單：`_fusion_captures/chamfer-type-options/20260715-153226-547-fusion-ui.png`
- Corner Type 清單：`_fusion_captures/chamfer-corner-options/20260715-153813-829-fusion-ui.png`
- 數字 3 mm 狀態：`_fusion_captures/chamfer-numeric3-state/20260715-154745-633-fusion-state.json`
- 原視角拖拉 5 mm：`_fusion_captures/chamfer-drag3-preview3/20260715-161244-385-fusion-ui.png`
- 放大後拖拉仍吸附 5 mm：`_fusion_captures/20260715-162204-024-fusion-ui.png`
- 25 mm 超限畫面：`_fusion_captures/20260715-162650-482-fusion-ui.png`
- 超限完整提示：`_fusion_captures/20260715-162827-981-fusion-ui.png`
- Two Distance 重新選邊：`_fusion_captures/20260715-164030-918-fusion-ui.png`
- Two Distance 3/5 預覽：`_fusion_captures/20260715-164304-014-fusion-ui.png`
- Two Distance Flip 預覽：`_fusion_captures/20260715-164550-714-fusion-ui.png`
- Two Distance 提交狀態：`_fusion_captures/20260715-164852-708-fusion-state.json`
- Distance and Angle 預設：`_fusion_captures/20260715-165910-989-fusion-ui.png`
- Distance 4 / Angle 30 預覽：`_fusion_captures/20260715-170228-497-fusion-ui.png`
- Distance and Angle Flip 預覽：`_fusion_captures/20260715-170448-035-fusion-ui.png`
- Distance and Angle 提交狀態：`_fusion_captures/20260715-170726-318-fusion-state.json`

### WebCAD 對應修正：真正參考 Face + Edge（2026-07-15）

- 舊實作只有 edge near-point；worker 以相鄰面法向 Z 大小猜參考面，所以斜面／豎邊／非頂底面可能套錯 Distance 或 Angle 側別。介面雖有 Flip，但缺乏用戶實際點中面嘅持久身份。
- 新 selection contract：Distance and Angle 一次近邊點擊同時取得實際 hit triangle 所屬 B-rep face 與最近 edge。參考點使用 hit triangle 的內部重心，而不是共享邊上的點；避免同一點同時屬於兩個相鄰面而無法消歧。
- command state 顯示 Fusion 實測格式 `1 Face, 1 Edge`；未齊參考面、邊、正距離及 0–90° 角度前，OK 及預覽均停用。Type 切換、清空、取消、成功提交及取消最後一條邊都會同步清除 reference face。
- Timeline feature 只在 Distance and Angle 新增可選 `refFaceNear`（CAD 座標）。重算時 worker 只在所選 edge 的相鄰面內比較參考點至各面三角網格的距離；Flip 改選同一 edge 的另一相鄰面。舊檔沒有 `refFaceNear` 時保留原有法向 Z fallback，確保舊專案相容。
- 真 OCCT 回歸：同一條豎邊，兩個相鄰豎面都可建立 4 mm / 30° chamfer；交換參考面後斜面法向比率由 `1.732` 變 `0.577`，證明 Flip 真正改變幾何方向。
- 本機 GUI 回歸：80×60×40 mm 方塊，Distance and Angle 初始 Distance=0、Angle=45、Select、OK disabled；輸入 4 mm 並在頂面近邊點一次後顯示 `1 Face, 1 Edge`、面藍色、邊橙色、真 B-rep preview，OK enabled；Flip `aria-pressed=true`。最後 Cancel，沒有提交測試特徵。

## 後續記錄原則

每一個功能至少要保存：命令路徑／次序、前選與後選、selection slots、預設值、單位及公式輸入、滑鼠 handles、inline input、preview、錯誤文字、OK/Cancel、Browser 結果、Timeline 結果、double-click edit、context menu、Undo/Redo，以及與上下游功能的成功／失敗組合。
