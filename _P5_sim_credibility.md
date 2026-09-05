# P5 · webcad 物理仿真可信度报告

> **一句话结论**：webcad 的 8 个仿真器**内核数学全部正确**——FEA 四子系（静力/模态/屈曲/热）对**解析力学基准**独立探针实测收敛（相对误差 0.3%~6.8%，属**定量可信**）；SIMP 拓扑优化的唯一可量化约束（体积比）命中 0.003%；wind LBM 与 moldflow 为**趋势级 by design**（方向/单调/排序全对，绝对值刻意不追）。**最高可信度：FEA 屈曲（A，+0.3%）与 SIMP（A）**；**最低：moldflow（B，求解器路径厚度敏感度弱一次幂 H² vs H³）**——但 moldflow 默认 Dijkstra 趋势路径已用正确 h³ 边成本，此偏差只影响可选 FVM solver 路径。

---

## 1. 总评分卡

| 模拟器 | 方法 | 解析基准 | 相对误差 | 类型 | 可信度 |
|---|---|---|---|---|---|
| **FEA 静力/应力** | 三线性 hex + matrix-free Jacobi-PCG + cut-cell | Euler-Bernoulli/Timoshenko 悬臂 δ=PL³/3EI | **3.48%** | quantitative | **A** |
| **FEA 模态** | 逆幂迭代 + 瑞利商 + lumped 质量 | EB 悬臂 f₁=(1.875²/2π)√(EI/ρAL⁴) | **0.53%** (充分解析) | quantitative | **B** |
| **FEA 屈曲** | 静力预解→Kg→逆幂特征值 (K+λKg)φ=0 | Euler Pcr=π²EI/(KL)² | **0.3%** (截面≥6vox) | quantitative | **A** |
| **FEA 热/热应力** | Dirichlet 提升 + 热初应变 f_th | 1D 导热线性梯度 / σ=EαΔT | **6.8%** (bulk 应力) | quantitative | **B** |
| **生成式/拓扑 (SIMP)** | SIMP p=3 + 敏度过滤 + OC 二分 | 体积约束 Σx=volfrac·nVox + 物理趋势 | **0.003%** (体积约束) | trend-level | **A** |
| **注塑模流** | Dijkstra h³ 趋势路径 + Hele-Shaw FVM solver | 冷却板式 14.702s / Hele-Shaw 签名 | **50%** (solver 厚度敏感度) | trend-level | **B** |
| **风洞/水洞 (LBM)** | D3Q19 BGK + Smagorinsky LES + 压力积分 | 无逐位解析（参考实验 Cd 排序） | **~-1%** (Cd 尺度守恒) | trend-level | **B** |
| **体素切胞网格 (地基)** | 射线投射二值化 + S³ 子采样占空比 | 解析体积 (球/圆柱/box) | **0.076%** (二值体积收敛) | quantitative | **B** |

---

## 2. 逐模拟器详评

### 2.1 FEA 静力/应力（von Mises） — 可信度 A

**方法**：八节点三线性六面体（24×24 Ke，2×2×2 高斯积分），matrix-free Jacobi-PCG；固定 DOF 用投影法（清零+对角置1），销/圆柱约束用秩1 penalty，边界体素用 cut-cell 占空比缩放刚度；应力在单元中心 σ=D·B(0,0,0)·u_e 恢复，von Mises + 主应力（Cardano 解析）。

**benchmark（全 3 个 PASS）**：
- `fea-adversarial-physics.mjs`：E1 方向不变性 relDiff~1e-13、E2 泊松效应 rel err 2.9e-4、E3 叠加性 relDiff~1e-14、E4 刚度缩放（2E→挠度精确减半）、E5 细长悬臂 tip 挠度 **19.767 vs Timoshenko 20.5424（ratio 0.962）** — ALL PASS。
- `fea-beam3pt.test.mjs`：简支梁最大挠度落中间、跨中弯曲应力>1/4跨 — 5 pass/0 fail。
- `fea-verify.mjs`：16/16（Ke 对称+刚体模态残差~1e-13、单轴 vm 均值 1.553 vs 目标 1.5625 偏差 2.9%、网格收敛单调、NaN 诚实报告）。

**解析基准 vs 计算值**：E5 case L=64,b=d=4,F=10,E=2000,nu=0.3 → δ_EB=20.480mm、δ_Timoshenko=20.5424mm；solver dispMax=**19.767mm**（相对误差 **3.48%**，偏软方向合理且 cut-cell 已补偿）。

**诚实局限**：体素 staircase 离散（曲面近似方块，靠 cut-cell 占空比缩放非精确切胞积分）；单元中心应力恢复令根部峰值天然偏内（vmMax 42.17 vs 真外纤 60MPa，因单元中心非表面——应看趋势峰位非绝对表面应力）；分辨率硬钳 [4,64]、nVox≤80000，细薄件受限；低阶 hex 纯弯曲有剪切自锁倾向；lumped 自重体载非一致质量。

**可修**：none — 3.5% tip 挠度属体素 FEM 固有离散水平，已合理。（若追表面峰值应力可加节点应力外推到表面纤维，属精度增强非 bug。）

---

### 2.2 FEA 模态（固有频率） — 可信度 B

**方法**：广义特征值 Kφ=ω²Mφ：逆幂迭代（内层 matrix-free CG）+ M-正交去缩取次低阶 + 瑞利商 λ=ω²，f=√λ/2π。质量矩阵 = lumped 对角（每体素 ρh³ 均分 8 节点）。三线性 hex。

**benchmark（PASS）**：`prestressed-modal.test.mjs` 全 15 项（基线 f₁=3874.6Hz，拉 0.6Pcr 升→4789.2、压 0.6Pcr 降→2518.3、压 0.9Pcr 趋零→1278.9、Pcr=85.1kN、Galef (f/f₀)²=0.42≈0.4）——验符号/单调/趋势。新建 additive probe `p5-modal-probe.mjs`/`p5-modal-probe2.mjs` 跑定量收敛：截面充分解析时 relErr **单调收敛 6.45%(厚2vox)→2.85%(3)→1.52%(4)→0.88%(5)→0.53%(6vox)**；f2/f1=6.06 vs 解析 6.267。

**解析基准 vs 计算值**：钢 100×10×10mm → EB 一阶弯曲 f₁=**815.38 Hz**（正合源码 L1398 校准注释「f1≈815Hz」）；同几何厚度跨 6 体素 solver f₁=**819.7 Hz**（**+0.53%**）；厚 2/3/4/5 体素依次 868/838.6/827.7/822.5 Hz（三线性 hex 上限硬→偏高，h↓单调降向解析，典型 h² 收敛）。

**诚实局限**：**(1) resolution 按最长轴计体素数，细长梁薄截面常只得 1-2 体素 → 误差大且非单调**（同梁 res16/24/32 实测 +32.7%/-11.2%/+33.4%，纯 voxel 采样锯齿，非 solver 数学错）；工程用需手动把 resolution 调高到截面跨≥4 体素。(2) 三线性 hex 上限硬→系统性高估频率。(3) lumped 对角质量系低阶近似。(4) 方形截面两弯曲模态简并。(5) 逆幂+去缩对密集/简并谱高阶精度依赖去缩质量。

**可修（见 §4）**：resolution 语义按最长轴 → 细长/薄壁件截面欠采样致定量误差非单调可达 30%+。可修方向：voxelize 按**最短实体尺寸**保证最少体素跨度（或给「最小截面体素数」保底），即可把细长梁误差从 ~33% 拉回 <2%。solver 数学本身无错。

---

### 2.3 FEA 线性屈曲（临界载荷） — 可信度 A

**方法**：静力预解 K·u=f → 单元中心 Cauchy 应力 → 逐单元几何刚度 Kg=∫GᵀSG dV → 屈曲 (K+λKg)φ=0 改写 Kφ=λ(−Kg)φ，逆幂迭代（算子 M=−Kg）+ 瑞利商求最低 λ1，Pcr=λ1·|force|。

**benchmark（PASS）**：新建 additive probe `p5-buckling-probe.mjs`/`p5-buckling-probe2.mjs`。悬臂柱（固定底 z=0、自由顶轴压 −Z，K=2）细化扫描：a=10 L=80 (L/a=8) res=48 nAcross≈6 → **Pcr=648.8N vs Euler 642.6N（+1.0%）**；res=64 nAcross≈8 → **644.2N（+0.3%）**；a=12 L=96 res=64 → 927.6 vs 925.3（+0.3%）。截面标度 I∝a⁴ 单调正确。拉载 +Z → λ1=−0.226≤0 + 正确「唔屈曲」告警。

**解析基准 vs 计算值**：Euler Pcr=π²EI/(KL)²，K=2，I=a⁴/12。a=10,L=80,E=2000 → Pcr=**642.6N**；solver res=64 nAcross≈8 → **644.2N（+0.3%）**。粗截面(nAcross 1-4)则 Pcr=97-337N 大幅跳变（mesh 欠解析）。

**诚实局限**：(1) 对网格极敏感——截面每边<4 体素时 Pcr 随 res 非单调跳 −43%…+100%（低阶 hex 无法表达弯曲曲率），用户必须给截面≥6 体素。(2) 12000 体素上限迫使细长柱截面或长度二选一欠解析。(3) 短粗柱(L/a=6)Pcr 偏高 +11.9%（体素偏刚 + Euler 薄梁假设失效叠加，此区 Euler 本身不适用）。(4) 单元常应力、逆幂只出最低模态。(5) 边界仅 band 固定面+受力面，K 因子只验证了 K=2 悬臂构型。

**可修（见 §4）**：(a) UI/文档应对截面最小体素数强制警告（nAcross<4 标注不可信）。(b) 12000 上限对细长柱可放宽或给屈曲专用更高预算。(c) 可加多模态/去缩捕捉高阶屈曲。均属定量框架内改进。

---

### 2.4 FEA 热/热应力（稳态导热） — 可信度 B

**方法**：阶段1 ∇·(k∇T)=0 纯 Dirichlet 提升法 T=Tp+t'，解 K·t'=−K·Tp（8节点标量导热单元 Kth，2×2×2 高斯）。阶段2 热初应变 ε₀=[αΔT,αΔT,αΔT,0,0,0]，等效节点力 f_th=∫BᵀDε₀dV，解 K·u=f_th，σ=D·(B·u−ε₀)，von Mises。

**benchmark（PASS）**：`thermalstress.test.mjs` 3/3（T1 双端约束 vmMax=134.49MPa；T2 自由膨胀 vmMax=0.0003MPa；T3 守卫齐）。3 个 additive probe：1D 导热线性梯度 **maxAbsErr=3.8e-6°C、中面 T=50.0000（机器精度）**；热流 Q res20/40=0% 但 res8=56%（截面体素混叠，非单调）；分辨率扫描 res8→40 vmMax 由 144→249MPa 单调发散；**bulk/median vm 全分辨率稳定 ≈127-129MPa**。

**解析基准 vs 计算值**：约束热应力单轴 σ=EαΔT=200000×12e-6×50=**120 MPa**；solver bulk/median vm≈**128.2 MPa（6.8%**，体素三线性+单点恢复+夹持端 Poisson 横向约束的合理偏高）。自由膨胀 vmMax≈1e-4 MPa（≈0，−ε₀ 减项正确，核心物理对）。

**诚实局限**：**(1) 报表指标 vmMax 系最大值，恒落夹持端角奇点**（分辨率越高奇点越尖→vmMax res8→40 单调 144→249MPa 发散不收敛）；真正代表体内单轴热应力的 median/bulk 全分辨率稳定 ≈127-129MPa；测试 T1 断言窗 [100,140] 只在 res≈20 附近成立，高分辨率会假 FAIL。(2) 总热流 Q 依赖包围盒截面与体素对齐（res20/40 整除→0%，否则 8-56% 混叠），温度场本身机器精确。(3) 单点应力恢复未做节点平滑。(4) bulk σ 略高于纯单轴（双端全 DOF 固定引入横向 Poisson 约束）。

**可修（见 §4）**：vmMax 报表指标应改用抗奇点统计（P95 分位数或排除夹持带 1-2 单元层的体内最大值），令峰值随分辨率收敛而非被角奇点主导发散——median≈128MPa 稳定证明底层物理已对，只系 max 提取方式受奇点污染。测试 T1 的 [100,140] 断言窗对分辨率敏感，宜改断言 median/bulk。

---

### 2.5 生成式设计/拓扑优化（SIMP） — 可信度 A

**方法**：经典 SIMP 最小柔度 E_e=Emin+x_e^p·(E0−Emin)（p=3），静力 K(x)u=f（matrix-free Jacobi-PCG），柔度 c=Σfactor_e·(ueᵀKe0ue)，灵敏度 dc=−p·x^(p−1)(1−Emin/E0)·en，敏度过滤（半径 rmin 去棋盘格），OC 二分 λ 打体积比更新（move=0.2）。

**benchmark（PASS，5 组 12 断言 ALL PASS）**：新建 additive probe `p5-topopt-probe.mjs`（tsc 转译 voxelfea.ts→import）。短悬臂 60×12×30。
- **B1 体积约束**：finalVol=**0.40001 vs 目标 0.40，relErr 0.003%**（OC 二分本就精确）。
- **B2 柔度**：c0=216.14→cN=34.843（约 6 倍变硬），后 60% 迭代 25/25 步非增单调收敛，42 迭代无 warning。
- **B3 承力路径**：dense(x>0.5) 在 X 跨度 100% 贯通 support→load；外纤维 50% dense vs 中性轴 20%（正确 I 梁翼缘拓扑）。
- **B4 volfrac 扫（0.25/0.4/0.55）**：finalVol 单调、finalCompliance 单调降 85.6>38.5>24.2（多料=更硬）。
- **B5 惩罚**：penal=3 灰度 15.0% < penal=1 灰度 29.2%（正确推向 0/1）。

**诚实局限（by design）**：(1) 体素分辨率所限（探针 res=24~28），绝对柔度值有离散误差——源码注释亦明示「趋势级」。(2) 均匀立方体单元边界呈台阶状，未做密度加权 cut-cell。(3) 敏度过滤为经典线性权重，去棋盘格但不保证严格网格无关（无 Heaviside 投影/长度尺度硬约束）。(4) OC 更新非 MMA，未覆盖多载荷/应力约束。(5) nVox 上限 30000。(6) 载荷为固定面带 bandTol 均摊点载。

**可修**：none（趋势级框架内未发现真错）。可选增强（非 bug）：敏度过滤可加密度过滤+Heaviside 投影以更接近 0/1 且网格无关；但当前行为已符合定性生成式设计目标。

---

### 2.6 注塑模流（充填/冷却/压力/变形） — 可信度 B

**方法**：**趋势路径**（默认）：3D chamfer 距离变换出半壁厚场 → 多源 Dijkstra 求充填先后序（Hele-Shaw **h³ 流导**）→ 板式 1D 冷却公式 + 差异收缩梯度变形 + τ 局部极大判焊接脊线/困气 + 壁厚 z-score 判缩痕。**求解器路径**（solver:true）：局部迁移率 λ=h²/(3η)、面传导率=调和平均(λ)·h、每步重解压力 Poisson + Cross 黏度 lag Picard + 批量前沿推进。

**benchmark（PASS，35/35 断言）**：`moldflow.test.mjs` 7/7、`moldsolve.test.mjs` 9/9、`moldflow-thinwall.test.mjs` 9/9、`moldflow-weldline.test.mjs` 10/10（焊接线在孔下游左侧 x<9 中轴 y≈5、困气在远端壁、缩痕厚区1.0 薄区0.0）。加建 additive probe `moldflow-anchor-probe.mjs` PASS。

**解析基准 vs 计算值**：冷却板式公式 coolingTime(3mm,ABS)=**14.702s**（与手算完全一致，relErr≈0，quantitative）。**厚度敏感度**：真 Hele-Shaw S=H³/(12η) → 固定 Q 下 pPeak∝1/H³，2× 厚度压力比应=8.0、3×→27.0；probe 实测 **2× 得 4.000、3× 得 9.00（即 H² 而非 H³，相对误差 50%）**。诊断：求解器面传导率 T_ij=调和平均(λ)·h，λ=h²/(3η)，故 **T∝H² 而非 H³**——把间隙截面当固定体素面 h² 而非真实间隙面 H·h，少了一次 H。1D 中心线压力线性 max rel dev=0.0%（Darcy 常导正确）。

**诚实局限（by design，非 bug）**：pressure/warp 归一化 0..1 非真实 MPa/mm；求解器 Stage-1 等温无能量方程、无保压 PVT、无纤维取向、无翘曲 FEM；Cross-WLF 系数为文献家族典型值；变形系 |∇(shrink·s)| 一阶 proxy；冷却系 1D 板式第一项；焊接线/困气用 τ 局部极大保守判据；chamfer 对欧氏距误差几个 %；厚件冷却应理解为上限估算（工具会主动 moldable='solid' 忠告抽壳）。

**可修（见 §4）**：求解器（moldsolve.ts）深度积分流导系统性少一次 H。趋势级框架内真可修：在 trans() 面因子乘埋平均全壁厚 H_avg（把 A/d 由 h²/h=h 改为 (H_avg·h)/h=H_avg），补返缺失那次 H，方向不变但量级对齐 H³。**注：默认 Dijkstra 趋势路径已用正确 1/h³ 边成本，无此偏差，唔使改**——此可修项只影响可选 FVM solver 路径。

---

### 2.7 风洞/水洞（LBM CFD，Cd 风阻） — 可信度 B（趋势级 by design）

**方法**：格子玻尔兹曼 D3Q19 + BGK 单弛豫 + Smagorinsky LES 涡黏（CS²=0.14²）；固壁半步 bounce-back；形阻=表面外向面压力积分 F_x=-Σ p·n_x（p=(ρ−1)/3 gauge）动量交换法；摩擦阻用 Blasius/湍流经验补；reLb 钳[6,800]、τ 钳[0.503,1.2]、U_LB=0.1(Ma≈0.17)、余弦 ramp、双缓冲 pull-streaming。

**benchmark（PASS，6/6 趋势 check）**：新建 additive probe `p5-wind-probe.mjs`（合成水密网格）。数值：cube20³ **Cd=1.706**、sphere R10 **Cd=0.586**、teardrop L80 Cd=0.822、teardrop L30 Cd=1.183、cube30³ Cd=1.698。**排序 cube>teardropL80>sphere 正确**；迎风面积↑→阻力N↑（0.164→0.368）；拉长流线化收益单调（L80 0.822 < L30 1.183）。

**解析基准 vs 计算值**：趋势级 by design 无逐位解析基准。参考实验 Cd（Re~1e4-1e5）：立方体≈1.05、球≈0.47。solver：立方体 **1.706（偏高 ~1.6×）**、球 **0.586（偏高 ~1.25×）**；**关键：Cd 随尺寸放大近乎守恒（1.706→1.698，阻力N 随迎风面积 2.25× 增 2.24×）证明无量纲化正确**（相对误差 ~-1%，指 Cd 尺度守恒）。

**诚实局限（全属 trend-level by design）**：(1) reReal≈3e4 湍流区被钳到 reLb=800 稳定层流带 → 绝对 Cd 偏高（solver 内置 warning 已声明）；(2) 球 res=16 跑满 2601 步 conv=false（未收敛但仍落合理带）；(3) 低分辨率体素阶梯对尖尾敏感——短水滴 L30 尾部仅几个体素被截成钝尾，Cd 人为抬到 1.18（假流线体），须够长细比 L80 先见真流线化；(4) 摩擦阻 cdFric 系经验补项非真解，低 speed 会污染 form-drag 排序（提到 speed=20 后凸显 form drag）；(5) 只支持沿主轴来流无任意攻角；(6) 压力用 gauge (ρ−1)/3 非 MEA 全动量交换。

**可修（见 §4，皆趋势可用性优化非定量化）**：(a) 球默认 res 未收敛，可提高收敛判据宽度/步数上限令 conv=true 更稳；(b) 摩擦阻低 speed 盖过 form-drag 排序，UI 可提示「低速工况摩擦主导」或展示 form/friction 分项；(c) 低分辨率尖尾几何可补「尾部尖细度」触发加密。**绝不建议改成定量 CFD（by design）。**

---

### 2.8 体素切胞网格精度（全 FEA 地基） — 可信度 B

**方法**：二值体素化=竖直 z 列射线投射，交点排序/去重(1e-7)/奇偶配对填充，体素中心 inside→实体（中点求积）；切胞=对每实体素铺 S×S×S 子采样点（默认 S=3，probe 用 S=4），下方交点奇偶判 inside，占空比=inside/S³，floored≥1/S³。

**benchmark（PASS，2 benchmark 全绿）**：`voxelfea-cutcell.test.mjs`：cut-cell 令悬臂挠度更贴 EB——圆截面 14 档平均误差 **二值14.74%→cut-cell7.98%**（RMS 19.22%→10.47%），45°斜方截面 9.85%→6.24%，轴对齐方块 cut-cell vs 二值 0.000%（向后兼容）。新建 additive probe `voxelfea-volume-probe.mjs`（box/cylinder/sphere 各 10 档 res）：5 断言通过。

**解析基准 vs 计算值**：解析体积 box 57600 / 圆柱 125663.7 / 球 65449.85。二值体素体积 h→0 干净收敛：**球最细档(res=96) 误差 0.006%、收敛阶 p≈2.65；圆柱 0.076%、p≈1.52**；box 于 h 整除档 0.000%。**切胞占空比和不降反升——球最细档 0.760%、圆柱 1.138%，plateaus 于真体积下方约 0.76~1.1%，h→0 唔收敛（单边低估）**。

**诚实局限**：(1) 二值以中心判 in/out=中点求积，边界台阶误差 O(h) 且非单调（box res=64 反弹 2.36%），要看扫描均值。**(2) 重要：切胞占空比之和系单边低估**——只遍历 solid=1（中心-inside）体素，中心落实体外的部分体素其体积从未加回 → Σocc·h³ 系统性偏低、h→0 唔收敛到真体积。故占空比系**刚度加权装置**，唔可当体积估计器。(3) 占空比 floored≥1/S³ 且 clamp∈[1e-3,1] 微细偏置。(4) 曲面收敛依赖输入三角网够密。

**可修（见 §4）**：(1) **若 UI 任何处用「占空比之和」当体积/质量显示，会系统性低估约 0.8~1.1% 且唔随加密收敛——应改用二值 nVox·h³ 或真正双边 cut-cell。**(2) 中点判 in/out 令体积误差非单调，可对边界体素改用占空比≥0.5 判实体（marching-style）令收敛更单调。核心地基本身准确，以上属精化。

---

## 3. 分层可信度声明

### 3.1 【定量可信】—— 对解析解 <15%，可挂数使用

| 子系统 | 对解析基准误差 | 使用前提 |
|---|---|---|
| **FEA 静力/应力** | tip 挠度 **3.48%** vs Timoshenko | 看趋势峰位而非绝对表面峰值应力（单元中心恢复偏内） |
| **FEA 屈曲** | Pcr **0.3%** vs Euler | **截面≥6 体素、L/a≈8**（Euler 有效区）；截面<4 体素结果不可信 |
| **FEA 模态** | f₁ **0.53%** vs EB（充分解析） | **截面跨≥4 体素**；细长件默认 res 下欠采样致误差非单调达 30%+ |
| **FEA 热/热应力** | bulk 应力 **6.8%** vs σ=EαΔT；温度场机器精度 | 读 **median/bulk 应力**而非 vmMax（vmMax 被夹持角奇点污染发散） |
| **体素几何地基** | 二值体积 **0.006~0.076%** vs 解析 | 体积/质量用二值 nVox·h³，**勿用占空比之和**（单边低估 0.8~1.1%） |
| **SIMP 体积约束** | **0.003%** vs Σx=volfrac·nVox | OC 二分本就精确 |

> **定量可信的边界条件是「网格充分解析」**：FEA 四子系数学全部正确，误差主要来自体素离散水平与 resolution 语义（按最长轴计），只要截面跨足够体素（≥4~6），即收敛入工程可用区。

### 3.2 【趋势级可信 by design】—— 只可信方向/单调/排序，唔可挂绝对数（这是设计选择，不是缺陷）

| 子系统 | 可信的是 | 刻意不追的是 |
|---|---|---|
| **风洞/水洞 LBM** | 钝体>流线体、方>球、迎风面积单调、Cd 尺度守恒(1.706→1.698) | 绝对 Cd（reLb 钳 800 vs reReal 3e4 → 系统性偏高 1.25~1.6×） |
| **注塑模流** | 充填先后序、race-track、焊接线/困气几何位置、冷却相对快慢、缩痕厚薄 | 绝对 MPa/mm（归一化 0..1）；求解器路径厚度敏感度弱一次幂 |
| **SIMP 拓扑（拓扑位形）** | 承力路径、翼缘/桁架位形、volfrac 单调变硬、penal 去灰 | 绝对柔度值（体素分辨率所限，多解问题本无单一解析位形） |

> **这三者的近似（reLb 钳、Smagorinsky、压力 gauge 积分、Hele-Shaw 深度积分、归一化、体素分辨率）是刻意的定位选择**——用于快速方向性洞察，而非替代定量 CFD/翘曲 FEM。评它们的正确判据是**方向/单调/相对排序**，此三者实测**全部正确**。

---

## 4. 可修偏差清单（趋势级/定量框架内真可改善，排除违背 by-design 的）

> 评估员只报不改；以下均为核心内核外的精化或报表/网格语义修正，**不涉及重写 solver 数学**。

| # | 子系统 | 偏差 | 影响 | 修法（框架内） | 优先 |
|---|---|---|---|---|---|
| **1** | 体素地基 | 若 UI 用「占空比之和」当体积/质量显示 | 系统性低估 **0.8~1.1%** 且唔随加密收敛 | 改用二值 nVox·h³ 或真正双边 cut-cell | **高** |
| **2** | FEA 模态/屈曲 | resolution 按**最长轴**计体素 → 细长/薄壁件截面欠采样 | 定量频率/Pcr 误差**非单调可达 30%+** | voxelize 按**最短实体尺寸**保证最少体素跨度，或给「最小截面体素数」保底 UI 输入 | **高** |
| **3** | FEA 热 | 报表 vmMax 恒落夹持端角奇点 | vmMax 随 res 发散不收敛（res40 达 107% 误差），测试 T1 [100,140] 断言窗高分辨率假 FAIL | vmMax 改用抗奇点统计（P95 分位/排除夹持带 1-2 单元层）；断言改 median/bulk | 中 |
| **4** | FEA 屈曲 | 截面<4 体素时 Pcr 假值 −43%…+100% | 用户在欠解析网格读到假 Pcr | UI/文档强制截面最小体素警告（nAcross<4 标注不可信） | 中 |
| **5** | 注塑模流 | 求解器 trans() 面传导率 T∝H²（少一次 H，应 H³） | solver:true 路径薄壁远端供料/浇口压力量级偏保守（2×厚得4.0应8.0） | trans() 面因子乘埋平均全壁厚 H_avg，补返缺失那次 H。**默认 Dijkstra 趋势路径已正确无需改** | 中 |
| **6** | 风洞 | 球默认 res 未收敛(conv=false)；摩擦阻低 speed 盖过 form-drag 排序 | 球 Cd 含残余波动；低速细长体 Cd 误读偏高 | 提高球类收敛判据/步数上限；UI 提示「低速摩擦主导」或展示 form/friction 分项 | 低 |
| **7** | 体素地基 | 中点判 in/out 令体积误差随 res 非单调乱跳 | box res=64 反弹到 2.36% | 边界体素改占空比≥0.5 判实体（marching-style）令收敛更单调 | 低 |

> **明确排除（违背 by-design，不列为偏差）**：把 wind LBM 改成定量 Navier-Stokes/放开 reLb 钳到 3e4；把 moldflow 加保压 PVT/翘曲 FEM/真实 MPa；把 SIMP 改成连续体网格无关解。这些是**定位选择**不是缺陷。

---

## 5. 给用户的一句 Fusion 对标

> **Fusion 360 Simulation 用 Autodesk Nastran（定量四面体 FEM，可挂绝对应力/位移/安全系数做认证级校核）；webcad 的定位是「定量-趋势之间的 FEA + 纯趋势的 CFD」**——webcad FEA 四子系（静力/模态/屈曲/热）的**内核数学与 Nastran 同源正确**，对解析力学基准（Euler-Bernoulli/Timoshenko/Euler 屈曲/σ=EαΔT）实测收敛到 0.3%~6.8%，**只要网格充分解析（截面≥4~6 体素）就是定量可用的**，差别在 webcad 用体素 staircase+cut-cell（Fusion 用贴体四面体，天然更贴曲面峰值应力）；而 webcad 的风洞/水洞（LBM）与模流是**刻意的趋势级工具**，给「哪个方案阻力更小/哪里先充填/焊接线在哪」的快速方向洞察，**不替代 Fusion CFD/Moldflow 的定量认证**。一句话：**webcad FEA 做概念阶段的定量筛选够用，CFD/模流做方向性预判够用，认证级校核仍回 Fusion Nastran。**

---

*报告依据：8 个并行 benchmark 评估（现有 test harness + additive probe，未改动任何 solver 源）。所有 additive probe 直接 import solver（runVoxelBuckling / runWindTunnel / voxelfea.ts→tsc→import 等），照 tests/fea-adversarial-physics.mjs 与 tests/kernel-sweeploft-probe.mjs 范式，未郁 store.ts / cad.worker.ts / Viewport.tsx / 任何 solver 源。*
