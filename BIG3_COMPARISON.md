# WebCAD vs Fusion 360 / SolidWorks / NX(UG) — 三大对标 · 改进路线 · 硬限制

> ## ★ 2026-06-11 复审（T713→T743 后）— /goal「2D+实体到 Fusion 同级或以上」结论
>
> **2D 草图：日常工作流已同级。** 全套绘图工具（线/矩形×3/圆×2/弧×2/多边形/槽×2/圆角矩形/椭圆/样条/点/文字）全真 B-rep 弧；
> 12 种约束（planegcs，含弧弧相切）+ 9 种尺寸（含从动/弧段 R/位置尺寸）+ 拖拽实时求解 + 全约束变色 + 构造几何 +
> 移动/复制/镜像/偏移/圆角/倒角/阵列 + 重开编辑（含斜面）+ 投影参考几何 + DXF 真弧往返。
> 诚实差距（wire 级，已记 N/A）：trim/extend/break（profile 模型用 顶点/轮廓 Delete 等价）、逐实体变色、弧长尺寸、conic。
>
> **实体：maker 工作流已同级。** 拉伸（对称/扭转/拔模/贯通/斜面）/旋转/扫掠（**任意草图截面** + 3D 爬升路径 + 空心）/放样（直纹/薄壁）/
> 孔（5 类）/真螺纹（内外）/圆角（变半径+切线链）/倒角（3 模式）/抽壳/拔模/特征级阵列/镜像/**多实体**（newbody+B-rep 布尔）/
> **STEP B-rep 导入导出**/按拉直接编辑/分割/**增量重建缓存**。
> 诚实差距（内核/许可锁死，自编译 OCCT 先解）：放样导轨（GeomFill）/A-class 曲面/T-splines/同步建模（业界只 NX）/Parasolid 级布尔鲁棒性。
>
> **超出 Fusion 嘅部分**：浏览器零安装 + PWA 离线 + .msi 桌面装、打印补偿（XY/收缩）、激光 G-code（真弧+kerf）、
> 切层预览/悬垂/壁厚分析、14 个工程计算器、BOM/设计表 CSV、双驱动 motion link、版本历史 IDB、组件网格布尔（留间隙插槽）。
> 免费、开档即用、文件喺自己手 — Fusion 收费云锁定模式做唔到嘅三样。
> 下文分数系 2026-06-10 旧快照，留作历史对照。

> 2026-06-10（T712 后，线上 `index-B1FDQ1Sw.js`）。7 领域并行审计：每个领域以**当日代码现状**为准（HANDOFF/DEVLOG/src 实读），对标「该领域典型用户」嘅覆盖度（目标软件 = 100）。
> ⚠ 口径同旧 `FUSION_COMPARISON.md`（Jun-3）唔同：旧文按「一般 maker 日常需求」计（偏宽），本文按「该领域典型用户」计（偏严）——所以分数普遍低过旧文，唔系倒退，系尺更严。

---

## 一、总评分

| 领域 | vs Fusion 360 | vs SolidWorks | vs NX |
|---|---|---|---|
| 草图 + 约束 | 55 | 50 | 48 |
| 实体建模 | 62 | 55 | 48 |
| 装配 | 56 | 44 | 31 |
| 工程图 | 32 | 22 | 18 |
| 仿真 + CAM | 15 | 13 | 6 |
| 参数化/数据/互通 | 45 | 36 | 28 |
| 平台/内核 | 58 | 47 | 38 |

**解读**：对**你自己**（Solid+Assembly maker、3D 打印导向）日常工作流，webcad 覆盖 ~75-80%（旧口径无错）；对**全领域专业用户**，同三大有清楚距离，距离最大喺 工程图、仿真/CAM、数据管理 —— 三大嘅「重型子系统」。NX 分数最低唔系因为我哋差咗，系 NX 嘅典型用户（航空/汽车/模具）要嘅嘢同我哋定位完全唔同。

## 二、我哋反而赢嘅位（对三大都成立）

1. **13MB 秒开、零安装、即时更新** vs Fusion ~3GB 安装+登录墙+30-60s 启动；SW/NX 只限 Windows 工作站。Tauri 桌面版真离线（Fusion 离线宽限仅 ~2 周）。
2. **3D 打印闭环**：床预设+适配徽章/排版到床/悬垂+6 轴最省支撑朝向/一键摆正/壁厚检查/水密+网格修复/3MF 每件色/设计表批量 STL zip —— 呢段**实际好过 SW 原生**（SW 增材侧得 Print3D 对话框），接近 Fusion Additive 非切片部分。
3. **13 项工程计算器**（螺栓预紧/轴承 L10/ISO 配合/齿轮啮合…）—— Fusion 原生冇，用户要开外部网页。
4. **ISO 紧固件实体库内置免费**（M3-M12 螺丝/螺母/垫圈+按孔配）—— SW Toolbox 系 Professional 付费档先有。
5. **螺旋关节 screw joint**（转动联动进给）—— Fusion 都冇原生。
6. 免费、license-safe、全中文（粤）界面。

## 三、要改进/加（按价值排）

### 3a. 近期 quick-win（高价值、内核够、纯工程）
| 项 | 点解 |
|---|---|
| 工程图 **PDF 导出** | 加工店/淘宝代工默认要 PDF；现只有 SVG/PNG/DXF。pdf-lib (MIT) 或自写 |
| 工程图**过期提示**+手动标注**持久化** | 现系静默陈旧快照 + 标注重生成即丢——辛苦标完改个圆角全部重来 |
| **第一角投影 + GB 图框** | 现第三角写死（美标）；对接内地加工厂用 GB 第一角 |
| **IndexedDB 版本历史** | 现单槽 localStorage，超 5MB **静默停保**——大装配数据安全隐患；顺手做命名快照「还原到…」 |
| **STL 导入网格级非等比缩放** | B-rep 非等比缩放畀内核挡死，但「下载 STL 改尺寸」直接乘顶点系数就得 |
| **打印补偿导出** | XY 膨胀/孔径补偿/按材料收缩率逐轴缩放——FDM 孔印细 0.1-0.3mm 日常痛点 |
| **Worker 崩溃自动恢复** | OCCT wasm abort 后整个几何端死掉只能刷新；包一层超时+重启+重放 |
| **Tauri .msi 安装包 + updater** | 商业化俾非程序员 maker 必需；离线卖点嘅载体 |
| 行星齿轮**双驱动 motion link** | driven = a·driver1 + b·driver2 即解「行星动画」已知限制 |
| 激光切割 **G-code**（kerf 补偿） | 钣金 DXF 已就绪，加 G0/G1/M3 层即入「出刀路」领域最低成本切入点 |

### 3b. 中期结构性（medium）
| 项 | 点解 |
|---|---|
| **装配工程图 + 气泡 BOM** ★ | 你 90% 用 Solid+Assembly，呢个系最大出图缺口；compWorldMatrix 逐件投影叠加，BOM 数据现成 |
| **STEP 导入保留 B-rep** ★ | 现导入即转网格——装咗 NEMA/轴承 STEP 之后想切/改/再导出做唔到，maker 最痛一刀 |
| **约束草图升级**：弧做一等公民 + 任意基准面 + overlay 缩放 | 现约束草图无弧/椭圆（Fusion/SW 草图 80% 系线+弧），且只能画 XY 原点面、固定缩放 |
| **几何级关节原点** | 拾取孔/圆柱面/平面中心做 anchor（现系组件中心+世界轴，铰链装唔到指定孔位） |
| **3MF 导入** | MakerWorld/Printables 主流格式，现只出唔入 |
| **切层预览** | 按层高截交逐层轮廓，抓「悬空孤岛」呢类悬垂法线分析抓唔到嘅失败 |
| **增量重建缓存** | 现每次编辑从零重放全树（~320ms/步）——特征树过百后第一道墙 |
| **设计表矩阵**（多参数×多行+CSV 往返） | 商业化卖参数化模型变体嘅核心 |
| 特征级阵列 / 3D 扫掠路径 / 内螺纹（多面体近似） / 圆角切线链选边 | 建模日常效率项 |

### 3c. 长期大工程（hard 但 stack 内可行）
1. ~~**草图统一 + 可重编辑草图特征**~~ ✅ T746 四批落地（2026-06-11）：①约束网络全生命周期完整性（undo/重建失败/持久化/con-id 全部闭环，9 个数据丢失级 bug 修晒）+ revolve 重开；②committed 草图 browser 可见性（眼仔）+ 斜面重开标签；③**ƒx 参数驱动草图尺寸**（参数/设计表 → planegcs 重解 → 全树重建）；④**草图轮廓布尔 ∪∖**（自写 Weiler-Atherton bulge 版，真弧保持 2e-12，trim 嘅模型诚实版）+ **旧 csketch 退役**（命令重定向主草图，单一草图系统）。余项全部清零：T748 sweep、T751 多环布尔、T753 loft 逐截面源 — **extrude/revolve/sweep/loft 四类草图消费特征全部可重开编辑**。
2. ~~**真多实体 multibody**~~ ✅ T728 v1 已落地（newbody 泊车 + bodyboolean B-rep 布尔，时间轴参数化；v1 边界：泊车实体唔可交互、无任意 switch active）。
3. **参数化组件 / edit-in-place** —— 组件保留特征子树可重开编辑（现组件=烘焙死网格）。
4. ~~**体素 FEA-lite**~~ ✅ T745 已落地（自写零依赖 8 节点六面体 FEM：z-列奇偶体素化 + matrix-free Jacobi-PCG + von Mises 云图，独立 worker，INSPECT「受力云图」两步拣面流程；Ke 对独立解析推导到机器精度、对独立稠密直接解到 1e-7、悬臂对 Timoshenko 0.96 偏刚侧单调收敛；上限 8 万体素，诚实定位「趋势着色」，dispMax 含均摊载荷局部偏大、单元中心采样低估表面峰值——均已注明）。
5. **自编译 OCCT-WASM** —— 解锁 GTransform/XCAF/GeomFill/ShapeHealing。系唯一能抬 API 天花板嘅路，但要长期维护工具链。

## 四、做唔到（硬限制，按原因分四类）

### A. 浏览器/WASM 平台
- **WASM 2-4GB 内存硬顶** → 万件级装配（NX 10k+/SW 数千件）、巨型 STEP 永远唔得；我哋装配天花板约**数十至低百件**。
- **几何单线程**（prebuilt 无 pthreads；部署无 COOP/COEP 头）→ 同操作慢原生 5-20×。
- **无 GPU compute** → 商业级 FEM/CFD/多体动力学（SW Simulation/Simcenter）跑唔起；~10^5 DOF 系实际上限。

### B. 内核（OCCT vs Parasolid + prebuilt API 面）
- **OCCT 圆角/布尔鲁棒性结构性低过 Parasolid**（SW/NX 内核）——代码入面三处自动重试兜底就系证据；缓解得到，治愈唔到。license-safe 世界冇 Parasolid 等价物。
- **replicad 0.23 预编译 API 冻结**：无 BRepBuilderAPI_GTransform（非等比缩放，T705 实证）、无 XCAF/XDE（装配 STEP 结构/颜色/PMI）、无 GeomFill（放样引导线）、曲面 API 唔够（曲面上草图实测退化 T136）。
- **A-class NURBS 曲面 / T-splines**：OCCT 曲面工具远低 NX(ICEM 级)；T-splines 系 Autodesk 专有；且全 app 架构假设水密实体。
- **NX 同步建模等价物**：OCCT 无此模块——业界都只有 NX 做到。
- **真·单一 B-rep 内螺纹**：此 build BRepMesh 无法三角化「螺旋脊 fuse 圆柱」（外螺纹靠 compound 绕过，内螺纹 cut 用唔到此技巧）。

### C. License（clean-room 铁律封死）
- **D-Cubed DCM**（Fusion/SW/NX/Inventor 全用嘅约束求解器）系 Siemens 专有授权——planegcs 系 license-safe 天花板（maker 级 <100 DOF 草图实测稳定）。
- **原生格式互通**（.sldprt/.prt/.f3d/Parasolid x_t/JT authoring）结构性封死。
- **DWG**：LibreDWG 系 GPL、ODA SDK 收费——DXF 已系最大公约数。
- **FDM 切片引擎**：Cura/Prusa/Orca 全系 AGPL，链接即违铁律；自写生产级切片器系另一个完整产品。
- **FEA 四面体网格器**：TetGen(AGPL)/Gmsh(GPL) 都用唔到——体素法系唯一出路。

### D. 商业模式/基建
- **云协作/PDM/版本管理**（Fusion Teams/SW PDM/Teamcenter）：需后端+团队运维；自有 VPS 顶得住「只读分享链接」级。
- **生成式设计**：需云端 GPU 集群按 job 计费。
- **完整 CAM**（3-5 轴/后处理器库/机床仿真，NX CAM 级）：内核弱项 + 团队多年积累双重。
- **工程图双向关联**：replicad drawProjection 只返压平 SVG path，无 HLR 边↔B-rep 边拓扑映射——「图上改尺寸驱动模型」永远做唔到 SW 级，只能「重投影+重吸附」近似。

## 五、定位结论

- webcad **唔系**「浏览器版 SolidWorks/NX」——追唔到亦唔应该追（内核+license+算力三重天花板）。
- webcad **系**「maker/3D 打印友好嘅免费秒开 CAD」：喺 零安装 + 打印闭环 + 内置紧固件/计算器 + 中文 呢个 niche，三大都冇认真做。
- 对你个人迁移目标（Fusion Solid+Assembly ~90% 用法）：日常已覆盖 ~75-80%，打印工作流有位仲好用过 Fusion。
- **建议优先序**：装配工程图 + STEP 保留 B-rep（两个最痛缺口）→ quick-win 清单夹住做 → 长期揾机会做「草图可重编辑」呢个结构性补强。
