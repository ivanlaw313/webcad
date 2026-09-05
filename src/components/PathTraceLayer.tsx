// In-canvas GPU path tracing (Fusion "In-canvas Render") via three-gpu-pathtracer.
// 挂喺 <Canvas> 内（同 EnvLight 一齐）。开 rtMode → 用 WebGLPathTracer 接管渲染，
// 逐帧 renderSample() 累积采样直到 rtSamples；相机郁动用 updateCamera()（重置采样、唔重建 BVH）。
// 注意：本组件假设 store 已加 rtMode/rtSamples/rtProgress 三个字段（另外接线，tsc 会暂时报错 = 预期内）。
import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { WebGLPathTracer, GradientEquirectTexture } from 'three-gpu-pathtracer'
import { useApp } from '../store'

// 触发器：超过呢个三角形数就唔启动 path tracer（BVH 建构 + 每帧采样会卡死）。
const MAX_TRIS = 500_000

// 计场景三角形总数（只数会被追踪嘅可见 mesh）。
function countTriangles(scene: { traverse: (cb: (o: any) => void) => void }): number {
  let tris = 0
  scene.traverse((o: any) => {
    if (o.isMesh && o.visible && o.geometry) {
      const g = o.geometry
      if (g.index) tris += g.index.count / 3
      else if (g.attributes?.position) tris += g.attributes.position.count / 3
    }
  })
  return tris
}

// WebGLPathTracer 只食 Mesh/InstancedMesh + MeshStandardMaterial/MeshPhysicalMaterial。
// 任何其他可渲染对象（Line/LineSegments=Edges、drei Line2、Points、Sprite、Helper/grid，
// 或材质非 standard/physical 嘅 mesh，或叠加层 meshBasic/depthTest:false/renderOrder≥5）
// 都会令 setScene 嘅 MaterialsTexture.updateFrom 读到非 PBR 材质而崩（Cannot read 'r'）→ 一律临时隐藏。
function shouldHideFromTracer(o: any): boolean {
  if (o.isLine || o.isLineSegments || o.isLine2 || o.isLineSegments2 || o.isPoints || o.isSprite) return true
  if (typeof o.type === 'string' && /Helper/i.test(o.type)) return true  // gridHelper / axesHelper 等
  if (o.isMesh || o.isInstancedMesh) {
    if (typeof o.renderOrder === 'number' && o.renderOrder >= 5) return true
    const mats = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of mats) {
      if (!m) return true
      if (!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial)) return true  // basic/lambert/shader/line… → 追踪器唔识，隐藏
      if (m.depthTest === false) return true
    }
    return false  // 干净 PBR 实体 → 保留，俾追踪器追
  }
  return false  // group / 灯光 / 相机 等非可渲染对象 → 唔郁
}

export function PathTraceLayer() {
  const on = useApp((s) => s.rtMode)
  const maxS = useApp((s) => s.rtSamples)
  const hdriPreset = useApp((s) => s.hdriPreset)  // S110：HDRI 源变即重 setScene（否则光追停喺旧 env，同视口脱节）
  const { gl, scene, camera, controls } = useThree() as any
  const pt = useRef<WebGLPathTracer | null>(null)
  // 记低我哋临时隐藏咗边啲 mesh，退出时逐个还原 visible。
  const hidden = useRef<any[]>([])
  // 记低被换走嘅场景环境/背景（path tracer 要 equirect），退出时还原 + 释放渐变贴图。
  const savedEnv = useRef<{ environment: any; background: any; blur: number; grad: any } | null>(null)
  // 节流：只喺整数采样数变化时先 setState rtProgress，避免每帧 60 次 React 重渲染。
  const lastProg = useRef(-1)

  useEffect(() => {
    if (!on) {
      // 关闭时确保 tracer 清空 → useFrame 早退 → R3F 默认渲染管线恢复（否则视口变黑）。
      pt.current = null
      return
    }

    // 三角形守卫：太大唔启动，避免 BVH 建构 + 采样令视口冻结。
    const tris = countTriangles(scene)
    if (tris > MAX_TRIS) {
      console.warn(
        `[PathTraceLayer] scene has ~${Math.round(tris)} triangles (> ${MAX_TRIS}); ` +
          `skipping GPU path tracing to avoid viewport freeze.`,
      )
      pt.current = null
      return
    }

    // 隐藏所有非 PBR 可渲染对象（线/边/网格线/helper/非 standard 材质），记低以便还原。
    hidden.current = []
    scene.traverse((o: any) => {
      if (o.visible && shouldHideFromTracer(o)) {
        hidden.current.push(o)
        o.visible = false
      }
    })

    // 环境贴图：path tracer 嘅 EquirectHdrInfoUniform 只食 equirect DataTexture（要 .image.data）。
    // S109：若 HdriEnvironment 已经设咗一张 equirect HDRI DataTexture（isDataTexture + image.data）→ 直接
    // 共用唔换（视口/光追同一张 HDRI，一致）。否则（drei PMREM cube / RoomEnv / null）→ 临时换程序化渐变
    // 天空 equirect（提供柔和 IBL + 工作室背景），退出还原。
    const curEnv = scene.environment as { isDataTexture?: boolean; image?: { data?: unknown } } | null
    const hasEquirect = !!(curEnv && curEnv.isDataTexture && curEnv.image && curEnv.image.data)
    if (!hasEquirect) {
      const grad = new GradientEquirectTexture(256)
      grad.topColor.set(0xdfe7f2) // 天顶：冷白
      grad.bottomColor.set(0x3a3f47) // 地面：暗灰
      grad.exponent = 1.5
      grad.update()
      savedEnv.current = {
        environment: scene.environment,
        background: scene.background,
        blur: scene.backgroundBlurriness,
        grad,
      }
      scene.environment = grad
      scene.background = grad
      scene.backgroundBlurriness = 0
    }

    // 还原场景环境/背景 + 释放渐变贴图（catch 同 cleanup 共用）。
    const restoreEnv = () => {
      const se = savedEnv.current
      if (!se) return
      scene.environment = se.environment
      scene.background = se.background
      scene.backgroundBlurriness = se.blur
      try { se.grad.dispose() } catch { /* ignore */ }
      savedEnv.current = null
    }

    const tracer = new WebGLPathTracer(gl)
    tracer.tiles.set(2, 2) // 切 2x2 tile → 每帧只渲染 1/4，保持交互响应
    try {
      tracer.setScene(scene, camera) // 首次建 BVH + 上传场景
      pt.current = tracer
    } catch (e) {
      // 防御：场景仍含追踪器唔识嘅材质 → 唔好崩成个 Viewport，还原隐藏 + 退出光追
      console.warn('[PathTraceLayer] setScene failed, aborting path trace:', e)
      for (const o of hidden.current) o.visible = true
      hidden.current = []
      restoreEnv()
      try { tracer.dispose() } catch { /* ignore */ }
      pt.current = null
      useApp.setState({ rtMode: false, status: '⚠ 画布内光追启动失败（场景含追踪器唔支持嘅材质）— 已退出' })
      return
    }

    // 相机郁动：updateCamera() 内部会 reset 采样累积 —— 唔好用 setScene（会重建成个 BVH，
    // 每帧几百 ms → orbit 时视口冻结）。
    const onCameraChange = () => {
      pt.current?.updateCamera()
    }
    if (controls && typeof controls.addEventListener === 'function') {
      controls.addEventListener('change', onCameraChange)
    }

    if (import.meta.env.DEV) {
      // 验证用：DEV 暴露 tracer 实例。
      ;(window as any).__pt = tracer
    }

    return () => {
      if (controls && typeof controls.removeEventListener === 'function') {
        controls.removeEventListener('change', onCameraChange)
      }
      // 还原隐藏咗嘅叠加层 + 场景环境/背景。
      for (const o of hidden.current) o.visible = true
      hidden.current = []
      restoreEnv()
      try {
        tracer.dispose()
      } catch {
        /* ignore */
      }
      if (import.meta.env.DEV && (window as any).__pt === tracer) {
        ;(window as any).__pt = null
      }
      pt.current = null
    }
  }, [on, gl, scene, camera, controls, hdriPreset])

  // priority 1 → 接管渲染。on 为 false 时必须早退，等 R3F 默认 gl.render 恢复（否则视口变黑）。
  useFrame(() => {
    const t = pt.current
    if (!on || !t) return
    if (t.samples < maxS) {
      t.renderSample()
      const p = Math.floor(t.samples)
      if (p !== lastProg.current) {
        lastProg.current = p
        useApp.setState({ rtProgress: p })
      }
    }
  }, 1)

  return null
}
