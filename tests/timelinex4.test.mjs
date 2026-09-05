// Wave X4（时间轴 + 选择 / TIMELINE + SELECTION）纯逻辑测试：
// selFilter 迁移（旧 3 枚举 → 新对象，byte-compat）/ 逐类型过滤谓词 / 优先级 + 穿透更新 /
// Select-Through 命中集 / 套索多边形命中 / By-Name·By-Size 谓词 / Invert·并·差·交 集运算 /
// Seed-and-Boundary 洪泛 / chip 色板 / hideInactive 稳健回卷索引。
// 跑法：npx -y tsx tests/timelinex4.test.mjs
import {
  DEFAULT_SEL_FILTER, migrateSelFilter, isDefaultSelFilter, serializeSelFilter,
  selAllowsType, selPicksComp, selPicksBody,
  withSelType, withAllTypes, withNoTypes, withPriority, withSelThrough,
  resolvePickHits, pickableWithCmdOverride, inspectWantEdge, pointInPolygon, polygonBBox,
  invertSet, unionSet, subtractSet, intersectSet,
  matchByName, sizeMatches, matchBySize, seedExpand,
  chipSwatchColor, computeScrubIndex, SEL_TYPES,
} from '../src/cad/selectionModel.ts'

let pass = 0, fail = 0
const rows = []
const ck = (name, cond, detail) => { rows.push([cond ? 'PASS' : 'FAIL', name, detail || '']); cond ? pass++ : fail++ }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ── 1. selFilter 迁移（旧 3 枚举 → 新对象，byte-compat）────────────────
{
  const all = migrateSelFilter('all')
  ck('migrate("all") 全类型可拣', all.types.length === SEL_TYPES.length && all.priority === 'face' && all.selectThrough === false)
  const comp = migrateSelFilter('comp')
  ck('migrate("comp") 只 component', eq(comp.types, ['component']) && comp.priority === 'body')
  const body = migrateSelFilter('body')
  ck('migrate("body") = body/face/edge', eq(body.types, ['body', 'face', 'edge']) && body.priority === 'face')
  // 旧 'all' 迁移后 = 默认（拣 comp + body，逐字节旧行为）
  ck('migrate("all") 默认态', isDefaultSelFilter(all))
  ck('migrate("comp") 非默认', !isDefaultSelFilter(comp))
  // 对象输入：过滤非法类型 + 补默认
  const obj = migrateSelFilter({ priority: 'edge', types: ['face', 'bogus', 'edge'], selectThrough: true })
  ck('migrate 对象过滤非法类型', eq(obj.types, ['face', 'edge']) && obj.priority === 'edge' && obj.selectThrough === true)
  // 空 types → 回落全类型
  ck('migrate 空 types 回落全选', migrateSelFilter({ types: [] }).types.length === SEL_TYPES.length)
  // 垃圾输入 → 默认
  ck('migrate(null) → 默认', isDefaultSelFilter(migrateSelFilter(null)))
  ck('migrate(undefined) → 默认', isDefaultSelFilter(migrateSelFilter(undefined)))
  ck('migrate(123) → 默认', isDefaultSelFilter(migrateSelFilter(123)))
  // 幂等：对象再迁移不变
  ck('migrate 幂等', eq(migrateSelFilter(obj), obj))
}

// ── 2. 序列化 omit-on-default（存档字节兼容）──────────────────────────
{
  ck('serialize 默认态 = undefined', serializeSelFilter(DEFAULT_SEL_FILTER) === undefined)
  const comp = migrateSelFilter('comp')
  const s = serializeSelFilter(comp)
  ck('serialize 非默认 = 对象', !!s && eq(s.types, ['component']) && s.priority === 'body')
  // 序列化 → 反序列化往返一致
  ck('serialize 往返一致', eq(migrateSelFilter(s), comp))
}

// ── 3. 逐类型过滤谓词（拾取门）───────────────────────────────────────
{
  const all = migrateSelFilter('all')
  ck('all: pickComp+pickBody', selPicksComp(all) && selPicksBody(all))
  const comp = migrateSelFilter('comp')
  ck('comp: pickComp 仅组件', selPicksComp(comp) && !selPicksBody(comp))
  const body = migrateSelFilter('body')
  ck('body: pickBody 仅实体', !selPicksComp(body) && selPicksBody(body))
  ck('selAllowsType', selAllowsType(all, 'sketch') && !selAllowsType(comp, 'face'))
  // 只有 vertex/sketch 时 pickBody=false（无 body/face/edge）
  const vs = migrateSelFilter({ types: ['vertex', 'sketch'] })
  ck('仅 vertex/sketch → pickBody=false', !selPicksBody(vs) && !selPicksComp(vs))
}

// ── 4. 优先级 / 穿透 / 逐类型不可变更新 ───────────────────────────────
{
  const base = migrateSelFilter('all')
  const noFace = withSelType(base, 'face', false)
  ck('withSelType 关面', !noFace.types.includes('face') && base.types.includes('face'))
  const reFace = withSelType(noFace, 'face', true)
  ck('withSelType 开面（排序稳定）', eq(reFace.types, base.types))
  ck('withSelType 同态返原对象', withSelType(base, 'face', true) === base)
  ck('withAllTypes', withAllTypes(noFace).types.length === SEL_TYPES.length)
  ck('withNoTypes', withNoTypes(base).types.length === 0)
  // 设优先级同时保证该类型可拣
  const noEdge = withSelType(base, 'edge', false)
  const pe = withPriority(noEdge, 'edge')
  ck('withPriority 保证类型可拣', pe.priority === 'edge' && pe.types.includes('edge'))
  ck('withSelThrough', withSelThrough(base, true).selectThrough === true && withSelThrough(base, false).selectThrough === false)
}

// ── 5. Select-Through 命中集 ─────────────────────────────────────────
{
  const hits = ['a', 'b', 'c']   // 已按距离升序
  ck('through=false 仅最近', eq(resolvePickHits(hits, false), ['a']))
  ck('through=true 取全部', eq(resolvePickHits(hits, true), ['a', 'b', 'c']))
  ck('空命中 = 空', eq(resolvePickHits([], true), []))
  // 唔改原数组
  const orig = ['x', 'y']; resolvePickHits(orig, true); ck('through 唔改原数组', eq(orig, ['x', 'y']))
}

// ── 6. 套索多边形命中（pointInPolygon + bbox 预剔除）──────────────────
{
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10]]
  ck('点在方内', pointInPolygon(5, 5, sq))
  ck('点在方外', !pointInPolygon(15, 5, sq))
  ck('点在左外', !pointInPolygon(-1, 5, sq))
  // 凹多边形（L 形）：凹口内的点应判外
  const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]]
  ck('L形 凹口内点判外', !pointInPolygon(8, 8, L))
  ck('L形 实体内点判内', pointInPolygon(2, 8, L))
  ck('L形 底部内点判内', pointInPolygon(8, 2, L))
  // bbox
  const bb = polygonBBox(sq)
  ck('polygonBBox', bb.minX === 0 && bb.minY === 0 && bb.maxX === 10 && bb.maxY === 10)
  ck('polygonBBox <3 点 = null', polygonBBox([[0, 0], [1, 1]]) === null)
}

// ── 7. 集运算：Invert / 并 / 差 / 交 ─────────────────────────────────
{
  const all = ['a', 'b', 'c', 'd']
  ck('invertSet 补集', eq(invertSet(all, ['b', 'd']), ['a', 'c']))
  ck('invertSet 空选 = 全', eq(invertSet(all, []), all))
  ck('invertSet 全选 = 空', eq(invertSet(all, all), []))
  ck('unionSet 去重', eq(unionSet(['a', 'b'], ['b', 'c']), ['a', 'b', 'c']))
  ck('subtractSet', eq(subtractSet(['a', 'b', 'c'], ['b']), ['a', 'c']))
  ck('intersectSet', eq(intersectSet(['a', 'b', 'c'], ['b', 'c', 'x']), ['b', 'c']))
}

// ── 8. By-Name 谓词（子串 + *? 通配，大小写不敏感）────────────────────
{
  const items = [{ id: '1', name: 'Bolt M6' }, { id: '2', name: 'bolt m8' }, { id: '3', name: 'Nut' }, { id: '4', name: 'Washer-A' }]
  ck('by-name 子串不敏感', eq(matchByName(items, 'bolt'), ['1', '2']))
  ck('by-name 通配 *', eq(matchByName(items, 'bolt*'), ['1', '2']))
  ck('by-name 通配 ? 单字', eq(matchByName(items, 'nu?'), ['3']))
  ck('by-name 无匹配', eq(matchByName(items, 'gear'), []))
  ck('by-name 空 query = 空', eq(matchByName(items, ''), []))
  ck('by-name 通配全体', matchByName(items, '*').length === 4)
}

// ── 9. By-Size 谓词（包围盒体积阈值）──────────────────────────────────
{
  ck('sizeMatches >', sizeMatches(1500, '>', 1000) && !sizeMatches(500, '>', 1000))
  ck('sizeMatches <', sizeMatches(500, '<', 1000) && !sizeMatches(1500, '<', 1000))
  ck('sizeMatches >=', sizeMatches(1000, '>=', 1000))
  ck('sizeMatches <=', sizeMatches(1000, '<=', 1000))
  ck('sizeMatches ~ ±10%', sizeMatches(1050, '~', 1000) && sizeMatches(950, '~', 1000) && !sizeMatches(1200, '~', 1000))
  const items = [{ id: 'a', size: 800 }, { id: 'b', size: 1200 }, { id: 'c', size: 100 }]
  ck('matchBySize >1000', eq(matchBySize(items, '>', 1000), ['b']))
  ck('matchBySize <=800', eq(matchBySize(items, '<=', 800), ['a', 'c']))
}

// ── 10. Seed-and-Boundary 洪泛（图算法）──────────────────────────────
{
  // 链：a-b-c-d-e，b-c 之间系边界棱 → 从 a 洪泛只到 a,b
  const adj = { a: ['b'], b: ['a', 'c'], c: ['b', 'd'], d: ['c', 'e'], e: ['d'] }
  const boundary = (from, to) => (from === 'b' && to === 'c') || (from === 'c' && to === 'b')
  ck('seedExpand 遇边界停', eq(seedExpand(['a'], adj, boundary).sort(), ['a', 'b']))
  // 无边界 → 全连通
  ck('seedExpand 无边界全洪泛', eq(seedExpand(['a'], adj, () => false).sort(), ['a', 'b', 'c', 'd', 'e']))
  // 从另一侧种子
  ck('seedExpand 另侧', eq(seedExpand(['e'], adj, boundary).sort(), ['c', 'd', 'e']))
  ck('seedExpand 多种子跨界', eq(seedExpand(['a', 'e'], adj, boundary).sort(), ['a', 'b', 'c', 'd', 'e']))
}

// ── 11. chip 色板（owner 色优先，否则类型稳定 hash）───────────────────
{
  ck('chipSwatch owner 色优先', chipSwatchColor({ id: 'f1', type: 'extrude' }, '#123456') === '#123456')
  const c1 = chipSwatchColor({ id: 'f1', type: 'extrude' })
  const c2 = chipSwatchColor({ id: 'f2', type: 'extrude' })
  ck('chipSwatch 同类型同色', c1 === c2)
  const c3 = chipSwatchColor({ id: 'f3', type: 'fillet' })
  ck('chipSwatch 异类型（多数）异色', typeof c3 === 'string' && /^#/.test(c3))
  ck('chipSwatch ownerColor=null 走 hash', chipSwatchColor({ id: 'f1', type: 'extrude' }, null) === c1)
}

// ── 12. hideInactive 稳健回卷索引（隐藏 chip 不破坏 scrub）────────────
{
  // 4 chip 全可见，中心 10/30/50/70；cursor=55 → 越过 chip2(50) → idx=3
  const chips = [
    { fi: 0, center: 10, visible: true }, { fi: 1, center: 30, visible: true },
    { fi: 2, center: 50, visible: true }, { fi: 3, center: 70, visible: true },
  ]
  ck('scrub cursor=55 → idx3', computeScrubIndex(chips, 55) === 3)
  ck('scrub cursor=5（最左） → idx0', computeScrubIndex(chips, 5) === 0)
  ck('scrub cursor=999（最右） → idx4', computeScrubIndex(chips, 999) === 4)
  // 隐藏 chip1（fi=1）→ cursor 喺 chip0 与 chip2 之间(40) → 命中最右可见=chip0 → idx1（对齐 features 位置）
  const hid = chips.map((c) => c.fi === 1 ? { ...c, visible: false } : c)
  ck('scrub 隐藏 chip 仍对齐 features 位', computeScrubIndex(hid, 40) === 1)
  ck('scrub 隐藏 chip cursor 过 chip2 → idx3', computeScrubIndex(hid, 55) === 3)
}

// ── 13. ① 命令激活【覆盖】选择过滤器（真回归修：清空 types 后 pick 命令仍生效）─────
{
  // 活动实体 baseAllowed = selPicksBody(sf) && mode!=='sketch'；Viewport raycast = pickableWithCmdOverride(base, commandArmed)
  const base = (sf, mode) => selPicksBody(sf) && mode !== 'sketch'
  const cleared = migrateSelFilter({ types: [] })   // 清空 → 回落全类型？migrate 空 types 回落全选，故用真·无 body 的集
  ck('清空 types 迁移后回落全选（非默认清空）', cleared.types.length === SEL_TYPES.length)   // migrate 保护：空→全
  // 真正「关咗 body/face/edge」的场景：只剩 component
  const compOnly = migrateSelFilter({ types: ['component'] })
  ck('compOnly: selPicksBody=false', !selPicksBody(compOnly))
  // 无命令武装 → 活动实体唔可拣（锁住，符合过滤器）
  ck('① base=false + 无命令 → 唔可拣', pickableWithCmdOverride(base(compOnly, 'model'), false) === false)
  // 命令武装（commandArmed=true）→ 覆盖过滤器，活动实体可拣（回归修：孔/圆角/测量 onClick 重新触发）
  ck('① base=false + 命令武装 → 可拣（override）', pickableWithCmdOverride(base(compOnly, 'model'), true) === true)
  // 默认全类型 + 无命令 → 可拣（逐字节旧行为）
  ck('① 默认全类型 + 无命令 → 可拣', pickableWithCmdOverride(base(DEFAULT_SEL_FILTER, 'model'), false) === true)
  // 草图模式 base=false，但命令武装仍由 commandArmed 决定（Viewport 侧 bodyCmdArmed 已 gate mode!=='sketch'，此处只验纯函数覆盖语义）
  ck('① 草图模式 base=false', base(DEFAULT_SEL_FILTER, 'sketch') === false)
  ck('① override 幂等：真值任一即真', pickableWithCmdOverride(true, false) === true && pickableWithCmdOverride(true, true) === true)
}

// ── 14. ② 逐类型 gate（selAllowsType 真正被消费：面/边/组件/草图/顶点独立）─────
{
  const faceOnly = migrateSelFilter({ types: ['face'] })
  ck('②面-only：allow face 唔 allow edge', selAllowsType(faceOnly, 'face') && !selAllowsType(faceOnly, 'edge'))
  const edgeOnly = migrateSelFilter({ types: ['edge'] })
  ck('②边-only：allow edge 唔 allow face', selAllowsType(edgeOnly, 'edge') && !selAllowsType(edgeOnly, 'face'))
  const noComp = migrateSelFilter({ types: ['body', 'face', 'edge'] })   // 旧 'body' 语义：无 component
  ck('②关组件：普通选组件被 gate（early-return）', !selAllowsType(noComp, 'component'))
  const noSketch = migrateSelFilter({ types: ['component', 'body'] })
  ck('②草图 gate：sketch 关咗 → 唔 allow', !selAllowsType(noSketch, 'sketch'))
  const vtx = migrateSelFilter({ types: ['vertex'] })
  ck('②顶点独立：allow vertex 唔 allow face/edge', selAllowsType(vtx, 'vertex') && !selAllowsType(vtx, 'face') && !selAllowsType(vtx, 'edge'))
  // 默认全类型 → 全 allow（逐字节旧行为）
  ck('②默认全 allow', SEL_TYPES.every((t) => selAllowsType(DEFAULT_SEL_FILTER, t.key)))
}

// ── 15. ③ 穿透选择单击多选（resolvePickHits 消费 R3F intersections → compIds）────
{
  // 模拟 R3F e.intersections（按距离升序）；只有组件 mesh 带 userData.compId，其余（活动实体/overlay）冇。
  const inter = [
    { distance: 1, object: { userData: { compId: 'A' } } },
    { distance: 2, object: { userData: {} } },                 // 活动实体（无 compId）→ 过滤走
    { distance: 3, object: { userData: { compId: 'B' } } },
    { distance: 4, object: { userData: { compId: 'C' } } },
  ]
  const mapIds = (hits) => hits.map((h) => h.object?.userData?.compId).filter((id) => !!id)
  // 穿透开 → 全部命中 → 收 A,B,C（跳过无 compId）
  ck('③穿透单击收全部组件（含被遮挡）', eq(mapIds(resolvePickHits(inter, true)), ['A', 'B', 'C']))
  // 穿透关 → 仅最前（A）
  ck('③非穿透仅最前', eq(mapIds(resolvePickHits(inter, false)), ['A']))
  // 单一命中 → 唔当穿透多选（Viewport 侧 length>1 门；此处验解析结果）
  ck('③单命中解析=单元素', resolvePickHits([inter[0]], true).length === 1)
}

// ── 16. ④ Selection Priority 参与拾取 tie-break（inspectWantEdge）────────────
{
  // priority='face'（默认）→ wantEdge = alt（逐字节旧行为，唔理贴唔贴边）
  ck('④face优先：非Alt+贴边 → 选面', inspectWantEdge('face', false, true) === false)
  ck('④face优先：Alt → 选边（Alt 强制）', inspectWantEdge('face', true, false) === true)
  // priority='edge' → 贴边时偏好选边（tie-break 生效）
  ck('④edge优先：非Alt+贴边 → 选边', inspectWantEdge('edge', false, true) === true)
  ck('④edge优先：非Alt+面内（唔贴边）→ 选面（唔误当边）', inspectWantEdge('edge', false, false) === false)
  ck('④edge优先：Alt → 选边', inspectWantEdge('edge', true, false) === true)
  // priority='body' → 同 face（非边优先），wantEdge=alt
  ck('④body优先：非Alt+贴边 → 选面', inspectWantEdge('body', false, true) === false)
}

// ── 汇总 ──────────────────────────────────────────────────────────────
for (const [st, name, detail] of rows) console.log(`  ${st === 'PASS' ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`)
console.log(`\nWave X4 时间轴+选择：${pass} PASS / ${fail} FAIL（共 ${pass + fail}）`)
if (fail) process.exit(1)
