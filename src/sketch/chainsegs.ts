// chainsegs.ts — S176 把一堆 2D 线段（投影参考几何 RefGeo.segs）连成 polyline / 闭合环。
// 纯函数零依赖 → tests/chainsegs.test.mjs 可直接单测。Sketch Project/Include（投影 3D 边/截交入草图做真草图曲线）用。
// 算法：端点量化做 node（1/50mm，同 computeRefGeo 同款）→ 建无向邻接 → 先由【度=1】端点走开放链，再由剩余【度=2】走闭合环。

type Pt = [number, number]

export function chainSegments(segs: [Pt, Pt][]): { pts: Pt[]; closed: boolean }[] {
  const q = (p: Pt) => Math.round(p[0] * 50) + ',' + Math.round(p[1] * 50)   // 1/50mm 量化
  const node = new Map<string, Pt>()                                          // key → 代表点
  // 无向去重边（同一对 node 只留一条）；自环（两端同 node）丢弃
  const edgeKey = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a)
  const edges: { a: string; b: string }[] = []
  const seenEdge = new Set<string>()
  for (const [p0, p1] of segs) {
    const ka = q(p0), kb = q(p1)
    if (ka === kb) continue
    if (!node.has(ka)) node.set(ka, p0)
    if (!node.has(kb)) node.set(kb, p1)
    const ek = edgeKey(ka, kb)
    if (seenEdge.has(ek)) continue
    seenEdge.add(ek)
    edges.push({ a: ka, b: kb })
  }
  // 邻接：node key → [{to, edgeIdx}]
  const adj = new Map<string, { to: string; ei: number }[]>()
  edges.forEach((e, ei) => {
    ;(adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push({ to: e.b, ei })
    ;(adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push({ to: e.a, ei })
  })
  const usedEdge = new Array<boolean>(edges.length).fill(false)
  const out: { pts: Pt[]; closed: boolean }[] = []

  // 由某 node 起，沿未用边走一条链（贪心取第一条未用邻边）；closed=是否走返起点
  // S176 audit (MED)：分支节点（度>2，如内壁/T 接/夹腰截面）用【转角 tie-break】拣下一条边 —— 由来向反方向起【顺时针最近】嗰条
  //   （= 沿面紧贴拐弯，唔会笔直穿过 junction 串错环），令分解【确定 + 跟几何】、唔受线段输入次序影响。度=2 只得一条续边，行为不变（常见 footprint 路径字节一致）。
  //   seed（无来向）拣【角度最细（离 +x 最近）】嗰条 → seed 方向亦确定。
  const ang = (from: Pt, to: Pt) => Math.atan2(to[1] - from[1], to[0] - from[0])
  // stopAtJunction（开放 stub walk 用）：行到一个仲有 ≥2 条未用边嘅 junction 即停 → 把【刺/悬边】剥成短开放链，
  //   junction 上嘅环留俾后面 closed pass 整环追（否则由叶起步会笔直穿过 junction 把环吞入开放链、环唔再闭合可拉伸）。
  const walk = (start: string, stopAtJunction = false): { keys: string[]; closed: boolean } => {
    const keys = [start]
    let cur = start
    let prev: string | null = null
    for (;;) {
      const nbrs = (adj.get(cur) || []).filter((n) => !usedEdge[n.ei])
      if (!nbrs.length) break
      let nx: { to: string; ei: number }
      if (prev === null) {
        // seed：拣离 +x 最近嘅方向（确定，唔睇输入次序）
        let best = nbrs[0], bestA = Infinity
        const c = node.get(cur)!
        for (const n of nbrs) { const a = Math.abs(ang(c, node.get(n.to)!)); if (a < bestA) { bestA = a; best = n } }
        nx = best
      } else if (nbrs.length === 1) {
        nx = nbrs[0]   // 单续边（度=2 干路）
      } else {
        // 转角：由 back（cur→prev 方向）顺时针最近嗰条
        const c = node.get(cur)!, back = ang(c, node.get(prev)!)
        let best = nbrs[0], bestD = Infinity
        for (const n of nbrs) {
          let d = back - ang(c, node.get(n.to)!)
          while (d <= 1e-9) d += 2 * Math.PI
          while (d > 2 * Math.PI) d -= 2 * Math.PI   // 顺时针距离 ∈ (0, 2π]
          if (d < bestD) { bestD = d; best = n }
        }
        nx = best
      }
      usedEdge[nx.ei] = true
      keys.push(nx.to)
      prev = cur
      cur = nx.to
      if (cur === start) return { keys, closed: true }   // 走返起点 = 闭合环
      if (stopAtJunction && (adj.get(cur) || []).filter((n) => !usedEdge[n.ei]).length >= 2) break   // 到 junction（前面仲有多条路）→ 停低个开放 stub
    }
    return { keys, closed: false }
  }
  // 闭合 walk 尾==头 → 去重复尾点（两 pass 共用，唔再得 pass-2 strip：否则 pass-1 经奇度起点收嘅闭环会留重复点 → 拉伸出零长封口边）。
  const emit = (w: { keys: string[]; closed: boolean }) => {
    if (w.keys.length < 2) return
    const keys = w.closed && w.keys.length > 1 && w.keys[w.keys.length - 1] === w.keys[0] ? w.keys.slice(0, -1) : w.keys
    if (keys.length >= 2) out.push({ pts: keys.map((kk) => node.get(kk)!), closed: w.closed })
  }

  // 起点【按 key 字典序】遍历（key 由坐标量化定，故唔受线段输入次序影响 → 分解确定）。
  const order = [...node.keys()].sort()
  const degree = (k: string) => (adj.get(k) || []).length
  // 1) 开放 stub：由【真端点（度=1）】起，行到 junction 即停 → 剥走刺/悬边，junction 上嘅环留俾 pass-2 整环闭合。
  for (const k of order) {
    if (degree(k) === 1 && (adj.get(k) || []).some((n) => !usedEdge[n.ei])) emit(walk(k, true))
  }
  // 2) 剩余（闭合环 + junction 间嘅开放链）— 由字典序起点 + 转角 tie-break，确定。
  for (const k of order) {
    while ((adj.get(k) || []).some((n) => !usedEdge[n.ei])) emit(walk(k))
  }
  return out
}
