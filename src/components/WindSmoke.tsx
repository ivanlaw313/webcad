// S2 · P0 GPU 烟流 —— 把 LBM 已经解好嘅速度场（windResult.volData 3D texture）搬上 GPU，
// 喺【凍結嘅穩態場】入面 advect 几十万粒 tracer，每粒画一条【短线】(prev→cur) 而唔係一粒圆点。
// 呢条短线就系「confetti」同「烟」嘅分别 —— 线同自己嘅运动方向对齐，先至有烟嘅质感。
//
// ⚠ 物理零改动：本组件【只读】windResult 已经解好嘅场，唔参与任何求解。Cd / 阻力 / Re 完全唔受影响。
// ⚠ 我哋个场系【穩態】（求解器跑到收敛就停），所以喺场入面 advect 出嚟嘅轨迹物理上就系 streamline——
//    动感 100% 来自粒子流动，正正就系真风洞影出嚟嘅样。（睇唔到涡脱落摆动 = 求解器本身取时均，唔系呢层缺陷。）
//
// 数据流：
//   volData ─► Data3DTexture(RGBA8, Linear)
//      ├─ [更新 pass] 全屏 quad + MRT×2 → RT_A(pos,prev) ⇄ RT_B  ：RK2 advect + 老化 + 重生
//      └─ [绘制 pass] LineSegments 2N 顶点，零 attribute，靠 gl_VertexID + texelFetch 读位置贴图
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute, BufferGeometry, ClampToEdgeWrapping, CustomBlending, AddEquation, OneFactor,
  Data3DTexture, FloatType, GLSL3, LinearFilter, LineSegments, Matrix4, Mesh, NearestFilter,
  OrthographicCamera, PlaneGeometry, RGBAFormat, RawShaderMaterial, Scene, ShaderMaterial, Sphere,
  UnsignedByteType, Vector2, Vector3, Vector4, WebGLRenderTarget,
} from 'three'
import { useApp } from '../store'

// ── 更新 pass ────────────────────────────────────────────────────────────────
const UPDATE_VS = /* glsl */`
precision highp float;
in vec3 position;
in vec2 uv;
out vec2 vUV;
void main() { vUV = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const UPDATE_FS = /* glsl */`
precision highp float;
precision highp sampler3D;

uniform sampler2D uPos;      // xyz = lattice cell-centre 坐标, w = 年龄（已行 cell 数）
uniform sampler2D uPrev;
uniform sampler3D uVol;      // rgb = 速度(bias 128), a = 固体
uniform vec3  uGridN;
uniform float uUMax;         // volUMax（格子单位）
uniform float uAdvect;       // 今 frame 行几多「格子步」
uniform float uLife;         // 寿命（以「已行 cell 数」计，唔用秒 —— 陷阱 #10）
uniform float uUref;         // latInletU
uniform vec4  uRakeX;        // x, y0, y1, (w 未用)
uniform vec2  uRakeZ;        // z0, z1
uniform float uSeed;
uniform float uReset;

layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oPrev;

in vec2 vUV;

// ⚠ 陷阱 #1（半格）：cell i 嘅值存喺 texel i，texel 中心喺 (i+0.5)/N；我哋 p 用 cell-centre 约定
//   （cell i 中心 = i+0.5）→ uvw = p/N。写成 (p+0.5)/N 会令【成个流场向下游偏半格】—— 睇落完全正常但全错。
vec3 toUVW(vec3 p) { return p / uGridN; }
bool outside(vec3 p) { return any(lessThan(p, vec3(0.5))) || any(greaterThan(p, uGridN - 0.5)); }
vec4 volAt(vec3 p) { return texture(uVol, toUVW(p)); }
vec3 velAt(vec3 p) {
  if (outside(p)) return vec3(0.0);
  // 128 系中点；×255/254 补偿 128 唔系啱啱好喺 [0,255] 正中
  return (volAt(p).xyz * 2.0 - 1.0) * (uUMax * 255.0 / 254.0);
}
bool inSolid(vec3 p) { return !outside(p) && volAt(p).w > 0.5; }

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// 烟耙：上游一块矩形平面出生（唔系成个域乱撒 —— 乱撒会令自由流一片糊，睇唔到绕流结构）
vec3 spawn(vec2 uv, float salt) {
  vec3 h = hash33(vec3(uv * 1024.0, uSeed + salt));
  return vec3(uRakeX.x, mix(uRakeX.y, uRakeX.z, h.y), mix(uRakeZ.x, uRakeZ.y, h.z));
}

void main() {
  vec4 P = texture(uPos, vUV);
  vec3 p = P.xyz;
  float age = P.w;

  if (uReset > 0.5) {
    // 初始年龄撒开成个寿命 —— 唔系嘅话第一秒会见到一整块粒子【齐步】向下游行
    float a0 = hash33(vec3(vUV * 512.0, uSeed)).x * uLife;
    vec3 s = spawn(vUV, 3.7);
    oPos = vec4(s, a0); oPrev = vec4(s, a0);
    return;
  }

  // RK2 中点法。Euler 会明显「切」走涡嘅弯位，令 tracer 向涡心螺旋 —— 直接睇得出嚟。
  vec3 v0 = velAt(p);
  vec3 pm = p + v0 * (0.5 * uAdvect);
  vec3 v1 = velAt(pm);
  vec3 pn = p + v1 * uAdvect;

  float speed = length(v1);

  // 年龄 = 已行 cell 数（唔用秒）。咁样改 frame rate 或者拉「流速」slider 都唔会令烟飞唔到零件度就死。
  float travel = speed * uAdvect;
  // 陷阱 #4：卡住嘅粒子加速老化 —— 唔做嘅话一分钟后粒子全部积喺尾流回流泡，自由流变空、画面死掉。
  if (speed < 0.05 * uUref) travel = 8.0 * uUref * uAdvect;
  age += travel;

  bool dead = age > uLife || outside(pn) || inSolid(pn);

  if (dead) {
    vec3 s = spawn(vUV, floor(age * 13.0) + uSeed);
    oPos  = vec4(s, 0.0);
    oPrev = vec4(s, 0.0);   // ⚠ 陷阱 #3：新生嗰 frame prev 必须 = pos，否则会由死亡位置扯一条线横跨成个域
  } else {
    oPos  = vec4(pn, age);
    oPrev = vec4(p,  age);
  }
}
`

// ── 绘制 pass（ShaderMaterial：projectionMatrix / modelViewMatrix 由 three 注入，唔可以重复声明）──
const DRAW_VS = /* glsl */`
precision highp float;
precision highp sampler3D;

uniform sampler2D uPos;
uniform sampler2D uPrev;
uniform sampler3D uVol;
uniform mat4  uVolMatrix;    // lattice cell-centre → CAD mm
uniform vec3  uGridN;
uniform float uUMax;
uniform float uSideF;
uniform float uLife;
uniform float uStreakScale;  // 0=短点 1=全尾

out float vAge;
out float vSpeed;

void main() {
  int side = int(uSideF);
  int pid = gl_VertexID >> 1;
  ivec2 t = ivec2(pid % side, pid / side);
  vec4 P = texelFetch(uPos,  t, 0);
  vec4 Q = texelFetch(uPrev, t, 0);

  // 偶数顶点 = 尾(prev)，奇数 = 头(cur) → 每粒 tracer 一条同自己运动方向对齐嘅短划
  vec3 lp = ((gl_VertexID & 1) == 0) ? mix(P.xyz, Q.xyz, uStreakScale) : P.xyz;

  vec3 uvw = clamp(lp / uGridN, vec3(0.002), vec3(0.998));
  vSpeed = length((texture(uVol, uvw).xyz * 2.0 - 1.0) * (uUMax * 255.0 / 254.0));
  vAge   = clamp(P.w / uLife, 0.0, 1.0);

  gl_Position = projectionMatrix * modelViewMatrix * (uVolMatrix * vec4(lp, 1.0));
}
`

const DRAW_FS = /* glsl */`
precision highp float;
// ⚠ three r184：ShaderMaterial + GLSL3 时，three【唔会】帮你声明 pc_fragColor，亦唔会 #define gl_FragColor
//   （WebGLProgram.js:816-817 明确喺 GLSL3 分支跳过）→ 一定要自己声明 out，写 gl_FragColor 会编译失败。
layout(location = 0) out highp vec4 oColor;
in float vAge;
in float vSpeed;
uniform float uAlpha;
uniform float uUrefLat;
uniform float uColorMode;   // 0=白烟 1=速度(turbo) 2=年龄

// turbo colormap（Mikhailov / Google 2019 五阶多项式拟合）
vec3 turboSRGB(float x) {
  const vec4 kR4 = vec4( 0.13572138,  4.61539260, -42.66032258, 132.13108234);
  const vec4 kG4 = vec4( 0.09140261,  2.19418839,   4.84296658, -14.18503333);
  const vec4 kB4 = vec4( 0.10667330, 12.64194608, -60.58204836, 110.36276771);
  const vec2 kR2 = vec2(-152.94239396, 59.28637943);
  const vec2 kG2 = vec2(   4.27729857,  2.82956604);
  const vec2 kB2 = vec2( -89.90310912, 27.34824973);
  x = clamp(x, 0.0, 1.0);
  vec4 v4 = vec4(1.0, x, x * x, x * x * x);
  vec2 v2 = v4.zw * v4.z;
  return clamp(vec3(dot(v4, kR4) + dot(v2, kR2),
                    dot(v4, kG4) + dot(v2, kG2),
                    dot(v4, kB4) + dot(v2, kB2)), 0.0, 1.0);
}

void main() {
  // 陷阱 #6 伴生：出生淡入 + 老死淡出。冇呢两下粒子会「啪啪」跳出跳入。
  float a = uAlpha * smoothstep(0.0, 0.05, vAge) * pow(1.0 - vAge, 1.5);
  if (a <= 0.002) discard;

  vec3 c;
  if (uColorMode > 1.5)      c = turboSRGB(vAge);
  else if (uColorMode > 0.5) c = turboSRGB(clamp(vSpeed / (uUrefLat * 1.6), 0.0, 1.0));
  else                       c = mix(vec3(0.95, 0.97, 1.00), vec3(0.55, 0.68, 0.85), vAge);

  oColor = vec4(c * a, a);   // premultiplied，配 (ONE, ONE)
}
`

export default function WindSmoke() {
  const res = useApp((s) => s.windResult)
  const show = useApp((s) => s.windShowFlow)
  const viz = useApp((s) => s.windViz)
  const alpha = useApp((s) => s.windSmokeAlpha)
  const speedMul = useApp((s) => s.windSmokeSpeed)
  const colorMode = useApp((s) => s.windSmokeColor)
  const streakScale = useApp((s) => s.windStreakScale)
  const lowPower = useApp((s) => s.lowPower)
  const gl = useThree((s) => s.gl)

  // 降级阶梯（§10）：冇 WebGL2 float render target 就整唔到 ping-pong 位置贴图 → 退返流线，
  // 而且【出声】讲原因（静静地退 = 用户以为烟流坏咗）。
  const floatRT = useMemo(() => {
    try {
      const ctx = gl.getContext() as WebGL2RenderingContext
      return !!gl.capabilities.isWebGL2 && !!ctx.getExtension('EXT_color_buffer_float')
    } catch { return false }
  }, [gl])

  useEffect(() => {
    if (viz !== 'smoke' || floatRT) return
    useApp.setState({ windViz: 'stream', status: '⚠ 呢部机唔支援 WebGL2 浮点渲染目标（EXT_color_buffer_float）— 烟流已自动退返「流线」' })
  }, [viz, floatRT])

  const active = !!res && show && viz === 'smoke' && !!res.volData && !!res.volDims && !!res.volMatrix && floatRT

  // ── GPU 资源（res 变就整套重建；useEffect cleanup 全部 dispose —— 陷阱 #12 免 VRAM 泄漏）──
  const rs = useMemo(() => {
    if (!active || !res?.volData || !res.volDims || !res.volMatrix) return null
    const [DX, DY, DZ] = res.volDims
    const COUNT = lowPower ? 65536 : 262144
    const side = Math.round(Math.sqrt(COUNT))

    const volTex = new Data3DTexture(res.volData, DX, DY, DZ)
    volTex.format = RGBAFormat
    volTex.type = UnsignedByteType
    volTex.minFilter = LinearFilter
    volTex.magFilter = LinearFilter
    volTex.wrapS = volTex.wrapT = volTex.wrapR = ClampToEdgeWrapping
    volTex.unpackAlignment = 1        // ⚠ 陷阱 #2：唔设就会横向撕裂（默认 4）
    volTex.needsUpdate = true

    const mkRT = () => new WebGLRenderTarget(side, side, {
      count: 2,                        // MRT：attachment0 = pos, attachment1 = prev
      type: FloatType, format: RGBAFormat,
      minFilter: NearestFilter, magFilter: NearestFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    })
    const rtA = mkRT(), rtB = mkRT()

    const gridN = new Vector3(DX, DY, DZ)
    const life = DX * 1.6              // 寿命 ~1.6 个域长：直穿粒子到出口先淡到 ~0.3，零件附近仍然够光
    const rake = res.rake ?? { x: DX * 0.15, y0: 1, y1: DY - 2, z0: 1, z1: DZ - 2 }

    const updMat = new RawShaderMaterial({
      glslVersion: GLSL3, vertexShader: UPDATE_VS, fragmentShader: UPDATE_FS,
      uniforms: {
        uPos: { value: null }, uPrev: { value: null }, uVol: { value: volTex },
        uGridN: { value: gridN }, uUMax: { value: res.volUMax ?? 0.15 },
        uAdvect: { value: 0.05 }, uLife: { value: life },
        uUref: { value: res.latInletU ?? 0.1 },
        uRakeX: { value: new Vector4(rake.x, rake.y0, rake.y1, 0) },
        uRakeZ: { value: new Vector2(rake.z0, rake.z1) },
        uSeed: { value: 1.234 }, uReset: { value: 1 },
      },
      depthTest: false, depthWrite: false,
    })
    const quadScene = new Scene()
    const quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quadGeo = new PlaneGeometry(2, 2)
    quadScene.add(new Mesh(quadGeo, updMat))

    const drawMat = new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: DRAW_VS, fragmentShader: DRAW_FS,
      uniforms: {
        uPos: { value: null }, uPrev: { value: null }, uVol: { value: volTex },
        uVolMatrix: { value: new Matrix4().set(...(res.volMatrix as [
          number, number, number, number, number, number, number, number,
          number, number, number, number, number, number, number, number])) },
        uGridN: { value: gridN }, uUMax: { value: res.volUMax ?? 0.15 },
        uSideF: { value: side }, uLife: { value: life },
        uStreakScale: { value: 1 }, uAlpha: { value: 0.12 },
        uUrefLat: { value: res.latInletU ?? 0.1 }, uColorMode: { value: 1 },
      },
      transparent: true,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor, blendEquation: AddEquation,
      depthTest: true,      // ✅ 零件遮得住烟（旧流线系 depthTest:false，成日浮喺件前面冇空间感）
      depthWrite: false,    // ✅ additive 无序，唔可以写 depth（陷阱 #6）
      toneMapped: false,
    })

    // 零 attribute 绘制：靠 gl_VertexID + texelFetch。但 three 要一个 position attribute 先计到 draw count。
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(COUNT * 2 * 3), 3))
    geo.boundingSphere = new Sphere(new Vector3(), 1e9)   // ⚠ 陷阱 #9：唔好畀 frustum cull 掉
    const lines = new LineSegments(geo, drawMat)
    lines.frustumCulled = false
    lines.renderOrder = 8
    lines.raycast = () => null

    return { volTex, rtA, rtB, updMat, drawMat, quadScene, quadCam, quadGeo, geo, lines, side, life, DX }
  }, [active, res, lowPower])

  useEffect(() => () => {
    if (!rs) return
    rs.volTex.dispose(); rs.rtA.dispose(); rs.rtB.dispose()
    rs.updMat.dispose(); rs.drawMat.dispose(); rs.quadGeo.dispose(); rs.geo.dispose()
  }, [rs])

  // ping-pong 状态 + reset 旗（用 ref 免 re-render）
  const pp = useRef({ src: null as WebGLRenderTarget | null, dst: null as WebGLRenderTarget | null, reset: true })
  useEffect(() => { if (rs) pp.current = { src: rs.rtA, dst: rs.rtB, reset: true } }, [rs])

  // DEV e2e 直探（同 store.ts 嘅 __evalExpr / __faceIdAt 一样）：读返位置贴图，验证粒子真系喺域内流动
  // （shader 编唔编到、RT 有冇嘢、advect 郁唔郁 —— 呢个系唯一唔靠肉眼睇截图嘅验证路径）。
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __windSmoke?: unknown }
    w.__windSmoke = {
      // gate：一眼睇晒各个开关（边个 false 就系烟流唔出嚟嘅原因）
      gate: { hasRes: !!res, show, viz, hasVol: !!res?.volData, hasDims: !!res?.volDims, hasMat: !!res?.volMatrix, floatRT, active, built: !!rs },
      meta: () => (rs ? { side: rs.side, life: rs.life, DX: rs.DX, count: rs.side * rs.side } : null),
      readPos: () => {
        const rt = pp.current.src
        if (!rs || !rt) return null
        const buf = new Float32Array(rs.side * rs.side * 4)
        gl.readRenderTargetPixels(rt, 0, 0, rs.side, rs.side, buf)
        return buf
      },
    }
    return () => { delete (window as unknown as { __windSmoke?: unknown }).__windSmoke }
  }, [rs, gl, res, show, viz, floatRT, active])

  // UI 参数即时生效（唔使重建资源）
  useEffect(() => {
    if (!rs) return
    rs.drawMat.uniforms.uAlpha.value = alpha
    rs.drawMat.uniforms.uStreakScale.value = streakScale
    rs.drawMat.uniforms.uColorMode.value = colorMode === 'age' ? 2 : colorMode === 'speed' ? 1 : 0
  }, [rs, alpha, streakScale, colorMode])

  useFrame(() => {
    if (!rs || !pp.current.src || !pp.current.dst) return
    const { src, dst, reset } = pp.current

    // ⚠ 陷阱 #10 伴生：唔好直接用 dt 乘 advect —— 掉 frame 时烟会一嘢跳。用固定 cells-per-frame 稳定得多。
    const crossFrames = 240 / Math.max(0.05, speedMul)     // 大约几多 frame 由域头穿到域尾
    const uref = rs.updMat.uniforms.uUref.value as number
    rs.updMat.uniforms.uAdvect.value = (rs.DX / crossFrames) / uref
    rs.updMat.uniforms.uPos.value = src.textures[0]
    rs.updMat.uniforms.uPrev.value = src.textures[1]
    rs.updMat.uniforms.uReset.value = reset ? 1 : 0

    const prevRT = gl.getRenderTarget()                    // ⚠ 陷阱 #8：一定要存返 + 还原
    const prevAuto = gl.autoClear
    gl.autoClear = false
    gl.setRenderTarget(dst)
    gl.render(rs.quadScene, rs.quadCam)
    gl.setRenderTarget(prevRT)
    gl.autoClear = prevAuto

    pp.current = { src: dst, dst: src, reset: false }
    rs.drawMat.uniforms.uPos.value = dst.textures[0]
    rs.drawMat.uniforms.uPrev.value = dst.textures[1]
  })

  if (!rs) return null
  // 同 WindOverlay / WindFlowArrows 一样入 CAD(Z-up) → three(Y-up) 嗰个 group；uVolMatrix 出嚟系 CAD mm。
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <primitive object={rs.lines} />
    </group>
  )
}
