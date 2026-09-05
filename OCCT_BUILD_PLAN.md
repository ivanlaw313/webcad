# 自编译 OCCT-WASM 计划书（T754 预研，BIG3 §3c.5）

> 2026-06-11 预研结论：**可行性极高，且工作量远细过预期** — 唔使从零砌内核，
> fork replicad 自带嘅 ocjs 构建配置、追加十零个符号、Docker 一条命令重 build。

## 关键发现

### 1. 出货 wasm 嘅真实符号面（grep replicad_single.d.ts 实测，9097 行）

以前 BIG3 假设「GTransform/XCAF/GeomFill 全部被排除」— **一半系错嘅**：

| 符号 | 状态 | 意义 |
|------|------|------|
| `XCAFDoc_ColorTool` / `XCAFDoc_ShapeTool` / `TDocStd_Document` / `STEPCAFControl_Writer` | ✅ 已包含 | STEP **写**装配/颜色已经得 |
| `BRepFilletAPI_MakeFillet` + `Law_Linear/S/Interpol/Composite` | ✅ 已包含 | **变半径圆角**（law-driven）唔使重编译都做到 |
| `BRepOffsetAPI_MakePipeShell` | ✅ 已包含 | 带导轨扫掠（auxiliary spine）部分可用 |
| `BRepOffsetAPI_MakeOffsetShape` / `ShapeUpgrade_*` / `Geom_BSplineSurface` / `GeomAPI_PointsToBSplineSurface` | ✅ 已包含 | 偏移壳/升级/NURBS 面拟合 |
| `BRepBuilderAPI_GTransform` | ❌ 缺 | 非均匀缩放操作（gp_GTrsf 数据类型反而有） |
| `GeomFill_*`（Pipe/Sweep/SectionGenerator…） | ❌ 缺 | 真导轨放样 |
| `STEPCAFControl_Reader` | ❌ 缺 | STEP **读**装配/颜色（Writer 有 Reader 冇） |
| `ShapeFix_Shape` | ❌ 缺 | 顶层修复器（Solid/Face/Wire 子修复器有） |
| `BRepBuilderAPI_NurbsConvert` | ❌ 缺 | B-rep → NURBS 转换 |

**推论 A**：变半径圆角、STEP 彩色装配导出 — 可以即刻用现有 wasm 实现（绕过 replicad TS 层，
worker 直接揸 oc 对象 — `setOC(oc)` 之前我哋手上就有原始 oc）。
**推论 B**：真正要重编译先解锁嘅得 5 个类。

### 2. 构建管线（replicad 官方做法，包内 package.json 写明）

```
docker pull donalffons/opencascade.js          # ocjs 官方构建镜像
cd replicad/packages/replicad-opencascadejs
ytt -f build-source/ --output-files build-config   # 模板 → yml（repo 已带生成版，可直接改）
docker run --rm -v $(pwd)/build-config:/src donalffons/opencascade.js custom_build_single.yml
# → replicad_single.js / .wasm / .d.ts
```

仓库 `build-config/custom_build_single.yml`（310 行，264 个 symbol 绑定 + emcc flags
`-flto -O3 -sDISABLE_EXCEPTION_CATCHING=1` + 两个 additionalCppCode wrapper）。
**我哋嘅 delta**：喺 bindings 列表追加：

```yaml
  - symbol: BRepBuilderAPI_GTransform
  - symbol: ShapeFix_Shape
  - symbol: Handle_ShapeFix_Shape
  - symbol: BRepBuilderAPI_NurbsConvert
  - symbol: STEPCAFControl_Reader
  - symbol: GeomFill_Pipe
  - symbol: GeomFill_BSplineCurves
  # （GeomFill 族按需逐个加 — 每个符号会拉相应 OCCT 头）
```

### 3. 本地工具链盘点（2026-06-11 实测）

- Docker 29.3.0 ✅（Docker Desktop 已装，daemon 冷启动 ~2min）
- WSL2 Ubuntu ✅ · Node 22 ✅ · 磁盘空闲 252GB ✅
- replicad 源码已 shallow clone 到 `C:\ClaudeCode\replicad-src`

## 落地步骤（预估 0.5-1 日首次成功）

1. **拉镜像**：`docker pull donalffons/opencascade.js`（数 GB，一次性）
2. **冒烟**：用 repo 原版 yml 重 build 一次 → 对比产物同 npm 包行为一致（基线）
3. **加符号**：追加上表 delta → 重 build → `.d.ts` 出现新类即成功
4. **接线**：webcad `package.json` 用 `file:` / alias 指向自编译包；worker 加新 API 包装
   （GTransform 非均匀缩放 → 真·三轴独立 scale 特征；STEPCAF Reader → 彩色装配导入）
5. **验证**：非均匀缩放体积 = V·sx·sy·sz 精确；STEP 彩色往返
6. **维护**：build yml + 产物 hash 入 repo 文档；OCCT 版本跟 ocjs 镜像（唔自行升级 OCCT）

## 风险（诚实）

- ocjs 镜像维护状态/OCCT 版本 → 见下方研究附录
- 单个符号可能拉爆 wasm 体积（现 10.8MB → 监控产物大小，>13MB 要重新评估符号清单）
- `-sDISABLE_EXCEPTION_CATCHING=1` 单版 build：新 API 抛 OCCT 异常会 abort —
  风险同现有 API 一致（worker 已有 watchdog 重启兜底）
- Windows 路径/权限：docker run 用 `-v` 挂载，喺 WSL 内跑最稳

## 快赢清单（唔使重编译，现 wasm 即刻做得 — d.ts 实测确认）

1. **导轨扫掠**：`BRepOffsetAPI_MakePipeShell.SetMode_5(AuxiliarySpine, CurvilinearEquivalence, KeepContact)` ✅ 重载已绑定
2. **双距离倒角/双半径圆角**：`Add_3(Dis1, Dis2, E, F)` 重载已绑定（变半径 law 版按 d.ts 再确认）
3. **STEP 彩色/装配导出**（STEPCAFControl_Writer + XCAFDoc_ColorTool，25 处引用已绑定）
4. ShapeUpgrade 修复管线增强

## 研究附录（2026-06-11，web 调研 + 来源见下）

- **ocjs 维护状态**：休眠（最后 commit 2023-03；Docker 镜像 latest 2023-03，1.81GB 压缩）；
  OCCT 钉死 **7.6.2** + emsdk 3.1.14。**但 replicad 0.23.0（2026-04 发布）就系用呢个镜像构建** —
  路线今日仍然走得通，短期稳定（replicad 作者仍在用佢发版）。
- **超集铁律**：自定义 yml 必须系 replicad yml 嘅超集 — 包括末尾两个 `additionalCppCode` wrapper
  （`BRepToolsWrapper`/`GeomToolsWrapper`，replicad dist 实际调用，砍咗即冧）+ emcc flags
  （`-sEXPORT_ES6=1`、`-sEXPORTED_RUNTIME_METHODS=["FS"]`）。满足即 `setOC` 即插即用，零 fork。
- **XCAF 读取链**：追加 `STEPCAFControl_Reader` 时连埋 `XCAFApp_Application`/Handle；
  绑定生成最可能踩坑喺呢条链（ocjs 覆盖 ~72% 类）— 逐个移除定位 / additionalCppCode 薄 wrapper 绕过。
- **许可证（LGPL-2.1 + OCCT 例外）**：闭源 web app 自带自编译 wasm 安全 — 条件：
  ① .wasm 独立文件加载（我哋 vite asset 已系 ✓，**唔好** base64 内联）② 显著声明用咗 OCCT
  ③ 随附 LGPL + 例外条款文本。自编译同而家用 replicad-opencascadejs 义务完全一样。
  **TODO**：关于页加 OCCT 声明 + LICENSE 文本（依家就欠，同自编译无关）。
- **替代路线**（放弃 replicad 先有意义，重写量级）：andymai/occt-wasm（OCCT 8.0，4.5MB brotli，
  极活跃）+ brepjs；bitbybit-dev/occt。均系策划式 API，唔兼容 setOC。
- **工时**：首次成功构建 4–8h（绑定报错迭代为主），端到端上线 6–12h。单次 docker run 10–30min
  （镜像内 OCCT 静态库预编译，只生成绑定 + 链接）。
- **长期风险**：内核停 7.6.2（攞唔到 7.8+ boolean 性能/修复）；1 年+ 后要 OCCT 8 特性 = 迁移 brepjs 级重写。
- **本机一步手动**：Docker Desktop daemon 冷启动 120s 内未起（大概率要喺 UI 登入/接受 WSL 整合一次）—
  开一次 Docker Desktop 窗口确认 daemon 起到，之后 `docker pull donalffons/opencascade.js`
  （1.81GB）+ **即刻 `docker save` 本地存档**（断供保险）。

来源：github.com/donalffons/opencascade.js（Dockerfile/Releases）· hub.docker.com tags ·
ocjs.org custom-builds 文档 · github.com/sgenoud/replicad packages/replicad-opencascadejs
（build yml 原文）· replicad.xyz setOC 文档 · OCCT_LGPL_EXCEPTION.txt（Open-Cascade-SAS/OCCT）·
github.com/andymai/occt-wasm · bitbybit-dev/bitbybit-occt
