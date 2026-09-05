# Fusion 360 實測擷取索引

更新日期：2026-07-15（Asia/Hong_Kong）

本文件只記錄已在本機 Fusion 360 實際開啟、選取或顯示過的證據。未有實測的項目不得標成完成。

## 證據等級

- E3：在 Fusion 360 內以有效幾何實際執行，並檢查結果、Timeline、Undo/Redo。
- E2：實際開啟原生命令，記錄介面、預設值、選取槽、畫布操控器或限制訊息。
- E1：由 Fusion UI/API 讀出命令名稱、順序、可見性或 command id。
- E0：推測或文件資料，尚未以目前安裝版本實測。

## 基線與工具列

| 證據 | 路徑 | 內容 | 等級 |
|---|---|---|---|
| 基線畫面 | `_fusion_captures/20260715-074706-472-fusion-ui.png` | Design / SOLID 工作區原始畫面 | E2 |
| UI Automation 樹 | `_fusion_captures/20260715-074706-472-fusion-ui.json` | 當時可存取的 UI 元件、位置及屬性 | E1 |
| 命令總目錄 | `_fusion_captures/20260715-074729-fusion-command-catalog.txt` | 目前 Fusion 安裝版本的 command definitions | E1 |
| 工具列目錄 | `_fusion_captures/20260715-074904-fusion-ui-catalog.txt` | SOLID tabs、panels、controls、可見／隱藏狀態及次序 | E1 |
| 重啟後基線 | `_fusion_captures/20260715-082125-385-fusion-ui.png` | Fusion 重啟、關閉復原提示後的乾淨畫面 | E2 |

## 空白／預設對話框批次

| 分組 | 目錄 | 截圖數 | 已成功 execute | 備註 |
|---|---|---:|---:|---|
| CREATE | `_fusion_captures/20260715-080223-fast-probe` | 23 | 23/23 | 對話框、空白狀態及預設控制；E2 |
| MODIFY | `_fusion_captures/20260715-080406-fast-probe` | 20 | 20/20 | 對話框、空白狀態及預設控制；E2 |
| CONSTRUCT | `_fusion_captures/20260715-080525-fast-probe` | 20 | 20/20 | 對話框、空白狀態及預設控制；E2 |
| INSPECT | `_fusion_captures/20260715-080640-fast-probe` | 11 | 11/11 | 對話框、空白狀態及預設控制；E2 |
| INSERT | `_fusion_captures/20260715-080729-fast-probe` | 9 | 9/9 | 對話框、空白狀態及預設控制；E2 |
| ASSEMBLY（部分） | `_fusion_captures/20260715-080813-fast-probe` | 11 | 10 個狀態檔 | 主要為無多元件時的限制提示；Contact Set 未完成；不得視為完整裝配實測 |

五個核心分組合共 83 張截圖，83/83 個命令 execute 回傳成功。這只代表命令成功開啟，不代表功能結果已經驗證。

## 標準幾何 Fixture

| 證據 | 路徑 | 內容 | 等級 |
|---|---|---|---|
| 建立腳本 | `_fusion_fixture.py` | 建立可重複的未儲存 Part Design 測試模型 | — |
| 結果報告 | `_fusion_captures/fusion-fixture-report.json` | 5 bodies、8 sketches、2 construction planes、0 occurrences | E2 |
| 完成畫面 | `_fusion_captures/20260715-082502-626-fusion-fixture.png` | 標準模型在 Fusion 畫布及 Browser 的狀態 | E2 |

Fixture 包含 Main Box、Overlap Cylinder、Touching Box、Separate Box、Loft Cone Body、Open Path Sketch 及 Sweep Guide Sketch，可覆蓋重疊、相切、分離、profile/path、基準面等輸入情況。

## 有效預選及跨功能入口

目錄：`_fusion_captures/20260715-082816-case-probe`

20/20 案例均記錄 `prepared=true`、預期選取數、`allAdded=true`、`executeReturned=true`。案例包括：

- CREATE：Extrude profile、Loft profiles、Rectangular Pattern body、Mirror body。
- MODIFY：Fillet edge、Chamfer edge、Shell face、Press Pull face、Draft face、Scale body、Combine overlap、Offset Face、Replace Face、Move body、Align bodies。
- CONSTRUCT：Offset Plane from face。
- INSPECT：Measure two edges、Interference overlap、Section offset plane。
- ASSEMBLY 基礎：Joint Origin vertex。

已確認畫布操控器／inline 值的案例包括 Extrude、Loft、Fillet、Shell、Move/Copy、Section、Joint Origin。Measure 雖由 API 預選兩條邊，面板只顯示一條邊，必須再做命令啟動後的第二次選取，現時仍未完成。

## 已知缺口及安全限制

- 上述大部分屬 E1/E2；尚未全部做有效值提交、結果幾何、Timeline、Undo/Redo，因此不可以聲稱與 Fusion 360 一模一樣。
- ASSEMBLY 目前 Part Design 文件只容許一個 component。Fusion 原生錯誤為：Part Design 文件只能包含一個 component，需將 Part 加到 Assembly 才可加入多個 components。
- 建立真正 Assembly 可能涉及儲存／雲端專案狀態；未獲額外授權前不會執行。
- ASSEMBLY 批次曾令 Fusion 關閉；Motion Study 與 Contact Set 之後必須分開測試。復原提示已關閉，沒有開啟、刪除或覆寫使用者檔案。
- Text Commands 面板在部分截圖中展開；證據有效，但日後驗收截圖應先收起，以取得一致畫布尺寸。

## 下一批實測

1. 數值欄輸入、inline 輸入、滑鼠操控器拖拉三種方法的等價性。
2. Extrude／Combine／Fillet／Chamfer／Shell 等命令的提交、結果、Timeline、Undo/Redo。
3. 重疊、相切、共面、分離及無效幾何的結果矩陣。
4. 真正多元件 Assembly 的建立、Joint、As-Built Joint、Rigid Group、Motion；需先解決文件類型及儲存授權。

