// 网格运算 worker 客户端（roadmap #8）— 懒创建独立 worker（首次运行先开），失败直接报错唔静默。
// 结构同 feaClient.ts / moldClient.ts 一致：comlink wrap 单例 + new Worker(new URL(...))。
//
// 同 fea/mold 客户端唯一分别：呢啲网格算法本身唔报进度（无 onProgress），所以呢度无 progress
// proxy —— 唔加假进度。包装函数签名同原算法对齐（io/meshRepair 嘅 repairMesh/simplifyMesh/
// qemSimplify/isotropicRemesh），所以 store 接线只需将「同步调用」改成「await runXxxInWorker」。
//
// 传输：大网格（vertices/triangles）转成 typed array（Float32Array / Uint32Array）并经 comlink
// transfer 标注 buffer → 过 worker 边界零拷贝（structured-clone 唔会复制成份巨大嘅平数组）。
// 原算法收 ArrayLike<number>，同 typed array 完全相容；输出照 structured-clone 返回，
// 保持 RepairResult / SimplifyResult / RemeshResult / 裸 {vertices,triangles,normals} 嘅完整形状。
import { wrap, transfer, type Remote } from 'comlink'
import type { RepairResult, SimplifyResult, RemeshResult } from '../io/meshRepair'
import type { MeshData } from '../worker/cad.worker'

type RawMesh = { vertices: number[]; triangles: number[]; normals: number[] }

type MeshAPI = {
  parseStl(buf: ArrayBuffer): MeshData
  parseObj(text: string): MeshData
  parse3mf(buf: ArrayBuffer): { meshes: { name: string; vertices: number[]; triangles: number[]; color?: string }[]; unit: string }
  repair(vertices: ArrayLike<number>, triangles: ArrayLike<number>): RepairResult
  simplify(vertices: ArrayLike<number>, triangles: ArrayLike<number>, targetRatio: number): SimplifyResult
  qem(vertices: ArrayLike<number>, triangles: ArrayLike<number>, targetRatio: number): RawMesh
  remesh(vertices: ArrayLike<number>, triangles: ArrayLike<number>, targetLen: number, iters?: number): RemeshResult
}

let api: Remote<MeshAPI> | null = null

function ensureApi(): Remote<MeshAPI> {
  if (!api) {
    const w = new Worker(new URL('../worker/mesh.worker.ts', import.meta.url), { type: 'module', name: 'mesh' })
    api = wrap<MeshAPI>(w)
  }
  return api
}

// 将平数组拷一次入 typed array（呢次拷贝喺主线程，但之后过 worker 边界零拷贝）。
// 顶点用 Float32Array（坐标），三角形索引用 Uint32Array（整数索引）。
// S110：永远拷一份 —— 即使输入已经系 typed array 都唔可以直接返回，因为之后 transfer(v,[v.buffer]) 会
// detach 调用方持有嘅 buffer（令调用方原 mesh 变空）。.slice() 拷副本，transfer 嘅系副本，原 buffer 安全。
function asF32(a: ArrayLike<number>): Float32Array {
  return a instanceof Float32Array ? a.slice() : Float32Array.from(a as ArrayLike<number>)
}
function asU32(a: ArrayLike<number>): Uint32Array {
  return a instanceof Uint32Array ? a.slice() : Uint32Array.from(a as ArrayLike<number>)
}

/** Parse STL away from the UI thread. `buf` is transferred, so callers must not reuse it afterwards. */
export async function parseStlInWorker(buf: ArrayBuffer): Promise<MeshData> {
  return ensureApi().parseStl(transfer(buf, [buf]))
}

export async function parseObjInWorker(text: string): Promise<MeshData> {
  return ensureApi().parseObj(text)
}

export async function parse3mfInWorker(buf: ArrayBuffer): Promise<{ meshes: { name: string; vertices: number[]; triangles: number[]; color?: string }[]; unit: string }> {
  return ensureApi().parse3mf(transfer(buf, [buf]))
}

/** 补洞修复（io/meshRepair.repairMesh）喺 worker 跑。输入 transfer 减拷贝，返回 RepairResult。 */
export async function runRepairInWorker(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
): Promise<RepairResult> {
  const v = asF32(vertices), t = asU32(triangles)
  return ensureApi().repair(transfer(v, [v.buffer]), transfer(t, [t.buffer]))
}

/** 快速简化（顶点聚类，io/meshRepair.simplifyMesh）喺 worker 跑。targetRatio = 目标三角形比例。 */
export async function runSimplifyInWorker(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  targetRatio: number,
): Promise<SimplifyResult> {
  const v = asF32(vertices), t = asU32(triangles)
  return ensureApi().simplify(transfer(v, [v.buffer]), transfer(t, [t.buffer]), targetRatio)
}

/** QEM 减面（io/meshRepair.qemSimplify）喺 worker 跑。返回裸 {vertices,triangles,normals}。 */
export async function runQemInWorker(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  targetRatio: number,
): Promise<RawMesh> {
  const v = asF32(vertices), t = asU32(triangles)
  return ensureApi().qem(transfer(v, [v.buffer]), transfer(t, [t.buffer]), targetRatio)
}

/** 各向同性重网格（io/meshRepair.isotropicRemesh）喺 worker 跑。targetLen = 目标边长；iters 默认 5。 */
export async function runRemeshInWorker(
  vertices: ArrayLike<number>,
  triangles: ArrayLike<number>,
  targetLen: number,
  iters = 5,
): Promise<RemeshResult> {
  const v = asF32(vertices), t = asU32(triangles)
  return ensureApi().remesh(transfer(v, [v.buffer]), transfer(t, [t.buffer]), targetLen, iters)
}
