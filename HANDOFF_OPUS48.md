# HANDOFF → Opus 4.8（2026-07-07，Fable 5 交接）

> 你（Opus 4.8）接手 webcad 總經理。目標唔變：**UI/操作同 Fusion 360 一模一樣**（用戶 2026-07-02 確認嘅 P0~P6 計劃）。
> 用戶部機有 Fusion 360（`fusion360.exe`，computer-use 已批）可截圖對照 — **唔好靠記憶對 Fusion，睇真嘢**。
> 長期記憶喺 `~\.claude\projects\C--ClaudeCode\memory\webcad-gm-master-plan.md`（每批進度+鐵律都喺度，先讀佢）。
> ⚠ 舊 session 嘅 tasks/*.output spec 檔**全部 0 byte 已散失** — 本文檔係唯一自足交接源，寫齊晒。

---

## 0. 現狀快照（真相以 git log 為準，唔好信記分卡）

- **LIVE**: https://cad.neuralworkshk.com（bundle `index-36cq8h9q.js`）。部署：`python _redeploy.py`（**要同 `npm run build` 串行** — 並行會 EBUSY 撞 dist wasm）。
- **P0 ✅ 用戶驗收**；**P1 草圖 10/11 ship**（等用戶實戰畫真零件驗收）；**P2 立體建模 ~22 批 ship**（含用戶實戰 feedback #1 區域點選、#2 Fusion Profile 點選 P2v2）；P3-P6 未開。
- **測試**: `npx tsx tests/regions.test.mjs`（9 case）、`tests/meshfit.test.mjs`（8 case/30 斷言）、`tests/principal.test.mjs`（27）、`tests/formextrude.test.mjs`（27）等。**驗收 gate = `npm run build`（tsc -b 嚴格）**，唔係 `npx tsc --noEmit`（鬆，信唔過）。
- **Stop-hook 記分卡（Sketch 72/Mesh 72/…/Topo 45）系統性過時** — 12 條「最大缺口」有 9 條早已存在。**鐵律：實現任何「缺口」前先 grep-prove**。

---

## 1. 剩餘工作總表（優先次序由上而下）

| # | 項目 | 模塊 | 規模 | 狀態/資源 | 詳細方案 |
|---|---|---|---|---|---|
| 1 | ~~Mesh→B-rep B4 worker~~ | Mesh | — | ✅ **DONE** git d529576（v1 純圓柱坯→makeCylinder） | §2.1 |
| 2 | ~~Mesh→B-rep B5 store~~ | Mesh | — | ✅ **DONE** git d529576 | §2.2 |
| 2b | ~~Mesh→B-rep v2：box−cylinder 布爾重建引擎~~ | Mesh | — | ✅ **DONE v2.0 HOLES-ONLY**（軸對齊盒 − 圓柱孔，全高階 makeBox/makeCylinder/.cut → 零 sewing = 零 wasm abort；OPUS 設計 + headless A/B 驗：box+通孔 faceGroups **7**(真盒+真圓柱面) vs faceted 34；auto-detect convertMeshComponent 覆蓋 100%）。凸台/斜孔/圓角邊/L 形 → 誠實退 faceted（v2.1）。meshFit.ts `detectAxisBox`/`classifyBoxHole` worker+store 共用 | §2.3 |
| 3 | ~~拉伸 Start 字段（offset 起點）~~ | Solid Create | — | ✅ **DONE** git（起點沿法向偏移烘焙 baseZ；4 路徑全接） | §3.1 |
| 4 | ~~拉伸 Two Sides（兩側各自距離）~~ | Solid Create | — | ✅ **DONE**（純 store 對稱居中路，全平面驗；arb −side2 shift） | §3.2 |
| 5 | ~~即時預覽補齊：斜面(arb) ghost~~ | Solid Create | — | ✅ **DONE**（arb ExtrudePreview+RegionPickLayer；toface 預覽仍可加 v2） | §3.3 |
| 6 | ~~孔沿面法向鑽（斜面孔）~~ | Solid Create | — | ✅ **DONE v1**（簡單圓孔通/盲沿拾取面法向鑽 — 重用 worker arbPlane 切割路徑，零內核改動；headless 驗：45°斜孔 tri 12→162 valid solid，-Z 孔零回歸）。cbore/csink/腰形/攻牙/螺母陷阱 喺斜面仍 -Z（v2） | §3.4 |
| 7 | ~~陣列 Object Type=Bodies（泊車體陣列）~~ | Solid Create | — | ✅ **DONE**（worker +bodies 旗逐泊車體 fuse 副本；對話框 checkbox）；面-scope 仍可加 v2 | §3.5 |
| 8 | ~~Loft Closed（首尾接龍閉環）~~ | Solid Create | — | ✅ **DONE**（≥3 截面重複首 wire C0 近似，誠實標；守衛<3） | §3.6 |
| 9 | ~~New Component（時間線級組件）~~ | Assembly | — | ✅ **DONE**（sketchAsComponent flag → freeze-then-build，重用 newComponent undo-safe；🧩新组件掣） | §3.7 |
| 10 | ~~區域點選 v2：newbody 有效 profile 數~~ | Sketch/Solid | — | ✅ **DONE**（單一區域 newbody 唔降級）；框選/arb-面-pick 仍可加 v2 | §3.8 |
| 11 | ~~datum 關聯化 v2~~ | Construct | L | ✅ **DONE v2 CARDINAL**（純 store 零內核，byte-compat 安全網）。**機制**：sketchSource 加 `datumRef{idx,base}`（⚠ 用 array index 做 key，唔用 srcNear —— rederiveDatums 會把 src.near 更新到新面位置故 srcNear 面移動後必失配）。sketchOnDatumPlane 匹配關聯 datum(有 src) findIndex → 存 `_pendingDatumRef` → commitStandaloneSketch 寫入 source.datumRef；exitSketchMode 清防洩漏。applyFeatures 尾(rederiveDatums 後)加**守衛 2-pass**：`_rebakeDatumSketches` 純函數 datum 移動→源+依賴 extrude baseZ 用 delta 重烘焙(守本地偏移)→ set sources + 再叫【現有】applyFeatures(`_datumRepassGuard` 防遞歸；唔郁其 faceColor/edgeFp/history 內部)。**byte-compat 鐵性質**：無 datumRef 草圖源 → `_rebakeDatumSketches` 返 null → 零第二趟 = v1 逐字節。**驗**：core 邏輯 node `tests/datum-v2.test.mjs` 9/9(移動跟/byte-compat null/本地偏移守/stale/index-drift guard/多源隔離) + live byte-compat(正常 box+cut 零 datumRef 洩漏零回歸) + tsc strict。角度面(arb datum)associativity = v2.1；2-pass 產生雙 undo entry = 已知 v2 minor | §4.1 |
| 12 | ~~Move Face rotate~~ | Direct-Edit | XL | ✅ **DONE 真 hinge-rotate，ZERO 內核！**（推翻 probe「kernel-gated」結論 —— probe fixate 咗 ReplaceFaceNear、**miss 咗 DraftAngle**）。**關鍵洞察**：OCCT `BRepOffsetAPI_DraftAngle`(拔模，已綁 yml:219、worker:3351 用緊)**本質就係「面繞中性∩面線旋轉 θ° + body 自動癒合」= face-rotate**。新 `rotateFaceAt`(store)：拾平面 → 中性面法向 = **鉸軸(X/Y/Z) × 面法向(先 three→CAD [x,-z,y])** → neutral∩面 = 過拾取點鉸線 → 構造 draft feature(reuse 已證路徑，同 #6/#2b)。rotateFaceMode + toggleRotateFace + Viewport(selector/cursor/armed/pick) + ribbon「旋轉面」+ runCommand。**live 端到端驗**(resolveDialog 驅真路徑)：box 頂面繞 X 鉸 15° → topZ 20→22.68 tilted + side 面癒合成梯形 + valid solid 12tris + failed 0。~~replaceFaceAt 斜角(保 pick 側楔形)~~ 亦保留做「斜削」。**內核 toolchain 已驗證可重建**(baseline build 重現當前 wasm bit-size 一致)但 #12 唔需要 | §4.2 |
| 13 | ~~Assembly 3D 閉環約束求解~~ | Assembly | — | ✅ **DONE v1**（新純模塊 `assembly/mateSolve.ts`：mate-residual Gauss-Newton + Levenberg，6DOF/件 euler-XYZ，數值 Jacobian；grounded/pin 固定；**發散/NaN → revert snapshot 絕不爆炸**；過約束 mateResidual + Grübler mobility 診斷。store `solveMates()` action，mate-create grounded-gated 觸發閉環同時求解。OPUS 設計 + **Node 測 9/9**：coincident/gap/coaxial 殘差~1e-10mm、grounded 不動、過約束 flag、finite）。live-drag throttle = polish 跟進 | §4.3 |
| 14 | ~~Topo-naming 拓撲指紋~~ | Topo | XL | ✅ **DONE v1 FACES-ONLY**（新純模塊 `cad/topoFingerprint.ts`：面拓撲指紋 = 面+鄰接面幾何類型環 canonical hash，`buildEdgeToFaces`+`topoFaceHash` 全 try/catch 退化返空串）。**有界加法 tiebreaker**：只喺 `_ffSelectPts` 幾何指紋撞（`counts>1` 對稱體歧義分支）先用拓撲 hash 破 tie，唯一命中先採信，否則 fall through 落今日 near-biased。byte-compat：feature 無 `faceFpTopo`（含所有舊件）→ 逐字節現行行為，**絕不回歸無歧義常見 case**（結構性保證：topo 只入已失敗分支）。捕獲 `_ffCapture` 同 v1/v2 平行、worker→store `resolvedFaceFpTopo` 寫回 feature（shell/pushpull/toFace/delface/splitface/replaceface/draft 7 consumer 全接）。OPUS 實現 + **3 層驗**：mock 單元 11/11（判別/canonical/退化/誠實孿生撞）、**真 OCCT 幾何 7/7**（accessor 真 shape 上通、圓角 box 頂面 vs 平 box 頂面可分）、既有 fp/wiring 回歸 37/37 零擾動、tsc strict 綠。邊/fillet 拓撲指紋 = v1.1 | §4.4 |
| 15 | Bridge per-side G1 | Surface | 內核限制 | **OPUS kernel probe 定案**：`BRepOffsetAPI_MakeFilling + Add_2(edge,face,GeomAbs_G1)` **已綁定 + 唔 hard-abort**(catchable，kernel 存活，異於 G2)——**倉庫 `boundarypatch`(worker 2819-2916)已用緊呢條 per-side G1 路徑**(拾 N 邊 + boundaryPatchTangent → Add_2 G1)，即 **per-side G1 best-effort 能力已 ship**。但決定性反證:G1 約束「接受但不求解」，真彎 blend MakeFilling 只滿足 G0，G1err 達 45° → **真保證 G1/G2 blend = kernel 天花板**(需綁 GeomPlate_BuildPlateSurface，未綁，WSL2 重建)。surfbridge 用 ThruSections 同 MakeFilling 語義唔互換，加 surfbridge-G1 邊際價值低(能力已在 boundarypatch)。G2 永不做(hard-fault) | §4.5 |
| 16 | ~~P2/P3 audit grep-prove~~ | 全部 | — | ✅ **DONE**（Explore agent 掃 57 條：19 STALE 已做 / 23 REAL / 15 UNCERTAIN；報告存 `_audit_verify_report.md`）⚠ 報告本身有 false-REAL（fillet 成條高亮/Edit Feature 擴展/cosmetic 螺紋 佢話缺其實已 ship）→ 實現前照樣 grep-prove | §5 |
| 17 | P4 ✅ → **P5 ✅** → **P6 AI 教學輔助 v1 ✅** | phase | XL | **P4+P5+P6·v1 DONE**；P6 剩圖像指引 v1.1 + 全代畫增強 | §6 |
| 17·P6 | ~~AI 教學輔助 v1（問點用→指出+示範）~~ | AI | — | ✅ **DONE v1**（**復用現有 AiCopilot**：webcad 已有完整 AI Copilot = AiCopilot.tsx + ai/providers.ts 多供應商 LLM + ai/tools.ts 35 工具 + store.aiTool agentic loop。P6 只補「指出+示範」銜接）。新 `ribbon.ts:searchRibbonCommand(query)`（中文問句模糊匹配真命令，node 測 13/13）+ store `teachHi` state/`teachCommand` action + aiTool `explain_command` case（AI 問點用 → grounded 到真 ribbon 位置，唔再靠估）+ Ribbon.tsx `data-cmd` 30 掣 + useEffect 監聽 teachHi 切 tab 後脈衝高亮個掣 + CSS `.teach-pulse` 呼吸光環。**preview live 驗端到端**：同 tab（倒圓角→fillet SOLID/MODIFY/F）+ 跨 tab（風洞→windtunnel 🧪實驗室，切 tab 後掣入 DOM）都 `hasPulseClass:true`。byte-compat 全 additive，未郁 cad.worker/Viewport 熱路徑。**v1.1 圖像指引 ✅ DONE**：新 `TeachPointer.tsx`（掛 App.tsx 頂層 overlay）—— teachHi 變 → getBoundingClientRect 對齊個真掣，喺掣下方浮【彈跳橙箭頭 + 命令名 pill】指住佢，`pointer-events:none` 絕不阻掣、resize/scroll 重定位、3.4s auto-dismiss。teachHi 擴 `label` 字段。preview live 驗：`alignOffsetPx:0`（箭頭完美對準掣中心）+ pill「圆角」+ belowButton + z-index 25000 + 脈衝同時作用。⚠ **dev-server oxc gotcha**：preview 唔反映 store.ts 改動但 `npm run build` 過 → vite:oxc dev-transform 卡喺 14.8k 行 store.ts（stale/partial parse，報假 PARSE_ERROR），**preview_stop+start 重啟 dev server 即清**（build 係權威 gate）。**全代畫 v2 ✅ DONE（第一批）**：ai/tools.ts + store.aiTool 加 5 個無需拾取嘅參數化建模工具 —— `create_wedge`(斜坡 a=長/b=寬/c=高)、`create_dome`(球冠 a=半徑/c=冠高0=半球)、`create_half_cylinder`(D形)、`create_pie`(扇柱 a=半徑/b=角°/c=高)、`create_pyramid`(cone+sides≥3 棱錐/棱台)。全 `mk({type:'prim',shape})` 同 create_box 同 pattern，零風險。AI 建模詞彙 5→10 shape。preview live 驗 5/5 返 ✓ + 起有效幾何(wedge 8tris/dome 1239/halfcyl 128/pie 76/pyramid 728,零 crash)。工具總數 35→40。後續可加 sketch_extrude(任意 profile，需 profile 構造)/pattern 陣列 | §6 |
| 17·P5 | ~~仿真可信度評估~~ | Sim | — | ✅ **DONE**（8 模擬器並行 Workflow benchmark vs 解析基準 → `_P5_sim_credibility.md` 量化評分卡）。FEA 四子系【定量可信】：靜力 3.5% vs Timoshenko、屈曲 0.3% vs Euler Pcr（截面≥6vox）、模態 0.53% vs EB、熱 6.8%(bulk σ)；SIMP 體積約束 0.003%；wind LBM + moldflow =【趨勢級 by design】方向/單調/排序全對（記憶鐵律，唔當 bug）。對抗 re-verify 屈曲數字對得上 probe2。**item#1「占空比當體積」grep 證偽**（用戶 mass 用 massProps.ts 精確，占空比只做 FEA 剛度加權）。**已順手 ship item#4：modal(runVoxelModal)+buckling(runVoxelBuckling) 加「截面<4體素跨度→欠解析不可信」誠實警告**（純 additive，byte-compat，probe1 觸發/prestressed-modal 回歸零擾動）。top follow-on lever = item#2 resolution 按最短軸保證截面體素數（solver 行為改動+nVox 預算耦合，dedicated session）| §6 |

---

## 2. Mesh→B-rep 參數化推斷（最高優先 — 半成品在庫）

### 2.1 B4：worker `meshToBrepShape`（改 `src/worker/cad.worker.ts`，monolith 串行做）

**已有嘅分析層（B1-B3，唔使再做）**：`src/geom/meshFit.ts` 導出：

```ts
fitPrimitives(vertices, triangles, opts?) → MeshFitResult
// MeshFitResult = { primitives: MeshPrim[](按面積降序), planeCount, cylCount, facetedTriCount, totalTriCount }
// PlanePrim = { kind:'plane', normal:[x,y,z](單位,外向), d(normal·x=d), area, rms, triIndices, boundaryLoops }
// CylPrim   = { kind:'cyl', axis(單位), origin(h=0 圓心), r, h0, h1, t0, t1, full, refU, area, rms, triIndices }
```

**boundaryLoops 語義（B4 直接用，meshFit.ts:561-573 有註釋）**：
- `boundaryLoops: [[x,y,z][]] []` — 每平面區嘅邊界環；每環係 3D 頂點坐標（**焊接後規範位置**，唔係原始索引）。
- 首尾唔重複（隱式閉合）。`loops[0]`=外環 **CCW 相對 normal**（右手定則）；`loops[1..]`=孔 **CW**（方便直接 trim）。按 |有向面積| 降序。
- 共線點未簡化（可先 collinear-merge）。退化 patch 可能空 `[]` → fallback faceted。
- 圓柱：`full=true` 閉合側面；否則 `[t0,t1]` 弧段，0 角=refU 方向、正向=axis×refU、origin=h0 平面圓心。

**B4 施工步驟**：
1. worker 新函數 `meshToBrepShape(verts, tris, fit)`：
   - **平面區** → 每環 `BRepBuilderAPI_MakePolygon` 砌 wire（外環+孔環）→ `BRepBuilderAPI_MakeFace_15(plane, outerWire)` + 孔 wire `face.Add`（孔 CW 已啱向）。
   - **圓柱區** → `gp_Cylinder`（axis/origin/r）→ full: `BRepBuilderAPI_MakeFace_10(cylSurface, h0, h1…)`；弧段: `MakeFace_17` 帶 UV 範圍（U=角度 t0..t1, V=h0..h1）→ **`BRepLib::BuildCurves3d_2(face)`**（冇佢 sewing 會炸 — 前 session probe 證實 binding 存在）。
   - **混合** → 全部面掉入 `BRepBuilderAPI_Sewing(1e-3)` → `SewedShape`；如果係閉殼 `BRepBuilderAPI_MakeSolid`；唔閉 → 誠實降級。
2. **三層退路**：①全參數化（cover ≥95% 三角）②Prismatic（淨平面區參數化 + 其餘 faceted patch 一齊 sew）③照舊 faceted（現有 `convertMeshComponent` 路，S46）。每層失敗落一層 + `warnings.push` 誠實講。
3. `Feature type 'meshbody'` += `fit?: 'param'|'prismatic'|'faceted'`（additive，舊檔 undefined=faceted 逐字節）。
4. 驗收 oracle：閉合圓柱 STL → 轉換後 shape 有真圓柱面（`detectAllCylinders` 搵返 axis/r 一致）+ 可以直接圓角邊（faceted 版做唔到嘅事）。

### 2.2 B5：store 接線（`src/store.ts`）

- `convertMeshComponent` 入口跑 `fitPrimitives`（web worker 主線程都得 — 30k tri <500ms 實測），成功→傳 `fit` 落 worker feature；覆蓋率報 status（「識別 N 平面 M 圓柱，覆蓋 xx%」）。
- UI 逃生門：轉換對話框/命令加「Faceted / Prismatic / 參數化」三揀（默認自動=按覆蓋率揀最高可行層）。
- **持久化鐵律**：`fit` 字段入 feature 唔使另外做 loader；但如果加任何新 top-level state → buildProjectPayload + **3 個 loader**（applySnapshot/applyProjectData/restoreAutosave）+ reset()。

---

## 3. P2 audit 開放隊列詳細方案

排序清單喺 repo `_p2p3_open_gaps.json`（57 open，value 排序）。已做咗嘅唔好重做 — **逐條 grep-prove**。重點項：

### 3.1 Extrude Start 字段（M）
Fusion 拉伸有 Start = Profile Plane / Offset / Object。做 Offset 先（最常用）：featDlg/extrude 對話框 +「起点偏移」數字（默認 0 = 舊檔逐字節）→ commit 時 `baseZ += offset`（草圖面法向）。斜面（arb）路徑用 arb 法向位移 origin。Edit Feature 白名單記得反填。

### 3.2 Two Sides（L）
兩側各自距離+各自拔模。Feature += `height2?/draft2?`（additive）。worker：主 extrude 做兩次（+n 同 −n），fuse 埋一齊先入布爾。UI：範圍 +「两侧」掣，出第二距離行。symmetric 係 height2=height 特例，唔好郁佢舊路。

### 3.3 即時預覽補 toface/arb（M）
`ExtrudePreview`（SketchLayer.tsx）early-return `arb` — 補：`arbFrame(arb).lift` 代替 `SK[plane].lift`（CanvasImageLayer 有現成 idiom）。toface：extrudeToFaceOff 有值時 z1=目標面（RS 符號表喺 store extrudeSketch）。**區域子集 ghost P2v2 已做**。RegionPickLayer 嘅 arb 支持同款 lift 換掉即得（而家 `if (arb) return null`）。

### 3.4 孔沿面法向鑽（L）
而家 addHole 永遠 -Z。斜面孔要 feature += `dir?: [x,y,z]`（默認 undefined=-Z 逐字節）；worker 鑽孔圓柱起喺 pick 面、軸=面法向（holePickAt 已收 detectFace 法向，透傳落 feature 即可）；沉頭/埋頭錐同軸旋轉。開工前 grep `holeFaceZ` 睇批1 改動範圍。

### 3.5 陣列 Object 多選（L）
pattern/circpattern target='feature' 已食 selectedFeatures[]（多選 ship 咗）。剩：**體+特徵混合** + Fusion 嘅 Object Type 下拉（Faces/Bodies/Features/Components）。做 Bodies 選項：對 parkedBodies 做陣列（worker 收 bodyIdx[]，逐體 copy+translate 泊車）。

### 3.6 Loft Closed（M）
`loftSections` 首尾自動接龍。worker ThruSections 有 continuity 參數；OCCT `AddWire` 後 `SetSmoothing`/closed 旗 — probe 下 `ThruSections` binding 嘅第 4 參數（isClosed 唔喺 constructor — 要 probe 先知有冇暴露）。冇 binding 就手動：最尾 section 重複第一個 wire 近似閉環，誠實標「近似」。

### 3.7 New Component（L）— 原 spec §7 要點（檔已散失，靠呢段）
Fusion「New Component」= 時間線級容器：之後嘅特徵入晒佢個 scope。**風險**：webcad undo 係雙棧（草圖局部 + 全局），timeline 凍結語義會同 extgroup/suppressed 互搏。**v1 等效路徑已存在**：先建體 → 「新建组件」命令（startNewBody + newComponent）。做之前同用戶確認值唔值 L 成本。

### 3.8 區域點選 v2（S-M，P2v2 收尾）
- **框選**：RegionPickLayer 加 drag-rect（screen space）→ faces 質心投影入 rect 就 toggle。Fusion window-select 對齊。
- **newbody 有效 profile 數**：commit 嘅 newbody 降級判定用 `_nbN`（全部 shape 數）— 子集揀 1 個區域時應該用「有效發射 profile 數」（exactPick/chosenP 長度），唔應降級 Join。搜 `_nbN` 一處改。
- ExtrudeArrow 零鬼影（區域全唔選）時隱藏（cosmetic）。

---

## 4. 深水區（獨立專項 session 規模）

### 4.1 datum v2 — 特徵烘焙值重烘
v1（已 ship）：datum 自身跟源面（`rederiveDatums`，store.ts 搜呢個名）。v2 = sketch-on-datum 嘅特徵 baseZ/arb 係烘焙值，datum 郁咗特徵唔跟。方案：feature += `datumRef?: {id, offsetAtBake}`，applyFeatures 前置 pass 對比 datum 而家 vs 烘焙 → 重寫 baseZ/arb 再 rebuild（**一次過改晒先 rebuild，唔好逐個觸發循環**）。

### 4.2 Move Face rotate（XL — 內核重建）
pushpull 走 DirectEditWrapper（純 JS 面擠+布爾），wrapper 6 op **冇 rotate**。要新 C++ `RotateFaceNear`：
- 重建流程：**Docker Desktop 壞咗（reset-exit-150 loop）— 用 WSL2 Ubuntu 原生 docker**（`wsl -d Ubuntu -u root`），`custom_build_plus.yml` 有**兩份 copy 要同步改**，`wsl_build.sh` ~6min。詳見 memory `webcad-kernel-rebuild-docker.md`。
- C++ 面：搵 face by near point → `gp_Trsf.SetRotation(axis)` → `BRepBuilderAPI_Transform` 淨郁嗰面 → reheal（同 MoveFaceNear 現成 C++ 做法平行，抄佢）。
- TS 接線：抄 `movefacenear` 慣例（store 拾面+worker 分支+faceFp 寫回）。

### 4.3 Assembly 3D 閉環求解（XL）
S51 已有 joint-graph Newton（運動學回放）。缺：mate 約束嘅 3D 閉環求解（拖一件全鏈跟手 + 過約束診斷）。起步：將 S51 求解器由「驅動角度→位形」推廣到「mate 殘差最小化」（每 mate 出 residual 6-vector，Gauss-Newton，DOF 鎖定用 S57 修正表）。同 Fusion 對齊嘅驗收：四連桿拖拽實時、grounded 傳播、衝突紅標。

### 4.4 Topo-naming 拓撲指紋（XL）
faceFp v2（幾何 near-point + 對稱 tiebreak）已 ship。下一級：面鄰接圖 hash（面 kind + 鄰接 kind 環序列做 canonical hash），重建後匹配優先 topo-hash、幾何做 fallback。影響全部 fp 消費者（fillet/shell/pushpull/toFace/datum src…）— 要一次設計、分批遷移，**唔好半桶水混用兩制**。

### 4.5 Surface Bridge v2
per-side G1（每側獨立相切）= ThruSections 做唔到，要 GeomFill/BRepFill profiles — probe binding 先。**G2 選項永不加：`tests/surface-g2-probe.mjs` 實證 wasm hard-fault，UI 唔可以暴露**。

---

## 5. Audit 未驗 findings（~60 條）
上一輪 verify 艦隊兩次死於 session limit；`resumeFromRunId` 只限同 session — **已死**。清單本體喺 `_p2p3_open_gaps.json` + `_p2p3_confirmed_batch2.json`。處理法：實現前逐條 grep-prove（過往 9/12「缺口」係假 — 誤報率高，唔值得先驗證後實現，直接喺實現時 prove）。

## 6. P4-P6
- **P4 巡檢**：Workflow 多 agent 並行掃（每模塊一 agent 走真用戶流程 + 對抗 verify）— 用戶開咗 ultracode，放心 fan-out。
- **P5 仿真可信度**：模流/FEA/風洞 vs 解析解/文獻量化誤差報告。**趨勢級係 by design（memory `webcad-wind-tunnel.md`）— 做評估，唔係亂改**。
- **P6 AI**：AiCopilot 骨架已有（src/components/AiCopilot.tsx + src/ai/providers）。先教學輔助（指出/示範+圖像指引），掂咗先全代畫。

---

## 7. 鐵律 checklist（違反過、修過、唔好再犯）

1. **三巨石串行**：store.ts（~14k 行）/cad.worker.ts/Viewport.tsx 只可以主循環串行改；agents 淨做並行審計/測試/獨立新檔。
2. **build gate**：`npm run build`（tsc -b 嚴格）先算過；`npx tsc --noEmit` 係鬆 config 假陽性。
3. **build 同 deploy 串行**；deploy 完先 build 下一批。改完代碼要 build+deploy 先算完工（memory 鐵律）。
4. **_redeploy.py 憑證（VPS 38.242.215.29）永不打印/暴露**。
5. **凍結模塊**：CAM/鈑金/工程圖/數據 — 唔講唔郁。
6. **G2 連續性永不入 UI**（wasm hard-fault）。
7. **editFeature 三分語義**：patch key 唔存在=透傳、顯式 undefined=刪 key、有值=覆蓋。edit-commit 要清可選字段就顯式發 undefined；要透傳用條件展開 `...(x ? {x} : {})`，恒發 `x: maybeUndefined` 會誤刪。
8. **raycast 法向**：`e.face.normal` 係 mesh LOCAL=活動體 CAD 座標，直接用；要 world 先 `.transformDirection(e.object.matrixWorld)`。對 LOCAL 套 three→CAD = 雙旋轉 90° bug。CAD↔three：lift (x,y,z)→(x,z,−y)；three→CAD [x,−z,y]。
9. **i18n tStatus 子串替換**：唔可以加單字/超短 key（'处'/'清除' 級數會污染全 app tooltip）— 用長 phrase 或 JSX lang 條件。
10. **持久化新字段** = buildProjectPayload + 3 loader（applySnapshot/applyProjectData/restoreAutosave）+ reset()。
11. **舊檔逐字節相容**：feature 字段一律 additive，undefined=舊行為。
12. **grep-prove-before-implement**：記分卡/audit/記憶講嘅「缺口」先 grep 證實未存在。
13. **驗證用碼內 consumer 做 oracle**：手砌測試輸入若跟自己假設會 self-consistent 假通過（PushPull 90° 教訓）。
14. **preview 背景 tab**：rAF 停晒 — screenshot/rAF eval 會 timeout；用 `window.useApp.getState()` headless 驗 state/mesh（bodyMesh.vertices=CAD 座標）+ 自開 WebGLRenderer 同步 render 驗 shader。`extrudeSketch()` 參數唔係高度（用 extrudeHeight state）；`reset()` 唔清 features — 清就 `setState({features:[]})+applyFeatures()`；autosave 會喺 reload 番生舊件。
15. **three program cache**：onBeforeCompile closure 變化唔改 cache key — 要 `customProgramCacheKey`。
16. **模型分工**：機械活 haiku、審計/設計 sonnet/opus。用戶要求 opus-first 做 subagent。
17. **回覆用戶一律中文/廣東話**；每階段完成 = 部署+簡報+用戶驗收先入下階段。
18. UI/交互 bug 描述唔清 → 叫用戶撳右下「🩺诊断」錄製貼報告（memory `webcad-debug-record-mode.md`）。

## 8. 檔案地圖（今批相關）
- `src/sketch/regions.ts` — 平面排布+DP 簡化+PFace 孔+exactProfileAlgebra（純函數，node 可測）
- `src/geom/meshFit.ts` — Mesh 推斷分析層（B4 嘅輸入）
- `src/store.ts` — openExtrudeDlg（~L3998）/ extrudeSketch commit 區域邏輯（~L8480）/ rederiveDatums / editFeature（~L11026）
- `src/components/SketchLayer.tsx` — RegionPickLayer / ExtrudePreview
- `src/components/Viewport.tsx` — extrude 對話框（~L4884）/ 各 CommandDialog
- `src/worker/cad.worker.ts` — 特徵重建 + surfbridge/edgePolylineAt/previewRound
- `_p2p3_open_gaps.json` / `_p2p3_confirmed_batch2.json` — audit 隊列
