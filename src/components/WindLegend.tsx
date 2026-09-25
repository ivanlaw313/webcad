// 风洞流场【图例】—— 用户报「唔知边只色代表乜」：旧版画咗彩色流线 + 白点但零解释。
// 本板只读 windResult（纯展示，零副作用），跟住当前 样式/表面场 自动切内容 + 真数值刻度。
//
// ⚠ 两个已修嘅坑：
//  ① 唔好用 tStatus() 译【长句】—— 佢系词典式替换，EN 模式会出「part表面: 压力系数 Cp」呢种半中半英。
//    图例句子改成显式 zh/en 两套字串。
//  ② 用返 index.css 嘅 .info-card 深色 token（同 测量/拔模/斜度/截面 浮卡一致，刻意深色 = 叠喺模型上够对比），
//    唔好再 ad-hoc 内联 chrome。
import { useApp } from '../store'

// 同 Viewport 嘅 WIND_CMAP 一致（深蓝 → 青 → 黄 → 红）；喺度写返 CSS 色，免同 Viewport 循环 import。
const SPEED_RAMP = 'linear-gradient(90deg,#081f7a 0%,#0dbff2 33%,#fadb26 67%,#e62115 100%)'
const TURBO_RAMP = 'linear-gradient(90deg,#30123b 0%,#4777ef 25%,#1ac7c2 45%,#a4fc3b 65%,#fb8022 85%,#7a0403 100%)'
const CP_RAMP = 'linear-gradient(90deg,#e62115 0%,#ffffff 50%,#1572c4 100%)'

const ZH = {
  title: '風洞圖例', flow: '流場', smoke: '煙流霧粒', stream: '流線', arrow: '箭頭', rake: '煙耙條帶',
  rakeIs: '每條緞帶 = 上游煙耙【同一個噴嘴】放出嚟嘅煙跡（streakline）',
  rakeWhite: '純白 = 煙本身，靠光照同厚度發光 —— 刻意唔按速度上色，免同零件表面 Cp 壓力圖爭眼球（想睇速度色請切「流線」）',
  rakeSolid: '撞到零件 = 喺駐點停低堆積（唔會穿過去）',
  lineIsPath: '線 = 流體行經嘅路徑 · 線色 = 該處風速',
  arrowIs: '箭頭 = 該點速度向量 · 色 = 風速',
  smokeIs: '每條短線 = 一粒煙走過嘅一步 · 線色 = 該處風速',
  smokeWhite: '白煙：由白（啱出）漸變到淡藍（將消散）— 最似真風洞',
  smokeAge: '線色 = 煙嘅年齡（離開煙耙後行咗幾遠）',
  slow: '慢 / 尾流停滯', fast: '快 / 繞流加速', fresh: '啱出', old: '將消散',
  mid: '黃 / 橙 = 中速', dots: '白點 = 沿流線向下游行嘅標記，睇【流向】同快慢（唔係粒子本身）',
  inflow: '來流', surf: '零件表面', cp: '壓力係數 Cp', sspeed: '貼面流速',
  cpHi: '紅 = 迎風高壓', cpLo: '藍 = 背風吸力', cpMid: '白 = 同來流壓力一樣（Cp≈0）',
  stag: '滯點 / 死水', accel: '加速區',
}
const EN = {
  title: 'Wind tunnel legend', flow: 'Flow', smoke: 'Smoke particles', stream: 'Streamlines', arrow: 'Arrows', rake: 'Smoke rake ribbons',
  rakeIs: 'Each ribbon = the smoke trail from ONE nozzle of the upstream rake (a streakline)',
  rakeWhite: 'Pure white = the smoke itself, lit by thickness — deliberately NOT speed-coloured so it does not fight the Cp pressure map (switch to Streamlines for speed colour)',
  rakeSolid: 'Hitting the part = piles up at the stagnation point (never passes through)',
  lineIsPath: 'Line = path the fluid travels · colour = local speed',
  arrowIs: 'Arrow = velocity vector · colour = speed',
  smokeIs: 'Each dash = one step of a smoke particle · colour = local speed',
  smokeWhite: 'White smoke: white (new) → pale blue (fading) — closest to a real tunnel',
  smokeAge: 'Colour = smoke age (distance travelled from the rake)',
  slow: 'slow / wake', fast: 'fast / accelerated', fresh: 'new', old: 'fading',
  mid: 'yellow / orange = mid speed', dots: 'White dots = markers moving downstream — they show flow DIRECTION and speed (not the particles themselves)',
  inflow: 'Inflow', surf: 'Part surface', cp: 'Pressure coefficient Cp', sspeed: 'Surface speed',
  cpHi: 'red = windward high pressure', cpLo: 'blue = leeward suction', cpMid: 'white = same as free stream (Cp≈0)',
  stag: 'stagnation / dead air', accel: 'accelerated',
}

function Bar({ ramp, lo, hi, loNote, hiNote }: { ramp: string; lo: string; hi: string; loNote?: string; hiNote?: string }) {
  return (
    <div style={{ margin: '3px 0 5px' }}>
      <div style={{ height: 9, borderRadius: 2, background: ramp, border: '1px solid #2a3a46' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#c8d4dd', marginTop: 1 }}>
        <span>{lo}</span><span>{hi}</span>
      </div>
      {(loNote || hiNote) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9fb2bf', gap: 8 }}>
          <span>{loNote}</span><span style={{ textAlign: 'right' }}>{hiNote}</span>
        </div>
      )}
    </div>
  )
}

export default function WindLegend() {
  const res = useApp((s) => s.windResult)
  const show = useApp((s) => s.windShowFlow)
  const viz = useApp((s) => s.windViz)
  const field = useApp((s) => s.windField)
  const smokeColor = useApp((s) => s.windSmokeColor)
  const lang = useApp((s) => s.lang)
  const t = lang === 'en' ? EN : ZH
  if (!res) return null

  const f1 = (x: number) => (x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2))
  // 速度满标：流线/箭头用实际解出嘅最大值；烟流(速度模式)满标 = 1.6×来流（同 shader uUrefLat*1.6 一致）
  const vMax = viz === 'smoke' ? res.speed * 1.6 : viz === 'arrow' ? (res.flowSpeedMax || 0) : (res.streamSpeedMax || res.flowSpeedMax || 0)
  const cpA = Math.max(Math.abs(res.cpMin), Math.abs(res.cpMax), 1e-6)
  const vizName = viz === 'rake' ? t.rake : viz === 'smoke' ? t.smoke : viz === 'arrow' ? t.arrow : t.stream

  return (
    <div className="info-card" style={{
      position: 'fixed', right: 14, bottom: 210, width: 214, zIndex: 16,
      padding: '9px 11px', fontSize: 11, lineHeight: 1.45, pointerEvents: 'none',
    }}>
      <div style={{ fontWeight: 700, color: '#7fd1b9', marginBottom: 4 }}>🌬️ {t.title}</div>

      {show && (<>
        <div style={{ color: '#c8d4dd' }}>{t.flow}：{vizName}</div>
        {viz === 'rake' && (<>
          <div style={{ color: '#9fb2bf' }}>{t.rakeIs}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0 3px' }}>
            <span style={{ display: 'inline-block', width: 34, height: 7, borderRadius: 4, background: 'linear-gradient(90deg,#ffffff,#c6cdd3)', boxShadow: '0 0 6px rgba(255,255,255,.55)' }} />
            <span style={{ color: '#9fb2bf', fontSize: 10 }}>{t.rakeWhite}</span>
          </div>
          <div style={{ color: '#9fb2bf', fontSize: 10 }}>{t.rakeSolid}</div>
        </>)}
        {viz === 'smoke' && smokeColor === 'speed' && (<>
          <div style={{ color: '#9fb2bf' }}>{t.smokeIs}</div>
          <Bar ramp={TURBO_RAMP} lo="0" hi={`${f1(vMax)} m/s`} loNote={t.slow} hiNote={t.fast} />
        </>)}
        {viz === 'smoke' && smokeColor === 'white' && (
          <div style={{ color: '#9fb2bf', margin: '3px 0 5px' }}>{t.smokeWhite}</div>
        )}
        {viz === 'smoke' && smokeColor === 'age' && (<>
          <div style={{ color: '#9fb2bf' }}>{t.smokeAge}</div>
          <Bar ramp={TURBO_RAMP} lo={t.fresh} hi={t.old} />
        </>)}
        {(viz === 'stream' || viz === 'arrow') && (<>
          <div style={{ color: '#9fb2bf' }}>{viz === 'stream' ? t.lineIsPath : t.arrowIs}</div>
          <Bar ramp={SPEED_RAMP} lo="0" hi={`${f1(vMax)} m/s`} loNote={t.slow} hiNote={t.fast} />
          <div style={{ color: '#9fb2bf', fontSize: 10 }}>{t.mid}（{f1(vMax * 0.55)}–{f1(vMax * 0.8)} m/s）</div>
        </>)}
        {viz === 'stream' && (
          <div style={{ color: '#9fb2bf', marginTop: 3 }}>
            <span style={{ display: 'inline-block', width: 7, height: 7, background: '#eaf6ff', borderRadius: 1, marginRight: 5, verticalAlign: 'middle' }} />
            {t.dots}
          </div>
        )}
        <div style={{ color: '#8fa0ad', fontSize: 10, marginTop: 3 }}>{t.inflow} {res.speed} m/s · {res.fluidName}</div>
        <div style={{ height: 1, background: '#2a3a46', margin: '6px 0' }} />
      </>)}

      <div style={{ color: '#c8d4dd' }}>{t.surf}：{field === 'speed' ? t.sspeed : t.cp}</div>
      {field === 'speed'
        ? <Bar ramp={SPEED_RAMP} lo="0" hi={`${f1(vMax)} m/s`} loNote={t.stag} hiNote={t.accel} />
        : (<>
          <Bar ramp={CP_RAMP} lo={`+${cpA.toFixed(2)}`} hi={`−${cpA.toFixed(2)}`} loNote={t.cpHi} hiNote={t.cpLo} />
          <div style={{ color: '#8fa0ad', fontSize: 10 }}>{t.cpMid}</div>
        </>)}
    </div>
  )
}
