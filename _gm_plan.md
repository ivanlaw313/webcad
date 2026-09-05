# GM 计划书 — 2026-06-23（6-agent code-grounded 侦察后）

> 总参谋制：我(Fable5)制定+验收；执行按难度派工（S 简单→Haiku / M 复杂→Opus / L·XL 最难→Fable 亲自）。
> 每项完成必过 QA：tsc 0 err → build → preview 实测 → deploy → curl 验 hash → DEVLOG。
> 状态：待用户确认先开工。

## 好消息（核过，唔使做）
- 另一 session 嘅 Wave-1 8 个快赢**全部真喺 tree**（datumRef/漂移闸/量测单位/totalAngle/scale锚/coil r2/edgeGeomKey/asBuiltJoint 逐个 file:line 证实）。
- **风洞算法核心 VERIFIED 正确**：压力积分符号/归一化 ✓、摩擦项真加咗（报告诚实）✓、反向流路径 ✓、收敛设计 ✓。剩余系精度偏差项（见 W3）。
- 英寸/分数输入 parseLen 已有（大部分字段）。
- STL remix 今日已有完整可行闭环（网格层）：导入→修复→转B-rep/截面取轮廓→建结构→组件布尔→导出。

## 第 1 波 — 用户报嘅 bug（根因已锁定 file:line）
| # | 项 | 根因 | 难度 | 派工 |
|---|---|---|---|---|
| 1.1 | **参考面切割失败·主因**：datum 草图伪装 face 草图 | store.ts:4094 `sketchFromFace: offset!==0` + 假 faceOutSign=1 → cut 入 face 分支：默认贯通(丢距离/方向)或 inward sgn 反向切去外侧 | S | Fable |
| 1.2 | 切唔到嘢仍报「已切割」成功、食埋草图 | store.ts:8848 成功判据无 ΔVolume；加 prevVol 对比→失败保草图+人话提示 | S | Fable |
| 1.3 | 斜面/角度面拉伸 worker 丢 `down`（反向无效） | cad.worker.ts:1313-1326 方向硬编 cut→−n；`dir=f.down?-1:1` byte-compat | S | Fable |
| 1.4 | 拉伸预览同内核方向相反（WYSIWYG） | SketchLayer ExtrudePreview 唔读 fromFace/faceOutSign/faceCutThrough | M | Opus |
| 1.5 | **参考面唔入时间轴·快修**：浏览树 datum ✎改偏移/角度 + 可撤销删除 | planes[] 纯 state（store.ts:10373 注明 by design）；docSnap 冇入 undo | M | Opus |

## 第 2 波 — 情境 UI（无关嘢收埋/灰咗，对标 Fusion） ✅ 全波完成 2026-07-09（build index-BBb2IGFx.js，headless 全项验证，详见 DEVLOG）
| # | 项 | 难度 | 派工 |
|---|---|---|---|
| 2.1 ✅ | ⚠ 草图模式顶栏「载入模板」会 reset 清空成个项目**冇确认**（数据丢失级）+ 收埋顶栏库/材质 | S | Opus |
| 2.2 ✅ | 草图模式：灰时间轴 + 收 vp-navbar 渲染控件 + 灰浏览树破坏性操作（skDelGuard 单源） | S×3 | 我（Fable） |
| 2.3 ✅ | sketch-bar 同屏 25-30 控件瘦身（CAM 4 掣收埋——冻结模块）→「更多▾」弹层 | M | Opus |
| 2.4 ✅ | featDlg 开时 键盘E/F/C/M/H·命令面板·marking menu 绕闸直入 runCommand（静默丢对话框参数）→ 加统一守卫 | M | 我（Fable） |
| 2.5 ✅ | ~30 拾取模式只有 8 个灰 ribbon + 互斥清理漏项（两个 pick mode 可同时武装）→ runCommand 前置 `_DISARM_ON` 安全反向枚举 | L | Fable |

## 第 3 波 — 风洞升级（算法已 verified，做精度+专业可视化） ✅ 全波完成 2026-07-09（build index-Dg2rbMJ2.js，真 LBM 实测 QA：Maskell 手算吻合/流线100%向下游，详见 DEVLOG）
| # | 项 | 难度 | 派工 |
|---|---|---|---|
| 3.1 ✅ | ★ 专业流线：worker RK2 streamlines（全速度场积分）→ 速度着色 lineSegments + 流动点动画（似商用 CFD）+ 流线/箭头切换 | M | Opus→我验收 |
| 3.2 ✅ | Blockage 15-28% 无修正（最大绝对 Cd 偏差）→ Maskell 式修正（cdCorr headline + 原始值副行） | S | Opus |
| 3.3 ✅ | reLb 钳制动态提示 + 湿面积楼梯摩擦 clamp(mesh/voxel,0.4,1) 缓解 + 尾窗 25% 平均 ±cdOsc | S×3 | Opus（并入同一 agent）→我验收 |

## 第 4 波 — STL remix 补链（扫描→加结构→打印） ✅ 全波完成 2026-07-09（build index-CaJoq1UZ.js，全项真路径 QA：独立切片对答案/原子撤销/法向精确，详见 DEVLOG）
| # | 项 | 难度 | 派工 |
|---|---|---|---|
| 4.1 ✅ | 截面取轮廓只限 Z 轴+组件自身坐标（摆位后错位）→ 任意轴+世界坐标 | S | Opus |
| 4.2 ✅ | 活动 B-rep ↔ 网格组件布尔要手动先固化 → 自动固化包装（一步布尔，原子撤销） | M | Opus |
| 4.3 ✅ | 网格组件面上画草图（measureMeshFaceRegion 平面区拟合 → sketchArb） | M | Fable |
| 4.4 ✅ | 网格组件量边/量面/量角补齐 + exportAssemblyStl 真 CSG union 单壳（菜单项） | S×2 | Opus |

## 第 5 波 — 结构性大件（Fusion 手感天花板）
| # | 项 | 难度 | 派工 |
|---|---|---|---|
| 5.1 ✅ | Datum 变真时间轴特征（planes 推导化 + 13 写入点入特征管道 + 旧档迁移；2026-07-09 上线 index-CC94P7XO.js） | L | Fable 设计→Opus 施工→Fable QA |
| 5.2 ✅ | Extrude「To Next」范围（射线烘焙停距，回放确定；同批上线） | M | Opus→Fable QA |
| 5.3 ✅ | 框选 marquee（window/crossing，⛶ navTool；2026-07-09 上线 index-B8q7oH6M.js） | L | Fable |
| 5.4 ✅ | 交互式关节 J-picker（两连接面拾取→贴合→几何推轴建真关节；2026-07-09 上线 index-BBEcR1-A.js） | XL | Fable 设计→Opus 施工→Fable QA |

---
# ✅ GM 五波计划 2026-07-09 全部完成（22/22 项，全部真路径 QA + 上线验证，详见 DEVLOG 逐波记录）

## 明确唔做/延后
- 扫描件转 B-rep 质量天花板（faceted+3万三角上限）[XL] — ROI 低，网格层闭环已可用。
- editpoles 单面路径改造 — byte-compat 风险，另一 session 已 defer，维持。

## 第 6 波 — 草图实战体验（用户 5 项 + 35-agent 审计 29 项确认；2026-07-09 用户 PROCEED）
| 批 | 内容 | 状态 |
|---|---|---|
| A | 👓透视(草图实体自动半透)·鼠标净左键落点·显示切换入更多▾·草图栏折叠+拖动·60 tooltip 白话化 | ✅ index-CYHomDYD.js |
| B | 双击/Enter 收笔·ESC 逐步退格·连击去重·🗑删除掣·相切弧出掣 | ✅ 同上批 |
| C | 网格贴草图面·相机按内容取景·尺寸标签避让·徽章错开·斜面填充·hover 高亮 | ✅ index-0uppOLbk.js |
| D | EN 漏译 65 条·完成草图掣双语·中文组名/tab（创建/修改/实体…） | ✅ 同上批 |
| E | 🎓手把手教学（8 步黄金路径+常亮箭头+自动过关）·帮助搜索+指给我看·快速开始卡修正 | ✅ index-DPGoC7WY.js |
| F | F2 草图/特征改名+孤儿管理 ✅ · F3 标尺寸即弹输入 ✅ · F5 拉伸拣草图确认 ✅（index-BrAldbxa.js）· **F1 重开草图时间轴回卷 ✅ Fable 亲做（index-BJ10B5kH.js，铁证 QA：编辑首特征草图→实体空/refGeo空/tlPos 0，完成→复原）** · F4 点级欠定义着色 = 诚实延后 v2 | ✅ 5/5（F4 明示延后） |

---
# ✅ GM 第 6 波「草图实战体验」2026-07-09 收官：35 项上线（用户 5 + 审计 29 + F1），唯一延后 = F4（点级 DOF，v2）

## 第 7 波 — 拣面与预览体验（用户 6 点 Fusion 对照；2026-07-09 PROCEED → 同日全收官）
| # | 项 | 状态 |
|---|---|---|
| 7.3 | 入草图自动正投影（store 订阅实现——R3F effect 陷阱教训入 DEVLOG） | ✅ index-BLugQdkK.js |
| 7.2 | 入草图自动取景（内容 bbox + 正交 zoom 公式） | ✅ 同上 |
| 7.5 | 投影参考线 chainSegments 连续化（根治「点点点」） | ✅ 同上 |
| 7.1 | 拣面 hover 高亮（原点基准面+参考面 PickPlaneQuad） | ✅ index-YQhz1ziO.js |
| 7.4 | 吸附目标源头高亮（snapSrc：端点/中点亮源线、圆心十字） | ✅ 同上 |
| 7.6 | Fusion 式体积预览（拉伸/切割红蓝半透明实体 + RevolvePreview；无预览清单留后：孔/抽壳/加厚/按拉/拔模/移缩/扫掠） | ✅ index-DTxPP561.js |

# ✅ GM 第 7 波 2026-07-09 收官（6/6）

## 第 8 波 — 全力并行（2026-07-09 用户「全力進行，唔撞就同時進行」）
### α 批（并行 5 路）
| 路 | 内容 | 状态 |
|---|---|---|
| 1 | A2 吸附类型优先级+逐类开关 · A3 多段工具打字尺寸（store.ts） | ✅ |
| 2 | A1 七命令体积预览 · A4 revolve 预览补漏 · A5 拣面 hover 补漏（SketchLayer+Viewport） | ✅ |
| 3 | C3 EN 残余 33 条（Ribbon+i18n） | ✅ tsc 0（未部署，合批） |
| 4 | C5-Stage2 模流能量方程+Cross-WLF（moldsolve+tests，19/19）+ β-3 UI 接线 | ✅ |
| 5 | C1 93 项 backlog 筛选（只读） | ✅ 66 仍有效，TOP15 出炉 |

### C1 筛选结果 TOP 15（β 批执行清单——多数 S 级快修）
1. #39 开任意 JSON 都「成功」无校验静默清空模型【数据丢失·S】
2. #41 openProject/分享链接 开前不警告未保存改动+清 undo【数据丢失·S】
3. #29 torus「外径」实为中心线直径（填80量出104）【S】
4. #5 revolve 忽略草图平面（非XY错位错向；先加守卫）【M】
5. #34 剖切滑杆硬编 ±150mm 大件切不到【S】
6. #33 剖切预览 Y/Z 切错平面【S】
7. #27 splitBodyBySketch 静默烘焙+清 undo 不可逆【M】
8. #40 triggerDownload 同步 revoke 大文件可能 0 字节【S】
9. #84 二进制 STL 带尾随字节误判 ASCII 报错【S】
10. #36 参数绑定 0/负值被静默改写【S】
11. #37 设计表永久清掉公式表达式【S】
12. #79 量角报法向夹角非二面角【S】
13. #48 正交模式标准视图不重取景【S】
14. #49 ViewRig 包围盒忽略组件 pos/hidden【S】
15. #82 设计表步长方向不符静默空结果【S】
（其余 51 项 STILL_VALID 全表喺 workflow 输出，多数 LOW——TOP15 后再批。EN 残余延伸：模板名/材质名/纹理名喺 store/procTextures，队入 β。）
### β 批 ✅ 全落地（β-1 store/worker 11 项 + β-2 Viewport 6 项 + β-3 模流 UI）——TOP15 15/15 修毕；B3 点级 DOF 仍延后（同 F4 合并 v2）
# ✅ GM 第 8 波 α+β 2026-07-09 收官（26+ 项，最终 build index-DoQMu52V.js）
### γ 批：B1 OCCT lineage map（Fable 亲自设计 + Node 实证）→ B2 Move-Face

## γ 批 — B1 OCCT lineage map（2026-07-09 Fable 亲自实证+设计）
### Node 实证（tests/history-probe.test.mjs + history-probe2.test.mjs，真自建内核，7/7 PASS）
- fillet/cut/fuse 三 builder 嘅 Modified/Generated/IsDeleted **全部可调**（fillet IsDeleted=true 语义正确）
- `Modified(face).First()` 读得返真 shape；**IsSame/IsEqual/IsPartner 同结果体 face 配对命中**；配对面面积 944=1200−16² 铁证
- **推翻旧结论**（parity 记忆 :264「don't pursue real history」——嗰阵未跑过 probe）
### S2 lineage 设计（Fable 定案）
1. 新模块 src/cad/lineage.ts：受支持 op（先 cut/fuse/intersect，后 fillet/chamfer）改行 raw builder 路径（保留 builder）→ 为被追踪 picks 查 Modified/Generated/IsDeleted → 输出 old→new TopoDS 映射（IsSame 对结果体配对）
2. buildShape 维护 trackedPicks；S1 abort（non-transform 区间）时改由 lineage 链逐 op 走
3. fp/near-point 照旧做 capture key + fallback（四层混合唔郁，净补 S2 层）
4. 风险控制：raw 路径只喺有 tracked picks 跨该 op 时先行（普通 rebuild 照用 replicad sugar = 零回归面）；GCWithScope 包住（防 fault 9108520）
5. 阶段：γ-2a 布尔 lineage + Node 测试「box→fillet 边→再 cut 穿附近→fillet 仍跟对边」（repro #2 直接命中）→ γ-2b fillet/chamfer 链 → γ-3 对称体旋转+特征混合

### γ-2a ✅ 2026-07-09 上线（index-D9JrRF-2.js）：S2 布尔 lineage 落地——lineage.ts + S1 gate-3 插位 + 11/11 验收（naive 跳错边实证 vs S2 carry 到正确边距离 0.0）+ fail-safe 旗。下一步 γ-2b：fillet/chamfer 链 + revolve/bodyboolean/pushpull 埋点 + 多跳链。

### γ-2b ✅ + 三轨合批 ✅ 2026-07-10 上线（index-BbcKPOAC.js）
- γ-2b：fillet/chamfer 血统 + 全布尔位埋点 + 多跳链（封顶4），lineage-s2b 14/14（index-CEuu1kT8.js 先行上线）
- B2 移动面 v1：探针 moveface-probe 11/13 → ReplaceFaceNear 内推重解/prism 外拉/tilt±60°；moveFacePlan.ts 决策核心；13/13 + 浏览器真路径。**三承重裂缝清零**（topo-naming S2 ✓ / datum 关联 ✓ W5 / Move-Face ✓）
- 模流 Stage-3 保压/PVT：Tait 7 料 + 封口压力 + 逐格缩水场，23/23，off=byte-identical。**UI 接线未做**（保压面板+缩水色图层）→ 下批
- 点级 DOF 着色 v2：pin-and-check 探针（对称耦合 DOF），39/39 + 浏览器 ptFull/ptAxis 实证
- 下一步候选：模流保压 UI 接线 · GUI Phase 4b（task#139）· 51 LOW backlog · Stage-4 翘曲
