# Fusion 360 SOLID 主規格與交互相容性審計

狀態：持續更新；呢份文件係索引、測試方法同驗收準則，詳細實機觀察仍保留喺各分項規格。

## 目標

WebCAD 唔只要有同名按鈕，仲要對齊 Fusion 360 嘅：

1. 選單名稱、分組、次序、捷徑、啟用／停用條件。
2. 指令啟動前選取、啟動後選取、選取槽切換同清除方法。
3. 數值輸入、單位、方程式、畫布拖拉手柄、inline 輸入框及雙向同步。
4. 預覽、錯誤提示、OK／Cancel／Enter／Esc／右鍵 marking menu 行為。
5. Browser、Timeline、Feature 編輯、Undo／Redo、下游重算及失敗修復。
6. 草圖、特徵、實體、建構幾何、檢查、插入、組件之間嘅相容關係。

## 原始實機資料索引

- CREATE：`_fusion_solid_spec.md`
- MODIFY：`_fusion_modify_spec.md`
- CONSTRUCT：`_fusion_construct_spec.md`
- INSPECT／VIEW：`_fusion_inspect_view_spec.md`
- INSERT／TIMELINE／SELECTION：`_fusion_insert_timeline_spec.md`
- ASSEMBLY：`_fusion_assembly_spec.md`
- SKETCH：`_fusion_sketch_spec.md`
- 現有差距：`_fusion_parity_gaps.md`、`_fusion_parity_gaps_3d.md`、`_fusion_parity_gaps_extra.md`
- 機器可讀審計目錄：`_fusion_solid_catalog.json`
- Windows UI Automation 採集器：`_fusion_audit.ps1`

原始規格唔會被主規格覆蓋或刪除；主規格只會引用、合併同標記證據級別。

## 證據級別

| 等級 | 意義 | 可以當成實作依據？ |
|---|---|---|
| E3 | 喺目前呢部機、目前 Fusion 版本，以實際幾何完整操作並看到結果 | 可以 |
| E2 | 實機打開選單／對話框／UI Automation 讀值，但未完成有效幾何 | 可以做 UI；幾何仍需驗證 |
| E1 | 官方資料或穩定產品語法，今次未喺實機操作 | 只可做候選規格 |
| E0 | 推測、未觀察或受狀態／帳戶／網絡限制 | 唔可以聲稱一致 |

每個欄位、輸入方法、結果同跨功能流程都要獨立標級，唔可以因為「見過對話框」就將整個功能標成完成。

## 批次審計流程

### A. 建立標準測試文件

測試文件要包含：

- 完全約束及未完全約束草圖。
- 封閉 profile、開放曲線、相切鏈、斷開鏈、自相交或無效輪廓。
- 平面、圓柱、圓錐、球面、自由曲面。
- 單一實體、分離實體、重疊實體、只接觸／共面實體、包含關係。
- 可用作 Sweep／Loft／Rib／Pipe 嘅路徑、截面及 guide。
- Construction plane／axis／point。
- 至少兩個 Component、Joint Origin 同可運動 Joint。
- 一條有多個依賴節點、可 rollback 及可製造下游失敗嘅 Timeline。

### B. 一次過採集六組 SOLID 功能

順序固定為 CREATE → MODIFY → CONSTRUCT → INSPECT → INSERT → ASSEMBLY。每個命令只做資料採集，未完成整批之前唔切換去 WebCAD 實作。

每項命令必須記錄：

- menuPath、menuOrder、separatorGroup、shortcut、enabledWhen。
- preselection、postselection、selectionSlots、multiSelect、chainSelect。
- 所有欄位、選項、預設值、單位、有效範圍、欄位顯示條件。
- numericEntry、equationEntry、canvasManipulator、inlineEntry、keyboardEntry。
- preview、invalidPreview、errorText、confirm、cancel、repeatLast。
- browserResult、timelineResult、doubleClickEdit、contextMenu、undoRedo。
- 參考截圖、UI Automation JSON、實際幾何輸入／輸出同證據級別。

### C. 多輸入方法等價測試

同一設定至少做以下對照：

1. 對話框直接輸入數字。
2. 畫布拖拉箭嘴、旋轉環、triad、radius handle 或尺寸手柄。
3. 畫布旁 inline 數值框輸入。
4. 有快捷鍵時由快捷鍵啟動。
5. 有 pre-selection 時先選物件再啟動，並同啟動後選取比較。
6. 切換 Direction／Extent／Operation／Type 後，原有值保留、重設或轉換嘅規則。
7. 負值、零、上限、超界、單位轉換同方程式。

要驗證「幾何結果相同」同「編輯後參數相同」，唔只係畫面睇落相似。

### D. 跨功能相容性矩陣

下列係必測主流程；每條再以正常、相切、共面、重疊、分離、無效六類幾何狀態展開：

| 編號 | 上游 | 中段 | 下游／要觀察 |
|---|---|---|---|
| W01 | Sketch 封閉輪廓 | Extrude／Revolve | New Body、Join、Cut、Intersect、方向及 extent |
| W02 | Sketch 開放曲線 | Thin Extrude／Rib／Web | 厚度方向、交叉、終止條件 |
| W03 | 多截面 Sketch | Loft／Sweep | guide、中心線、相切／曲率、下游 Fillet／Shell |
| W04 | Primitive／Feature bodies | Combine | Join／Cut／Intersect、Keep Tools、接觸與重疊 |
| W05 | Solid faces／edges | Fillet／Chamfer／Draft／Shell | tangent chain、corner、連續性、相鄰修改互相影響 |
| W06 | Solid／surface／datum | Split Face／Split Body／Replace Face | 分割工具類型、延伸、生成拓撲及下游選取穩定性 |
| W07 | Construction plane／axis／point | Sketch／Revolve／Mirror／Pattern | datum 編輯後全鏈重算 |
| W08 | Insert SVG／DXF／Canvas | Sketch／Extrude | 單位、scale、校準、可編輯曲線 |
| W09 | Insert mesh／component | Move／Align／Inspect | body 類型限制、轉換、選取優先次序 |
| W10 | Multiple bodies／components | Interference／Measure／Section | 結果隨修改即時更新 |
| W11 | Bodies → Components | Joint／As-Built Joint／Rigid Group | snap、DOF、limits、drag motion、ground |
| W12 | Timeline feature chain | Edit／Suppress／Rollback／Reorder | 下游重算、引用遺失、錯誤修復、Undo／Redo |

## 自動採集器

`_fusion_audit.ps1` 有三種模式：

```powershell
# 保存目前 Fusion 全視窗截圖及全部 UI Automation 控制項
powershell -ExecutionPolicy Bypass -File .\_fusion_audit.ps1 -Mode Snapshot

# 用 S 搜尋批次打開指定命令；保存搜尋結果及命令畫面，之後 Esc 退出
powershell -ExecutionPolicy Bypass -File .\_fusion_audit.ps1 -Mode Probe -Commands Extrude,Fillet,Shell

# 從 Fusion Text Commands / Python console 只讀匯出 commandDefinitions
powershell -ExecutionPolicy Bypass -File .\_fusion_audit.ps1 -Mode ConsoleCatalog
```

輸出放入 `_fusion_captures`，檔名包含時間、命令及階段。`Probe` 只應用於已知可以安全打開再取消嘅命令；涉及儲存、上載、外部元件、刪除、材料寫入或即時 toggle 嘅命令要逐項審批，唔會盲目批量執行。

## 驗收門檻

一個功能只有喺以下條件全部通過先可以標為「Fusion parity」：

- UI 順序、欄位、預設、顯示條件及輸入手感通過。
- 數字、drag、inline、pre/post-selection 等可用輸入方式通過。
- 有效幾何結果、無效輸入、取消、Undo／Redo 通過。
- 至少一條上游同一條下游相容性流程通過。
- Timeline／Browser／重新編輯／重算通過。
- 自動測試及至少一份 E3 實機證據已保存。

目前整體仍未達到呢個門檻；尤其 ASSEMBLY 實機證據未完整，唔可以聲稱已經一模一樣。
