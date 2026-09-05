// R2 装配 occurrence/多体架构（P1+P2）纯逻辑核 —— 无 app 依赖，可 Node/tsx 直测。
//
// 核心 = 「镜像不变量」：components[] 保留做实例数组（键名/读形状不变），新增共享 componentDefs[]。
// 有 defId 嘅 occurrence 嘅 mesh/src 系 def 嘅【引用镜像】，由 reconcileComponents 维持
//   → 改一个 def（rev++）→ reconcile → 该 def 全部 occurrence 齐更新（edit-one-update-all）。
// 无 defId 嘅 occurrence（匿名单例/几何变异后独立化）唔受管 → 旧行为零改。
//
// 类型对 src 保持泛型 S（store 用 { features; sketchSources }），令本模块唔耦合 store。
// MeshData 用 type-only 引入（tsx/esbuild 会完全抹除 → 唔会加载 worker 运行时）。
import type { MeshData } from '../worker/cad.worker'

export type BodyEntry = { id: string; name: string; mesh: MeshData; hidden?: boolean; color?: string }  // P1=[单体]，P3 才多条
// Exact edge samples captured before a parametric body becomes a mesh occurrence.
// They stay separate from the render mesh: triangle edges are not CAD edges.
export type BrepEdge = { pts: [number, number, number][]; kind: string }
export type ComponentDef<S = unknown> = {
  id: string                 // 'D1'… 独立命名空间；旧档迁移合成 'D_<compId>'（匿名单例 def）
  name: string
  // Body 1 source is mirrored at definition level for old files.  Other
  // bodies keep their own source so a converted mesh body is not demoted back
  // to an anonymous display mesh merely because it is Body 2+.
  bodies: (BodyEntry & { src?: S })[]
  src?: S                    // 参数化来源（由 occurrence 上移）
  mesh: MeshData             // 派生缓存 = bodies[0].mesh（occurrence 镜像此值）
  rev: number                // 编辑 +1 → occurrence 据此重镜像
  edges?: BrepEdge[]         // true B-rep edge samples; absent for mesh-only imports
}

// A component occurrence is an assembly item; its definition may contain several
// independently visible solids.  Consumers that render/export/measure components
// must use this instead of silently reading occurrence.mesh (body[0] only).
export function visibleDefinitionBodies<C extends { id: string; name: string; mesh: MeshData; defId?: string }, S>(component: C, defs: readonly ComponentDef<S>[]): BodyEntry[] {
  const def = component.defId ? defs.find((d) => d.id === component.defId) : undefined
  const bodies = def?.bodies?.length ? def.bodies : [{ id: component.id + '_B1', name: component.name, mesh: component.mesh }]
  return bodies.filter((b) => !b.hidden && b.mesh?.vertices?.length && b.mesh?.triangles?.length)
}

// 新 def id：只数 'D<纯数字>'（合成匿名 def 'D_<compId>' 嘅 parseInt('_C1')=NaN 被跳过 → 唔撞）。
export function nextDefId(defs: readonly { id: string }[], offset = 0): string {
  const maxN = defs.reduce((m, d) => { const n = parseInt(String(d.id).replace(/^D/, ''), 10); return Number.isFinite(n) && n > m ? n : m }, 0)
  return 'D' + (maxN + 1 + offset)
}

// 镜像不变量维持点（单一真相）：对每个有 defId 嘅 occurrence，若 def.rev 前进（或镜像 ref 漂移）→ 重镜像 mesh/src。
// 无 defId 原样返 → 旧行为零改。所有 def 编辑后 + 载入后调一次。返回同一引用（未变）以保撤销/记忆稳定。
export function reconcileComponents<S, C extends { defId?: string; _rev?: number; mesh: MeshData; src?: S }>(comps: readonly C[], defs: readonly ComponentDef<S>[]): C[] {
  if (!defs.length) return comps as C[]
  const byId = new Map(defs.map((d) => [d.id, d]))
  let changed = false
  const out = comps.map((c) => {
    if (!c.defId) return c
    const d = byId.get(c.defId)
    if (!d) return c
    if (c._rev === d.rev && c.mesh === d.mesh) return c   // 已同步 → 唔郁
    changed = true
    return { ...c, mesh: d.mesh, src: d.src, _rev: d.rev } as C   // 重镜像 → 共享实例齐更新
  })
  return changed ? out : (comps as C[])
}

// 旧档字节兼容迁移：新档（有 componentDefs）→ 载 defs + reconcile；旧档（无）→ 每件内联 mesh 合成匿名 def「D_<i>_<compId>」，
// mesh/src 移入 def.bodies[0]/def.src，c.defId=该 def id。幂等：重跑得同一结果（def id 由稳定的位置索引确定、mesh 取自镜像）。
// def id 用【位置索引】而非 c.id → 严格 1:1，防两件同 id/缺 id 塌到同一 def 换 mesh（pre-R2 每件各持独立 mesh）。
// S 由 occurrence 嘅 src 推导（C['src']）—— dataDefs 系 unknown，唔可当推导源，故绑喺 comps 直接位置。
export function migrateComponentDefs<C extends { id: string; name: string; mesh: MeshData; src?: unknown; defId?: string; _rev?: number }>(dataDefs: unknown, comps: readonly C[]): { components: C[]; componentDefs: ComponentDef<C['src']>[] } {
  type S = C['src']
  if (Array.isArray(dataDefs) && dataDefs.length) {
    // 新档：载 defs + reconcile。序列化省略 bodies（= def.mesh 冗余）→ 载入时重建 bodies[0]（P1 单体）。
    const defs = (dataDefs as ComponentDef<S>[])
      .filter((d) => d && typeof d.id === 'string' && !!d.mesh)
      .map((d) => (Array.isArray(d.bodies) && d.bodies.length ? d : { ...d, bodies: [{ id: d.id + '_B1', name: d.name, mesh: d.mesh }] }))
    return { componentDefs: defs, components: reconcileComponents(comps, defs) }
  }
  // ⚠ 严格 1 def:1 occurrence —— def id 用【位置索引】(唔靠 c.id) 保证唯一：pre-R2 每件各持独立 mesh，
  // 若两个同 id（或缺 id）的旧组件塌到同一 def『D_'+c.id』→ 静默换 mesh / 丢几何。缺 id 的 component 也补唯一 id。
  const defs: ComponentDef<S>[] = []
  const seen = new Set<string>()
  const out = comps.map((c, i) => {
    if (!c.mesh) return c                                  // 防御：无 mesh 件唔合成 def（保持匿名）
    const cid = (typeof c.id === 'string' && c.id) ? c.id : ('anon' + i)   // 缺 id → 合成唯一 component id
    let did = 'D_' + i + '_' + cid                         // 位置索引前缀 → N 个旧组件 → N 个不同 def（i 唯一保证唯一）
    while (seen.has(did)) did += '_'                        // 极端兜底（index 已保证唯一，此为防御）
    seen.add(did)
    const cc = c.id === cid ? c : ({ ...c, id: cid } as C)  // 补 id 落 occurrence（body id 亦引用之）
    defs.push({ id: did, name: cc.name, bodies: [{ id: cid + '_B1', name: cc.name, mesh: cc.mesh }], mesh: cc.mesh, rev: 0, ...(cc.src !== undefined ? { src: cc.src as S } : {}) })
    return { ...cc, defId: did, _rev: 0 } as C
  })
  return { components: out, componentDefs: defs }
}

// 建 def + 1 occurrence（newComponent/imports 走呢度）；镜像不变量：occ.mesh===def.mesh、occ.src===def.src。
export function makeDefOcc<S = undefined>(
  defs: readonly { id: string }[], occId: string, name: string, mesh: MeshData, pos: [number, number, number],
  extra?: { color?: string; src?: S; defIdOffset?: number },
): { def: ComponentDef<S>; occ: { id: string; name: string; mesh: MeshData; pos: [number, number, number]; defId: string; _rev: number; color?: string; src?: S } } {
  const did = nextDefId(defs, extra?.defIdOffset ?? 0)
  const src = extra?.src
  const def: ComponentDef<S> = { id: did, name, bodies: [{ id: did + '_B1', name, mesh }], mesh, rev: 0, ...(src !== undefined ? { src } : {}) }   // body id 用 did（唔用 occId）→ 存档往返幂等：loader 重建 body 亦 did+'_B1'（否则 C1_B1→D1_B1 改名）
  const occ = { id: occId, name, mesh, pos, defId: did, _rev: 0, ...(extra?.color ? { color: extra.color } : {}), ...(src !== undefined ? { src } : {}) }
  return { def, occ }
}

// R2 data-safety：只保留仍被某 occurrence 引用嘅 def（回收孤儿）。deleteComponent / detach 后无引用嘅共享定义
// 仍带完整 mesh —— 若原样序列化会撑爆 localStorage 配额触发静默丢档；入 undo 快照亦令栈膨胀。纯函数、tsx 可测。
export function referencedDefs<D extends { id: string }>(components: readonly { defId?: string }[], defs: readonly D[]): D[] {
  if (!defs.length) return defs as D[]
  const used = new Set(components.map((c) => c.defId).filter(Boolean) as string[])
  return defs.filter((d) => used.has(d.id))
}

// R2 data-safety 存档 payload 剪枝（单一真相，纯函数）：
//  (b) keptDefs = 只留被引用嘅 def（孤儿唔落盘）；
//  (a) serComponents = 剥 def-linked occurrence 嘅 mesh（其 def 会带 mesh 落盘者 → mesh 置 undefined，JSON 略去）。
//      载入时 migrateComponentDefs→reconcile 会由 def.mesh 重建 occ.mesh（occ.mesh=undefined ≠ def.mesh → 必重镜像）→ 零几何丢失。
//      匿名件 / 已 detach 件（无 defId）或指向缺 mesh def 者 → 原样保留 mesh（唔剥，防丢几何）。
export function prunedDefsForPayload<C extends { defId?: string; mesh: MeshData }, D extends { id: string; mesh: MeshData }>(
  components: readonly C[], defs: readonly D[],
): { serComponents: C[]; keptDefs: D[] } {
  const keptDefs = referencedDefs(components, defs)
  const keptWithMesh = new Set(keptDefs.filter((d) => !!d.mesh).map((d) => d.id))
  const serComponents = components.map((c) => (c.defId && keptWithMesh.has(c.defId) ? ({ ...c, mesh: undefined } as unknown as C) : c))   // mesh:undefined 仅供序列化（载入 reconcile 重建）；cast 保 store 端类型简洁
  return { serComponents, keptDefs }
}

// 深拷一个共享定义成新 defId（独立化 / Paste-New 用）。mesh 视作不可变（几何 op 产生新对象，从不原地改）→ 共享 ref 安全。
export function cloneDef<S>(defs: readonly { id: string }[], src: ComponentDef<S>): ComponentDef<S> {
  const did = nextDefId(defs)
  return { ...src, id: did, bodies: src.bodies.map((b) => ({ ...b })), rev: 0 }
}

// 写回定义（finishComponentEdit 用）：rev++、mesh/src 换新、bodies[0] 同步。返回新 def；调用方随后 reconcile 全实例。
export function writeDefFromEdit<S>(def: ComponentDef<S>, mesh: MeshData, src: S, bodyId: string): ComponentDef<S> {
  const before = def.bodies.length ? def.bodies : [{ id: bodyId, name: def.name, mesh: def.mesh }]
  const found = before.some((b) => b.id === bodyId)
  // Older saved/UI callers used occurrence ids (for example C1_B1) while modern
  // definitions use D1_B1.  A one-body definition has an unambiguous safe target;
  // accept that legacy spelling instead of silently appending a second solid.
  // In a multi-body definition an unknown id is unsafe, so leave geometry intact.
  if (!found && before.length > 1) return def
  const targetId = found ? bodyId : before[0].id
  const bodies: (BodyEntry & { src?: S })[] = before.map((b) => b.id === targetId ? { ...b, mesh, src } : b)
  // Occurrence.mesh is the backward-compatible mirror of Body 1 only.  Editing Body 2+
  // must never replace that mirror or any sibling body.
  // `def.src` is the legacy Body 1 mirror.  Editing/converting Body 2+ must
  // leave that mirror intact while retaining its own per-body feature source.
  return { ...def, mesh: bodies[0].mesh, ...(targetId === bodies[0].id ? { src } : {}), bodies, rev: def.rev + 1 }
}

// Mesh-only commands (repair/simplify/smooth/scale) do not have a new parametric
// source.  Replace exactly one body while retaining source metadata and siblings.
export function writeDefBodyMesh<S>(def: ComponentDef<S>, bodyId: string, mesh: MeshData): ComponentDef<S> {
  const before = def.bodies.length ? def.bodies : [{ id: bodyId, name: def.name, mesh: def.mesh }]
  if (!before.some((b) => b.id === bodyId)) return def
  const bodies = before.map((b) => b.id === bodyId ? { ...b, mesh } : b)
  return { ...def, mesh: bodies[0].mesh, bodies, rev: def.rev + 1 }
}

// A placed occurrence can be edited in a shared CAD/world frame (for example a
// mesh plane cut), but definition bodies are always stored in their own local
// CAD frame.  Keep this conversion here as a small, testable primitive.  The
// matrix uses Three.js' column-major layout and must be rigid; normals are
// therefore transformed as directions and re-normalised.
export function transformBodyMeshByMatrix(mesh: MeshData, e: ArrayLike<number>): MeshData {
  if (e.length < 16) throw new Error('Body mesh transform requires a 4×4 matrix')
  const vertices = new Array<number>(mesh.vertices.length)
  for (let i = 0; i < mesh.vertices.length; i += 3) {
    const x = mesh.vertices[i], y = mesh.vertices[i + 1], z = mesh.vertices[i + 2]
    vertices[i] = e[0] * x + e[4] * y + e[8] * z + e[12]
    vertices[i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13]
    vertices[i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14]
  }
  const normals = new Array<number>(mesh.normals.length)
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const x = mesh.normals[i], y = mesh.normals[i + 1], z = mesh.normals[i + 2]
    const nx = e[0] * x + e[4] * y + e[8] * z
    const ny = e[1] * x + e[5] * y + e[9] * z
    const nz = e[2] * x + e[6] * y + e[10] * z
    const l = Math.hypot(nx, ny, nz) || 1
    normals[i] = nx / l; normals[i + 1] = ny / l; normals[i + 2] = nz / l
  }
  return { ...mesh, vertices, normals }
}
