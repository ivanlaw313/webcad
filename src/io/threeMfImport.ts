import { unzipSync, strFromU8 } from 'fflate'
import { XMLParser, XMLValidator } from 'fast-xml-parser'

// 3MF 导入 — MakerWorld / Printables / Thingiverse 下载嘅主流 3D 打印格式（之前只出唔入）。
// 3MF = OPC ZIP 包，几何喺 3D/3dmodel.model（XML）。ZIP 用 fflate（MIT，license-safe）解，
// XML 用浏览器 DOMParser。3MF 同我哋 CAD 约定一样系 Z-up，所以顶点直入 MeshData（按单位换算成 mm）。
// 支持：多 object + <build><item transform>、<components> 组合（递归、防循环）、
// basematerials / m:colorgroup 颜色、6 种规范单位换算。

export type ThreeMFMesh = { name: string; vertices: number[]; triangles: number[]; color?: string }

// A 3MF is a ZIP container. Its compressed size is not a memory bound: a tiny
// archive can expand enormously before XML parsing starts. Keep this in the
// parser because worker and future drop/clipboard paths bypass file pickers.
export const THREE_MF_MAX_UNCOMPRESSED_BYTES = 128 * 1024 * 1024
export const THREE_MF_MAX_ENTRIES = 2048
export const THREE_MF_MAX_TRIANGLES = 2_000_000

// 规范允许嘅 6 种单位 → mm 比例（millimeter 系默认）
const UNIT_MM: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 }

const fail = (reason: string): never => { throw new Error(`呢个 3MF 文件解析唔到（${reason}）`) }

// 3MF transform = 12 个数 "m00 m01 m02 m10 m11 m12 m20 m21 m22 m30 m31 m32"（行向量约定 [x y z 1]·M，
// 最尾 3 个 m30 m31 m32 系平移）。即 x' = m00·x + m10·y + m20·z + m30 — 同 three.js 列优先唔同，唔好搞混。
function parseTransform(s: string | null): number[] | null {
  if (!s) return null
  const n = s.trim().split(/\s+/).map(Number)
  return n.length === 12 && n.every(Number.isFinite) ? n : null
}
const IDENT = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
// 复合变换：先施加 c 再施加 p（row-vector：v·C·P）。返回新 12 元数组。
function mulT(c: number[], p: number[]): number[] {
  const o = new Array<number>(12)
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 3; k++)
      o[r * 3 + k] = c[r * 3] * p[k] + c[r * 3 + 1] * p[3 + k] + c[r * 3 + 2] * p[6 + k] + (r === 3 ? p[9 + k] : 0)
  return o
}

// displaycolor 形如 #RRGGBB 或 #RRGGBBAA（sRGB+alpha）→ 标准化做 #rrggbb；唔识嘅返回 undefined
function normColor(s: string | null): string | undefined {
  if (!s) return undefined
  const m = s.trim().match(/^#?([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?$/)
  return m ? '#' + m[1].toLowerCase() : undefined
}

type Obj = {
  name?: string
  pid?: string | null
  pindex?: string | null
  mesh?: { v: number[]; t: number[]; triPid?: string | null; triP1?: string | null }
  comps?: { id: string; m: number[] | null; pid?: string | null; pindex?: string | null }[]
}

// `DOMParser` is not consistently available inside a module Worker.  3MF
// parsing runs in mesh.worker specifically to keep large archives off the UI
// thread, so adapt a small worker-safe XML tree rather than falling back to
// parsing on the main thread.  The adapter intentionally implements only the
// two DOM reads used below: attributes and descendant tag lookup.
type XmlElement = {
  tag: string
  attrs: Record<string, string>
  children: XmlElement[]
  getAttribute: (name: string) => string | null
  getElementsByTagName: (tag: string) => XmlElement[]
}
type XmlDocument = { getElementsByTagName: (tag: string) => XmlElement[] }

function xmlElement(tag: string, value: unknown): XmlElement {
  const obj = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const attrs: Record<string, string> = {}
  const children: XmlElement[] = []
  for (const [key, child] of Object.entries(obj)) {
    if (key.startsWith('@_')) { attrs[key.slice(2)] = String(child); continue }
    if (key === '#text' || key === '?xml') continue
    for (const item of Array.isArray(child) ? child : [child]) children.push(xmlElement(key, item))
  }
  const find = (want: string, includeSelf: boolean) => {
    const out: XmlElement[] = []
    const visit = (node: XmlElement, self: boolean) => {
      if ((self || includeSelf) && node.tag === want) out.push(node)
      for (const child of node.children) visit(child, true)
    }
    if (includeSelf) visit(el, true)
    else for (const child of children) visit(child, true)
    return out
  }
  const el: XmlElement = {
    tag, attrs, children,
    getAttribute: (name) => attrs[name] ?? null,
    getElementsByTagName: (want) => find(want, false),
  }
  return el
}

function parseXmlDocument(xml: string): XmlDocument {
  // Retain native DOM parsing when it is present (browser main-thread tools and
  // the Node test harness).  Workers do not reliably expose DOMParser, which
  // is why the portable parser below is the required fallback rather than an
  // optional convenience.
  const NativeDOMParser = (globalThis as unknown as {
    DOMParser?: new () => { parseFromString: (source: string, mimeType: string) => XmlDocument }
  }).DOMParser
  if (typeof NativeDOMParser === 'function') {
    const nativeDocument = new NativeDOMParser().parseFromString(xml, 'application/xml')
    if (nativeDocument.getElementsByTagName('parsererror').length) throw new Error('invalid XML')
    return nativeDocument
  }
  if (XMLValidator.validate(xml) !== true) throw new Error('invalid XML')
  const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: false, parseAttributeValue: false, removeNSPrefix: false, trimValues: true }).parse(xml) as Record<string, unknown>
  const rootKey = Object.keys(parsed).find((key) => key !== '?xml')
  if (!rootKey) throw new Error('missing XML root')
  const root = xmlElement(rootKey, parsed[rootKey])
  return { getElementsByTagName: (tag) => tag === root.tag ? [root] : root.getElementsByTagName(tag) }
}

export function parse3MF(buf: ArrayBuffer): { meshes: ThreeMFMesh[]; unit: string } {
  // ── 1. 解 ZIP ──
  let entries: Record<string, Uint8Array>
  try { entries = unzipSync(new Uint8Array(buf)) } catch { return fail('唔係有效嘅 ZIP 压缩包') }
  const names = Object.keys(entries)
  const unpackedBytes = names.reduce((total, name) => total + entries[name].byteLength, 0)
  if (names.length > THREE_MF_MAX_ENTRIES) return fail(`ZIP has too many entries (limit ${THREE_MF_MAX_ENTRIES})`)
  if (!Number.isSafeInteger(unpackedBytes) || unpackedBytes > THREE_MF_MAX_UNCOMPRESSED_BYTES)
    return fail(`3MF expands beyond the ${(THREE_MF_MAX_UNCOMPRESSED_BYTES / 1048576).toFixed(0)}MB safety limit`)

  // ── 2. 揾 .model 入口：正路跟 _rels/.rels 嘅 Relationship Target；揾唔到就直接搵 *.model（兼容唔规范嘅包）──
  let modelXml = ''
  const relsName = names.find((n) => n.toLowerCase() === '_rels/.rels')
  if (relsName) {
    const m = strFromU8(entries[relsName]).match(/Target="\/?([^"]+\.model)"/i)
    if (m) { const k = names.find((n) => n.replace(/^\//, '') === m[1]); if (k) modelXml = strFromU8(entries[k]) }
  }
  if (!modelXml) {
    const k = names.find((n) => /\.model$/i.test(n))
    if (!k) return fail('搵唔到 3D/3dmodel.model 模型文件')
    modelXml = strFromU8(entries[k])
  }

  // ── 3. 解 XML ──
  let doc: XmlDocument
  try { doc = parseXmlDocument(modelXml) } catch { return fail('模型 XML 格式有错') }
  const model = doc.getElementsByTagName('model')[0]
  if (!model) return fail('XML 入面冇 <model> 根节点')
  // Bambu Studio commonly stores tessellation in 3D/Objects/*.model and leaves
  // the root model with only component p:path references.  Collect those model
  // resources too, or such a project would import as an empty model.
  const objectModels: XmlElement[] = [model]
  for (const name of names) {
    if (!/^3d\/objects\/[^/]+\.model$/i.test(name)) continue
    try {
      const sub = parseXmlDocument(strFromU8(entries[name]))
      const subModel = sub.getElementsByTagName('model')[0]
      if (subModel) objectModels.push(subModel)
    } catch { /* malformed optional object resource is ignored */ }
  }
  const unit = model.getAttribute('unit') || 'millimeter'
  const scale = UNIT_MM[unit] ?? 1 // 未知单位当 mm（诚实兜底，规范以外唔会出现）

  // ── 4. 颜色组：basematerials（核心规范）+ colorgroup（materials 扩展，切片软件出嘅档常见）──
  const colorGroups = new Map<string, (string | undefined)[]>()
  const collectColors = (groupTag: string, baseTag: string, attr: string) => {
    for (const objectModel of objectModels) {
    const gs = objectModel.getElementsByTagName(groupTag)
    for (let i = 0; i < gs.length; i++) {
      const id = gs[i].getAttribute('id')
      if (!id) continue
      const bases = gs[i].getElementsByTagName(baseTag)
      const colors: (string | undefined)[] = []
      for (let j = 0; j < bases.length; j++) colors.push(normColor(bases[j].getAttribute(attr)))
      colorGroups.set(id, colors)
    }
    }
  }
  collectColors('basematerials', 'base', 'displaycolor')
  collectColors('m:colorgroup', 'm:color', 'color')
  collectColors('colorgroup', 'color', 'color')

  // ── 5. 收集 object（mesh 或 components）──
  const objs = new Map<string, Obj>()
  const objEls = objectModels.flatMap((objectModel) => Array.from(objectModel.getElementsByTagName('object')))
  let triangleCount = 0
  for (let i = 0; i < objEls.length; i++) {
    const el = objEls[i]
    const id = el.getAttribute('id')
    if (!id) continue
    const ty = el.getAttribute('type')
    if (ty && ty !== 'model' && ty !== 'solidsupport') continue // support/other 唔属于零件几何
    const o: Obj = { name: el.getAttribute('name') || undefined, pid: el.getAttribute('pid'), pindex: el.getAttribute('pindex') }
    const vEls = el.getElementsByTagName('vertex')
    const tEls = el.getElementsByTagName('triangle')
    if (tEls.length) {
      triangleCount += tEls.length
      if (triangleCount > THREE_MF_MAX_TRIANGLES)
        return fail(`3MF has more than ${THREE_MF_MAX_TRIANGLES.toLocaleString()} triangles; simplify it externally first`)
      const v: number[] = []
      const t: number[] = []
      for (let j = 0; j < vEls.length; j++) {
        // Number(null) is zero. Require all coordinate attributes instead of
        // silently bending a malformed 3MF model toward the origin.
        const sx = vEls[j].getAttribute('x'), sy = vEls[j].getAttribute('y'), sz = vEls[j].getAttribute('z')
        const x = sx == null ? NaN : Number(sx), y = sy == null ? NaN : Number(sy), z = sz == null ? NaN : Number(sz)
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return fail('顶点坐标唔係有效数字')
        v.push(x, y, z)
      }
      const nv = v.length / 3
      for (let j = 0; j < tEls.length; j++) {
        // Do not let missing v1/v2/v3 become index 0 through Number(null).
        const sa = tEls[j].getAttribute('v1'), sb = tEls[j].getAttribute('v2'), sc = tEls[j].getAttribute('v3')
        const a = sa == null ? NaN : Number(sa), b = sb == null ? NaN : Number(sb), c = sc == null ? NaN : Number(sc)
        if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(c) || a < 0 || b < 0 || c < 0 || a >= nv || b >= nv || c >= nv)
          return fail('三角形索引超出顶点范围')
        t.push(a, b, c)
      }
      // 逐三角颜色我哋唔支持（MeshData 系单色）——取第一个三角嘅 pid/p1 做整体色兜底
      o.mesh = { v, t, triPid: tEls[0].getAttribute('pid'), triP1: tEls[0].getAttribute('p1') }
    }
    const cEls = el.getElementsByTagName('component')
    if (cEls.length) {
      o.comps = []
      for (let j = 0; j < cEls.length; j++) {
        const cid = cEls[j].getAttribute('objectid')
        if (cid) o.comps.push({ id: cid, m: parseTransform(cEls[j].getAttribute('transform')), pid: cEls[j].getAttribute('pid'), pindex: cEls[j].getAttribute('pindex') })
      }
    }
    objs.set(id, o)
  }

  // object 颜色：object 级 pid/pindex 优先，其次第一个三角嘅 pid/p1
  const colorFrom = (pid?: string | null, pindex?: string | null): string | undefined => {
    if (!pid) return undefined
    const grp = colorGroups.get(pid)
    if (!grp) return undefined
    const idx = Number(pindex ?? 0)
    return grp[Number.isInteger(idx) && idx >= 0 ? idx : 0] ?? grp[0]
  }
  // 3MF properties inherit down the object/component tree.  A triangle is the
  // most specific property, then its object default; a component/build property
  // deliberately overrides that inherited default for the referenced instance.
  const objColor = (o: Obj): string | undefined => colorFrom(o.mesh?.triPid, o.mesh?.triP1) ?? colorFrom(o.pid, o.pindex)

  // ── 6. 摊平：build item → object（mesh 直接出；components 递归落去，变换累乘，防循环）──
  const out: ThreeMFMesh[] = []
  const emit = (id: string, m: number[], depth: number, path: Set<string>, nameHint?: string, colorHint?: string) => {
    if (depth > 8 || path.has(id)) return // 防循环引用 / 病态深嵌套
    const o = objs.get(id)
    if (!o) return // p:path 跨文件引用（production 扩展）或者无效 id：诚实跳过
    const name = o.name || nameHint
    const color = colorHint ?? objColor(o)
    if (o.mesh) {
      const v = o.mesh.v
      const tv = new Array<number>(v.length)
      for (let i = 0; i < v.length; i += 3) {
        const x = v[i], y = v[i + 1], z = v[i + 2]
        tv[i] = (m[0] * x + m[3] * y + m[6] * z + m[9]) * scale
        tv[i + 1] = (m[1] * x + m[4] * y + m[7] * z + m[10]) * scale
        tv[i + 2] = (m[2] * x + m[5] * y + m[8] * z + m[11]) * scale
      }
      out.push({ name: name || `零件${id}`, vertices: tv, triangles: o.mesh.t.slice(), color })
    }
    if (o.comps) {
      const next = new Set(path).add(id)
      for (const c of o.comps) emit(c.id, c.m ? mulT(c.m, m) : m, depth + 1, next, name, colorFrom(c.pid, c.pindex) ?? color)
    }
  }
  const items = model.getElementsByTagName('item') // <item> 净喺 <build> 入面出现
  if (items.length) {
    for (let i = 0; i < items.length; i++) {
      const id = items[i].getAttribute('objectid')
      if (id) emit(
        id,
        parseTransform(items[i].getAttribute('transform')) || IDENT,
        0,
        new Set(),
        undefined,
        colorFrom(items[i].getAttribute('pid'), items[i].getAttribute('pindex')),
      )
    }
  } else {
    // 冇 <build>（唔规范但有啲工具会出）：每个有 mesh 嘅 object 原位出
    const children = new Set<string>()
    for (const o of objs.values()) for (const c of o.comps ?? []) children.add(c.id)
    for (const id of objs.keys()) if (!children.has(id)) emit(id, IDENT, 0, new Set())
  }
  if (!out.length) return fail('入面冇任何网格几何')
  return { meshes: out, unit }
}
