# Mesh→B-rep 逆向工程 + 2D→3D 管線 — 完整計劃（2026-07-25）

> 基於 3 agent 落地研究（wf_41b29690）：現有代碼盤點 / 內核可綁定審計 / 算法可行性校準。
> 每項標明【模型分配】+【ETA（7×24 AI 基準）】+【絕對完成時間】。

## 0. 誠實可行性總評（三個 Tier，唔可以混為一談）

| 輸入類型 | 可達質量 | 檔案縮細 | 編輯性 |
|---|---|---|---|
| **A. CAD 出身 STL**（機械件：平面/圓柱/錐/球） | ★ 乾淨解析 solid，Fusion「Prismatic」級 | **100–1000×**（STL 50B/三角） | 全套 direct-edit + 布爾 + 圓角 + STEP |
| **B. 3D 掃描 mesh** | 基元有得撿就撿 + deviation map + 互動清理；**唔承諾全自動** | 視乎覆蓋率 | 同上（撿到嘅部分） |
| **C. AI 生成 organic（Meshy/Tripo）** | 基元逆向**基本失敗**（lumpy 無精確基元）。正路：mesh body 直用 / NURBS quilt 被單 | quilt **10–100×** | 控制點級（editpoles 已有），**唔係參數模型** |

業界校準：Fusion Prismatic（收費 extension）只食 CAD 出身 mesh；Geomagic Design X（$20k）都要人手逐 region 覆核。**冇人 ship 一鍵 scan→參數化實體** —— 我哋目標 = Tier A 全自動 + Tier B 互動 + Tier C 誠實定位。

## 1. 我哋已有嘅（唔使由零起）
- S46 `meshbody`：faceted 轉換（Sewing→ShapeFix_Solid→UnifySameDomain）+ 窄版 param（純圓柱）/prismatic（軸對齊盒−孔）+ 零回歸退階律（worker:1860-1956）
- 網格工具鏈：補洞/QEM/等距重網格（mesh.worker）、hull、smooth、manifold 布爾、平面切
- `stepbody`：外來 B-rep 入時間線可編輯（先例證明「轉完即可編輯」）
- Direct-edit 全套（delface/pushpull/moveface/splitface/replaceface/draft/shell）對轉換後 solid 直接生效
- editpoles NURBS 極點編輯（S133/S140）= quilt 嘅編輯前端已有
- SVG/DXF→profile→拉伸管線 = 2D 向量化嘅落地口現成
- 內核：Sewing/ShapeFix 家族/UnifySameDomain/BRepCheck/GeomAPI_PointsToBSplineSurface/Section **全部已綁**；cone/torus/NormalProjection 等喺 wrapper 內即可用（OCCT 預編譯，PlateWrapper 先例，6 分鐘重建管線已證）

## 2. 工作分解（模型分配 + ETA）

### Phase A — STL→解析 B-rep（核心）
| # | 內容 | 模型 | ETA | 絕對完成 |
|---|---|---|---|---|
| M1 | ✅ **完成 07-25**（Opus 5，我複驗 59/59）：`segmentAndFit()` @ src/geom/primitiveFit.ts（meshSegment.ts 追加 739 行零回歸）。全部 golden 級精度：cyl r 誤差 0%、cone 半角/apex 精確、G1 fillet 帶認到（曲率判據改用邊法向旋轉 θ/L⊥ — quadric 法喺極端長寬比三角上低估 50×）、noisy ±0.2% 下 r 誤差 0.01%、torus 大小徑精確。50k tris 84ms / 197k tris 312ms。契約：`SegmentationResult`（regions+params/paramsSnapped+boundaryLoops【保證閉合】+verts/tris/triSrc+snaps；snapped 軸精確 [0,0,1] 且約束下重擬合） | Opus 5 + 我 | — | **已交付** |
| M2 | ✅ **完成 07-25**（Opus 5 寫+自跑重建，Fable 5 獨立複驗）：FitWrapper 6 方法全 working —— MakeAnalyticFace(5 種基元，★M3 必須傳 refX 方向，否則 uvBounds 唔可預測★) / FitBSplineFace / TrimFaceByLoop(UV 投影路線；NormalProjection fallback + 縫合跨接【未測】) / SewSolidify(BRepCheck 閘實證：5 面要閉合→null 唔 abort；★一次只餵一族面★) / FreeBoundaryInfo(★閉合訊號睇 freeEdges>0，openWires 唔會 fire★) / DeviationSample(JSON 字串返回，500 點 25ms)。box 體積 0.00000% 誤差；`_rebuilt` wasm 11,735,816(+11.4KB)；生產 kernel 未動，換裝前要過 BUILD_CAD2 幾何 battery | Opus 5 + 我 | — | **已交付** |
| M3 | ✅ **完成 07-25**（Opus 5，我複驗 7/7 ALL PASS）：`src/geom/brepRebuild.ts`（planRebuild 純邏輯／rebuild／executePlan）+ `tests/mesh2brep-golden.mjs`。**7/7 golden 全 solid、體積 0.00000%**（勝 STL 自身鑲嵌誤差 4-5 個數量級：球 0.445%→0.000%）。設計要點：圓形平面邊界唔行 TrimFaceByLoop（96 邊形細 0.32% + sagitta 縫唔埋）→ 由鄰接圓柱擬合參數起精確 gp_Circ wire；孔=MakeFace_22+Reversed 自動試向；region 合併+sliver 吸收；曲面 uv-bound 軸向 snap 鄰接平面交線；tier 合約 solid→shell→failed（生產 kernel 冇 FitWrapper 時 clean degrade）。⚠ 錐面 DeviationSample 有 kernel 陷阱（BRepExtrema 收斂到對面母線）→ 已用 per-face min 繞過。⚠ box_with_hole.stl 資產本身有缺陷（環帶三角重疊反向+走角，ground_truth 面數應為 7）→ M3 修復 pass 食咗但資產應重生成 | Opus 5 + 我 | — | **已交付** |
| M4 | ✅ **完成 07-25**（Opus 5，我複驗 68/68 + golden 7/7 迴歸不變）：`src/geom/edgeReconstruct.ts` 1526 行（`intersectSurfaces`/`solveTripleVertex`/`planTier2`/`executeTier2`/`reconstructTier2`）。**斜置件係真價值所在**：斜孔件 M3 只到 shell 4.44% → M4 **solid 0.00000%**；密網格斜凸台 M3 shell 35.63% → M4 **solid 0.00000%**。16 條解析求交單元全部殘差 ~1e-15mm。設計要點：周期面（柱/錐）自己喺宿主 u=0/π 切兩塊 patch 造 seam（切點必須由**周期宿主**定，唔可以用曲線自己嘅參數）；全域空間去重頂點表令三張面攞到逐位相同角點 → 縫隙=0；「幾何收編」取代「細就食」。⚠ v1 唔支援：歪柱×歪柱、cone∧torus（要行 `BRepAlgoAPI_Section` 數值路）、plane∠cone 出雙曲線/拋物線、球/環面畀閉環夾住 → 一律 **declined 退 M3**（零回歸律）。⚠ `deviation` 診斷數喺面邊界唔可信（`GeomAPI_ProjectPointOnSurf` 只搵 uv 窗內部極值）—— 正確性證據係體積+BRepCheck+可鑲嵌 | Opus 5 + 我 | — | **已交付（早 3 日）** |
| M5 | ✅ **完成 07-25**（Opus 5，我複驗）：`src/geom/filletRecover.ts` 349 行。`filleted_box` 半徑認到 **4.000000（0.00000%）**、壓平體積 24000（0.00000%）、重施體積同原圓角實體 **0.00000%**；斜置件雙半徑 4/2.5 同時認到、2/2 圓角重施揀啱邊。關鍵：**壓平唔係刪面** —— 圓角帶三角按脊線分派返兩張支撐面，解析求交自然出利邊（直接刪會令支撐面出現冇鄰面嘅自由邊，M4 即刻 declined） | Opus 5 + 我 | — | **已交付（早 4 日）** |
| **內核換裝** | ✅ **完成 07-25**（我親自）：`_occt-build/_rebuilt`（含 FitWrapper）→ `src/kernel/`，備份喺 `_kernel_backup_20260725/`。新寫 `tests/kernel-battery.mjs`（差分式：同一腳本跑新舊兩核逐位 f64 比對，比抄歷史數字更嚴 —— 歷史只記結果冇記參數）。**12/12 幾何 case 逐位相同**（平面/柱/球/錐/環面/布爾/圓角/抽殼/多步工作流）；`box 24000/12t`、`shell_2 7152/28t` 同 BUILD_CAD2.md 歷史基線逐字相符 → 交叉驗證 harness 冇寫錯。**全部 kernel 測試 55/55 綠**。⚠ 順手修正一個假綠：mesh2brep 測試原本指住 `_occt-build/_rebuilt`，即係之前嘅 ALL PASS **冇證明過生產路徑** → 已改指 `src/kernel`，重跑 golden 7/7 + tier2 68/68 全綠 | Fable 5(我) | — | **已交付** |
| M6 | UI：轉換對話框（忠實/解析/有機 三模式 + tolerance + 逐 region 覆核 override）+ deviation map 開關 | **Sonnet 5** 面板 / **Fable 5(我)** monolith 接線 | 6–8h | 07-26 夜 |
| M8 | 驗證 suite：golden STL 集（標準機械件）→ 體積/Hausdorff/面數自動對比 + tier 報告 | **Sonnet 5** fixture / **Haiku 4.5** 測試資產 / **Fable 5(我)** 驗收 | 4–6h（並行） | 07-27 |
| M8a | ✅ **完成 07-25**：golden 資產 7 件（box/cyl/sphere/cone/box孔/L架/階梯軸）+ ground_truth.json + 自驗（曲面 ≤0.45% = 鑲嵌誤差；平面 0.000%）→ tests/golden/ | Haiku 4.5 | — | 已交付 |

**🏁 MVP 里程碑（機械件 STL → 乾淨可編輯 solid demo）：07-27 朝（~48h）**
**Phase A 完整（含 Tier-2 + 圓角）：07-29**

### Phase B — 自由曲面 quilt（AI mesh 對策）
| # | 內容 | 模型 | ETA | 絕對完成 |
|---|---|---|---|---|
| M7 | NURBS quilt v1：用戶喺 mesh 上畫 patch 邊界（Design X/QuickSurface 同款 — 全自動 quad layout 係 research 級，唔承諾）→ PointsToBSplineSurface/GeomPlate → 縫殼 → editpoles/加厚/布爾/STEP | **Opus 5** fitting / **Sonnet 5** 邊界畫 UI | 12–16h | 07-29（同 Phase A 尾並行） |

### Phase C — 2D→3D
| # | 內容 | 模型 | ETA | 絕對完成 |
|---|---|---|---|---|
| M9a+b | ✅ **完成 07-25**（Opus 5，我複驗 23/23）：`src/io/imageTrace.ts` 950 行 + `centerlineTrace.ts` 417 行 + `tests/imagetrace.test.mjs`。圓半徑誤差 **0.009%**、圓角矩形角半徑 0.559% 且**自動推斷 4 條 H/V + 8 處相切約束**（即係入到嚟就係可標註嘅 CAD 草圖，唔係死線）；手繪 L 形中線 2 段、轉角精度 0.0047px。**誠實降級**：粗糙掃描出 13 條輪廓而唔係扮認到圓。落地行現有 SVG/DXF 管線（`res.shapes` → `extrudeFeatsFromShapes` 攞真 B-rep 弧邊，唔經 `impToSketchShape`，佢會將弧壓平成折線）。⚠ 跑測試要 `node --experimental-strip-types` | Opus 5 + 我 | — | **已交付（早 2–3 日）** |
| ~~M10~~ | ~~AI 生成 API 整合~~ **已剔除（2026-07-25 用戶決定：手動 input STL）**。AI mesh 照樣行 Tier C 路徑（現有 STL/GLB import → repair/simplify → quilt），只係唔做 API 自動化 | — | — | — |

### 收官
| 內容 | 模型 | 絕對完成 |
|---|---|---|
| 全管線串測（相→Meshy→STL→轉換→編輯→STEP 出）+ 部署 + 文檔 | **Fable 5(我)** 統籌 / **Haiku 4.5** 文檔 | **07-31 18:00 HKT 前（總計 5–7 日）** |

## 3. 關鍵風險（誠實）
1. **Tier-2 三面角點容差**：業界最痛位；緩解 = snap 先於求交 + 逐級退階（Tier-2→Tier-1→faceted，零回歸律已有先例）
2. **混縫 wasm abort**（worker:1901 已記錄）：FitWrapper 一律同質縫 + BRepCheck gate + null 合約
3. **RANSAC 500k 三角 TS 性能**：先 decimate 到 100-200k 互動檔；WASM scorer 做後備
4. **AI mesh 期望管理**：產品文案三句誠實承諾（A/B/C tier）+ deviation map 全路徑常開
