// S3 · 烟耙【条带流线】(ribbon streaklines) —— 真风洞入面嗰把「烟耙」(smoke rake) 嘅样。
//
// 点解要另开一个组件而唔系改 WindSmoke？
//   WindSmoke 画嘅系【几十万粒独立 tracer 嘅短划】，用 gl.LINES。gl.lineWidth 喺所有桌面浏览器
//   都被钳死喺 1.0 —— 即系永远得一条【1 pixel 硬边细线】。一堆一像素细线叠埋，睇落系「铁丝网」
//   而唔系「烟」：冇厚度、冇柔边、冇光感、远近一样粗（深度线索直接死掉）。
//   参考图入面嗰种「数得出 8-10 条、粗幼均匀、连续、发光嘅白色带」系另一样嘢 —— streakline。
//
// 咩系 streakline？= 曾经经过【同一个固定点】嘅所有流体元素嘅轨迹。所以每个喷嘴自己揸住一个
// 【环形缓冲 (ring buffer)】：每隔一个「发射间隔」头指针行前一格、喺喷嘴位置生一粒新嘅；每 frame
// 全部一齐 advect。跟住【出生次序】由旧到新连成折线 —— 呢条折线本身就系 streakline。冇任何造假：
// 每一个顶点都真系一粒 N frame 之前喺喷嘴嗰度、之后一路畀速度场带住走嘅流体元素。
//
// ⚠ 物理零改动：本组件【只读】windResult 已经解好嘅场（同 WindSmoke 同一份 volData），唔参与求解。
// ⚠ 我哋个场系【穩態/凍结】，所以 streakline ≡ streamline；填满之后每 frame 画出嚟嘅形状一模一样
//    （靓但係死）。所以加咗两样【唔会伪造求解器冇算过嘅结构】嘅嘢：喷嘴微抖 (jitter) + 沿住 filament
//    行嘅密度相位。★ 唔加合成湍流 / wisp 之类 —— 嗰啲会画出求解器根本冇计过嘅结构。
//
// 数据流：
//   volData ─► Data3DTexture(RGBA8, Linear)
//      ├─ [更新 pass] 全屏 quad → RGBA32F ping-pong RT (samples × nozzles)：环形缓冲 + RK2 advect
//      └─ [绘制 pass] InstancedBufferGeometry 6 顶点基础 quad × (nozzles×(samples−1)) instance，
//                     喺【屏幕空间】撑开成有厚度嘅带，fragment 用 Beer-Lambert 弦长做柔边 + 圆柱法线打光
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AddEquation, BufferAttribute, ClampToEdgeWrapping, CustomBlending, Data3DTexture, DoubleSide,
  FloatType, GLSL3, InstancedBufferGeometry, LinearFilter, Matrix4, Mesh, NearestFilter, OneFactor,
  OrthographicCamera, PlaneGeometry, RGBAFormat, RawShaderMaterial, Scene, ShaderMaterial, Sphere,
  UnsignedByteType, Vector2, Vector3, WebGLRenderTarget,
} from 'three'
import { useApp } from '../store'

// ── 规模常数 ─────────────────────────────────────────────────────────────────
// rows × cols = 11 × 9 = 99 条 filament。参考图「数得出 8-10 条」系因为你系【侧睇】一排 —— 唔好
// 为咗夹硬凑够 10 条就减到 10 个喷嘴，咁样正视图会得零丁几条，读唔到绕流结构。
const ROWS = 11
const COLS = 9
const NOZZLES = ROWS * COLS
const SAMPLES = 256              // 环形缓冲长度：一条 filament = SAMPLES 个流体元素
const SAMPLES_LOW = 160          // lowPower：短啲，spacing 公式会自动补返（filament 长度不变）
// 一条 filament 要横跨成个风洞：长度 = samples × spacing 格，TUNNEL_SPANS 就系呢个长度（以域长计）。
// 1.3 → 出口之后仲有少少尾，但唔会浪费大半个 ring buffer 喺域外冇嘢画。
const TUNNEL_SPANS = 1.3
const spacingFor = (nx: number, samples: number) => Math.max(0.12, nx * TUNNEL_SPANS / samples)

// ── 更新 pass（RawShaderMaterial：three 唔注入任何嘢，全部自己声明）────────────
const UPDATE_VS = /* glsl */`
precision highp float;
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`

const UPDATE_FS = /* glsl */`
precision highp float;
precision highp sampler3D;

uniform sampler2D uPos;      // xyz = lattice cell-centre 坐标, w = alive(1)/dead(0)
uniform sampler3D uVol;      // rgb = 速度(bias 128), a = 固体
uniform vec3  uGridN;
uniform float uUMax;         // volUMax（格子单位）
uniform float uAdvect;       // 今 frame 行几多「格子步」（乘落格子速度度）
uniform int   uHead;         // 今 frame 重生嗰个 ring slot；−1 = 唔发射
uniform int   uRakeRows;
uniform int   uRakeCols;
uniform vec3  uRakeO;        // 耙中心（lattice cell-centre）
uniform vec3  uRakeU;        // 沿 row 方向嘅【全长】跨度向量
uniform vec3  uRakeV;        // 沿 col 方向嘅【全长】跨度向量
uniform float uJitter;
uniform float uSeed;
uniform float uReset;

layout(location = 0) out vec4 oPos;

// ⚠ 陷阱 #1（半格）：cell i 嘅值存喺 texel i，texel 中心喺 (i+0.5)/N；我哋 p 用 cell-centre 约定
//   （cell i 中心 = i+0.5）→ uvw = p/N。写成 (p+0.5)/N 会令【成个流场向下游偏半格】—— 睇落完全正常但全错。
vec3 toUVW(vec3 p) { return p / uGridN; }
bool outside(vec3 p) { return any(lessThan(p, vec3(0.5))) || any(greaterThan(p, uGridN - 0.5)); }
vec4 volAt(vec3 p) { return texture(uVol, toUVW(p)); }
vec3 velAt(vec3 p) {
  if (outside(p)) return vec3(0.0);
  // 128 系中点；×255/254 补偿 128 唔系啱啱好喺 [0,255] 正中（同 WindSmoke 逐字一样）
  return (volAt(p).xyz * 2.0 - 1.0) * (uUMax * 255.0 / 254.0);
}
bool inSolid(vec3 p) { return !outside(p) && volAt(p).w > 0.5; }

vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

// 第 row 个喷嘴喺个梳(comb)边一格
vec3 nozzle(int row) {
  int i = row / uRakeCols;          // 边一行
  int j = row - i * uRakeCols;      // 边一列
  float fu = uRakeRows > 1 ? (float(i) / float(uRakeRows - 1) - 0.5) : 0.0;
  float fv = uRakeCols > 1 ? (float(j) / float(uRakeCols - 1) - 0.5) : 0.0;
  vec3 p = uRakeO + uRakeU * fu + uRakeV * fv;
  // 出生位微抖：凍结场入面，如果每粒都由【一模一样】嘅点出发，成条 filament 就永远一条死线。
  // 抖一抖 = 一个真嘅 Lagrangian 扰动，畀流场自己带住走（唔系画上去嘅假纹理）。
  if (uJitter > 0.0) p += (hash33(vec3(float(row), uSeed, 1.7)) - 0.5) * uJitter;
  return p;
}

void main() {
  ivec2 t = ivec2(gl_FragCoord.xy);
  int col = t.x, row = t.y;

  if (uReset > 0.5) { oPos = vec4(nozzle(row), 0.0); return; }   // 全部 dead → 未有嘢画

  if (col == uHead) { oPos = vec4(nozzle(row), 1.0); return; }   // 今 frame 出世

  vec4 P = texelFetch(uPos, t, 0);
  if (P.w < 0.5) { oPos = P; return; }                          // 已死：冻住佢，等 head 兜返嚟

  // RK2 中点法。Euler 会明显「切」走涡嘅弯位，令 filament 向涡心螺旋 —— 直接睇得出嚟。
  vec3 p = P.xyz;
  vec3 v0 = velAt(p);
  vec3 v1 = velAt(p + v0 * (0.5 * uAdvect));
  vec3 pn = p + v1 * uAdvect;
  // 极轻微扩散：唔好令成把耙永远系一叠完美薄片。幅度 ~0.012 格（亚像素），唔会搞乱连续性。
  if (uJitter > 0.0) pn += (hash33(vec3(pn.xy * 37.0, uSeed + float(col))) - 0.5) * uJitter;

  // 出咗域 → 【终结呢条 filament】，唔重生。（重生会由死亡位置扯一条线横跨成个域。）
  if (outside(pn)) { oPos = vec4(p, 0.0); return; }
  // ⚠ 唔好杀：HOLD 住。壁面速度系 0，理论上 tracer 永远入唔到固体，但三线性插值跨过壁面就会。
  //   真 streakline 就系会喺驻点(stagnation point)度堆埋一嚿 —— 呢个堆积本身有物理意义，值得睇。
  if (inSolid(pn)) { oPos = vec4(p, 1.0); return; }
  oPos = vec4(pn, 1.0);
}
`

// ── 绘制 pass（ShaderMaterial：projectionMatrix / modelViewMatrix / modelMatrix / viewMatrix /
//    cameraPosition / isOrthographic 由 three 注入，唔可以重复声明）────────────────────────
const DRAW_VS = /* glsl */`
precision highp float;

uniform sampler2D uPos;
uniform mat4  uVolMatrix;    // lattice cell-centre → CAD mm
uniform int   uSamples;
uniform int   uHead;
uniform vec2  uRes;          // drawing buffer 尺寸（device pixel）
uniform float uWidthM;       // filament 直径，【世界长度】(mm)
uniform float uSpread;       // 老化时胀几多倍
uniform float uMinHalfPx;    // 再幼都唔可以细过呢个半宽；用 alpha 补返

out float vSide;
out float vAge;
out float vShrink;
out vec3  vWorld;
out vec3  vTanW;

// 两个三角形：(0,-1) (0,+1) (1,-1) / (0,+1) (1,+1) (1,-1)
const vec2 CORNER[6] = vec2[6](vec2(0.0, -1.0), vec2(0.0, 1.0), vec2(1.0, -1.0),
                               vec2(0.0,  1.0), vec2(1.0, 1.0), vec2(1.0, -1.0));

// 正交相机冇「相机位置」呢回事（视线平行）；用 view 矩阵第 3 行（= 相机世界 +Z，指向观察者）。
vec3 eyeDirAt(vec3 W) {
  return isOrthographic
    ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))
    : normalize(cameraPosition - W);
}

void main() {
  int seg = gl_InstanceID;
  vec2 corner = CORNER[gl_VertexID];
  int perNozzle = uSamples - 1;
  int nz = seg / perNozzle;
  int j  = seg - nz * perNozzle;

  // 出生次序，由旧到新：head+1, head+2, … head+samples（即系 head 自己）。
  int i0 = (uHead + 1 + j) % uSamples;
  int i1 = (uHead + 2 + j) % uSamples;
  vec4 A = texelFetch(uPos, ivec2(i0, nz), 0);
  vec4 B = texelFetch(uPos, ivec2(i1, nz), 0);

  // 有一端死咗：把 quad 塌到近平面后面，等佢畀裁走（唔好画一嚿散三角形）。
  if (A.w < 0.5 || B.w < 0.5) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vSide = 9.0; return; }

  vec4 lA = uVolMatrix * vec4(A.xyz, 1.0);
  vec4 lB = uVolMatrix * vec4(B.xyz, 1.0);
  vec4 c0 = projectionMatrix * modelViewMatrix * lA;
  vec4 c1 = projectionMatrix * modelViewMatrix * lB;
  if (c0.w <= 1e-4 || c1.w <= 1e-4) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vSide = 9.0; return; }

  // 喺【像素空间】撑开（gl.lineWidth 处处钳死 1.0），但个尺寸由【世界宽度】换算 —— 咁 filament
  // 先会随距离变幼，似一件真嘢。用屏幕空间宽度嘅话，域尾同域头一样粗，睇落即刻变返铁丝网。
  vec2 p0 = c0.xy / c0.w * 0.5 * uRes;
  vec2 p1 = c1.xy / c1.w * 0.5 * uRes;
  vec2 d = p1 - p0;
  float len = length(d);
  vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);

  vec4 c = corner.x < 0.5 ? c0 : c1;
  vec3 W0 = (modelMatrix * lA).xyz;
  vec3 W1 = (modelMatrix * lB).xyz;
  vec3 W  = corner.x < 0.5 ? W0 : W1;
  vec3 T  = W1 - W0;
  T = length(T) > 1e-9 ? normalize(T) : vec3(1.0, 0.0, 0.0);

  float ageF = float(j) / float(perNozzle);   // 0 = 最旧（远下游），1 = 喺喷嘴度
  // streakline 系一条曲线，本身冇厚度；呢度画嘅厚度系渲染选择，而【随年龄变粗】系入面唯一有物理
  // 意义嗰一半 —— 真烟丝行落去会畀流场搅散。
  float halfW = 0.5 * uWidthM * (1.0 + uSpread * (1.0 - ageF));

  // 「呢一点」每世界单位几多像素 —— 唔靠一个标量估，直接投影一条偏移出去量。
  vec3 V = eyeDirAt(W);
  vec3 acrossW = cross(T, V);
  acrossW = length(acrossW) > 1e-6 ? normalize(acrossW) : vec3(0.0, 1.0, 0.0);
  vec4 cOff = projectionMatrix * viewMatrix * vec4(W + acrossW * halfW, 1.0);
  vec2 pHere = c.xy / c.w * 0.5 * uRes;
  float halfPx = (cOff.w > 1e-4) ? length(cOff.xy / cOff.w * 0.5 * uRes - pHere) : uMinHalfPx;

  // ★ 亚像素规则（唔係可选）：细过一个像素嘅管画唔到细过一个像素，咁就【照住一个像素画】，再按
  //   佢真正覆盖几多，把 alpha 调暗。冇呢下：远处每条 filament 都钳成一个全亮像素，深度线索会
  //   反转，成幅嘢读落系铁丝网而唔係烟。
  float drawPx = max(halfPx, uMinHalfPx);
  vShrink = halfPx / drawPx;

  vec2 pp = (corner.x < 0.5 ? p0 : p1) + nrm * (drawPx * corner.y);
  vec2 ndc = pp / (0.5 * uRes);
  gl_Position = vec4(ndc * c.w, c.z, c.w);

  vSide = corner.y;
  vAge = ageF;
  vWorld = W;
  vTanW = T;
}
`

const DRAW_FS = /* glsl */`
precision highp float;
// ⚠ three r184：ShaderMaterial + GLSL3 时，three【唔会】帮你声明 pc_fragColor，亦唔会 #define
//   gl_FragColor（WebGLProgram.js 喺 GLSL3 分支明确跳过）→ 一定要自己声明 out。
layout(location = 0) out highp vec4 oColor;

in float vSide;
in float vAge;
in float vShrink;
in vec3  vWorld;
in vec3  vTanW;

uniform vec3  uLightDir;      // 指向【光】嗰边
uniform vec3  uLightColor;    // 太阳辐照度：故意 > 1（HDR），最尾靠 tonemap 收返落嚟
uniform vec3  uAmbient;
uniform float uAlpha;
uniform float uTubeSigma;     // 管中心嘅光学厚度
uniform float uG;             // 相函数各向异性
uniform float uExposure;
uniform float uInlineTonemap; // 1 = 喺呢度做 ACES + sRGB（8-bit 目标）；0 = 留畀将来嘅 HDR composite
uniform float uPhase;         // 流体锁相时钟（累加 head 步进 / perNozzle）
uniform float uPhaseK;        // 沿 filament 几多个「puff」× 2π

const float K_PI = 3.141592653589793;

// Henyey-Greenstein。g=0 各向同性，g→1 强前向散射。烟同云滴 g≈0.6-0.9，所以背光嘅云会「发光」。
// 已经含 1/4π，调用者唔好再除。
float hg(float cosT, float g) {
  float g2 = g * g;
  float d = 1.0 + g2 - 2.0 * g * cosT;
  return (1.0 - g2) / (4.0 * K_PI * max(d * sqrt(max(d, 1e-6)), 1e-6));
}

// ACES（Stephen Hill 拟合 RRT + sRGB ODT）。GLSL 矩阵系【列主序】，所以呢两个字面量系你喺参考
// 文献见到嗰啲【行主序】嘅转置。高光变紫红 = 你冇转置。
const mat3 ACESInput = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777);
const mat3 ACESOutput = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602);
vec3 tonemapACES(vec3 c) {
  c = ACESInput * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  c = ACESOutput * (a / b);
  return clamp(c, 0.0, 1.0);
}
vec3 linearToSRGB(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, step(c, vec3(0.0031308)));
}

vec3 eyeDirAt(vec3 W) {
  return isOrthographic
    ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]))
    : normalize(cameraPosition - W);
}

void main() {
  if (vSide > 2.0) discard;    // 塌咗嘅 quad

  /*
   * 呢条带系一条【烟嘅圆柱】，唔係一片平嘅纸。两个後果：
   *  ① 不透明度 = 视线切过佢嘅【弦长】上做 Beer-Lambert：中心最厚、边缘归零。呢个系物理剖面，
   *     顺手就送咗个柔边畀你（唔使 blur、唔使猜一条 pow 曲线）。
   *  ② 打光要法线，而屏幕空间 quad 冇。重建返圆柱嘅：喺横向坐标 s，可见面法线 = s×across
   *     + sqrt(1−s²)×toEye。
   */
  float s = clamp(vSide, -1.0, 1.0);
  float chord = sqrt(max(1.0 - s * s, 1e-4));

  vec3 V = eyeDirAt(vWorld);
  vec3 T = normalize(vTanW);
  vec3 across = cross(T, V);
  across = length(across) > 1e-6 ? normalize(across) : vec3(0.0, 1.0, 0.0);
  vec3 toEye = normalize(cross(across, T));
  vec3 N = normalize(across * s + toEye * chord);

  // Wrap lighting：一条几毫米粗嘅烟丝光学上系薄嘅，太阳连背面都照到、仲会透过嚟。
  // 用 Lambert 半空间嘅话背光面会全黑 —— 嗰个系煤烟，唔係烟。
  float wrap = clamp((dot(N, uLightDir) + 0.7) / 1.7, 0.0, 1.0);
  // …而且佢强烈前向散射，所以夹喺你同光之间嗰条会「着」起嚟。
  float phase = hg(dot(-V, uLightDir), uG);
  vec3 lit = uLightColor * (wrap * 0.42 + phase * 1.15) + uAmbient;

  // 无彩色 tint：新鲜 = 纯白，老 = 微冷灰。★ 唔用 turbo —— 会同表面 Cp 色图打交，读者分唔清
  //   边个颜色讲紧压力、边个讲紧烟。
  vec3 tint = mix(vec3(1.0), vec3(0.776, 0.804, 0.827), 1.0 - vAge);

  float a = (1.0 - exp(-uTubeSigma * chord)) * uAlpha * vShrink;
  // 尾巴溶解：filament 淡出，而唔係「啪」一声断喺半空
  a *= 0.30 + 0.70 * smoothstep(0.0, 0.18, vAge);
  // 密度相位：凍结场唯一嘅「动」。相位锁死喺流体上（uPhase 跟住 head 步进走），所以呢啲 puff
  // 系【跟住烟顺流行】，唔係逆流飘 —— 后者一睇就知系贴上去嘅假动画。
  a *= 0.72 + 0.28 * sin((vAge + uPhase) * uPhaseK);
  if (a <= 0.002) discard;

  // 我哋个目标系 8-bit + toneMapped:false，所以 tonemap 一定要喺【premultiply 之前】喺呢度做完。
  // 参考实现系画入 HDR buffer、留畀 composite 做；将来如果我哋都有 HDR composite，uInlineTonemap = 0。
  vec3 rgb = tint * lit * uExposure;
  if (uInlineTonemap > 0.5) rgb = linearToSRGB(tonemapACES(rgb));
  oColor = vec4(rgb * a, a);   // premultiplied，配 (ONE, ONE)
}
`

// ── store 旁路：呢几个 key 仲未落 store（monolith owner 会补）。防御性读，读唔到就用默认值，
//    咁样呢个档案喺 key 落地之前照编译、照跑。────────────────────────────────────────────
type RibbonKnobs = {
  windRibbonAlpha?: number
  windRibbonWidth?: number     // 【倍数】乘落 1.2×h 嗰个由模型推出嚟嘅基准宽度（唔係绝对 mm）
  windRibbonSigma?: number
  windRibbonSpread?: number
}
function useKnob(key: keyof RibbonKnobs, dflt: number): number {
  const v = useApp((s) => (s as unknown as RibbonKnobs)[key])
  return typeof v === 'number' && isFinite(v) ? v : dflt
}

// 扫 volData 嘅 alpha 通道搵实体包围盒（lattice index）。用嚟：① 把烟耙摆喺前缘上游 ~6 格
// ② 用【真实零件尺寸】定耙嘅跨度。res.rake 嗰个矩形已经畀域边界裁过，反推唔返零件本身尺寸。
function solidBounds(vol: Uint8Array, DX: number, DY: number, DZ: number) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9
  for (let z = 0; z < DZ; z++) {
    for (let y = 0; y < DY; y++) {
      const row = (y + DY * z) * DX
      for (let x = 0; x < DX; x++) {
        if (vol[(row + x) * 4 + 3] > 127) {
          if (x < x0) x0 = x
          if (x > x1) x1 = x
          if (y < y0) y0 = y
          if (y > y1) y1 = y
          if (z < z0) z0 = z
          if (z > z1) z1 = z
        }
      }
    }
  }
  return x1 < x0 ? null : { x0, x1, y0, y1, z0, z1 }
}

export type WindStreaksProps = {
  /** 覆写条带直径（CAD mm）。唔畀就由模型推：1.2 × 体素边长 h × windRibbonWidth 倍数。 */
  widthMm?: number
}

export default function WindStreaks({ widthMm }: WindStreaksProps = {}) {
  const res = useApp((s) => s.windResult)
  const show = useApp((s) => s.windShowFlow)
  const viz = useApp((s) => s.windViz)
  const speedMul = useApp((s) => s.windSmokeSpeed)   // 同烟流共用「流速」slider
  const lowPower = useApp((s) => s.lowPower)
  const alpha = useKnob('windRibbonAlpha', 0.50)
  const widthMul = useKnob('windRibbonWidth', 1.0)
  const sigma = useKnob('windRibbonSigma', 1.6)
  const spread = useKnob('windRibbonSpread', 1.4)
  const gl = useThree((s) => s.gl)

  // 降级阶梯：冇 WebGL2 浮点 render target 就整唔到 ping-pong 位置贴图 → 退返流线，而且【出声】
  // 讲原因（静静地退 = 用户以为坏咗）。同 WindSmoke 一模一样嘅 gate。
  const floatRT = useMemo(() => {
    try {
      const ctx = gl.getContext() as WebGL2RenderingContext
      return !!gl.capabilities.isWebGL2 && !!ctx.getExtension('EXT_color_buffer_float')
    } catch { return false }
  }, [gl])

  useEffect(() => {
    if (viz !== 'rake' || floatRT) return
    useApp.setState({ windViz: 'stream', status: '⚠ 呢部机唔支援 WebGL2 浮点渲染目标（EXT_color_buffer_float）— 烟耙条带已自动退返「流线」' })
  }, [viz, floatRT])

  const active = !!res && show && viz === 'rake' && !!res.volData && !!res.volDims && !!res.volMatrix && floatRT

  // ── GPU 资源（res 变就整套重建；useEffect cleanup 全部 dispose，免 VRAM 泄漏）──
  const rs = useMemo(() => {
    if (!active || !res?.volData || !res.volDims || !res.volMatrix) return null
    const [DX, DY, DZ] = res.volDims
    const samples = lowPower ? SAMPLES_LOW : SAMPLES

    const volTex = new Data3DTexture(res.volData, DX, DY, DZ)
    volTex.format = RGBAFormat
    volTex.type = UnsignedByteType
    volTex.minFilter = LinearFilter
    volTex.magFilter = LinearFilter
    volTex.wrapS = volTex.wrapT = volTex.wrapR = ClampToEdgeWrapping
    volTex.unpackAlignment = 1        // ⚠ 唔设就会横向撕裂（默认 4）
    volTex.needsUpdate = true

    // ── 烟耙 (rake)：rows × cols 嘅梳，摆喺前缘上游约 6 格，跨度 ≈ 1.35× 件高 / 1.5× 件宽。
    //    ★ 唔好平均撒满成个测试段 —— 嗰个系一堵雾墙，冇任何可读结构。
    const sb = solidBounds(res.volData, DX, DY, DZ)
    const fb = res.rake ?? { x: DX * 0.15, y0: 1, y1: DY - 2, z0: 1, z1: DZ - 2 }
    let rakeX: number, cy: number, cz: number, spanY: number, spanZ: number
    if (sb) {
      rakeX = sb.x0 + 0.5 - 6                                  // cell-centre 约定
      cy = (sb.y0 + sb.y1) * 0.5 + 0.5
      cz = (sb.z0 + sb.z1) * 0.5 + 0.5
      spanY = 1.35 * (sb.y1 - sb.y0 + 1)
      spanZ = 1.50 * (sb.z1 - sb.z0 + 1)
    } else {
      // 冇实体（空场）：退返求解器畀嘅播种矩形（佢已经系 ±35% 外扩 ⇒ 1.7×），缩返去 1.35 / 1.5。
      rakeX = fb.x
      cy = (fb.y0 + fb.y1) * 0.5
      cz = (fb.z0 + fb.z1) * 0.5
      spanY = (fb.y1 - fb.y0) * (1.35 / 1.7)
      spanZ = (fb.z1 - fb.z0) * (1.50 / 1.7)
    }
    rakeX = Math.min(Math.max(rakeX, 1.5), DX - 1.5)
    cy = Math.min(Math.max(cy, 1.5), DY - 1.5)
    cz = Math.min(Math.max(cz, 1.5), DZ - 1.5)
    // 唔可以有喷嘴跌出域外（出世即刻死 = 成行 filament 消失）
    spanY = Math.max(0.5, Math.min(spanY, 2 * Math.min(cy - 1.5, DY - 1.5 - cy)))
    spanZ = Math.max(0.5, Math.min(spanZ, 2 * Math.min(cz - 1.5, DZ - 1.5 - cz)))

    const spacing = spacingFor(DX, samples)
    const baseWidth = 1.2 * (res.h ?? 1)   // ★ 由模型嚟，唔可以写死米数：我哋嘅零件由 10 mm 到 5 m

    const updMat = new RawShaderMaterial({
      glslVersion: GLSL3, vertexShader: UPDATE_VS, fragmentShader: UPDATE_FS,
      uniforms: {
        uPos: { value: null }, uVol: { value: volTex },
        uGridN: { value: new Vector3(DX, DY, DZ) },
        uUMax: { value: res.volUMax ?? 0.15 },
        uAdvect: { value: 0.05 },
        uHead: { value: -1 },
        uRakeRows: { value: ROWS }, uRakeCols: { value: COLS },
        uRakeO: { value: new Vector3(rakeX, cy, cz) },
        uRakeU: { value: new Vector3(0, spanY, 0) },
        uRakeV: { value: new Vector3(0, 0, spanZ) },
        uJitter: { value: 0.012 },
        uSeed: { value: 1.234 },
        uReset: { value: 1 },
      },
      depthTest: false, depthWrite: false,
    })
    const quadScene = new Scene()
    const quadCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quadGeo = new PlaneGeometry(2, 2)
    quadScene.add(new Mesh(quadGeo, updMat))

    const mkRT = () => new WebGLRenderTarget(samples, NOZZLES, {
      type: FloatType, format: RGBAFormat,
      minFilter: NearestFilter, magFilter: NearestFilter,
      depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
    })
    const rtA = mkRT(), rtB = mkRT()

    const vm = res.volMatrix
    const volMat = new Matrix4().set(       // ⚠ volMatrix 系 row-major → 一定要用 .set() 唔係 .fromArray()
      vm[0], vm[1], vm[2], vm[3],
      vm[4], vm[5], vm[6], vm[7],
      vm[8], vm[9], vm[10], vm[11],
      vm[12], vm[13], vm[14], vm[15],
    )

    const drawMat = new ShaderMaterial({
      glslVersion: GLSL3, vertexShader: DRAW_VS, fragmentShader: DRAW_FS,
      uniforms: {
        // 唔用 null：第一 frame（useFrame 未跑过）会绑 three 嘅 1×1 empty texture，w 唔一定係 0。
        // 绑住 rtA 就稳阵 —— 新分配嘅 RT 由 WebGL 保证清零 → w=0 → 全部 quad 塌走 → 干净一 frame。
        uPos: { value: rtA.texture },
        uVolMatrix: { value: volMat },
        uSamples: { value: samples },
        uHead: { value: 0 },
        uRes: { value: new Vector2(1, 1) },
        uWidthM: { value: baseWidth },
        uSpread: { value: 1.4 },
        uMinHalfPx: { value: 0.55 },
        uLightDir: { value: new Vector3(-0.55, 0.72, -0.42).normalize() },
        uLightColor: { value: new Vector3(3.1, 3.02, 2.9) },   // 太阳辐照度：故意 > 1
        uAmbient: { value: new Vector3(0.12, 0.12, 0.12) },
        uAlpha: { value: 0.50 },
        uTubeSigma: { value: 1.6 },
        uG: { value: 0.55 },
        uExposure: { value: 1.0 },
        uInlineTonemap: { value: 1 },
        uPhase: { value: 0 },
        uPhaseK: { value: 26.0 },      // 26/2π ≈ 4 个 puff 沿住成条 filament
      },
      transparent: true,
      blending: CustomBlending, blendSrc: OneFactor, blendDst: OneFactor, blendEquation: AddEquation,
      depthTest: true,        // ✅ 零件遮得住烟（有空间感）
      depthWrite: false,      // ✅ additive 无序，唔可以写 depth
      // ★★ 必踩陷阱：一定要 DoubleSide。three 默认 FrontSide，而 (along, across) 呢个参数化
      //    绕出嚟系顺时针 —— 开住 culling 嘅话【一条带都唔会出现】，冇 error、冇 warning、冇线索。
      side: DoubleSide,
      toneMapped: false,      // 我哋喺 fragment 入面自己做 ACES + sRGB
    })

    // 6 顶点基础 quad × instance。position 内容用唔着（全部靠 gl_VertexID / gl_InstanceID + texelFetch），
    // 但 three 要一个 position attribute 先计到 draw count。
    const geo = new InstancedBufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(6 * 3), 3))
    geo.instanceCount = NOZZLES * (samples - 1)
    geo.boundingSphere = new Sphere(new Vector3(), 1e9)   // ⚠ 唔好畀 frustum cull 掉
    const mesh = new Mesh(geo, drawMat)
    mesh.frustumCulled = false
    mesh.renderOrder = 8
    mesh.raycast = () => null

    return {
      volTex, rtA, rtB, updMat, drawMat, quadScene, quadCam, quadGeo, geo, mesh,
      samples, spacing, DX, baseWidth, rake: { rakeX, cy, cz, spanY, spanZ },
    }
  }, [active, res, lowPower])

  useEffect(() => () => {
    if (!rs) return
    rs.volTex.dispose(); rs.rtA.dispose(); rs.rtB.dispose()
    rs.updMat.dispose(); rs.drawMat.dispose(); rs.quadGeo.dispose(); rs.geo.dispose()
  }, [rs])

  // 环形缓冲 + ping-pong 状态（用 ref 免 re-render）
  const st = useRef({
    src: null as WebGLRenderTarget | null, dst: null as WebGLRenderTarget | null,
    head: 0, accum: 0, phase: 0, seed: 1.234, reset: true,
  })
  useEffect(() => {
    if (rs) st.current = { src: rs.rtA, dst: rs.rtB, head: 0, accum: 0, phase: 0, seed: 1.234, reset: true }
  }, [rs])

  // UI 参数即时生效（唔使重建资源）
  useEffect(() => {
    if (!rs) return
    rs.drawMat.uniforms.uAlpha.value = alpha
    rs.drawMat.uniforms.uTubeSigma.value = sigma
    rs.drawMat.uniforms.uSpread.value = spread
    rs.drawMat.uniforms.uWidthM.value = widthMm && widthMm > 0 ? widthMm : rs.baseWidth * widthMul
  }, [rs, alpha, sigma, spread, widthMm, widthMul])

  // DEV e2e 直探（同 WindSmoke 嘅 __windSmoke 一样）：呢个环境影唔到 GPU 截图，__windStreaks
  // 就系【唯一】唔靠肉眼睇画面嘅验证路径 —— gate 讲边个开关 false，readPos/stats 讲粒子真唔真系
  // 喺域入面流动、有几多条 filament 仲生存。
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as { __windStreaks?: unknown }
    const readPos = () => {
      const rt = st.current.src
      if (!rs || !rt) return null
      const buf = new Float32Array(rs.samples * NOZZLES * 4)
      gl.readRenderTargetPixels(rt, 0, 0, rs.samples, NOZZLES, buf)
      return buf
    }
    w.__windStreaks = {
      gate: {
        hasRes: !!res, show, viz, hasVol: !!res?.volData, hasDims: !!res?.volDims,
        hasMat: !!res?.volMatrix, floatRT, active, built: !!rs,
      },
      meta: () => (rs ? {
        rows: ROWS, cols: COLS, nozzles: NOZZLES, samples: rs.samples,
        instances: NOZZLES * (rs.samples - 1),
        spacing: rs.spacing, filamentCells: rs.spacing * rs.samples, DX: rs.DX,
        widthMm: rs.drawMat.uniforms.uWidthM.value as number,
        rake: rs.rake,
        head: st.current.head, accum: st.current.accum, phase: st.current.phase,
      } : null),
      readPos,
      // 一句话验收：alive 数应该由 0 一路升到接近满；xRange 应该由耙位一路推到域尾。
      stats: () => {
        const buf = readPos()
        if (!buf) return null
        let alive = 0, xMin = 1e9, xMax = -1e9
        for (let i = 0; i < buf.length; i += 4) {
          if (buf[i + 3] > 0.5) {
            alive++
            if (buf[i] < xMin) xMin = buf[i]
            if (buf[i] > xMax) xMax = buf[i]
          }
        }
        return { alive, total: buf.length / 4, xMin: alive ? xMin : NaN, xMax: alive ? xMax : NaN }
      },
    }
    return () => { delete (window as unknown as { __windStreaks?: unknown }).__windStreaks }
  }, [rs, gl, res, show, viz, floatRT, active])

  const tmpSize = useRef(new Vector2())

  useFrame(() => {
    if (!rs || !st.current.src || !st.current.dst) return
    const s = st.current

    // ⚠ 唔好直接用 dt 乘 advect —— 掉 frame 时烟会一嘢跳。用固定 cells-per-frame 稳定得多。
    const crossFrames = 240 / Math.max(0.05, speedMul)      // 大约几多 frame 由域头穿到域尾
    const uref = (res?.latInletU ?? 0.1) || 0.1
    const cellsPerFrame = rs.DX / crossFrames                // 自由流每 frame 行几多格

    // ★ 一个 update pass 最多只可以生【一粒】新粒子（重生条件系 col == uHead，一 pass 一个 col）。
    //   所以当一 frame 行嘅距离 > 发射间距时，唔可以硬住一 frame 一粒 —— 咁样实际间距会变成
    //   cellsPerFrame，条带即刻起棱。「流速」slider 去到 4× 就一定会撞到（cellsPerFrame/spacing
    //   = speedMul/1.22）。所以把一 frame 拆成 sub-step，每步行 ≤ spacing 格、各自跑一次环形缓冲。
    //   代价：多几次 256×99 嘅 pass，即係几万个 fragment —— 可以忽略。
    const steps = s.reset ? 1 : Math.min(8, Math.max(1, Math.ceil(cellsPerFrame / rs.spacing)))
    const perStep = cellsPerFrame / steps
    rs.updMat.uniforms.uAdvect.value = perStep / uref

    const prevRT = gl.getRenderTarget()                     // ⚠ 一定要存返 + 还原
    const prevAuto = gl.autoClear
    gl.autoClear = false
    for (let k = 0; k < steps; k++) {
      // ★ head 推进用【减法累加器】，绝对唔可以清零。清零会把发射量化成整数 step：每步行
      //   0.55 格、目标间距 0.63 格嘅话，就变成【隔一步先发射一次】，间距一嘢变 1.1 格（要求嘅
      //   两倍），条带即刻睇得出「起棱」。减法保留余数，长期间距啱啱好等于目标。
      let head = -1
      if (!s.reset) {
        s.accum += perStep
        if (s.accum >= rs.spacing) {
          s.accum = Math.min(s.accum - rs.spacing, rs.spacing * 0.999)
          if (s.accum < 0) s.accum = 0
          s.head = (s.head + 1) % rs.samples
          s.phase += 1 / (rs.samples - 1)   // 相位跟住流体走（睇 DRAW_FS 嘅密度相位）
          head = s.head
        }
      }
      rs.updMat.uniforms.uPos.value = s.src!.texture
      rs.updMat.uniforms.uHead.value = s.reset ? -1 : head
      rs.updMat.uniforms.uReset.value = s.reset ? 1 : 0
      rs.updMat.uniforms.uSeed.value = s.seed
      s.seed = (s.seed * 1.618034 + 0.7137) % 997

      gl.setRenderTarget(s.dst)
      gl.render(rs.quadScene, rs.quadCam)

      const t = s.src; s.src = s.dst; s.dst = t              // 新写好嗰个变成 src
      if (s.reset) { s.reset = false; s.head = 0; s.accum = 0 }
    }
    gl.setRenderTarget(prevRT)
    gl.autoClear = prevAuto

    // 屏幕空间撑开要真实 drawing buffer 尺寸；uMinHalfPx 用 device pixel（0.55×dpr ⇒ 最幼 1.1 CSS px）
    const sz = gl.getDrawingBufferSize(tmpSize.current)
    const u = rs.drawMat.uniforms
    ;(u.uRes.value as Vector2).set(Math.max(1, sz.x), Math.max(1, sz.y))
    u.uMinHalfPx.value = 0.55 * gl.getPixelRatio()
    u.uPos.value = s.src!.texture
    u.uHead.value = Math.max(0, s.head)
    u.uPhase.value = s.phase
  })

  if (!rs) return null
  // 同 WindSmoke / WindOverlay 一样入 CAD(Z-up) → three(Y-up) 嗰个 group；uVolMatrix 出嚟系 CAD mm。
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <primitive object={rs.mesh} />
    </group>
  )
}
