# WebCAD — HANDOFF / 项目交接

> 接手 AI / 开发者必读。逐条历史睇 `DEVLOG.md`（最新喺顶部）；Fusion 复刻规格睇 `FUSION_PARITY.md`。

---

## ★★★★ 交接更新 2026-06-23（最新权威 · 畀下一个 AI 接手；覆盖下方所有旧段的进度数字）★★★★

### 0. 一句定位
webcad = 浏览器 + 桌面 参数化 3D CAD，clean-room 仿 Fusion 360。用户系**广东话非程序员**。Live: **cad.neuralworkshk.com**。目标：把 Fusion 的核心（Solid+Assembly）+ UI/操作手势，做到实用级；仿真（FEA/模流/风洞）系**诚实标明的「趋势级」**（非商用 CFD/FEA，by design，唔好当 bug 修）。

### 1. 架构速览（改嘢前必读）
- **`src/store.ts`** — zustand 单一巨石（~13600 行）：全部 state + action + 命令路由 `runCommand`。**改动要串行**（唔好并行改呢个文件 + Viewport + worker）。
- **`src/cad.worker.ts` + `src/kernel/replicad_plus`** — OCCT-WASM 真 B-rep 内核（自编译，绑咗裸 `_oc` 方法）。几何操作喺度。**内核「缺口」要先写 Node probe 真跑到 `Build()` 不 fault 先当可行**（见旧段 Sweep-twist 可行 / Surface-G2 fault 两个相反案例）。Docker 坏（用 WSL2 native docker 重建，见 memory `webcad-kernel-rebuild-docker`）。
- **`src/components/Viewport.tsx`**（~4900 行）— R3F 画布 + 所有 3D overlay + 底部草图栏/导航条 + 命令对话框宿主。
- **`src/components/Ribbon.tsx` + `src/ribbon.ts`** — Fusion 式 ribbon（tabs + 组 + ▾ flyout）。
- **`src/analysis/*`** — 趋势求解器：`voxelfea`(FEA) · `moldflow`+`moldsolve`(模流,已有真 2.5D Hele-Shaw 压力求解器) · **`windtunnel`(风洞 LBM D3Q19，2026-06-23 新)**。各有独立 worker + client + comlink。
- **`src/sketch/*`** — 草图：`freesolve`(自由+planegcs 约束) · `sketchOps`(trim/offset/bool) · **`regions`(平面排布→相交曲线成区域，2026-06-23 新)**。
- **部署**：`python _redeploy.py`（前台跑，background 会 hang）→ 上 VPS（**38.242.215.29；凭证在 _redeploy.py，永不外露/唔好打印**）。
- **每次改动铁律**：`node_modules/.bin/tsc --noEmit`(0 err) → `node_modules/.bin/vite build` → Claude-Preview 浏览器验（WebGL 截图偶尔 hang，改用 DOM eval / preview_screenshot 重试）→ `_redeploy.py` → curl 验 `index-<hash>.js` live + HTTP 200 → prepend DEVLOG → 广东话简报。**功能求解器纯 TS 的，用 esbuild bundle + node 做数值验证（见 windtunnel/regions 的 _*test）**。

### 2. 本 session 新增（2026-06-23，全部 live）
- **风洞/水洞模拟器** `windtunnel.ts`（LBM D3Q19 + 压力积分形阻 + 经验摩擦）→ Cd/阻力/Re + 流场/表面压力云图；薄件自动加密体素；弱机自动降配。
- **草图区域检测** `regions.ts`（平面排布）— 相交曲线/开放折线**围成封闭区域可填充+拉伸**（修核心缺口；穿透 OCCT 验体积精确）。
- **全局加载进度条** LoadingBar（import/export/求解时显示）。
- **弱机/手机自动降配**（`deviceTier`：核少/内存少/手机→调低 FEA/模流/风洞预设 + 封顶；纯本机计算，无服务器）。
- **UI 跟 Fusion 一批**：草图面板 Sketch Palette 显示开关（填充/标注/构造/网格）· ribbon ASSEMBLE 组次序对齐 · ViewCube 旁 Home 小屋仔 + ViewCube 加深 · ribbon 瘦身 + 双击标签收起 + 顶栏模板/材料收埋 📦 · 开始建模卡缩细 · **CONSTRUCT 参考平面菜单逐项列出**（~10 种：偏移/偏移面/中面/三点/相切/过点平行/路径/成角/两点轴/两点中点）· **命令对话框数字栏左右拖改值(scrub)** · **投影几何逐条拣边投**。

### 3. 诚实的 Fusion 真缺口（畀下个 AI 的重点 · 已核实非「表面缺」）
> 注意：好多「以为缺」的功能其实**已做，只系藏喺对话框/未 expose 喺 ribbon**（例：CONSTRUCT 平面本来有 10 种）。**改之前一定先 grep 证缺 + 睇 DEVLOG，唔好重做已有嘢。** 以下系真·剩余：
- **拓扑命名 topo-naming（~45，最弱的承重裂缝）**：选择系**几何级**（坐标/最近）唔系拓扑级（persistent edge/face id）→ 上游改参数后下游圆角/孔可能选错边。呢个系参数化 CAD 的根，最值得投入（但最难，可能要内核 `BRepTools_History`）。
- **Direct-Edit 缺 Move Face**（~50）：Fusion 的「移动面」（推拉+偏移面有，但真 Move/Rotate Face 未齐）。
- **Surface G2 曲率连续 blend**：**KERNEL-GATED** — 实测 `MakeFilling.Add_2(G2)` 喺现内核 fault（emscripten 层，JS 捉唔到）。要 WSL2 重建内核确认依赖，或改 GeomPlate 路径。G1 已做。
- **3D 拖拽手柄（manipulator）**：而家有拉伸箭头 + 全对话框数字栏 scrub；但**未有 Fusion 式喺模型上拖面/拖箭头**逐操作（圆角/抽壳等）。scrub 已覆盖「鼠标改值」，3D handle 系更大工程。
- **投影几何**：已做逐条拣（但系拣「已算好的投影环」，非真逐条点 3D B-rep 边）；datum 非关联（改上游唔自动更新参考面）。
- **装配**：关节齐但装配工程图/BOM 系网格投影近似；无真 contact solver。
- **数据管理**：有 保存/打开档 + 自动保存 + 版本历史(IDB) + 分享链接；**无 Fusion Data Panel 式「我的项目库」**（多设计缩图浏览）— 可加（IDB named snapshot 已有基建）。

### 4. UI 完全跟 Fusion（用户明确的未来方向）
用户要**逐个功能 UI 跟足 Fusion**。方法（已验行得通）：用户**圈图指位**（截 webcad 图圈出唔似 Fusion 的位）→ 精准改。已对齐：ribbon tabs/组次序/组标签样式/分隔线/画布网格/ViewCube/Home/marking-menu/timeline 图标/命令对话框（右侧弹出）。**未逐一核对**：每个命令对话框的字段顺序/默认值/选项是否 100% 同 Fusion 一致（用户想要）— 呢个系逐 dialog 的细活，建议下个 AI 攞真 Fusion 截图逐个对。**webcad 功能数其实 ≥ 参考片**（primitives/齿轮/蜗杆/钣金/CAM/FEA/模流/风洞 都有），瓶颈系**还原度 + 发现性**唔系功能量。

### 5. 铁律 / guardrails（唔好踩）
- **冻结模块**：CAM / 钣金 / 工程图 / 数据 — 除非用户明确叫，唔好主动改（见 memory `webcad-module-priority`）。
- **仿真系趋势级 by design**（FEA/模流/风洞）— 诚实标明「非商用级」，相对比较可信；**唔好当精度 bug 去「修」**。
- **无空壳功能**：唔好加 tooltip 讲得靓但撳落无嘢/假做。
- **license-safe**：唔加新 dep（除非明确 OK）。
- **部署凭证永不外露**。
- **审计/多 agent 结果要逐条读 verdict reason**（bare confirmedCount 会因过严 verify 准则筛走真缺口 — 见旧段 air-trap/sink-mark 教训）。

### 6. 我（当前 AI）建议下个 AI 的优先次序
1. **UI 逐 dialog 对齐 Fusion**（用户最想 · 低风险 · 攞真 Fusion 截图逐个对字段/次序/默认值）。
2. **topo-naming 稳固**（最高杠杆但最难 · 参数化根基 · 可能要内核）。
3. **3D 拖拽手柄**（友好度 · 中风险）。
4. **Data Panel 「我的项目库」**（IDB 基建已有 · 低风险 · 高感知价值）。
5. **Move/Rotate Face** 补齐 Direct-Edit。

### 7. 需要用户提供（加速交接）
- 真 Fusion 360 **截图/短片**（逐 dialog 对齐用）+ 用边个版本。
- **优先次序**（上面 5 项边样先）。
- 常用**测试档**（STL/STEP + 典型零件）做回归。

### 8. RESUME PROMPT（畀下个 AI）
> 「接手 webcad（cad.neuralworkshk.com，广东话非程序员用户，仿 Fusion 360）。先读 HANDOFF.md §★★★★ 2026-06-23 段 + DEVLOG.md 顶部 + memory `webcad-fusion-parity-status`。铁律：改动串行改 store.ts/Viewport/worker、tsc→build→Claude-Preview 验→`python _redeploy.py`→curl 验 hash live→prepend DEVLOG→广东话简报；冻结 CAM/钣金/工程图/数据；仿真系趋势级唔好当 bug 修；部署凭证永不外露；改功能前先 grep 证缺唔好重做。当前重点 = UI 逐 dialog 跟足 Fusion（用户圈图指位）+ topo-naming 稳固。」

---

## ★★★ 当前态 — 2026-06-20：goal-mode 12 模块逼 82 + 全面 bug 审计（最优先，覆盖下方所有旧文）★★★

> 本段系最新权威态。下方 2026-06-19 / 2026-06-15 段嘅【纪律 + §5 坐标系 / §6 数据模型 / §7 验证 harness】仍有效；进度数字以本段为准。
> 配套 memory（自动载入）：`MEMORY.md` 索引 + **`webcad-fusion-parity-status.md`（逐批详细 log，newest-first，最重要）** + `deploy-webcad-after-changes.md`。

### 一句话状态
经 standing `/goal`（逐模块逼真·82）做咗 S140–S193 大批改进 + 一轮**多 agent 全面 bug 审计 + 修复**。**Live：`cad.neuralworkshk.com` = `index-ooezTqCv.js`**（curl 200 实证）。**Node 测 62/62 全绿、`tsc --noEmit` 干净、`vite build` 干净。**

### ✅ Git 状态：已分两批 commit（2026-06-20）
HEAD 系 `957b924`（之前 `dfa249e`@06-15）。整个 session 已提交，工作区 clean：
- `19894de` **feat(S140-S193)**: Fusion-parity 大批推进 + 全面 bug 审计硬化（features + 夹喺 monolith 嘅 source 级 bug 修复，因 interleaved + 无 interactive `git add -p` 故同批）
- `957b924` **test**: 回归测试修正（subdiv T8 / fea-verify T8g / fea-adversarial marker）
> 注：source 级 bug 修复（GPU 泄漏/扫掠守卫/docSnap/数值守卫）interleaved 喺 feature 文件入面 → 落咗 `19894de`（message 有列）。想要纯 fix commit 要 reverse-edit 拆，未做。dist 已 deploy（live = 工作区 = HEAD，三者一致）。

### 模块 Fusion-parity 现状（per-module fair re-score，多数已 ≥80）
**已 ≥82（6+）：** 检视 Inspect 82 · 实体创建 Solid-Create ~82 · 构造 Construct 82 · 仿真 FEA 86 · 网格 Mesh 88 · 拓扑命名 Topo-naming 82（**non-kernel 天花板**）。
**~80 贴边：** 草图 Sketch ~80 · 装配 Assembly ~80 · Form 细分 ~82 · 渲染 Render ~80（今轮加 SSAO/GTAO + FOV + 正交相机）· 直接编辑 Direct-Edit ~80。
**真 <82（下一步）：** **曲面 Surface 73** — 唯一明显落后；G2 Blend/Bridge 系最大杠杆。
**冻结（唔好掂）：** CAM 48 · 钣金 32 · 工程图 54 · 数据/平台 IO 28–62。
> ⚠ META 教训（贯穿成个 goal）：14-agent 审计【系统性低估】活跃模块 6–12 分；改 module 前**必先 fair re-score 真 code**，因为审计列嘅「缺口」好多已做（连 parallel-design agent 都成日提议已存在嘅嘢）。先 grep 证缺，先实现。

### 🔬 今轮全面 bug 审计 + 修复（multi-agent workflow + 4 测修）
6 维 adversarial 审计（find→独立 skeptic verify，default isReal=false）出 **12 confirmed / 5 rejected**；修咗 **11** 个（1 个验证后证已修）：
- **GPU 泄漏（gotcha d）：** `_imgTexCache` 图片贴图 texture 永不 dispose → 加 `ImageTexCachePruner`（imageUrl 单一全局，换图即剪非当前 url）；`StillExporter` render-target 抛错路径泄漏 → try/finally；`CurvatureOverlay` geo 漏 dispose → 补 useEffect。
- **退化几何（gotcha e）：** `sweepTwist.ts` 零弧长 spine → `ds=1e-4/0=∞` 破壳 → len 守卫；worker 扫掠 twist/缩放（2D+3D）缺 bbox 有界闸 → 加 guard + 退回普通扫掠 + warning。
- **撤销数据丢失（gotcha a）：** `docSnap` 漏咗 `jointPoses`/`jointKeyframes`（buildProjectPayload + 3 loaders 都有、净 undo 漏）→ 补入 docSnap 类型/body + undo/redo 还原 + 两个 stack 类型。
- **数值守卫：** `voxelfea princ3` 除 p 无守卫（灾难性相消）→ 退回对角；`sectionProps` NaN 面积 `<1e-12` 漏判（NaN 比较恒 false）→ 加 `!Number.isFinite`；`meshBool signedVol` 越界三角索引 → bounds skip；rib 拔模角 >85° 静默钳 0.05 → 加 warning。
- **4 个 Node 测修：** `coincident #6`（真 bug：smooth spline 漏 skip 做候选 → freesolve `inferCoincident` 候选环加 `isSplinePoly`）；`subdiv T8`（stale：S192 已支持开放/边界网格，开口盒唔再 throw）；`fea-verify T8g`（stale：S167 新增 sed Float32 守卫，narrow 到 vm）；`fea-adversarial`（harness marker 因 voxelfea return 布局变 → 重 sync）。
被否决嘅 5 个（well-reasoned false-positive）：AOEffect mount-guard 已安全、sectionCap 三元读错、moldflow 已有 isFinite 守卫、FEA nodeGrid 可证有界、bearing loadCount 已修。

### ⚠ 修正旧 GOTCHA #4（重要）
下方旧文写「WebGL screenshot 会 hang」系【错】（照抄 ClaudeCraft 背景 tab 节流假设）。**实证 `preview_screenshot` + canvas 像素回读喺 webcad 得**。视觉验证可用，但 headless 取景要：① `dispatchEvent('resize')`×2 等 layout settle（canvas 默认 300×150 未量度）② 拣啱 webgl2 canvas（有多个 canvas，querySelector 可能攞到 2D overlay）③ 背景透明 → 用 `toDataURL` opaque-decode 唔好直接 drawImage（premultiplied 全黑）④ `store.setView('iso')+requestFit()` 取景、`store.addPrim('box')` 加体。详见 memory `webcad-fusion-parity-status.md`。

### 下一步杠杆（按价值）
1. **Surface G2 Blend（最大杠杆，但 ⚠ 实测系 KERNEL-GATED，唔系 quick win）** — **重要纠正**：早前 scout 见 `GeomAbs_G2` enum 已绑 + boundarypatch 已用 `Add_2(G1)` → 推断「G2 净系传 GeomAbs_G2 即可」。**实测 probe（`tests/surface-g2-probe.mjs`）证伪**：现有自编译 replicad_plus 内核，`MakeFilling.Add_2(edge,face,GeomAbs_G2,true)+Build()` 会【硬 fault 内核】（emscripten abort，例 8715672）—— 同条 setup 下 G0/G1 完全正常、净 G2 崩，而且 fault【JS try/catch 捉唔到】→ ship 咗用户拣边即 worker 死要 reload。**已 revert，未 ship。** 教训：enum 已绑 ≠ G2 code path 安全（G2 曲率填充要嘅 OCCT 内部喺此 build 唔完整）。真路径（kernel 级专项 task `task_70dd417a`）：
   - (a) WSL2 重建 replicad_plus，确认 MakeFilling G2 依赖全编入；或
   - (b) 改 `GeomFill_ConstrainedFilling` / `GeomPlate_BuildPlateSurface`（G2 plate）другой path 重新 probe；或
   - (c) 接受 Surface 升分靠 G1 边界补面（已 ship）+ NURBS 极点/缝合/加厚等其它 Class-A 工具，G2 留 kernel 专项。
   > ★ 元教训：内核「缺口」要先【真跑 probe 到 Build 收敛/不 fault】至当可行，唔好净见 binding list 有就当得（呢次同 sweep twist 嗰次相反 —— sweep twist probe 真 build 成功故可 ship，G2 probe fault 故唔可）。
2. Assembly 共享定义 occurrences（架构重构，高回归风险，新 context）。
3. OCCT 内核重建专项（chip `task_70dd417a`，用户已批；WSL2，仅 general-case topo lineage 真要重建）。

### RESUME PROMPT（贴落新 session）
```
读 HANDOFF.md §★★★（2026-06-20）+ GOTCHA。session 工作已 commit（HEAD = git log 顶部，tree clean）。
本 session 已 ship 5 模块新单元：Mesh 平面区识别 / Render 接地阴影深浅滑杆 / Construct 构造基准眼掣 / Assembly 配合残差诊断 / Form 分数 semi-sharp crease 折痕软硬（+ bug 审计修 11 + 测试修 4）。gap-hunt 5 验证单元已 ship 4，净剩 1。

⚠ Surface G2 经 MakeFilling.Add_2(GeomAbs_G2) 实测 fault 内核（uncatchable，tests/surface-g2-probe.mjs），已 revert，唔好再试呢条 path（要做走 kernel 专项 / 改 GeomFill_ConstrainedFilling，先 probe 到 Build 不 fault）。

续 goal：
① **Solid-Create Revolve-Draft**（唯一剩低 gap-hunt 验证单元；worker，⚠ revolve draft 几何=锥化半径唔系 extrude 嘅 offset，先 Node probe 到 Build 不 fault；anchor cad.worker.ts:1248-1264 extrude-draft 参照 / revolve handler ~1278）
② 之后再跑 gap-hunt workflow 揾新 non-kernel 杠杆（每模块 fair re-score 真 code + grep 证缺 + 内核相关先 probe 跑 Build 收敛 + skeptic verify）。
（可选 polish：Assembly mateErrors 已存 store，可加 BrowserTree mate 列表 inline badge；Form creaseSoft 可升逐边权重 UI）

纪律：改 module 前先 fair re-score；改完必 build+deploy；回覆粤语；唔暴露 _redeploy.py 凭据。
```
（想续自主节奏可用 `/loop next x 2`。想并行搵缺口可再跑 gap-hunt workflow。）

---

## ★★ 当前态 — 2026-06-19：自主 `/loop next x 2`（旧，已被 2026-06-20 段覆盖）★★

> 接手呢个**自主 loop**：每轮 scope-scout → 拣并 ship **2 个**最高价值 Fusion-360-parity 单元，全程纪律。下方 2026-06-15 段 + §5 坐标系/§6 数据模型/§7 验证 harness 仍**有效权威参考**；本段系最新操作纪律。
> 配套 memory（自动载入）：`MEMORY.md` 索引 + **`webcad-fusion-parity-status.md`（逐批详细 log，newest-first，最重要）** + `deploy-webcad-after-changes.md`。

### 接手即做（resume）
用户用 `/loop next x 2`（dynamic 自我节奏）触发。每轮 `mark_chapter("S<N> loop iteration")`，跟足：
1. **scope-scout**（全新弱区扫）或 **verify-scout**（核实 deferred 候选可行性+真锚点）→ 拣 2 个 file-disjoint、低回归单元（优先纯 TS Node-testable / 无新 pick-mode）。
2. 逐单元实现（serial 编辑 monolith：`store.ts`/`Viewport.tsx` 系单一枢纽，唔好两 agent 同改）。
3. **adversarial-audit** Workflow（多维 find → 对抗 verify，default isReal=false）。
4. 修确认 findings。
5. **真路径验证**：Node 测（`npx -y tsx tests/<x>.test.mjs`）+ `preview_eval` 驱真 `window.useApp.getState()` —— **唔好 stub 你要验嗰个 function**。
6. **先手动 `node_modules/.bin/vite build`** → `python _redeploy.py`。
7. 核 live：HTTP 200 + grep live bundle 有今批新串 + 入口 hash 变咗。
8. prepend `webcad-fusion-parity-status.md`（newest-first）。
9. `ScheduleWakeup({delaySeconds:1500, prompt:"/loop next x 2"})` 续 loop。

### 硬约束
回覆**中文/粤语** · 唔暴露 `_redeploy.py` VPS 凭据(38.242.215.29) · **FROZEN 唔掂**：CAM/钣金/工程图/数据 · 改完必 build+deploy · **Ultracode ON**（实质任务用 Workflow，优化 exhaustive/correct）· **唔新加 C++/OCCT binding**（Docker 坏，要内核调用先 grep worker 证已绑否则 INFEASIBLE）。

### ⚠ 致命 GOTCHA（踩过，唔好再踩）
1. **`_redeploy.py` 唔 rebuild — 只上传现有 `dist/`。** Deploy 前【必须】先 `vite build` + 核 `dist/index.html` 入口 hash 变咗 + grep dist bundle 有新串。`deploy exit 0` ≠ 上咗新码（S187 踩中：上咗旧 dist，live 零新串、hash 冇变）。
2. **新 3D pick-mode = #1 招牌 bug（互斥泄漏）**：开佢要清晒其它 mode，其它 mode toggle 又要清佢（双向）。**优先揀无新 pick-mode 嘅单元**（result-overlay/marking-menu/toggle）。
3. **Node 测系第一道防线**：纯 TS/库算法核心一定写 Node 测，真 bug 通常喺度先现形（S188 manifold minkowski 绕向 bug 就系咁揪到，0 漏到审计）。
4. **WebGL screenshot 会 hang**（harness 限制）→ 靠 Node 测 + `preview_eval` data-path + console 零 error + 坐标 code-verify，唔靠截图。
5. **render-only useMemo 几何要 dispose**（`useEffect(()=>()=>geo.dispose(),[geom])`）— three 唔 GC GPU VBO/IBO（S186/S187 中过）。
6. **verify-scout 实现前核实 deferred 候选**（真缺?可行?锚点未漂?）— S188 揪到 2 个候选已做完，省 2 批白功。
7. **审 selector picks，唔好照单全收** — 会揀数学重叠/非真-Fusion/已做嘅（S187 否决 Accessibility≈Draft；S188 否决两个 ALREADY-DONE）。
8. **manifold-3d 已绑**（`src/io/meshBool.ts`：add/subtract/intersect/minkowskiSum/minkowskiDifference/sphere/decompose）；**`Manifold.offset` 系 CrossSection 2D，唔系 3D**；minkowski 要 CCW-外向正定向输入（signedVol<0 翻转归一化）+ main-thread（非凸贵，球分段控）。
9. 网格烘焙级操作（shell/offset/boolean）要清 `src`（T759），否则 STEP/✎ 用返旧 B-rep。

### 进度 + 下批
- 估算 **~68–70/100** Fusion parity（最后严谨 audit 64/100 @ 06-14；之后逐批 eyeball delta）。
- 最近连续清批 ship+live：S185(剖面截面属性+Combine keep) → S186(剖面切面上色+截面深度奇偶) → S187(外观材质库+斜度分析) → **S188(网格3D偏移+地面反射，最新，入口 `index-Cf_vv7Sk.js`)**。Render 62 已连补 2 件。
- **下批候选**：① Mesh decompose(`manifold.decompose()`，需验 vs `separateMeshComponent`) ② Assembly Motion-Study→keyframe 导出(v8 MED) ③ Render DOF(drei EffectComposer)/per-face material(需 pick-mode，避) ④ 全新 scope-scout（**Construct 66 未深挖**）。建议换模块（Mesh-decompose/Assembly）或全新 scout。
- 真·topo-naming（对称体旋转）= 最大研究级缺口，FRESH session 先做（见 memory `webcad-kernel-rebuild-docker`）。

### RESUME PROMPT（贴落新 session）
```
/loop next x 2
```
（新 session 自动载入 memory。先读本 HANDOFF §★★ + GOTCHA，跟足纪律每轮 ship 2 件。想加固定节奏改 `/loop 25m next x 2`。）

---

## ★ 当前态 — 2026-06-15（HEAD `6f22ae1`，Live `cad.neuralworkshk.com` HTTP 200）★

> 以下系最新全景，**优先于下方 2026-06-10 旧文**。旧文 §5 坐标系 / §6 数据模型 / §7 验证 harness 仍**有效权威**；§1/§2/§9（Fusion-GUI 复刻阶段、当年 next-step）系历史，GUI 复刻早已收官。

**目标演进**：Fusion-GUI 复刻（T 系列）→ 全模块「冲 100%」（S 系列）→ **robustness 硬化 + capability 推进**（当前）。诚实 parity **~66–68/100**（active 模块；弱：曲面 52 · topo-naming 44 · 仿真 55 · 网格/Form 58 · 构造 58）。逐模块分 + 全历史在 memory `webcad-fusion-parity-status.md`。

**store.ts 现 ~10900 行**（非旧文嘅 3000）。技术栈大致同旧文，关键升级：**内核已换自编译 `replicad_plus.wasm`**（解锁 GTransform/GeomFill/XCAF/MakeOffsetShape 等，旧文「诚实放弃」嘅多项已解锁）。

### 接手必懂嘅 6 个新关键点（旧文未覆盖）
1. **OCCT 绑定**：`cad.worker.ts` 直接 `new _oc.ClassName_N(...)`。凡 `_occt-build/custom_build_plus.yml` `bindings:` 列出嘅 symbol 都可纯 JS 用、**无需内核重建**。只有改 yml `additionalCppCode`（C++ wrapper）才重建（Docker 坏，须 WSL2，见 memory `webcad-kernel-rebuild-docker`）。**能纯 JS 用已绑 API 就别碰 C++**。
2. **raw `_oc` 句柄必须 `const r = GCWithScope(); r(new _oc...)`** 包裹，否则 GC 触发 emscripten fault `9108520`。`cast(rawTopoDS)` 包成 replicad shape。
3. **几何 fail-safe**：可能产无界/退化几何嘅 op，提交前过 bbox 有界闸（`Number.isFinite(ext) && ext>1e-6 && ext<1e6`），失败 → 逐字节保旧形 + `buildWarnings.push(警告)`，**绝不产 null/破壳 body**（防 hollow 上线）。
4. **加新 Feature type 必同步更新 3 个穷举位**否则 `npm run build` 红：`BrowserTree.tsx` `FEAT` Record、`Timeline.tsx` `META` Record、`store.ts` `featDlg.kind` 联合。对话框：`openFeatDlg(kind)`→`commitFeatDlg()`，参照 `'offsetsolid'` 全链。
5. **持久化防丢失**：`buildProjectPayload` 系存档唯一真相；**3 个 loader**（applySnapshot/applyProjectData/restoreAutosave）+ `docSnap`（撤销）。加任何持久状态 → 4 处都要加。**撤销快照**：离散动作 set() 带 `undoStack:[...s.undoStack,docSnap(s)].slice(-60),redoStack:[]`；**连续拖动唔入栈**（灌爆栈）。
6. **i18n**：`src/i18n.ts` `tStatus` 渲染时最长优先子串替换。EN 覆盖 = 把**整串**加进 `STATUS_PHRASES_X`（别加短片段→腐蚀）。

### 验证 / 部署（关键升级）
- **DEV 暴露 `window.useApp`（store）+ `window.cad`**：可 console/preview_eval **亲驱 store live 验证**（如 `applyFeatures([box, feature])` 后散度定理算 VOLUME / 查 bbox / faceGroups）。worker 改动须刷页（Comlink 不热更）。
- **`npm run build` 严格 tsc 系权威类型门**（`tsc --noEmit` 会漏穷举 Record 错）→ **build-before-deploy**。
- 部署：`npm run build` → `python _redeploy.py`（上传 dist/，输出尾见 `verify: HTTP/2 200`+`DONE`；brotli 阶段静默缓冲，**别误判挂起 kill**）→ `curl.exe -s -o NUL -w "%{http_code}" https://cad.neuralworkshk.com` 坐实 200。**nginx CSP 喺 VPS** `/etc/nginx/sites-available/cad.conf`（不在 repo）。VPS 凭证喺 `_redeploy.py`（敏感）。

### 多-agent 工作法（Ultracode，高产）
用 `Workflow` 编排：**battle-test hunt**（N 路并行猎 bug→对抗 verifier 逐条独立验真,默认 isReal=false→主线程 live 验证）、**feature-scope**（并行扫弱模块找真缺口,anti-stale 读 HEAD 证缺失,返 saturated 信号）。**施工留主线程**（monolith 串行编辑+整串/穷举安全审+live 验证）；workflow 只做并行只读侦察/审查。⚠ 验证 agent 会漏**更阔嘅 render/FK/合成上下文**（如 groupMat render 层后乘 → rotateGroup「锚点未跟随」其实系假阳）—— 矩阵/合成类 finding 必读全链。

### 本会话（→ `6f22ae1`）成果
- **Robustness（4 轮 battle-test + e2e 实战）**：60 confirmed / **修 52** —— 撤销正确性、i18n EN、退化输入守卫、NaN/有限性、**持久化数据丢失**（faceColors/groups/drawingAnno/compXY/书签/材质）、导出 NaN 净化、单位显示。e2e 亲驱真零件管线（多特征/布尔/存档往返/时间轴 scrub/undo-redo）**零集成 bug**。
- **Capability**：feature-scope 出 5 真 Fusion 缺口；**Offset Solid 整体偏移已上线**（`BRepOffsetAPI_MakeOffsetShape.PerformByJoin`，9 参含 `Message_ProgressRange_1`，+外扩/−内缩，双向体积精确验证）。
- 诚实纠正 3 处：pie 角度 overclaim（描述≠apply，逐 Edit 核对）、rotateGroup 假阳、build-严格-tsc 漏检。

### 待续 TODO（按建议优先级）
scope 出嘅 4 个剩余真 Fusion 缺口（细节见 memory）：
1. **FEA 多载荷工况**（Sim 55）— 纯 JS 复用体素 FEM，零内核/拾取风险，UI 较大。**最稳妥**（MVP 可做「载荷扫描」：当前模型跑 N 个力倍数→vmMax 趋势）。
2. **Surface G2 边界补面**（曲面 52）— ⚠ 先验 `BRepOffsetAPI_MakeFilling` 喺 JS 可否构造 G2（yml 暗示可能 C++-only→若是转其他）。
3. **Construct 曲线上点** — `edge.pointAt(t)` 已证可用，需边拾取 UI + worker 查询。
4. **Mesh-Form 加边环**（Form cage 拓扑细化）— 纯 JS 四边形几何 + 边拾取 UI。

**需交互/3D/竞态验证 backlog（headless 难无 hollow 确认，留专注 session）**：`applyFeatures` 并发 re-entrancy（request-nonce）、pattern-of-suppressed-target + moveFeature 破 S1 lineage、插值 i18n 串（27 条含 `${}`）、内核级 true topo-naming（44 分）。

**Memory 路径**：`C:\Users\ivanl\.claude\projects\C--ClaudeCode\memory\`（`MEMORY.md` 索引 + `webcad-fusion-parity-status.md` 最重要）。

---

> 最后更新：2026-06-10。线上：`https://cad.neuralworkshk.com`，最新 hash `index-GOdlBVZf.js`（T738 vp-toolbar 瓦解（FUSION_PARITY 全收官）、T739 PWA 离线（sw.js+manifest.json）、T740 尺寸标签离体+圆周拖圆、T741 **Tauri .msi 落地**（`src-tauri/target/release/bundle/msi/`，打包：PowerShell 单引号包 vcvars + pnpm exec tauri build）+ e2e 烟测 14/14（tests/e2e-smoke.md）。之前 /loop ×5 批：T733 拾孔定轴（关节锚=孔心/孔轴）、T734 组件 edit-in-place（固化存 src 可 ✎ 重开）、T735 双驱动 motion link（行星动画）、T736 设计表 CSV 往返、T737 激光 G2/G3 真弧。之前 T732 装配工程图+BOM（meshProject 网格边投影；vb 6mm margin 系 DrawingPanel 隐形契约）、T731 D 尺寸修复、T727-T730 实体收官：3D 扫掠路径、切线链选边、**真多实体 bodies**（newbody/bodyboolean B-rep）、**STEP 导入保留 B-rep**（stepbody 特征）、**增量重建缓存**（快照续算 2.7×+）— 草图(T726)同实体侧文档化差距均已清盘；T724 不变式 = 有 verts 嘅 poly 其 pts 只准由 pathPts 重铺）。**仓库已 git init**（T718 起有 commit 历史可回滚）。**多 agent 并行开发模式已启用**：并行改互不相干模块（io/ 新文件、自包含面板）+ 主线串行整合 store/Viewport/Ribbon 接线 + 统一验证部署——store.ts/Viewport.tsx 系单一枢纽，唔好畀两个 agent 同时改。

---

## 1. 项目 + 当前目标

「受 Fusion 360 启发」嘅**网页 + 桌面参数化 3D CAD**（clean-room，未抄 Autodesk 代码），重点係**实体建模 + 装配**。

- 用户画像：广东话 / 中文**非程序员** maker；所有 UI 文案用中文（粤）。
- **三铁律**：① license-safe 依赖；② 冇空壳功能（唔做「即将推出」假按钮）；③ 确保冇错误。
- **现行目标**：**Fusion 360 GUI/操作逻辑复刻**。用户机上跑紧真 Fusion 嘅截图存 `C:\ClaudeCode\_fusion_shots`，逐格对照。

---

## 2. Fusion GUI 复刻进度（主线）

| Phase | 内容 | 状态 |
|---|---|---|
| 1 | Ribbon 核心：图标行 + 组▾下拉（向下开/分隔线/▸子菜单/快捷键列）+ Fusion 组顺序 `CREATE\|MODIFY\|CONFIGURE\|CONSTRUCT\|INSPECT\|INSERT\|ASSEMBLE\|SELECT` + 左侧大「设计 ▾」选择器 + 浅色主题（深色 active tab） | ✅ T707 |
| 2 | 入草图 → tab 行追加高亮「草图」上下文标签（其余 tab 灰显）+ 右端绿剔「✓完成草图」+ 草图工具改用 **2D 字形 + 中文标签**（◯ ▭ ⊿ ⌒ ⬡ ∿ + 折线/矩形/圆/圆弧/多边形/样条…）| ✅ T708 + T711 |
| 3 | 顶栏极简（9 控件）+「文件 ▾」菜单（11 项）+ Fusion 式文档 tab（橙立方 + 可编辑名）+ BROWSER 头「◂◂ 浏览器 ─」可折叠（248↔26）+ 单位/命名视图功能化 | ✅ T709 |
| 4 | `featDlg` ~25 个命令改右侧 Fusion 命令 palette（`.cmd-palette`，蓝色 OK 脚）+ 底部导航栏 6 控件真功能化（环绕/平移/缩放切 OrbitControls + 显示▾着色/线框 + 网格▾）+ S 键 = 命令搜索（Shift+S = 创建草图） | ✅ T710 |
| 4b | 放射状右键菜单（8 向 + 溢出列表 + `lastCommand` 重放）/ Timeline 26×26 图标 chip（cut 紫+红角标）+ 4px marker 拖刮历史 / 6 旧面板 + featDlg 统一 `CommandDialog`（可拖头）+ SelectionChip（已选 N ✕）/ **拉伸操纵杆**（箭头拖 + 顶端行内尺寸输入） | ✅ T712 |

**关键文件改动**：`src/ribbon.ts`（Tool 加 `quick`/`sep`/`children`/`glyph`，新 `SKETCH_PANELS`）· `src/components/Ribbon.tsx`（`ToolButton` glyph 分支 + `PanelFlyout` 向下 + `WorkspaceSelector` + 文件菜单 + ctx 草图标签 + ✓完成草图）· `src/components/Viewport.tsx`（`.cmd-palette` featDlg 头/体/脚 + 底部 navbar + OrbitControls mouseButtons 由 `navTool` 切 + 草图栏精简成状态条）· `src/components/BrowserTree.tsx`（折叠头 + 橙立方根 + 单位 leaf + 命名视图 leafs）· `src/store.ts`（加 `browserCollapsed/navTool/showGrid/wireframe`，`runCommand` 加 `sk_*` 路由）· `src/App.tsx`（S=cmdPalette / Shift+S=sketch；main 列宽随 `browserCollapsed`）· `src/index.css`（`.ws-big`/`.panel-menu`/`.ribbon-tab.ctx`/`.finish-sketch`/`.cmd-palette`/`.tool-btn.sk`/`.doc-cube` 等 Fusion token）。

---

## 3. 技术栈 & 跑/构建/部署

依赖：replicad 0.23 + OCCT-WASM（LGPL + 例外）· three 0.184 + @react-three/fiber 9 + drei 10 · @salusoft89/planegcs 1.1（2D 约束）· manifold-3d 2.x（Apache-2.0，网格布尔，懒加载）· fflate（MIT，3MF ZIP）· zustand 5 · comlink · React 19 + Vite 8 · Tauri 2（桌面）· kenpixel.ttf CC0 字体。几何**全部喺 Web Worker**（`src/worker/cad.worker.ts`，Comlink）。

```bash
# 开发
pnpm --dir C:\ClaudeCode\webcad dev          # http://localhost:5173
# 构建（tsc 严格）
pnpm --dir C:\ClaudeCode\webcad build        # → dist/
# 部署 VPS（SFTP dist/）
python C:/ClaudeCode/webcad/_redeploy.py
# 确认上线
curl -sk https://cad.neuralworkshk.com/ | grep -oE 'index-[A-Za-z0-9_-]+\.js'
```

**部署铁律**：改代码 → `npx tsc --noEmit` 0 错 → `npm run build` 见 `✓ built` → `_redeploy.py` 见 `HTTP/2 200` + 新 hash → 当完成。改 DEVLOG/HANDOFF/FUSION_PARITY 类纯文档**唔使部署**。

构建坑：管道遮 exit code → 用 `npm run build 2>&1 | tail -3` 揾 `✓ built`/`error TS`。

---

## 4. 架构地图

```
src/
  main.tsx · App.tsx (≈160 行，含全局键盘 + S→cmdPalette / Shift+S→sketch)
  store.ts        ★核心★  zustand `useApp`：状态 + actions (≈3000 行)
  ribbon.ts                Fusion ribbon 表 + SKETCH_PANELS + Tool 类型（含 glyph）
  icons.tsx                SVG 图标集
  worker/cad.worker.ts ★   OCCT(WASM) 内核：rebuild(features[]) 重放特征树
  cad/cadService.ts        worker Comlink proxy
  assembly/kinematics.ts ★ FK + 4-bar / 滑块曲柄 / 六杆 / 通用 solveLinkage
  sketch/{csketch,solver}.ts  planegcs 约束草图模型 + 求解器
  io/{stl,gltf,dxfImport,svgImport}.ts  导入导出 IO
  geom/meshCheck.ts        水密 / 流形检查
  components/
    Ribbon.tsx              顶栏 + ribbon（Phase 1-3 改造） + 上下文草图标签（Phase 2）
    BrowserTree.tsx         BROWSER 树（Phase 3 折叠/单位/命名视图）
    Viewport.tsx    ★       R3F 画布 + featDlg palette + 导航栏（Phase 4）+ 草图栏（精简）
    Timeline.tsx            时间轴（特征历史 / 重排序 / 多参编辑）
    SketchLayer.tsx         草图绘制层 + FitView/ViewRig + 尺寸标注
    CSketch.tsx             约束草图 overlay
    JointsPanel.tsx         装配关节面板（建关节/限位/驱动/运动连接/▷动画）
    ParamsPanel.tsx         ƒx 参数（命名变量 + 表达式 + 设计表）
    DrawingPanel.tsx        2D 工程图（三视图 + 标注 + GD&T + 公差 + SVG/DXF）
    HelpPanel.tsx           F1 帮助 · CommandPalette.tsx S/「/」 搜索
```

部署辅助：`_redeploy.py`（主用）· `_deploy_webcad.py` · `_cf_dns.py`。

---

## 5. ★最重要嘅坑：坐标系 (CAD ↔ three)★

> 任何 3D / 装配 / 相机改动，唔搞清呢段一定出 bug。

- **CAD 坐标**（OCCT / 草图 / 特征 / `mesh.vertices`）：Z 向上。
- **three 世界坐标**（渲染 / 相机 / `component.pos` / 关节 anchor·axis）：Y 向上。
- **映射**：CAD(x, y, z) → three(x, z, −y)；渲染时 mesh 包喺 `<group rotation={[-π/2, 0, 0]}>`。
- `bodyMesh.vertices` / `component.mesh.vertices` 係 **CAD 坐标**；`component.pos` 係 **three 世界坐标**（喺旋转 group 外面施加）。
- **组件世界变换**（渲染/导出/干涉 单一真相）：`compWorldMatrix = fk · T(pos) · [T(gc)·R(rot)·T(−gc)] · R(−90°X)`（gc = mesh 中心）。
- 验证模板位置睇渲染后世界坐标，**唔好净睇 stored pos**（历史 bug 来源）。

---

## 6. 数据模型 & 持久化

- **Feature**（worker 联合类型）：extrude / revolve / fillet(`radius2` 变半径) / chamfer / shell / pattern / cpattern / pathpattern / prim(box/sphere/torus含弧角/cone含 sides 棱锥/wedge/dome含 cap 球冠/halfcyl/pie) / thread / cylpatch / sheetmetal / gear / rack / pulley / mirror / loft(含 ruled/wall) / sweep(含 wall 空心) / coil(含 r2 锥形) / scale / draft / transform / pushpull / rib / text。`rebuild(features[])` 由零重放。
- **Component**：`{ id, name, mesh:MeshData, pos[3](three), rot?, color?, material?, hidden?, opacity? }`。
- **Joint**：`{ id, type:'rigid'|'revolute'|'slider'|'cylindrical'|'ball'|'planar'|'screw', parent, child, anchor[3], axis[3], angle, slide, aMin/aMax/sMin/sMax, angle2/3, slide2, lead?(screw 导程) }`。
- **MotionLink**：`{ id, driver, driven, ratio, kind?:'gear'|'rack' }`。
- `jointMotion()` 内**全处 clamp 限位**（T691）；screw 关节同步推算 lead/360 mm（T699）。
- **撤销快照**：`{features, components, joints?, motionLinks?}`，全部还原。
- **持久化**：`saveProject`（下 .json）+ localStorage `webcad-autosave`；`openProject`/`restoreAutosave`（全空守卫）。相机/取景态唔持久化。

---

## 7. 验证 & harness 坑（接手必读）

- **流程**：改 → build EXIT 0 → `_redeploy.py` HTTP/2 200 → 新 hash → `preview_eval` `window.location.reload()` 先验（HMR 旧监听器会残留，DEVLOG T190 / T710 S 键事件即先例）。
- **`preview_eval`** 读 `window.useApp.getState()` 验 store 态；`window.solveSketch()` DEV 钩子验 planegcs；`window.useCSketch` 验约束草图。
- **R3F 光线投射拒 synthetic event**：eval 派发 `PointerEvent` 唔会驱动 raycast。3D 点选/hover 嘅触发只能码审 + 验 store 端到端；右键 marking 菜单係 DOM 事件可完整模拟。
- **导出验证**：拦 `URL.createObjectURL` 捕 blob.size；binary STL 应 = `84 + 50×三角`。
- 大 async eval 易超 30s → 拆细。截图唔稳定 → 尽量用 eval 读 DOM。
- **驱动用户机 Fusion 截图**（Phase 1 起样）：PowerShell `SetProcessDPIAware` + `SetCursorPos`/`mouse_event` 物理像素，截图存 `C:\ClaudeCode\_fusion_shots`，验证完 Ctrl+Z 还原至 Untitled 无星号。

---

## 8. 已知限制（诚实标，非 bug）

- 真 **NURBS 曲面建模**（控制点/裁剪/缝合/曲率梳）：无 — 现有曲面（变径弹簧/旋转薄壁/空心扫掠/球冠/部分圆环）係实体内核窄版近似。
- 真 **3D FEM / CFD**：无 — 现有「工程计算 ▾」13 项係解析估算（齿轮/弹簧/轴承L10/丝杆/ISO配合/螺栓预紧/折弯K/热应力…），梁应力 + 屈曲 + 自固有频率为 Euler-Bernoulli 解析。
- **CAM**：无（出唔到刀路）。
- **多件装配工程图**：未做；单件 + 剖视已有。
- **非等比缩放**：精简 OCCT-WASM build 无 `BRepBuilderAPI_GTransform`（T705 诚实放弃）。
- **行星齿轮动画**：单轴 motion-link 表达唔到复合自转+公转，静态示意。
- **gearpair/rackpinion 模板**含隐藏退化机架 mesh（`id:'GND'`, hidden, 1 三角）做 FK 根；UI 守卫显「固定参考件·无实体几何」。
- 其余 workspace tab（SURFACE/MESH/PLASTIC）复用 SOLID 内核（诚实复用，非空壳）。

---

## 9. 下一步

**Phase 4b（任务 #139）已全部交付（T712）**，Fusion-GUI 复刻 4 阶段完成。Phase 4b 新组件：`CommandDialog.tsx`（共用 palette 壳 + SelectionChip）、`MarkingMenu.tsx`（放射菜单）、`ExtrudeArrow`（SketchLayer 内操纵杆）。待用户确认：**3D 箭头真鼠标拖手感**（R3F raycast 合成事件验唔到，数学已 code review）。

**用户指定路线（2026-06-10 6 点反馈后）**：
1. **草图 Fusion 全工具逐个补齐**（「佢有既我地都要有」）— T713 落地 D 尺寸 + 8 约束 + 选择工具（`src/sketch/freesolve.ts` 系桥，约束 session 内有效）；T714 补全至 **12 约束** = Fusion 约束面板全集；T715 **圆弧一等公民**（增强 poly `arc:{a,b,m}`：内核真圆弧棱 threePointsArcTo + planegcs arc 原语 + **必须显式 `arc_rules` 耦合**）；T716 **位置尺寸**（⊕原点可选 + hdist/vdist `difference` 约束 + D 工具三击放置定方向）= **8 种尺寸**；T717 **投影参考几何**（`computeRefGeo`：共面边界/截交 → refpt/refedge 固定参考，可标注可约束，虚线灰）+ **拣面自动对焦**（sketchFocus → CameraRig）+ D 失灵根因修复（点画布 blur 输入框）。续：槽/圆角矩弧化、driven 从动尺寸、弧-弧相切、斜面 refGeo、约束草图重开编辑（大工程）。
2. 之后：**实体建模深化**——已交付：特征级阵列(T722)、内螺纹(T721)、**组件布尔 manifold-3d(T723，合并/切除留间隙/相交——多实体方向第一步，插槽/模腔工作流)**、**bulge 真弧 poly(T724，slot/rrect/arcslot/圆角/偏移/镜像全真圆弧；`sketch/sketchOps.ts` 纯几何模块)**；**草图线已收官（T726）+ 实体线已收官（T727-T730，两个 /goal 均完成）**：草图 = T724 真弧 + T725 弧段约束 + T726（变色/从动尺寸/构造几何/点/拖拽求解/tangent_aa/斜面重开/Delete）；实体 = T727（3D 扫掠 path3 + 切线链）+ T728（多实体 newbody/bodyboolean，B-rep 级，泊车灰显）+ T729（STEP→stepbody 特征保留 B-rep，≤8MB）+ T730（增量重建快照缓存，splitBuild noCache）。诚实 N/A：草图 wire 级 trim/extend/break、逐实体变色、弧长尺寸；实体 同步建模（OCCT 无模块）、Parasolid 级布尔鲁棒性、GTransform/XCAF/GeomFill（预编译封死，自编译 OCCT 系唯一出路）。多实体 v1 边界：泊车实体唔可交互（拾取/圆角/草图限活动实体）、无任意 switch、splitBody/STEP 导出限活动实体。
3. GPU：渲染已系 WebGL（GPU）；compute 类（体素 FEA/切层预览）做 WebGPU 检测 + CPU fallback。
4. 浏览器限制突破路线：Tauri 桌面（已有，待出 .msi）→ 「本地小助手 sidecar」（小型下载，原生 OCCT/求解器跑 localhost，web app 检测到就 offload — 解 WASM 4GB/单线程天花板，license-safe LGPL 动态链接）。
5. 其余：FUSION_PARITY §4.3 vp-toolbar 瓦解、斜面草图、真螺纹（§8 长期项）。

已修（2026-06-10）：**openProject 旧 id 孤儿** — openProject 唔再重派特征 id，改为保留存档 id + `bumpFid` 推进计数器（同 restoreAutosave 一致，store.ts `openProject`），suppressedIds/ƒx paramBindings 往返唔再失效。已验证：跳号 id（f1/f3）往返保留、抑制命中正确特征、setParam 联动重建；已部署上线。

放弃修嘅设计选择（有意）：marking-menu backdrop 右键 = 菜单移位重开（Windows/Fusion 惯例，非 bug）。

---

## 10. 文档导航

| 文件 | 用途 |
|---|---|
| `HANDOFF.md`（本档） | 当前态全景 |
| `DEVLOG.md` | 逐条变更（T1→T711+，新喺顶部，含实测结果） |
| `FUSION_PARITY.md` | 4 阶段 Fusion 复刻规格 + 文件/行号锚 |
| `FUSION_COMPARISON.md` | 12 领域逐项对比 Fusion（Jun-3 旧口径，偏宽） |
| `BIG3_COMPARISON.md` | vs Fusion/SolidWorks/NX 三大对标 + 改进路线 + 硬限制（Jun-10，7 领域代码实读，口径较严） |
| `C:\ClaudeCode\_fusion_shots\` | 真 Fusion 360 截图（基准） |

**对新接手者嘅 4 句话**：① 改 3D 前食透 §5 坐标系；② 改完跟 §3 部署铁律 + §7 验证流（必 reload）；③ store.ts 已 3000 行，复用已验 action（`requestFit`/`compWorldMatrix`/`runCommand`/`meshesToBinarySTL`/`computeFK`），避免重造；④ 所有面向用户文字用**中文（粤）**。
