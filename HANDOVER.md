# webcad 开发交接 (HANDOVER) — 2026-07-12

> 交给下一个 AI account 继续开发。读完呢份 + `DEVLOG.md`（顶部近 20 条）+ 记忆库（见尾）即可接手。**用广东话回覆用户**（非程序员，Cantonese-speaking）。

---

## 0. 一句话现状

webcad = 浏览器参数化 3D CAD（clean-room Fusion 360 克隆），LIVE 喺 **cad.neuralworkshk.com**。当前线上 build = **`index-A9aHJyV1.js`**，用**改核**（自建 MODIFIED OCCT wasm 11,721,677 B，含 GeomPlate G1 绑定）。本地树 `tsc --noEmit=0` 干净但有 ~170 未提交文件（见 §4）。用户角色 = 总经理/拍板；你角色 = 总参谋/GM：计划→按难度派模型→QA/验收→部署。**Ultracode is ON**：每个实质任务用 Workflow 对抗式验证。

---

## 1. 用户上一个指令 + 当前进度

用户指令：**「combine cad2 into cad and then remove cad2, 做架构级重写」**（冲 Fusion parity 100% 方向）。

- ✅ **K1 完成**：cad2 改核合并入 cad（换核 + 7 项几何 battery 逐字节验证 == 原核 + 部署 `index-A9aHJyV1.js`）。
- ✅ **K2 完成**：移除 cad2（nginx cad2.conf + /var/www/webcad2 + _redeploy_cad2.py 删除，nginx -t 安全闸后 reload；cad production 完好 HTTP 200）。
- 🔵 **AR1 进行中（未开始改文件即被暂停）**：装配 occurrence **P3 多体子容器 + P4（suppress 传播 + 4×4 matrix）**。工单见 §5.1。**从头重做即可**（AR1 停喺读取阶段，零改动）。
- ⏳ 未开：四视口、3D 草图、R1 真面圆角 B-rep blend（现改核已在 cad，可用 BridgeG1）。

---

## 2. ★ 方法论（铁律，必须跟）—— 本 session 靠佢揪出 21 个真 bug（含线上 SEV + data-loss）

每波：**实现 agent（串行占 monolith）→ 对抗式多 agent workflow → GM 修 → 聚焦 render-safety 对抗核查 → 真内核/canvas 实证 → tsc 双 gate → 部署 → 线上验**。

**两条血泪教训（务必做）：**
1. **canvas 必须真 render**：headless `store` 驱动 pass ≠ app 正常。曾连续 4 波把「Viewport render scope 引用只在子组件 KernelBody 声明的变量」→ runtime ReferenceError → 整个 3D 视口 crash 空白，骗过 tsc=0+build+store 测试。**部署前必验** `document.querySelector('canvas')` 存在 + `.vp-navbar` + body 无「出错/渲染出错」文字 + applyFeatures 后 canvas 仍在。
2. **存档往返几何 byte-identical**：R2 揪出 buildProjectPayload mesh 序列化 2x → 撞爆 localStorage 5MB → 静默恢复旧档丢工作。改序列化后必做：建组件→autosave→刷新→验 vol 无损。

**对抗式 workflow 模式**（Ultracode）：4 维 review（render-safety / byte-compat / 功能正确性 / 回归）并行 → 逐发现对抗 verify（默认证伪，除非读代码确证）→ GM 修确认的。见本 session 的 x3/x4/r2-adversarial-verify workflow 脚本（`.claude/.../workflows/scripts/`）。

---

## 3. 部署协议 + 验证工具

```
1. node_modules/.bin/tsc --noEmit   → EXIT 0（我的标准 gate）
2. node_modules/.bin/tsc -b --force → EXIT 0（更严；本 session 已清零旧债，别弄红）
3. 逐 test：npx -y tsx tests/<name>.test.mjs  （测试 import .ts 源，必须用 tsx 唔系 node）
4. node_modules/.bin/vite build     → 记 index-<hash>.js
5. headless QA：mcp Claude_Browser preview_start {name:'webcad'} → javascript_tool 驱动真 window.useApp.getState()（dev preview 有；prod 冇 useApp）→ 验 canvas + 几何 vol
6. python _redeploy.py （前台，background 会 hang；改核 wasm 11.7MB 上传慢，命令或 10min 超时属正常）
7. curl 验证：index-<hash>.js 200 + assets/replicad_plus-<hash>.wasm 200 size=11721677
8. DEVLOG.md 顶部 prepend 一条 + 广东话简报用户
```
几何验证 idiom：网格有符号体积（散度定理）比对基线 —— box 24000/12t · fillet_r5(nears:[[0,15,20]]) 23783.16/60t · sphere(a18) 24284.99/2426t · chamfer_3 23980/16t · shell_2 7152/28t。prim enum = box/sphere/torus/cone/wedge/dome/halfcyl/pie（用 a/b/c，冇 cyl；sphere 半径=a）。

---

## 4. 工作树状态（重要）

- **git repo，分支 main**，最后 commit `a1537c1`（早过本 session）。
- **~170 未提交文件** = 本 session 全部已验证已部署工作（X3/X4/R1/R2/#174/K1 换核 + DEVLOG + 新纯模块 + 测试）+ session 前累积旧未提交（moldflow/voxelfea/windtunnel/gears 等，非本 session）。
- **tsc --noEmit=0**，树可编译，与线上 `index-A9aHJyV1.js` 一致。
- **建议下一步**：先同用户确认，将呢个已验证状态 commit（做干净 baseline）——用户至今唔常 commit，170 files 混住本-session + 旧未提交，commit 前值得同用户对一对。**未经用户同意我冇擅自 commit**（守「commit only when asked」）。
- 临时脚本已清（_inspect_cad2.py/_remove_cad2.py/_redeploy_cad2.py 删除）。

---

## 5. 剩余路线图（冲 parity 更高）

### 5.1 AR1 装配 occurrence P3+P4（下一波，重做）
基础：R2 P1+P2 已上线（`src/assembly/occurrence.ts`：reconcileComponents/migrateComponentDefs/makeDefOcc/cloneDef/writeDefFromEdit/referencedDefs/prunedDefsForPayload；「镜像不变量」components[] 保留做实例数组、componentDefs[] 共享定义、occ.mesh===def.mesh 由 reconcile 维持）。方案全文 `_fusion_r2_occurrence_plan.md`。
- **P3 多体子容器**：`ComponentDef.bodies[]` 扩为真多 body（各 id/name/mesh/hidden/color），def.mesh=可见 body 合并；New Component from bodies；BrowserTree 嵌套 Bodies/Origin/Sketches 树。
- **P4**：suppress 传播 Viewport filter + FK（occ `suppress?` 字段已加未接）；4×4 matrix 消费（occ `matrix?` 已加未接，compWorldMatrix store.ts:708 加 `if(c.matrix)` 分支，pos/rot 做旧档兼容）。
- **数据安全铁律**：多 body 序列化走 prunedDefsForPayload 同款剥 occ.mesh 保 def.mesh，每 body mesh 只序列化一次（唔好 N×2）；旧单 body 档零改载入。

### 5.2 其他架构级（用户已授权「做架构级重写」）
- **四视口**（2×2 上/前/右/等轴 + 同步）：单 `<Canvas>` 单相机 → 多相机/多 pane，渲染管线大改。
- **完整 3D 草图**：草图内核现单平面基底（shape 是平面 [s,t] 经 lift 升 3D），要每点独立 Z + 3D 约束求解。

### 5.3 cad2 改核解锁（改核已在 cad，无需 swap）
- **R1 真面圆角 B-rep blend**：现窄版只算解析切点、solid 不变；可用 `PlateWrapper.BridgeG1`（worker #15 路径，nbIter=1 + 几何理智闸）做真 G1 blend + Splitter 裁面 + Sewing 缝合。见 BUILD_CAD2.md「#15 G1 现状」。
- G2 曲率连续、扫掠导引面、任意截面封盖等 —— 需绑更多 OCCT 方法（WSL2 docker 重建管线，BUILD_CAD2.md）。

### 5.4 诚实豁免（clean-room 做唔到，唔好当 bug 修）
Derive 跨文档 / McMaster 零件库（cloud+账户）、解析 B-rep 精度（曲率/拔模/干涉网格近似天花板）、ViewCube 原生右键（drei 限制，已窄版）。

---

## 6. 操作红线（VERBATIM 约束）

1. **部署凭证永不外露**：`_redeploy.py` 有 VPS 凭证 + IP（38.242.215.29）—— **绝不打印/repeat**。要 SSH 操作就程序化提取连接码、临时脚本用后即删。
2. **广东话回覆**用户（neuralworkshk@gmail.com）。
3. **冻结模块唔好郁**（除非用户叫）：CAM / 钣金 / 工程图 / 数据。
4. **Monolith 串行编辑**：store.ts(~18000 行) / cad.worker.ts / Viewport.tsx / SketchLayer.tsx —— 永不两个 agent 同时改同一文件。
5. **热区禁碰**：CameraRig 的 sketch orient/tween + `window.__three`（一碰崩相机/视口）。
6. **求解器 trend-level by design**（模流/风洞/FEA），唔好当 bug 修。
7. **无新依赖**；**旧存档字节兼容**（新字段 omit-on-default）。
8. Fusion computer-use（若要抄操作）：用户部机有 fusion360.exe，可 request_access 截图参考；但**绝不 save 用户 doc / 唔撳 Ctrl+S / 任何 save/upload 对话框 → Cancel**。

---

## 7. 关键文件 + 测试

- **DEVLOG.md**：每波详细 CHANGELOG（顶部最新）。**最权威的「做过乜」记录。**
- **纯逻辑模块（tsx 可测，无 React/store 依赖）**：`src/assembly/occurrence.ts`、`src/cad/filletMath.ts`、`selectionModel.ts`、`insertModel.ts`、`viewModel.ts`、`ucsBuilder.ts`、`accessibilityAnalysis.ts`、`surfaceWrap.ts`、`toObjectPick.ts`、`splineEdit.ts`、`measureCombine/measureFmt/propsReport/analysesModel/faceGroupColors`。
- **gap 分析文件**：`_fusion_parity_gaps*.md`（草图/3d/extra）、`_fusion_r1_fillet_plan.md`、`_fusion_r2_occurrence_plan.md`、`_fusion_*_spec.md`（computer-use 抄的 Fusion 操作语法）。
- **测试套件（全绿）**：insertx3 74 · timelinex4 92 · filletr1 32 · occurrenceR2 24 · residual174 11 · inspectx1 52 · viewx2 59 · datumgeom 21 · asmwave4 23 · massprops · moveface 23。
- **内核手册**：`BUILD_CAD2.md`（现单一内核；改核重建 = WSL2 docker；几何 battery 基线；#15 G1 现状）。

---

## 8. 记忆库（下一个 account 若有 file-memory 应读）

`C:\Users\ivanl\.claude\projects\C--ClaudeCode\memory\` —— 关键：`webcad-fusion-parity-status.md`（各区天花板 + 本 session 五波 campaign + 方法论）、`webcad-cad2-modified-kernel.md`（改核已合并入 cad）、`webcad-preview-cache-verify-limit.md`（canvas render 铁律 + headless 验证限制）、`deploy-webcad-after-changes.md`、`webcad-multi-agent.md`、`verify-dont-stub-under-test.md`、`webcad-module-priority.md`（冻结模块）。若新 account 无 file-memory，本 HANDOVER + DEVLOG 已够。

---

## 9. 当前诚实覆盖率（我的统一口径）

核心建模加权 ≈ 90%。各区：草图~95 · 立体~88 · 参考~90 · 修改~90（弦高+收进内核实证真、面圆角窄版待 BridgeG1）· 装配~85（occurrence P1+P2；P3/P4 = AR1）· 检查~87 · 视图~90 · 插入~93 · 时间轴~98。剩余到 100% = AR1 多体 + 四视口 + 3D 草图（架构）+ BridgeG1 面圆角/G2（改核已解锁）+ cloud 豁免。
