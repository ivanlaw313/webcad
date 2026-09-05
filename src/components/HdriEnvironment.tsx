// HdriEnvironment — 可加载 HDRI 环境（roadmap #4 渲染）。对标 Fusion「Render 环境库」。
//
// 设计要点（点解唔直接用 drei <Environment>）：
//   drei <Environment> 内部会将 HDRI 经 PMREMGenerator 转成 cube render-target 再 set 落
//   scene.environment。呢个 cube target **无 .image.data**，three-gpu-pathtracer 嘅
//   EquirectHdrInfoUniform.preprocessEnvMap() 只食 equirect DataTexture（要 map.image.data
//   + type ∈ {FloatType, HalfFloatType}），所以 PMREM cube 喂落 path tracer 会崩 —— 同
//   PathTraceLayer 而家要换程序化 GradientEquirectTexture 嘅原因一模一样。
//
//   解决：本组件用 drei `useEnvironment`（直接走 RGBELoader，唔做 PMREM）攞返
//   **equirect DataTexture**，亲手 set scene.environment = 嗰个 DataTexture。咁样：
//     • 视口 IBL：three 见到 EquirectangularReflectionMapping 嘅环境贴图，照样做实时反射/IBL。
//     • path tracer：scene.environment 已经係 equirect FloatType DataTexture（有 .image.data），
//       PathTraceLayer 之后直接攞嚟用，唔使再换 Gradient（见底部接线说明）。
//
//   useEnvironment 返回嘅 .hdr texture 默认 HalfFloatType；我哋经 `extensions` 钩子
//   setDataType(FloatType) 强制浮点，确保 path tracer + NaN 守卫都稳阵。
//
// License：preset 全部係 pmndrs drei-assets CDN 嘅 Poly Haven **CC0** HDRI（见 hdriPresets.ts）。
// 自定 `url` 由你保证合规（建议续用 Poly Haven CC0）。无 GPL/AGPL。
//
// 用法：挂喺 <Canvas> 内（同 EnvLight / PathTraceLayer 同级）。例如：
//   <HdriEnvironment preset="studio" background intensity={1} rotationY={0} />
// 唔传 preset 又唔传 url 时组件唔做嘢（return null）—— 即「关闭 HDRI，沿用现有程序化环境」。

import { Suspense, useEffect, useMemo, useRef, Component, type ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import { useEnvironment } from '@react-three/drei'
import {
  FloatType,
  type Texture,
  type DataTexture,
  type Loader,
  type Scene,
} from 'three'
import { GradientEquirectTexture } from 'three-gpu-pathtracer'
import type { HdriPresetId } from '../render/hdriPresets'

export interface HdriEnvironmentProps {
  /** 预设环境名（CC0，drei CDN）。同 `url` 二选一；都唔传 = 组件唔接管环境。 */
  preset?: HdriPresetId
  /** 自定 equirect .hdr 文件 URL（自托管或第三方）。优先于 preset。 */
  url?: string
  /**
   * 是否同时做背景（true = scene.background 也设成 HDRI；false = 只做 IBL 反射，背景沿用现状）。
   * 默认 true（对标 Fusion render 环境会连背景一齐换）。
   */
  background?: boolean
  /**
   * 环境光强度（写入 scene.environmentIntensity，three r163+ 支持）。1 = 原始 HDRI 亮度。
   * 同 EnvLight 嘅 renderExposure（tone-mapping 曝光）係两件事：呢个缩放 IBL 输入能量。
   */
  intensity?: number
  /** 环境绕 Y 轴旋转（弧度）。写入 scene.environmentRotation / backgroundRotation。 */
  rotationY?: number
  /** 背景模糊（0..1，写入 scene.backgroundBlurriness）。只影响背景显示，唔影响 IBL/反射。 */
  backgroundBlur?: number
  /**
   * 加载失败兜底回调（可选）。例如通知 store 弹个 toast。
   * 组件本身已自动 fallback 去程序化渐变天空，唔会黑屏/崩。
   */
  onError?: (err: unknown) => void
}

// 强制 RGBELoader 输出 FloatType（path tracer EquirectHdrInfoUniform 要 Float/HalfFloat；
// 用 Float 最稳，配合下面 NaN 守卫）。feature-detect setDataType，避免非 RGBE loader 报错。
function forceFloat(loader: Loader) {
  const l = loader as Loader & { setDataType?: (t: number) => void }
  if (typeof l.setDataType === 'function') l.setDataType(FloatType)
}

// ---- 内部：真正攞 DataTexture 并 set 落 scene 的组件（会 suspend，要包 Suspense）----
// preset 同 url 共用呢个：useEnvironment 收到边个就用边个（url 优先）。

type ApplyProps = HdriEnvironmentProps

function ApplyHdri({
  preset,
  url,
  background = true,
  intensity = 1,
  rotationY = 0,
  backgroundBlur = 0,
}: ApplyProps) {
  const { scene } = useThree() as unknown as { scene: Scene }

  // url 优先；否则 preset 走 drei CDN（useEnvironment 内部补 CDN base + 文件名）。
  // 两个分支都返回 equirect DataTexture（EquirectangularReflectionMapping），唔做 PMREM。
  const tex = useEnvironment(
    url ? { files: url, extensions: forceFloat } : { preset, extensions: forceFloat },
  ) as Texture

  // 记低写入前嘅 scene 状态，cleanup / 换源时还原（唔好留低污染畀工作模式或下一个 preset）。
  const saved = useRef<{
    environment: Scene['environment']
    background: Scene['background']
    blur: number
  } | null>(null)

  useEffect(() => {
    if (!tex) return

    // NaN / 坏数据守卫：equirect DataTexture 应有 .image.data 浮点数组。抽样扫头若干像素，
    // 见到 NaN/Infinity 即抛 → ErrorBoundary → fallback 程序化天空（唔好污染 IBL 出 NaN）。
    const data = (tex as DataTexture).image?.data as ArrayLike<number> | undefined
    if (data && data.length) {
      const n = Math.min(data.length, 4096)
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(data[i])) {
          throw new Error('[HdriEnvironment] HDRI 含非有限像素（NaN/Inf）— 触发 fallback')
        }
      }
    }

    // 注：唔使在此 set tex.mapping —— useEnvironment 内部已为非 cubemap 文件设
    // EquirectangularReflectionMapping（path tracer 同视口 IBL 都靠呢个）。亦避免
    // 修改 hook 返回值（react-hooks/immutability）。
    saved.current = {
      environment: scene.environment,
      background: scene.background,
      blur: scene.backgroundBlurriness,
    }

    scene.environment = tex
    if (background) {
      scene.background = tex
      scene.backgroundBlurriness = backgroundBlur
    }

    return () => {
      const s = saved.current
      if (!s) return
      scene.environment = s.environment
      scene.background = s.background
      scene.backgroundBlurriness = s.blur
      saved.current = null
    }
    // tex 换（换 preset/url）或背景开关变 → 重 set。
  }, [tex, scene, background, backgroundBlur])

  // intensity / rotation 系实时 uniform 性质，独立 effect 即时写，唔使重 set 环境贴图。
  useEffect(() => {
    // three r163+：Scene.environmentIntensity / environmentRotation / backgroundRotation。
    // 旧版本无呢啲属性时静默跳过（feature-detect），唔报错。
    const s = scene as Scene & {
      environmentIntensity?: number
      environmentRotation?: { set: (x: number, y: number, z: number) => void }
      backgroundRotation?: { set: (x: number, y: number, z: number) => void }
    }
    if ('environmentIntensity' in s) s.environmentIntensity = intensity
    s.environmentRotation?.set(0, rotationY, 0)
    if (background) s.backgroundRotation?.set(0, rotationY, 0)
    // S110：HDRI 卸载时还原 intensity/rotation，否则 RoomEnv/工作模式接手会沿用错亮度/旋转
    return () => {
      if ('environmentIntensity' in s) s.environmentIntensity = 1
      s.environmentRotation?.set(0, 0, 0)
      if (background) s.backgroundRotation?.set(0, 0, 0)
    }
  }, [scene, intensity, rotationY, background])

  return null
}

// ---- 内部：fallback —— 加载失败时用程序化渐变 equirect 天空（同 PathTraceLayer 兜底一致）----
// 同样系 equirect DataTexture（GradientEquirectTexture），所以视口同 path tracer 都食得。

function GradientFallback({ background = true }: { background?: boolean }) {
  const { scene } = useThree() as unknown as { scene: Scene }
  const grad = useMemo(() => {
    const g = new GradientEquirectTexture(256)
    g.topColor.set(0xdfe7f2) // 天顶：冷白
    g.bottomColor.set(0x3a3f47) // 地面：暗灰
    g.exponent = 1.5
    g.update()
    return g
  }, [])

  useEffect(() => {
    const savedEnv = scene.environment
    const savedBg = scene.background
    scene.environment = grad
    if (background) scene.background = grad
    return () => {
      scene.environment = savedEnv
      scene.background = savedBg
      try {
        grad.dispose()
      } catch {
        /* ignore */
      }
    }
  }, [scene, grad, background])

  return null
}

// ---- 内部：错误边界 —— 包住 ApplyHdri，加载/解码任何失败都唔会崩成个 Canvas ----

interface EBProps {
  children: ReactNode
  fallback: ReactNode
  onError?: (err: unknown) => void
  /** reset 键：preset/url 换咗就重置 error 状态，畀新 HDRI 再试一次。 */
  resetKey: string
}
interface EBState {
  failed: boolean
}

class HdriErrorBoundary extends Component<EBProps, EBState> {
  constructor(props: EBProps) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError(): EBState {
    return { failed: true }
  }
  componentDidCatch(err: unknown) {
    console.warn('[HdriEnvironment] HDRI 加载/应用失败，已 fallback 程序化天空：', err)
    this.props.onError?.(err)
  }
  componentDidUpdate(prev: EBProps) {
    // 换 preset/url → 重置，畀新源再试（否则一次失败永久卡 fallback）。
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false })
    }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

// ---- 对外组件 ----

export function HdriEnvironment(props: HdriEnvironmentProps) {
  const { preset, url, onError } = props

  // 无任何源 → 唔接管环境（沿用 EnvLight 的 RoomEnvironment 或现状），亦唔挂 ErrorBoundary。
  if (!preset && !url) return null

  const resetKey = url ?? preset ?? ''
  const fallback = <GradientFallback background={props.background ?? true} />

  return (
    <HdriErrorBoundary onError={onError} fallback={fallback} resetKey={resetKey}>
      <Suspense fallback={fallback}>
        {/* key=resetKey：换 preset/url 时重挂载 ApplyHdri，干净重跑 suspense + set 流程 */}
        <ApplyHdri key={resetKey} {...props} />
      </Suspense>
    </HdriErrorBoundary>
  )
}
