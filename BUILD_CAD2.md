# 内核构建 / 部署手册（cad2 已合并入 cad · 2026-07-12）

> **2026-07-12 变更**：cad2 实验版**已退役合并**。改核（含 GeomPlate G1 家族绑定 + `PlateWrapper.BridgeG1`）经 7 项几何 battery 逐字节验证 == 原核几何后，**已成为 cad production 的唯一内核**。cad2.neuralworkshk.com / /var/www/webcad2 / nginx `sites-*/cad2.conf` 全部移除，`_redeploy_cad2.py` 删除。cad production（cad.conf / /var/www/webcad）完好无损。以下为单一内核构建 + 重建流程。

---

## 当前内核（现役 = 改核）

| 内核 | 大小 | 位置 | 用途 |
|---|---|---|---|
| **改核（现役）** | 11,721,677 B | `src/kernel/replicad_plus.{wasm,js}`（默认）+ `.WORKING` 备份 | cad production（`_redeploy.py`），含 GeomPlate G1 绑定 |

原核（11,691,529 B，无 PlateWrapper）已退役（可从 git 历史取回）。worker `#15` 路由仍 byte-compat：改核有 `PlateWrapper` → 真 G1 路径（过几何理智闸先收货，未收敛退 MakeFilling）；万一换回原核则自动落 MakeFilling，几何逐字节不变。`src` 单一代码库，唯一内核差异是 wasm 二进制。

**几何等价基线（换核后必对）**：box 24000/12t · fillet_r5 23783.16/60t · sphere(a18) 24284.99/2426t · torus 14103.24/3828t · chamfer_3 23980/16t · cut_sphere(a14) 14603.27/1440t · shell_2 7152/28t。

> ⚠ **上面呢啲历史数只记录咗结果，冇记录参数**（fillet_r5 拣边规则？chamfer_3 拣边规则？）→ 凭数字反推参数系估。**2026-07-25 起改用差分式 battery**：`tests/kernel-battery.mjs`，同一份脚本跑新旧两个内核、逐位（f64 完全相等，唔畀容差）比对体积/面积/三角/面数/边数。参数由脚本自己定死，覆盖 12 个 case（平面·柱·球·锥·环面·布尔·圆角·倒角·抽壳·多步工作流）。交叉验证：脚本嘅 `box 24000/12t` 同 `shell_2 7152/28t` 同上面历史基线【逐字相符】。
> ```powershell
> $env:KERNEL_DIR="src/kernel";           node tests/kernel-battery.mjs > old.json
> $env:KERNEL_DIR="_occt-build/_rebuilt"; node tests/kernel-battery.mjs > new.json
> node tests/kernel-battery.mjs --diff old.json new.json     # 要见 ✅ ALL IDENTICAL 先准换
> ```

### 2026-07-25 换核记录（现役 = 加咗 FitWrapper 嘅改核）
| | 旧 | 新（现役） |
|---|---|---|
| bytes | 11,724,436 | **11,735,816**（+11,380） |
| `PlateWrapper` | ✅ | ✅ |
| `FitWrapper` | ❌ | ✅ 6 方法（MakeAnalyticFace / FitBSplineFace / TrimFaceByLoop / SewSolidify / FreeBoundaryInfo / DeviationSample） |

备份：`_kernel_backup_20260725/`。验收：**battery 12/12 逐位相同** · **全部 `tests/*kernel*.test.mjs` 55/55 绿** · mesh→B-rep golden 7/7 solid 体积误差 0.00000% + tier2 68/68（★ 呢两个套件原本指住 `_occt-build/_rebuilt`，即係之前嘅绿【冇证明过生产路径】—— 已改指 `src/kernel` 重跑 ★）。

---

## 构建 + 部署 cad（production）

```powershell
cd C:\ClaudeCode\webcad
# src/kernel 已经系改核 —— 无需再 swap（cad2 退役后无双内核 dance）
npm run build
python _redeploy.py        # → /var/www/webcad（cad.neuralworkshk.com）
```

> ⚠ 改核 wasm 11.7MB，`_redeploy.py` 上传较慢（wasm 变时可能数分钟，命令或 10min 超时属正常）。上线后独立 curl 验证：index bundle 200 + `curl -sI .../assets/replicad_plus-<hash>.wasm` → 200 + size 11721677。

---

## 重建改核内核（改 GeomPlate 绑定 / 加更多 OCCT 方法时）

内核配方（authoritative）：`C:\ClaudeCode\replicad-src\packages\replicad-opencascadejs\build-config\custom_build_plus.yml`
- `mainBuild.bindings`：`- symbol: X` 逐个暴露 OCCT 类到 JS（GeomPlate 家族 @ line 283-291）。
- `additionalCppCode: |`：`PlateWrapper.BridgeG1(...)` 实作 @ line 583+。**加更多 OCCT 方法可行**（OCCT 已预编译在 docker 镜像 → 只链薄绑定层，约 5-6 分钟）。

重建：
```powershell
wsl -d Ubuntu -u root -- bash -l /mnt/c/ClaudeCode/webcad/_occt-build/wsl_build_stage.sh
```
产物落 `_occt-build/_rebuilt/replicad_plus.{wasm,js}`。换入 + 更新 .WORKING：
```powershell
Copy-Item _occt-build\_rebuilt\replicad_plus.wasm src\kernel\replicad_plus.wasm -Force
Copy-Item _occt-build\_rebuilt\replicad_plus.js   src\kernel\replicad_plus.js   -Force
Copy-Item src\kernel\replicad_plus.wasm src\kernel\replicad_plus.wasm.WORKING -Force
Copy-Item src\kernel\replicad_plus.js   src\kernel\replicad_plus.js.WORKING   -Force
```
**换核后必须跑上面几何 battery 对比基线**，确认现有几何逐字节不变，方可部署。

> ⚠️ 关键事实：`-msimd128` 等 emccFlags 只影响薄绑定层，**不影响 OCCT 数学**（byte-identical wasm 证实）→ 加 flag **无加速**。「更快」需从源码重编 OCCT（30+ 分钟）。「更聪明」= 绑更多 OCCT 方法（可行，已在预编译库里）。

---

## #15 真 G1 现状（已绑定 working，安全门控）

`PlateWrapper.BridgeG1` 已绑定 + 可调用 + kernel 存活 + 浏览器载入无 abort + 产出乾净有界真 G1 拱（live-measured：缓 5° 喇叭 +2.9mm、陡 59° 锥 +10mm、垂直壁 box 平盖，全过理智闸）。

**关键洞察 = nbIter=1**。GeomPlate 变分迭代对切线补面【发散】：nbIter≥3 爆冲（缓 2.9→27mm、陡 10→131mm，每加迭代~翻倍；高 nbIter 会 37min CPU hang）。nbIter=1 时首个 Newton 步即落极小曲面 → 乾净拱。raw GeomPlate 同 MakeFilling(G1) 都一样发散（TolAng/TolCurv 零影响）—— 算法性，非调参。种子核加 **LoadInitSurface**（Newell 法向平面穿边界）令退化 box 有界（132→44mm）。

worker 调 `PlateWrapper.BridgeG1(edgeW, faceW, true, 3, 15, 1, 1e-4, 1e-2)`（nbIter=1）+ **几何理智闸**（结果 bbox ≤ MakeFilling 参考 + refDiag*0.6，否则退回 MakeFilling）。良置补面得真 G1，病态安全退回，永不劣于 cad。测试：`tests/geomplate-*.mjs`。R1 面圆角真 B-rep blend 可复用此 BridgeG1 路径（现改核已在 cad，无需再 swap）。
