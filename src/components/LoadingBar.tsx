// 全局加载进度条（用户报：import/export / 重建大档案时要畀人知喺度做嘢）。
// 任何长操作（内核重建 busy / 导入导出 / FEA·模流·生成式·热·屈曲 等求解）进行中 →
// 顶部一条蓝色 indeterminate 扫动条 + 中央「处理中…+ 当前状态」药丸。完成即消失。pointerEvents:none 唔挡操作。
import { useApp } from '../store'

export default function LoadingBar() {
  const busy = useApp((s) => s.busy || s.aiBusy || s.feaBusy || s.moldBusy || s.modalBusy || s.bucklingBusy || s.topoptBusy || s.thermalBusy || s.feaConvBusy)
  const status = useApp((s) => s.status)
  // 有进度 % 嘅求解（模流/FEA收敛）顺手显示真实进度，否则 indeterminate
  const moldBusy = useApp((s) => s.moldBusy)
  const moldProg = useApp((s) => s.moldProg)
  const pct = moldBusy && moldProg > 0 ? Math.round(moldProg * 100) : null
  if (!busy) return null
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100000, pointerEvents: 'none' }}>
      <style>{`@keyframes wc-load{0%{left:-42%}100%{left:100%}}@keyframes wc-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ height: 3, background: 'rgba(43,108,240,.16)', overflow: 'hidden', position: 'relative' }}>
        {pct == null
          ? <div style={{ position: 'absolute', top: 0, height: '100%', width: '42%', background: 'linear-gradient(90deg,transparent,#2b6cf0 50%,transparent)', animation: 'wc-load 1.05s ease-in-out infinite' }} />
          : <div style={{ height: '100%', width: pct + '%', background: '#2b6cf0', transition: 'width .2s' }} />}
      </div>
      <div style={{ position: 'fixed', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(31,42,55,.95)', color: '#fff', padding: '6px 15px', borderRadius: 20, fontSize: 12.5, fontFamily: '-apple-system,Segoe UI,sans-serif', boxShadow: '0 4px 16px rgba(0,0,0,.28)', display: 'flex', alignItems: 'center', gap: 9, maxWidth: '78vw' }}>
        <span style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,.32)', borderTopColor: '#fff', borderRadius: '50%', animation: 'wc-spin .7s linear infinite', flexShrink: 0, display: 'inline-block' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{status || '处理中…'}{pct != null ? ` ${pct}%` : ''}</span>
      </div>
    </div>
  )
}
