# R1 修改圆角 — 内核可行性 + 实现配方（调查结论，2026-07-11）

**总判定：三种圆角今波全部纯 JS / 原核可落地，无需重编内核。** 缺的 `BRepFilletAPI_MakeFillet2d`/`BlendFunc`/`ChFi3d_FilBuilder` 均不在推荐路径关键路上。

## 内核已暴露（证据：`C:\ClaudeCode\replicad-src\packages\replicad-opencascadejs\build-config\custom_build_plus.yml`）
- `BRepFilletAPI_MakeFillet`(:229) / `MakeChamfer`(:230) / `LocalOperation`(:228)
- 变半径律全绑：`Law_Function/Linear/Composite/Interpol/BSpFunc/S`(:179–185) + `TColgp_Array1OfPnt2d`(:19)（(U,R) 数组）
- G1 补面：`BRepOffsetAPI_MakeFilling`(:226) + GeomPlate 全家 + `PlateWrapper`(:283–291) + `BRepFill_CurveConstraint`(:288)
- 面运算：`BRepAlgoAPI_Splitter`、`BRepBuilderAPI_Sewing`(:206)、`ShapeFix_*`、`BRepExtrema_DistShapeShape`(:195)、`BRepAdaptor_Surface/Curve`、`BRep_Tool`
- **未暴露**：`MakeFillet2d`、`BlendFunc`/`BRepBlend_*`、`ChFi3d_FilBuilder`（面-面滚球内核机器）—— 但推荐路径都不需要。

## 现有圆角实现（`src/worker/cad.worker.ts`）
- `roundEdges`(:467–485)、`roundNearPoints`(:1169–1264) 走 replicad `shape.fillet(rad, finder)`，`rad`=number|`[r0,r1]`（线性锥变半径已 live :1256）。
- 逐边变半径(:1233–1254)=按半径分组逐组 scalar fillet。
- **raw OCCT 范式已成熟**：`_oc.BRepFilletAPI_MakeFillet_2`(:4692) + `mk.Add_2(radius,edge)`(:4703–4712)，`Build/IsDone/Modified/Generated` 全 work（`lineage.ts:178–224 filletWithHistory` 现役）。

## 1. 弦高圆角 chord-length —— 纯 JS 精确
- 数学：`c = 2r·cos(β/2)` → **`r = c/(2cos(β/2))`**（β=局部二面角；盒边 β=90° → r=c/√2）。
- 等角边（直边接两平面，β 恒定）：两邻面法向算一次 β → c 换 r → 调现有 `shape.fillet(r,finder)`。**精确、零内核改动。**
- 变角边（曲边）：沿边采样 N 点算 β(tᵢ)→rᵢ → 粗版用现役 `[r0,r1]`；精版 raw `MakeFillet.Add_5(TColgp_Array1OfPnt2d{(Uᵢ,rᵢ)}, edge)`（需一行 `typeof mk.Add_5==='function'` 探针，replicad 二元组已证 Add_3 可达→Add_5 极可能自动生成）。
- store：fillet feature 加 `mode:'chord'`+`chord:number`（镜 radius2/radii 多参范式 store.ts:3587/11331）；lineage 按等效半径录(:193 不受影响)。

## 2. 收进圆角 setback —— 诚实窄版（纯 JS 原核）
- OCCT setback 距离参数在未绑的 `ChFi3d_FilBuilder` 内 → 不绑（脆弱）。
- **窄版**：半径向共享顶点递减（radius-taper recession）—— 识别共享顶点邻接边 → 每边建 (U,r) 律：中段=目标 r、近顶点段线性降到 r·(1−setbackRatio) → raw Add_5 组装。复用 §1 律动器。UI 加「收进量」滑杆。
- 真角补片（PlateWrapper.BridgeG1 重建角面）= 更逼真但依赖 cad2 改核，后置。

## 3. 面圆角 face-fillet（两不相邻面，无共享棱）—— clean-room 窄版（纯已暴露 API）
- `MakeFillet` 强制需共享棱 → 不能直接做；真滚球机器(`BRepBlend_*`)未绑 → 不绑。
- **clean-room（≈80% 复用已交付 boundarypatch+BridgeG1+面裁）**：
  1. 算两切线：半径 r 球同切两面之切点轨迹（平面/柱面对解析解；一般曲面沿法向偏置求 spine 再回投）。用 `BRepExtrema_DistShapeShape`/`BRepAdaptor_Surface`/`GeomAPI_ProjectPointOnSurf`（全暴露）。
  2. 造 G1 blend 带：两切线作边界，`PlateWrapper.BridgeG1`（已交付 cad.worker.ts:3342–3368）以两源面 G1 约束；原核退回 `BRepOffsetAPI_MakeFilling` Add(edge,face,G1)（boundarypatch 已用 :3296–3340）。
  3. 裁面+缝合：`BRepAlgoAPI_Splitter` 裁两面到切线（范式 yml DirectEditWrapper::SplitFaceNearByPlane :448）→ `BRepBuilderAPI_Sewing`+`ShapeFix_*` 缝回实体 → HARD FLOOR 保旧形。
- 新增 `facefillet` feature（拾两面近点+r）。窄版覆盖平面/柱面对（常见工况）；一般曲面滚球+真 G1 = 后续（可借已证可编的 cad2）。

## 重编管线（若日后要真 G1 品质版）
`BUILD_CAD2.md` 已证跑通：`wsl -d Ubuntu -u root -- bash -l .../wsl_build_stage.sh`（~5-6 分钟，薄绑定层）。cad2=自建 MODIFIED 内核含真 BridgeG1。今波三种圆角都不需此步。
