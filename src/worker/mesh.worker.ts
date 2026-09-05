/// <reference lib="webworker" />
// 网格运算专用 worker（roadmap #8）— 把重型纯 JS 网格算法搬离主线程，消除 UI 卡顿。
// 同 OCCT 内核 worker（cad.worker.ts）、FEA worker（fea.worker.ts）分开：呢啲算法
// （QEM 边塌缩、Botsch-Kobbelt 重网格、补洞）对大网格可跑几秒，唔可以阻住渲染 / 交互。
//
// 搬入嘅函数全部嚟自 ../io/meshRepair —— 该模块开头明码：「零 import，纯 TypeScript，
// 自包含」，无 OCCT 内核（_oc）依赖、无主线程 manifold-wasm 实例依赖 → 可纯搬 worker。
// 呢啲函数本身唔报进度（无 onProgress 参数），所以呢度唔做 progress proxy（唔作假进度）。
//
// 输入网格（vertices/triangles）经 comlink 由主线程传入：meshClient 会将佢哋转成
// typed array 并用 transfer 标注 buffer 减拷贝。原算法签名收 ArrayLike<number>，
// 同 Float32Array / Uint32Array 完全相容，所以 worker 这边直接转交即可。
import { expose } from 'comlink'
import {
  repairMesh,
  simplifyMesh,
  qemSimplify,
  isotropicRemesh,
  type RepairResult,
  type SimplifyResult,
  type RemeshResult,
} from '../io/meshRepair'
import { parseSTL } from '../io/stl'
import { parseOBJ } from '../io/obj'
import { parse3MF } from '../io/threeMfImport'

const api = {
  // STL parsing is linear and can take seconds for scans. Keep it out of the UI thread;
  // the input buffer is transferred by meshClient so it is not duplicated before parsing.
  parseStl(buf: ArrayBuffer) {
    return parseSTL(buf)
  },
  parseObj(text: string) {
    return parseOBJ(text)
  },
  parse3mf(buf: ArrayBuffer) {
    return parse3MF(buf)
  },
  // 补洞修复（焊接 → 搵闭合边界环 → 耳切补片，环 ≤64 边）。返回 RepairResult（含 mesh + 统计 + warnings）。
  repair(vertices: ArrayLike<number>, triangles: ArrayLike<number>): RepairResult {
    return repairMesh(vertices, triangles)
  },
  // 快速简化（顶点聚类近似法）。targetRatio = 目标三角形比例。返回 SimplifyResult。
  simplify(vertices: ArrayLike<number>, triangles: ArrayLike<number>, targetRatio: number): SimplifyResult {
    return simplifyMesh(vertices, triangles, targetRatio)
  },
  // QEM 减面（Garland-Heckbert 二次误差 + 边塌缩 + 翻面/流形守卫，保特征保水密）。
  // 返回裸 { vertices, triangles, normals }（同原函数一致，无 mesh 包装）。
  qem(
    vertices: ArrayLike<number>,
    triangles: ArrayLike<number>,
    targetRatio: number,
  ): { vertices: number[]; triangles: number[]; normals: number[] } {
    return qemSimplify(vertices, triangles, targetRatio)
  },
  // 各向同性重网格（Botsch-Kobbelt：split/collapse/flip/tangent-relax + 原面重投影保形）。
  // targetLen = 目标边长；iters = 迭代轮数（默认 5，同原函数）。返回 RemeshResult。
  remesh(
    vertices: ArrayLike<number>,
    triangles: ArrayLike<number>,
    targetLen: number,
    iters = 5,
  ): RemeshResult {
    return isotropicRemesh(vertices, triangles, targetLen, iters)
  },
}

export type MeshWorkerAPI = typeof api
expose(api)
