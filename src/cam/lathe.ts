// lathe.ts — 2 轴 CNC 车削（lathe/turning）刀路纯数学模块（GRBL 业余车床）
//
// 目标机器限制（同 mill25d.ts 同一系 GRBL 方言，但系车床唔系铣床）：
//   · 单刀、无刀塔 — 成个 program 一把车刀做晒，唔出 T 字 / 换刀
//   · 无 canned cycle — G70/G71/G72 GRBL 唔识，粗车循环要自己手动展开成 G0/G1 序列
//   · 2 轴 ：X = 径向、Z = 轴向；车 ZX 平面 → 头出 G18（唔系 G17）
//
// 车床坐标惯例（呢度同铣床差好远，特别留神）：
//   · X = 【直径值】diameter mode —— X2.0 即系半径 1.0；所有 X 输出 = 半径 × 2。
//     业余 GRBL 车床多数行 diameter mode（同工业车床睇齐），故本模块全程出直径。
//   · Z = 轴向，Z0 喺工件【右端面】，负 Z 向左（向卡盘/向内料）入料。
//   · G0 快移、G1 切削 F mm/min、M3 主轴正转 S<rpm>。
//   · 头 G21（mm）/G90（绝对）/G18（ZX 平面）；尾 G0 退刀 → M5 熄主轴 → M2 完。
//
// 同 mill25d.ts 共用嘅套路（佢系已验证嘅同类模块，照抄风格）：
//   · 数字格式 fmt：3 位小数剪尾零，|x|<1e-9 → 0（GRBL 唔食 "1e-15"）。
//   · warnings 去重 warnOnce：UI 提示用嘅中文，唔写入 G-code。
//   · 参数 guard：必须为正嘅数唔啱即刻 throw 中文。
//   · 返回 { gcode, warnings }。
//
// 输入 = 回转体【成品轮廓】：一串 (z, r) 控制点（r = 成品半径 mm，z 升序），加毛坯直径。
// 三种操作：
//   turn  — 外圆粗车 + 精车：由毛坯半径分层径向进刀，粗车阶梯逼近最终轮廓
//           （每个 Z 位攞 max(成品半径, 当前层半径)），最后一刀沿成品轮廓
//           （锥/段直线密铺）由右到左光车到最终尺寸。
//   face  — 端面车平：由安全直径分层径向 G1 由外向心车 z=0（或指定）端面。
//   groove— 切槽：喺 grooveZ 径向分层切入到 grooveDepth；槽宽 > 刀宽（doc）多刀清宽。

export interface LatheProfilePt {
  z: number // 轴向位置 mm（升序，Z0 = 右端面，负向入料）
  r: number // 成品半径 mm
}

export interface LatheOpts {
  stockD: number // 毛坯直径 mm（圆棒）
  toolNoseR?: number // 刀尖圆弧半径 mm（默认 0.4；本 v1 唔做补偿，只警告留量）
  doc: number // 每刀切深 mm（径向 depth of cut，分层粗车用）
  feed: number // 切削进给 mm/min
  rpm: number // 主轴转速 S
  safeX: number // 安全退刀直径 mm（> stockD）
  safeZ: number // 右端安全 Z mm（> 0，工件右端外）
  op: 'turn' | 'face' | 'groove' // 外圆粗+精车 / 端面车平 / 切槽
  finishStep?: number // turn：精车留量 mm（默认 0.3，最后一刀光车到尺寸）
  faceZ?: number // face：端面目标 Z（默认 0）
  grooveZ?: number // groove：槽中心 Z
  grooveW?: number // groove：槽宽 mm（刀宽近似 = doc）
  grooveDepth?: number // groove：槽深 mm（径向）
}

const EPS = 1e-9

// 数字格式（照抄 mill25d）：|x|<1e-9 → 0，3 位小数剪尾零
const fmt = (x: number): string => String(+(Math.abs(x) < 1e-9 ? 0 : x).toFixed(3))

// X 输出 = 直径 = 半径 × 2（diameter mode）。半径负值钳到 0（直径非负）。
const dia = (radius: number): string => fmt(Math.max(0, radius) * 2)

// ---------- 轮廓采样 ----------

/** 喺成品轮廓上攞 z 处嘅半径（控制点之间线性插值 = 锥/直段密铺）。
 *  profile.z 系升序；z 喺范围外就钳到首/尾点。 */
function profileRadiusAt(profile: LatheProfilePt[], z: number): number {
  const n = profile.length
  if (z <= profile[0].z) return profile[0].r
  if (z >= profile[n - 1].z) return profile[n - 1].r
  for (let i = 0; i < n - 1; i++) {
    const a = profile[i], b = profile[i + 1]
    if (z >= a.z && z <= b.z) {
      const span = b.z - a.z
      if (span < EPS) return b.r
      const t = (z - a.z) / span
      return a.r + (b.r - a.r) * t
    }
  }
  return profile[n - 1].r
}

// ---------- G-code 发射 ----------

type Emit = { L: string[]; f: number } // f = modal 进给（变咗先出 F 字）

function fw(st: Emit, f: number): string {
  if (Math.abs(st.f - f) < 1e-9) return ''
  st.f = f
  return ` F${fmt(f)}`
}

// 精车密铺：锥/斜段两控制点之间，半径变化超过呢个值就插中间点（直线逼近曲面留嘅手脚位）
const DENSIFY_DR = 1 // mm 半径增量

/** 沿成品轮廓由【右到左】（z 大 → z 细）走一刀，逐控制点 G1（锥/段全部直线）。
 *  caller 负责事前 G0 定位 X、Z 到起点。轮廓每点出 max(成品半径, floorR) 做半径，
 *  floorR = 当前粗车层半径（粗车阶梯）；精车传 floorR = -Infinity 即纯走成品轮廓。
 *  densify = true（精车用）：斜段半径差 > DENSIFY_DR 就线性插中间点，令锥/圆弧段
 *  出连串过渡 X 值（唔系纯阶梯跳）；粗车取 max 后多数系平段，唔使密铺。 */
function emitProfilePass(
  st: Emit,
  profile: LatheProfilePt[],
  floorR: number,
  feed: number,
  densify: boolean,
): void {
  // profile 升序（z 细 → z 大）；车削由右（z 大）到左（z 细）→ 倒序行
  const rOf = (i: number): number => Math.max(profile[i].r, floorR)
  const g1 = (r: number, z: number): void => { st.L.push(`G1 X${dia(r)} Z${fmt(z)}${fw(st, feed)}`) }
  // 由右端点起手
  const lastI = profile.length - 1
  g1(rOf(lastI), profile[lastI].z)
  for (let i = lastI - 1; i >= 0; i--) {
    const r0 = rOf(i + 1), z0 = profile[i + 1].z
    const r1 = rOf(i), z1 = profile[i].z
    const dr = Math.abs(r1 - r0)
    if (densify && dr > DENSIFY_DR + EPS) {
      // 斜/锥段：等分插中间点（步数 = ceil(dr/DENSIFY_DR)），出过渡 X 值
      const steps = Math.ceil(dr / DENSIFY_DR)
      for (let s = 1; s < steps; s++) {
        const t = s / steps
        g1(r0 + (r1 - r0) * t, z0 + (z1 - z0) * t)
      }
    }
    g1(r1, z1)
  }
}

// ---------- 主入口 ----------

/**
 * 回转体成品轮廓（z 升序 + 半径 mm）→ GRBL 2 轴车削 G-code。
 * 返回 { gcode, warnings }；warnings 系俾 UI 显示嘅中文提示，唔会写入 G-code 本身。
 * 参数唔啱即刻 throw 中文。
 */
export function latheToGcode(
  profile: LatheProfilePt[],
  opts: LatheOpts,
): { gcode: string; warnings: string[] } {
  // ── 参数 guard：六个必须为正嘅数 ──
  const checks: [string, number][] = [
    ['stockD', opts.stockD], ['doc', opts.doc], ['feed', opts.feed],
    ['rpm', opts.rpm], ['safeX', opts.safeX], ['safeZ', opts.safeZ],
  ]
  for (const [k, v] of checks) {
    if (!(Number.isFinite(v) && v > 0)) throw new Error(`参数 ${k} 必须为正数（而家系 ${v}）`)
  }
  if (opts.safeX <= opts.stockD) {
    throw new Error(`安全直径要大于毛坯（safeX ${fmt(opts.safeX)} ≤ stockD ${fmt(opts.stockD)}）`)
  }

  const toolNoseR = opts.toolNoseR ?? 0.4
  const finishStep = opts.finishStep ?? 0.3
  const stockR = opts.stockD / 2
  const safeXr = opts.safeX / 2 // 安全退刀【半径】（内部计算用半径，输出先 ×2）
  const warnings: string[] = []
  const warn = (s: string): void => { if (!warnings.includes(s)) warnings.push(s) }

  const st: Emit = { L: [], f: NaN }
  // 头：单位/绝对坐标/ZX 平面 → 升安全退刀 → 开主轴（M3 必须喺第一条 G1 之前）
  st.L.push('G21', 'G90', 'G18', `G0 X${dia(safeXr)} Z${fmt(opts.safeZ)}`, `M3 S${fmt(opts.rpm)}`)

  if (opts.op === 'turn') {
    // ── 外圆粗车 + 精车 ──
    if (profile.length < 2) throw new Error('turn 轮廓最少要 2 点')

    // 轮廓超毛坯检查：任何成品半径 > 毛坯半径 → 该处唔切，钳到毛坯（warning）
    const clampedRaw = profile.map((p) => {
      if (p.r > stockR + EPS) {
        warn(`轮廓超出毛坯（r ${fmt(p.r)} > 毛坯半径 ${fmt(stockR)}）— 该处钳到毛坯, 唔切`)
        return { z: p.z, r: stockR }
      }
      return { z: p.z, r: p.r }
    })
    // 排序成 z 升序（caller 传入降序/乱序都收嗮）。同一 Z 嘅阶梯多点 r 升序排（细 r 排前、
    // 大 r 排后）：车削由右（z 大）到左、emitProfilePass 倒序遍历先掂数组【尾】,
    // 大 r 放尾 → 台阶处先车大外径平台、再切入细径（物理正确走刀向）。
    // z、r 都相等就保原始次序。
    const clamped = clampedRaw
      .map((p, i) => ({ p, i }))
      .sort((a, b) => (a.p.z - b.p.z) || (a.p.r - b.p.r) || (a.i - b.i))
      .map((o) => o.p)

    // 刀尖半径 vs 精车留量：刀尖大过留量 → 内圆角 / 锥面会过切（v1 唔补偿只警告）
    if (toolNoseR > finishStep + EPS) {
      warn(`刀尖半径 ${fmt(toolNoseR)} > 精车留量 ${fmt(finishStep)} — 内圆角/锥面会过切`)
    }

    // 成品最大需切半径（粗车要逼近到呢度 + 精车留量先收）
    const maxFinishR = Math.max(...clamped.map((p) => p.r))
    const finishLine = maxFinishR + finishStep // 粗车停喺呢条线，留 finishStep 俾精车
    // clamped 已排成 z 升序 → 右端 = 末点 z（z 大）、左端 = 首点 z（车削由右到左）
    const zRight = clamped[clamped.length - 1].z

    // 粗车层：由毛坯半径向内，每层 doc，层半径 ≤ finishLine 即收（最后一层 clamp 到 finishLine）
    // 层数 nRough = ceil((stockR − finishLine)/doc)，毛坯本身已喺留量内就 0 层。
    const nRough = stockR > finishLine + EPS ? Math.ceil((stockR - finishLine) / opts.doc) : 0
    for (let i = 1; i <= nRough; i++) {
      const layerR = Math.max(finishLine, stockR - i * opts.doc) // 最后一层 clamp 到 finishLine
      st.L.push(`(turn 粗车 第 ${i}/${nRough} 层 半径 ${fmt(layerR)} 直径 ${dia(layerR)})`)
      st.L.push(`G0 X${dia(layerR)}`) // 退到该层直径（仲喺 safeZ 外）
      st.L.push(`G0 Z${fmt(zRight)}`) // 飞去轮廓右端起点
      // 沿轮廓由右到左：每个 Z 攞 max(成品半径, 当前层半径) → 阶梯逼近（粗车唔密铺）
      emitProfilePass(st, clamped, layerR, opts.feed, false)
      st.L.push(`G0 X${dia(safeXr)}`) // 退 X 到安全直径
    }

    // 精车一刀：沿成品轮廓由右到左光车到最终尺寸（floorR = -Infinity 即纯走轮廓）
    st.L.push('(turn 精车 沿成品轮廓一刀)')
    st.L.push(`G0 X${dia(profileRadiusAt(clamped, zRight))}`) // 退到右端点直径起手
    st.L.push(`G0 Z${fmt(zRight)}`)
    emitProfilePass(st, clamped, -Infinity, opts.feed, true) // 精车密铺锥/圆弧段
    st.L.push(`G0 X${dia(safeXr)}`)
  } else if (opts.op === 'face') {
    // ── 端面车平：由安全直径分层径向 G1 由外向心车 faceZ 端面 ──
    if (profile.length < 2) throw new Error('face 轮廓最少要 2 点')
    const faceZ = opts.faceZ ?? 0
    // 端面由毛坯外缘（stockR）径向车到中心（半径 0）；分层用 doc 做径向步距。
    // 一刀 = 喺 faceZ 由外向心 G1 X 递减（直径递减序列）。
    st.L.push(`(face 端面车平 Z${fmt(faceZ)})`)
    st.L.push(`G0 X${dia(stockR)}`) // 退到毛坯外缘直径
    st.L.push(`G0 Z${fmt(faceZ)}`) // 落到端面 Z
    // 由外缘半径递减到 0，每步 doc（最后一步精确到 0）
    let rCur = stockR
    while (rCur > EPS) {
      const rNext = Math.max(0, rCur - opts.doc)
      st.L.push(`G1 X${dia(rNext)} Z${fmt(faceZ)}${fw(st, opts.feed)}`)
      if (rNext < EPS) break
      rCur = rNext
    }
    st.L.push(`G0 X${dia(safeXr)}`) // 退 X 到安全直径
  } else {
    // ── groove 切槽：喺 grooveZ 径向分层切入到 grooveDepth；宽 > 刀宽多刀清宽 ──
    const grooveZ = opts.grooveZ ?? 0
    const grooveW = opts.grooveW ?? opts.doc
    const grooveDepth = opts.grooveDepth ?? 0
    if (!(Number.isFinite(grooveDepth) && grooveDepth > 0)) {
      throw new Error(`参数 grooveDepth 必须为正数（而家系 ${grooveDepth}）`)
    }
    // 槽口起始半径 = 该 Z 处毛坯外圆（呢度成品 = 毛坯外径，简化用 stockR；
    // 槽底半径 = 起始 − grooveDepth），切到底直径要 ≥ 0。
    const startR = stockR
    const bottomR = Math.max(0, startR - grooveDepth)
    if (bottomR < EPS && startR - grooveDepth < -EPS) {
      warn(`槽深 ${fmt(grooveDepth)} 超过毛坯半径 ${fmt(startR)} — 已钳到中心 X0`)
    }
    // 刀宽 = doc；槽宽 > 刀宽要多刀沿 Z 偏移清宽。
    const toolW = opts.doc
    let passes = 1
    if (grooveW > toolW + EPS) {
      passes = Math.ceil(grooveW / toolW)
      warn(`槽宽 ${fmt(grooveW)} > 刀宽 ${fmt(toolW)} — 需 ${passes} 刀沿 Z 偏移清宽`)
    }
    // 多刀沿槽宽分布：槽中心 grooveZ，槽两边 [grooveZ − W/2, grooveZ + W/2]；
    // 每刀刀中心由右边缘向左偏一个刀宽（passes=1 时就喺 grooveZ）。
    for (let pz = 0; pz < passes; pz++) {
      const zCut = passes === 1
        ? grooveZ
        : grooveZ + grooveW / 2 - toolW / 2 - pz * ((grooveW - toolW) / Math.max(1, passes - 1))
      st.L.push(`(groove 切槽 第 ${pz + 1}/${passes} 刀 Z${fmt(zCut)})`)
      st.L.push(`G0 Z${fmt(zCut)}`) // 飞去该刀 Z
      st.L.push(`G0 X${dia(startR)}`) // 落到槽口外圆直径
      // 径向分层切入：由 startR 每层 doc 切到 bottomR
      const nLayers = Math.max(1, Math.ceil((startR - bottomR) / opts.doc))
      for (let i = 1; i <= nLayers; i++) {
        const layerR = Math.max(bottomR, startR - i * opts.doc)
        st.L.push(`G1 X${dia(layerR)} Z${fmt(zCut)}${fw(st, opts.feed)}`) // 径向切入
        st.L.push(`G0 X${dia(startR)}`) // 退返槽口排屑
      }
      st.L.push(`G0 X${dia(safeXr)}`) // 退 X 到安全直径
    }
  }

  // 尾：退刀（X 退安全直径 → Z 退安全位）→ 熄主轴 → 完
  st.L.push(`G0 X${dia(safeXr)}`, `G0 Z${fmt(opts.safeZ)}`, 'M5', 'M2')
  return { gcode: st.L.join('\n') + '\n', warnings }
}
