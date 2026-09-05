## #0 [HIGH] sketch-draw/numeric — 打字输入多边形半径忽略「内切圆(对边距)」模式 — 套螺母/扳手尺寸全错
- 证据: src/store.ts:4882-4887 typed 路径：`const R = num(buf[0], ...)`，然后 `shape={type:'poly', pts:...}` 直接用 R 做外接半径、`a0 = atan2(prev[1]-start[1], prev[0]-start[0])` 无 `+Math.PI/N` 旋转。对比鼠标路径 src/store.ts:4576-4577：`const r = s.polyInscribed ? clicked / Math.cos(Math.PI/N) : clicked` + `const a0 = ... + (s.polyInscribed ? Math.PI/N : 0)`。typed 完全冇读 polyInscribed。
- 场景: 用户开『多边形』工具，撳『内切圆(对边距)』模式（六角螺母常用），落圆心后打数字例如『打 17 ⏎』想要对边距=17 的六角。实际生成的是外接圆半径=17（对边距≈29.4）的六角，且少转 30° 朝向唔啱。无任何提示。
- 根因: typed-dimension 分支没有复制鼠标路径的 inscribed→circumradius 换算（clicked/cos(π/N)）同朝向旋转（+π/N）。两条提交路径几何公式不一致。
- 修复: 在 4882-4887 typed 分支照搬鼠标路径：`const r = s.polyInscribed ? R/Math.cos(Math.PI/N) : R` 与 `a0 += s.polyInscribed ? Math.PI/N : 0`；状态文案同步显示对边距/外接Ø。
- guarded: False

## #1 [HIGH] sketch-draw/logic — 圆弧槽 sweep 归一化语句 `while(sweep>Math.PI) sweep += 0` 是死循环风险/无效代码
- 证据: src/store.ts:4589 `let sweep = a1 - a0; while (sweep <= -Math.PI) sweep += 2*Math.PI; while (sweep > Math.PI) sweep += 0`。第二个 while 的 body `sweep += 0` 永不改变条件 → 若 sweep>π 即无限循环。紧接 4590 `if (sweep < 0) sweep += 2*Math.PI` 才把负值转 CCW。
- 场景: 圆弧槽：圆心→第一端→第二端。当 a1-a0 落在 (π, 2π) 区间（第二端在第一端 CCW 方向超过半圈），sweep 初值 >π，第一个 while 不触发（sweep>−π），第二个 while 条件 sweep>π 为真且 body 不改值 → 浏览器卡死/无限循环冻结草图。
- 根因: 明显笔误：本意应是把 sweep 归一到 (−π,π] 或留待下方 CCW 处理，但写成 `+= 0` 形成永真循环。即便 JS 引擎单次求值，逻辑上也是 dead code 且语义错误（注释写 shortest dir 但无实现）。
- 修复: 删除 `while (sweep > Math.PI) sweep += 0` 整句（下方 4590 的 `if(sweep<0) sweep+=2π` 已处理 CCW），或改为正确归一 `while (sweep > Math.PI) sweep -= 2*Math.PI`。需配合验证 sweep 落在 (0,2π)。
- guarded: False

## #2 [HIGH] sketch-constraints/logic — coincident 点-在-弧段：约束落在弧的「弦线」而非弧本身，几何被错锁
- 证据: freesolve.ts:334-337 refLineId 对任何 `kind==='edge'` 一律返回 `lid(shape,idx)`（弦线 id），不区分该 edge 是否 verts-poly 弧段。buildPrims 对弧段同时生成弦 line(lid, :505) 同真 arc(said, :516)。coincident 分支 freesolve.ts:597-598 用 `point_on_line_pl(l_id=bLn)` → 把点钉在弦上。midpoint(:644-651)/parallel(:600)/perp(:601)/collinear(:666) 同样只用 refLineId=弦。
- 场景: 用户画一个圆角矩形或槽（弧段），想把一个点「重合」到弧上（point-on-curve），系统把点钉到弧的弦（两端点连线）上，点会落在弧内侧而非弧上；视觉上点偏离弧，但 UI 报「已求解」无错。parallel/perp 选中弧段时亦是对弦操作，语义误导。
- 根因: refLineId 把弧段 edge 当普通直线边，返回弦线 id；只有 tangent/equal/concentric/arc-dim 分支特判了 arcSegOf，其余约束分支沿用弦线。
- 修复: coincident 命中弧段 edge 时改用 point_on_arc(若 planegcs 支持)或在 conApplicable 拒绝弦语义误导的组合；parallel/perp/collinear 对弧段应禁用并提示；至少在 refLineId 旁加 arcSegOf 判断走 arc 专用约束。
- guarded: False

## #3 [HIGH] sketch-modify/logic — 输入命令 'm' 镜像 (sketchMirror) 会静静删走除当前轮廓以外嘅所有已提交轮廓
- 证据: store.ts:2632-2637 sketchMirror: base = s.sketchShape || (profiles.length===1?profiles[0]:null); 然后 `sketchProfiles: [base, mir(base)]` —— 直接用 [base, 镜像] 覆盖 sketchProfiles,完全唔保留其它已存在嘅 profiles。对比 mirrorSketch(2840) 用 `[...s.sketchProfiles, sh]` 同 reflectShape 保留全部 flag。命令绑定喺 store.ts:7140 `if (/^m$/i.test(raw[0])) return get().sketchMirror(...)`
- 场景: 用户画咗 3 个轮廓(2 个入 sketchProfiles,1 个做 sketchShape),想镜像,喺命令框打 'm' 或 'm y'。结果:其余 2 个已提交轮廓被静静删走,只剩 base+镜像,而且镜像副本仲丢失 construction/open/smooth/bspline/conic/ctrl 标志(2636 只处理 rect/circle/verts-bulges/arc)。
- 根因: sketchMirror 系旧版实现,base 只取单一轮廓,输出又用字面数组覆盖 sketchProfiles,既无 [...sketchProfiles] 合并,亦无 reflectShape 嘅 flag 保真。已被 mirrorSketch/skMirrorAt 取代但命令路径仍指向佢。
- 修复: sketchMirror 改为复用 reflectShape + 保留 [...s.sketchProfiles, sketchShape...] (镜像全部或所选),或直接将命令 'm' 转去 mirrorSketch(axis)。最少要 `sketchProfiles: [...existing, mir(base)]` 并保 flag。
- guarded: False

## #4 [HIGH] extrude-revolve/numeric — 对称拉伸喺 XZ 平面（前视草图）冇居中 — 实体摆错位
- 证据: cad.worker.ts:1288-1294 `let off = ... base ; if (f.symmetric) off -= f.height / 2 ; ... solid.translate(n[0]*off,...)`。XZ 平面 RES_SIGN=-1（line 22），sk.extrude(h) 实际沿 −Y 行进，solid 沿 n(=+Y) 占 [base, base−h]；要居中须 +h/2，但代码恒减 h/2 → [base−h/2, base−3h/2]。XY(RES_SIGN=+1)啱，XZ/任何 RES_SIGN<0 嘅面错成整段偏到一边。
- 场景: 喺前视(XZ)平面画一个矩形，拉伸范围拣「对称」。用户以为实体对称跨草图平面，实际整段偏咗 h（一边 0、另一边 −1.5h），同显示草图唔对位。
- 根因: symmetric 居中偏移 `off -= f.height/2` 冇乘 RES_SIGN[plane]；只对 RES_SIGN=+1（XY/YZ）成立，XZ（−1）方向相反。
- 修复: 用实际行进方向居中：`if (f.symmetric) off -= RES_SIGN[plane] * f.height / 2`（与 line 1291 trav 同源），令 XZ 也对称跨草图平面。
- guarded: False

## #5 [HIGH] extrude-revolve/numeric — 旋转(revolve)忽略草图平面 — 非 XY 草图旋转出错位/错向几何
- 证据: store.ts:7252 `const prof = shapeToProfile(sh)` 缺 plane 实参 → 默认 'XY'（shapeToProfile 签名 store.ts:2001 plane='XY'）；worker cad.worker.ts:1304 `const sk = profileToSketch(f.profile)` 亦默认 XY z=0；Feature revolve 类型(line 35)根本无 plane 字段。bundle.plane(7257)被存但几何永不读。stToProfile 对 XY 做 [s,−t]、对 XZ 做 [s,t]（store.ts:78）。
- 场景: 喺前视(XZ)或右视(YZ)平面画半剖轮廓做车削（花瓶/轴），撳旋转。轮廓嘅 t（用户当成世界 Z 高度）被当 XY 嘅 −y、放喺 z=0 平面再绕世界 Y 转 → 实体方位/位置同所画草图完全唔同，但无报错。
- 根因: revolve 创建端同 worker 端都硬编码 XY 平面，无把草图实际平面（bundle.plane）带入坐标映射同旋转轴语义。
- 修复: revolve Feature 增 plane 字段；store 端 `shapeToProfile(sh, st0.sketchPlane)` 并把 plane 透传；worker `profileToSketch(f.profile, 0, f.plane ?? 'XY')`，同时按平面调整默认轴语义。或最低限度：当 sketchPlane!=='XY' 时拒绝并提示「车削暂只支持 XY/俯视草图」。
- guarded: False

## #6 [HIGH] assembly-joints/numeric — componentCenter 忽略组件 rot 同 FK → 关节默认锚点、爆炸中心、动力学质心都错位
- 证据: store.ts:6698-6713 componentCenter 只用 mesh bbox 中点 + c.pos 做 swizzle（[pos0+cx, pos1+cz, pos2-cy]），完全无用 c.rot，亦无 computeFK。被 JointsPanel.tsx:131 addJoint({…anchor: componentCenter(child)…}) 用作关节默认锚点；被 Viewport.tsx:2242 用作爆炸中心；被 store.ts:8689 runMotionStudy com=componentCenter(j.child) 用作重力质心。
- 场景: 把一个已旋转（c.rot≠0）或已被父关节驱动嘅组件加关节：新关节锚点落咗喺未旋转位置，转轴/铰链原点同实际几何唔对位，拖滑杆时件围错点转。动力学/爆炸同样以错位中心计算。
- 根因: 组件世界中心嘅唯一真源应系 compWorldMatrix(c, fk)（store.ts:390 已含 pos+rot+FK+Rx(-90)），但 componentCenter 自己手算且漏咗 rot/FK。
- 修复: componentCenter 改为：取 mesh bbox 中心（CAD 系），经 compWorldMatrix(c, computeFK(...).get(id)) 变换到 three 世界系返回；调用方传入 fk Map 避免重算。
- guarded: False

## #7 [HIGH] params-expr/numeric — 表达式 .5（无前导零小数）被静默吞掉小数点 → 值变大 10 倍而无任何警告
- 证据: src/store.ts:2106 tokenizer 正则 `(\d+\.?\d*|...)` 要求数字必须以数字开头，无法匹配 `.5`。我用真实 evalExpr 逻辑跑：evalExpr('.5*2') => 10（应为 1）。`.`既唔系数字又唔在运算符类 `[+\-*/()^%,]`，被 match 直接丢弃，剩 `5*2`=10。该结果非 null，故 setParamExpr(store.ts:10184) 与 bindSkDimExpr(store.ts:3748) 的 `evalExpr(...)==null` 校验全部通过，当成『已联动』成功。
- 场景: 非程序员喺 ƒx 参数或尺寸公式框输入『.5』表示一半（半径、壁厚等常见写法），或输入『壁厚*.5』。系统唔报错，直接当成 5（或把 *.5 当成 *5），实体尺寸大 10 倍，用户以为做啱咗。
- 根因: tokenizer 正则缺少对 `\.\d+`（无整数部分小数）的分支；非法字符 `.` 被静默丢弃而非令整条表达式 reject。
- 修复: 把数字分支改为 `(\d*\.\d+|\d+\.?\d*)`（先匹配 .5 形态）；并在 tokenizer 后做『重组后字符串去掉空白须等于原表达式去空白』的完整性校验，遇到被丢弃字符即 return null，杜绝任何静默吞字符。
- guarded: False

## #8 [HIGH] view-render-timeline/interaction — 正交相机模式下滚轮完全无法缩放(自定 WheelZoom 早退 + 已吞掉原生滚轮)
- 证据: src/components/Viewport.tsx:1626-1657 WheelZoom 嘅 onWheel: 行 1628 `e.preventDefault()`、行 1629 `e.stopImmediatePropagation()`(捕获阶段先于 OrbitControls 原生 wheel 监听执行,杀死原生处理),然后行 1631 `if (!cam.isPerspectiveCamera) return` — 正交相机直接 return,自己又唔做任何缩放。监听以 `{capture:true}` 挂喺同一 domElement(行 1656)。
- 场景: 撳 📐 切正交 → 滚动鼠标滚轮想放大/缩小。乜都唔会发生:自定处理早退,而原生 OrbitControls 嘅滚轮(本来识改正交 zoom)已被 stopImmediatePropagation 截断。用户以为视图卡死。
- 根因: WheelZoom 设计只针对透视相机(改相机距离),正交相机分支只 return 而无 fallback;但 stopImmediatePropagation 已无差别杀掉原生滚轮,令正交模式两边都缩唔到。
- 修复: 正交分支唔好净係 return:改 camera.zoom(例如 `oc.zoom *= e.deltaY>0 ? 1/factor : factor; oc.updateProjectionMatrix(); controls.update()`,最好同样做 zoom-to-cursor),或正交模式下唔好 stopImmediatePropagation 让原生 OrbitControls 处理滚轮。
- guarded: False

## #9 [MEDIUM] sketch-draw/honesty — crect/slot/rrect/ellipse 打数字定尺寸是空壳 — 显示打字提示但 Enter 静默无效
- 证据: src/store.ts:4868 任何工具都会显示打字 readout：`typedReadout(tool,buf,...)`；但 commit 分支只处理 `rectangle`(4876)、`circle`/`polygon`(4882)、polyline/spline/bspline(4889)。crect/slot/rrect/ellipse/arc 等落到 4896 `return {}` —— Enter 完全无反应。sketchDimText 又在 src/store.ts:239-242 为 rrect/ellipse/slot 显示尺寸读数，进一步引导用户打字。
- 场景: 用户开『中心矩形/槽/圆角矩形/椭圆』，落第一点后想精确打尺寸（例如槽长 50 ⏎）。底栏一路显示『↘ [5][0] mm 打字输入』，撳 Enter 完全无嘢发生，shape 唔会生成，无错误提示，用户以为系自己撳错。
- 根因: sketchTypeKey 的 Enter 提交分支只覆盖 rectangle/circle/polygon/polyline，遗漏其余 two-click 工具；但 readout 生成层无门槛，对所有工具显示『可打字输入』假象。
- 修复: 两选一：(a) 为 crect/slot/rrect/ellipse 补 Enter 提交几何（套用各自鼠标公式 + 当前 sketchSlotW/sketchCornerR）；(b) 若暂不支持，则 typedReadout/数字键对呢几个工具直接 no-op（唔显示打字提示），避免误导。
- guarded: False

## #10 [MEDIUM] sketch-draw/interaction — 构造参考线用未吸附的 raw 坐标落点 — 唔会真正过端点/格点
- 证据: src/store.ts:4491 `if (tl === 'cline') { ...; get().skAddConstructionLine(raw); return }` —— 传入 raw（未经 snapInSketch）。对比所有绘制工具在 4513 用 `pt = snapInSketch(raw,...)`。skAddConstructionLine(src/store.ts:2927-2933) 直接用 p[0]/p[1] 建线，状态还报『过 X,Y』。
- 场景: 用户用构造线工具，想画一条水平参考线刚好穿过某个已画矩形的角/原点（做对称轴）。鼠标对准该角点，画布显示橙色吸附环（onSketchMove 行的是 snap 路径）。但点击后线落在 raw 光标处（差几 mm），参考线并冇真正过该点 → 之后镜像/对中全部偏。
- 根因: cline 在 onSketchClick 早退分支用 raw 而非 snapInSketch 的吸附点；与 move 阶段显示的吸附环、与状态文案承诺的『过 X,Y』不一致。
- 修复: 4491 改为先 `const pt = snapInSketch(raw, null, [], get().sketchShape, get().sketchProfiles).pt` 再 `skAddConstructionLine(pt)`，与其它绘制工具一致。
- guarded: False

## #11 [MEDIUM] sketch-draw/interaction — 中心矩形(crect) 在 onSketchMove 漏出 twoClick 列表 — 第二点预览会吸回中心塌成零矩形
- 证据: src/store.ts:4512 onSketchClick 的 twoClick 含 crect：`['rectangle','crect','circle','ellipse','polygon','slot','rrect']`；但 src/store.ts:4758 onSketchMove 的 twoClick 缺 crect：`['rectangle','circle','ellipse','polygon','slot','rrect']`。snapInSketch(src/store.ts:212) 的塌缩防护 `(!snapStart && start)` 只在 snapStart=false（即 twoClick=true）时把靠近 start 的候选过滤走。
- 场景: 用户画中心矩形，第一击定中心，移动鼠标找第二角点；当光标移近中心（小矩形/缩远时）预览会被吸附环拉回中心，ghost 闪成零面积矩形 + 橙色吸附环钉在中心，与真正点击（onSketchClick 会过滤掉中心）行为不符 → 预览/落地不一致，画细中心矩形时手感很差。
- 根因: 两处 twoClick 数组不同步，crect 在 move 阶段被当成多点工具允许吸回 start。
- 修复: 在 4758 的 twoClick 数组加入 'crect'，与 4512 保持一致。
- guarded: False

## #12 [MEDIUM] sketch-constraints/numeric — 角度尺寸：创建用 [0,360) 值，但 measureDim 同 planegcs 求解只认 [0,180) — 钝角/反向角会被错改
- 证据: store.ts:3951 addSkAngleDim 计 `ang = ((atan2(B)-atan2(A))*180/PI + 360)%360`（可达 0..360）并存为初值；但 freesolve.ts:744 measureDim('angle') 做 `d = abs(u-v)*180/PI; d %= 180`（值域 0..180），freesolve.ts:579 buildPrims 发 `l2l_angle_ll angle=value*PI/180`。l2l_angle 嘅有向性同 measureDim 嘅折返(0..180)对唔上。
- 场景: 用户拣两条边、两条夹角约 200°（或边方向令 atan2 差落 180..360 区间），∠尺寸初值显示 ~200，但求解器把方向角折去 [0,180)，几何被强行扭去补角（~160），同标签数字唔一致；从动量度值亦同创建值差成 180°-折返。
- 根因: 三处对「角度」嘅定义唔统一：创建用模 360 嘅有向角，量度用模 180 嘅无向角，求解用 planegcs 有向 l2l_angle。off-by 一个 180°/方向语义。
- 修复: 统一角度语义：创建时同 measureDim 一样取 [0,180)（或两处都改用同一个有向定义并固定线方向）；如要支持钝/反角，需在 buildPrims 选择线序使 angle 落入同一区间。
- guarded: False

## #13 [MEDIUM] sketch-constraints/numeric — 参数/公式驱动尺寸强制 Math.abs，角度尺寸无法表达 >180/负向，且公式结果为 0 静默回退旧值
- 证据: store.ts:131-132 withParamVals：`if (c.expr){ v=evalExpr(...); return v!=null ? {...c, value: Math.abs(v)||c.value} : c }` 同 `if(c.param) return {...c, value: Math.abs(byName.get)||c.value}`。对所有 dim 类型一律取绝对值，且 `||c.value` 令 0 退回旧值。
- 场景: ① 用户用 ƒx 把角度尺寸绑参数 a=270 → abs 后仍 270 但其它角度路径只认 0..180（见上条）；更直接：把任何尺寸参数设成 0（例如想驱动 hdist=0 令两点对齐）→ `Math.abs(0)||c.value` = 旧值，参数被静默忽略，几何唔郁但用户以为设咗 0。② 公式算出负数（如 d1-d2 想做有向差）被翻正，方向反。
- 根因: 用 `Math.abs(v)||c.value` 一刀切：0 被 falsy 短路回退旧值，负值被翻正，未按 dim 类型区分（角度/有向差 vs 半径/长度）。
- 修复: 只对必须正的尺寸(len/dia/rad/dist/arclen)做正值保护，且用显式 `v!=null && isFinite(v)` 而非 `||`；角度/差值保留符号；0 视为合法值（除半径/直径外）。
- guarded: False

## #14 [MEDIUM] sketch-constraints/numeric — % 与 / 在 evalExpr 中除零静默返回 0，参数公式 d1/d2(d2=0) 得 0 而非报错→尺寸悄悄变 0/回退
- 证据: store.ts:2135 `t==='%'?(b===0?0:a%b): b===0?0:a/b` — 除零/模零返回 0，不返回 null。配合 withParamVals 的 `Math.abs(v)||c.value`，公式 `10/p`(p=0) → 0 → abs 0 || 旧值 = 静默回退旧值。
- 场景: 用户写 ƒx 公式引用另一个值为 0 的参数做分母，期望报错/警告，实际尺寸悄悄保持旧值，公式形同失效。
- 根因: 求值器把除零当 0 而非错误，叠加上层 `||回退` 双重静默。
- 修复: evalExpr 除零返回 null(让上层显示『公式无效』)，而非 0;上层据 null 给出诚实提示。
- guarded: False

## #15 [MEDIUM] sketch-modify/interaction — 底栏「⇋左右轴 / ⇅上下轴」一键镜像只处理当前活动轮廓,多轮廓时静静漏镜其余
- 证据: SketchToolPanel.tsx:120-121 两个按钮 onClick 调 g().mirrorSketch('y'/'x')。store.ts:2840 mirrorSketch: `const sh = s.sketchShape; if (!sh) return {status:'先画一个轮廓再镜像'}` —— 只读 s.sketchShape,完全忽略 s.sketchProfiles,只镜一个。
- 场景: 用户画咗多个轮廓(例如两个圆,一个落咗 sketchProfiles 一个系 sketchShape),揿「左右轴」。只有 sketchShape 嗰个被镜像,profiles 入面嗰个无声无息唔镜。若刚做完 offset/array/trim(令 sketchShape=null),揿掣直接弹『先画一个轮廓再镜像』,用户睇住明明有图都话冇。
- 根因: mirrorSketch 设计只针对单一活动 sketchShape,但 UI 把佢当『一键全部对称』,语义唔夹;且对 sketchShape===null(offset/array 后常态)无 fallback 去 profiles。
- 修复: mirrorSketch 改为对 [...sketchProfiles, sketchShape].filter 全部(或所选 skSel)做 reflectShape 镜像,输出 append 唔覆盖;sketchShape 为 null 时用 profiles。
- guarded: False

## #16 [MEDIUM] sketch-modify/interaction — 草图倒圆角/倒角「全部角一次过」只作用于活动 sketchShape,offset/array/trim 后静静失效
- 证据: store.ts:2669-2671 filletSketchCorners: `const sh = s.sketchShape; if (!sh || sh.type!=='poly'...) return {status:'请先画一个折线/多边形轮廓再倒圆角'}`;2686-2688 chamferSketchCorners 同样只读 s.sketchShape。两者都唔睇 sketchProfiles。面板 SketchToolPanel.tsx:107 「全部角一次过」掣调佢哋。
- 场景: 用户做完阵列(sketchArrayRect 把结果全部放入 sketchProfiles,sketchShape=null,见 2596),或做完 offset(skOffsetAt 2789 设 sketchShape:null),再揿『全部角一次过』倒圆。无声失败弹『请先画一个折线/多边形轮廓』,用户面前明明有多边形。
- 根因: 全角倒圆/倒角只支持单一活动 sketchShape,对 sketchProfiles 内嘅轮廓(阵列/偏移/镜像后嘅常态)无处理。
- 修复: 两个 action 改为遍历 sketchProfiles + sketchShape 嘅每个可倒角 poly,逐个 filletAt/chamferAtIdx 后写回各自位置;或至少当 sketchShape 为 null 而 profiles 有 poly 时挑选最近/全部处理。
- guarded: False

## #17 [MEDIUM] sketch-modify/logic — reflectShape 镜像椭圆弧(earc)时丢失参数,弧塌成死折线;椭圆(ell)反射唔被阵列保真覆盖
- 证据: store.ts:2318-2329 reflectShape 依次检查 circle/rect/(verts&bulges)/arc/ell,最后 fallback(2329)只 map sh.pts 但唔带 earc 字段。earc 形状无专门分支 → 落到 fallback → 返回 `{type:'poly',pts:sh.pts.map(rf)}`,丢失 earc 参数(圆心/长短轴/起终角)。translateSketchShape(2486)同 sketchArrayRect(2591)有保 earc,唯独 reflectShape(任意轴镜像)无。
- 场景: 画一条椭圆弧,用 mirror 工具点轮廓+点直线轴做任意角度镜像(skMirrorAt→reflectShape)。镜像副本变成一堆密铺点嘅死 poly,唔再系可参数编辑/精确嘅椭圆弧,后续标注/再修改走样。
- 根因: reflectShape 漏咗 earc 分支,fallback 唔搬 earc。
- 修复: 喺 ell 分支之后/之前加 earc 分支:反射 cx,cy + rot=2θ−rot,保留 a/b/start/end(参考 ell 处理 + translateSketchShape 嘅 earc 保真)。
- guarded: False

## #18 [MEDIUM] sketch-modify/numeric — 环形阵列中心落喺轮廓内/上时全部副本叠埋一齐,apply 无任何守卫或提示(只靠 Hint 文字)
- 证据: store.ts:2599-2616 sketchArrayCirc 用 rotPt 绕 (cx,cy) 旋转;若 cx,cy 等于轮廓质心,旋转后每个副本几乎完全重叠。无最小半径/退化检查。SketchToolPanel.tsx:189 只用文字 Hint『中心要离开轮廓,否则副本会叠埋一齐』提醒,apply 本身唔拦。
- 场景: 新手对一个画喺原点附近嘅圆做环形阵列,中心 X/Y 留默认 0(=圆心)。出嚟 6 个圆全部重叠喺同一位置,睇落似得一个,拉伸只得一个圆孔。用户以为阵列冇做到。
- 根因: 环形阵列缺『中心到轮廓最小距离』退化守卫;旋转半径≈0 时副本重合但无报错。
- 修复: apply 前算轮廓质心到 (cx,cy) 距离,若小于轮廓尺度某比例则报『中心太近轮廓,副本会重叠 — 移远中心』并拒绝/警告。
- guarded: False

## #19 [MEDIUM] extrude-revolve/logic — 多轮廓拉伸静默丢弃 对称/扭转/拔模 设置
- 证据: store.ts:7757-7765 多轮廓分支生成 feature 对象只带 height/operation/baseZ/plane/through/inward/down，无 twist/symmetric/draft；对比单轮廓分支 store.ts:7735-7741 有传 `twist, symmetric, plane, draft, down`。
- 场景: 画两个同心圆（环/垫圈）或任何多于一个轮廓嘅草图，喺拉伸对话框开「对称」或填「扭转 30°」或「拔模 5°」，撳确定。结果系普通直拉伸（无扭转、无拔模、唔居中），但状态栏报「已拉伸…真实 OCCT B-rep」当成功。
- 根因: 多轮廓 even-odd 嵌套分支漏传对话框嘅 twist/symmetric/draft 三个参数到每个子 feature。
- 修复: 喺 7765 嘅 feature 字面量补 `twist: twist||undefined, symmetric: symmetric||undefined, draft: draft||undefined`（draft 只对 plane XY 有效，可同单轮廓一致传）。
- guarded: False

## #20 [MEDIUM] extrude-revolve/logic — 时间轴重开多轮廓拉伸用严格 > 比较 — 重叠/同尺寸孔被误嵌套填实
- 证据: regen 路径 store.ts:13209 `areas[j] > areas[i]`（无 epsilon）；创建路径 store.ts:7755 已修为 `areas[j] > areas[i] * (1 + 1e-6)` 并附注释解释：24-gon 镶嵌后面积有 ~5e-14 浮点噪声，严格 > 会把第二孔误判嵌套(depth=2)当实心岛 fuse 回，重叠区填料。
- 场景: 做一个有两个相同直径/重叠孔嘅多轮廓拉伸（创建时正确出两个孔），然后喺时间轴双击该特征改高度/重生成 → 重生成走 regen 路径，严格 > 触发误嵌套，其中一个孔被填实。
- 根因: regen 重建路径未同步创建路径嘅相对 epsilon 修复，depthOf 比较退回严格 >。
- 修复: 把 13209 改成同创建端一致 `areas[j] > areas[i] * (1 + 1e-6)`（并考虑抽成共用函数避免再次漂移）。
- guarded: False

## #21 [MEDIUM] extrude-revolve/logic — 多轮廓相交拉伸只用最大轮廓、内部孔被忽略
- 证据: store.ts:7742-7747 多轮廓 intersect 分支：`profiles.forEach(...找最大面积 bi...); addExtrude(profiles[bi],...,'intersect',...)`，内部所有其它轮廓（含孔）被丢弃。
- 场景: 草图含外环+内孔，操作选「相交」。用户预期相交体保留孔，实际只用最大外轮廓做相交工具，内孔轮廓完全无效，结果与预期形状不同，但报「已拉伸/相交」当成功。
- 根因: even-odd 嵌套唔合成单一相交工具，代码改用最大轮廓简化，但既无 UI 提示亦无 warning。
- 修复: 至少 set status 提示「相交只用最外轮廓，内部孔已忽略」；或把多轮廓 even-odd 区域先布尔合成再做单次 intersect。
- guarded: False

## #22 [MEDIUM] loft-sweep-coil/logic — 锥形/沙漏弹簧（taper r2）功能存在但 UI 完全去唔到 —— addCoil 系死代码
- 证据: store.ts:10067 addCoil() 用 appPrompt 收 5 个参数（含顶半径 r2），系唯一会写 r2 字段嘅入口；worker cad.worker.ts:2801-2809 净系喺 f.r2 存在时先行锥形 B-spline 脊线。但 grep addCoil 全 src 只得定义（store.ts:1380 声明、:10067 实现），无任何调用方。工具栏 handleTool case 'coil'（store.ts:7231）→ openFeatDlg('coil') → 弹窗（Viewport.tsx:3679-3684 只有 Ø/螺距/高/丝Ø，无 r2）→ commitFeatDlg（store.ts:9328）建 feature 时 radius:(+p.d)/2, wireR:(+p.wire)/2，从不写 r2。
- 场景: 用户撳螺旋/弹簧按钮，想做锥形弹簧（蜂窝/沙漏形），弹窗根本无顶半径栏，永远只出圆柱形弹簧。worker 入面写好嘅锥形分支永远唔会触发。
- 根因: 两套 coil 创建路径并存：旧 addCoil(appPrompt, 支持 r2) 同新 featDlg(无 r2)。工具栏只接咗 featDlg，addCoil 变孤儿，r2 锥形能力静默失联。
- 修复: 喺 coil featDlg（Viewport.tsx:3679）加「顶Ø(=底则圆柱)」输入栏；commitFeatDlg coil 分支（store.ts:9328）读 p.d2/p.topR 写 ...(Math.abs(r2-radius)>1e-6?{r2}:{}). 或者删 featDlg coil、把 case 'coil' 改返 get().addCoil()。
- guarded: False

## #23 [MEDIUM] loft-sweep-coil/logic — 放样截面唔按 Z 排序 —— 用户先画高 Z 截面再画低 Z 会建出扭曲/自交实体或直接失败，无提示
- 证据: cad.worker.ts:1693-1695 普通放样路径 `f.sections.map(...)` 直接用插入顺序，无 sort；同样 cap 路径(:1649 for-of f.sections)、continuity 路径(:1681 for-of f.sections)都唔排序。对比 surfloft(:2496 `.sort((a,b)=>a.z-b.z)`) 同 rail 路径(:1581 `[...f.sections].sort(...)`)都有排序。commitLoft(store.ts:9912-9927) 把 loftSections 原样塞落 feature 唔排序；addLoftSection(store.ts:9902) 按用户撳掣顺序追加。
- 场景: 用户喺 Z=50 画第一个截面 →「+放样截面」→ 改基准 Z=0 画第二个 →「+放样截面」→ 放样。sections=[{z:50},{z:0}]，loftWith 由高到低串，得出沿 Z 反向/扭转嘅放样体（同预期形状唔同），或 ThruSections 失败退回。
- 根因: 实体放样三条主路径都假设 sections 已按 Z 升序，但收集端从不排序，曲面/导轨路径又各自排序，行为唔一致。
- 修复: commitLoft 入面或 worker 实体放样前统一 `const secs=[...f.sections].sort((a,b)=>a.z-b.z)`，cap/continuity/plain 三处都用 secs（同 surfloft 一致）。
- guarded: False

## #24 [MEDIUM] loft-sweep-coil/logic — 两个放样截面落喺同一 Z（或 Math.round 撞同值）会令放样失败，addLoftSection 无去重守卫
- 证据: store.ts:9905 `const sec = { profile:..., z: Math.round(s.sketchBaseZ) }`，:9908 直接 push 入 loftSections，无任何同 Z 检查。对比 addLoftSectionFromSketch（store.ts:4437）有 `if (s.loftSections.some(sec=>Math.abs(sec.z-z)<1e-9)){...两个放样截面唔可以同一高度;return}`。worker loftWith 收到两条同平面 wire → ThruSections 退化/失败。
- 场景: 用户基准 Z 维持 0（忘记改）连画两个截面就撳「+放样截面」两次 → 两节都 z=0；或基准 Z=0.3 同 0.4 各画一个，Math.round 后都变 0。放样静默失败/退回，用户唔知点解。
- 根因: banking-from-current-sketch 路径漏咗 from-sketch 路径已有嘅同 Z 去重守卫；Math.round 进一步令相近 Z 撞埋。
- 修复: addLoftSection 加同款守卫：`if (s.loftSections.some(x=>Math.abs(x.z-sec.z)<1e-6)) return {status:'已有同高度截面…'}`；并考虑唔 Math.round（或提示精度损失）。
- guarded: False

## #25 [MEDIUM] modify-solid/numeric — 加强筋拔模：用整条挤出长度算收窄，令高/深嘅筋一加拔模就塌成刀刃
- 证据: cad.worker.ts:3254 `const hwTop = Math.abs(ribDraft) > 0.01 ? Math.max(0.05, hw - Math.abs(signedH) * Math.tan((ribDraft * Math.PI) / 180)) : hw`；其中 signedH 喺 3247 `if (drop > 0.5) signedH = -drop`（drop = z - minZ，即由草图面落到实体底，可达几十 mm），standalone 时 signedH = height（默认 20）。
- 场景: 用户画中心线生成加强筋（厚6 → hw=3），筋由草图面落到实体底面（drop=50mm）。喺时间轴把 draft 改成 5°：hwTop = 3 − 50×tan(5°) = 3 − 4.37 < 0 → 钳到 0.05mm。筋身收成刀刃，UI 只示警「接近90°」但实际 draft 先 5°，用户以为加咗少少脱模角，其实成条筋废咗。
- 根因: 拔模收窄量应按筋【高度方向脱模行程】合理分配，但公式用咗成条 loft 嘅全长 |signedH|（落到底面时 = 实体高度）做底乘 tan(角)，令任何中等角度 × 高筋都超过半宽 hw → 钳 0.05。tan 发散守卫只挡 >85°，挡唔到「角细但 signedH 大」呢种真实情况。
- 修复: 拔模收窄量应封顶到 hw 嘅一个比例（例如 Math.min(hw*0.9, |signedH|*tan)），或对 drop-to-floor 嘅筋唔好用全 drop 做锥化高度（脱模角只对露出实体之上嗰段有意义）；并喺真正会钳到 0.05 时（而唔系只 >85°）出诚实警告。
- guarded: False

## #26 [MEDIUM] modify-solid/interaction — 按拉/移面无「拾取点距最近面」阈值守卫，上游改尺寸后会静默推错面
- 证据: cad.worker.ts:3151-3165 逐面算 ptTriDist2 取 bestF，但 `if (bestF && Math.abs(f.dist) > 1e-6)` 只检查有面 + 距离非零，从无 bestD 阈值；对比 fillet 路径喺 roundNearPoints:932-933 有 maxNearD2/diag 嘅 S143 漂移警告。pushpull 完全无对应守卫。
- 场景: 用户用按拉推某个面 +10mm。之后喺时间轴把上游某个 extrude 高度由 20 改去 5，原拾取面已经唔喺原位（f.near 变 stale）。重建时 pushpull 照样喺当前实体揾【最近】嗰个面（可能系完全唔同嘅面）推 10mm，无任何提示 → 用户见到几何错咗但唔知点解，仲以为参数化「跟得啱」。
- 根因: near-point 选面缺 best-distance sanity gate；fillet 子系统已有同类漂移警告，pushpull/move-face 漏咗。faceFp 持久面名喺无 fp 或 fp miss 时直接退回最近面，无诚实示警。
- 修复: 喺 bestF 确定后，若 sqrt(bestD) > max(2, 0.06×bbox对角线) 即视为漂移 → buildWarnings 诚实警告（镜 roundNearPoints 嘅 S143），让用户重新拾面而唔系静默推错面。
- guarded: True

## #27 [MEDIUM] modify-solid/logic — 草图分割（splitBodyBySketch）静默烘焙成网格 + 清空 undo/redo，无法撤销
- 证据: store.ts:9550 `features: [], bodyMesh: null, bodyTopZ: 0, undoStack: [], redoStack: [], suppressedIds: [], selectedFeature: null`；走 cad.splitBySketch（worker:3595 返纯 mesh，唔入特征树）。case 'splitsketch' (store.ts:7303) 直接调用。
- 场景: 非程序员用户撳「草图分割」，整个参数化时间轴被清空、两半变净网格组件，且 undoStack 被清 → 撳 Ctrl+Z 都救唔返。status 有一句提示但好易错过；同 axis-split（addSplit 已改参数化保历史）行为唔一致，用户预期一致。
- 根因: splitBySketch 仲系旧破坏性烘焙路径（同 memory 提到嘅旧 splitBody 同款），未似 addSplit 咁迁移去 'split' 参数化特征；而且连 undoStack 都清空，连最基本撤销都冇。
- 修复: 至少保留 undoStack（唔好清），令呢一步可撤销；理想做法系做一个 'splitsketch' 参数化特征类型（似 worker 'split' 用任意平面盒裁那样，用草图轮廓挤出做刀）入时间轴。
- guarded: False

## #28 [MEDIUM] modify-solid/numeric — 非等比缩放(GTransform)绕世界原点缩放，非居中实体会被拉走位置
- 证据: cad.worker.ts:3067-3069 `gp_GTrsf.SetValue(1,1,sx)…` + `BRepBuilderAPI_GTransform_2(shape.wrapped, g, true)`，gp_GTrsf 无平移分量 → 纯绕世界原点缩放；等比路径 3076 `shape.scale(sx)` 同样绕原点。注释 3065「绕世界原点缩放」。
- 场景: 用户对一个唔喺原点嘅实体（例如中心喺 (100,0,50) 嘅件）做 X×2 非等比缩放。除咗变阔，件嘅 X 位置亦由 100 拉到 200（位置 ×2）。非程序员预期「净系变形状唔郁位置」，结果件飞走咗，要再手动移返。
- 根因: GTransform/scale 都以世界原点为缩放中心，无以实体 bbox 中心为锚（transform-rotate 路径就有用 bbox 中心 3133-3134，缩放路径无对齐呢个直觉）。
- 修复: 缩放前后用 bbox 中心做锚：translate(-c) → GTransform/scale → translate(+c)，令位置不变只变尺寸（同旋转用 body 自身中心嘅直觉一致）。
- guarded: False

## #29 [MEDIUM] primitives/numeric — 圆环「外径」实际系中心线直径 — 做出嚟成个环大成 (外Ø+管Ø)，数值错且误导
- 证据: store.ts:9315 `f = { ...shape:'torus', a:(+p.d)/2 ... }` 同 store.ts:7009 `a: num('outer_diameter',30)/2`；worker cad.worker.ts:1538-1539 `const tr = Math.max(1e-3, f.a) ... const tube = drawCircle(tb).translate(tr,0)` — a(=外径/2) 被当 major/中心线半径 tr，管在 tr 外再 +tb。
- 场景: 用户喺圆环对话框填「外Ø80、管Ø24」（默认值），期望整个环最阔 80mm。实际 tr=40、tb=12 → 真实外缘 = 2*(tr+tb)=104mm；内孔 = 2*(tr−tb)=56mm。标签写「外Ø80」但量出嚟 104。
- 根因: 外径→半径换算后直接当『中心线半径』用，无减去管半径。正确应为 tr = 外径/2 − 管半径，或者标签改成『中心线Ø』。
- 修复: worker 圆环分支：`const tb = max(1e-3,f.b); const tr = Math.max(tb+1e-3, f.a - tb)`（把 f.a 当真·外半径）；或保持几何不变但把 UI/AI 标签同默认由『外Ø』改成『中心线Ø』并同步 create_torus 文案。两者择一，关键系标签同几何一致。
- guarded: False

## #30 [MEDIUM] patterns-boolean/numeric — 环形阵列（circPattern）mode='full' 时编辑「总角度」会偷偷改间距，但 UI 仍显示「完整 360°」
- 证据: store.ts:9192-9193 创建特征时 mode='full' 会强制 total=360，但 feature 同时存了 `totalAngle: total`；Timeline.tsx:86 无论 mode 系咩都把 `totalAngle` 字段显示为可编辑。worker cad.worker.ts:1059 `const step = (mode === 'full' || Math.abs(total) >= 359.9) ? total / n : total / (n - 1)` —— mode='full' 时用嘅系 `total / n`，而 total 系特征上存嘅 totalAngle（可被 Timeline 改细），唔系硬 360。
- 场景: 用户用对话框做「完整 360°」环形阵列（mode=full, totalAngle=360, count=5），然后喺时间轴把「总角度」由 360 改成 90。模式下拉仍写「完整 360°」，但 worker 用 step=90/5=18°，5 个副本只散布喺 0–72°（≈五分一圈），用户以为仍系绕足一圈。
- 根因: full 模式嘅角度本应永远等于 360，但特征同时持有可被独立编辑嘅 totalAngle 字段，且 worker 嘅 full 分支用 total（=totalAngle）而非常量 360 做分母；Timeline 又未喺 full 模式锁住/隐藏 totalAngle，造成「显示模式」同「实际几何」脱节。
- 修复: worker cpAngles 嘅 full 分支用常量 360（`step = mode==='full' ? 360/n : ...`），唔好读 total；或 Timeline 喺 mode==='full' 时禁用/隐藏 totalAngle 字段；二选一即可消除歧义。
- guarded: False

## #31 [MEDIUM] patterns-boolean/interaction — 时间轴改环形阵列「数量」可输入 1/小数，worker 静默钳成 identity（0 个副本）或四舍五入，无任何反馈
- 证据: Timeline.tsx:225-230 通用 NumField step=0.5 无 min，cpattern/circPattern 的 count 字段走呢条路径（meta.fields）。worker cad.worker.ts:3108 `Math.max(1, Math.round(f.count))`、3312 同样，count=1 → 下面 `for(i=1;i<n)` 唔执行 = identity（无副本）。对话框入口 store.ts:9173/9180 有 `Math.max(2,...)` 守 ≥2，但时间轴编辑路径无此守卫。
- 场景: 用户喺时间轴把已有环形阵列嘅「数量」由 6 改到 1（或 1.4），想睇下减少副本。结果阵列整组消失（变返单件）或四舍五入到 1，状态栏无提示『数量太少』，用户以为阵列坏咗。
- 根因: 对话框创建路径有 Math.max(2,...) 下限，但时间轴 editFeature 直接写原始 NumField 值，绕过该下限；worker 只做 Math.max(1,..)+round 静默处理，唔回报『数量 <2 无意义』。
- 修复: Timeline 对 count 类字段设 NumField min=2、step=1（整数）；或在 editFeature 对 cpattern/circPattern 的 count clamp 到 ≥2 并在 <2 时 set status 提示。
- guarded: False

## #32 [MEDIUM] assembly-joints/logic — 球关节三个旋转 DOF 共用同一组 aMin/aMax 限位
- 证据: kinematics.ts:38-40 clampA 单一用 j.aMin/j.aMax；40 行 `const ang=clampA(j.angle), ang2=clampA(j.angle2??0), ang3=clampA(j.angle3??0)` —— 绕Z/绕Y/绕X 三个独立 DOF 全部夹同一个 [aMin,aMax]。JointsPanel.tsx:193-195 三条 ball 滑杆 min/max 亦全用 j.aMin/j.aMax，且 ball 根本无限位输入框可分轴设定。
- 场景: 数据层为球关节设 aMin/aMax（例如想限制绕Z ±30°），结果绕Y、绕X 同样被夹到 ±30°，无法分轴限位；用户以为限了一个轴，其实三轴齐限。
- 根因: Joint 模型只有一对 a-limit 字段，但 ball 有 3 个角自由度；clamp 未为 angle2/angle3 提供独立限位。
- 修复: 为 ball 增加 a2Min/a2Max/a3Min/a3Max（或忽略 angle2/angle3 限位只夹 angle），clampA 按 DOF 取对应限位；UI 补分轴限位框。或诚实标注『球关节限位仅作用绕Z』。
- guarded: False

## #33 [MEDIUM] measure-inspect/logic — 剖切预览（非实心模式）的 Y/Z 轴切错平面——同实心封盖不一致
- 证据: Viewport.tsx:2249-2253 clip = Plane.setComponents(axis==='X'?[-1,0,0]:axis==='Y'?[0,-1,0]:[0,0,-1], section.offset)，该 Plane 经 material.clippingPlanes 在 three【世界系】裁切；但实体 mesh 渲染在 <group rotation={[-Math.PI/2,0,0]}>（Viewport.tsx:520，CAD Z-up→three Y-up，映射 CAD(x,y,z)→three(x,z,-y)）。而实心封盖走 worker splitBuild（cad.worker.ts:3571-3586）按【CAD 系】轴切：axis 'Y' 切 CAD-Y、'Z' 切 CAD-Z。两者只有 X 一致。
- 场景: 开「剖切分析」面板（默认非实心 clip-plane 模式），轴选 Y 或 Z，拖位置滑杆。看到的切面方向与勾选「实心封盖」后的切面方向不同（Y 实际切到 CAD-Z、Z 实际切到 CAD-Y 且方向反）。
- 根因: clip-plane 预览用 three 世界轴常量，没把 CAD→three 的 -90°X 旋转算进去；而 splitBuild/CutFaceOverlay 都在 CAD 系。axis 标签 Y/Z 在两种模式下指向不同物理平面。
- 修复: 把 clip 法向也映射到 three 世界系：axis 'Y'(CAD-Y) 应是 three 法向 [0,0,+1]、'Z'(CAD-Z) 应是 three [0,-1,0]，并按 CAD→three 重写 offset 常量（注意 CAD-Y→three -Z 的符号）。或统一让 clip-plane 预览也复用 splitBuild 的 CAD 轴定义。
- guarded: False

## #34 [MEDIUM] measure-inspect/interaction — 剖切位置滑杆硬编码 ±150mm——大件/偏离原点的件切不到
- 证据: Viewport.tsx:4233 <input type="range" min={-150} max={150} value={section.offset}…>。setSection 也无按实体包围盒夹取/重置 offset（store.ts:6759-6772）。computeSectionCut 内部虽有按范围夹 off（store.ts:9706-9713），但那是截面【属性】计算用的局部变量，不改 section.offset，也不影响 clip/capped 预览。
- 场景: 建一个 400mm 长的件，或一个质心在 x≈500 的件，开剖切拖滑杆。滑杆到头(±150)仍在件外，剖切平面永远穿不过实体，用户看到「剖切没反应」。
- 根因: 滑杆范围写死常量，未跟随活动实体的实际坐标范围（包围盒）。
- 修复: 用 bodyMesh 包围盒在所选轴上的 [min,max] 动态设 range min/max（留一点余量），切换轴时把 offset 夹/初始化到该范围中点。
- guarded: False

## #35 [MEDIUM] params-expr/numeric — 一元负号配括号时 -(2)^2 = 4，与 -2^2 = -4 自相矛盾且数学错误
- 证据: src/store.ts:2126 的 `)` 处理：闭括号后 `if (ops.length && isExprFunc(ops[ops.length - 1])) out.push(ops.pop())` 会把仍留喺栈顶嘅 `neg`（一元负号在 store.ts:2121 被当函数压栈）当成『作用于刚闭合括号组』立即弹出。实测 evalExpr('-(2)^2')=>4，但 evalExpr('-2^2')=>-4。数学上 -(2)^2 应等于 -(2^2)=-4（一元负号优先级低于 ^，正如 store.ts:2124 注释专门修过的 -2^2 情形）。
- 场景: 用户写参数公式『-(基准)^2』或『-(a+b)^2』之类带括号嘅负号幂运算，得到的符号同唔加括号时相反，偶次幂结果错号，无任何提示。
- 根因: `neg` 被实现为压入 ops 栈的『函数』，闭括号的『弹出尾随函数』逻辑无法区分『真正套住括号的函数（如 sin(...)）』同『括号之前那个独立的一元负号』，导致 neg 被提前应用到括号组上，绕过了 store.ts:2124 为 ^ 特意保留的低优先级处理。
- 修复: 闭括号弹尾随函数时排除 neg：`if (ops.length && isExprFunc(ops[ops.length-1]) && ops[ops.length-1] !== 'neg') out.push(ops.pop())`；让 neg 一律走正常运算符优先级路径，与 -2^2 行为一致。
- guarded: False

## #36 [MEDIUM] params-expr/numeric — 公式/参数绑定到尺寸时 Math.abs(v)||c.value：结果为 0 或负数被静默改写
- 证据: src/store.ts:131 withParamVals：`if (c.expr) { const v = evalExpr(...); return v != null ? { ...c, value: Math.abs(v) || c.value } : c }`；同样 pattern 在 bindSkDimParam(store.ts:3740) `value: Math.abs(p.value) || c.value` 与 bindSkDimExpr(store.ts:3752) `value: Math.abs(v) || c.value`。`Math.abs(0)` 为 0（falsy）→ `0 || c.value` 退回旧值；负数被 abs 翻正。
- 场景: ① 用户把某尺寸（如偏移、间距）的公式算出 0，期望尺寸归零，结果系统静默保留旧值，模型唔郁、无提示。② 角度尺寸（store.ts:3952 type:'angle'）绑公式：0° 被退回旧角度；-30°（带方向）被翻成 +30°，旋转方向错。abs 对线性距离尚可，但对角度/带符号量错误。
- 根因: 用 `|| c.value` 做 null 兜底，但 0 在 JS 是 falsy，把『合法的 0 结果』同『求值失败』混为一谈；且对所有 dim 类型一律 Math.abs，未区分 angle/带符号尺寸。
- 修复: 改为显式判空：`const v = evalExpr(...); if (v == null || !isFinite(v)) return c; return { ...c, value: c.type === 'angle' ? v : Math.abs(v) }`（角度保留符号；线性量才取绝对值；0 合法通过）。三处统一。
- guarded: False

## #37 [MEDIUM] params-expr/logic — 设计表/批量导出可对『公式驱动参数』扫值，setParam 永久清掉其表达式且仅还原数值
- 证据: src/store.ts:10392 batchExportDesignTable 取 orig 时不检查 `!p.expr`；ParamsPanel.tsx:67 下拉列出全部参数（含 expr 驱动）。循环内 store.ts:10402 `await setParam(paramName, vals[i])`，而 setParam(store.ts:10167) 写死 `expr: undefined` 清除公式。结束后 store.ts:10406 `setParam(paramName, origVal)` 又一次 `expr: undefined`，只还原 value，公式无法恢复。
- 场景: 用户对一个由公式定义（如 半径 = 直径/2）的参数做设计表扫值，导出后该参数的公式被静默删除，从此变成固定数值，之前改直径不再联动半径，用户毫不知情。
- 根因: setParam 设计为『手动覆盖即清公式』，但 batchExport 借用 setParam 做临时扫值/还原，没有保存并恢复原 expr；入口也未拦截 expr 驱动参数。
- 修复: batchExportDesignTable 开头若 `orig.expr` 则拒绝并提示『公式驱动参数请改扫其上游驱动参数』；或保存 origExpr，结束后用 setParamExpr(paramName, origExpr) 还原。
- guarded: False

## #38 [MEDIUM] params-expr/numeric — 除零/取模零静默返回 0，令公式驱动尺寸悄悄塌缩无提示
- 证据: src/store.ts:2135 二元运算 `... : b === 0 ? 0 : a / b`，以及 `%`：`b === 0 ? 0 : a % b`；EXPR_FUNCS2.mod(store.ts:2102) 同样 `b===0?0:a%b`。实测 evalExpr('5/0')=>0、evalExpr('5%0')=>0。返回 0 非 null，setParamExpr 校验通过当成功。
- 场景: 用户公式里某分母参数恰好为 0（如 间距 = 总长/段数，段数误设 0），尺寸被静默算成 0，配合上一条 abs||旧值，要么塌成 0 要么退回旧值，全程无『除零』警告。
- 根因: 为避免 Infinity/NaN 而把除零硬塞成 0，掩盖了用户输入错误，违背项目『缺参/语法错=诚实唔郁并提示』的既定政策。
- 修复: 除零/取模零应 return null（令上层报『表达式无法计算：除以零』），而非静默 0；与 sqrt(-4)=>null 的诚实处理保持一致。
- guarded: False

## #39 [MEDIUM] io-persist/honesty — 打开任意 JSON 都「成功」打开 — 无 app/version 校验，静默清空当前模型
- 证据: store.ts:11065 openProject 只 catch JSON.parse 错误；store.ts:11082 applyProjectData 完全冇读 data.app / data.version（saveProject @11060 明明写咗 {app:'webcad',version:2}）。任何合法 JSON（例如另一个 app 嘅档、package.json、随手拣错档）都会行落 set(...)，缺失字段全部走默认值（components=[] joints=[] features=[]），最后报「已打开项目（0 组件 · 0 关节 · 0 特征）」。
- 场景: 用户喺文件对话框拣错档（拣咗一个唔系 webcad 嘅 .json），当前辛苦做嘅模型被静默清空，状态栏却显示「已打开项目」，无任何错误提示。
- 根因: applyProjectData 把任意对象当成项目数据反序列化，无 magic/格式校验；openProject 只防 JSON 语法错，唔防「合法但唔系 webcad」。
- 修复: applyProjectData 开头校验：Array.isArray(data) || data.app==='webcad' || 有 features/components 任一数组字段，否则 set({status:'呢个唔似 webcad 项目档'}) 并 return，唔好覆盖现有 state。
- guarded: False

## #40 [MEDIUM] io-persist/interaction — triggerDownload 同步 revokeObjectURL，大文件（STL/GLB/STEP）下载可能被取消/截断
- 证据: store.ts:13056-13063 triggerDownload：`a.click(); URL.revokeObjectURL(url)` 紧接同步执行。所有二进制导出（exportStl @10379、exportGLB @10942、装配 STL @10657、STEP、设计表 zip @10408）都行呢条。
- 场景: 用户导出一个较大的装配 STL / GLB。部分浏览器（尤其 Firefox）喺 click 触发的下载真正读取 blob 之前，URL 已被 revoke → 下载失败或得到 0 字节文件，但状态栏照样报「已导出…」。
- 根因: Object URL 喺浏览器异步读取 blob 之前就被释放。
- 修复: 延迟 revoke：`setTimeout(()=>URL.revokeObjectURL(url), 4000)`，或把 <a> 加入 document、click、之后再 remove + revoke。
- guarded: False

## #41 [MEDIUM] io-persist/interaction — openProject / loadShareHash 打开档案前不警告未保存改动，直接覆盖当前模型
- 证据: store.ts:11065 openProject、11148 loadShareHash 都直接 await applyProjectData(...)，applyProjectData @11089 起一次 set(...) 全量覆盖 components/features/joints…，且 @11122 清 undoStack（store.ts:11122 注释自承「打开档案要清撤销栈」）。覆盖后无法 Ctrl+Z 救回。
- 场景: 用户做咗未保存嘅工作，Ctrl+O 想打开另一个档（或撳分享链接），当前模型即刻被覆盖兼且撤销栈清空 → 工作彻底丢失，无任何确认。
- 根因: 无 dirty 状态/无确认对话；open 直接替换并清 undo。
- 修复: openProject/loadShareHash 前若 features.length||components.length 非空，用 appPrompt/confirm 提示「会替换当前未保存模型，继续?」；或将打开做成可撤销（覆盖前压一个 docSnap 入 undoStack 而唔系清空）。
- guarded: False

## #42 [MEDIUM] mold-flow/honesty — 机台吨位超过最大档(3200t)时静默返回3200，无「超出量程/机台不足」提示
- 证据: src/io/moldExport.ts:23-30 machineTonnage()：`let rec = MACHINE_TONNES[len-1]; for(const m of MACHINE_TONNES){ if(m>=withMargin){rec=m;break} } return {recommendTonne:rec}`。当 withMargin > 3200（即需求 > ~2783 公吨力）循环全程冇命中，rec 保持 3200。实测 machineTonnage(50000)→{requiredTonne:5098, recommendTonne:3200}。store.ts:12761 PDF 直接印「→ 建议机台 ≈ 3200 吨（标准档）」毫无超量警告。
- 场景: 用户对大件/厚件用求解器模式得出锁模力如 50000 kN，导出 PDF。报告写「建议机台 ≈ 3200 吨」，但实际需要 ≈5860 公吨力 —— 推荐嘅机台夹唔住件，会飞边/批锋，用户被误导以为 3200t 足够。
- 根因: 查表只向上取档，对超出最大档无边界处理，亦无返回标志俾调用方提示「超量程」。
- 修复: 若 withMargin > MACHINE_TONNES[last]，返回一个 oversize:true 标志（或 recommendTonne=null），store.ts/PDF 据此印「需求 X 公吨力 超过标准最大机台 3200t — 需大型/特种机或考虑分模减投影面积」。
- guarded: False

## #43 [MEDIUM] mold-flow/visual — 充填动画 GIF 最后一帧将「困气/最后充填点」画成白色前沿，永不显示橙色 —— 导出嘅唯一卖点被隐藏
- 证据: store.ts:12667 `frontBand = tEnd/NF*1.6`（≈0.067·tEnd）；12687-12691 着色顺序：`if (f<=tCut){ if(f>tCut-frontBand) col=FRONT(白); else if(weld) WELD; else if(air) AIR; ...}`。前沿白色判定行先于 air/weld。最后一帧 fi=23→tCut=tEnd，全局 air trap 体素 f≈tEnd 必落入 (tEnd−frontBand, tEnd] → 画成白色。markAirTraps 定义令全局 τ 最大点必为 air trap（moldflow.ts:404 + 注释「全局 τmax 必然系困气点」），所以最关键嗰个困气点恒被白色盖住。
- 场景: 用户运行模流后撳「🎞 充填动画 GIF」想睇困气/最后充填位（橙）。动画播到尾，最后充填嘅死角全部系白色前沿，橙色困气标记喺最重要嗰几格永远唔出现 —— 用户以为「冇困气」。
- 根因: 前沿高亮 (frontBand) 优先级高于 weld/air，而 air trap 按定义就喺充填最末（落入最后一帧 frontBand），两者必然冲突。
- 修复: 调整优先级：先 weld/air 后前沿；或最后一帧（fi===NF-1）禁用 frontBand（tCut 时不画白前沿，直接出 weld/air/turbo），保证困气橙色喺终帧可见。
- guarded: False

## #44 [MEDIUM] mold-flow/honesty — 趋势(非求解器)模式多浇口：充填不平衡度恒显示 0%，谎报「完美平衡」
- 证据: moldflow.ts:686 `let fillImbalance = 0`；只喺 solver 分支(716)计算 `fillImbalance=(fMax-fMin)/fMax`；else 趋势分支(721-727)只 push gateStats 但从不计 fillImbalance → 恒 0。UI Viewport.tsx:3291 多浇口时无条件显示「充填不平衡度 {(fillImbalance*100).toFixed(0)}%」，趋势模式即印「0%」。store.ts:12604-12605 文字报告同样印「充填不平衡度 0%」。
- 场景: 用户喺默认(趋势)模式放 2-3 个唔同位置浇口运行（非程序员唔会特登开求解器）。结果面板写「充填不平衡度 0%」，用户以为各浇口完美同步填满，唔会去开流道平衡 —— 实际 fillImbalance 根本未计算。
- 根因: fillImbalance 只喺求解器路径计算，趋势路径漏算但 UI/报告无条件显示数值，0 被当成「平衡良好」。
- 修复: 趋势分支用 dom 责任域体积比或各浇口域内 tau 末值估算 fillImbalance；或 UI 喺 !solverUsed 时改显「(趋势模式不评估平衡，需开压力求解器)」而非 0%。
- guarded: False

## #45 [MEDIUM] mold-flow/logic — 焊接线条件A：唔同浇口前沿相遇沿整个交界面全标记，多浇口大件焊接线体素数被夸大
- 证据: moldflow.ts:331-346 checkPairA：凡 label 唔同 且 |Δτ|≤cost 即两格都标 weld。Dijkstra 三角不等式下唔同 label 邻格 Δτ 几乎必 ≤cost（注释 line 312-314 自认），故两浇口责任域【整条】接壤面都会标 weld。报告 line 12628 直接印『焊接线体素：N 个』，N 随分辨率/件大小线性膨胀。
- 场景: 用户两浇口注一块大平板，报告显示「焊接线体素：几百个」，远多过实际一条焊缝应有嘅体素，令非程序员以为零件焊接线问题严重。
- 根因: 条件A把整个责任域分界面当焊接线（几何上系一条线但体素化后系一整片接壤面），无『仅取脊线』细化。
- 修复: 条件A亦改为只标该接壤面上的局部脊（两侧 τ 均较低）或细化为分界面骨架，避免整面标记；或报告改报『焊接线长度(mm)≈体素数×h』而非体素计数。
- guarded: False

## #46 [MEDIUM] surface-gears/numeric — 冠齿轮齿截面用固定周向半宽 p/4 沿径向拉伸,内缘周距细令相邻齿重叠、外缘缝隙过大
- 证据: cad.worker.ts:3019-3025。rh=p/4(p=πm 节圆周距),沿径向从 r0=rp-fw/2 拉到 rp+fw/2。但周向齿距=2πR/z 随 R 变:内缘小于节圆周距,外缘大。齿半宽固定 p/4 放内缘令相邻齿重叠(周距<2·p/4),外缘缝隙过大;faceW 越大越明显。
- 场景: 建冠齿轮 m2 z20 较大 faceW,内缘齿根相邻齿互相穿模(布尔后视觉糊成一圈)
- 根因: 径向拉伸直齿用固定周向半宽,无随半径收窄(冠齿轮齿应内窄外宽)
- 修复: 齿半宽按 R 线性缩放:R 处半宽=(p/4)R/rp,或限 faceW 上限并警告
- guarded: False

## #47 [MEDIUM] surface-gears/interaction — NURBS 极点编辑:读路径 getControlNet 用 NurbsConvert,单面壳写路径用 SurfaceToBSplineSurface — 极点网索引可不一致→拖球对唔上极点
- 证据: cad.worker.ts:3780 getControlNet 行 _nurbsNetOfFace(NurbsConvert-FIRST)。写路径 editpoles 单面壳分支(faces.length===1&&fi===0,line 2360-2377)行 _oc.GeomConvert.SurfaceToBSplineSurface(surfH) — 两条不同转换器。NurbsConvert 同 SurfaceToBSplineSurface 对同一面可产生不同 nu×nv 同极点排布(节点插入/重参数化差异)。注释 line 254 自称「读写都行这支确保一致」,单面壳写分支违反。结果 UI nu×nv 显示极点但 deltas[rr*nv+c] 落到不同网格→拖某球实动别个极点/越界 silent skip。
- 场景: 对单面零厚放样曲面开极点编辑,拖一个极点球,实体变形位置同拖嘅球对唔上
- 根因: 单面壳写用 SurfaceToBSplineSurface,读用 NurbsConvert,两者极点网未保证一致
- 修复: 单面壳写分支改用 _nurbsNetOfFace 同读路径统一来源
- guarded: False

## #48 [MEDIUM] view-render-timeline/visual — 正交相机模式下「标准视图」(前/上/右/等轴) 唔会重新取景 — 模型可能飞出画面或细到睇唔到
- 证据: src/components/SketchLayer.tsx:1161-1219 ViewRig 只设 camera.position 同 controls.target，从来无设 camera.zoom；对比 FitView 有专门正交分支 src/components/SketchLayer.tsx:1152-1153 `if (oc.isOrthographicCamera) { ... oc.zoom = fr/(r*1.15); oc.updateProjectionMatrix() }`。正交相机喺 Viewport.tsx:2289 `<OrthographicCamera makeDefault ... zoom={4} />` 用固定 zoom，frustum 系画布像素大小，唔靠相机距离取景。
- 场景: 撳工具栏 📐 切到正交模式 → 撳 ViewCube 或标准视图按钮(前/上/右/等轴)。相机位置变咗,但 zoom 仍系上次嘅值,模型唔会按新视图大小重新框住 — 大模型超出画面、细模型缩成一点,睇落好似「视图按钮坏咗」。
- 根因: ViewRig 系为透视相机写(靠 camera.position 距离 d=r*3.2 取景),无移植 FitView 嗰段正交 zoom 计算。正交相机改距离对视觉大小毫无影响,要改 camera.zoom 先得。
- 修复: 喺 ViewRig 计完 cx/cy/cz/r 之后,加同 FitView 一样嘅正交分支:`const oc = camera as any; if (oc.isOrthographicCamera) { const fr = Math.min(oc.right-oc.left, oc.top-oc.bottom)/2; if (fr>0 && r>0) { oc.zoom = fr/(r*1.15); oc.updateProjectionMatrix() } }` 再 controls.update()。
- guarded: False

## #49 [MEDIUM] view-render-timeline/visual — 装配体撳标准视图取景错位:ViewRig 忽略组件摆放位置(c.pos)同隐藏状态(c.hidden)
- 证据: src/components/SketchLayer.tsx:1173 `const meshes = [...components.map((c)=>c.mesh), ...(bodyMesh?[bodyMesh]:[])]` 直接用各组件嘅 mesh 局部顶点,无加 c.pos 偏移,亦无 filter(!c.hidden)。对比 FitView src/components/SketchLayer.tsx:1124 `...components.filter((c)=>!c.hidden).map((c)=>({mesh:c.mesh, off:c.pos}))` 同 1133 `tx=v[i]+off[0]` 正确处理咗偏移同隐藏。
- 场景: 做装配:多个组件被摆喺远离原点嘅位置(c.pos≠0)。撳标准视图(前/上/右/等轴)或经 viewNonce 取景。相机会以组件局部坐标(全部叠喺原点附近)嘅包围盒去框,中心同半径都错 → 镜头对住空位/错位置,模型偏出画面。隐藏咗嘅组件亦照样参与计算,令包围盒更大、取景更松。
- 根因: ViewRig 嘅包围盒循环只读 c.mesh.vertices,无把组件世界位移 c.pos 叠上去,亦无排除 hidden 组件;FitView 啱但 ViewRig 漏。
- 修复: ViewRig 改用同 FitView 一致嘅 parts 结构:`components.filter(c=>!c.hidden).map(c=>({mesh:c.mesh, off:c.pos}))`,顶点转换后加 off[0..2];body off=[0,0,0]。
- guarded: False

## #50 [LOW] sketch-draw/logic — 槽(slot) 工具缺退化长度守卫 — 两端重合时生成零长度退化槽，无提示
- 证据: src/store.ts:4608-4622 slot 提交：`const L = Math.hypot(dx,dy) || 1`（L=0 时 fallback 1），随后 `ux=dx/L, uy=dy/L` 在 dx=dy=0 时为 0/1=0，V1..V4 全部退化到 c0 附近。圆/三点矩形/圆弧槽/arcc 都有 `< 0.5`/`< 0.2`/`< 0.05` 守卫（如圆 src/store.ts:4567），唯独直线槽没有。
- 场景: 用户开槽工具，第一击后误在同一点（或被吸附拉回起点 0.x mm 内）第二击。生成一个长度≈0 的退化槽（两个重叠半圆），拉伸时会失败或产生垃圾几何，但提交时报『槽已画好』。
- 根因: slot 提交分支未对两中心距 L 设最小阈值；与同子系统其它两点工具的退化守卫不一致。
- 修复: 在 4609 加 `if (Math.hypot(c1[0]-c0[0], c1[1]-c0[1]) < 0.5) return { status: '槽太短（两端中心几乎重合）— 拉开啲，或打数字定长' }`。
- guarded: False

## #51 [LOW] sketch-draw/interaction — 打字下一段折线长度用 prev 方向但 prev 可能是吸附后的旧预览 → Tab 无效字段切换误导
- 证据: src/store.ts:4889-4894 polyline 打字：方向取自 `prev=s.sketchPreview`，长度沿该方向缩放。但 4870 `Tab` 对非 rectangle 工具 `nf = 0`（永远回字段 0），而 typedReadout(src/store.ts:266-270) 对 polyline 落到通用 `↘ [_] mm` 只有一个字段 —— 用户按 Tab 期望换 X/Y 或角度，实际无任何效果，且方向被 prev 隐式锁死无法打字指定。
- 场景: 用户画折线时想精确指定下一点（例如『沿 30° 走 20mm』）。打字只能定长度，方向完全靠落点前最后一次鼠标 prev 方向；按 Tab 想切角度输入完全无反应，无提示说明只能定长。用户以为可输入角度但做唔到。
- 根因: 折线打字仅支持单值（长度），方向隐式取 preview；UI（Tab/readout）未明确限制，造成『以为可定方向』的落差。
- 修复: readout 明确写『（仅定段长，方向跟光标）』；或支持第二字段输入角度（buf[1] 作角度，重算 np 方向）。
- guarded: False

## #52 [LOW] sketch-constraints/interaction — hitTest 点优先半径用 0.6×tol，弧段/曲线中点附近的边几乎选唔到（被远处顶点抢）
- 证据: freesolve.ts:349 `bestD=(tol*0.6)**2` 作为 tier-1 点(含原点)半径。原点 ⊕ 永远参与 cand(:352)。当用户想点近原点的一条边/圆周，只要落在 0.6tol 内就被原点/顶点抢成 point；并且 tier-1 一旦 best 命中即 `if(best) return best`(:367)，根本唔进 tier-2/3 边判定。
- 场景: 草图原点附近（很多草图第一笔从原点出）想点选一条经过原点附近的边或圆周做约束/标长度，撳落去变成选中⊕原点，反复点唔到边。非程序员会以为「呢条边拣唔到」。
- 根因: 点 tier 与边 tier 互斥早退（命中点即 return），且原点作为永久候选点，半径虽收窄到 0.6tol 仍在密集/近原点场景抢点。
- 修复: tier-1 命中后若距离明显大于一个更紧的点阈值(如 0.35tol)再回落比较 tier-2/3 的最近边距离，取真正最近者；或原点只在 dimension/特定工具下作候选。
- guarded: True

## #53 [LOW] sketch-constraints/logic — equal 约束 buildPrims 内死代码分支，弧段+直边组合实际无任何约束且无诚实提示（store 层挡了，但代码不一致易回归）
- 证据: freesolve.ts:613 `else if (sgA || sgB) break` 永不可达——上一个 `else if (sgA||sgB)`(:605) 已捕获同条件，:613 是死分支。弧段+直边走到 :605 内层后若 circ 不是 circle(即另一边是直边)则什么都不 push 静默无约束(:611 注释承认)。真正的诚实拒绝只在 store.ts:3896-3901 addSkCon('equal') 里做。
- 场景: 若约束经 buildPrims 直接路径(还原档/批量推断 applyDrawInference)产生弧段+直边 equal，buildPrims 静默丢弃，UI 显示约束徽章但几何无变化、无错 — 「以为做到其实做唔到」。
- 根因: 诚实拒绝逻辑只在一个入口(addSkCon)实现，buildPrims 内是静默 no-op + 一段不可达死代码。
- 修复: 删除 :613 死分支；在 buildPrims 对无法表达的组合不应静默——至少 conApplicable/refValid 层统一拒绝，确保所有入口一致。
- guarded: True

## #54 [LOW] sketch-constraints/logic — probeFreeShapes 半径探针对 verts-poly 弧段不覆盖，弧段半径自由度会被错判为「完全约束」
- 证据: freesolve.ts:978-985 probesOf 只对 circle(cid) 与三点弧(cid) 加 'rad' 探针；isVertsPoly 分支(:984)只逐点 pt 探针，没有对每个弧段 said 加 arc_radius 探针。故一个圆角矩形其弧段半径仍自由时，pin 所有 corner 点 dof 不变，shape 不会被标欠定。
- 场景: 用户画含弧段的槽/圆角矩形，弧半径未约束(仍自由)，DOF 探针不把它标成欠定(蓝/未定义高亮)，用户误以为弧半径已定，拉伸后才发现可变。对标 Fusion under-defined 高亮缺失。
- 根因: 半径探针只枚举整圆/三点弧，遗漏 verts-poly 弧段的 said 弧半径自由度。
- 修复: probesOf 对 isVertsPoly 的每个 |bulge|>eps 段额外加 {kind:'rad', id: said(i,j)}，探针分支按 arc_radius 处理。
- guarded: False

## #55 [LOW] sketch-modify/numeric — 拉伸退化守卫对多边形面积重复除 2,阈值实际放大一倍(off-by-2x)
- 证据: store.ts:2185 `function polyArea2(pts){...return a/2}` 本身已经除 2 返回真面积。但 store.ts:7685 degOf 里 `Math.abs(polyArea2(sh.pts)) / 2 < 0.04` 又除多次 2 → 实际等价于 `真面积 < 0.08`。其它调用点(2533/2537/11408/13202)都系 `Math.abs(polyArea2(...))` 无额外 /2,即呢度唔一致。
- 场景: 画一个真面积介乎 0.04~0.08 mm² 嘅极细 poly(如 0.06mm²),揿拉伸。本意阈值系 0.04mm² 以下先当退化,但因双除 2,呢个 0.06mm² 轮廓被误判退化、被静静过滤、拉伸『失败』报全部退化,用户唔知点解。
- 根因: 作者误以为 polyArea2 返回嘅系两倍面积(shoelace 未除 2),实情函数内已 /2,故再 /2 造成阈值翻倍 + 同其它面积比较点单位唔一致。
- 修复: 7685 改为 `Math.abs(polyArea2(sh.pts)) < 0.04`(去掉 /2),同其它面积用法统一。
- guarded: False

## #56 [LOW] sketch-modify/honesty — 「全部角一次过」倒角(chamferSketchCorners)对超长 d 静静夹到 0.45 边长但状态报原始 C 值,误导用户
- 证据: store.ts:2705 `const t = Math.min(d, l1*0.45, l2*0.45)` 夹回缩量;但 2713 状态 `已对草图 ${cut} 个角倒 C${d} 倒角` 报嘅系用户要求嘅 d,唔系实际嘅 t。对比单角版 skCornerAt 2832-2834 会诚实显示收窄后嘅值。
- 场景: 一个 10mm 边长嘅方,用户『全部角一次过』打 C8。实际每角只回缩 min(8, 4.5)=4.5mm,但状态条话『已倒 C8』。用户以为做咗 C8,实情得 C4.5,量度先发现唔对。
- 根因: 批量版状态字串硬拼用户输入 d,无反映 per-corner clamp 后嘅真实 t。
- 修复: 累计/记录实际最小 t,状态显示『已倒 C{d}(部分角因邻边短收窄至 C{minT})』,或逐角报。
- guarded: False

## #57 [LOW] extrude-revolve/logic — 扭转与拔模同时设置时拔模被静默忽略
- 证据: cad.worker.ts:1271 拔模分支条件 `Math.abs(draftDeg) > 0.01 && !f.twist && plane === 'XY'`；当 twist 非零，跳去 else（1286）`f.twist ? sk.extrude(eh,{twistAngle}) : ...`，拔模完全唔生效，亦无 buildWarnings 提示。
- 场景: 拉伸对话框同时填扭转(如 20°)同拔模(如 3°)，撳确定。结果只有扭转，拔模被吞，无任何提示。
- 根因: 拔模实现走 loft 路径与 twist 互斥，且未对「两者同设」给出告警。
- 修复: 至少 push 一条 buildWarnings：「扭转与拔模不可同时使用，已只应用扭转」；或实现 twist+draft 组合。
- guarded: False

## #58 [LOW] extrude-revolve/interaction — 拉伸距离输入 0 或极小值被静默重置为 40mm
- 证据: store.ts:3408 `setExtrudeHeight: (h) => set({ extrudeHeight: Number.isFinite(h) && Math.abs(h) > 1e-6 ? h : 40 })`。任何 |h|≤1e-6（含 0、清空成 NaN/0）即跳回 40。
- 场景: 用户喺距离框清空准备输入新值，或手误输入 0，框会突然跳到 40；若紧接确定，会拉出 40mm 而非用户预期。
- 根因: 守卫把「非法/0」一律替换成硬编码 40，而非保留旧值或显示校验提示。
- 修复: 无效输入时保留上一有效值（`h && Math.abs(h)>1e-6 ? h : s.extrudeHeight`）或显示红框校验，避免静默跳 40。
- guarded: True

## #59 [LOW] extrude-revolve/honesty — addExtrude 成功信息：切割操作丢失「对称/扭转/拔模/贯通」备注（运算符优先级）
- 证据: store.ts:7807-7808 `const okMsg = operation === 'cut' ? '已切割…' : (baseZ > 0 ? '…' : '已拉伸出实体…') + extra`。`+ extra` 只绑去 false 分支，cut 分支永远唔含 extra（对称/扭转/拔模/贯通）标注。
- 场景: 做一个对称或贯通嘅切割拉伸，状态栏只显示「已切割（布尔减）」，唔会显示「（对称）」「（贯通）」，用户无法从反馈确认设置生效。
- 根因: 三元表达式与字符串拼接缺括号，extra 只附加到非 cut 分支。
- 修复: 加括号：`const okMsg = (operation === 'cut' ? '已切割（布尔减）— 真实 OCCT B-rep' : (baseZ > 0 ? '…' : '已拉伸出实体 — 真实 OCCT B-rep')) + extra`。
- guarded: False

## #60 [LOW] extrude-revolve/logic — 旋转角度输入 0/空被静默当 360° 整圈
- 证据: worker cad.worker.ts:1311-1313 `if (ang>0 && ang<360) rcfg.angle=ang; else if (!(ang>0)) buildWarnings.push('角度必须>0…已用整圈360°')`；store.ts:9366 透传 `+p.angle`（清空框 → Number('')=0 绕过 UI min=1）。
- 场景: 用户喺旋转角度框清空或输入 0（min=1 只限 spinner，唔限键入），撳确定 → 静默做成整圈 360°，只喺 build warnings（多数用户睇唔到）提示。
- 根因: 0/负角无前置阻挡，退化处理直接替换为 360 而非让用户改正。
- 修复: commitFeatDlg revolve 分支前置校验：`if(!(+p.angle>0)){set({status:'旋转角度要>0'});return}`，唔好静默替 360。
- guarded: True

## #61 [LOW] loft-sweep-coil/interaction — Timeline 螺旋特征编辑面板缺 r2（顶半径）栏 —— 锥形弹簧建成后无法调锥度
- 证据: Timeline.tsx:54 coil 定义 `fields:[{pitch},{height},{radius},{wireR}]`，无 r2。即使透过数据层造出带 r2 嘅锥簧，时间轴双击编辑只见到四个栏，改任何一个都唔会暴露/容许改 r2（虽然 editFeature patch 会保留 r2）。
- 场景: 已有一个锥形弹簧，用户想喺时间轴微调顶半径，但面板根本无呢个栏，要重做。
- 根因: coil 字段表同 Feature 结构唔同步，遗漏 optional r2。
- 修复: Timeline.tsx:54 coil.fields 追加 `{ key:'r2', label:'顶半径', unit:'mm' }`（仅当 feature.r2 存在时显示，或恒显默认=radius）。
- guarded: False

## #62 [LOW] loft-sweep-coil/honesty — 实体放样唔检查各截面顶点数是否一致 —— 圆(33点)对矩形(4点)会扭曲，无警告（曲面放样有警告）
- 证据: cad.worker.ts:1693-1695 实体 loftWith 无顶点数检查；surfloft sheet 路径(:2506) 有 `if (new Set(secs.map(s=>s.pts.length)).size>1) buildWarnings.push('各截面顶点数不一致 — ThruSections 线性配对，形状可能扭曲')`。LoftPreview(SketchLayer.tsx:912-915) 连接线用 a[j]/b[j] 同序号配对，顶点数唔同 → 连接线指向乱跳，预览同实物都扭。
- 场景: 用户放样一个圆截面到一个方截面（好常见过渡件），结果实体喺角位扭转，但无任何提示话佢可能要点数对齐。
- 根因: 顶点数不一致警告只加咗喺曲面放样路径，实体放样路径漏咗同款诚实提示。
- 修复: 实体放样路径加同款顶点数一致性警告；LoftPreview 连接线可改用各 loop 等参比例取点而非同序号。
- guarded: False

## #63 [LOW] loft-sweep-coil/interaction — 扫掠导轨同 3D 爬升冲突提示在 set 后被 applyFeatures 覆盖，用户睇唔到「导轨已忽略」
- 证据: store.ts:10054 `if (guideSt && Math.abs(climb)>1e-6) set({status:'⚠ 导轨同 3D 爬升唔可以一齐用 — 导轨已忽略（爬升优先）'})`，紧接 :10055 `await applyFeatures([...], '...3D 爬升...')` 会再 set status 成功讯息，覆盖咗上面嘅警告。而且 path3 分支(:10049)根本无传 guide，导轨确实被丢但用户最后只见到成功讯息。
- 场景: 用户记低咗导轨又设咗爬升高度，扫掠后以为导轨生效（成功讯息无提到忽略），实际导轨被丢。
- 根因: 警告 set 同最终成功 set 顺序问题，前者被后者冲掉；冲突提示应并入最终讯息或经 buildWarnings。
- 修复: 把冲突提示拼入 applyFeatures 嘅成功讯息字串（已有 climb 分支），或经 buildWarnings 持久显示。
- guarded: False

## #64 [LOW] modify-solid/logic — 对称环形阵列 cpAngles 在 n=2 只产一个偏到末端嘅副本（非对称）
- 证据: cad.worker.ts:1051-1062，mode==='sym' 且 n=2：step=total/(2-1)=total，half=floor(1/2)=0 → for 循环唔行，(n-1)%2===1 → out.push(step*(0+1))=total，结果只得 [total]。
- 场景: 用户用「对称」模式做 2 个副本（总角 total）。预期两个副本对称分布（例如 ±total/2），实际净系一个副本放喺 +total 处，另一格空 → 阵列睇落歪向一边、唔似对称。
- 根因: sym 分支对 n=2（half=0 + 奇数余）嘅边界处理出咗一个单边 push，逻辑只对 n≥3 嘅奇/偶分桶啱。
- 修复: 对 sym 模式独立处理 n=2（产 ±total/2 两个），或 half 用 n/2 而非 (n-1)/2 重新推导对称布点公式。
- guarded: False

## #65 [LOW] primitives/numeric — 圆环管径 ≥ 外径(中心半径) 时自交 → 生成失败/空体，全程无守卫无提示
- 证据: store.ts:9315 torus 分支只 clamp arc，无检查 td<d；worker cad.worker.ts:1538-1541 只 `Math.max(1e-3,...)`，无 tb<tr 守卫，直接 `drawCircle(tb).translate(tr,0).revolve`。
- 场景: 用户填外Ø40、管Ø50 → tr=20、tb=25 → 管圆 x∈[−5,45] 横跨 Z 轴 → 绕 Z 旋转自交，OCCT 出退化/无效实体或抛错，用户净系见唔到嘢或报错，唔知系『管太粗』。
- 根因: 缺 tube radius < major radius 的几何合法性守卫。
- 修复: store.ts torus 分支加：`if(+p.td/2 >= +p.d/2){ set({status:'管径太大（≥外径），整唔到圆环'}); return }`（按你最终采用嘅外径语义调整阈值）。
- guarded: True

## #66 [LOW] primitives/logic — 球冠 cap ≥ 半径 时静默退成半球，无任何提示
- 证据: store.ts:9318 `const cap=Math.max(0,+p.cap||0), R=(+p.d)/2 ... c:cap`；worker cad.worker.ts:1522 `const h=(f.c && f.c>0 && f.c<r)?f.c:r` — cap≥r 时条件假 → h=r → 整半球。
- 场景: 用户做 Ø60（R30）圆顶想要冠高 40（成个高过半球），填 cap=40 → c=40，worker 见 40<30 假 → 退半球（冠高 30）。结果同要求唔同但状态栏照报成功。
- 根因: cap>r 无单独处理，直接落入 else=full hemisphere，且无 honesty 提示。
- 修复: worker dome 分支：cap>r 应 clamp 到 r 并经 buildWarnings 提示『球冠高超过半径，已封顶为半球』；或 store 端校验 cap≤R。
- guarded: False

## #67 [LOW] primitives/numeric — 棱锥/棱台顶端被强制留 0.4mm 平顶 — 永远唔系真尖顶
- 证据: worker cad.worker.ts:1497 `const topSk = profileToSketch({kind:'poly',pts:ngon(Math.max(0.4, Rt))}, H)` — 即使 Rt=0（尖锥）顶 N-gon 半径都被钳到 0.4mm。
- 场景: 用户用『圆锥』对话框设 sides=4、顶Ø=0 想要四棱锥真尖顶；得到嘅系顶面 0.4mm 外接圆嘅微型平顶（极小棱台）。小件（如底Ø2）时 0.4mm 平顶肉眼可见、装配/测量都偏。
- 根因: loft 两端都要非退化截面，所以强制 top 半径 0.4 绝对值，未按底半径按比例缩放。
- 修复: 把 0.4 换成相对底半径嘅细比例，例如 `Math.max(Rb*1e-3, 1e-3)`；或 Rt≈0 时改用 baseSk loft 到单点 apex（同 store.ts:9304 pyramid 路径一致，嗰度用 poly(0.1)）。
- guarded: False

## #68 [LOW] patterns-boolean/logic — 对话框矩形阵列缺零间距守卫：dx/dy=0 + 数量>1 会静默叠出重影（无任何提示）
- 证据: store.ts:9109-9130 commitFeatDlg 的 pattern 分支只 clamp 数量同检查总数 ≤400，完全无检查 dx/dy 是否为 0（对比 featurePatternSketch 在 store.ts:10495 有明确零间距守卫）。worker cad.worker.ts:1455 的退化间距警告只在【additive 分支】触发，而且用 `f.dx === 0` 严格等于；targets 分支(1433)同 hole 分支(1442)完全无此警告。
- 场景: 用户开「矩形阵列」对话框，X数量=4 但 X间距留空/填 0（或拣咗「所选特征」做孔阵），撳确定。结果 4 个副本全叠喺同一位置，几何同原件一模一样，状态栏却报「已矩形阵列 4×1」，用户以为成功但实际乜都无变。
- 根因: 对话框入口缺少同 featurePatternSketch 一致的零间距前置守卫；worker 的兜底警告又只覆盖整体 additive 一条分支（targets/hole 分支不覆盖），所以经对话框（尤其『所选特征』路径）创建的零间距阵列会无声退化。
- 修复: 在 store.ts:9110 之后加守卫：若 `(cX>1 && Math.abs(+p.dx)<1e-6) || (cY>1 && Math.abs(+p.dy)<1e-6) || (cZ>1 && Math.abs(+(p.dz||0))<1e-6)` 则 set status 拒绝并保持对话框开；并把 worker 的退化警告移到三条分支共用、用 `Math.abs(f.dx)<1e-6` 而非 `===0`。
- guarded: False

## #69 [LOW] patterns-boolean/logic — 路径阵列 / 特征级阵列 的「数量」可被时间轴改到 1，worker 强制成 2，显示同实际副本数不符
- 证据: Timeline.tsx:59 pathpattern count 走通用 NumField 无 min；worker cad.worker.ts:1467 `resamplePath(f.path, Math.max(2, Math.round(f.count)))` 强制 ≥2，resamplePath 本身(3439) `if (count < 2) return path.slice()` —— 即 count=1 时若直接调会返回原始 path 全部点而非 1 个，幸好被外层 Math.max(2) 救返；但 feature 上仍存 count=1。featpattern 的 cols/rows 走 Timeline.tsx:60 NumField min=0.1（line 241），可输入 0.1 小数。
- 场景: 用户把路径阵列「数量」改到 1，期望只剩 1 个副本（=取消阵列）。worker 仍画 2 个；feature.count 同屏幕显示「1」但几何系 2，参数同结果不一致，无提示。featpattern 改 cols=0.1 → worker Math.max(1,round(0.1))=0，但 expandFeats(2511) `Math.max(1,Math.round(0.1))`=0... 实际 round(0.1)=0,Math.max(1,0)=1 → 退化成 1，同样静默。
- 根因: count/cols/rows 等『整数且 ≥2 才有意义』的字段用咗浮点 NumField（min=0.1 或无 min），同 worker 的 Math.max(2)/Math.max(1) 钳制不一致，造成显示值同实际副本数脱节。
- 修复: 所有阵列计数字段（count/cols/rows/countX/Y/Z）改用整数 NumField（min=1 或 2、step=1），并令 editFeature 对呢类字段 round+clamp，确保 feature 存值=worker 用值。
- guarded: False

## #70 [LOW] patterns-boolean/numeric — fuseRobust 兜底只沿固定 Z(0,0,1) 微沉 0.02mm，对绕 X/Y 轴的环形阵列或斜方向阵列兜底无效
- 证据: worker cad.worker.ts:1039-1047 `fuseRobust(base, solid, n=[0,0,1])`，catch 分支沿 `-n*0.02` 平移重试；但 circPattern(3330,3338) 同 applyTargetDeltas(1140) 调用 fuseRobust 时全部用默认 n=[0,0,1]，唔传旋转轴方向。绕 X/Y 轴或斜轴的环形阵列副本之间共面失败时，沿 Z 微沉无助于错开真正共面方向。
- 场景: 绕 X 轴做环形凸台阵列且相邻副本恰好共面（例如 180° 两件对接）。第一次 fuse 抛共面错，fuseRobust 沿 Z 沉 0.02mm 仍共面 → 第二次 fuse 再抛 → 整条阵列失败，状态栏报『环形阵列副本失败』，用户唔知点解。
- 根因: 兜底微沉方向写死世界 Z，未随阵列轴/方向调整，对非 Z 主导的共面失败救唔到。
- 修复: circPattern/applyTargetDeltas 调 fuseRobust 时把旋转轴 ax 或平移方向作为 n 传入，令微沉沿真正的错开方向。
- guarded: False

## #71 [LOW] patterns-boolean/numeric — 环形阵列 sym 模式偶数 count 单边多放一个，且 totalAngle 实际跨度 > 输入值（文档化但 UI 无提示）
- 证据: worker cad.worker.ts:1051-1057 cpAngles sym：`step=total/(n-1)`，对称放 ±step*k，`if ((n-1)%2===1) out.push(step*(half+1))` —— n 为偶数(n-1 为奇)时 + 侧多放一个，且该角度=step*(half+1) 可超过 total/2，令实际角跨度大于用户输入 total。注释(1050)自认系『文档化偏差』，但 UI/状态栏并无向用户披露。
- 场景: 用户做对称环形阵列 count=4、总角度=90°，期望 4 件关于种子对称、跨度 90°。实际得 0,+30,-30,+60 —— +侧多一个、最大角 60>45，跨度不对称且非用户预期，且无提示。
- 根因: sym 模式对偶数件数的处理放弃了对称性（单边补一个），跨度计算 step*(half+1) 超出 total/2，属算法折衷但未在 UI 层告知用户。
- 修复: sym 模式偶数件改为真对称（两侧各 n/2、半步偏置），或在状态栏诚实标注『对称阵列偶数件单边多一个 / 实际跨度 X°』；至少令 msg 反映真实角度。
- guarded: False

## #72 [LOW] patterns-boolean/numeric — featpattern 斜面/非XY草图被拒，但成体矩形阵列(pattern targets) 对斜面特征 delta 用世界 XY 平移，结果偏出实体
- 证据: store.ts:10489 featurePatternSketch 明确拒绝斜面草图（src.arb），但 pattern『所选特征』路径(store.ts:9114, worker 1433-1441) 用 `s.translate(tx,ty,tz)` 世界坐标平移 delta，无检查目标特征草图是否在斜面上。translateProfile/translateSketchShape 只服务 featpattern 展开，targets 路径直接对 3D delta 做世界平移。
- 场景: 用户喺斜构造面上做咗个孔(extrude cut on arbPlane)，选中佢用『矩形阵列（所选特征）』。worker 把孔 delta 沿世界 X/Y 平移 —— 但孔本应沿斜面平面方向阵列，结果副本孔偏离斜面、可能整个移出实体（fuse/cut 无效或切错位），用户以为阵列失败。
- 根因: feature-level 矩形阵列对所有目标一律用世界 XY 平移，未像 featurePatternSketch 那样守住『斜面不支持』，造成斜面特征阵列方向语义错。
- 修复: pattern targets 路径在 commitFeatDlg 检查目标特征是否带 arbPlane/非XY plane，若是则拒绝或改用目标平面的 u/v 方向平移（同 featurePatternSketch 的守卫对齐）。
- guarded: False

## #73 [LOW] assembly-joints/visual — 爆炸视图对有关节/旋转嘅装配方向错（offset 落咗 FK 之前嘅局部帧）
- 证据: Viewport.tsx:2238-2248 explodeOff 用 componentCenter（世界系近似）算径向 offset；2298-2299 pos=c.pos+o 后 2311 把 o 经 pos prop 传入 KernelBody。KernelBody.tsx 等价于 Viewport.tsx:524-535：content=<group position={pos}>…</group>，再 535 `motion ? <group matrix={motion}>{content}` —— 即 world = motion(FK) · T(pos+offset) · …。offset 喺 FK 之前，会被 FK 嘅旋转/平移再变换。
- 场景: 做一个有旋转关节嘅装配（例如铰链、四连杆、任何 parent→child joint），把任一关节角拨到非零，再开『爆炸视图』拖爆炸度。被关节驱动嘅子件唔会沿世界径向散开，而系沿关节局部帧斜方向飞走，爆炸图错位/重叠。
- 根因: 爆炸 offset 喺世界系算（componentCenter），但应用喺 FK 之前嘅 pos 帧。两个帧唔同：对 FK=单位嘅根组件啱，对任何被关节/组 frame 驱动嘅子件就被 motion 矩阵二次变换。
- 修复: 把爆炸 offset 当世界平移：要么喺 motion 之后再叠一层世界平移 group（<group matrix={motion}>…</group> 外再包 <group position={worldOffset}>），要么将 offset 用 motion 的逆旋转预先反变换；并令 componentCenter 计入 FK+rot 以保证方向基准一致。
- guarded: False

## #74 [LOW] assembly-joints/visual — 螺旋关节 gizmo 限位扇区(±180°)同实际可驱动范围(±1080°)唔一致
- 证据: JointGizmo.tsx:14 ROT_TYPES 含 'screw'；43-44 lo/hi 用 j.aMin??-180 / j.aMax??180 画限位扇区。但 JointsPanel.tsx:214 螺旋滑杆默认 min={j.aMin??-1080} max={j.aMax??1080}。两处默认值唔同。
- 场景: 建螺旋关节，拨转角到例如 720°（多圈进给，滑杆允许到 1080），视口里嘅橙色限位扇区只画到 ±180°，白色指针绕回圈内，用户无法从 gizmo 看出真实多圈行程，误判限位。
- 根因: gizmo 同 panel 嘅默认限位常数唔同步（-180/180 vs -1080/1080）。
- 修复: JointGizmo 对 screw 用同 panel 一致嘅默认（±1080），或对多圈关节改用螺旋线/进度环而非单圈扇区显示。
- guarded: False

## #75 [LOW] assembly-joints/numeric — runMotionStudy 重力扭矩用嘅质心(com)同杠杆臂忽略 rot/FK，单摆/弹簧轨迹失真
- 证据: store.ts:8689 com=componentCenter(j.child)（见上一条，忽略 rot/FK），8695 rv=com-j.anchor 作杠杆臂，传入 simulateMotion（kinematics.ts:367 rVec=com-anchor，392 重力扭矩 r×F）。com 同 anchor 唔喺同一致世界帧 → 杠杆臂方向/长度错。
- 场景: 对一个已旋转或被父关节驱动嘅子件跑 ⚙动力学（单摆/弹簧），重力扭矩用错位质心计算，摆动周期/平衡位置同实物唔符，但 UI 照出『N 帧轨迹』睇落正常。
- 根因: 质心未经 compWorldMatrix 变换到真世界系，与世界系嘅 anchor/axis/gravity 混用。
- 修复: com 改用 compWorldMatrix(child, fk).乘 mesh bbox 中心 求世界质心；同 anchor/axis/g 统一世界帧。
- guarded: False

## #76 [LOW] assembly-joints/logic — rack(齿条)运动连接 driven.slide 直接 = driver.angle×ratio，不夹从动限位且单位耦合无守卫
- 证据: store.ts:521-524 propagateLinks rack 分支：want=ang(driver)*ratio(+driver2…)，`return {...j,slide:want}` 绝对写入，从不参考从动关节 sMin/sMax。注释(509-511)亦明言 driven 不 clamp。setJointValue:6600 调 propagateLinks 之后无对从动再夹限位。
- 场景: 数据层加 kind:'rack' 运动连接（角→移），驱动转角到大值时从动滑动件 slide 被设为远超其 sMin/sMax 嘅值，件穿出导轨/超行程，UI 限位形同虚设（jointMotion clampS 渲染时会夹，但存储值同显示值唔一致，限位标签 limTag 失效）。
- 根因: 从动值传播时刻意不夹限位，但 rack 把角度乘比例直接当 mm 写入 slide，无任何上下限守卫，存储态可超界。
- 修复: rack 从动 slide 传播后按从动 sMin/sMax 夹（或至少限位命中时停止驱动链并报警），保持存储值同 jointMotion 渲染 clamp 一致。
- guarded: False

## #77 [LOW] measure-inspect/honesty — 两点测量主读数硬编码「mm」，无视 cm/inch 显示单位
- 证据: Viewport.tsx:4366 <div…>{measureDist.toFixed(2)}<span…> mm</span></div>；同面板 ΔX/ΔY/ΔZ（4367）也用 toFixed(1) 裸 mm。对比量边/量面/量角都走 fmtLen(…, unit)（store.ts:9761-9787）会按 unit 转 cm/inch。
- 场景: 把显示单位设为 inch（或 cm），用「两点测量」点两点。大字读数显示的是 mm 数值却标注「mm」——但其余测量都已换成 inch，给 inch 用户一个错单位的醒目数字。
- 根因: 两点测量面板的大号读数与 Δ 行未接 fmtLen/unit，直接打印 mm。
- 修复: 用 fmtLen(measureDist, unit) 渲染主读数与 Δ 分量，单位后缀随 unit 变（mm/cm/in）。
- guarded: False

## #78 [LOW] measure-inspect/honesty — 网格件只读测量(measureMeshComponent)体积/面积固定 cm³/cm²，无视单位设置
- 证据: store.ts:5997 status 模板写死 `${(volMm3/1000).toFixed(2)} cm³ · 表面积 ${(area/100).toFixed(1)} cm² · 包围盒 …mm`，没用 fmtVol/fmtArea(…,unit)。
- 场景: 显示单位设为 inch，对导入网格件用「网格属性测量」，得到的体积/面积仍是 cm³/cm²、包围盒仍 mm，和其余面板的 inch 读数不一致。
- 根因: 该 action 用硬编码公制后缀而非统一的 fmtVol/fmtArea/fmtLen。
- 修复: 改用 fmtVol(volMm3,unit)/fmtArea(area,unit)/fmtLen(…,unit)，与物理属性面板一致。
- guarded: False

## #79 [LOW] measure-inspect/numeric — 量角报「法向夹角」而非面间夹角(二面角)，斜面/楔形会与直觉相反
- 证据: store.ts:9794-9803 measureAngleAt 直接 deg=acos(n1·n2)；调用方传的是 e.face.normal（Viewport.tsx:461）。对一个开口 30° 的楔形(斜面)，两外法向夹角=150°，会报 150° 而非用户想要的 30°(或其补角)。
- 场景: 对一个非 90° 的倒角/斜面与相邻面量角，读数是两外法向夹角，可能是用户预期二面角的补角(180−θ)，且无任何提示哪个是「面间夹角」。
- 根因: 只算法向点积反余弦，未提供二面角/补角语义或两值并列；外法向方向决定结果，曲面还取决于点中的三角面。
- 修复: 对平面-平面同时给出 θ 与 180−θ（或明确标注「法向夹角」+「面间夹角」），并对曲面/同面二次点击(n1·n2≈1 且选到同一面)给提示而非默默报 0°。
- guarded: False

## #80 [LOW] measure-inspect/interaction — 量角无「选到同一面/曲面」守卫，重复点同一面静默报 0°
- 证据: store.ts:9794-9803：第二次点击若 e.face.normal 与第一面相同(同面或曲面同一三角)，dot≈1→deg≈0，输出「两面法向夹角 0.00°（平行·同向）」，无「请点不同的面」提示；且半完成状态只能靠 toggle 重来(_angleN1 无取消入口)。
- 场景: 用户点了第一面，第二下没点准点回同一面（或点到曲面同一三角），得到 0° 误读，以为两面平行。
- 根因: 缺少对「两次选取是否同一 B-rep 面」的判定，仅凭法向；也无半程取消。
- 修复: 用 worker 返回的面身份(faceGroup/center)判定是否同面，相同则提示重选不计入；曲面给出曲面提示。
- guarded: False

## #81 [LOW] measure-inspect/honesty — 剖面截面属性形心坐标系随轴 swizzle 但 UI 不标注是哪两个轴
- 证据: store.ts:9715-9723 X→Z 截面 2D=(y,z)、Y→Z 截面 2D=(z,x)、Z 用(x,y)；status(9736)与 Viewport.tsx:4451 只写「形心 (a,b)」未注明 a,b 对应哪两个 CAD 轴。Ixx/Iyy 同理是在该旋转后标架下。
- 场景: X 或 Y 轴剖切时读出的形心/Ixx/Iyy 是在重映射后的局部 2D 系，用户无法判断 (a,b) 是 (y,z) 还是 (x,y)，把它当世界坐标会用错。
- 根因: remap 到 Z 后的 2D 坐标含义未在读数里暴露。
- 修复: 在 status/面板按 axis 标注形心分量轴名（如 X 剖→「形心(Y,Z)」），或把形心换算回 CAD 三维坐标再显示。
- guarded: False

## #82 [LOW] params-expr/interaction — 设计表范围 起:步:止 方向与步长符号不符时静默返回空，不报错
- 证据: src/components/ParamsPanel.tsx:9-12 parseVals：`if (step > 0) for (let v=a; v<=b+1e-9; v+=step)` 否则 `for (let v=a; v>=b-1e-9; v+=step)`。若输入『6:1:3』（起>止但步为正），step>0 且 a>b → 循环体永不执行，返回空数组。ParamsPanel.tsx:70 `const vs = parseVals(dtVals); if (!vs.length) return`（静默 return，无 status）。
- 场景: 用户输入『6:1:3』想从 6 到 3，结果撳『导出变体』毫无反应、无任何提示，以为按钮坏咗（典型空壳观感）。
- 根因: 范围方向由步长符号决定，但 UI 未校验 start/stop 与 step 符号一致性；空结果路径无用户反馈。
- 修复: parseVals 在 a>b 时自动取 step=-|step|（或反之），按起止方向推断步长符号；空结果时给明确 status『范围方向同步长符号唔一致』。
- guarded: False

## #83 [LOW] params-expr/numeric — AI 指令 add_parameter/set_parameter 把负值与零静默改写为 0（num 守卫过严）
- 证据: src/store.ts:6951 `const num = (k,d=0)=>{ const v=Number(a[k]); return Number.isFinite(v)&&v>0?v:d }`，store.ts:6983-6984 add_parameter/set_parameter 用 num('value') 取值。任何 <=0 的合法参数值（负偏移、0 基准）被替换成 0。
- 场景: 用户用自然语言叫 AI『加参数 偏移 = -5』或『设 间隙 = 0』，实际写入 0，模型与预期不符，且回执显示『✓ 已设 …=0』看似成功。
- 根因: num 守卫把『正数』当作所有数值参数的合法域，把参数当尺寸看待，但参数本身可为负/零（偏移、坐标、温差等）。
- 修复: 参数取值用『仅 Number.isFinite』的守卫，去掉 `v>0` 限制；正数限制只应施于明确需正的几何尺寸（半径等）。
- guarded: False

## #84 [LOW] io-persist/logic — 保存/打开/分享/自动保存全部唔保留 originX 以外嘅活动体 bodyMesh? 实为：导入的活动状态正常，但 STL 二进制识别会把带尾字节的二进制 STL 当 ASCII 误解析
- 证据: io/stl.ts:37-41 parseSTL 用 `84 + n*50 === buf.byteLength` 严格相等做二进制判据，唔等就 fall through 去 parseAscii。现实中有切片器/工具导出嘅 binary STL 带尾随字节（额外换行、对齐填充、或 header 起首恰好系 'solid'），令尺寸唔精确相等。
- 场景: 用户导入一个由某些工具产生、带尾字节的二进制 STL；被当 ASCII 解析 → ASCII 解析器把二进制字节当文本扫，得唔到 vertex 行 → mesh.vertices 为空 → store.ts:11254 报「STL 为空或格式不支持」。本来正常的文件被拒，用户以为自己档坏咗。
- 根因: 二进制判据用精确等号而非 `>=`/容差；ASCII 兜底无法识别「其实系二进制」。
- 修复: 判据放宽为 `buf.byteLength >= 84 + n*50` 且 n>0 且 n*50 与文件尾差距在小阈值内；或先嗅探前 5 字节非 'solid' 且 n 合理就当二进制。
- guarded: False

## #85 [LOW] io-persist/numeric — ASCII STL 数字格式化对 ≥1,000,000 的整数坐标会截断尾零（1000000 → 1）
- 证据: io/stl.ts:11-16 f()：`v.toPrecision(7)` 对 1000000 得 '1000000'（无小数点），随后 `.replace(/\.?0+$/,'')` 贪婪匹配尾部 '000000' → '1'。只在值有 ≥7 位整数且无小数点（即 ≥1e6 mm）时触发；有小数点的数（如 '1000.000'）会正确剩 '1000'。
- 场景: 导出 ASCII STL 且模型有坐标 ≥1,000,000mm（1km，极端/误缩放场景）→ 顶点坐标被写成完全错误的值，但无提示。常规 mm 模型不可达，故 severity 低。
- 根因: trim-trailing-zero 正则在无小数点时仍吞整数尾零。
- 修复: 只在串含 '.' 时做 trailing-zero trim：`s.includes('.') ? s.replace(/\.?0+$/,'') : s`。
- guarded: False

## #86 [LOW] io-persist/visual — exportViewPNG 截图导出文件名用 projectName 但未保证非空时与其他导出口径一致（可生成名为 '.png' 的怪名）
- 证据: Viewport.tsx:241 `const name = (useApp.getState().projectName || 'webcad').replace(/[\\/:*?"<>|]/g, '_')`，与 store.ts:13030 projName（`(n||'webcad').replace(/[^\w一-龥-]+/g,'_')`）规则不同。若 projectName 全为被 PNG 正则保留、但被 projName 视为非法的字符（或反之），同一项目的 STL 与 PNG 文件名会不一致；另 projName 对纯符号名会塌成 '_'，PNG 路径不会。
- 场景: 用户把项目命名为含特殊符号（如全角标点/emoji）。导出 STL 与导出 PNG 得到两套唔同的文件名，用户难以对应；极端命名下 PNG 名可能只剩扩展名。
- 根因: PNG 截图路径自带一套文件名净化，未复用 projName 单一真相。
- 修复: exportViewPNG 改用同一个 projName(projectName) helper（从 store 导出该函数）。
- guarded: False

## #87 [LOW] mold-flow/honesty — 报告/UI 显示嘅「分辨率」系用户请求值，非薄壁自动加密后实际用嘅分辨率
- 证据: moldflow.ts:522-550 薄壁件会自动把 res 由 reqRes 升到最高 AUTO_CAP=64（甚至中位半壁厚<0.65h 时连环加密），返回值只有 nVox 反映真实，无回传实际 res。store.ts:12618 报告印『体素：${r.nVox}（分辨率 ${s.moldRes}）』用嘅系 store 里嘅请求值 s.moldRes，唔系实际 res。
- 场景: 用户把精细度滑杆设 28 跑一个薄壳件，内核自动加密到 64。报告写「分辨率 28」但体素数对应 64 —— 数字对唔上，用户疑惑或低估实际精度（虽有 warnings 一条提及自动加密，但主行数字误导）。
- 根因: MoldResult 无 effRes 字段，UI 退而用请求值；自动加密静默改变咗实际分辨率。
- 修复: MoldResult 加 `resUsed:number` 返回实际 res；报告/UI 显示 resUsed（必要时标『(自动加密自 28)』）。
- guarded: True

## #88 [LOW] mold-flow/numeric — 锁模力用全场平均压力×投影面积，且取充填末瞬时压力 → 系统性低估，吨位推荐偏小
- 证据: moldsolve.ts:350-359：`for p filled: pSum+=p[p0]` → `avgP=pSum/nF`（全部已填体素平均，含末端前沿 p≈0 嗰大批低压区）；`clampForce=avgP*(projArea*1e-6)`。注释自认『投影面积用占用 z 层最多嗰层近似』+『锁模力趋势』。常规工程做法系『平均型腔压力 × 投影面积』，但呢度 avgP 取充填【末瞬时】全场平均（注:345-346 自述末段冇前沿锚点系统奇异，所以用最后前沿仍在嘅解 → 末点≈0），令 avgP 偏低、clampForce 偏低，再经 machineTonnage 推荐可能偏一档细。
- 场景: 求解器模式得出嘅 clampForceKN 偏低 → PDF 推荐机台偏一档（如应 200t 推 160t）。用户照单买/排机，可能轻微飞边。属同阶估算偏差，已有诚实声明，但方向性系统低估。
- 根因: 用末瞬时全场平均压力（含大量已松弛低压区）代替『充填末型腔平均压力』，物理上偏低；投影面积用单 z 层近似。
- 修复: 用各体素峰值/末填时压力（fillTime 时刻 p）而非末瞬时全场，或用 ∫p_filled dA_proj 真投影积分（逐 (u,v) 列取最大压力×h²）取代 avgP×maxLayer。
- guarded: False

## #89 [LOW] mold-flow/logic — 浇口吸附为 O(nGate × nVox) 暴力最近邻，高分辨率(256)+多浇口可卡死/掉帧
- 证据: moldflow.ts:622-629 每个浇口对全部 nVox 线性扫描求最近体素中心。clampResolution 上限 256（109-112），256³ 级网格 nVox 可达数十万，nGate×nVox 内层无空间加速结构。voxelize 已有 grid 索引可直接由浇口坐标算 i,j,k 命中，无需全扫。
- 场景: 用户为「睇清楚」把精细度推到 256（UI 滑杆 max=256，Viewport.tsx:3230）并点多个浇口，浇口吸附阶段额外做 nGate×几十万次距离计算，加上体素化/求解，浏览器主线程外 worker 长时间无进度反馈，用户以为卡死。
- 根因: 最近浇口用全体素线性扫描，未利用规则体素网格可 O(1) 由坐标→ijk 再就近搜索。
- 修复: 由浇口 CAD 坐标直接算 i=(gx-ox)/h 等，命中体素或在小邻域(±2)内搜实体体素，省去全扫。
- guarded: False

## #90 [LOW] surface-gears/honesty — 蜗杆 worm 全程无蜗轮、啮合比仅文字声明 — 用户以为做到蜗杆蜗轮传动其实只得一条蜗杆
- 证据: cad.worker.ts:2986-3008 只生成蜗杆芯柱+螺旋牙;store.ts:9139-9141 msg「同蜗轮啮合比=头数:蜗轮齿数(纯运动学)」。grep 全仓 wormwheel/蜗轮 无几何生成或运动连接。蜗杆是孤立装饰几何,啮合比只是 status 字符串,无配套蜗轮 Feature 也无 motionLink。
- 场景: 用户开蜗杆对话框建蜗杆期望减速传动,场景只有一条螺杆,无蜗轮无传动比落地
- 根因: 蜗杆系孤立几何,无配套蜗轮生成器及运动学连接
- 修复: 提供蜗轮配套生成 + addMotionLink(蜗杆,蜗轮,starts/zWheel),或 UI 诚实标「仅蜗杆造型,未含蜗轮传动」
- guarded: False

## #91 [LOW] surface-gears/logic — surfpatch 补面拾点未排序成环直接传 FillThicken,乱序点产出扭曲面无检测,只失败才警告
- 证据: cad.worker.ts:2543-2559。pts 直接 flat 传 PatchWrapper.FillThicken,无闭合环/绕序/共面检查。MakeFilling 对点序敏感,乱序点织出自交曲面。失败才 push 警告(line 2558),【成功但扭曲】无任何检测→用户得到扭曲补面以为成功。
- 场景: 用户依次拾选边界点但次序非沿环(跳点),生成扭曲/打结补面薄板,无警告
- 根因: 拾点未排序成环、未验自交,FillThicken 对乱序点产扭曲面
- 修复: 拾点按投影到最佳拟合平面嘅极角排序成环,或检测结果面自交/面积异常警告
- guarded: False

## #92 [LOW] surface-gears/numeric — solveSliderCrank 偏置 e 过大时部分曲柄角 disc<0 返 ok:false,store 描边只 skip→轨迹静默断裂无可达性提示
- 证据: kinematics.ts:318-327 cx=B[0]+sqrt(disc),disc=L²−(e−By)²。|e−By|>L 时 disc<0 返 ok:false。store.ts:6509 描轨迹 for d 0..360 sol.ok false 即 continue→轨迹缺口。默认 e=0 不触发,但用户改大 e 后轨迹断裂,无「该配置部分角无法装配」提示。
- 场景: 滑块曲柄设 e=50 大偏置,r=20,L=60,拖曲柄一圈,部分角度活塞消失/轨迹断,无错误信息
- 根因: 偏置过大令部分曲柄角无解,描边只 skip,无可达性校验
- 修复: make/setSliderCrank 后扫一圈,有 ok:false 角度→status 警告「连杆太短/偏置太大,部分行程无法装配」
- guarded: True

## #93 [LOW] surface-gears/numeric — internalGearFeatures 内齿圈用同参外齿轮负形直接 cut,无侧隙backlash→同配对外齿轮零间隙互锁
- 证据: gears.ts:168-174 cut 用同 module/teeth 嘅外齿轮 profile 直接挖,thickness+4 切穿。内齿应系外齿轮齿廓共轭负形 + 侧隙;直接同参 cut 出嘅内齿无 backlash,同配对外齿轮啮合理论上零间隙卡死。无 backlash 参数。
- 场景: 建内齿圈再建同模数行星轮,装配啮合时齿无间隙,运动学上互锁
- 根因: 内齿用同参外齿轮布尔减,无侧隙/顶隙补偿
- 修复: cut 齿轮加 backlash 偏移或文档标明内齿圈需自行留隙
- guarded: False

## #94 [LOW] surface-gears/numeric — suggestGearTrain 指定 stages 不足以达成目标比时仅返高 errPct 无硬性拦截,status 显示「已建·误差50%」当成功
- 证据: gears.ts:113-123 多级 greedy 每级 r clamp 到 rMax(line 117)。stages=2 但 target=200(两级最大≈rMax²)时末级 bestPair(t/prod) 仍>rMax,只取到 zMax/zMin≈10→achieved≪200,errPct 可达 50%+。代码无「超 n 级可达范围」硬警告,store.ts:6358 status 照显 errPct 当成功。
- 场景: 齿轮箱向导锁 2 级、目标比 200,生成器照建但实际仅~100,用户未必察觉远未达标
- 根因: 指定级数不足达目标时无硬性拦截,仅高 errPct 静默呈现
- 修复: errPct 超阈或 target>rMax^n 时 status 醒目警告「N 级最多约 X 倍,目标 Y 倍达唔到,请加级数」
- guarded: False

## #95 [LOW] view-render-timeline/visual — 地面接触阴影/反射硬钉喺 worldY≈0,模型被移高或建喺 z<0 时阴影脱离/穿模
- 证据: src/components/Viewport.tsx:1165 `<ContactShadows position={[0,-0.04,0]} ...>`、行 2402 工作模式 `<ContactShadows position={[0,-0.04,0]} ...>`、行 1177 GroundReflection `position={[0,-0.02,0]}` 全部固定 y≈0,无跟模型实际最低点(bodyTopZ/包围盒底)。
- 场景: 用 transform 特征把实体抬高 dz(或导入/建模喺 z<0),再开渲染地面阴影或地面反射。阴影/反射平面仍喺 worldY=0,模型底悬空喺空中阴影上方,或模型穿过反射板 — 截图睇落「浮空」或「沉地」。
- 根因: 地面平面用常量位置,无读模型包围盒最低 z(three-Y)动态对齐到模型底。
- 修复: 由 bodyMesh/components 包围盒算最低 three-Y(=最小 CAD z),把 ContactShadows/GroundReflection 嘅 position.y 设到该值(略减一点避 z-fight)。
- guarded: False

## #96 [LOW] view-render-timeline/interaction — 播放按钮录制期间唔 disable,连撳两下会开两条并发 play() 互抢 timelinePos
- 证据: src/components/Timeline.tsx:165 播放按钮 `disabled={features.length===0}` — 唔睇 busy/播放中;行 105 `play = async () => { ... for (let i=start; i<=total; i++){ await gotoStep(i); await sleep(320) } }` 本身无并发锁。gotoStep(store.ts:6722) 有 `if(get().busy) return` 但只防单步重入,唔防两条 play 循环交错。
- 场景: 撳「从头播放」▷,播放途中再撳一次 ▷。两条 play 循环同时跑,各自每 320ms 发一次 gotoStep,其中一条经常撞 busy 被 no-op,timelinePos 来回跳,回放观感乱。
- 根因: play() 无自身播放锁,按钮 disabled 条件唔包含「播放中/busy」。
- 修复: 加一个 playing ref/state:play 开始时置 true、完成置 false;播放按钮 `disabled={features.length===0 || playing}`,或 play 入口 `if (playing) return`。
- guarded: False

## #97 [LOW] view-render-timeline/logic — 时间轴数量类参数(阵列 X/Y/Z 数量、环形阵列数量)用 step=0.5 又无 min,可输入小数/0/负数
- 证据: src/components/Timeline.tsx:225-230 fields 嘅 NumField 一律 `step={0.5}` 且唔传 min(只有单字段 fallback 行 241 先有 min=0.1)。META 里 pattern.countX/countY/countZ、cpattern.count、circPattern.count、featpattern.cols/rows 都系整数语义但用同一 NumField。NumField.commit(Timeline.tsx:12-16) 只检 Number.isFinite + (min==null||n>=min),无整数化、无下限。
- 场景: 喺时间轴点阵列特征,把「X数量」打成 2.5 或 0 或 -1。NumField 当 finite 就提交。虽然 expandFeats(store.ts:2511) `Math.max(1,Math.round())` 对 featpattern 有兜底,但普通 pattern/cpattern 嘅 worker 路径未必有同样守卫,用户见到嘅输入值同实际生成副本数对唔上,且滚轮一格只加 0.5(数量场应加 1)。
- 根因: FieldDef 无标记「整数/最小值」类型,NumField 统一用 0.5 step + 无 min,数量场同尺寸场无区分。
- 修复: FieldDef 增 int?/min? 元数据:数量场 step=1、min=1、commit 时 Math.round;尺寸/距离场维持 0.5。
- guarded: True

## #98 [LOW] view-render-timeline/logic — 正交模式下标准视图/FitView 把相机推到超出 maxDistance(30000) 时被 OrbitControls 夹回,大模型取景失败
- 证据: src/components/Viewport.tsx:2536-2537 `minDistance={ZOOM_MIND} maxDistance={ZOOM_MAXD}`,ZOOM_MAXD=30000(行 1613)。ViewRig src/components/SketchLayer.tsx:1210 `d=r*3.2`、FitView 行 1149 `d=r*3.4` 直接 set camera.position 到 cx+d*...;随后 controls.update()(行 1217/1155)会把相机-target 距离夹返 [minDistance,maxDistance]。
- 场景: 载入或建一个对角线大过约 9000mm 嘅大模型(d=r*3.4 会超 30000),撳 FitView/标准视图。OrbitControls.update() 把相机距离夹到 30000,但 target 唔变 → 取景比预期近,模型仍超出画面;再者透视相机距离被夹后取景比例错。
- 根因: 取景代码假设可任意设相机距离,但 OrbitControls 嘅 max/minDistance 会喺紧接嘅 update() 夹住。两处取景逻辑同距离上限无协调。
- 修复: 取景前临时放宽 controls.maxDistance(取景后还原),或把 maxDistance 设到足够大/按模型尺寸动态调;正交模式靠 zoom 取景则与距离上限无关(见首条修复)。
- guarded: False

